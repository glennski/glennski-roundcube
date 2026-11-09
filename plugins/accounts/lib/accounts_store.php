<?php

/**
 * Storage for the multi-account mode: app users and the mailboxes they own.
 *
 * App users log in with their own password (stored hashed). Mailbox passwords
 * must be sent to the IMAP server later, so they are stored encrypted with the
 * installation's des_key, like Roundcube does for session passwords.
 */
class accounts_store
{
    /** Valid bcrypt hash of a throwaway string, only used to equalize timing for unknown users */
    private const DUMMY_HASH = '$2y$12$gF.3/lY4VfNV/kDOnWUkueYqvjvC/u9NxZpWQKvvGlGzvYqQQJvKS';

    protected $db;
    protected $rc;

    public function __construct(?rcube_db $db = null, ?rcube $rc = null)
    {
        $this->rc = $rc ?: rcube::get_instance();
        $this->db = $db ?: $this->rc->get_dbh();
    }

    /**
     * Create the tables (idempotent).
     */
    public function install(): void
    {
        $users = $this->db->table_name('glennski_users', true);
        $boxes = $this->db->table_name('glennski_mailboxes', true);

        // [auto-increment primary key, short text, timestamp default]
        [$pk, $str, $ts] = [
            'mysql' => ['INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', 'VARCHAR(255)', 'TIMESTAMP NULL DEFAULT NULL'],
            'postgres' => ['SERIAL PRIMARY KEY', 'VARCHAR(255)', 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'],
            'sqlite' => ['INTEGER PRIMARY KEY AUTOINCREMENT', 'TEXT', 'TEXT DEFAULT NULL'],
        ][$this->db->db_provider] ?? throw new \RuntimeException('Unsupported database: ' . $this->db->db_provider);

        $suffix = $this->db->db_provider === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';

        $this->db->query("CREATE TABLE IF NOT EXISTS {$users} (
            user_id {$pk},
            username {$str} NOT NULL UNIQUE,
            password {$str} NOT NULL,
            created {$ts}
        ){$suffix}");

        $this->db->query("CREATE TABLE IF NOT EXISTS {$boxes} (
            mailbox_id {$pk},
            user_id INTEGER NOT NULL,
            label {$str} NOT NULL DEFAULT '',
            email {$str} NOT NULL,
            imap_host {$str} NOT NULL,
            imap_user {$str} NOT NULL,
            imap_pass TEXT NOT NULL,
            smtp_host {$str} NOT NULL DEFAULT '',
            is_default SMALLINT NOT NULL DEFAULT 0,
            last_used {$ts}
        ){$suffix}");
    }

    public function user_create(string $username, string $password): int
    {
        $username = $this->normalize($username);

        if ($username === '' || strlen($password) < 8) {
            throw new \InvalidArgumentException('A user name and a password of at least 8 characters are required');
        }
        if ($this->user_id($username)) {
            throw new \InvalidArgumentException('This user name is already taken');
        }

        $this->db->query(
            'INSERT INTO ' . $this->db->table_name('glennski_users', true) . ' (username, password, created) VALUES (?, ?, ' . $this->db->now() . ')',
            $username,
            password_hash($password, \PASSWORD_DEFAULT)
        );

        return (int) $this->db->insert_id('glennski_users');
    }

    /**
     * @return array|null ['user_id', 'username'] if the credentials are valid
     */
    public function user_verify(string $username, string $password): ?array
    {
        $row = $this->fetch('SELECT * FROM ' . $this->db->table_name('glennski_users', true) . ' WHERE username = ?', $this->normalize($username));

        // always run a hash check, so unknown users cost the same time as wrong passwords
        $hash = $row['password'] ?? self::DUMMY_HASH;
        $ok = password_verify($password, $hash);

        if (!$row || !$ok) {
            return null;
        }
        if (password_needs_rehash($hash, \PASSWORD_DEFAULT)) {
            $this->user_set_password((int) $row['user_id'], $password);
        }

        return ['user_id' => (int) $row['user_id'], 'username' => $row['username']];
    }

    public function user_set_password(int $user_id, string $password): void
    {
        if (strlen($password) < 8) {
            throw new \InvalidArgumentException('The password needs at least 8 characters');
        }

        $this->db->query(
            'UPDATE ' . $this->db->table_name('glennski_users', true) . ' SET password = ? WHERE user_id = ?',
            password_hash($password, \PASSWORD_DEFAULT),
            $user_id
        );
    }

    public function user_id(string $username): ?int
    {
        $row = $this->fetch('SELECT user_id FROM ' . $this->db->table_name('glennski_users', true) . ' WHERE username = ?', $this->normalize($username));

        return $row ? (int) $row['user_id'] : null;
    }

    public function user_count(): int
    {
        return (int) ($this->fetch('SELECT COUNT(*) AS n FROM ' . $this->db->table_name('glennski_users', true))['n'] ?? 0);
    }

    /**
     * Mailboxes of a user, default first. Passwords are not included.
     */
    public function mailboxes(int $user_id): array
    {
        $result = $this->db->query(
            'SELECT mailbox_id, label, email, imap_host, imap_user, smtp_host, is_default FROM ' . $this->db->table_name('glennski_mailboxes', true)
            . ' WHERE user_id = ? ORDER BY is_default DESC, mailbox_id',
            $user_id
        );

        $out = [];
        while ($row = $this->db->fetch_assoc($result)) {
            $out[] = $row;
        }

        return $out;
    }

    /**
     * One mailbox including its decrypted password; only if it belongs to the user.
     */
    public function mailbox(int $mailbox_id, int $user_id): ?array
    {
        $row = $this->fetch(
            'SELECT * FROM ' . $this->db->table_name('glennski_mailboxes', true) . ' WHERE mailbox_id = ? AND user_id = ?',
            $mailbox_id,
            $user_id
        );

        if (!$row) {
            return null;
        }

        $row['imap_pass'] = $this->rc->decrypt($row['imap_pass']);

        return $row['imap_pass'] === false ? null : $row;
    }

    /**
     * @param array $box email, imap_host, imap_user, imap_pass, [smtp_host], [label]
     */
    public function mailbox_add(int $user_id, array $box): int
    {
        $first = !$this->mailboxes($user_id);

        $this->db->query(
            'INSERT INTO ' . $this->db->table_name('glennski_mailboxes', true)
            . ' (user_id, label, email, imap_host, imap_user, imap_pass, smtp_host, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            $user_id,
            (string) ($box['label'] ?? ''),
            $box['email'],
            $box['imap_host'],
            $box['imap_user'] ?: $box['email'],
            $this->rc->encrypt($box['imap_pass']),
            (string) ($box['smtp_host'] ?? ''),
            $first ? 1 : 0
        );

        return (int) $this->db->insert_id('glennski_mailboxes');
    }

    /**
     * Remove a mailbox. The last one cannot be removed (the user could not log in anymore).
     */
    public function mailbox_delete(int $mailbox_id, int $user_id): bool
    {
        $boxes = $this->mailboxes($user_id);

        if (count($boxes) < 2 || !in_array($mailbox_id, array_column($boxes, 'mailbox_id'))) {
            return false;
        }

        $table = $this->db->table_name('glennski_mailboxes', true);
        $this->db->query("DELETE FROM {$table} WHERE mailbox_id = ? AND user_id = ?", $mailbox_id, $user_id);

        // keep exactly one default
        if (!array_filter($this->mailboxes($user_id), static fn ($b) => $b['is_default'])) {
            $this->mailbox_set_default((int) $this->mailboxes($user_id)[0]['mailbox_id'], $user_id);
        }

        return true;
    }

    public function mailbox_set_default(int $mailbox_id, int $user_id): void
    {
        $table = $this->db->table_name('glennski_mailboxes', true);

        $this->db->query("UPDATE {$table} SET is_default = 0 WHERE user_id = ?", $user_id);
        $this->db->query("UPDATE {$table} SET is_default = 1 WHERE mailbox_id = ? AND user_id = ?", $mailbox_id, $user_id);
    }

    public function mailbox_touch(int $mailbox_id): void
    {
        $this->db->query(
            'UPDATE ' . $this->db->table_name('glennski_mailboxes', true) . ' SET last_used = ' . $this->db->now() . ' WHERE mailbox_id = ?',
            $mailbox_id
        );
    }

    /**
     * Try to log in to an IMAP server.
     *
     * @return string|null Error message, null on success
     */
    public static function check_imap(string $host, string $user, string $pass): ?string
    {
        [$h, $scheme, $port] = rcube_utils::parse_host_uri(rcube_utils::parse_host($host) ?: '', 143, 993);

        if (!$h) {
            return 'Invalid server';
        }

        $imap = new rcube_imap();
        $ok = $imap->connect(rcube_utils::idn_to_ascii($h), $user, $pass, $port, in_array($scheme, ['ssl', 'imaps', 'tls']) ? $scheme : false);
        $ok && $imap->close();

        return $ok ? null : ($imap->get_error_str() ?: 'Login failed');
    }

    /**
     * Servers entered by users: keep them from probing internal hosts and from sending
     * passwords in clear text (both can be allowed for trusted setups).
     */
    public static function host_allowed(string $host, bool $allow_private = false, bool $allow_plain = false): bool
    {
        [$h, $scheme] = rcube_utils::parse_host_uri(rcube_utils::parse_host($host) ?: '', 143, 993);
        $plain = !in_array($scheme, ['ssl', 'imaps', 'tls']);

        return $h && (!$plain || $allow_plain)
            && (new rcube_autoconfig(['allow_private' => $allow_private]))->is_allowed_host($h);
    }

    protected function normalize(string $username): string
    {
        return mb_strtolower(trim($username));
    }

    protected function fetch(string $sql, ...$params): ?array
    {
        return $this->db->fetch_assoc($this->db->query($sql, ...$params)) ?: null;
    }
}
