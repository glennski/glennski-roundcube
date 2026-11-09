<?php

namespace Roundcube\Tests\Framework;

use PHPUnit\Framework\TestCase;

require_once INSTALL_PATH . 'plugins/accounts/lib/accounts_store.php';

/**
 * Multi-account storage against the test database
 */
class AccountsStoreTest extends TestCase
{
    private static $store;

    public static function setUpBeforeClass(): void
    {
        self::$store = new \accounts_store();
        self::$store->install();
        self::$store->install(); // idempotent
    }

    private function user(): int
    {
        return self::$store->user_create('Tester-' . bin2hex(random_bytes(4)), 'correct horse');
    }

    private function box(string $email = 'a@example.com'): array
    {
        return ['email' => $email, 'imap_host' => 'ssl://imap.example.com:993', 'imap_user' => '', 'imap_pass' => 's3cret', 'smtp_host' => 'tls://smtp.example.com:587'];
    }

    public function test_user_login_is_case_insensitive_and_checks_the_password()
    {
        $id = self::$store->user_create('MixedCase-' . ($n = bin2hex(random_bytes(4))), 'correct horse');

        $this->assertSame($id, self::$store->user_verify("mixedcase-{$n}", 'correct horse')['user_id']);
        $this->assertNull(self::$store->user_verify("mixedcase-{$n}", 'wrong'));
        $this->assertNull(self::$store->user_verify('nobody-' . $n, 'correct horse'));
    }

    public function test_short_password_and_duplicate_names_are_rejected()
    {
        $this->expectException(\InvalidArgumentException::class);
        self::$store->user_create('x-' . bin2hex(random_bytes(4)), 'short');
    }

    public function test_duplicate_user_name()
    {
        self::$store->user_create($name = 'dup-' . bin2hex(random_bytes(4)), 'correct horse');

        $this->expectException(\InvalidArgumentException::class);
        self::$store->user_create(strtoupper($name), 'correct horse');
    }

    public function test_mailbox_password_is_encrypted_at_rest_and_round_trips()
    {
        $uid = $this->user();
        $id = self::$store->mailbox_add($uid, $this->box());

        $raw = \rcube::get_instance()->get_dbh()->fetch_assoc(\rcube::get_instance()->get_dbh()->query(
            'SELECT imap_pass FROM ' . \rcube::get_instance()->get_dbh()->table_name('glennski_mailboxes', true) . ' WHERE mailbox_id = ?', $id));

        $this->assertStringNotContainsString('s3cret', $raw['imap_pass']);
        $this->assertSame('s3cret', self::$store->mailbox($id, $uid)['imap_pass']);
        $this->assertSame('a@example.com', self::$store->mailbox($id, $uid)['imap_user'], 'login name defaults to the address');
    }

    public function test_mailboxes_belong_to_their_user()
    {
        $a = $this->user();
        $b = $this->user();
        $id = self::$store->mailbox_add($a, $this->box());

        $this->assertNull(self::$store->mailbox($id, $b));
        $this->assertFalse(self::$store->mailbox_delete($id, $b));
    }

    public function test_first_mailbox_is_default_and_the_last_one_cannot_be_removed()
    {
        $uid = $this->user();
        $first = self::$store->mailbox_add($uid, $this->box('a@example.com'));
        $second = self::$store->mailbox_add($uid, $this->box('b@example.com'));

        $this->assertSame([$first, $second], array_map('intval', array_column(self::$store->mailboxes($uid), 'mailbox_id')));
        $this->assertSame('1', (string) self::$store->mailboxes($uid)[0]['is_default']);

        self::$store->mailbox_set_default($second, $uid);
        $this->assertSame($second, (int) self::$store->mailboxes($uid)[0]['mailbox_id'], 'default is listed first');

        $this->assertTrue(self::$store->mailbox_delete($second, $uid));
        $this->assertSame('1', (string) self::$store->mailboxes($uid)[0]['is_default'], 'a default is kept after removing the default');
        $this->assertFalse(self::$store->mailbox_delete($first, $uid), 'last mailbox stays');
    }

    public function test_host_rules()
    {
        $this->assertFalse(\accounts_store::host_allowed('imap.example.com:143'), 'plain text');
        $this->assertFalse(\accounts_store::host_allowed('ssl://127.0.0.1:993'), 'not a host name');
        $this->assertFalse(\accounts_store::host_allowed('ssl://localhost:993'), 'not a public name');
    }

    public function test_tokens_are_stored_hashed_and_found_by_their_owner()
    {
        $uid = $this->user();
        $created = self::$store->token_create($uid, 'Claude');

        $this->assertMatchesRegularExpression('/^gl_[0-9a-f]{48}$/', $created['token']);
        $this->assertSame($uid, self::$store->token_user($created['token'])['user_id']);
        $this->assertNull(self::$store->token_user('gl_' . str_repeat('0', 48)));

        // only the hash is in the database
        $db = \rcube::get_instance()->get_dbh();
        $rows = $db->fetch_assoc($db->query('SELECT token_hash FROM ' . $db->table_name('glennski_tokens', true) . ' WHERE token_id = ?', $created['id']));
        $this->assertSame(hash('sha256', $created['token']), $rows['token_hash']);

        $list = self::$store->tokens($uid);
        $this->assertCount(1, $list);
        $this->assertSame('Claude', $list[0]['name']);
        $this->assertArrayNotHasKey('token_hash', $list[0]);
    }

    public function test_a_token_can_only_be_revoked_by_its_owner()
    {
        $owner = $this->user();
        $other = $this->user();
        $created = self::$store->token_create($owner, 'x');

        self::$store->token_revoke($created['id'], $other);
        $this->assertNotNull(self::$store->token_user($created['token']));

        self::$store->token_revoke($created['id'], $owner);
        $this->assertNull(self::$store->token_user($created['token']));
    }
}
