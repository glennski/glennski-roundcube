import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Avatar, EmptyState, IconButton, MenuItem, Popover, Spinner, cx } from '../ui.jsx';
import { t, getLocale } from '../lib/i18n.js';
import { getState, setState, useStore } from '../lib/store.js';
import { act, folderLabel, loadList, openMessage, refreshFolders, search, selectAll, setFilter, toggleSelected, toggleStar } from '../lib/actions.js';
import { dayGroup, debounce, fmtListDate } from '../lib/util.js';

function MovePicker({ folder, onPick, trigger }) {
    const folders = useStore((s) => s.folders);

    return (
        <Popover align="left" trigger={trigger}>
            {(close) => folders.filter((f) => f.name !== folder).map((f) => <MenuItem key={f.name} icon="folder" onClick={() => { close(); onPick(f.name); }}>{folderLabel(f)}</MenuItem>)}
        </Popover>
    );
}

const quick = 'icon-btn !h-7 !w-7';

function Row({ m, active, selected, sentLike }) {
    const who = sentLike ? m.to[0] || { name: '', email: '' } : m.from;
    const label = who.name || who.email || '—';

    const open = (e) => {
        if (e.metaKey || e.ctrlKey) return toggleSelected(m.uid, !selected);

        openMessage(m);
    };

    return (
        <li data-uid={m.uid} className={cx('row group relative flex items-center rounded-lg transition-colors', m.seen ? '' : 'unread', active && 'active', active ? 'bg-surface-container-highest' : selected ? 'bg-accent-soft' : 'hover:bg-surface-container-high')}>
            {!m.seen && <span className="unread-dot absolute left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" aria-label="Unread" />}
            <button type="button" className="row-check shrink-0 py-[var(--row-py)] pl-3.5 pr-2.5" aria-label={selected ? 'Deselect' : 'Select'} aria-pressed={selected} onClick={(e) => { e.stopPropagation(); toggleSelected(m.uid, !selected); }}>
                {selected
                    ? <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-on-primary"><Icon name="check" size={13} /></span>
                    : <Avatar name={who.name} email={who.email} size={24} />}
            </button>
            <button type="button" className="row-main min-w-0 flex-1 py-[var(--row-py)] pr-3 text-left" onClick={open} aria-current={active ? 'true' : undefined}>
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 @xl:grid-cols-[11rem_minmax(0,1fr)_auto]">
                    <span className={cx('row-from col-start-1 row-start-1 truncate text-label-lg', m.seen ? 'text-on-surface-variant' : 'font-semibold text-on-surface')}>{sentLike ? `${t('reader.to')}: ` : ''}{label}</span>
                    <span className={cx('row-subject col-span-2 row-start-2 flex items-center gap-1.5 truncate text-body-md @xl:col-span-1 @xl:col-start-2 @xl:row-start-1', m.seen ? 'text-secondary' : 'font-medium text-on-surface')}>
                        {m.answered && <Icon name="reply" size={12} className="text-outline" />}
                        <span className="truncate">{m.subject || t('reader.noSubject')}</span>
                    </span>
                    <span className="row-meta col-start-2 row-start-1 flex items-center gap-1.5 whitespace-nowrap text-body-sm tabular-nums text-secondary @xl:col-start-3 [@media(hover:hover)]:group-hover:invisible [@media(hover:hover)]:group-focus-within:invisible">
                        {m.flagged && <Icon name="star" size={12} filled className="text-star" />}
                        {m.has_attachments && <Icon name="paperclip" size={13} />}
                        <time dateTime={m.date}>{fmtListDate(m.date, getLocale())}</time>
                    </span>
                </span>
            </button>
            <span className="row-actions absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-surface-container-highest/80 p-0.5 backdrop-blur [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex" role="group">
                <IconButton className={quick} icon="archive" label={t('act.archive')} size={15} onClick={() => act('archive', [m.uid])} />
                <IconButton className={quick} icon="trash" label={t('act.delete')} size={15} onClick={() => act('delete', [m.uid])} />
                <IconButton className={quick} icon={m.seen ? 'mail' : 'mailopen'} label={m.seen ? t('act.markUnread') : t('act.markRead')} size={15} onClick={() => act(m.seen ? 'mark_unread' : 'mark_read', [m.uid])} />
                <IconButton className={quick} icon="star" label={m.flagged ? t('act.unstar') : t('act.star')} active={m.flagged} size={15} onClick={() => toggleStar(m)} />
            </span>
        </li>
    );
}

