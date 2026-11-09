<?php

namespace Roundcube\Tests\Framework;

use PHPUnit\Framework\TestCase;

/**
 * rcube_autoconfig with network and DNS replaced by in-memory fixtures
 */
class AutoconfigStub extends \rcube_autoconfig
{
    public $records = [];
    public $web = [];

    protected function dns(string $name, int $type): array
    {
        // every host is public unless a test says otherwise
        $default = $type === \DNS_A ? [['ip' => '93.184.216.34']] : [];

        return $this->records[$name][$type] ?? $default;
    }

    protected function fetch(string $url, bool $trusted_host = false, ?string $post = null): ?string
    {
        return $this->web[preg_replace('/\?.*/', '', $url)] ?? null;
    }
}

class AutoconfigTest extends TestCase
{
    private const MOZILLA = '<clientConfig><emailProvider id="example.com">'
        . '<incomingServer type="imap"><hostname>imap.%EMAILDOMAIN%</hostname><port>993</port>'
        . '<socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer>'
        . '<outgoingServer type="smtp"><hostname>smtp.example.com</hostname><port>587</port>'
        . '<socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></outgoingServer>'
        . '</emailProvider></clientConfig>';

    public function test_autoconfig_xml_on_provider_domain()
    {
        $a = new AutoconfigStub();
        $a->web['https://autoconfig.example.com/mail/config-v1.1.xml'] = self::MOZILLA;

        $r = $a->lookup('Jane@Example.com');

        $this->assertSame('autoconfig', $r['source']);
        $this->assertSame(['host' => 'imap.example.com', 'port' => 993, 'security' => 'ssl'], $r['imap']);
        $this->assertSame(['host' => 'smtp.example.com', 'port' => 587, 'security' => 'starttls'], $r['smtp']);
        $this->assertSame([
            'imap_host' => 'ssl://imap.example.com:993',
            'smtp_host' => 'tls://smtp.example.com:587',
            'username_domain' => 'example.com',
        ], \rcube_autoconfig::to_config($r));
    }

    public function test_localpart_username_sets_no_username_domain()
    {
        $a = new AutoconfigStub(['sources' => ['ispdb']]);
        $a->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = str_replace('%EMAILADDRESS%', '%EMAILLOCALPART%', self::MOZILLA);

        $config = \rcube_autoconfig::to_config($a->lookup('example.com'));

        $this->assertArrayNotHasKey('username_domain', $config);
    }

    public function test_srv_records_are_sorted_and_prefer_implicit_tls()
    {
        $a = new AutoconfigStub(['sources' => ['srv']]);
        $a->records = [
            '_imaps._tcp.example.com' => [\DNS_SRV => [
                ['target' => 'backup.example.com.', 'port' => 993, 'pri' => 20, 'weight' => 1],
                ['target' => 'imap.example.com.', 'port' => 993, 'pri' => 10, 'weight' => 1],
            ]],
            '_submission._tcp.example.com' => [\DNS_SRV => [
                ['target' => 'smtp.example.com.', 'port' => 587, 'pri' => 0, 'weight' => 1],
            ]],
        ];

        $r = $a->lookup('example.com');

        $this->assertSame('imap.example.com', $r['imap']['host']);
        $this->assertSame('starttls', $r['smtp']['security']);
    }

    public function test_srv_target_dot_means_service_not_available()
    {
        $a = new AutoconfigStub(['sources' => ['srv']]);
        $a->records['_imaps._tcp.example.com'][\DNS_SRV] = [['target' => '.', 'port' => 0, 'pri' => 0, 'weight' => 0]];

        $this->assertNull($a->lookup('example.com'));
    }

