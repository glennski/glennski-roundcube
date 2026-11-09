<?php

/**
 * Accounts - multi-account mode
 *
 * Users log in with an account of this application (not with a mail password)
 * and manage several mailboxes under Settings > Accounts, also from different
 * providers. Switching mailboxes signs in to the other mailbox on the server
 * side; every mailbox keeps its own folders, identities and contacts.
 *
 * @license GNU GPLv3+
 */
class accounts extends rcube_plugin
{
    public $task = '?(?!logout).*';

    protected $rc;
    protected $store;

    /** @var array|null Set by the authenticate hook, consumed by login_after */
    protected $login;

    /** @var array|null Mailbox being switched to (for user_create) */
    protected $switching;

    #[\Override]
    public function init()
    {
        $this->rc = rcmail::get_instance();

        require_once __DIR__ . '/lib/accounts_store.php';

        $this->add_hook('authenticate', [$this, 'authenticate']);
        $this->add_hook('login_after', [$this, 'login_after']);
        $this->add_hook('user_create', [$this, 'user_create']);
        $this->add_hook('smtp_connect', [$this, 'smtp_connect']);

        $this->add_texts('localization/', $this->rc->task == 'settings');

        if ($this->rc->task == 'settings') {
            $this->add_hook('settings_actions', [$this, 'settings_actions']);

            foreach (['', '-add', '-delete', '-default', '-switch', '-detect', '-password'] as $action) {
                $this->register_action('plugin.accounts' . $action, [$this, 'action' . str_replace('-', '_', $action ?: '_index')]);
            }
        }
    }

    // ---- login ----------------------------------------------------------

    /**
     * The login form carries the app account; sign in to its default mailbox.
     */
    public function authenticate($args)
    {
        $app = $this->store()->user_verify((string) $args['user'], (string) $args['pass']);

        if (!$app) {
            $args['abort'] = true;
            $args['error'] = 'loginfailed';

            return $args;
        }

        $boxes = $this->store()->mailboxes($app['user_id']);
        $box = $boxes ? $this->store()->mailbox((int) $boxes[0]['mailbox_id'], $app['user_id']) : null;

        if (!$box) {
            $args['abort'] = true;
            $args['error'] = 'accounts.nomailbox';

            return $args;
        }

        $this->login = ['app' => $app, 'box' => $box];

        return array_merge($args, ['host' => $box['imap_host'], 'user' => $box['imap_user'], 'pass' => $box['imap_pass']]);
    }

    public function login_after($args)
    {
        if ($this->login) {
            $this->remember($this->login['app'], $this->login['box']);
            $this->login = null;
        }

        return $args;
    }

    /**
     * New Roundcube users get the mailbox address instead of the login name.
     */
    public function user_create($args)
    {
        $box = $this->login['box'] ?? $this->switching['box'] ?? null;

        if ($box) {
            $args['user_email'] = $box['email'];
            $args['user_name'] = $box['label'] ?: ($args['user_name'] ?? '');
        }

        return $args;
    }

    public function smtp_connect($args)
    {
        if (!empty($_SESSION['accounts']['smtp'])) {
            $args['smtp_host'] = $_SESSION['accounts']['smtp'];
        }

        return $args;
    }

    // ---- settings -------------------------------------------------------

    public function settings_actions($args)
    {
        $args['actions'][] = [
            'action' => 'plugin.accounts',
            'class' => 'accounts',
            'label' => 'accounts',
            'title' => 'title',
            'domain' => 'accounts',
        ];

        return $args;
    }

    public function action_index()
    {
        $this->register_handler('plugin.body', [$this, 'page']);
        $this->rc->output->set_pagetitle($this->gettext('title'));
        $this->rc->output->send('plugin');
    }

    public function action_add()
    {
        $in = static fn ($name) => trim(rcube_utils::get_input_string($name, rcube_utils::INPUT_POST, true));
        $email = $in('_email');
        $box = [
            'email' => $email,
            'imap_host' => $in('_imap_host'),
            'imap_user' => $in('_imap_user') ?: $email,
            'imap_pass' => rcube_utils::get_input_string('_password', rcube_utils::INPUT_POST, true),
            'smtp_host' => $in('_smtp_host'),
            'label' => $in('_label'),
        ];

        if (!$this->rc->check_request()) {
            $error = 'invalidrequest';
        } elseif (!filter_var($email, \FILTER_VALIDATE_EMAIL) || $box['imap_host'] === '' || $box['imap_pass'] === '') {
            $error = 'accounts.missingfields';
        } elseif (!$this->host_allowed($box['imap_host'])) {
            $error = 'accounts.hostnotallowed';
        } elseif ($error_text = \accounts_store::check_imap($box['imap_host'], $box['imap_user'], $box['imap_pass'])) {
            $this->rc->output->show_message($this->gettext('connectfailed') . ': ' . $error_text, 'error');
            $error = true;
        } else {
            $this->store()->mailbox_add($this->app_user(), $box);
            $this->rc->output->show_message('accounts.added', 'confirmation');
        }

        if (!empty($error) && $error !== true) {
            $this->rc->output->show_message($error, 'error');
        }

        $this->action_index();
    }