function BulkBar({ uids, folder }) {
    return (
        <div className="bulk-bar flex items-center gap-0.5 rounded-lg bg-accent-soft p-1" role="toolbar">
            <IconButton icon="close" label={t('list.clearSelection')} onClick={() => selectAll(false)} />
            <strong className="ml-1.5 text-label-lg">{t('list.selected', { n: uids.length })}</strong>
            <span className="flex-1" />
            <IconButton icon="mailopen" label={t('act.markRead')} onClick={() => act('mark_read', uids)} />
            <IconButton icon="mail" label={t('act.markUnread')} onClick={() => act('mark_unread', uids)} />
            <IconButton icon="star" label={t('act.star')} onClick={() => act('flag', uids)} />
            <IconButton icon="archive" label={t('act.archive')} onClick={() => act('archive', uids)} />
            <IconButton icon="spam" label={t('act.spam')} onClick={() => act('spam', uids)} />
            <MovePicker folder={folder} onPick={(target) => act('move', uids, { target })} trigger={({ toggle }) => <IconButton icon="folder" label={t('act.moveTo')} onClick={toggle} />} />
            <IconButton icon="trash" label={t('act.delete')} onClick={() => act('delete', uids)} />
        </div>
    );
}

function groups(messages) {
    const labels = { today: t('list.today'), yesterday: t('list.yesterday'), older: t('list.older') };
    const out = [];

    for (const m of messages) {
        const g = dayGroup(m.date, getLocale(), labels);
        const last = out[out.length - 1];

        if (last && last.key === g.key) last.items.push(m);
        else out.push({ ...g, items: [m] });
    }

    return out;
}

