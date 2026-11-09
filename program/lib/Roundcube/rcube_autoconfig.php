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
 |   Discover IMAP/SMTP server settings for an email address or domain   |
 +-----------------------------------------------------------------------+
*/

use GuzzleHttp\Client;

/**
 * Mail server auto-configuration.
 *
 * Sources are tried in this order (configurable via the 'sources' option):
 *   autoconfig   Mozilla autoconfig on the mail domain (autoconfig.<domain>, /.well-known/)
 *   autodiscover Microsoft Autodiscover (POX) on the mail domain
 *   srv          RFC 6186 / RFC 8314 SRV records
 *   ispdb        Thunderbird ISP database for the domain
 *   mx           Thunderbird ISP database for the domain of the MX hosts
 *
 * Because the domain is user input and the resulting hosts end up as
 * connection targets, every outgoing request and every discovered host is
 * checked against private/reserved address ranges (see 'allow_private').
 */
class rcube_autoconfig
{
    public const SOURCES = ['autoconfig', 'autodiscover', 'srv', 'ispdb', 'mx'];

    protected const ISPDB_URL = 'https://autoconfig.thunderbird.net/v1.1/';

    protected $options;

    /**
     * @param array $options sources:       list of sources to use (default: all)
     *                       allow_private: allow hosts in private/reserved ranges (default: false)
     *                       allow_plain:   accept servers without TLS (default: false)
     *                       timeout:       network timeout per request in seconds (default: 5)
     */
    public function __construct(array $options = [])
    {
        $this->options = $options + [
            'sources' => self::SOURCES,
            'allow_private' => false,
            'allow_plain' => false,
            'timeout' => 5,
        ];
    }

    /**
     * Discover settings for an email address or a bare domain.
     *
     * @return array|null ['source', 'domain', 'username', 'imap' => [...], 'smtp' => [...]]
     *                    where imap/smtp are ['host', 'port', 'security'] (security: ssl|starttls|none)
     */
    public function lookup(string $input): ?array
    {
        $input = trim($input);
        $domain = strtolower(substr(strrchr('@' . $input, '@'), 1));
        $domain = rcube_utils::idn_to_ascii($domain);
        $email = strpos($input, '@') ? $input : 'user@' . $domain;

        if (!self::is_hostname($domain)) {
            return null;
        }

        foreach ((array) $this->options['sources'] as $source) {
            if (!in_array($source, self::SOURCES, true)) {
                continue;
            }

            $result = $this->{'from_' . $source}($domain, $email);

            if ($result && ($result = $this->finalize($result, $domain, $source))) {
                return $result;
            }
        }

        return null;
    }

    /**
     * Build a config array (as written to config.inc.php) from a lookup result.
     */
    public static function to_config(array $result): array
    {
        $uri = static function ($s) {
            $scheme = ['ssl' => 'ssl://', 'starttls' => 'tls://', 'none' => ''][$s['security']];
            return $scheme . $s['host'] . ':' . $s['port'];
        };

        $config = [
            'imap_host' => $uri($result['imap']),
            'smtp_host' => $uri($result['smtp']),
        ];

        // users may then log in with the local part only
        if ($result['username'] === 'email') {
            $config['username_domain'] = $result['domain'];
        }

        return $config;
    }

    /**
     * Whether a mail server host may be contacted: resolvable and not in a
     * private/reserved range (unless 'allow_private'). For user-supplied hosts.
     */
    public function is_allowed_host(string $host): bool
    {
        $host = rcube_utils::idn_to_ascii(strtolower($host));

        // inside a trusted network single-label names ("dovecot") and addresses are normal
        if ($this->options['allow_private']
            && (filter_var($host, \FILTER_VALIDATE_IP) || preg_match('/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/', $host))
        ) {
            return true;
        }

        return self::is_hostname($host) && $this->resolve_public($host) !== null;
    }

    /**
     * Setup wizard logic shared by the installer, bin/setup.php and Docker.
     *
     * @param string $mode  'fixed' (servers from an address/domain are written to the config)
     *                      or 'auto' (servers are detected at every login by the autoconfig plugin)
     * @param string $input Email address or domain, only for mode 'fixed'
     *
     * @return array Config overrides, 'plugins' lists plugins to enable
     *
     * @throws \RuntimeException If nothing was discovered
     */
    public function wizard(string $mode, string $input = ''): array
    {
        if ($mode === 'auto') {
            return ['imap_host' => '', 'plugins' => ['autoconfig']];
        }

        if ($mode !== 'fixed') {
            throw new \InvalidArgumentException("Unknown mode: {$mode}");
        }

        $result = $this->lookup($input);
        if (!$result) {
            throw new \RuntimeException("No mail server settings found for '{$input}'");
        }

        return self::to_config($result);
    }

