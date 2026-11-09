import { html, useEffect, useRef, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { api } from '../api.js';
import { Avatar, Button, EmptyState, IconButton, MenuItem, Popover, Spinner } from '../ui.js';
import { t, getLocale } from '../i18n.js';
import { setState, useStore } from '../store.js';
import { act, closeMessage, folderLabel, mailtoToCompose, markUnread, openCompose, openDialog, openMessage, toggleStar } from '../actions.js';
import { fmtFullDate, fmtSize } from '../util.js';

// Styles injected into every message. The message may override them; the page around it stays light on purpose.
const BASE = `<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
html{color-scheme:light}
body{margin:0;padding:20px 24px 28px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1b2233;background:#fff;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
blockquote{margin:.8em 0;padding-left:1em;border-left:3px solid #d5dbe8;color:#55607a}a{color:#2f5bff}
</style>`;

function frameDocument(source) {
    if (/<head[^>]*>/i.test(source)) return source.replace(/<head[^>]*>/i, (m) => m + BASE);

    return `<!doctype html><html><head><meta charset="utf-8">${BASE}</head><body>${source}</body></html>`;
}

/**
 * The message body in a sandboxed frame: no scripts can run (the server also removes them),
 * same-origin only so that the height can follow the content.
 */
function MessageFrame({ source }) {
    const frame = useRef(null);
    const doc = frameDocument(source);

    useEffect(() => {
        const el = frame.current;
        let observer;

        const fit = () => {
            const d = el.contentDocument;

            if (d && d.documentElement) el.style.height = `${Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0)}px`;
        };

        const onLoad = () => {
            const d = el.contentDocument;

            if (!d) return;

            fit();
            observer = new ResizeObserver(fit);
            observer.observe(d.documentElement);
            d.addEventListener('click', (e) => {
                const a = e.target.closest && e.target.closest('a[href]');

                if (a && /^mailto:/i.test(a.getAttribute('href'))) {
                    e.preventDefault();
                    mailtoToCompose(a.getAttribute('href'));
                }
            });
        };

        el.addEventListener('load', onLoad);

        return () => {
            el.removeEventListener('load', onLoad);
            observer && observer.disconnect();
        };
    }, [source]);

    return html`<iframe ref=${frame} class="message-frame" title="Message" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc=${doc}></iframe>`;
}

const fileIcon = (a) => (a.image ? 'image' : 'file');

function Attachments({ message }) {
    if (!message.attachments.length) return null;

    return html`<div class="attachments" aria-label=${t('reader.attachments')}>
        ${message.attachments.map((a) => html`<div class="attachment" key=${a.part}>
            ${a.image
                ? html`<button type="button" class="att-thumb" onClick=${() => openDialog({ type: 'image', url: api.partUrl(message.folder, message.uid, a.part, true), name: a.name })}><img src=${api.partUrl(message.folder, message.uid, a.part, true)} alt="" loading="lazy" /></button>`
                : html`<span class="att-icon"><${Icon} name=${fileIcon(a)} size=${20} /></span>`}
            <span class="att-text"><strong title=${a.name}>${a.name}</strong><small>${fmtSize(a.size)}</small></span>
            <a class="icon-btn" href=${api.partUrl(message.folder, message.uid, a.part, false)} download=${a.name} title=${t('reader.download')} aria-label=${t('reader.download')}><${Icon} name="download" size=${18} /></a>
        </div>`)}
    </div>`;
}

function Recipients({ label, list }) {
    if (!list.length) return null;

    return html`<div class="rcpt"><span class="rcpt-label">${label}</span><span>${list.map((a, i) => html`<span key=${a.email}>${i ? ', ' : ''}<span title=${a.email}>${a.name || a.email}</span> <small class="muted">${a.name ? `<${a.email}>` : ''}</small></span>`)}</span></div>`;
}

function Header({ message }) {
    const [open, setOpen] = useState(false);
    const identities = useStore((s) => s.session.identities);
    const me = new Set(identities.map((i) => i.email.toLowerCase()));
    const to = message.to.map((a) => (me.has(a.email.toLowerCase()) ? { ...a, name: t('reader.me') } : a));
    const summary = [...to.slice(0, 2).map((a) => a.name || a.email), ...(to.length > 2 ? [`+${to.length - 2}`] : [])].join(', ');

    return html`<div class="msg-head">
        <h1 class="msg-subject">${message.subject || t('reader.noSubject')}${message.draft && html` <span class="badge quiet">${t('reader.draftBadge')}</span>`}</h1>
        <div class="msg-from">
            <${Avatar} name=${message.from.name} email=${message.from.email} size=${42} />
            <div class="msg-from-text">
                <div class="msg-sender"><strong>${message.from.name || message.from.email}</strong>${message.from.name && html` <small class="muted">${`<${message.from.email}>`}</small>`}</div>
                <button type="button" class="link-btn" onClick=${() => setOpen(!open)} aria-expanded=${open}>${t('reader.to')}: ${summary || '—'} <${Icon} name=${open ? 'chevrondown' : 'chevron'} size=${12} /></button>
            </div>
            <time class="msg-date muted" dateTime=${message.date} title=${fmtFullDate(message.date, getLocale())}>${fmtFullDate(message.date, getLocale())}</time>
        </div>
        ${open && html`<div class="msg-details">
            <${Recipients} label=${t('reader.from')} list=${[message.from]} />
            <${Recipients} label=${t('reader.to')} list=${message.to} />
            <${Recipients} label=${t('reader.cc')} list=${message.cc} />
            <${Recipients} label=${t('reader.bcc')} list=${message.bcc} />
            <${Recipients} label=${t('reader.replyTo')} list=${message.reply_to} />
        </div>`}
    </div>`;
}

function Toolbar({ message, folder }) {
    const isDraft = folder && folder.role === 'drafts';
    const inJunk = folder && folder.role === 'junk';
    const folders = useStore((s) => s.folders);
    const key = [message.uid];

    return html`<div class="reader-bar" role="toolbar">
        <${IconButton} icon="back" label=${t('common.back')} class="only-small" onClick=${closeMessage} />
        ${isDraft
            ? html`<${Button} icon="edit" variant="primary" onClick=${() => openCompose('draft', message)}>${t('act.edit')}<//>`
            : html`<${IconButton} icon="reply" label=${t('act.reply')} onClick=${() => openCompose('reply', message)} />
                   <${IconButton} icon="replyall" label=${t('act.replyall')} onClick=${() => openCompose('replyall', message)} />
                   <${IconButton} icon="forward" label=${t('act.forward')} onClick=${() => openCompose('forward', message)} />`}
        <span class="bar-sep"></span>
        <${IconButton} icon="archive" label=${t('act.archive')} onClick=${() => act('archive', key, { folder: message.folder })} />
        <${IconButton} icon="spam" label=${t('act.spam')} disabled=${inJunk} onClick=${() => act('spam', key, { folder: message.folder })} />
        <${IconButton} icon="trash" label=${t('act.delete')} onClick=${() => act('delete', key, { folder: message.folder })} />
        <span class="grow"></span>
        <${IconButton} icon="star" label=${message.flagged ? t('act.unstar') : t('act.star')} active=${message.flagged} onClick=${() => toggleStar(message)} />
        <${Popover} trigger=${({ toggle }) => html`<${IconButton} icon="more" label=${t('common.more')} onClick=${toggle} />`}>
            ${(close) => html`
                <${MenuItem} icon="mail" onClick=${() => { close(); markUnread(message); }}>${t('act.markUnread')}<//>
                <div class="menu-label">${t('act.moveTo')}</div>
                ${folders.filter((f) => f.name !== message.folder).map((f) => html`<${MenuItem} key=${f.name} icon="folder" onClick=${() => { close(); act('move', key, { target: f.name, folder: message.folder }); }}>${folderLabel(f)}<//>`)}
            `}
        <//>
    </div>`;
}

export function Reader() {
    const current = useStore((s) => s.current);
    const message = useStore((s) => s.message);
    const loading = useStore((s) => s.messageLoading);
    const error = useStore((s) => s.messageError);
    const nav = useStore((s) => s.nav);
    const folders = useStore((s) => s.folders);

    if (!current) {
        return html`<section class="reader empty-pane hide-small" aria-live="polite"><${EmptyState} icon="mailopen" title=${t('reader.select')} hint=${t('reader.selectHint')} /></section>`;
    }

    const folder = folders.find((f) => f.name === current.folder);

    return html`<section class=${`reader ${nav === 'list' ? 'hide-small' : ''}`} aria-label=${message ? message.subject : ''}>
        ${message ? html`<${Toolbar} message=${message} folder=${folder} />` : html`<div class="reader-bar"><${IconButton} icon="back" label=${t('common.back')} class="only-small" onClick=${closeMessage} /></div>`}
        <div class="reader-scroll">
            ${loading && html`<div class="center pad"><${Spinner} size=${28} /></div>`}
            ${error && html`<${EmptyState} icon="warning" title=${t('reader.error')} hint=${error}><${Button} onClick=${() => openMessage(current)}>${t('common.retry')}<//><//>`}
            ${message && html`
                <article class="message">
                    <${Header} message=${message} />
                    ${message.remote_blocked && html`<div class="banner"><${Icon} name="shield" size=${18} /><span>${t('reader.remote')}</span><${Button} onClick=${() => openMessage(message, { images: true })}>${t('reader.loadImages')}<//></div>`}
                    <${Attachments} message=${message} />
                    <${MessageFrame} source=${message.html || ''} />
                    ${message.unsubscribe && html`<p class="muted small">${t('reader.unsubscribe')}: <span>${message.unsubscribe.replace(/[<>]/g, '')}</span></p>`}
                </article>
            `}
        </div>
    </section>`;
}
