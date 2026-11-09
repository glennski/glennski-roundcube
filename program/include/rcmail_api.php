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
 |   JSON API: routing, authentication, CSRF protection, session.        |
 +-----------------------------------------------------------------------+
*/

class rcmail_api_exception extends \RuntimeException
{
    public function __construct(public int $status, public string $name, string $message = '')
    {
        parent::__construct($message ?: $name);
    }
}

/**
 * Request handling for api.php.
 *
 * Authentication is the normal Roundcube session cookie. State-changing and
 * data requests must carry the request token in the X-Roundcube-Request
 * header (same as Roundcube's own AJAX calls); a custom header cannot be set by
 * a cross-site form, so this is the CSRF protection. Downloads that must work
 * as plain links take the token as `_token` query parameter instead.
 */
class rcmail_api
{
    public rcmail $rc;
    public array $body = [];

    /** @var array<string, array{0: string, 1: string, 2: bool}> "METHOD path" => [class, method, auth required] */
    protected const ROUTES = [
        'GET v1/session' => ['rcmail_api_session', 'show', false],
        'POST v1/auth/login' => ['rcmail_api_session', 'login', false],
        'POST v1/auth/logout' => ['rcmail_api_session', 'logout', true],

        'GET v1/folders' => ['rcmail_api_mail', 'folders', true],
        'POST v1/folders/create' => ['rcmail_api_mail', 'folder_create', true],
        'POST v1/folders/rename' => ['rcmail_api_mail', 'folder_rename', true],
        'POST v1/folders/delete' => ['rcmail_api_mail', 'folder_delete', true],
        'POST v1/folders/empty' => ['rcmail_api_mail', 'folder_empty', true],

        'GET v1/messages' => ['rcmail_api_mail', 'messages', true],
        'GET v1/message' => ['rcmail_api_mail', 'message', true],
        'GET v1/part' => ['rcmail_api_mail', 'part', true],
        'POST v1/messages/actions' => ['rcmail_api_mail', 'actions', true],
        'POST v1/send' => ['rcmail_api_mail', 'send', true],

        'GET v1/contacts' => ['rcmail_api_data', 'contacts', true],
        'GET v1/contacts/suggest' => ['rcmail_api_data', 'contacts_suggest', true],
        'POST v1/contacts/save' => ['rcmail_api_data', 'contact_save', true],
        'POST v1/contacts/delete' => ['rcmail_api_data', 'contact_delete', true],

        'GET v1/identities' => ['rcmail_api_data', 'identities', true],
        'POST v1/identities/save' => ['rcmail_api_data', 'identity_save', true],
        'POST v1/identities/delete' => ['rcmail_api_data', 'identity_delete', true],

        'GET v1/settings' => ['rcmail_api_data', 'settings', true],
        'POST v1/settings' => ['rcmail_api_data', 'settings_save', true],

        'GET v1/accounts' => ['rcmail_api_accounts', 'index', true],
        'POST v1/accounts/add' => ['rcmail_api_accounts', 'add', true],
        'POST v1/accounts/detect' => ['rcmail_api_accounts', 'detect', true],
        'POST v1/accounts/remove' => ['rcmail_api_accounts', 'remove', true],
        'POST v1/accounts/default' => ['rcmail_api_accounts', 'make_default', true],
        'POST v1/accounts/switch' => ['rcmail_api_accounts', 'switch', true],
        'POST v1/accounts/password' => ['rcmail_api_accounts', 'password', true],
    ];

    public function __construct(rcmail $rc)
    {
        $this->rc = $rc;
    }

    public static function run(rcmail $rc): void
    {
        $api = new self($rc);

        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        try {
            $api->dispatch();
        } catch (rcmail_api_exception $e) {
            $api->fail($e->status, $e->name, $e->getMessage());
        } catch (\Throwable $e) {
            rcube::raise_error($e, true, false);
            $api->fail(500, 'internal_error', 'Internal error');
        }
    }

    protected function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = trim($_SERVER['PATH_INFO'] ?? ($_GET['r'] ?? ''), '/');
        $route = self::ROUTES["{$method} {$path}"] ?? null;