    /**
     * Mozilla autoconfig: provider-hosted XML.
     */
    protected function from_autoconfig(string $domain, string $email): ?array
    {
        $query = '?emailaddress=' . rawurlencode($email);

        foreach ([
            "https://autoconfig.{$domain}/mail/config-v1.1.xml",
            "https://{$domain}/.well-known/autoconfig/mail/config-v1.1.xml",
        ] as $url) {
            if (($body = $this->fetch($url . $query)) && ($r = $this->parse_mozilla($body, $domain))) {
                return $r;
            }
        }

        return null;
    }

    /**
     * Thunderbird ISP database.
     */
    protected function from_ispdb(string $domain, string $email): ?array
    {
        $body = $this->fetch(self::ISPDB_URL . $domain, true);

        return $body ? $this->parse_mozilla($body, $domain) : null;
    }

    /**
     * ISP database lookup for the (parent) domains of the MX hosts.
     */
    protected function from_mx(string $domain, string $email): ?array
    {
        $mx = $this->dns($domain, \DNS_MX);
        usort($mx, static fn ($a, $b) => $a['pri'] <=> $b['pri']);

        foreach ($mx as $record) {
            $labels = explode('.', rtrim(strtolower($record['target'] ?? ''), '.'));

            // mx1.mail.provider.com -> mail.provider.com -> provider.com
            while (count($labels) > 2) {
                array_shift($labels);
                $parent = implode('.', $labels);

                if ($parent !== $domain && self::is_hostname($parent)
                    && ($r = $this->from_ispdb($parent, $email))
                ) {
                    return $r;
                }
            }
        }

        return null;
    }

    /**
     * RFC 6186 + RFC 8314 SRV records.
     */
    protected function from_srv(string $domain, string $email): ?array
    {
        $imap = $this->srv_first($domain, [['_imaps', 'ssl'], ['_imap', 'starttls']]);
        $smtp = $this->srv_first($domain, [['_submissions', 'ssl'], ['_submission', 'starttls']]);

        if (!$imap || !$smtp) {
            return null;
        }

        return ['username' => 'email', 'imap' => $imap, 'smtp' => $smtp];
    }

    /**
     * Microsoft Autodiscover (POX). Only IMAP/SMTP entries are used.
     */
    protected function from_autodiscover(string $domain, string $email): ?array
    {
        $request = '<?xml version="1.0" encoding="utf-8"?>'
            . '<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">'
            . '<Request><EMailAddress>' . htmlspecialchars($email, \ENT_XML1) . '</EMailAddress>'
            . '<AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>'
            . '</Request></Autodiscover>';

        foreach ([
            "https://autodiscover.{$domain}/autodiscover/autodiscover.xml",
            "https://{$domain}/autodiscover/autodiscover.xml",
        ] as $url) {
            if (($body = $this->fetch($url, false, $request)) && ($r = $this->parse_autodiscover($body))) {
                return $r;
            }
        }

        return null;
    }

    protected function parse_mozilla(string $xml, string $domain): ?array
    {
        $doc = $this->xml($xml);
        if (!$doc || !isset($doc->emailProvider)) {
            return null;
        }

        $out = ['username' => 'email'];

        foreach (['imap' => 'incomingServer', 'smtp' => 'outgoingServer'] as $key => $node) {
            foreach ($doc->emailProvider->{$node} as $server) {
                if (strtolower((string) $server['type']) !== $key) {
                    continue;
                }

                $security = ['ssl' => 'ssl', 'starttls' => 'starttls', 'plain' => 'none'][strtolower((string) $server->socketType)] ?? null;
                $host = strtolower(str_replace('%EMAILDOMAIN%', $domain, trim((string) $server->hostname)));

                if ($security && $host && ($port = (int) $server->port)) {
                    $out[$key] = ['host' => $host, 'port' => $port, 'security' => $security];

                    if ($key === 'imap' && stripos((string) $server->username, 'LOCALPART') !== false) {
                        $out['username'] = 'localpart';
                    }
                    break;
                }
            }
        }

        return isset($out['imap'], $out['smtp']) ? $out : null;
    }

