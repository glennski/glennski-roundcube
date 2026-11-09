<?php

/**
 * Autoconfig
 *
 * Detects IMAP/SMTP servers from the email address entered at login
 * (Mozilla autoconfig, Autodiscover, SRV records, ISP database, MX lookup).
 * Only active when no fixed imap_host is configured, or the user typed
 * a domain that is not covered by it.
 *
 * @license GNU GPLv3+
 */
class autoconfig extends rcube_plugin
{
    public $task = 'login|mail|settings';

    protected $smtp_host;

    public function init()
    {
        $this->load_config();

        // sensible defaults, can be overridden in config.inc.php
        $config = rcmail::get_instance()->config;
        $config->set('autoconfig_cache', $config->get('autoconfig_cache', 'db'));
        $config->set('autoconfig_cache_ttl', $config->get('autoconfig_cache_ttl', '1d'));

        $this->add_hook('authenticate', [$this, 'authenticate']);
        $this->add_hook('login_after', [$this, 'login_after']);
        $this->add_hook('smtp_connect', [$this, 'smtp_connect']);
    }

    /**
     * Resolve the IMAP host from the user name, remember SMTP for later.
     */
    public function authenticate($args)
    {
        // a fixed host (or the user's own host input) always wins
        if (!empty($args['host']) || !str_contains($args['user'] ?? '', '@')) {
            return $args;
        }

        $result = $this->discover($args['user']);

        if ($result) {
            $config = rcube_autoconfig::to_config($result);
            $args['host'] = $config['imap_host'];
            $this->smtp_host = $config['smtp_host'];

            // some providers want the bare local part as IMAP/SMTP user name
            if ($result['username'] === 'localpart') {
                $args['user'] = strstr($args['user'], '@', true);
            }
        }

        return $args;
    }

    /**
     * The session is replaced on login; store the SMTP host in the new one.
     */
    public function login_after($args)
    {
        if ($this->smtp_host) {
            $_SESSION['autoconfig_smtp'] = $this->smtp_host;
        }

        return $args;
    }

    public function smtp_connect($args)
    {
        if (!empty($_SESSION['autoconfig_smtp']) && !rcmail::get_instance()->config->get('autoconfig_keep_smtp_host')) {
            $args['smtp_host'] = $_SESSION['autoconfig_smtp'];
        }

        return $args;
    }

    protected function discover($user)
    {
        $rcmail = rcmail::get_instance();
        $domain = strtolower(substr(strrchr($user, '@'), 1));
        $cache = $rcmail->get_cache_shared('autoconfig');

        if ($cache && ($hit = $cache->get($domain)) !== null) {
            return $hit ?: null;
        }

        $result = (new rcube_autoconfig([
            'sources' => $rcmail->config->get('autoconfig_sources', rcube_autoconfig::SOURCES),
            'allow_private' => $rcmail->config->get('autoconfig_allow_private', false),
            'allow_plain' => $rcmail->config->get('autoconfig_allow_plain', false),
        ]))->lookup($user);

        // cache failures too (as empty array), so a bad domain can't cause repeated lookups
        $cache && $cache->set($domain, $result ?: []);

        return $result;
    }
}
