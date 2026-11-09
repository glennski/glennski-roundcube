import { html, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { Avatar, Button, IconButton, MenuItem, Popover, PromptDialog } from '../ui.js';
import { t } from '../i18n.js';
import { useStore, setState } from '../store.js';
import { createFolder, deleteFolder, emptyFolder, folderLabel, logout, openCompose, openDialog, openFolder, renameFolder, switchAccount } from '../actions.js';
import { fmtSize } from '../util.js';

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];
const ROLE_ICON = { inbox: 'inbox', drafts: 'draft', sent: 'send', archive: 'archive', junk: 'spam', trash: 'trash' };

function sorted(folders, delimiter) {
    const system = ROLE_ORDER.map((role) => folders.find((f) => f.role === role)).filter(Boolean);
    const others = folders.filter((f) => !f.role).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return [...system.map((f) => ({ ...f, depth: 0 })), ...others.map((f) => ({ ...f, depth: f.name.split(delimiter).length - 1 }))];
}

function FolderItem({ folder, active }) {
    const [dialog, setDialog] = useState(null);
    const custom = !folder.role;
    const clearable = folder.role === 'trash' || folder.role === 'junk';
    const badge = folder.role === 'drafts' ? folder.total : folder.unseen;

    return html`<li class=${`folder ${active ? 'active' : ''}`} style=${`--depth:${folder.depth}`}>
        <button type="button" class="folder-btn" onClick=${() => openFolder(folder.name)} aria-current=${active ? 'page' : undefined}>
            <${Icon} name=${ROLE_ICON[folder.role] || 'folder'} size=${18} />
            <span class="folder-name">${folderLabel(folder)}</span>
            ${badge > 0 && html`<span class=${`badge ${folder.role === 'drafts' ? 'quiet' : ''}`}>${badge > 999 ? '999+' : badge}</span>`}
        </button>
        ${(custom || clearable) && html`<${Popover} class="folder-menu" trigger=${({ toggle }) => html`<button type="button" class="folder-more" aria-label=${t('common.more')} onClick=${toggle}><${Icon} name="more" size=${16} /></button>`}>
            ${(close) => html`
                ${custom && html`<${MenuItem} icon="edit" onClick=${() => { close(); setDialog('rename'); }}>${t('folders.rename')}<//>`}
                ${clearable && html`<${MenuItem} icon="trash" onClick=${() => { close(); if (window.confirm(t('folders.confirmEmpty', { name: folderLabel(folder) }))) emptyFolder(folder.name); }}>${t('folders.empty')}<//>`}
                ${custom && html`<${MenuItem} icon="trash" danger onClick=${() => { close(); if (window.confirm(t('folders.confirmDelete', { name: folder.label }))) deleteFolder(folder.name); }}>${t('folders.delete')}<//>`}
            `}
        <//>`}
        ${dialog === 'rename' && html`<${PromptDialog} title=${t('folders.rename')} label=${t('folders.name')} initial=${folder.label} onClose=${() => setDialog(null)} onSubmit=${(name) => { setDialog(null); renameFolder(folder.name, name); }} />`}
    </li>`;
}

function AccountSwitcher() {
    const session = useStore((s) => s.session);
    const accounts = session.accounts;
    const current = accounts ? accounts.mailboxes.find((m) => m.id === accounts.current) : null;
    const email = session.user.email;
    const name = current ? current.label || current.email : email;

    return html`<${Popover} align="left" class="account-switcher" trigger=${({ toggle, open }) => html`
        <button type="button" class="account-btn" onClick=${toggle} aria-expanded=${open} aria-haspopup="menu">
            <${Avatar} name=${name} email=${email} size=${32} />
            <span class="account-text"><strong>${name}</strong>${name !== email && html`<small>${email}</small>`}</span>
            ${accounts && html`<${Icon} name="chevrondown" size=${16} />`}
        </button>`}>
        ${(close) => html`
            ${accounts && accounts.mailboxes.map((m) => html`<${MenuItem} key=${m.id} checked=${m.id === accounts.current} onClick=${() => { close(); if (m.id !== accounts.current) switchAccount(m.id); }}>
                <span class="menu-two"><strong>${m.label || m.email}</strong><small>${m.email}</small></span>
            <//>`)}
            ${accounts && html`<${MenuItem} icon="plus" onClick=${() => { close(); openDialog({ type: 'settings', tab: 'accounts' }); }}>${t('acc.add')}<//>`}
            <${MenuItem} icon="settings" onClick=${() => { close(); openDialog({ type: 'settings', tab: 'general' }); }}>${t('common.settings')}<//>
            <${MenuItem} icon="logout" onClick=${() => { close(); logout(); }}>${t('common.logout')}<//>
        `}
    <//>`;
}

export function Sidebar() {
    const folders = useStore((s) => s.folders);
    const delimiter = useStore((s) => s.delimiter);
    const active = useStore((s) => s.folder);
    const open = useStore((s) => s.sidebarOpen);
    const quota = useStore((s) => s.quota);
    const [creating, setCreating] = useState(false);

    return html`<aside class=${`sidebar ${open ? 'open' : ''}`} aria-label=${t('folders.title')}>
        <div class="sidebar-top">
            <${AccountSwitcher} />
            <div class="sidebar-close"><${IconButton} icon="close" label=${t('common.close')} onClick=${() => setState({ sidebarOpen: false })} /></div>
        </div>
        <${Button} variant="primary" icon="edit" class="compose-btn" onClick=${() => { setState({ sidebarOpen: false }); openCompose('new'); }}>${t('compose.new')}<//>
        <nav class="folders">
            <ul>${sorted(folders, delimiter).map((f) => html`<${FolderItem} key=${f.name} folder=${f} active=${f.name === active} />`)}</ul>
            <button type="button" class="folder-new" onClick=${() => setCreating(true)}><${Icon} name="plus" size=${16} /> ${t('folders.new')}</button>
        </nav>
        <div class="sidebar-foot">
            ${quota && quota.total ? html`<div class="quota" title=${t('folders.quota', { used: fmtSize(quota.used * 1024), total: fmtSize(quota.total * 1024) })}>
                <div class="quota-bar"><span style=${`width:${Math.min(100, quota.percent || 0)}%`}></span></div>
                <small>${t('folders.quota', { used: fmtSize(quota.used * 1024), total: fmtSize(quota.total * 1024) })}</small>
            </div>` : null}
            <div class="row">
                <${IconButton} icon="settings" label=${t('common.settings')} onClick=${() => openDialog({ type: 'settings', tab: 'general' })} />
                <${IconButton} icon="logout" label=${t('common.logout')} onClick=${logout} />
            </div>
        </div>
        ${creating && html`<${PromptDialog} title=${t('folders.new')} label=${t('folders.name')} onClose=${() => setCreating(false)} onSubmit=${(name) => { setCreating(false); createFolder(name); }} />`}
    </aside>`;
}