    protected function parse_autodiscover(string $xml): ?array
    {
        $doc = $this->xml($xml);
        if (!$doc) {
            return null;
        }

        $out = ['username' => 'email'];

        foreach ($doc->xpath("//*[local-name()='Protocol']") ?: [] as $protocol) {
            $type = strtolower((string) ($protocol->Type ?? ''));
            $key = ['imap' => 'imap', 'smtp' => 'smtp'][$type] ?? null;

            if (!$key || isset($out[$key])) {
                continue;
            }

            $encryption = strtolower((string) ($protocol->Encryption ?? ''));
            $ssl = strtolower((string) ($protocol->SSL ?? '')) === 'on';
            $security = $encryption === 'ssl' ? 'ssl' : ($encryption === 'tls' ? 'starttls' : ($ssl ? 'ssl' : 'none'));

            if (($host = strtolower(trim((string) ($protocol->Server ?? '')))) && ($port = (int) ($protocol->Port ?? 0))) {
                $out[$key] = ['host' => $host, 'port' => $port, 'security' => $security];
            }
        }

        return isset($out['imap'], $out['smtp']) ? $out : null;
    }

    /**
     * Validate a provider-supplied result. Returns null if it must not be used.
     */
    protected function finalize(array $r, string $domain, string $source): ?array
    {
        foreach (['imap', 'smtp'] as $key) {
            $s = &$r[$key];

            if (!self::is_hostname($s['host']) || $s['port'] < 1 || $s['port'] > 65535) {
                return null;
            }
            if ($s['security'] === 'none' && !$this->options['allow_plain']) {
                return null;
            }
            if (!$this->resolve_public($s['host'])) {
                return null;
            }
        }

        return $r + ['source' => $source, 'domain' => $domain];
    }

    /**
     * First usable SRV target for a list of [service, security] pairs.
     */
    protected function srv_first(string $domain, array $services): ?array
    {
        foreach ($services as [$service, $security]) {
            $records = array_filter($this->dns("{$service}._tcp.{$domain}", \DNS_SRV), static fn ($r) => ($r['target'] ?? '') !== '' && $r['target'] !== '.');
            usort($records, static fn ($a, $b) => [$a['pri'], -$a['weight']] <=> [$b['pri'], -$b['weight']]);

            if ($records) {
                return ['host' => strtolower(rtrim($records[0]['target'], '.')), 'port' => (int) $records[0]['port'], 'security' => $security];
            }
        }

        return null;
    }

    /**
     * Fetch a URL over HTTPS (never follows redirects, pins the validated IP).
     */
    protected function fetch(string $url, bool $trusted_host = false, ?string $post = null): ?string
    {
        $host = parse_url($url, \PHP_URL_HOST);

        // The ISP database host is ours to trust; everything else is derived from user input.
        $ip = $trusted_host ? null : $this->resolve_public($host);
        if (!$trusted_host && !$ip) {
            return null;
        }

        $curl = $ip ? [\CURLOPT_RESOLVE => ["{$host}:443:{$ip}"]] : [];

        try {
            $client = new Client([
                'timeout' => $this->options['timeout'],
                'connect_timeout' => $this->options['timeout'],
                'allow_redirects' => false,
                'http_errors' => false,
                'curl' => $curl,
                // abort oversized responses while downloading
                'progress' => static function ($total, $now, $up, $uploaded) {
                    if ($now > 65536) {
                        throw new \RuntimeException('response too large');
                    }
                },
                'headers' => ['User-Agent' => 'Roundcube-Autoconfig'],
            ]);

            $response = $post === null
                ? $client->get($url)
                : $client->post($url, ['body' => $post, 'headers' => ['Content-Type' => 'text/xml']]);

            if ($response->getStatusCode() !== 200) {
                return null;
            }

            return (string) $response->getBody();
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function xml(string $data): ?\SimpleXMLElement
    {
        $prev = libxml_use_internal_errors(true);
        $doc = simplexml_load_string($data, \SimpleXMLElement::class, \LIBXML_NONET | \LIBXML_NOCDATA);
        libxml_use_internal_errors($prev);

        return $doc ?: null;
    }

    protected function dns(string $name, int $type): array
    {
        return @dns_get_record($name, $type) ?: [];
    }

    /**
     * Resolve a hostname; returns an IP only if every address is public
     * (unless 'allow_private' is set, then any resolvable host is accepted).
     */
    protected function resolve_public(string $host): ?string
    {
        $ips = array_merge(
            array_column($this->dns($host, \DNS_A), 'ip'),
            array_column($this->dns($host, \DNS_AAAA), 'ipv6')
        );

        foreach ($ips as $ip) {
            if (!$this->options['allow_private']
                && !filter_var($ip, \FILTER_VALIDATE_IP, \FILTER_FLAG_NO_PRIV_RANGE | \FILTER_FLAG_NO_RES_RANGE)
            ) {
                return null;
            }
        }

        return $ips[0] ?? null;
    }

    protected static function is_hostname(string $host): bool
    {
        return strlen($host) <= 253
            && preg_match('/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host) === 1;
    }
}