        if (!$route) {
            throw new rcmail_api_exception(404, 'not_found', 'Unknown route');
        }

        [$class, $action, $auth] = $route;

        // GETs are checked in require_login(); the session route is how a client obtains a (new) token
        if ($method !== 'GET') {
            $this->check_token();
        }

        if ($method !== 'GET' && !empty($_SERVER['CONTENT_TYPE']) && stripos($_SERVER['CONTENT_TYPE'], 'application/json') === 0) {
            $this->body = json_decode((string) file_get_contents('php://input'), true);

            if (!is_array($this->body)) {
                throw new rcmail_api_exception(400, 'invalid_json', 'The request body is not valid JSON');
            }
        } elseif ($method !== 'GET' && isset($_POST['payload'])) {
            // multipart (uploads): the JSON lives in the "payload" field
            $this->body = (array) json_decode((string) $_POST['payload'], true);
        }

        if ($auth) {
            $this->require_login();
        }

        $result = (new $class($this))->{$action}();

        // handlers that stream their own response return null
        if ($result !== null) {
            echo json_encode($result, \JSON_UNESCAPED_SLASHES | \JSON_UNESCAPED_UNICODE | \JSON_INVALID_UTF8_SUBSTITUTE | \JSON_PARTIAL_OUTPUT_ON_ERROR);
        }
    }

    // ---- security -------------------------------------------------------

    protected function header_token(): ?string
    {
        return rcube_utils::request_header('X-Roundcube-Request');
    }

    /**
     * The header is mandatory for everything but plain GETs; GETs may use the
     * `_token` query parameter (downloads/inline images are plain links).
     */
    protected function check_token(): void
    {
        $expected = $this->rc->get_request_token();
        $given = $this->header_token() ?? ($_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['_token'] ?? '') : '');

        if (!is_string($given) || !hash_equals($expected, $given)) {
            throw new rcmail_api_exception(403, 'invalid_token', 'Missing or invalid request token');
        }
    }

    /**
     * GET requests without a header are allowed to read data only with a valid `_token`.
     */
    public function require_token_for_get(): void
    {
        if ($this->header_token() === null) {
            $this->check_token();
        }
    }

    public function require_login(): void
    {
        if (empty($this->rc->user->ID) || empty($_SESSION['user_id'])) {
            throw new rcmail_api_exception(401, 'unauthenticated', 'Please sign in');
        }

        if (!$this->rc->session->check_auth()) {
            $this->rc->kill_session();
            throw new rcmail_api_exception(401, 'session_expired', 'The session has expired');
        }

        // plain GETs of data (not downloads) are still protected by the header requirement below
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
            $this->require_token_for_get();
        }
    }

    /**
     * @return rcube_storage a connected mail storage
     */
    public function storage(): rcube_storage
    {
        if (!$this->rc->storage_connect()) {
            throw new rcmail_api_exception(502, 'storage_error', 'The mail server could not be reached or rejected the login');
        }

        return $this->rc->get_storage();
    }

    // ---- input ----------------------------------------------------------

    /**
     * Value from the JSON body, falling back to the query string.
     */
    public function input(string $key, $default = null)
    {
        return $this->body[$key] ?? $_GET[$key] ?? $default;
    }

    public function string(string $key, ?string $default = null, bool $required = false): ?string
    {
        $value = $this->input($key, $default);

        if ($value === null || $value === '') {
            if ($required) {
                throw new rcmail_api_exception(400, 'missing_parameter', "Missing parameter: {$key}");
            }

            return $default;
        }

        if (!is_string($value) && !is_int($value)) {
            throw new rcmail_api_exception(400, 'invalid_parameter', "Invalid parameter: {$key}");
        }

        return (string) $value;
    }

    public function int(string $key, int $default = 0): int
    {
        return (int) $this->input($key, $default);
    }

    public function list(string $key): array
    {
        $value = $this->input($key, []);

        return is_array($value) ? array_values($value) : [$value];
    }

    public function fail(int $status, string $name, string $message): void
    {
        http_response_code($status);
        echo json_encode(['error' => ['code' => $name, 'message' => $message]]);
    }
}
