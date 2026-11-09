// Translations. English is the fallback; the language follows the user's setting, then the browser.

const en = {
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete', 'common.remove': 'Remove', 'common.close': 'Close',
    'common.add': 'Add', 'common.edit': 'Edit', 'common.loading': 'Loading…', 'common.retry': 'Try again', 'common.back': 'Back',
    'common.more': 'More', 'common.logout': 'Sign out', 'common.settings': 'Settings', 'common.search': 'Search', 'common.confirm': 'Confirm',
    'common.error': 'Something went wrong', 'common.optional': 'optional', 'common.name': 'Name', 'common.email': 'Email address',

    'login.title': 'Welcome back', 'login.subtitle.single': 'Sign in with your email address and password.',
    'login.subtitle.multi': 'Sign in to your account to open your mailboxes.',
    'login.user.single': 'Email address', 'login.user.multi': 'Username', 'login.password': 'Password', 'login.submit': 'Sign in',
    'login.failed': 'Sign-in failed. Check your details and try again.', 'login.rate': 'Too many attempts. Please wait a moment.',
    'login.server': 'The mail server could not be reached.', 'login.classic': 'Use the classic interface',

    'folder.inbox': 'Inbox', 'folder.drafts': 'Drafts', 'folder.sent': 'Sent', 'folder.junk': 'Spam', 'folder.trash': 'Trash', 'folder.archive': 'Archive',
    'folders.title': 'Folders', 'folders.new': 'New folder', 'folders.name': 'Folder name', 'folders.rename': 'Rename folder',
    'folders.delete': 'Delete folder', 'folders.empty': 'Empty folder', 'folders.confirmDelete': 'Delete “{name}” and all messages in it?',
    'folders.confirmEmpty': 'Permanently delete all messages in “{name}”?', 'folders.quota': '{used} of {total} used',

    'compose.new': 'Compose',
    'list.search': 'Search mail', 'list.filter.all': 'All', 'list.filter.unseen': 'Unread', 'list.filter.flagged': 'Starred',
    'list.empty': 'Nothing here yet', 'list.emptyHint': 'Messages you receive will show up in this folder.',
    'list.noresults': 'No matches', 'list.noresultsHint': 'Try other words or remove the filter.', 'list.loadMore': 'Load more',
    'welcome.title': 'Welcome, {name}', 'welcome.text': 'Add your first mailbox to get started. Any provider works, and you can add more later under Settings.', 'list.refresh': 'Refresh', 'list.today': 'Today', 'list.yesterday': 'Yesterday', 'list.older': 'Older', 'list.selected': '{n} selected', 'list.selectAll': 'Select all', 'list.clearSelection': 'Clear selection',
    'list.count': '{n} messages', 'list.count1': '1 message', 'list.error': 'The messages could not be loaded.',

    'act.reply': 'Reply', 'act.replyall': 'Reply all', 'act.forward': 'Forward', 'act.archive': 'Archive', 'act.delete': 'Delete',
    'act.spam': 'Mark as spam', 'act.markUnread': 'Mark as unread', 'act.markRead': 'Mark as read', 'act.star': 'Star', 'act.unstar': 'Remove star',
    'act.moveTo': 'Move to…', 'act.edit': 'Edit draft', 'act.newWindow': 'Open in new window',

    'reader.select': 'Select a message', 'reader.selectHint': 'Nothing selected. Pick a message from the list to read it.',
    'reader.noSubject': '(no subject)', 'reader.details': 'Details', 'reader.hideDetails': 'Hide details', 'reader.from': 'From', 'reader.to': 'To',
    'reader.cc': 'Cc', 'reader.bcc': 'Bcc', 'reader.replyTo': 'Reply-To', 'reader.date': 'Date',
    'reader.remote': 'Images from the internet are blocked to protect your privacy.', 'reader.loadImages': 'Show images',
    'reader.attachments': 'Attachments', 'reader.download': 'Download', 'reader.preview': 'Preview', 'reader.unsubscribe': 'Unsubscribe',
    'reader.error': 'This message could not be opened.', 'reader.me': 'me', 'reader.draftBadge': 'Draft',

    'compose.title': 'New message', 'compose.titleReply': 'Reply', 'compose.titleForward': 'Forward', 'compose.titleDraft': 'Draft',
    'compose.from': 'From', 'compose.to': 'To', 'compose.cc': 'Cc', 'compose.bcc': 'Bcc', 'compose.subject': 'Subject',
    'compose.send': 'Send', 'compose.sending': 'Sending…', 'compose.discard': 'Discard', 'compose.saveDraft': 'Save draft',
    'compose.saved': 'Draft saved', 'compose.saving': 'Saving…', 'compose.attach': 'Attach files', 'compose.plain': 'Plain text', 'compose.rich': 'Formatting',
    'compose.confirmDiscard': 'Discard this message?', 'compose.noRecipient': 'Add at least one recipient.',
    'compose.invalid': 'Check the address “{value}”.', 'compose.noSubject': 'Send without a subject?', 'compose.sent': 'Message sent',
    'compose.dropFiles': 'Drop files to attach them', 'compose.minimize': 'Minimize', 'compose.maximize': 'Enlarge', 'compose.restore': 'Restore',
    'compose.wrote': 'On {date}, {name} wrote:', 'compose.forwarded': 'Forwarded message', 'compose.message': 'Message',
    'compose.bold': 'Bold', 'compose.italic': 'Italic', 'compose.underline': 'Underline', 'compose.list': 'Bulleted list',
    'compose.olist': 'Numbered list', 'compose.quote': 'Quote', 'compose.link': 'Link', 'compose.clear': 'Clear formatting',
    'compose.linkPrompt': 'Link address', 'compose.sendFailed': 'The message could not be sent', 'compose.shortcut': 'Ctrl+Enter to send',
    'compose.showCc': 'Cc / Bcc',

    'settings.integrations': 'Integrations', 'int.hint': 'Let AI assistants and other programs work with your mail through the MCP server. Each program gets its own token that you can revoke at any time.',
    'int.endpoint': 'MCP server address', 'int.name': 'Name of the program', 'int.namePlaceholder': 'e.g. Claude Code', 'int.create': 'Create token', 'int.created': 'Copy the token now. It is shown only once.',
    'int.tokens': 'Active tokens', 'int.none': 'No tokens yet.', 'int.never': 'never used', 'int.lastUsed': 'last used', 'int.revoke': 'Revoke', 'int.confirmRevoke': 'Revoke this token? Programs that use it lose access immediately.',
    'int.revoked': 'Token revoked', 'int.copy': 'Copy', 'int.copied': 'Copied', 'int.example': 'Connect Claude Code',
    'settings.title': 'Settings', 'settings.general': 'General', 'settings.accounts': 'Accounts', 'settings.identities': 'Identities',
    'settings.contacts': 'Contacts', 'settings.about': 'About', 'settings.saved': 'Settings saved',
    'settings.language': 'Language', 'settings.theme': 'Appearance', 'settings.theme.auto': 'Match system', 'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark', 'settings.density': 'List density', 'settings.density.comfortable': 'Comfortable', 'settings.density.compact': 'Compact',
    'settings.pagesize': 'Messages per page', 'settings.editor': 'Write messages in', 'settings.editor.html': 'Formatted text', 'settings.editor.text': 'Plain text',

    'acc.title': 'Mailboxes', 'acc.hint': 'Add mailboxes from any provider and switch between them.', 'acc.current': 'Open now', 'acc.default': 'Default',
    'acc.open': 'Open', 'acc.makeDefault': 'Make default', 'acc.confirmRemove': 'Remove this mailbox from your account? The mail stays on the mail server.',
    'acc.add': 'Add a mailbox', 'acc.email': 'Email address', 'acc.password': 'Mailbox password', 'acc.detect': 'Detect servers',
    'acc.detected': 'Servers found.', 'acc.notDetected': 'Nothing found. Enter the servers by hand.', 'acc.imap': 'IMAP server', 'acc.smtp': 'SMTP server',
    'acc.user': 'Login name', 'acc.userHint': 'Only if different from the address', 'acc.label': 'Display name', 'acc.quick': 'Quick setup',
    'acc.appPassword': 'Gmail and Microsoft usually need an app password instead of your normal password.', 'acc.added': 'Mailbox added',
    'acc.removed': 'Mailbox removed', 'acc.account': 'Your account', 'acc.changePassword': 'Change password', 'acc.currentPassword': 'Current password',
    'acc.newPassword': 'New password (8+ characters)', 'acc.passwordChanged': 'Password changed', 'acc.advanced': 'Servers',
    'acc.opened': 'Switched to {email}',

    'id.title': 'Sender identities', 'id.hint': 'Choose how your name and address appear when you send mail.', 'id.add': 'Add identity',
    'id.name': 'Display name', 'id.email': 'Email address', 'id.replyTo': 'Reply-To', 'id.bcc': 'Always Bcc', 'id.signature': 'Signature',
    'id.default': 'Default', 'id.makeDefault': 'Use as default', 'id.confirmDelete': 'Delete this identity?', 'id.saved': 'Identity saved',
    'id.locked': 'Identities are managed by your administrator.',

    'ct.title': 'Contacts', 'ct.search': 'Search contacts', 'ct.add': 'New contact', 'ct.empty': 'No contacts yet', 'ct.name': 'Name',
    'ct.email': 'Email', 'ct.phone': 'Phone', 'ct.org': 'Organization', 'ct.notes': 'Notes', 'ct.confirmDelete': 'Delete this contact?',
    'ct.saved': 'Contact saved', 'ct.write': 'Write a message',

    'about.version': 'Version', 'about.classic': 'Open the classic Roundcube interface', 'about.text': 'A modern webmail client on top of Roundcube.',

    'toast.moved': 'Moved to {folder}', 'toast.deleted': 'Moved to trash', 'toast.deletedForever': 'Deleted', 'toast.archived': 'Archived',
    'toast.spam': 'Marked as spam', 'toast.failed': 'That did not work', 'toast.newmail': 'New mail', 'toast.offline': 'You are offline',
    'toast.online': 'Back online', 'toast.sessionExpired': 'Your session has ended. Please sign in again.', 'toast.noArchive': 'There is no archive folder.',
    'toast.folderCreated': 'Folder created', 'toast.folderDeleted': 'Folder deleted', 'toast.emptied': 'Folder emptied',

    'sc.title': 'Keyboard shortcuts', 'sc.nav': 'Navigation', 'sc.actions': 'Actions', 'sc.next': 'Next message', 'sc.prev': 'Previous message',
    'sc.open': 'Open message', 'sc.compose': 'Compose', 'sc.reply': 'Reply', 'sc.replyall': 'Reply all', 'sc.forward': 'Forward',
    'sc.archive': 'Archive', 'sc.delete': 'Delete', 'sc.star': 'Star / unstar', 'sc.unread': 'Mark as unread', 'sc.search': 'Search',
    'sc.inbox': 'Go to Inbox', 'sc.help': 'Show this help', 'sc.close': 'Close message', 'sc.selectAll': 'Select all',
    'sc.send': 'Send message',
};