export function MessageList() {
    const folderName = useStore((s) => s.folder);
    const folders = useStore((s) => s.folders);
    const messages = useStore((s) => s.messages);
    const selected = useStore((s) => s.selected);
    const current = useStore((s) => s.current);
    const loading = useStore((s) => s.listLoading);
    const error = useStore((s) => s.listError);
    const query = useStore((s) => s.query);
    const filter = useStore((s) => s.filter);
    const page = useStore((s) => s.page);
    const pages = useStore((s) => s.pages);
    const total = useStore((s) => s.total);
    const [text, setText] = useState(query);
    const sentinel = useRef(null);
    const searchInput = useRef(null);
    const debounced = useRef(debounce((value) => search(value), 350));

    const folder = folders.find((f) => f.name === folderName) || { name: folderName, label: folderName, role: null };
    const sentLike = folder.role === 'sent' || folder.role === 'drafts';

    // the query is cleared when another folder opens
    useEffect(() => setText(query), [query]);

    // load the next page when the end of the list comes into view
    useEffect(() => {
        if (!sentinel.current || page >= pages || loading) return undefined;

        const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadList({ append: true }), { rootMargin: '200px' });

        observer.observe(sentinel.current);

        return () => observer.disconnect();
    }, [page, pages, loading, messages.length]);

    useEffect(() => {
        const focusSearch = () => searchInput.current && searchInput.current.focus();

        window.addEventListener('gl:focus-search', focusSearch);

        return () => window.removeEventListener('gl:focus-search', focusSearch);
    }, []);

    const onInput = (e) => {
        setText(e.target.value);
        debounced.current(e.target.value);
    };

    const allSelected = messages.length > 0 && selected.length === messages.length;
    const filtered = query || filter !== 'all';

    return (
        <section className="flex min-h-0 min-w-0 flex-col" aria-label={folderLabel(folder)}>
            <header className="grid gap-3 px-space-lg pb-space-sm pt-space-md">
                <div className="flex items-center gap-3">
                    <IconButton icon="menu" label={t('folders.title')} className="lg:hidden" onClick={() => setState({ sidebarOpen: true })} />
                    <label className="flex min-w-0 max-w-xl flex-1 items-center gap-space-sm rounded-lg bg-surface-container-low px-space-md py-1.5 text-outline transition-colors focus-within:bg-surface-container-lowest focus-within:ring-1 focus-within:ring-outline-variant">
                        <Icon name="search" size={16} />
                        <input ref={searchInput} type="search" className="w-full min-w-0 border-0 bg-transparent text-body-md text-on-surface outline-none [&::-webkit-search-cancel-button]:hidden" placeholder={t('list.search')} value={text} onChange={onInput} onKeyDown={(e) => { if (e.key === 'Enter') { debounced.current.cancel(); search(text); } if (e.key === 'Escape') { e.target.blur(); } }} aria-label={t('list.search')} />
                        {text ? <button type="button" className="grid place-items-center text-secondary hover:text-on-surface" aria-label={t('common.close')} onClick={() => { setText(''); debounced.current.cancel(); search(''); }}><Icon name="close" size={14} /></button> : <kbd className="kbd shrink-0 opacity-70">/</kbd>}
                    </label>
                    <IconButton icon="refresh" label={t('list.refresh')} className="ml-auto" onClick={() => { refreshFolders(); loadList(); }} />
                    <IconButton icon="keyboard" label={t('sc.title')} className="max-sm:hidden" onClick={() => setState({ dialog: { type: 'shortcuts' } })} />
                    <IconButton icon="settings" label={t('common.settings')} onClick={() => setState({ dialog: { type: 'settings', tab: 'general' } })} />
                </div>

                {selected.length ? <BulkBar uids={selected} folder={folderName} /> : (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
                        <div className="flex items-center gap-space-lg">
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-headline-sm">{folderLabel(folder)}</h2>
                                {total > 0 && <span className="text-label-sm text-secondary">{t(total === 1 ? 'list.count1' : 'list.count', { n: total })}</span>}
                            </div>
                            <div className="flex items-center gap-1 rounded-lg bg-surface-container-low p-0.5" role="group">
                                {['all', 'unseen', 'flagged'].map((f) => (
                                    <button type="button" key={f} className={cx('rounded px-space-sm py-1 text-label-sm transition-all', filter === f ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-secondary hover:text-on-surface')} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`list.filter.${f}`)}</button>
                                ))}
                            </div>
                        </div>
                        {messages.length > 0 && <button type="button" className="chip" onClick={() => selectAll(!allSelected)}>{t('list.selectAll')}</button>}
                    </div>
                )}
            </header>

            <div className="@container min-h-0 flex-1 overflow-auto overscroll-contain px-space-sm pb-space-lg sm:px-space-md">
                {error ? <EmptyState icon="warning" title={t('list.error')} hint={error}><button type="button" className="btn" onClick={() => loadList()}>{t('common.retry')}</button></EmptyState> : null}
                {!error && loading && !messages.length ? (
                    <ul className="m-0 list-none p-0" aria-busy="true">
                        {[...Array(8)].map((_, i) => <li key={i} className="flex items-center gap-3 px-3.5 py-3.5"><span className="h-6 w-6 shrink-0 rounded-full bg-surface-container" /><span className="grid flex-1 gap-2"><i className="block h-2.5 w-1/3 animate-pulse rounded bg-surface-container" /><i className="block h-2.5 w-2/3 animate-pulse rounded bg-surface-container" /></span></li>)}
                    </ul>
                ) : null}
                {!error && !loading && !messages.length ? <EmptyState icon={filtered ? 'search' : 'inbox'} title={filtered ? t('list.noresults') : t('list.empty')} hint={filtered ? t('list.noresultsHint') : t('list.emptyHint')} /> : null}
                {groups(messages).map((g) => (
                    <div key={g.key} role="group" aria-label={g.label}>
                        <div className="flex items-center justify-between px-space-md pb-1 pt-space-md text-[11px] font-semibold uppercase tracking-wider text-outline"><span>{g.label}</span></div>
                        <ul className="m-0 grid list-none gap-0.5 p-0">
                            {g.items.map((m) => <Row key={m.uid} m={m} active={!!current && current.uid === m.uid} selected={selected.includes(m.uid)} sentLike={sentLike} />)}
                        </ul>
                    </div>
                ))}
                {page < pages && <div className="grid place-items-center p-4" ref={sentinel}>{loading ? <Spinner /> : <button type="button" className="btn" onClick={() => loadList({ append: true })}>{t('list.loadMore')}</button>}</div>}
            </div>
        </section>
    );
}
