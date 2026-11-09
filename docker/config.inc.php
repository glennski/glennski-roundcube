<?php

// Docker configuration: everything comes from ROUNDCUBE_* environment variables.
// See docker/README.md. Server detection runs once in entrypoint.sh, not per request.

$data = getenv('ROUNDCUBE_DATA') ?: '/var/roundcube';
$env = static fn ($name, $default = null) => ($v = getenv("ROUNDCUBE_{$name}")) !== false && $v !== '' ? $v : $default;
$flag = static fn ($name) => in_array(strtolower((string) $env($name)), ['1', 'true', 'yes', 'on'], true);

$config['db_dsnw'] = $env('DB_DSN', "sqlite:///{$data}/db/roundcube.db?mode=0640");
$config['des_key'] = $env('DES_KEY', is_readable("{$data}/des_key") ? trim(file_get_contents("{$data}/des_key")) : '');
$config['temp_dir'] = "{$data}/temp";
$config['log_dir'] = "{$data}/logs";
$config['log_driver'] = 'stdout';
$config['product_name'] = $env('PRODUCT_NAME', 'Webmail');
$config['skin'] = $env('SKIN', 'elastic');
$config['plugins'] = array_filter(array_map('trim', explode(',', $env('ENABLE_PLUGINS', 'archive,zipdownload'))));

// Mail servers: explicit > detected once at container start > detected at every login
if ($env('IMAP_HOST')) {
    $config['imap_host'] = $env('IMAP_HOST');
    $config['smtp_host'] = $env('SMTP_HOST', 'localhost:587');
    $config['username_domain'] = $env('USERNAME_DOMAIN');
} else {
    $setup = is_readable("{$data}/setup.json") ? json_decode(file_get_contents("{$data}/setup.json"), true) : null;
    $config = array_merge($config, array_diff_key((array) $setup, ['plugins' => 1, 'mode' => 1]));
    $config['plugins'] = array_unique(array_merge($config['plugins'], (array) ($setup['plugins'] ?? [])));
}

// No stored setup yet: index.php sends the browser to the installer, which saves setup.json
$config['setup_file'] = "{$data}/setup.json";
$config['setup_required'] = !$env('IMAP_HOST') && empty($setup);
$config['enable_installer'] = $config['setup_required'];

$config['autoconfig_allow_private'] = $flag('AUTOCONFIG_ALLOW_PRIVATE');
$config['autoconfig_allow_plain'] = $flag('AUTOCONFIG_ALLOW_PLAIN');

// Behind a reverse proxy: trust X-Forwarded-* of these addresses
if ($proxies = $env('TRUSTED_PROXIES')) {
    $config['proxy_whitelist'] = array_map('trim', explode(',', $proxies));
}
