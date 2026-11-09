#!/usr/bin/env php
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
 |   Setup wizard: find IMAP/SMTP servers for an address or domain, or   |
 |   switch to per-login detection. Prints config.inc.php lines.         |
 +-----------------------------------------------------------------------+
*/

define('INSTALL_PATH', realpath(__DIR__ . '/..') . '/');

require_once INSTALL_PATH . 'program/include/clisetup.php';

$opts = rcube_utils::get_opt([
    'm' => 'mode',
    'e' => 'email',
    'd' => 'domain',
    'p' => 'allow-private:bool',
    'j' => 'json:bool',
]);

$ask = static function ($question) {
    echo $question . ' ';
    return trim((string) fgets(\STDIN));
};

$mode = $opts['mode'] ?? null;
$input = $opts['email'] ?? $opts['domain'] ?? '';

if (!$mode) {
    if (!stream_isatty(\STDIN)) {
        rcube::raise_error('Missing --mode=fixed|auto (see --help in docs/INSTALL.md)', false, true);
    }

    echo "How should Roundcube find the mail servers?\n"
        . "  1) Fixed servers - enter an email address or domain, settings are detected once\n"
        . "  2) Detect at login - every user is looked up by the address typed at login\n";
    $mode = $ask('Choice [1/2]:') === '2' ? 'auto' : 'fixed';

    if ($mode === 'fixed') {
        $input = $ask('Email address or domain:');
    }
}

try {
    $config = (new rcube_autoconfig(['allow_private' => isset($opts['allow-private'])]))->wizard($mode, $input);
} catch (\Throwable $e) {
    rcube::raise_error($e->getMessage(), false, true);
}

if (isset($opts['json'])) {
    echo json_encode($config, \JSON_PRETTY_PRINT) . "\n";
    exit;
}

foreach ($config as $key => $value) {
    echo "\$config['{$key}'] = " . var_export($value, true) . ";\n";
}
