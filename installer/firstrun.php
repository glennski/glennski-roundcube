<?php

/*
 +-------------------------------------------------------------------------+
 | First-run setup (Docker)                                                |
 |                                                                         |
 | Asks how this installation is used and stores the answer in the file    |
 | named by the 'setup_file' option:                                       |
 |   single  one mailbox (or any address, servers detected at login),      |
 |           users log in with their mail address and mail password        |
 |   multi   users have an account of this application and add several     |
 |           mailboxes from different providers (plugin 'accounts')        |
 | Included by installer/index.php before any output.                      |
 +-------------------------------------------------------------------------+
*/

$file = $RCI->getprop('setup_file');
$lang = $_GET['lang'] ?? (stripos($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '', 'de') === 0 ? 'de' : 'en');
$t = static fn (string $en, string $de) => $lang === 'de' ? $de : $en;
$q = static fn ($s) => htmlspecialchars((string) $s, \ENT_QUOTES, 'UTF-8');

$nonce = base64_encode(random_bytes(16));
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-{$nonce}'; script-src 'nonce-{$nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'");

if (empty($_SESSION['firstrun_token'])) {
    $_SESSION['firstrun_token'] = rcube_utils::random_bytes(24);
}
$token_ok = static fn () => hash_equals($_SESSION['firstrun_token'], (string) ($_POST['_token'] ?? ''));

$allow_private = (bool) $RCI->getprop('autoconfig_allow_private', false);
$allow_plain = (bool) $RCI->getprop('autoconfig_allow_plain', false);

// ---- JSON endpoint: detect servers for an address ------------------------
if (!empty($_POST['_detect'])) {
    header('Content-Type: application/json');
    $email = trim($_POST['_email'] ?? '');
    $found = null;

    if ($token_ok() && filter_var($email, \FILTER_VALIDATE_EMAIL)) {
        $found = (new rcube_autoconfig(['allow_private' => $allow_private, 'allow_plain' => $allow_plain]))->lookup($email);
    }

    echo json_encode($found ? [
        'imap_host' => rcube_autoconfig::to_config($found)['imap_host'],
        'smtp_host' => rcube_autoconfig::to_config($found)['smtp_host'],
        'imap_user' => $found['username'] === 'localpart' ? strstr($email, '@', true) : $email,
        'domain' => $found['username'] === 'email' ? $found['domain'] : '',
        'source' => $found['source'],
    ] : null);
    exit;
}

// ---- already set up -------------------------------------------------------
$locked = $RCI->configured && !$RCI->getprop('enable_installer') && empty($_SESSION['allowinstaller']);

// ---- save ---------------------------------------------------------------
$error = null;
$saved = null;
$in = static fn (string $name) => trim((string) ($_POST[$name] ?? ''));
$host_re = '~^((ssl|tls)://)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$~i';
$mode = in_array($_POST['_mode'] ?? '', ['single', 'multi'], true) ? $_POST['_mode'] : '';
$scope = ($_POST['_scope'] ?? 'one') === 'any' ? 'any' : 'one';

if (!$locked && $mode !== '') {
    try {
        if (!$token_ok()) {
            throw new \RuntimeException($t('The page expired. Please try again.', 'Die Seite ist abgelaufen. Bitte erneut versuchen.'));
        }

        if ($mode === 'single') {
            if ($scope === 'any') {
                $config = ['mode' => 'single'] + (new rcube_autoconfig())->wizard('auto');
            } else {
                $config = ['mode' => 'single', 'imap_host' => $in('_imap_host'), 'smtp_host' => $in('_smtp_host')];

                foreach (['imap_host', 'smtp_host'] as $key) {
                    if (!preg_match($host_re, $config[$key])) {
                        throw new \RuntimeException($t("Please enter a valid {$key}, e.g. tls://imap.example.com:143", "Bitte einen gültigen Wert für {$key} eingeben, z. B. tls://imap.example.com:143"));
                    }
                }
                if ($in('_domain') !== '') {
                    $config['username_domain'] = $in('_domain');
                }
            }
        } else {
            // multi: app account + first mailbox (needs the tables and a working mailbox login)
            require_once INSTALL_PATH . 'plugins/accounts/lib/accounts_store.php';

            $admin = $in('_admin_user');
            $box = ['email' => $in('_mb_email'), 'imap_host' => $in('_mb_imap_host'), 'smtp_host' => $in('_mb_smtp_host'),
                'imap_user' => $in('_mb_imap_user') ?: $in('_mb_email'), 'imap_pass' => (string) ($_POST['_mb_pass'] ?? '')];

            if ($admin === '' || strlen((string) ($_POST['_admin_pass'] ?? '')) < 8) {
                throw new \RuntimeException($t('Choose a user name and a password with at least 8 characters.', 'Bitte Benutzernamen und ein Passwort mit mindestens 8 Zeichen wählen.'));
            }
            if (($_POST['_admin_pass'] ?? '') !== ($_POST['_admin_pass2'] ?? '')) {
                throw new \RuntimeException($t('The two passwords do not match.', 'Die beiden Passwörter stimmen nicht überein.'));
            }
            if (!filter_var($box['email'], \FILTER_VALIDATE_EMAIL) || $box['imap_pass'] === '' || !preg_match($host_re, $box['imap_host'])) {
                throw new \RuntimeException($t('Please enter the email address, password and IMAP server of the first mailbox.', 'Bitte E-Mail-Adresse, Passwort und IMAP-Server des ersten Postfachs angeben.'));
            }
            // the installer is an admin context: any server is fine, but the login must work
            if ($err = \accounts_store::check_imap($box['imap_host'], $box['imap_user'], $box['imap_pass'])) {
                throw new \RuntimeException($t('Could not sign in to the mailbox: ', 'Anmeldung am Postfach nicht möglich: ') . $err);
            }

            $store = new \accounts_store();
            $store->install();
            $store->mailbox_add($store->user_create($admin, (string) $_POST['_admin_pass']), $box);

            $config = ['mode' => 'multi', 'imap_host' => 'localhost:143', 'plugins' => ['accounts']];
            $saved_user = $admin;
        }

        $tmp = $file . '.tmp';
        if (@file_put_contents($tmp, json_encode($config, \JSON_PRETTY_PRINT)) === false || !@rename($tmp, $file)) {
            throw new \RuntimeException($t("Could not write {$file}. Is the data folder writable?", "{$file} konnte nicht geschrieben werden. Ist der Datenordner beschreibbar?"));
        }

        $saved = $config + ['user' => $saved_user ?? ''];
        unset($_SESSION['firstrun_token']);
    } catch (\Exception $e) {
        $error = $e->getMessage();
    }
}

$checked = static fn ($cond) => $cond ? ' checked' : '';
$val = static fn (string $name) => $q($_POST[$name] ?? '');
?>
<!DOCTYPE html>
<html lang="<?php echo $lang; ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title><?php echo $t('Set up your webmail', 'Webmail einrichten'); ?></title>
<style nonce="<?php echo $nonce; ?>">
:root {
  --bg: #f4f6fb; --card: #fff; --ink: #172033; --muted: #5d6b82; --line: #dfe5ef;
  --brand: #2f6bff; --brand-ink: #fff; --brand-soft: #eaf0ff; --danger: #b42318; --danger-soft: #fef0ee; --ok: #0a7a4d; --ok-soft: #e7f7ef;
  --radius: 16px; --shadow: 0 1px 2px rgba(23,32,51,.06), 0 12px 32px rgba(23,32,51,.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1220; --card: #151c2e; --ink: #e8ecf5; --muted: #98a4bb; --line: #263049;
    --brand: #6b92ff; --brand-ink: #0b1226; --brand-soft: #1c2a4f; --danger: #ff8f84; --danger-soft: #3a1d1b; --ok: #4fd49c; --ok-soft: #12302a;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.35);
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { color-scheme: light dark; }
body { margin: 0; min-height: 100vh; background: radial-gradient(1200px 500px at 50% -10%, var(--brand-soft), transparent), var(--bg);
  color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 48px 16px 64px; }
header { text-align: center; margin-bottom: 32px; }
.mark { width: 56px; height: 56px; border-radius: 16px; background: var(--brand); color: var(--brand-ink); display: inline-grid; place-items: center; box-shadow: var(--shadow); }
h1 { font-size: clamp(1.6rem, 4vw, 2.2rem); line-height: 1.2; margin: 16px 0 8px; letter-spacing: -.02em; }
.lead { color: var(--muted); margin: 0 auto; max-width: 52ch; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
.tile { position: relative; display: block; cursor: pointer; background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); padding: 24px; transition: border-color .15s, box-shadow .15s, transform .15s; }
.tile:hover { border-color: var(--brand); transform: translateY(-2px); }
.tile input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
.tile.on, .tile:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 18%, transparent); }
.tile:has(input:focus-visible) { outline: 3px solid var(--brand); outline-offset: 3px; }
.tile svg { color: var(--brand); }
.tile h2 { font-size: 1.15rem; margin: 12px 0 4px; }
.tile p { color: var(--muted); margin: 0 0 12px; font-size: .95rem; }
.tile ul { list-style: none; margin: 0; padding: 0; font-size: .9rem; }
.tile li { padding-left: 22px; position: relative; margin: 4px 0; }
.tile li::before { content: ""; position: absolute; left: 2px; top: .45em; width: 10px; height: 6px; border-left: 2px solid var(--ok); border-bottom: 2px solid var(--ok); transform: rotate(-45deg); }
.panel { display: none; }
.panel.on { display: block; animation: rise .25s ease-out; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .panel.on { animation: none; } .tile { transition: none; } }
h3 { font-size: 1rem; margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
label, .label { font-weight: 600; font-size: .9rem; }
input[type=text], input[type=email], input[type=password] { width: 100%; font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; }
input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); outline-offset: 1px; border-color: var(--brand); }
.hint { color: var(--muted); font-size: .85rem; margin: 0; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
.seg label { margin: 0; font-weight: 500; padding: 8px 14px; border-radius: 9px; cursor: pointer; }
.seg input { position: absolute; opacity: 0; }
.seg label:has(input:checked) { background: var(--brand); color: var(--brand-ink); }
.seg label:has(input:focus-visible) { outline: 3px solid color-mix(in srgb, var(--brand) 45%, transparent); }
.row { display: flex; gap: 8px; align-items: stretch; }
.row input { flex: 1; }
button, .btn { font: inherit; font-weight: 600; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: inherit; padding: 11px 18px; cursor: pointer; text-decoration: none; display: inline-block; }
button.primary, .btn.primary { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
button:disabled { opacity: .6; cursor: progress; }
.status { font-size: .85rem; min-height: 1.3em; margin: 0 0 12px; }
.status.ok { color: var(--ok); } .status.bad { color: var(--danger); }
.alert { border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); }
.done { text-align: center; } .done .tick { width: 56px; height: 56px; border-radius: 50%; background: var(--ok-soft); color: var(--ok); display: inline-grid; place-items: center; }
code { background: var(--brand-soft); padding: 2px 6px; border-radius: 6px; }
.actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.lang { text-align: center; margin-top: 24px; font-size: .85rem; } .lang a { color: var(--muted); }
details summary { cursor: pointer; color: var(--muted); font-size: .9rem; margin-bottom: 12px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
</head>
<body>
<main>
<header>
  <span class="mark" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg></span>
  <h1><?php echo $t('Set up your webmail', 'Richte dein Webmail ein'); ?></h1>
  <p class="lead"><?php echo $t('Two questions, then you are ready to go. You can change this later by deleting the setup file.', 'Zwei Fragen, dann kann es losgehen. Du kannst das später ändern, indem du die Setup-Datei löschst.'); ?></p>
</header>

<?php if ($locked) { ?>
  <section class="card done" role="status">
    <h2><?php echo $t('Setup is already done', 'Die Einrichtung ist bereits abgeschlossen'); ?></h2>
    <p class="hint"><?php echo $t('The installer is disabled for this installation.', 'Der Installer ist für diese Installation deaktiviert.'); ?></p>
    <a class="btn primary" href="./"><?php echo $t('Open webmail', 'Webmail öffnen'); ?></a>
  </section>
<?php } elseif ($saved) { ?>
  <section class="card done" role="status">
    <span class="tick" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>
    <h2><?php echo $t('All set', 'Alles bereit'); ?></h2>
    <?php if ($saved['mode'] === 'multi') { ?>
      <p><?php echo $t('Sign in with your account', 'Melde dich mit deinem Konto an'); ?> <code><?php echo $q($saved['user']); ?></code>. <?php echo $t('Add more mailboxes under Settings → Accounts.', 'Weitere Postfächer fügst du unter Einstellungen → Konten hinzu.'); ?></p>
    <?php } elseif (($saved['imap_host'] ?? '') === '') { ?>
      <p><?php echo $t('Sign in with any email address. The mail servers are detected automatically.', 'Melde dich mit einer beliebigen E-Mail-Adresse an. Die Mailserver werden automatisch erkannt.'); ?></p>
    <?php } else { ?>
      <p><?php echo $t('Sign in with the email address and password of your mailbox.', 'Melde dich mit E-Mail-Adresse und Passwort deines Postfachs an.'); ?></p>
    <?php } ?>
    <a class="btn primary" href="./"><?php echo $t('Open webmail', 'Webmail öffnen'); ?></a>
  </section>
<?php } else { ?>
<form method="post" action="installer.php<?php echo $lang !== 'en' ? '?lang=' . $q($lang) : ''; ?>" id="setup" novalidate>
  <input type="hidden" name="_token" value="<?php echo $q($_SESSION['firstrun_token']); ?>">

  <?php if ($error) { ?><div class="alert" role="alert"><?php echo $q($error); ?></div><?php } ?>

  <fieldset class="tiles" style="border:0;padding:0;margin:0 0 24px">
    <legend class="sr"><?php echo $t('How will you use it?', 'Wie möchtest du es nutzen?'); ?></legend>
    <label class="tile">
      <input type="radio" name="_mode" value="single"<?php echo $checked($mode === 'single'); ?>>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg>
      <h2><?php echo $t('One email address', 'Eine E-Mail-Adresse'); ?></h2>
      <p><?php echo $t('The classic way. Sign in with the email address and password of your mailbox.', 'Der klassische Weg. Du meldest dich mit E-Mail-Adresse und Passwort deines Postfachs an.'); ?></p>
      <ul>
        <li><?php echo $t('Nothing to register', 'Keine Registrierung nötig'); ?></li>
        <li><?php echo $t('Fixed mail server, or any address', 'Fester Mailserver oder beliebige Adresse'); ?></li>
      </ul>
    </label>
    <label class="tile">
      <input type="radio" name="_mode" value="multi"<?php echo $checked($mode === 'multi'); ?>>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="13" height="10" rx="2.5"/><rect x="8" y="9" width="13" height="10" rx="2.5"/><path d="m9 12 3.5 2.5L16 12"/></svg>
      <h2><?php echo $t('Account with several mailboxes', 'Konto mit mehreren Postfächern'); ?></h2>
      <p><?php echo $t('Create an account with its own password and add mailboxes from any provider.', 'Lege ein Konto mit eigenem Passwort an und füge Postfächer beliebiger Anbieter hinzu.'); ?></p>
      <ul>
        <li><?php echo $t('Switch between mailboxes', 'Zwischen Postfächern wechseln'); ?></li>
        <li><?php echo $t('Servers are detected for you', 'Server werden automatisch erkannt'); ?></li>
      </ul>
    </label>
  </fieldset>

  <!-- single -->
  <section class="card panel" id="panel-single" aria-labelledby="h-single">
    <h3 id="h-single"><?php echo $t('Which mailboxes may sign in?', 'Welche Postfächer dürfen sich anmelden?'); ?></h3>
    <div class="seg" role="radiogroup">
      <label><input type="radio" name="_scope" value="one"<?php echo $checked($scope === 'one'); ?>><?php echo $t('Only this mailbox', 'Nur dieses Postfach'); ?></label>
      <label><input type="radio" name="_scope" value="any"<?php echo $checked($scope === 'any'); ?>><?php echo $t('Any address (detect at login)', 'Jede Adresse (Erkennung beim Login)'); ?></label>
    </div>

    <div id="scope-one">
      <div class="field">
        <label for="s-email"><?php echo $t('Email address', 'E-Mail-Adresse'); ?></label>
        <div class="row">
          <input type="email" id="s-email" name="_email" autocomplete="email" placeholder="you@example.com" value="<?php echo $val('_email'); ?>">
          <button type="button" data-detect="s"><?php echo $t('Detect servers', 'Server erkennen'); ?></button>
        </div>
      </div>
      <p class="status" id="s-status" aria-live="polite"></p>
      <div class="grid">
        <div class="field"><label for="s-imap">IMAP</label><input type="text" id="s-imap" name="_imap_host" placeholder="ssl://imap.example.com:993" value="<?php echo $val('_imap_host'); ?>"></div>
        <div class="field"><label for="s-smtp">SMTP</label><input type="text" id="s-smtp" name="_smtp_host" placeholder="tls://smtp.example.com:587" value="<?php echo $val('_smtp_host'); ?>"></div>
      </div>
      <input type="hidden" id="s-domain" name="_domain" value="<?php echo $val('_domain'); ?>">
      <p class="hint"><?php echo $t('Use ssl:// for port 993/465 and tls:// for STARTTLS on 143/587.', 'Nutze ssl:// für Port 993/465 und tls:// für STARTTLS auf 143/587.'); ?></p>
    </div>
    <p class="hint" id="scope-any" hidden><?php echo $t('Users type their email address and password. Roundcube looks up the servers of that address (autoconfig, Autodiscover, SRV, Thunderbird database).', 'Nutzer geben ihre E-Mail-Adresse und ihr Passwort ein. Die Server dieser Adresse werden nachgeschlagen (Autoconfig, Autodiscover, SRV, Thunderbird-Datenbank).'); ?></p>
  </section>

  <!-- multi -->
  <section class="card panel" id="panel-multi" aria-labelledby="h-multi">
    <h3 id="h-multi"><?php echo $t('Your account', 'Dein Konto'); ?></h3>
    <div class="field" style="max-width:420px"><label for="m-user"><?php echo $t('User name', 'Benutzername'); ?></label><input type="text" id="m-user" name="_admin_user" autocomplete="username" value="<?php echo $val('_admin_user'); ?>"></div>
    <div class="grid">
      <div class="field"><label for="m-pass"><?php echo $t('Password', 'Passwort'); ?></label><input type="password" id="m-pass" name="_admin_pass" autocomplete="new-password" minlength="8"><p class="hint"><?php echo $t('At least 8 characters', 'Mindestens 8 Zeichen'); ?></p></div>
      <div class="field"><label for="m-pass2"><?php echo $t('Repeat password', 'Passwort wiederholen'); ?></label><input type="password" id="m-pass2" name="_admin_pass2" autocomplete="new-password"></div>
    </div>
    <hr style="border:0;border-top:1px solid var(--line);margin:8px 0 20px">
    <h3><?php echo $t('Your first mailbox', 'Dein erstes Postfach'); ?></h3>
    <div class="grid">
      <div class="field"><label for="m-email"><?php echo $t('Email address', 'E-Mail-Adresse'); ?></label><input type="email" id="m-email" name="_mb_email" autocomplete="email" placeholder="you@example.com" value="<?php echo $val('_mb_email'); ?>"></div>
      <div class="field"><label for="m-mbpass"><?php echo $t('Mailbox password', 'Postfach-Passwort'); ?></label><input type="password" id="m-mbpass" name="_mb_pass" autocomplete="off"></div>
    </div>
    <div class="row" style="margin-bottom:8px"><button type="button" data-detect="m"><?php echo $t('Detect servers', 'Server erkennen'); ?></button></div>
    <p class="status" id="m-status" aria-live="polite"></p>
    <div class="grid">
      <div class="field"><label for="m-imap">IMAP</label><input type="text" id="m-imap" name="_mb_imap_host" placeholder="ssl://imap.example.com:993" value="<?php echo $val('_mb_imap_host'); ?>"></div>
      <div class="field"><label for="m-smtp">SMTP</label><input type="text" id="m-smtp" name="_mb_smtp_host" placeholder="tls://smtp.example.com:587" value="<?php echo $val('_mb_smtp_host'); ?>"></div>
    </div>
    <details><summary><?php echo $t('Login name differs from the address?', 'Anmeldename weicht von der Adresse ab?'); ?></summary>
      <div class="field"><label for="m-imapuser"><?php echo $t('Login name', 'Anmeldename'); ?></label><input type="text" id="m-imapuser" name="_mb_imap_user" value="<?php echo $val('_mb_imap_user'); ?>"></div>
    </details>
    <p class="hint"><?php echo $t('You can add more mailboxes, also from other providers, under Settings → Accounts.', 'Weitere Postfächer, auch anderer Anbieter, fügst du später unter Einstellungen → Konten hinzu.'); ?></p>
  </section>

  <div class="actions" id="actions" hidden>
    <span class="hint"><?php echo $t('The mailbox login is checked before anything is saved.', 'Die Anmeldung am Postfach wird geprüft, bevor etwas gespeichert wird.'); ?></span>
    <button type="submit" class="primary" id="submit"><?php echo $t('Save and continue', 'Speichern und weiter'); ?></button>
  </div>
</form>

<script nonce="<?php echo $nonce; ?>">
(function () {
  var form = document.getElementById('setup'), $ = function (id) { return document.getElementById(id); };
  var msg = <?php echo json_encode([
      'found' => $t('Servers found', 'Server gefunden'),
      'none' => $t('Nothing found. Enter the servers by hand.', 'Nichts gefunden. Bitte Server von Hand eintragen.'),
      'wait' => $t('Looking up…', 'Suche läuft…'),
      'mismatch' => $t('The two passwords do not match.', 'Die beiden Passwörter stimmen nicht überein.'),
  ]); ?>;

  function mode() { var r = form.querySelector('input[name=_mode]:checked'); return r && r.value; }
  function scope() { return form.querySelector('input[name=_scope]:checked').value; }

  function refresh() {
    var m = mode();
    $('panel-single').classList.toggle('on', m === 'single');
    $('panel-multi').classList.toggle('on', m === 'multi');
    $('actions').hidden = !m;
    $('scope-one').hidden = scope() !== 'one';
    $('scope-any').hidden = scope() !== 'any';
    [].forEach.call(form.querySelectorAll('.tile'), function (t) { t.classList.toggle('on', t.querySelector('input').checked); });
  }
  form.addEventListener('change', refresh);
  refresh();

  var fields = { s: ['s-email', 's-imap', 's-smtp', 's-status'], m: ['m-email', 'm-imap', 'm-smtp', 'm-status'] };
  [].forEach.call(form.querySelectorAll('[data-detect]'), function (btn) {
    btn.addEventListener('click', function () {
      var f = fields[btn.dataset.detect], status = $(f[3]), body = new URLSearchParams({ _detect: 1, _email: $(f[0]).value, _token: form._token.value });
      status.className = 'status'; status.textContent = msg.wait; btn.disabled = true;
      fetch('installer.php', { method: 'POST', body: body, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (r) {
            $(f[1]).value = r.imap_host; $(f[2]).value = r.smtp_host;
            if (btn.dataset.detect === 's') { $('s-domain').value = r.domain; }
            else { $('m-imapuser').value = r.imap_user === $(f[0]).value ? '' : r.imap_user; }
          }
          status.className = 'status ' + (r ? 'ok' : 'bad'); status.textContent = r ? msg.found : msg.none;
        })
        .catch(function () { status.className = 'status bad'; status.textContent = msg.none; })
        .then(function () { btn.disabled = false; });
    });
  });

  form.addEventListener('submit', function (e) {
    if (mode() === 'multi' && $('m-pass').value !== $('m-pass2').value) { e.preventDefault(); alert(msg.mismatch); return; }
    $('submit').disabled = true;
  });
})();
</script>
<?php } ?>

<p class="lang"><a href="installer.php?lang=en">English</a> · <a href="installer.php?lang=de">Deutsch</a></p>
</main>
</body>
</html>
