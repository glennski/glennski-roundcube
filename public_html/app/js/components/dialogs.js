import { html } from '../vendor/htm-preact.mjs';
import { Modal } from '../ui.js';
import { t } from '../i18n.js';
import { useStore } from '../store.js';
import { closeDialog } from '../actions.js';
import { SettingsDialog } from './settings.js';

export function ImageDialog({ url, name }) {
    return html`<${Modal} title=${name} onClose=${closeDialog} wide class="lightbox"><div class="center"><img src=${url} alt=${name} class="lightbox-img" /></div><//>`;
}

const SHORTCUTS = [
    ['sc.nav', [['j / k', 'sc.next', 'sc.prev'], ['Enter / o', 'sc.open'], ['Esc / u', 'sc.close'], ['g i', 'sc.inbox'], ['/', 'sc.search'], ['?', 'sc.help']]],
    ['sc.actions', [['c', 'sc.compose'], ['r', 'sc.reply'], ['a', 'sc.replyall'], ['f', 'sc.forward'], ['e', 'sc.archive'], ['#  /  Delete', 'sc.delete'], ['s', 'sc.star'], ['Shift+U', 'sc.unread'], ['Ctrl/⌘ + Enter', 'sc.send']]],
];

export function ShortcutsDialog() {
    return html`<${Modal} title=${t('sc.title')} onClose=${closeDialog}>
        <div class="shortcuts">${SHORTCUTS.map(([title, rows]) => html`<section key=${title}><h4>${t(title)}</h4>
            <dl>${rows.map(([keys, ...labels]) => html`<div key=${keys}><dt>${keys.split(' / ').map((k, i) => html`${i ? ' / ' : ''}<kbd>${k}</kbd>`)}</dt><dd>${labels.map((l) => t(l)).join(' / ')}</dd></div>`)}</dl></section>`)}</div>
    <//>`;
}

export function Dialogs() {
    const dialog = useStore((s) => s.dialog);

    if (!dialog) return null;
    if (dialog.type === 'settings') return html`<${SettingsDialog} tab=${dialog.tab} />`;
    if (dialog.type === 'image') return html`<${ImageDialog} url=${dialog.url} name=${dialog.name} />`;
    if (dialog.type === 'shortcuts') return html`<${ShortcutsDialog} />`;

    return null;
}
