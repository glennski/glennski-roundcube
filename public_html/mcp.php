<?php

/*
 +-------------------------------------------------------------------------+
 | Glennski MCP server                                                     |
 |                                                                         |
 | Model Context Protocol over HTTP (JSON-RPC, POST). Authentication is an |
 | access token (Settings > Integrations). See docs/MCP.md.                |
 +-------------------------------------------------------------------------+
*/

require_once __DIR__ . '/../program/include/iniset.php';

$_GET['_task'] = 'api';
unset($_GET['_action'], $_POST['_action']);

$RCMAIL = rcmail::get_instance(0, $GLOBALS['env'] ?? null);

rcmail_mcp::run($RCMAIL);