    public function action_delete()
    {
        $ok = $this->rc->check_request() && $this->store()->mailbox_delete((int) rcube_utils::get_input_string('_id', rcube_utils::INPUT_POST), $this->app_user());
        $this->rc->output->show_message($ok ? 'accounts.removed' : 'accounts.cannotremove', $ok ? 'confirmation' : 'error');
        $this->action_index();
    }

    public function action_default()
    {
        if ($this->rc->check_request()) {
            $this->store()->mailbox_set_default((int) rcube_utils::get_input_string('_id', rcube_utils::INPUT_POST), $this->app_user());
            $this->rc->output->show_message('successfullysaved', 'confirmation');
        }
        $this->action_index();
    }

    /**
     * Server side sign-in to another mailbox of the same app account.
     */
    public function action_switch()
    {
        $app = $this->app_user();
        $box = $this->rc->check_request(rcube_utils::INPUT_GET)
            ? $this->store()->mailbox((int) rcube_utils::get_input_string('_id', rcube_utils::INPUT_GET), $app)
            : null;
        $user = $_SESSION['accounts']['user'] ?? null;

        // check first, so a wrong password does not end the current session
        if ($box && ($error = \accounts_store::check_imap($box['imap_host'], $box['imap_user'], $box['imap_pass']))) {
            $this->rc->output->show_message($this->gettext('connectfailed') . ': ' . $error, 'error');
            $box = null;
        }

        if (!$box) {
            $this->action_index();
            return;
        }

        $this->switching = ['box' => $box];
        $smtp = $box['smtp_host'];
        $app_row = ['user_id' => $app, 'username' => $user];

        $this->rc->kill_session();

        if ($this->rc->login($box['imap_user'], $box['imap_pass'], $box['imap_host'])) {
            $this->rc->session->remove('temp');
            $this->rc->session->regenerate_id(false);
            $this->rc->session->set_auth_cookie();
            $this->remember($app_row, $box);
            $this->rc->log_login();
            $this->rc->output->redirect(['_task' => 'mail'], 0, true);
        }

        // the check above passed, so this is a race; send the user to the login page
        $this->rc->output->redirect(['_task' => 'login'], 0, true);
    }

    /**
     * AJAX: detect the servers for an address.
     */
    public function action_detect()
    {
        $email = trim(rcube_utils::get_input_string('_email', rcube_utils::INPUT_POST));
        $result = null;

        if ($this->rc->check_request() && filter_var($email, \FILTER_VALIDATE_EMAIL)) {
            $result = $this->autoconfig()->lookup($email);
        }

        $this->rc->output->command('plugin.accounts_detected', $result ? [
            'imap_host' => rcube_autoconfig::to_config($result)['imap_host'],
            'smtp_host' => rcube_autoconfig::to_config($result)['smtp_host'],
            'imap_user' => $result['username'] === 'localpart' ? strstr($email, '@', true) : $email,
        ] : null);
        $this->rc->output->send();
    }

    public function action_password()
    {
        $current = rcube_utils::get_input_string('_curpass', rcube_utils::INPUT_POST, true);
        $new = rcube_utils::get_input_string('_newpass', rcube_utils::INPUT_POST, true);
        $name = $_SESSION['accounts']['user'] ?? '';

        try {
            if (!$this->rc->check_request() || !$this->store()->user_verify($name, $current)) {
                throw new \InvalidArgumentException($this->gettext('wrongpassword'));
            }
            $this->store()->user_set_password($this->app_user(), $new);
            $this->rc->output->show_message('successfullysaved', 'confirmation');
        } catch (\InvalidArgumentException $e) {
            $this->rc->output->show_message($e->getMessage(), 'error');
        }

        $this->action_index();
    }

