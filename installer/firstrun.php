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
header("Content-Security-Policy: default-src 'none'; style-src 'self' 'nonce-{$nonce}'; font-src 'self'; script-src 'nonce-{$nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'");

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
<link rel="stylesheet" href="app/design/tokens.css">
<link rel="stylesheet" href="app/design/primitives.css">
<style nonce="<?php echo $nonce; ?>">
/* page layout only; colours, buttons, fields and tiles come from app/design/ (frontend/public/design) */
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-height: 100vh; background: rgb(var(--surface)); color: rgb(var(--on-surface)); font: 14px/1.55 var(--font-sans); -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
main { max-width: 760px; margin: 0 auto; padding: 56px 16px 64px; }
header { margin-bottom: 32px; }
h1 { font-size: clamp(1.6rem, 4vw, 1.75rem); line-height: 1.25; margin: 20px 0 8px; letter-spacing: -.02em; font-weight: 600; }
h2 { font-size: 1.05rem; line-height: 1.4; margin: 12px 0 4px; font-weight: 600; letter-spacing: -.01em; }
h3 { font-size: 1rem; margin: 0 0 12px; font-weight: 600; letter-spacing: -.01em; }
.lead { color: rgb(var(--secondary)); margin: 0; max-width: 52ch; font-size: 15px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 0 0 24px; padding: 0; border: 0; }
.tile svg { color: rgb(var(--primary)); }
.tile p { color: rgb(var(--secondary)); margin: 0 0 12px; }
.tile ul { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.tile li { padding-left: 22px; position: relative; margin: 4px 0; }
.tile li::before { content: ""; position: absolute; left: 2px; top: .45em; width: 10px; height: 6px; border-left: 2px solid rgb(var(--ok)); border-bottom: 2px solid rgb(var(--ok)); transform: rotate(-45deg); }
.panel { display: none; }
.panel.on { display: block; animation: rise .25s ease-out; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .panel.on { animation: none; } }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.field { margin-bottom: 16px; }
.segmented { margin-bottom: 20px; }
.row { display: flex; gap: 8px; align-items: stretch; }
.row .input { flex: 1; }
.row.detect { margin-bottom: 8px; }
.narrow { max-width: 420px; }
.alert-error { margin-bottom: 20px; }
.done { text-align: center; display: grid; justify-items: center; gap: 8px; }
.done .tick { width: 3rem; height: 3rem; border-radius: 50%; background: rgb(var(--ok) / .15); color: rgb(var(--ok)); display: inline-grid; place-items: center; }
.done p { margin: 0 0 8px; }
.actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.lang { text-align: center; margin-top: 32px; font-size: 12px; } .lang a { color: rgb(var(--secondary)); }
details summary { cursor: pointer; color: rgb(var(--secondary)); font-size: 13px; margin-bottom: 12px; }
hr { border: 0; border-top: 1px solid rgb(var(--outline-variant) / .5); margin: 8px 0 20px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
</head>
<body>
<main>
<header>
  <span class="brand-mark brand-mark-lg" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg></span>
  <h1><?php echo $t('Set up your webmail', 'Richte dein Webmail ein'); ?></h1>
  <p class="lead"><?php echo $t('Two questions, then you are ready to go. You can change this later by deleting the setup file.', 'Zwei Fragen, dann kann es losgehen. Du kannst das später ändern, indem du die Setup-Datei löschst.'); ?></p>
</header>

<?php if ($locked) { ?>
  <section class="card done" role="status">
    <h2><?php echo $t('Setup is already done', 'Die Einrichtung ist bereits abgeschlossen'); ?></h2>
    <p class="hint"><?php echo $t('The installer is disabled for this installation.', 'Der Installer ist für diese Installation deaktiviert.'); ?></p>
    <a class="btn btn-primary" href="./"><?php echo $t('Open webmail', 'Webmail öffnen'); ?></a>
  </section>
<?php } elseif ($saved) { ?>
  <section class="card done" role="status">
    <span class="tick" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>
    <h2><?php echo $t('All set', 'Alles bereit'); ?></h2>
    <?php if ($saved['mode'] === 'multi') { ?>
      <p><?php echo $t('Sign in with your account', 'Melde dich mit deinem Konto an'); ?> <code class="code"><?php echo $q($saved['user']); ?></code>. <?php echo $t('Add more mailboxes under Settings → Accounts.', 'Weitere Postfächer fügst du unter Einstellungen → Konten hinzu.'); ?></p>
    <?php } elseif (($saved['imap_host'] ?? '') === '') { ?>
      <p><?php echo $t('Sign in with any email address. The mail servers are detected automatically.', 'Melde dich mit einer beliebigen E-Mail-Adresse an. Die Mailserver werden automatisch erkannt.'); ?></p>
    <?php } else { ?>
      <p><?php echo $t('Sign in with the email address and password of your mailbox.', 'Melde dich mit E-Mail-Adresse und Passwort deines Postfachs an.'); ?></p>
    <?php } ?>
    <a class="btn btn-primary" href="./"><?php echo $t('Open webmail', 'Webmail öffnen'); ?></a>
  </section>
<?php } else { ?>
<form method="post" action="installer.php<?php echo $lang !== 'en' ? '?lang=' . $q($lang) : ''; ?>" id="setup" novalidate>
  <input type="hidden" name="_token" value="<?php echo $q($_SESSION['firstrun_token']); ?>">

  <?php if ($error) { ?><div class="alert-error" role="alert"><?php echo $q($error); ?></div><?php } ?>

  <fieldset class="tiles">
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
    <div class="segmented" role="radiogroup">
      <label><input type="radio" name="_scope" value="one"<?php echo $checked($scope === 'one'); ?>><?php echo $t('Only this mailbox', 'Nur dieses Postfach'); ?></label>
      <label><input type="radio" name="_scope" value="any"<?php echo $checked($scope === 'any'); ?>><?php echo $t('Any address (detect at login)', 'Jede Adresse (Erkennung beim Login)'); ?></label>
    </div>

    <div id="scope-one">
      <div class="field">
        <label for="s-email"><?php echo $t('Email address', 'E-Mail-Adresse'); ?></label>
        <div class="row">
          <input class="input" type="email" id="s-email" name="_email" autocomplete="email" placeholder="you@example.com" value="<?php echo $val('_email'); ?>">
          <button type="button" class="btn" data-detect="s"><?php echo $t('Detect servers', 'Server erkennen'); ?></button>
        </div>
      </div>
      <p class="status" id="s-status" aria-live="polite"></p>
      <div class="grid">
        <div class="field"><label for="s-imap">IMAP</label><input class="input" type="text" id="s-imap" name="_imap_host" placeholder="ssl://imap.example.com:993" value="<?php echo $val('_imap_host'); ?>"></div>
        <div class="field"><label for="s-smtp">SMTP</label><input class="input" type="text" id="s-smtp" name="_smtp_host" placeholder="tls://smtp.example.com:587" value="<?php echo $val('_smtp_host'); ?>"></div>
      </div>
      <input type="hidden" id="s-domain" name="_domain" value="<?php echo $val('_domain'); ?>">
      <p class="hint"><?php echo $t('Use ssl:// for port 993/465 and tls:// for STARTTLS on 143/587.', 'Nutze ssl:// für Port 993/465 und tls:// für STARTTLS auf 143/587.'); ?></p>
    </div>
    <p class="hint" id="scope-any" hidden><?php echo $t('Users type their email address and password. Roundcube looks up the servers of that address (autoconfig, Autodiscover, SRV, Thunderbird database).', 'Nutzer geben ihre E-Mail-Adresse und ihr Passwort ein. Die Server dieser Adresse werden nachgeschlagen (Autoconfig, Autodiscover, SRV, Thunderbird-Datenbank).'); ?></p>
  </section>

  <!-- multi -->
  <section class="card panel" id="panel-multi" aria-labelledby="h-multi">
    <h3 id="h-multi"><?php echo $t('Your account', 'Dein Konto'); ?></h3>
    <div class="field narrow"><label for="m-user"><?php echo $t('User name', 'Benutzername'); ?></label><input class="input" type="text" id="m-user" name="_admin_user" autocomplete="username" value="<?php echo $val('_admin_user'); ?>"></div>
    <div class="grid">
      <div class="field"><label for="m-pass"><?php echo $t('Password', 'Passwort'); ?></label><input class="input" type="password" id="m-pass" name="_admin_pass" autocomplete="new-password" minlength="8"><p class="hint"><?php echo $t('At least 8 characters', 'Mindestens 8 Zeichen'); ?></p></div>
      <div class="field"><label for="m-pass2"><?php echo $t('Repeat password', 'Passwort wiederholen'); ?></label><input class="input" type="password" id="m-pass2" name="_admin_pass2" autocomplete="new-password"></div>
    </div>
    <hr>
    <h3><?php echo $t('Your first mailbox', 'Dein erstes Postfach'); ?></h3>
    <div class="grid">
      <div class="field"><label for="m-email"><?php echo $t('Email address', 'E-Mail-Adresse'); ?></label><input class="input" type="email" id="m-email" name="_mb_email" autocomplete="email" placeholder="you@example.com" value="<?php echo $val('_mb_email'); ?>"></div>
      <div class="field"><label for="m-mbpass"><?php echo $t('Mailbox password', 'Postfach-Passwort'); ?></label><input class="input" type="password" id="m-mbpass" name="_mb_pass" autocomplete="off"></div>
    </div>
    <div class="row detect"><button type="button" class="btn" data-detect="m"><?php echo $t('Detect servers', 'Server erkennen'); ?></button></div>
    <p class="status" id="m-status" aria-live="polite"></p>
    <div class="grid">
      <div class="field"><label for="m-imap">IMAP</label><input class="input" type="text" id="m-imap" name="_mb_imap_host" placeholder="ssl://imap.example.com:993" value="<?php echo $val('_mb_imap_host'); ?>"></div>
      <div class="field"><label for="m-smtp">SMTP</label><input class="input" type="text" id="m-smtp" name="_mb_smtp_host" placeholder="tls://smtp.example.com:587" value="<?php echo $val('_mb_smtp_host'); ?>"></div>
    </div>
    <details><summary><?php echo $t('Login name differs from the address?', 'Anmeldename weicht von der Adresse ab?'); ?></summary>
      <div class="field"><label for="m-imapuser"><?php echo $t('Login name', 'Anmeldename'); ?></label><input class="input" type="text" id="m-imapuser" name="_mb_imap_user" value="<?php echo $val('_mb_imap_user'); ?>"></div>
    </details>
    <p class="hint"><?php echo $t('You can add more mailboxes, also from other providers, under Settings → Accounts.', 'Weitere Postfächer, auch anderer Anbieter, fügst du später unter Einstellungen → Konten hinzu.'); ?></p>
  </section>

  <div class="actions" id="actions" hidden>
    <span class="hint"><?php echo $t('The mailbox login is checked before anything is saved.', 'Die Anmeldung am Postfach wird geprüft, bevor etwas gespeichert wird.'); ?></span>
    <button type="submit" class="btn btn-primary" id="submit"><?php echo $t('Save and continue', 'Speichern und weiter'); ?></button>
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
