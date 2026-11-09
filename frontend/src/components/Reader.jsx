import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { api } from '../lib/api.js';
import { Avatar, Button, EmptyState, IconButton, MenuItem, Popover, Spinner } from '../ui.jsx';
import { t, getLocale } from '../lib/i18n.js';
import { useStore } from '../lib/store.js';
import { act, closeMessage, folderLabel, mailtoToCompose, markUnread, openCompose, openDialog, openMessage, toggleStar } from '../lib/actions.js';
import { fmtFullDate, fmtSize } from '../lib/util.js';

// Styles injected into every message. The message may override them; the page around it stays light on purpose.
const BASE = `<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
html{color-scheme:light}
body{margin:0;padding:20px 24px 28px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1c1d;background:#fff;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
blockquote{margin:.8em 0;padding-left:1em;border-left:3px solid #d5d7d9;color:#5e5e63}a{color:#2b6fd6}
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

    return <iframe ref={frame} className="message-frame block h-[200px] w-full rounded-xl bg-white" title="Message" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={doc} />;
}

function Attachments({ message }) {
    if (!message.attachments.length) return null;

    return (
        <div className="flex flex-wrap gap-2.5" aria-label={t('reader.attachments')}>
            {message.attachments.map((a) => (
                <div className="attachment flex max-w-[320px] items-center gap-2.5 rounded-xl bg-surface-container-low p-2" key={a.part}>
                    {a.image
                        ? <button type="button" className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-container" onClick={() => openDialog({ type: 'image', url: api.partUrl(message.folder, message.uid, a.part, true), name: a.name })}><img className="h-full w-full object-cover" src={api.partUrl(message.folder, message.uid, a.part, true)} alt="" loading="lazy" /></button>
                        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container text-secondary"><Icon name="file" size={18} /></span>}
                    <span className="grid min-w-0 leading-tight"><strong className="truncate text-label-lg" title={a.name}>{a.name}</strong><small className="text-secondary">{fmtSize(a.size)}</small></span>
                    <a className="icon-btn" href={api.partUrl(message.folder, message.uid, a.part, false)} download={a.name} title={t('reader.download')} aria-label={t('reader.download')}><Icon name="download" size={17} /></a>
                </div>
            ))}
        </div>
    );
}

function Recipients({ label, list }) {
    if (!list.length) return null;

    return (
        <div className="flex gap-2.5">
            <span className="w-16 shrink-0 text-secondary">{label}</span>
            <span>{list.map((a, i) => <span key={a.email}>{i ? ', ' : ''}<span title={a.email}>{a.name || a.email}</span> <small className="text-secondary">{a.name ? `<${a.email}>` : ''}</small></span>)}</span>
        </div>
    );
}

function Header({ message }) {
    const [open, setOpen] = useState(false);
    const identities = useStore((s) => s.session.identities);
    const me = new Set(identities.map((i) => i.email.toLowerCase()));
    const to = message.to.map((a) => (me.has(a.email.toLowerCase()) ? { ...a, name: t('reader.me') } : a));
    const summary = [...to.slice(0, 2).map((a) => a.name || a.email), ...(to.length > 2 ? [`+${to.length - 2}`] : [])].join(', ');

    return (
        <div>
            <h1 className="msg-subject text-headline-lg">
                {message.subject || t('reader.noSubject')}
                {message.draft && <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 align-middle text-label-sm text-secondary">{t('reader.draftBadge')}</span>}
            </h1>
            <div className="mt-4 flex items-center gap-3">
                <Avatar name={message.from.name} email={message.from.email} size={36} />
                <div className="grid min-w-0 flex-1">
                    <div className="truncate"><strong className="font-semibold">{message.from.name || message.from.email}</strong>{message.from.name && <small className="ml-1.5 text-secondary">{`<${message.from.email}>`}</small>}</div>
                    <button type="button" className="inline-flex items-center gap-1 text-left text-body-sm text-secondary hover:text-on-surface" onClick={() => setOpen(!open)} aria-expanded={open}>
                        {t('reader.to')}: {summary || '—'} <Icon name={open ? 'chevrondown' : 'chevron'} size={12} />
                    </button>
                </div>
                <time className="whitespace-nowrap text-body-sm text-secondary" dateTime={message.date} title={fmtFullDate(message.date, getLocale())}>{fmtFullDate(message.date, getLocale())}</time>
            </div>
            {open && (
                <div className="mt-3 grid gap-1.5 rounded-xl bg-surface-container-low p-3.5 text-body-md">
                    <Recipients label={t('reader.from')} list={[message.from]} />
                    <Recipients label={t('reader.to')} list={message.to} />
                    <Recipients label={t('reader.cc')} list={message.cc} />
                    <Recipients label={t('reader.bcc')} list={message.bcc} />
                    <Recipients label={t('reader.replyTo')} list={message.reply_to} />
                </div>
            )}
        </div>
    );
}

function Toolbar({ message, folder }) {
    const isDraft = folder && folder.role === 'drafts';
    const inJunk = folder && folder.role === 'junk';
    const folders = useStore((s) => s.folders);
    const key = [message.uid];

    return (
        <div className="flex min-h-14 items-center gap-0.5 px-3" role="toolbar">
            <IconButton icon="back" label={t('common.back')} className="lg:hidden" onClick={closeMessage} />
            <IconButton icon="close" label={t('common.close')} className="max-lg:hidden" onClick={closeMessage} />
            <span className="mx-1.5 h-5 w-px bg-outline-variant/50" />
            {isDraft
                ? <Button icon="edit" variant="primary" onClick={() => openCompose('draft', message)}>{t('act.edit')}</Button>
                : <>
                    <IconButton icon="reply" label={t('act.reply')} onClick={() => openCompose('reply', message)} />
                    <IconButton icon="replyall" label={t('act.replyall')} onClick={() => openCompose('replyall', message)} />
                    <IconButton icon="forward" label={t('act.forward')} onClick={() => openCompose('forward', message)} />
                </>}
            <span className="mx-1.5 h-5 w-px bg-outline-variant/50" />
            <IconButton icon="archive" label={t('act.archive')} onClick={() => act('archive', key, { folder: message.folder })} />
            <IconButton icon="spam" label={t('act.spam')} disabled={inJunk} onClick={() => act('spam', key, { folder: message.folder })} />
            <IconButton icon="trash" label={t('act.delete')} onClick={() => act('delete', key, { folder: message.folder })} />
            <span className="flex-1" />
            <IconButton icon="star" label={message.flagged ? t('act.unstar') : t('act.star')} active={message.flagged} onClick={() => toggleStar(message)} />
            <Popover trigger={({ toggle }) => <IconButton icon="more" label={t('common.more')} onClick={toggle} />}>
                {(close) => (
                    <>
                        <MenuItem icon="mail" onClick={() => { close(); markUnread(message); }}>{t('act.markUnread')}</MenuItem>
                        <div className="caps px-2.5 pb-1 pt-2 !text-[10px]">{t('act.moveTo')}</div>
                        {folders.filter((f) => f.name !== message.folder).map((f) => <MenuItem key={f.name} icon="folder" onClick={() => { close(); act('move', key, { target: f.name, folder: message.folder }); }}>{folderLabel(f)}</MenuItem>)}
                    </>
                )}
            </Popover>
        </div>
    );
}

export function Reader() {
    const current = useStore((s) => s.current);
    const message = useStore((s) => s.message);
    const loading = useStore((s) => s.messageLoading);
    const error = useStore((s) => s.messageError);
    const folders = useStore((s) => s.folders);

    if (!current) return null;

    const folder = folders.find((f) => f.name === current.folder);

    return (
        <section className="flex min-h-0 min-w-0 flex-col bg-surface-container-lowest max-lg:fixed max-lg:inset-0 max-lg:z-30" aria-label={message ? message.subject : ''}>
            {message ? <Toolbar message={message} folder={folder} /> : <div className="flex min-h-14 items-center px-3"><IconButton icon="back" label={t('common.back')} onClick={closeMessage} /></div>}
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                {loading && <div className="grid place-items-center p-8"><Spinner size={26} /></div>}
                {error && <EmptyState icon="warning" title={t('reader.error')} hint={error}><Button onClick={() => openMessage(current)}>{t('common.retry')}</Button></EmptyState>}
                {message && (
                    <article className="message mx-auto grid max-w-[860px] gap-4 px-7 pb-10 pt-3 max-sm:px-4">
                        <Header message={message} />
                        {message.remote_blocked && (
                            <div className="banner flex items-center gap-3 rounded-xl bg-accent-soft px-3.5 py-2.5"><Icon name="shield" size={17} /><span className="flex-1 text-body-md">{t('reader.remote')}</span><Button onClick={() => openMessage(message, { images: true })}>{t('reader.loadImages')}</Button></div>
                        )}
                        <Attachments message={message} />
                        <MessageFrame source={message.html || ''} />
                        {message.unsubscribe && <p className="text-body-sm text-secondary">{t('reader.unsubscribe')}: <span>{message.unsubscribe.replace(/[<>]/g, '')}</span></p>}
                    </article>
                )}
            </div>
        </section>
    );
}