const de = {
    'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.delete': 'Löschen', 'common.remove': 'Entfernen', 'common.close': 'Schließen',
    'common.add': 'Hinzufügen', 'common.edit': 'Bearbeiten', 'common.loading': 'Lädt…', 'common.retry': 'Erneut versuchen', 'common.back': 'Zurück',
    'common.more': 'Mehr', 'common.logout': 'Abmelden', 'common.settings': 'Einstellungen', 'common.search': 'Suchen', 'common.confirm': 'Bestätigen',
    'common.error': 'Etwas ist schiefgelaufen', 'common.optional': 'optional', 'common.name': 'Name', 'common.email': 'E-Mail-Adresse',

    'login.title': 'Willkommen zurück', 'login.subtitle.single': 'Melde dich mit E-Mail-Adresse und Passwort an.',
    'login.subtitle.multi': 'Melde dich an, um deine Postfächer zu öffnen.',
    'login.user.single': 'E-Mail-Adresse', 'login.user.multi': 'Benutzername', 'login.password': 'Passwort', 'login.submit': 'Anmelden',
    'login.failed': 'Anmeldung fehlgeschlagen. Bitte Eingaben prüfen.', 'login.rate': 'Zu viele Versuche. Bitte kurz warten.',
    'login.server': 'Der Mailserver ist nicht erreichbar.', 'login.classic': 'Klassische Oberfläche verwenden',

    'folder.inbox': 'Posteingang', 'folder.drafts': 'Entwürfe', 'folder.sent': 'Gesendet', 'folder.junk': 'Spam', 'folder.trash': 'Papierkorb', 'folder.archive': 'Archiv',
    'folders.title': 'Ordner', 'folders.new': 'Neuer Ordner', 'folders.name': 'Ordnername', 'folders.rename': 'Ordner umbenennen',
    'folders.delete': 'Ordner löschen', 'folders.empty': 'Ordner leeren', 'folders.confirmDelete': '„{name}“ und alle Nachrichten darin löschen?',
    'folders.confirmEmpty': 'Alle Nachrichten in „{name}“ endgültig löschen?', 'folders.quota': '{used} von {total} belegt',

    'compose.new': 'Verfassen',
    'list.search': 'E-Mails durchsuchen', 'list.filter.all': 'Alle', 'list.filter.unseen': 'Ungelesen', 'list.filter.flagged': 'Markiert',
    'list.empty': 'Noch nichts da', 'list.emptyHint': 'Empfangene Nachrichten erscheinen in diesem Ordner.',
    'list.noresults': 'Keine Treffer', 'list.noresultsHint': 'Versuche andere Begriffe oder entferne den Filter.', 'list.loadMore': 'Mehr laden',
    'welcome.title': 'Willkommen, {name}', 'welcome.text': 'Füge dein erstes Postfach hinzu, um loszulegen. Jeder Anbieter funktioniert, weitere ergänzt du später in den Einstellungen.', 'list.refresh': 'Aktualisieren', 'list.today': 'Heute', 'list.yesterday': 'Gestern', 'list.older': 'Älter', 'list.selected': '{n} ausgewählt', 'list.selectAll': 'Alle auswählen', 'list.clearSelection': 'Auswahl aufheben',
    'list.count': '{n} Nachrichten', 'list.count1': '1 Nachricht', 'list.error': 'Die Nachrichten konnten nicht geladen werden.',

    'act.reply': 'Antworten', 'act.replyall': 'Allen antworten', 'act.forward': 'Weiterleiten', 'act.archive': 'Archivieren', 'act.delete': 'Löschen',
    'act.spam': 'Als Spam melden', 'act.markUnread': 'Als ungelesen markieren', 'act.markRead': 'Als gelesen markieren', 'act.star': 'Markieren', 'act.unstar': 'Markierung entfernen',
    'act.moveTo': 'Verschieben nach…', 'act.edit': 'Entwurf bearbeiten', 'act.newWindow': 'In neuem Fenster öffnen',

    'reader.select': 'Nachricht auswählen', 'reader.selectHint': 'Nichts ausgewählt. Wähle eine Nachricht aus der Liste.',
    'reader.noSubject': '(kein Betreff)', 'reader.details': 'Details', 'reader.hideDetails': 'Details ausblenden', 'reader.from': 'Von', 'reader.to': 'An',
    'reader.cc': 'Cc', 'reader.bcc': 'Bcc', 'reader.replyTo': 'Antwort an', 'reader.date': 'Datum',
    'reader.remote': 'Bilder aus dem Internet sind zum Schutz deiner Privatsphäre blockiert.', 'reader.loadImages': 'Bilder anzeigen',
    'reader.attachments': 'Anhänge', 'reader.download': 'Herunterladen', 'reader.preview': 'Vorschau', 'reader.unsubscribe': 'Abbestellen',
    'reader.error': 'Diese Nachricht konnte nicht geöffnet werden.', 'reader.me': 'ich', 'reader.draftBadge': 'Entwurf',

    'compose.title': 'Neue Nachricht', 'compose.titleReply': 'Antwort', 'compose.titleForward': 'Weiterleitung', 'compose.titleDraft': 'Entwurf',
    'compose.from': 'Von', 'compose.to': 'An', 'compose.cc': 'Cc', 'compose.bcc': 'Bcc', 'compose.subject': 'Betreff',
    'compose.send': 'Senden', 'compose.sending': 'Wird gesendet…', 'compose.discard': 'Verwerfen', 'compose.saveDraft': 'Entwurf speichern',
    'compose.saved': 'Entwurf gespeichert', 'compose.saving': 'Speichert…', 'compose.attach': 'Dateien anhängen', 'compose.plain': 'Nur Text', 'compose.rich': 'Formatierung',
    'compose.confirmDiscard': 'Diese Nachricht verwerfen?', 'compose.noRecipient': 'Bitte mindestens einen Empfänger angeben.',
    'compose.invalid': 'Bitte die Adresse „{value}“ prüfen.', 'compose.noSubject': 'Ohne Betreff senden?', 'compose.sent': 'Nachricht gesendet',
    'compose.dropFiles': 'Dateien hier ablegen, um sie anzuhängen', 'compose.minimize': 'Minimieren', 'compose.maximize': 'Vergrößern', 'compose.restore': 'Wiederherstellen',
    'compose.wrote': 'Am {date} schrieb {name}:', 'compose.forwarded': 'Weitergeleitete Nachricht', 'compose.message': 'Nachricht',
    'compose.bold': 'Fett', 'compose.italic': 'Kursiv', 'compose.underline': 'Unterstrichen', 'compose.list': 'Aufzählung',
    'compose.olist': 'Nummerierte Liste', 'compose.quote': 'Zitat', 'compose.link': 'Link', 'compose.clear': 'Formatierung entfernen',
    'compose.linkPrompt': 'Link-Adresse', 'compose.sendFailed': 'Die Nachricht konnte nicht gesendet werden', 'compose.shortcut': 'Strg+Enter zum Senden',
    'compose.showCc': 'Cc / Bcc',

    'settings.integrations': 'Integrationen', 'int.hint': 'KI-Assistenten und andere Programme können über den MCP-Server mit deinen Mails arbeiten. Jedes Programm bekommt einen eigenen Token, den du jederzeit widerrufen kannst.',
    'int.endpoint': 'Adresse des MCP-Servers', 'int.name': 'Name des Programms', 'int.namePlaceholder': 'z. B. Claude Code', 'int.create': 'Token erstellen', 'int.created': 'Kopiere den Token jetzt. Er wird nur einmal angezeigt.',
    'int.tokens': 'Aktive Tokens', 'int.none': 'Noch keine Tokens.', 'int.never': 'nie benutzt', 'int.lastUsed': 'zuletzt benutzt', 'int.revoke': 'Widerrufen', 'int.confirmRevoke': 'Token widerrufen? Programme, die ihn nutzen, verlieren sofort den Zugriff.',
    'int.revoked': 'Token widerrufen', 'int.copy': 'Kopieren', 'int.copied': 'Kopiert', 'int.example': 'Claude Code verbinden',
    'settings.title': 'Einstellungen', 'settings.general': 'Allgemein', 'settings.accounts': 'Konten', 'settings.identities': 'Absender',
    'settings.contacts': 'Kontakte', 'settings.about': 'Info', 'settings.saved': 'Einstellungen gespeichert',
    'settings.language': 'Sprache', 'settings.theme': 'Darstellung', 'settings.theme.auto': 'Wie das System', 'settings.theme.light': 'Hell',
    'settings.theme.dark': 'Dunkel', 'settings.density': 'Listendichte', 'settings.density.comfortable': 'Großzügig', 'settings.density.compact': 'Kompakt',
    'settings.pagesize': 'Nachrichten pro Seite', 'settings.editor': 'Nachrichten schreiben als', 'settings.editor.html': 'Formatierter Text', 'settings.editor.text': 'Nur Text',

    'acc.title': 'Postfächer', 'acc.hint': 'Füge Postfächer beliebiger Anbieter hinzu und wechsle zwischen ihnen.', 'acc.current': 'Jetzt geöffnet', 'acc.default': 'Standard',
    'acc.open': 'Öffnen', 'acc.makeDefault': 'Als Standard', 'acc.confirmRemove': 'Dieses Postfach aus deinem Konto entfernen? Die E-Mails bleiben auf dem Mailserver.',
    'acc.add': 'Postfach hinzufügen', 'acc.email': 'E-Mail-Adresse', 'acc.password': 'Postfach-Passwort', 'acc.detect': 'Server erkennen',
    'acc.detected': 'Server gefunden.', 'acc.notDetected': 'Nichts gefunden. Bitte Server von Hand eintragen.', 'acc.imap': 'IMAP-Server', 'acc.smtp': 'SMTP-Server',
    'acc.user': 'Anmeldename', 'acc.userHint': 'Nur wenn er von der Adresse abweicht', 'acc.label': 'Anzeigename', 'acc.quick': 'Schnelleinrichtung',
    'acc.appPassword': 'Bei Gmail und Microsoft brauchst du meist ein App-Passwort statt deines normalen Passworts.', 'acc.added': 'Postfach hinzugefügt',
    'acc.removed': 'Postfach entfernt', 'acc.account': 'Dein Konto', 'acc.changePassword': 'Passwort ändern', 'acc.currentPassword': 'Aktuelles Passwort',
    'acc.newPassword': 'Neues Passwort (mind. 8 Zeichen)', 'acc.passwordChanged': 'Passwort geändert', 'acc.advanced': 'Server',
    'acc.opened': 'Gewechselt zu {email}',

    'id.title': 'Absender', 'id.hint': 'Lege fest, wie Name und Adresse beim Senden erscheinen.', 'id.add': 'Absender hinzufügen',
    'id.name': 'Anzeigename', 'id.email': 'E-Mail-Adresse', 'id.replyTo': 'Antwort an', 'id.bcc': 'Immer Bcc', 'id.signature': 'Signatur',
    'id.default': 'Standard', 'id.makeDefault': 'Als Standard verwenden', 'id.confirmDelete': 'Diesen Absender löschen?', 'id.saved': 'Absender gespeichert',
    'id.locked': 'Absender werden von deinem Administrator verwaltet.',

    'ct.title': 'Kontakte', 'ct.search': 'Kontakte suchen', 'ct.add': 'Neuer Kontakt', 'ct.empty': 'Noch keine Kontakte', 'ct.name': 'Name',
    'ct.email': 'E-Mail', 'ct.phone': 'Telefon', 'ct.org': 'Organisation', 'ct.notes': 'Notizen', 'ct.confirmDelete': 'Diesen Kontakt löschen?',
    'ct.saved': 'Kontakt gespeichert', 'ct.write': 'Nachricht schreiben',

    'about.version': 'Version', 'about.classic': 'Klassische Roundcube-Oberfläche öffnen', 'about.text': 'Ein moderner Webmail-Client auf Basis von Roundcube.',

    'toast.moved': 'Verschoben nach {folder}', 'toast.deleted': 'In den Papierkorb verschoben', 'toast.deletedForever': 'Gelöscht', 'toast.archived': 'Archiviert',
    'toast.spam': 'Als Spam markiert', 'toast.failed': 'Das hat nicht geklappt', 'toast.newmail': 'Neue E-Mail', 'toast.offline': 'Du bist offline',
    'toast.online': 'Wieder online', 'toast.sessionExpired': 'Deine Sitzung ist beendet. Bitte melde dich erneut an.', 'toast.noArchive': 'Es gibt keinen Archivordner.',
    'toast.folderCreated': 'Ordner erstellt', 'toast.folderDeleted': 'Ordner gelöscht', 'toast.emptied': 'Ordner geleert',

    'sc.title': 'Tastenkürzel', 'sc.nav': 'Navigation', 'sc.actions': 'Aktionen', 'sc.next': 'Nächste Nachricht', 'sc.prev': 'Vorherige Nachricht',
    'sc.open': 'Nachricht öffnen', 'sc.compose': 'Verfassen', 'sc.reply': 'Antworten', 'sc.replyall': 'Allen antworten', 'sc.forward': 'Weiterleiten',
    'sc.archive': 'Archivieren', 'sc.delete': 'Löschen', 'sc.star': 'Markieren / Markierung entfernen', 'sc.unread': 'Als ungelesen markieren', 'sc.search': 'Suchen',
    'sc.inbox': 'Zum Posteingang', 'sc.help': 'Diese Hilfe anzeigen', 'sc.close': 'Nachricht schließen', 'sc.selectAll': 'Alle auswählen',
    'sc.send': 'Nachricht senden',
};

const dictionaries = { en, de };

let lang = 'en';
let locale = 'en';

/** Accepts Roundcube codes like "de_DE" as well as browser codes like "de-AT". */
export function setLanguage(code) {
    const short = String(code || navigator.language || 'en').slice(0, 2).toLowerCase();

    lang = dictionaries[short] ? short : 'en';
    locale = String(code || navigator.language || 'en').replace('_', '-');
    document.documentElement.lang = lang;
}

export const getLocale = () => locale;

export function t(key, vars) {
    let text = dictionaries[lang][key] ?? en[key] ?? key;

    if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
    }

    return text;
}

setLanguage();
