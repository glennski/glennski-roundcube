<?php

/*
 +-----------------------------------------------------------------------+
 | This file is part of the Roundcube Webmail client                     |
 |                                                                       |
 | Licensed under the GNU General Public License version 3 or            |
 | any later version with exceptions for skins & plugins.                |
 | See the README file for a full license statement.                     |
 |                                                                       |
 | PURPOSE:                                                              |
 |   JSON API: contacts, identities and settings.                        |
 +-----------------------------------------------------------------------+
*/

class rcmail_api_data
{
    /** @var array<string, array> setting => [type, allowed values or min/max] */
    protected const SETTINGS = [
        'theme' => ['enum', ['auto', 'light', 'dark']],
        'density' => ['enum', ['comfortable', 'compact']],
        'mail_pagesize' => ['int', [10, 100]],
        'htmleditor' => ['enum', [0, 1, 2]],
        'language' => ['language'],
        'timezone' => ['timezone'],
    ];

    /** settings that are not Roundcube options: stored in the user preferences under this prefix */
    protected const OWN = ['theme', 'density'];

    protected rcmail $rc;

    public function __construct(protected rcmail_api $api)
    {
        $this->rc = $api->rc;
    }

    // ---- contacts -------------------------------------------------------

    public function contacts(): array
    {
        $book = $this->book();
        $q = trim((string) $this->api->string('q', ''));
        $page = max(1, $this->api->int('page', 1));

        $book->set_page($page);
        $book->set_pagesize(50);

        $result = $q === '' ? $book->list_records(null, 0, false) : $book->search(['name', 'firstname', 'surname', 'email', 'organization'], $q, 0, true, false);

        $rows = [];
        while ($result && ($row = $result->iterate())) {
            $rows[] = $this->contact_json($row);
        }

        usort($rows, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return ['contacts' => $rows, 'total' => (int) $result->count, 'page' => $page];
    }

    /**
     * Autocomplete for recipient fields: all address books, collected recipients included.
     */
    public function contacts_suggest(): array
    {
        $q = trim((string) $this->api->string('q', ''));
        $out = [];

        if (mb_strlen($q) < 2) {
            return ['suggestions' => []];
        }

        foreach ($this->rc->get_address_sources() as $source) {
            $book = $this->rc->get_address_book($source['id']);
            $book->set_page(1);
            $book->set_pagesize(8);

            if (!($result = $book->search(['email', 'name'], $q, 0, true, true, ['email']))) {
                continue;
            }

            while ($row = $result->iterate()) {
                foreach (rcube_addressbook::get_col_values('email', $row, true) as $email) {
                    $out[strtolower($email)] ??= ['name' => (string) ($row['name'] ?? ''), 'email' => $email];
                }
            }
        }

        return ['suggestions' => array_slice(array_values($out), 0, 10)];
    }

    public function contact_save(): array
    {
        $book = $this->book(true);
        $id = $this->api->string('id');
        $email = trim((string) $this->api->string('email', ''));
        $name = trim((string) $this->api->string('name', ''));

        if ($email !== '' && !rcube_utils::check_email(rcube_utils::idn_to_ascii($email))) {
            throw new rcmail_api_exception(400, 'invalid_email', 'Invalid email address');
        }
        if ($name === '' && $email === '') {
            throw new rcmail_api_exception(400, 'missing_parameter', 'A name or an email address is required');
        }

        $data = array_filter([
            'name' => $name ?: $email,
            'email:home' => $email,
            'phone:home' => trim((string) $this->api->string('phone', '')),
            'organization' => trim((string) $this->api->string('organization', '')),
            'notes' => (string) $this->api->string('notes', ''),
        ], static fn ($v) => $v !== '');

        if ($id) {
            if (!$book->get_record($id, true)) {
                throw new rcmail_api_exception(404, 'contact_not_found', 'Unknown contact');
            }
            $ok = $book->update($id, $data);
            $new = $ok ? $id : null;
        } else {
            $new = $book->insert($data, false);
        }

        if (!$new) {
            throw new rcmail_api_exception(502, 'contact_error', 'The contact could not be saved');
        }

        return $this->contact_json($book->get_record($new, true));
    }

    public function contact_delete(): array
    {
        $book = $this->book(true);

        if (!$book->delete([$this->api->string('id', null, true)])) {
            throw new rcmail_api_exception(404, 'contact_not_found', 'Unknown contact');
        }

        return ['ok' => true];
    }

    protected function book(bool $writeable = false): rcube_addressbook
    {
        $book = $this->rc->get_address_book(0, $writeable);

        if (!$book) {
            throw new rcmail_api_exception(409, 'no_addressbook', 'No address book is available');
        }

        return $book;
    }

    protected function contact_json(array $row): array
    {
        $first = static fn (string $col) => rcube_addressbook::get_col_values($col, $row, true)[0] ?? '';

        return [
            'id' => (string) $row['ID'],
            'name' => (string) ($row['name'] ?? '') ?: trim(($row['firstname'] ?? '') . ' ' . ($row['surname'] ?? '')),
            'email' => $first('email'),
            'phone' => $first('phone'),
            'organization' => (string) ($row['organization'] ?? ''),
            'notes' => (string) ($row['notes'] ?? ''),
        ];
    }

    // ---- identities -----------------------------------------------------

    public function identities(): array
    {
        return ['identities' => self::identity_list($this->rc), 'level' => (int) $this->rc->config->get('identities_level', 0)];
    }

    public static function identity_list(rcmail $rc): array
    {
        $out = [];

        foreach ($rc->user->list_identities(null, true) as $i) {
            $out[] = [
                'id' => (int) $i['identity_id'],
                'name' => (string) $i['name'],
                'email' => (string) $i['email'],
                'organization' => (string) ($i['organization'] ?? ''),
                'reply_to' => (string) ($i['reply-to'] ?? ''),
                'bcc' => (string) ($i['bcc'] ?? ''),
                'signature' => (string) ($i['signature'] ?? ''),
                'html_signature' => !empty($i['html_signature']),
                'standard' => !empty($i['standard']),
            ];
        }

        return $out;
    }

    public function identity_save(): array
    {
        $level = (int) $this->rc->config->get('identities_level', 0);
        $id = $this->api->int('id');
        $email = trim((string) $this->api->string('email', ''));

        if ($level >= 3 || ($level === 2 && !$id)) {
            throw new rcmail_api_exception(403, 'not_allowed', 'Identities cannot be changed on this server');
        }
        if (!rcube_utils::check_email(rcube_utils::idn_to_ascii($email))) {
            throw new rcmail_api_exception(400, 'invalid_email', 'Invalid email address');
        }

        $data = [
            'name' => trim((string) $this->api->string('name', '')),
            'email' => $email,
            'organization' => trim((string) $this->api->string('organization', '')),
            'reply-to' => trim((string) $this->api->string('reply_to', '')),
            'bcc' => trim((string) $this->api->string('bcc', '')),
            'signature' => (string) $this->api->input('signature', ''),
            'html_signature' => $this->api->input('html_signature') ? 1 : 0,
        ];

        if ($data['html_signature']) {
            $data['signature'] = (new rcube_washtml(['allow_remote' => false, 'html_elements' => ['body'], 'show_washed' => false]))
                ->wash('<html><body>' . $data['signature'] . '</body></html>');
        }

        if ($id) {
            if ($level === 1) {
                unset($data['email']);
            }
            if (!$this->rc->user->get_identity($id) || !$this->rc->user->update_identity($id, $data)) {
                throw new rcmail_api_exception(404, 'identity_not_found', 'The identity could not be saved');
            }
        } elseif (!($id = $this->rc->user->insert_identity($data))) {
            throw new rcmail_api_exception(502, 'identity_error', 'The identity could not be created');
        }

        if ($this->api->input('standard')) {
            $this->rc->user->set_default((int) $id);
        }

        return ['identities' => self::identity_list($this->rc)];
    }

    public function identity_delete(): array
    {
        $id = $this->api->int('id');

        if ((int) $this->rc->config->get('identities_level', 0) >= 2 || !$this->rc->user->delete_identity($id)) {
            throw new rcmail_api_exception(409, 'identity_error', 'The identity could not be deleted');
        }

        return ['identities' => self::identity_list($this->rc)];
    }

    // ---- settings -------------------------------------------------------

    public function settings(): array
    {
        return [
            'settings' => self::settings_values($this->rc),
            'languages' => $this->rc->list_languages(),
            'timezones' => timezone_identifiers_list(),
        ];
    }

    public function settings_save(): array
    {
        $prefs = [];

        foreach (self::SETTINGS as $key => $rule) {
            if (!array_key_exists($key, $this->api->body)) {
                continue;
            }

            $value = $this->api->body[$key];
            $valid = match ($rule[0]) {
                'enum' => in_array($value, $rule[1], true) || in_array((string) $value, array_map('strval', $rule[1]), true),
                'int' => is_numeric($value) && (int) $value >= $rule[1][0] && (int) $value <= $rule[1][1],
                'language' => is_string($value) && isset($this->rc->list_languages()[$value]),
                'timezone' => $value === 'auto' || (is_string($value) && in_array($value, timezone_identifiers_list(), true)),
            };

            if (!$valid) {
                throw new rcmail_api_exception(400, 'invalid_parameter', "Invalid value for {$key}");
            }

            $prefs[in_array($key, self::OWN, true) ? "glennski_{$key}" : $key] = $rule[0] === 'int' || $key === 'htmleditor' ? (int) $value : $value;
        }

        if ($prefs && !$this->rc->user->save_prefs($prefs)) {
            throw new rcmail_api_exception(502, 'settings_error', 'The settings could not be saved');
        }

        return ['settings' => self::settings_values($this->rc)];
    }

    public static function settings_values(rcmail $rc): array
    {
        $prefs = (array) $rc->user->get_prefs();

        return [
            'theme' => $prefs['glennski_theme'] ?? 'auto',
            'density' => $prefs['glennski_density'] ?? 'comfortable',
            'mail_pagesize' => (int) ($prefs['mail_pagesize'] ?? $rc->config->get('mail_pagesize', 50)),
            'htmleditor' => (int) ($prefs['htmleditor'] ?? $rc->config->get('htmleditor', 0)),
            'language' => $prefs['language'] ?? $rc->user->language,
            'timezone' => $prefs['timezone'] ?? 'auto',
        ];
    }
}