    public function page()
    {
        $user = $this->app_user();
        $current = (int) ($_SESSION['accounts']['box'] ?? 0);
        $token = $this->rc->get_request_token();
        $t = fn ($key) => rcube::Q($this->gettext($key));
        $q = static fn ($s) => rcube::Q((string) $s);

        $button = static fn ($action, $id, $label) => sprintf('<a class="button" href="#" data-action="%s" data-id="%d">%s</a> ', $action, $id, $label);

        $rows = '';
        foreach ($this->store()->mailboxes($user) as $box) {
            $id = (int) $box['mailbox_id'];

            $rows .= '<tr><td><strong>' . $q($box['label'] ?: $box['email']) . '</strong>'
                . ($id === $current ? ' <span class="badge badge-success">' . $t('current') . '</span>' : '')
                . ($box['is_default'] ? ' <span class="badge badge-info">' . $t('default') . '</span>' : '')
                . '<br><span class="hint">' . $q($box['email'] . ' · ' . $box['imap_host']) . '</span></td>'
                . '<td class="actions" style="text-align:right;white-space:nowrap">'
                . ($id === $current ? '' : $button('switch', $id, $t('open')))
                . ($box['is_default'] ? '' : $button('default', $id, $t('makedefault')))
                . $button('delete', $id, $t('remove')) . '</td></tr>';
        }

        $field = static function ($name, $label, $attrs = []) use ($q) {
            $input = new html_inputfield(['name' => '_' . $name, 'id' => 'acc' . $name, 'class' => 'form-control', 'autocomplete' => 'off'] + $attrs);

            return '<tr><td class="title"><label for="acc' . $name . '">' . $q($label) . '</label></td><td>' . $input->show() . '</td></tr>';
        };

        $form = static fn ($id, $action, $inner, $submit) => '<form id="' . $id . '" method="post" action="./?_task=settings&amp;_action=plugin.accounts-' . $action . '">'
            . '<input type="hidden" name="_token" value="' . rcube::Q($token) . '">' . $inner
            . '<p class="formbuttons"><button type="submit" class="button mainaction">' . $submit . '</button></p></form>';

        $add = '<table class="propform">'
            . $field('email', $this->gettext('email'), ['type' => 'email'])
            . $field('password', $this->gettext('mailpassword'), ['type' => 'password'])
            . '<tr><td></td><td><a class="button" href="#" id="accounts-detect">' . $t('detect') . '</a><span id="accounts-detect-result" class="hint" style="margin-left:.75em"></span></td></tr>'
            . $field('imap_host', $this->gettext('imaphost'), ['placeholder' => 'ssl://imap.example.com:993'])
            . $field('smtp_host', $this->gettext('smtphost'), ['placeholder' => 'tls://smtp.example.com:587'])
            . $field('imap_user', $this->gettext('imapuser'), ['placeholder' => $this->gettext('imapuserhint')])
            . $field('label', $this->gettext('label'))
            . '</table>';

        $presets = '<p class="hint" id="accounts-presets">' . $t('quickadd') . ': '
            . '<a href="#" data-preset="ssl://imap.gmail.com:993|tls://smtp.gmail.com:587">Google</a> · '
            . '<a href="#" data-preset="ssl://outlook.office365.com:993|tls://smtp.office365.com:587">Microsoft</a> · '
            . '<a href="#" data-preset="ssl://imap.mail.me.com:993|tls://smtp.mail.me.com:587">iCloud</a><br>' . $t('presethint') . '</p>';

        $password = '<table class="propform">'
            . $field('curpass', $this->gettext('currentpassword'), ['type' => 'password'])
            . $field('newpass', $this->gettext('newpassword'), ['type' => 'password'])
            . '</table>';

        $this->include_script('accounts.js');
        $this->rc->output->set_env('accounts_token', $token);
        $this->rc->output->set_env('accounts_confirm', $this->gettext('confirmremove'));

        return '<div class="formcontent" id="accounts">'
            . '<fieldset><legend>' . $t('mailboxes') . '</legend><table class="propform" id="accounts-list" style="width:100%">' . $rows . '</table></fieldset>'
            . '<fieldset><legend>' . $t('addmailbox') . '</legend>' . $presets . $form('accounts-add', 'add', $add, $t('add')) . '</fieldset>'
            . '<fieldset><legend>' . $t('appaccount') . ': ' . $q($_SESSION['accounts']['user'] ?? '') . '</legend>'
            . $form('accounts-password', 'password', $password, $t('changepassword')) . '</fieldset>'
            . '</div>';
    }

    // ---- helpers --------------------------------------------------------

    protected function remember(array $app, array $box): void
    {
        $_SESSION['accounts'] = [
            'user' => $app['username'],
            'id' => $app['user_id'],
            'box' => (int) $box['mailbox_id'],
            'smtp' => $box['smtp_host'],
        ];
        $this->store()->mailbox_touch((int) $box['mailbox_id']);
    }

    protected function app_user(): int
    {
        return (int) ($_SESSION['accounts']['id'] ?? 0);
    }

    protected function store(): \accounts_store
    {
        return $this->store ??= new \accounts_store();
    }

    protected function autoconfig(): rcube_autoconfig
    {
        return new rcube_autoconfig([
            'allow_private' => $this->rc->config->get('autoconfig_allow_private', false),
            'allow_plain' => $this->rc->config->get('autoconfig_allow_plain', false),
        ]);
    }

    protected function host_allowed(string $host): bool
    {
        return \accounts_store::host_allowed(
            $host,
            (bool) $this->rc->config->get('autoconfig_allow_private', false),
            (bool) $this->rc->config->get('autoconfig_allow_plain', false)
        );
    }
}
