import { html, useEffect, useRef, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { Avatar, EmptyState, IconButton, MenuItem, Popover, Spinner } from '../ui.js';
import { t } from '../i18n.js';
import { getState, setState, useStore } from '../store.js';
import { act, folderLabel, loadList, openMessage, refreshFolders, search, selectAll, setFilter, toggleSelected, toggleStar } from '../actions.js';
import { debounce, fmtListDate } from '../util.js';
import { getLocale } from '../i18n.js';

function MovePicker({ folder, onPick, trigger }) {
    const folders = useStore((s) => s.folders);

    return html`<${Popover} align="left" trigger=${trigger}>
        ${(close) => folders.filter((f) => f.name !== folder).map((f) => html`<${MenuItem} key=${f.name} icon="folder" onClick=${() => { close(); onPick(f.name); }}>${folderLabel(f)}<//>`)}
    <//>`;
}

function Row({ m, active, selected, sentLike }) {
    const who = sentLike ? m.to[0] || { name: '', email: '' } : m.from;
    const label = who.name || who.email || '—';

    const open = (e) => {
        if (e.metaKey || e.ctrlKey) return toggleSelected(m.uid, !selected);

        openMessage(m);
    };

    return html`<li class=${`row ${m.seen ? '' : 'unread'} ${active ? 'active' : ''} ${selected ? 'selected' : ''}`} data-uid=${m.uid}>
        <button type="button" class="row-check" aria-label=${selected ? 'Deselect' : 'Select'} aria-pressed=${selected} onClick=${(e) => { e.stopPropagation(); toggleSelected(m.uid, !selected); }}>
            ${selected ? html`<span class="check-on"><${Icon} name="check" size=${16} /></span>` : html`<${Avatar} name=${who.name} email=${who.email} size=${34} />`}
        </button>
        <button type="button" class="row-main" onClick=${open} aria-current=${active ? 'true' : undefined}>
            <span class="row-top">
                <span class="row-from">${sentLike ? `${t('reader.to')}: ` : ''}${label}</span>
                <span class="row-meta">
                    ${m.has_attachments && html`<${Icon} name="paperclip" size=${14} class="muted-icon" />`}
                    <time dateTime=${m.date}>${fmtListDate(m.date, getLocale())}</time>
                </span>
            </span>
            <span class="row-bottom">
                <span class="row-subject">${m.answered ? html`<${Icon} name="reply" size=${13} class="muted-icon" />` : ''}${m.subject || t('reader.noSubject')}</span>
            </span>
        </button>
        <span class="row-actions" role="group">
            <${IconButton} icon="archive" label=${t('act.archive')} size=${16} onClick=${() => act('archive', [m.uid])} />
            <${IconButton} icon="trash" label=${t('act.delete')} size=${16} onClick=${() => act('delete', [m.uid])} />
            <${IconButton} icon=${m.seen ? 'mail' : 'mailopen'} label=${m.seen ? t('act.markUnread') : t('act.markRead')} size=${16} onClick=${() => act(m.seen ? 'mark_unread' : 'mark_read', [m.uid])} />
        </span>
        <button type="button" class=${`row-star ${m.flagged ? 'on' : ''}`} aria-label=${m.flagged ? t('act.unstar') : t('act.star')} aria-pressed=${m.flagged} onClick=${() => toggleStar(m)}>
            <${Icon} name="star" size=${16} filled=${m.flagged} />
        </button>
        ${!m.seen && html`<span class="unread-dot" aria-label="Unread"></span>`}
    </li>`;
}

function BulkBar({ uids, folder }) {
    return html`<div class="list-title bulk" role="toolbar">
        <${IconButton} icon="close" label=${t('list.clearSelection')} onClick=${() => selectAll(false)} />
        <strong>${t('list.selected', { n: uids.length })}</strong>
        <span class="grow"></span>
        <${IconButton} icon="mailopen" label=${t('act.markRead')} onClick=${() => act('mark_read', uids)} />
        <${IconButton} icon="mail" label=${t('act.markUnread')} onClick=${() => act('mark_unread', uids)} />
        <${IconButton} icon="star" label=${t('act.star')} onClick=${() => act('flag', uids)} />
        <${IconButton} icon="archive" label=${t('act.archive')} onClick=${() => act('archive', uids)} />
        <${IconButton} icon="spam" label=${t('act.spam')} onClick=${() => act('spam', uids)} />
        <${MovePicker} folder=${folder} onPick=${(target) => act('move', uids, { target })} trigger=${({ toggle }) => html`<${IconButton} icon="folder" label=${t('act.moveTo')} onClick=${toggle} />`} />
        <${IconButton} icon="trash" label=${t('act.delete')} onClick=${() => act('delete', uids)} />
    </div>`;
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
    const nav = useStore((s) => s.nav);
    const [text, setText] = useState(query);
    const sentinel = useRef(null);
    const searchInput = useRef(null);

    const folder = folders.find((f) => f.name === folderName) || { name: folderName, label: folderName, role: null };
    const sentLike = folder.role === 'sent' || folder.role === 'drafts';
    const debounced = useRef(debounce((value) => search(value), 350));

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

    return html`<section class=${`list-pane ${nav === 'reader' ? 'hide-small' : ''}`} aria-label=${folderLabel(folder)}>
        <header class="list-head">
            ${selected.length ? html`<${BulkBar} uids=${selected} folder=${folderName} />` : html`<div class="list-title">
                <${IconButton} icon="menu" label=${t('folders.title')} class="only-medium" onClick=${() => setState({ sidebarOpen: true })} />
                <h2>${folderLabel(folder)}</h2>
                <span class="muted count">${total ? t(total === 1 ? 'list.count1' : 'list.count', { n: total }) : ''}</span>
                <span class="grow"></span>
                <${IconButton} icon="refresh" label=${t('list.refresh')} onClick=${() => { refreshFolders(); loadList(); }} />
            </div>`}
            <label class="search">
                <${Icon} name="search" size=${16} />
                <input ref=${searchInput} type="search" placeholder=${t('list.search')} value=${text} onInput=${onInput} onKeyDown=${(e) => { if (e.key === 'Enter') { debounced.current.cancel(); search(text); } if (e.key === 'Escape') { e.target.blur(); } }} aria-label=${t('list.search')} />
                ${text && html`<button type="button" class="clear" aria-label=${t('common.close')} onClick=${() => { setText(''); debounced.current.cancel(); search(''); }}><${Icon} name="close" size=${14} /></button>`}
            </label>
            <div class="chips" role="group">
                ${['all', 'unseen', 'flagged'].map((f) => html`<button type="button" key=${f} class=${`chip ${filter === f ? 'on' : ''}`} aria-pressed=${filter === f} onClick=${() => setFilter(f)}>${t(`list.filter.${f}`)}</button>`)}
                <span class="grow"></span>
                ${messages.length > 0 && html`<button type="button" class="chip ghost" onClick=${() => selectAll(!allSelected)}>${t('list.selectAll')}</button>`}
            </div>
        </header>
        <div class="list-scroll">
            ${error ? html`<${EmptyState} icon="warning" title=${t('list.error')} hint=${error}><button type="button" class="btn" onClick=${() => loadList()}>${t('common.retry')}</button><//>` : null}
            ${!error && loading && !messages.length ? html`<ul class="rows skeleton" aria-busy="true">${[...Array(8)].map((_, i) => html`<li key=${i} class="row"><span class="sk-avatar"></span><span class="sk-lines"><i></i><i></i></span></li>`)}</ul>` : null}
            ${!error && !loading && !messages.length ? html`<${EmptyState} icon=${query || filter !== 'all' ? 'search' : 'inbox'} title=${query || filter !== 'all' ? t('list.noresults') : t('list.empty')} hint=${query || filter !== 'all' ? t('list.noresultsHint') : t('list.emptyHint')} />` : null}
            ${messages.length > 0 && html`<ul class="rows">${messages.map((m) => html`<${Row} key=${m.uid} m=${m} active=${!!current && current.uid === m.uid} selected=${selected.includes(m.uid)} sentLike=${sentLike} />`)}</ul>`}
            ${page < pages && html`<div class="load-more" ref=${sentinel}>${loading ? html`<${Spinner} />` : html`<button type="button" class="btn" onClick=${() => loadList({ append: true })}>${t('list.loadMore')}</button>`}</div>`}
        </div>
    </section>`;
}
