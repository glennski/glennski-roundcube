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
 |   MCP server (Streamable HTTP, stateless, JSON responses). Every tool |
 |   is a handler of the JSON API; the token owner's mailbox is signed   |
 |   in for the duration of the request and the session is dropped after |
 |   it, so nothing is kept between calls.                               |
 +-----------------------------------------------------------------------+
*/

require_once __DIR__ . '/rcmail_api.php';

class rcmail_mcp
{
    protected const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

    /**
     * name => [description, properties, required, [class, method], options]
     * options: readonly (bool), defaults (merged into the arguments), omit (keys removed from the result)
     */
    protected static function tools(): array
    {
        $str = static fn ($d) => ['type' => 'string', 'description' => $d];
        $int = static fn ($d) => ['type' => 'integer', 'description' => $d];
        $uids = ['type' => 'array', 'items' => ['type' => 'integer'], 'description' => 'Message UIDs in that folder'];
        $folder = $str('Folder name as returned by list_folders (e.g. INBOX)');
        $addr = ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Addresses, "Name <a@b.c>" or "a@b.c"'];

        $draftFields = [
            'to' => $addr, 'cc' => $addr, 'bcc' => $addr,
            'subject' => $str('Subject'),
            'text' => $str('Plain text body'),
            'html' => $str('Optional HTML body (sanitized); text is then the alternative part'),
            'identity_id' => $int('Sender identity from list_identities; default identity if omitted'),
            'in_reply_to' => $str('Message-ID of the message this answers'),
            'references' => $str('References header of the thread'),
            'reply_to_message' => ['type' => 'object', 'description' => 'Marks that message as answered: {folder, uid}', 'properties' => ['folder' => ['type' => 'string'], 'uid' => ['type' => 'integer']]],
            'attach' => ['type' => 'array', 'description' => 'Files to attach (up to 10 MB each)', 'items' => ['type' => 'object', 'properties' => ['name' => ['type' => 'string'], 'type' => ['type' => 'string'], 'content_base64' => ['type' => 'string']], 'required' => ['name', 'content_base64']]],
        ];

        $mail = 'rcmail_api_mail';
        $data = 'rcmail_api_data';

        return [
            'list_mailboxes' => ['The mailboxes of this account. Pass an id or address as `mailbox` to any other tool to use a mailbox other than the default.', [], [], ['rcmail_api_accounts', 'index'], ['readonly' => true]],
            'list_folders' => ['Folders with role (inbox, sent, drafts, trash, junk, archive), unread and total counts.', [], [], [$mail, 'folders'], ['readonly' => true]],
            'search_messages' => ['List or search messages of one folder, newest first. Returns summaries; use read_message for the content.', [
                'folder' => $folder, 'q' => $str('Text to find in headers and body'), 'filter' => ['type' => 'string', 'enum' => ['all', 'unseen', 'flagged']],
                'page' => $int('Page, starting at 1'), 'per_page' => $int('10 to 100'),
                'sort' => ['type' => 'string', 'enum' => ['date', 'arrival', 'subject', 'from', 'size']], 'order' => ['type' => 'string', 'enum' => ['ASC', 'DESC']],
            ], [], [$mail, 'messages'], ['readonly' => true]],
            'read_message' => ['Read one message: headers, text body and the list of attachments. Does not mark it as read unless mark_read is true.', [
                'folder' => $folder, 'uid' => $int('Message UID'), 'mark_read' => ['type' => 'boolean'],
            ], ['folder', 'uid'], [$mail, 'message'], ['readonly' => true, 'omit' => ['html', 'seen_before', 'remote_blocked']]],
            'get_attachment' => ['Content of one attachment (part id from read_message). Text comes as text, everything else as base64. Up to 10 MB.', [
                'folder' => $folder, 'uid' => $int('Message UID'), 'part' => $str('Part id from read_message'),
            ], ['folder', 'uid', 'part'], [$mail, 'attachment'], ['readonly' => true]],
            'message_action' => ['Change messages: mark_read, mark_unread, flag, unflag, move or copy (with target), delete (to trash), archive, spam.', [
                'folder' => $folder, 'uids' => $uids,
                'action' => ['type' => 'string', 'enum' => ['mark_read', 'mark_unread', 'flag', 'unflag', 'move', 'copy', 'delete', 'archive', 'spam']],
                'target' => $str('Target folder for move and copy'),
            ], ['folder', 'uids', 'action'], [$mail, 'actions'], []],
            'send_message' => ['Send an email. This cannot be undone: only send what the user asked for.', $draftFields, ['to'], [$mail, 'send'], ['defaults' => ['draft' => false]]],
            'save_draft' => ['Save an email in the drafts folder without sending it.', $draftFields, [], [$mail, 'send'], ['defaults' => ['draft' => true]]],
            'create_folder' => ['Create a folder.', ['name' => $str('Folder name'), 'parent' => $str('Parent folder, optional')], ['name'], [$mail, 'folder_create'], []],
            'rename_folder' => ['Rename a folder.', ['folder' => $folder, 'name' => $str('New name')], ['folder', 'name'], [$mail, 'folder_rename'], []],
            'delete_folder' => ['Delete a folder and its messages.', ['folder' => $folder], ['folder'], [$mail, 'folder_delete'], []],
            'empty_folder' => ['Delete all messages in the trash or spam folder.', ['folder' => $folder], ['folder'], [$mail, 'folder_empty'], []],
            'list_contacts' => ['Search or list the address book.', ['q' => $str('Name, address or organization'), 'page' => $int('Page, starting at 1')], [], [$data, 'contacts'], ['readonly' => true]],
            'save_contact' => ['Create a contact, or update it when id is given.', [
                'id' => $str('Contact id to update'), 'name' => $str('Name'), 'email' => $str('Email address'), 'phone' => $str('Phone'), 'organization' => $str('Organization'), 'notes' => $str('Notes'),
            ], [], [$data, 'contact_save'], []],
            'delete_contact' => ['Delete a contact.', ['id' => $str('Contact id')], ['id'], [$data, 'contact_delete'], []],
            'list_identities' => ['Sender identities (for identity_id when sending).', [], [], [$data, 'identities'], ['readonly' => true]],
        ];
    }