    public function test_autodiscover()
    {
        $a = new AutoconfigStub(['sources' => ['autodiscover']]);
        $a->web['https://autodiscover.example.com/autodiscover/autodiscover.xml']
            = '<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006"><Response>'
            . '<Account><Protocol><Type>IMAP</Type><Server>imap.example.com</Server><Port>993</Port><SSL>On</SSL></Protocol>'
            . '<Protocol><Type>SMTP</Type><Server>smtp.example.com</Server><Port>587</Port><Encryption>TLS</Encryption></Protocol>'
            . '</Account></Response></Autodiscover>';

        $r = $a->lookup('jane@example.com');

        $this->assertSame('ssl', $r['imap']['security']);
        $this->assertSame('starttls', $r['smtp']['security']);
    }

    public function test_mx_falls_back_to_provider_of_mx_host()
    {
        $a = new AutoconfigStub(['sources' => ['mx']]);
        $a->records['example.com'][\DNS_MX] = [['target' => 'mx1.mail.provider.net', 'pri' => 10]];
        $a->web['https://autoconfig.thunderbird.net/v1.1/provider.net'] = self::MOZILLA;

        $r = $a->lookup('jane@example.com');

        $this->assertSame('mx', $r['source']);
        $this->assertSame('example.com', $r['domain']);
    }

    public function test_plain_text_servers_are_rejected_unless_allowed()
    {
        $xml = str_replace('<socketType>SSL</socketType>', '<socketType>plain</socketType>', self::MOZILLA);

        $strict = new AutoconfigStub(['sources' => ['ispdb']]);
        $strict->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = $xml;
        $this->assertNull($strict->lookup('example.com'));

        $lax = new AutoconfigStub(['sources' => ['ispdb'], 'allow_plain' => true]);
        $lax->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = $xml;
        $this->assertSame('none', $lax->lookup('example.com')['imap']['security']);
    }

    public function test_hosts_in_private_ranges_are_rejected_unless_allowed()
    {
        foreach (['10.0.0.5', '127.0.0.1', '169.254.169.254', '192.168.1.10'] as $ip) {
            $a = new AutoconfigStub(['sources' => ['ispdb']]);
            $a->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = self::MOZILLA;
            $a->records['imap.example.com'][\DNS_A] = [['ip' => $ip]];

            $this->assertNull($a->lookup('example.com'), $ip);
        }

        $a = new AutoconfigStub(['sources' => ['ispdb'], 'allow_private' => true]);
        $a->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = self::MOZILLA;
        $a->records['imap.example.com'][\DNS_A] = [['ip' => '10.0.0.5']];
        $this->assertNotNull($a->lookup('example.com'));
    }

    public function test_hosts_resolving_to_a_mix_of_public_and_private_are_rejected()
    {
        $a = new AutoconfigStub(['sources' => ['ispdb']]);
        $a->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = self::MOZILLA;
        $a->records['imap.example.com'][\DNS_A] = [['ip' => '93.184.216.34'], ['ip' => '127.0.0.1']];

        $this->assertNull($a->lookup('example.com'));
    }

    public function test_invalid_input_is_rejected()
    {
        $a = new AutoconfigStub();

        foreach (['', 'localhost', 'user@127.0.0.1', 'user@exa mple.com', 'user@-bad.com'] as $input) {
            $this->assertNull($a->lookup($input), $input);
        }
    }

    public function test_malicious_hostname_from_provider_is_rejected()
    {
        $a = new AutoconfigStub(['sources' => ['ispdb']]);
        $a->web['https://autoconfig.thunderbird.net/v1.1/example.com']
            = str_replace('imap.%EMAILDOMAIN%', '127.0.0.1', self::MOZILLA);

        $this->assertNull($a->lookup('example.com'));
    }

    public function test_wizard()
    {
        $a = new AutoconfigStub(['sources' => ['ispdb']]);
        $a->web['https://autoconfig.thunderbird.net/v1.1/example.com'] = self::MOZILLA;

        $this->assertSame(['imap_host' => '', 'plugins' => ['autoconfig']], $a->wizard('auto'));
        $this->assertSame('ssl://imap.example.com:993', $a->wizard('fixed', 'jane@example.com')['imap_host']);

        $this->expectException(\RuntimeException::class);
        $a->wizard('fixed', 'nothing-here.example');
    }
}
