import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, IconButton, MenuItem, Popover, PromptDialog, cx } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { useStore, setState } from '../lib/store.js';
import { createFolder, deleteFolder, emptyFolder, folderLabel, logout, openCompose, openDialog, openFolder, renameFolder, switchAccount } from '../lib/actions.js';
import { fmtSize } from '../lib/util.js';

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];
const ROLE_ICON = { inbox: 'inbox', drafts: 'draft', sent: 'send', archive: 'archive', junk: 'spam', trash: 'trash' };

function split(folders, delimiter) {
    const system = ROLE_ORDER.map((role) => folders.find((f) => f.role === role)).filter(Boolean).map((f) => ({ ...f, depth: 0 }));
    const custom = folders.filter((f) => !f.role).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((f) => ({ ...f, depth: f.name.split(delimiter).length - 1 }));

    return { system, custom };
}

function FolderItem({ folder, active }) {
    const [dialog, setDialog] = useState(null);
    const custom = !folder.role;
    const clearable = folder.role === 'trash' || folder.role === 'junk';
    const badge = folder.role === 'drafts' ? folder.total : folder.unseen;

    return (
        <li className="group relative" style={{ '--depth': folder.depth }}>
            <button
                type="button"
                onClick={() => openFolder(folder.name)}
                aria-current={active ? 'page' : undefined}
                className={cx('flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 text-left transition-colors', active ? 'bg-surface-container-highest font-medium text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface')}
                style={{ paddingLeft: `calc(0.5rem + var(--depth, 0) * 14px)` }}
            >
                <Icon name={ROLE_ICON[folder.role] || 'folder'} size={17} />
                <span className="min-w-0 flex-1 truncate text-label-lg">{folderLabel(folder)}</span>
                {badge > 0 && <span className={cx('rounded-full px-1.5 text-label-sm group-hover:invisible', folder.role === 'drafts' ? 'text-secondary' : 'font-semibold text-on-surface')}>{badge > 999 ? '999+' : badge}</span>}
            </button>
            {(custom || clearable) && (
                <Popover className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 focus-within:opacity-100 group-hover:opacity-100" trigger={({ toggle }) => <button type="button" className="icon-btn !h-6 !w-6" aria-label={t('common.more')} onClick={toggle}><Icon name="more" size={15} /></button>}>
                    {(close) => (
                        <>
                            {custom && <MenuItem icon="edit" onClick={() => { close(); setDialog('rename'); }}>{t('folders.rename')}</MenuItem>}
                            {clearable && <MenuItem icon="trash" onClick={() => { close(); if (window.confirm(t('folders.confirmEmpty', { name: folderLabel(folder) }))) emptyFolder(folder.name); }}>{t('folders.empty')}</MenuItem>}
                            {custom && <MenuItem icon="trash" danger onClick={() => { close(); if (window.confirm(t('folders.confirmDelete', { name: folder.label }))) deleteFolder(folder.name); }}>{t('folders.delete')}</MenuItem>}
                        </>
                    )}
                </Popover>
            )}
            {dialog === 'rename' && <PromptDialog title={t('folders.rename')} label={t('folders.name')} initial={folder.label} onClose={() => setDialog(null)} onSubmit={(name) => { setDialog(null); renameFolder(folder.name, name); }} />}
        </li>
    );
}

function AccountSwitcher() {
    const session = useStore((s) => s.session);
    const accounts = session.accounts;
    const current = accounts ? accounts.mailboxes.find((m) => m.id === accounts.current) : null;
    const email = session.user.email;
    const name = current ? current.label || current.email : email;

    return (
        <Popover align="left" up className="block w-full" trigger={({ toggle, open }) => (
            <button type="button" className="account-btn flex w-full items-center gap-2.5 rounded-lg bg-surface-container-lowest px-2.5 py-2 text-left shadow-sm transition-colors hover:bg-surface-container-high" onClick={toggle} aria-expanded={open} aria-haspopup="menu">
                <Avatar name={name} email={email} size={26} className="!bg-primary !text-on-primary" />
                <span className="account-text grid min-w-0 flex-1 leading-tight">
                    <strong className="truncate text-[12px] font-semibold">{name}</strong>
                    {name !== email && <small className="truncate text-[11px] text-secondary">{email}</small>}
                </span>
                <Icon name="chevrondown" size={14} className="text-secondary" />
            </button>
        )}>
            {(close) => (
                <>
                    {accounts && accounts.mailboxes.map((m) => (
                        <MenuItem key={m.id} checked={m.id === accounts.current} onClick={() => { close(); if (m.id !== accounts.current) switchAccount(m.id); }}>
                            <span className="grid leading-tight"><strong className="font-medium">{m.label || m.email}</strong><small className="text-secondary">{m.email}</small></span>
                        </MenuItem>
                    ))}
                    {accounts && <MenuItem icon="plus" onClick={() => { close(); openDialog({ type: 'settings', tab: 'accounts' }); }}>{t('acc.add')}</MenuItem>}
                    <MenuItem icon="settings" onClick={() => { close(); openDialog({ type: 'settings', tab: 'general' }); }}>{t('common.settings')}</MenuItem>
                    <MenuItem icon="logout" onClick={() => { close(); logout(); }}>{t('common.logout')}</MenuItem>
                </>
            )}
        </Popover>
    );
}