    public static function run(rcmail $rc): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        if ($method !== 'POST') {
            // no server-initiated streams: this server only answers requests
            header('Allow: POST');
            http_response_code(405);

            return;
        }

        $input = json_decode((string) file_get_contents('php://input'), true);

        if (!is_array($input)) {
            self::reply(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'Parse error']], 400);

            return;
        }

        // a token for every request; the answer to a missing one says how to get it
        $app = self::authenticate($rc);

        if (!$app) {
            header('WWW-Authenticate: Bearer realm="mcp"');
            self::reply(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32001, 'message' => 'A valid access token is required (Settings > Integrations)']], 401);

            return;
        }

        $batch = array_is_list($input) && $input;
        $out = [];

        foreach ($batch ? $input : [$input] as $message) {
            if (is_array($message) && ($answer = self::handle($rc, $app, $message)) !== null) {
                $out[] = $answer;
            }
        }

        if (!$out) {
            http_response_code(202); // only notifications

            return;
        }

        self::reply($batch ? $out : $out[0]);
    }

    protected static function authenticate(rcmail $rc): ?array
    {
        $header = rcube_utils::request_header('Authorization') ?? '';

        if (!preg_match('/^Bearer\s+(gl_[0-9a-f]{48})$/i', $header, $m) || !$rc->plugins->get_plugin('accounts')) {
            return null;
        }

        require_once INSTALL_PATH . 'plugins/accounts/lib/accounts_store.php';

        return (new \accounts_store())->token_user($m[1]);
    }

    protected static function handle(rcmail $rc, array $app, array $message): ?array
    {
        $id = $message['id'] ?? null;
        $name = (string) ($message['method'] ?? '');
        $params = is_array($message['params'] ?? null) ? $message['params'] : [];

        // notifications have no id and get no answer
        if (!array_key_exists('id', $message)) {
            return null;
        }

        $result = match ($name) {
            'initialize' => [
                'protocolVersion' => in_array($params['protocolVersion'] ?? '', self::VERSIONS, true) ? $params['protocolVersion'] : self::VERSIONS[0],
                'capabilities' => ['tools' => ['listChanged' => false]],
                'serverInfo' => ['name' => 'glennski-webmail', 'version' => defined('GLENNSKI_VERSION') ? GLENNSKI_VERSION : '0'],
                'instructions' => 'Mail tools for the account owner. Read before you act; sending, deleting and moving messages change the mailbox for real.',
            ],
            'ping' => new \stdClass(),
            'tools/list' => ['tools' => self::tool_list()],
            'tools/call' => self::call($rc, $app, (string) ($params['name'] ?? ''), is_array($params['arguments'] ?? null) ? $params['arguments'] : []),
            default => null,
        };

        if ($result === null) {
            return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => -32601, 'message' => 'Method not found']];
        }

        return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    }

    protected static function tool_list(): array
    {
        $list = [];

        foreach (self::tools() as $name => [$description, $props, $required, , $options]) {
            // every tool can address another mailbox of the account
            $props += ['mailbox' => ['type' => 'string', 'description' => 'Mailbox id or address from list_mailboxes; default mailbox if omitted']];

            $list[] = [
                'name' => $name,
                'description' => $description,
                'inputSchema' => ['type' => 'object', 'properties' => $props ?: new \stdClass(), 'required' => $required],
                'annotations' => ['readOnlyHint' => !empty($options['readonly']), 'destructiveHint' => empty($options['readonly']), 'openWorldHint' => $name === 'send_message'],
            ];
        }

        return $list;
    }

    /**
     * A failing tool is a result with isError (the model can read and react to it), not a protocol error.
     */
    protected static function call(rcmail $rc, array $app, string $tool, array $args): array
    {
        $def = self::tools()[$tool] ?? null;

        try {
            if (!$def) {
                throw new rcmail_api_exception(400, 'unknown_tool', "Unknown tool: {$tool}");
            }

            $plugin = $rc->plugins->get_plugin('accounts');

            if ($error = $plugin->api_token_login($app, isset($args['mailbox']) ? (string) $args['mailbox'] : null)) {
                throw new rcmail_api_exception(404, 'mailbox_unavailable', $error);
            }

            [, , $required, [$class, $method], $options] = $def;
            unset($args['mailbox']);

            foreach ($required as $key) {
                if (!isset($args[$key])) {
                    throw new rcmail_api_exception(400, 'missing_parameter', "Missing parameter: {$key}");
                }
            }

            // keep the API's own names: reading marks as read unless asked not to
            if ($tool === 'read_message') {
                $args['peek'] = empty($args['mark_read']) ? 1 : 0;
                unset($args['mark_read']);
            }

            $api = new rcmail_api($rc);
            $api->body = ($options['defaults'] ?? []) + $args;
            $result = (new $class($api))->{$method}();

            foreach ($options['omit'] ?? [] as $key) {
                unset($result[$key]);
            }

            return ['content' => [['type' => 'text', 'text' => self::json($result)]]];
        } catch (rcmail_api_exception $e) {
            return ['isError' => true, 'content' => [['type' => 'text', 'text' => "{$e->name}: {$e->getMessage()}"]]];
        } catch (\Throwable $e) {
            rcube::raise_error($e, true, false);

            return ['isError' => true, 'content' => [['type' => 'text', 'text' => 'internal_error: The request failed']]];
        } finally {
            // no session survives the request
            $rc->kill_session();
        }
    }

    protected static function json($data): string
    {
        return json_encode($data, \JSON_UNESCAPED_SLASHES | \JSON_UNESCAPED_UNICODE | \JSON_INVALID_UTF8_SUBSTITUTE | \JSON_PARTIAL_OUTPUT_ON_ERROR);
    }

    protected static function reply(array $payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo self::json($payload);
    }
}
