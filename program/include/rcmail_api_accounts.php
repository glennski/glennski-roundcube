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
 |   JSON API: mailboxes of an account (multi-account mode).             |
 |   Thin layer over the 'accounts' plugin, which owns the rules.        |
 +-----------------------------------------------------------------------+
*/

class rcmail_api_accounts
{
    public function __construct(protected rcmail_api $api) {}

    protected function plugin(): rcube_plugin
    {
        $plugin = $this->api->rc->plugins->get_plugin('accounts');

        if (!$plugin || !method_exists($plugin, 'api_state')) {
            throw new rcmail_api_exception(404, 'not_available', 'This installation does not use accounts with several mailboxes');
        }

        return $plugin;
    }

    public function index(): array
    {
        return $this->plugin()->api_state();
    }

    public function detect(): array
    {
        return ['servers' => $this->plugin()->api_detect($this->api->string('email', null, true))];
    }

    public function add(): array
    {
        $plugin = $this->plugin();
        $error = $plugin->api_add([
            'email' => trim((string) $this->api->string('email', '')),
            'imap_host' => trim((string) $this->api->string('imap_host', '')),
            'imap_user' => trim((string) $this->api->string('imap_user', '')),
            'imap_pass' => (string) $this->api->input('password', ''),
            'smtp_host' => trim((string) $this->api->string('smtp_host', '')),
            'label' => trim((string) $this->api->string('label', '')),
        ]);

        if ($error) {
            throw new rcmail_api_exception(400, 'mailbox_rejected', $error);
        }

        return $plugin->api_state();
    }

    public function remove(): array
    {
        $plugin = $this->plugin();

        if (!$plugin->api_remove($this->api->int('id'))) {
            throw new rcmail_api_exception(409, 'cannot_remove', 'The last mailbox cannot be removed');
        }

        return $plugin->api_state();
    }

    public function make_default(): array
    {
        $plugin = $this->plugin();
        $plugin->api_default($this->api->int('id'));

        return $plugin->api_state();
    }

    /**
     * Sign in to another mailbox. The session (and with it the request token) is replaced.
     */
    public function switch(): array
    {
        if ($error = $this->plugin()->api_switch($this->api->int('id'))) {
            throw new rcmail_api_exception(400, 'switch_failed', $error);
        }

        return (new rcmail_api_session($this->api))->info();
    }

    public function tokens(): array
    {
        return ['tokens' => $this->plugin()->api_tokens()];
    }

    /**
     * The plain token is part of this one response and cannot be shown again.
     */
    public function token_create(): array
    {
        $created = $this->plugin()->api_token_create((string) $this->api->string('name', 'MCP'));

        // not called "token": that key carries the request token (CSRF) in every other response
        return ['access_token' => $created['token'], 'tokens' => $this->plugin()->api_tokens()];
    }

    public function token_revoke(): array
    {
        $this->plugin()->api_token_revoke($this->api->int('id'));

        return ['tokens' => $this->plugin()->api_tokens()];
    }

    public function password(): array
    {
        if ($error = $this->plugin()->api_password((string) $this->api->input('current', ''), (string) $this->api->input('new', ''))) {
            throw new rcmail_api_exception(400, 'password_rejected', $error);
        }

        return ['ok' => true];
    }
}