export function Sidebar() {
    const folders = useStore((s) => s.folders);
    const delimiter = useStore((s) => s.delimiter);
    const active = useStore((s) => s.folder);
    const open = useStore((s) => s.sidebarOpen);
    const quota = useStore((s) => s.quota);
    const [creating, setCreating] = useState(false);
    const { system, custom } = split(folders, delimiter);

    return (
        <aside className={cx('flex w-56 shrink-0 flex-col justify-between bg-surface px-space-md py-space-lg max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[70] max-lg:w-[min(280px,86vw)] max-lg:transition-transform', open ? 'max-lg:translate-x-0 max-lg:shadow-modal' : 'max-lg:-translate-x-full max-lg:invisible')} aria-label={t('folders.title')}>
            <div className="flex min-h-0 flex-col gap-space-lg">
                <div className="flex items-center justify-between px-space-sm">
                    <div className="flex items-center gap-space-sm">
                        <div className="grid h-5 w-5 place-items-center rounded bg-primary text-on-primary"><Icon name="mail" size={12} /></div>
                        <span className="text-headline-sm tracking-tight">Glennski</span>
                    </div>
                    <IconButton icon="close" label={t('common.close')} className="lg:hidden" onClick={() => setState({ sidebarOpen: false })} />
                </div>

                <button type="button" className="compose-btn group flex w-full items-center justify-between rounded-lg bg-surface-container-low px-space-md py-2 transition-colors hover:bg-surface-container" onClick={() => { setState({ sidebarOpen: false }); openCompose('new'); }}>
                    <span className="flex items-center gap-space-sm"><Icon name="edit" size={16} className="text-on-surface-variant" /><span className="text-label-lg">{t('compose.new')}</span></span>
                    <kbd className="kbd opacity-70">C</kbd>
                </button>

                <nav className="-mx-1 flex min-h-0 flex-col gap-space-lg overflow-auto px-1" aria-label={t('folders.title')}>
                    <div className="flex flex-col gap-space-xs">
                        <ul className="m-0 grid list-none gap-0.5 p-0">{system.map((f) => <FolderItem key={f.name} folder={f} active={f.name === active} />)}</ul>
                    </div>
                    <div className="flex flex-col gap-space-xs">
                        <div className="caps px-space-sm">{t('folders.title')}</div>
                        <ul className="m-0 grid list-none gap-0.5 p-0">{custom.map((f) => <FolderItem key={f.name} folder={f} active={f.name === active} />)}</ul>
                        <button type="button" className="flex items-center gap-2.5 rounded-lg px-space-sm py-1.5 text-left text-label-lg text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> {t('folders.new')}</button>
                    </div>
                </nav>
            </div>

            <div className="flex flex-col gap-space-sm pt-space-sm">
                {quota && quota.total ? (
                    <div className="px-space-sm" title={t('folders.quota', { used: fmtSize(quota.used * 1024), total: fmtSize(quota.total * 1024) })}>
                        <div className="mb-1 h-1 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, quota.percent || 0)}%` }} /></div>
                        <small className="text-label-sm text-secondary">{t('folders.quota', { used: fmtSize(quota.used * 1024), total: fmtSize(quota.total * 1024) })}</small>
                    </div>
                ) : null}
                <div className="rounded-xl bg-surface-container-low p-1"><AccountSwitcher /></div>
            </div>

            {creating && <PromptDialog title={t('folders.new')} label={t('folders.name')} onClose={() => setCreating(false)} onSubmit={(name) => { setCreating(false); createFolder(name); }} />}
        </aside>
    );
}
