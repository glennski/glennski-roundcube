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
 |   Multi-account mode administration (plugin 'accounts').              |
 |   Also the way out when the default mailbox of an account is broken.  |
 +-----------------------------------------------------------------------+
*/

define('INSTALL_PATH', realpath(__DIR__ . '/..') . '/');

require_once INSTALL_PATH . 'program/include/clisetup.php';
require_once INSTALL_PATH . 'plugins/accounts/lib/accounts_store.php';

$argv = $_SERVER['argv'];
$cmd = $argv[1] ?? 'help';
$store = new \accounts_store();

switch ($cmd) {
    case 'install':
        $store->install();
        echo "Tables are ready.\n";
        break;
    case 'add-user': // add-user <name> <password>
        $store->install();
        $store->user_create($argv[2] ?? '', $argv[3] ?? '');
        echo "User created. Add a mailbox by signing in and using Settings > Accounts.\n";
        break;
    case 'passwd': // passwd <name> <new password>
        $id = $store->user_id($argv[2] ?? '') ?: rcube::raise_error('Unknown user', false, true);
        $store->user_set_password($id, $argv[3] ?? '');
        echo "Password changed.\n";
        break;
    case 'mailboxes': // mailboxes <name>
        $id = $store->user_id($argv[2] ?? '') ?: rcube::raise_error('Unknown user', false, true);
        foreach ($store->mailboxes($id) as $m) {
            printf("%d\t%s\t%s%s\n", $m['mailbox_id'], $m['email'], $m['imap_host'], $m['is_default'] ? "\t(default)" : '');
        }
        break;
    case 'set-default': // set-default <name> <mailbox id>
        $id = $store->user_id($argv[2] ?? '') ?: rcube::raise_error('Unknown user', false, true);
        $store->mailbox_set_default((int) ($argv[3] ?? 0), $id);
        echo "Default mailbox set.\n";
        break;
    default:
        echo "Usage: bin/accounts.php install\n"
           . "       bin/accounts.php add-user <name> <password>\n"
           . "       bin/accounts.php passwd <name> <new password>\n"
           . "       bin/accounts.php mailboxes <name>\n"
           . "       bin/accounts.php set-default <name> <mailbox id>\n";
}
