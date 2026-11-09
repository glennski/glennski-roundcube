<?php

/*
 +-------------------------------------------------------------------------+
 | Glennski JSON API                                                       |
 |                                                                         |
 | Entry point of the JSON API used by the new frontend (and later by the  |
 | MCP server). Routes: api.php/v1/<resource>. See docs/API.md.            |
 +-------------------------------------------------------------------------+
*/

// include environment
require_once __DIR__ . '/../program/include/iniset.php';

// Own task: plugins that extend the web UI bind to 'mail'/'settings' and stay out of API requests
// (otherwise they would try to add buttons to the JSON output and fail).
$_GET['_task'] = 'api';
unset($_GET['_action'], $_POST['_action']);

// init application: session, user, plugins (the X-Roundcube-Request header selects the JSON output)
$RCMAIL = rcmail::get_instance(0, $GLOBALS['env'] ?? null);

rcmail_api::run($RCMAIL);
