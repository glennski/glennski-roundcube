<?php

/*
 +-------------------------------------------------------------------------+
 | Roundcube Webmail setup tool - first run (Docker)                       |
 |                                                                         |
 | Asks how the mail servers are found and stores the answer in the file   |
 | named by the 'setup_file' option. Shown until that file exists.         |
 +-------------------------------------------------------------------------+
*/

$file = $RCI->getprop('setup_file');
$error = null;
$saved = null;

if (empty($_SESSION['firstrun_token'])) {
    $_SESSION['firstrun_token'] = rcube_utils::random_bytes(24);
}

$mode = $_POST['_mode'] ?? 'auto';
$input = trim($_POST['_input'] ?? '');
$manual = array_map('trim', (array) ($_POST['_manual'] ?? []));

if (!empty($_POST['_mode'])) {
    try {
        if (!hash_equals($_SESSION['firstrun_token'], (string) ($_POST['_token'] ?? ''))) {
            throw new \RuntimeException('Invalid request, please try again');
        }

        if ($mode === 'manual') {
            $host = '~^((ssl|tls)://)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$~i';
            $config = [];

            foreach (['imap_host', 'smtp_host'] as $key) {
                if (!preg_match($host, $manual[$key] ?? '')) {
                    throw new \RuntimeException("Please enter a valid {$key}, e.g. tls://imap.example.com:143");
                }
                $config[$key] = $manual[$key];
            }
            if (!empty($manual['username_domain'])) {
                $config['username_domain'] = $manual['username_domain'];
            }
        } else {
            $options = ['allow_private' => (bool) $RCI->getprop('autoconfig_allow_private', false)];
            $config = (new rcube_autoconfig($options))->wizard($mode, $input);
        }

        $tmp = $file . '.tmp';
        if (@file_put_contents($tmp, json_encode($config, \JSON_PRETTY_PRINT)) === false || !@rename($tmp, $file)) {
            throw new \RuntimeException("Could not write {$file}. Is the data volume writable?");
        }

        $saved = $config;
        unset($_SESSION['firstrun_token']);
    } catch (\Exception $e) {
        $error = $e->getMessage();
    }
}

echo '<h2>Welcome</h2>';

if ($saved) {
    echo '<p class="notice">Setup saved.</p>';
    if (($saved['imap_host'] ?? '') !== '') {
        echo '<p>IMAP: <tt>' . rcube::Q($saved['imap_host']) . '</tt><br />SMTP: <tt>' . rcube::Q($saved['smtp_host']) . '</tt></p>';
    } else {
        echo '<p>Mail servers are detected from the address each user logs in with.</p>';
    }
    echo '<p><input type="button" onclick="location.href=\'./\'" value="GO TO LOGIN" /></p>';
    return;
}

if ($error) {
    echo '<p class="warning">' . rcube::Q($error) . '</p>';
}

?>
<p>This installation has no mail server setup yet. How should Roundcube find the mail servers?</p>

<form action="installer.php" method="post">
<input type="hidden" name="_token" value="<?php echo rcube::Q($_SESSION['firstrun_token']); ?>" />

<fieldset>
<legend>Setup</legend>

<p><label><input type="radio" name="_mode" value="auto"<?php echo $mode === 'auto' ? ' checked="checked"' : ''; ?> />
  <b>Detect at login</b> &ndash; look up the servers of whatever address a user logs in with
  (autoconfig, Autodiscover, SRV records, Thunderbird ISP database, MX). Best for several domains.</label></p>

<p><label><input type="radio" name="_mode" value="fixed"<?php echo $mode === 'fixed' ? ' checked="checked"' : ''; ?> />
  <b>Fixed servers</b> &ndash; detect them once from an email address or domain:</label>
  <input type="text" name="_input" size="30" placeholder="you@example.com" value="<?php echo rcube::Q($input); ?>" /></p>

<p><label><input type="radio" name="_mode" value="manual"<?php echo $mode === 'manual' ? ' checked="checked"' : ''; ?> />
  <b>Enter servers manually</b></label><br />
  <input type="text" name="_manual[imap_host]" size="30" placeholder="IMAP: tls://imap.example.com:143" value="<?php echo rcube::Q($manual['imap_host'] ?? ''); ?>" />
  <input type="text" name="_manual[smtp_host]" size="30" placeholder="SMTP: tls://smtp.example.com:587" value="<?php echo rcube::Q($manual['smtp_host'] ?? ''); ?>" />
  <input type="text" name="_manual[username_domain]" size="20" placeholder="domain (optional)" value="<?php echo rcube::Q($manual['username_domain'] ?? ''); ?>" /></p>

<p class="hint">Requests are only made to public hosts. To change this later, remove <tt><?php echo rcube::Q($file); ?></tt> or set <tt>ROUNDCUBE_*</tt> variables.</p>
<p><input type="submit" value="SAVE AND CONTINUE" /></p>
</fieldset>
</form>
