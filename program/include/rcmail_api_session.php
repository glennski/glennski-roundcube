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
 |   JSON API: session state, login and logout.                          |
 +-----------------------------------------------------------------------+
*/

class rcmail_api_session
{
    public function __construct(protected rcmail_api $api) {}

    /**
     * Current state. Also the way to obtain the request token before signing in.
     */
    public function show(): array
    {
        $rc = $this->api->rc;

        if (!empty($rc->user->ID) && !empty($_SESSION['user_id'])) {
            if ($rc->session->check_auth()) {
                return $this->info();
            }

            $rc->kill_session();
        }

        return [
            'authenticated' => false,
            'token' => $rc->get_request_token(),
            'product' => $rc->config->get('product_name'),
            'version' => defined('GLENNSKI_VERSION') ? GLENNSKI_VERSION : null,
            'mode' => $this->mode(),
        ];
    }

    public function login(): ?array
    {
        $rc = $this->api->rc;
        $user = trim((string) $this->api->input('username', ''));
        $pass = (string) $this->api->input('password', '');
        $host = (string) $this->api->input('host', '');

        if ($user === '' || $pass === '') {
            throw new rcmail_api_exception(400, 'missing_parameter', 'Username and password are required');
        }

        // rcmail::autoselect_host() reads the POST input
        $_POST['_host'] = $host;
        $_POST['_user'] = $user;

        // the token was verified for this session; start over with a clean one (as index.php does)
        $rc->kill_session();

        $auth = $rc->plugins->exec_hook('authenticate', [
            'host' => $rc->autoselect_host(),
            'user' => $user,
            'pass' => $pass,
            'valid' => true,
            'error' => null,
            'cookiecheck' => true,
        ]);

        if ($auth['valid'] && empty($auth['abort']) && $rc->login($auth['user'], $auth['pass'], $auth['host'], $auth['cookiecheck'])) {
            $rc->session->remove('temp');
            $rc->session->regenerate_id(false);
            $rc->session->set_auth_cookie();
            $rc->log_login();
            $rc->plugins->exec_hook('login_after', ['_task' => 'mail']);

            return $this->info();
        }

        $code = is_numeric($auth['error'] ?? null) ? (int) $auth['error'] : $rc->login_error();
        $label = !empty($auth['error']) && !is_numeric($auth['error']) ? $auth['error'] : 'loginfailed';
        $status = [
            rcmail::ERROR_STORAGE => 502,
            rcmail::ERROR_COOKIES_DISABLED => 400,
            rcmail::ERROR_INVALID_REQUEST => 400,
            rcmail::ERROR_INVALID_HOST => 400,
            rcmail::ERROR_RATE_LIMIT => 429,
        ][$code] ?? 401;

        $rc->log_login($auth['user'], true, $code);
        $rc->plugins->exec_hook('login_failed', ['code' => $code, 'host' => $auth['host'], 'user' => $auth['user']]);

        if (!isset($_SESSION['user_id'])) {
            $rc->kill_session();
        }

        // the session was reset: hand out the new token so the client can try again
        http_response_code($status);
        echo json_encode([
            'error' => ['code' => $label, 'message' => $rc->gettext($label)],
            'token' => $rc->get_request_token(),
        ]);

        return null;
    }

    public function logout(): array
    {
        $rc = $this->api->rc;
        $userdata = ['user' => $_SESSION['username'] ?? '', 'host' => $_SESSION['storage_host'] ?? '', 'lang' => $rc->user->language];

        $rc->logout_actions();
        $rc->kill_session();
        $rc->plugins->exec_hook('logout_after', $userdata);

        return ['authenticated' => false, 'token' => $rc->get_request_token()];
    }

    /**
     * State of a signed-in user.
     */
    public function info(): array
    {
        $rc = $this->api->rc;
        $identities = rcmail_api_data::identity_list($rc);
        $standard = array_values(array_filter($identities, static fn ($i) => $i['standard']))[0] ?? ($identities[0] ?? null);
        $accounts = ($plugin = $rc->plugins->get_plugin('accounts')) && method_exists($plugin, 'api_state') ? $plugin->api_state() : null;

        return [
            'authenticated' => true,
            'token' => $rc->get_request_token(),
            'product' => $rc->config->get('product_name'),
            'version' => defined('GLENNSKI_VERSION') ? GLENNSKI_VERSION : null,
            'mode' => $this->mode(),
            'user' => [
                'username' => $_SESSION['username'] ?? '',
                'email' => $standard['email'] ?? ($_SESSION['username'] ?? ''),
                'name' => $standard['name'] ?? '',
            ],
            'identities' => $identities,
            'accounts' => $accounts,
            'settings' => rcmail_api_data::settings_values($rc),
        ];
    }

    /**
     * single: log in with a mail account, multi: own accounts with several mailboxes
     */
    protected function mode(): string
    {
        return $this->api->rc->plugins->get_plugin('accounts') ? 'multi' : 'single';
    }
}
