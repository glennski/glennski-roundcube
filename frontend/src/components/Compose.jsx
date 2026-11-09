import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { api } from '../lib/api.js';
import { Button, IconButton, cx } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { useStore } from '../lib/store.js';
import { closeCompose, discardCompose, readEditor, registerEditor, saveDraft, sendCompose, updateCompose } from '../lib/actions.js';
import { debounce, escapeHtml, fmtSize, isEmail, parseAddress, splitAddresses } from '../lib/util.js';

const rowClass = 'relative flex items-start gap-2 border-b border-outline-variant/30 px-4 py-1';
const labelClass = 'min-w-[54px] pt-[7px] text-label-md text-secondary';
const bare = 'min-w-[120px] flex-1 border-0 bg-transparent py-1.5 text-body-md text-on-surface outline-none';

// ---- recipients with autocomplete ------------------------------------------------

function RecipientField({ label, value, onChange, autoFocus, extra }) {
    const [text, setText] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [index, setIndex] = useState(0);
    const input = useRef(null);
    const latest = useRef(value);

    latest.current = value;

    const lookup = useRef(debounce(async (q) => {
        if (q.trim().length < 2) return setSuggestions([]);

        try {
            const r = await api.suggest(q.trim());

            setSuggestions(r.suggestions.filter((s) => !latest.current.some((v) => v.email.toLowerCase() === s.email.toLowerCase())));
            setIndex(0);
        } catch (e) { setSuggestions([]); }
    }, 180)).current;

    const add = (entries) => {
        const known = new Set(latest.current.map((a) => a.email.toLowerCase()));
        const fresh = entries.filter((a) => a.email && !known.has(a.email.toLowerCase()));

        if (fresh.length) onChange([...latest.current, ...fresh]);
    };

    const commit = (raw = text) => {
        const parts = splitAddresses(raw);

        if (parts.length) add(parts.map(parseAddress));
        setText('');
        setSuggestions([]);
        lookup.cancel();
    };

    const pick = (s) => {
        add([s]);
        setText('');
        setSuggestions([]);
        input.current && input.current.focus();
    };

    const onKeyDown = (e) => {
        if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
            if (suggestions.length && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                pick(suggestions[index]);
            } else if (text.trim()) {
                e.preventDefault();
                commit();
            }
        } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
        } else if (e.key === 'Escape' && suggestions.length) {
            e.stopPropagation();
            setSuggestions([]);
        }
    };

    return (
        <div className={`rcpt-field ${rowClass}`} onClick={() => input.current && input.current.focus()}>
            <span className={labelClass}>{label}</span>
            <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
                {value.map((a, i) => (
                    <span key={a.email} className={cx('chip-addr inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-label-md', isEmail(a.email) ? 'bg-surface-container text-on-surface' : 'bg-error-container text-on-error-container')} title={a.email}>
                        {a.name || a.email}
                        <button type="button" className="grid h-4 w-4 place-items-center rounded-full opacity-70 hover:bg-black/10 hover:opacity-100" aria-label={t('common.remove')} onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}><Icon name="close" size={11} /></button>
                    </span>
                ))}
                <input
                    ref={input} type="text" className={bare} autoComplete="off" spellCheck="false" autoFocus={autoFocus} aria-label={label} value={text}
                    onChange={(e) => { setText(e.target.value); lookup(e.target.value); }}
                    onKeyDown={onKeyDown}
                    onBlur={() => setTimeout(() => commit(), 120)}
                    onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (/[,;\n]/.test(pasted)) { e.preventDefault(); commit(text + pasted); } }}
                />
                {suggestions.length > 0 && (
                    <ul className="suggest absolute left-0 top-full z-30 m-0 mt-1 min-w-[280px] max-w-full list-none rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-1.5 shadow-pop" role="listbox">
                        {suggestions.map((s, i) => (
                            <li key={s.email} role="option" aria-selected={i === index} className={cx('grid cursor-pointer rounded-lg px-2.5 py-1.5 leading-tight', i === index && 'bg-surface-container-high')} onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
                                <strong className="font-medium">{s.name || s.email}</strong>{s.name && <small className="text-secondary">{s.email}</small>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {extra}
        </div>
    );
}

// ---- editor ----------------------------------------------------------------------

function Editor({ c, onInput, onFiles }) {
    const ref = useRef(null);
    const { id, html: rich, body } = c;
    const focus = c.to.length > 0;

    // The content is owned by the editor element; the store only keeps the initial value.
    useEffect(() => {
        const el = ref.current;

        if (rich) el.innerHTML = body;
        else el.value = body;

        const unregister = registerEditor(id, () => (rich ? { html: el.innerHTML, text: el.innerText } : { html: '', text: el.value }));

        // replies and drafts start in the text (cursor at the top); new messages start in the To field
        if (!focus) return unregister;

        el.focus();
        if (rich) {
            const range = document.createRange();

            range.setStart(el, 0);
            range.collapse(true);
            const selection = window.getSelection();

            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            el.setSelectionRange(0, 0);
        }

        return unregister;
    }, [id, rich]);

    const run = (command, value) => {
        ref.current.focus();
        document.execCommand(command, false, value);
        onInput();
    };

    const link = () => {
        const url = window.prompt(t('compose.linkPrompt'), 'https://');

        if (url && /^(https?:|mailto:)/i.test(url)) run('createLink', url);
    };

    const onPaste = (e) => {
        const files = [...(e.clipboardData.files || [])];

        if (files.length) {
            e.preventDefault();
            onFiles(files);
        }
    };

    const area = 'editor min-h-[140px] w-full flex-1 resize-none overflow-auto border-0 bg-transparent px-4 py-3.5 leading-relaxed text-on-surface outline-none';

    if (!rich) return <textarea ref={ref} className={`${area} plain`} aria-label={t('compose.message')} onChange={onInput} onPaste={onPaste} />;

    const fmt = (icon, label, fn) => <IconButton icon={icon} label={label} size={15} className="!h-7 !w-7" onMouseDown={(e) => e.preventDefault()} onClick={fn} />;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-0.5 px-3 py-1" role="toolbar" aria-label={t('compose.rich')}>
                {fmt('bold', t('compose.bold'), () => run('bold'))}
                {fmt('italic', t('compose.italic'), () => run('italic'))}
                {fmt('underline', t('compose.underline'), () => run('underline'))}
                <span className="mx-1 h-4 w-px bg-outline-variant/50" />
                {fmt('list', t('compose.list'), () => run('insertUnorderedList'))}
                {fmt('listordered', t('compose.olist'), () => run('insertOrderedList'))}
                {fmt('quote', t('compose.quote'), () => run('formatBlock', 'blockquote'))}
                {fmt('link', t('compose.link'), link)}
                {fmt('eraser', t('compose.clear'), () => run('removeFormat'))}
            </div>
            <div ref={ref} className={`${area} rich`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={t('compose.message')} spellCheck="true" onInput={onInput} onPaste={onPaste} />
        </div>
    );
}

// ---- window ----------------------------------------------------------------------

function FileChip({ name, size, onRemove }) {
    return (
        <span className="chip-file inline-flex items-center gap-1.5 rounded-full bg-surface-container py-1 pl-2.5 pr-1 text-label-md">
            <Icon name="paperclip" size={12} /> {name} <small className="text-secondary">{fmtSize(size)}</small>
            <button type="button" className="grid h-4 w-4 place-items-center rounded-full opacity-70 hover:bg-black/10 hover:opacity-100" aria-label={t('common.remove')} onClick={onRemove}><Icon name="close" size={11} /></button>
        </span>
    );
}

function ComposeWindow({ c, index, count }) {
    const identities = useStore((s) => s.session.identities);
    const [dragging, setDragging] = useState(false);
    const [showCc, setShowCc] = useState(c.cc.length > 0 || c.bcc.length > 0);
    const fileInput = useRef(null);

    const patch = (p) => updateCompose(c.id, { ...p, dirty: true });
    const onInput = () => !c.dirty && updateCompose(c.id, { dirty: true });

    // autosave a draft while the user is writing
    useEffect(() => {
        const timer = setInterval(() => c.dirty && !c.sending && !c.saving && saveDraft(c.id, { silent: true }), 25000);

        return () => clearInterval(timer);
    }, [c.id, c.dirty, c.sending, c.saving]);

    const addFiles = (files) => files.length && patch({ attachments: [...c.attachments, ...files] });

    const close = async () => {
        if (c.dirty && !c.sending) await saveDraft(c.id, { silent: true });
        closeCompose(c.id);
    };

    const discard = () => {
        if (window.confirm(t('compose.confirmDiscard'))) discardCompose(c.id);
    };

    // rich -> plain keeps the text, plain -> rich turns line breaks into <br>
    const switchFormat = () => {
        const typed = readEditor(c.id);

        updateCompose(c.id, { html: !c.html, body: c.html ? typed.text : escapeHtml(typed.text).replace(/\r?\n/g, '<br>'), dirty: true });
    };

    const title = c.subject || ({ reply: t('compose.titleReply'), replyall: t('compose.titleReply'), forward: t('compose.titleForward'), draft: t('compose.titleDraft') }[c.kind] || t('compose.title'));
    const head = 'text-secondary hover:text-on-surface';

    return (
        <section
            className={cx('compose pointer-events-auto absolute flex flex-col bg-surface-container-lowest shadow-modal',
                c.maximized ? 'inset-[5vh_8vw] rounded-2xl' : 'bottom-0 right-[calc(24px+var(--slot,0)*572px)] w-[min(560px,calc(100vw-32px))] rounded-t-2xl max-lg:right-[calc(12px+var(--slot,0)*12px)]',
                !c.maximized && (c.minimized ? 'h-auto' : 'h-[min(660px,calc(100dvh-60px))]'),
                'max-sm:!inset-0 max-sm:!w-auto max-sm:!rounded-none max-sm:!h-auto', c.minimized && 'max-sm:!top-auto',
                index !== count - 1 && 'max-sm:hidden', dragging && 'outline-dashed outline-2 -outline-offset-6 outline-accent')}
            data-compose={c.id} style={c.maximized ? undefined : { '--slot': count - 1 - index }} aria-label={t('compose.title')}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendCompose(c.id); } }}
        >
            <header className={cx('flex items-center gap-0.5 rounded-t-2xl bg-surface-container-low py-1.5 pl-4 pr-1.5', c.minimized && 'cursor-pointer')} onClick={() => c.minimized && updateCompose(c.id, { minimized: false })}>
                <strong className="min-w-0 flex-1 truncate text-label-lg">{title}</strong>
                <IconButton icon="minimize" className={head} label={c.minimized ? t('compose.restore') : t('compose.minimize')} size={15} onClick={(e) => { e.stopPropagation(); updateCompose(c.id, { minimized: !c.minimized }); }} />
                <IconButton icon="expand" className={cx(head, 'max-sm:hidden')} label={t('compose.maximize')} size={15} onClick={(e) => { e.stopPropagation(); updateCompose(c.id, { maximized: !c.maximized, minimized: false }); }} />
                <IconButton icon="close" className={head} label={t('common.close')} size={15} onClick={(e) => { e.stopPropagation(); close(); }} />
            </header>
            <div className="flex min-h-0 flex-1 flex-col" hidden={c.minimized}>
                {c.error && <div className="alert-error m-3 mb-0" role="alert">{c.error}</div>}
                {identities.length > 1 && (
                    <label className={rowClass}><span className={labelClass}>{t('compose.from')}</span>
                        <select className={bare} value={c.identityId} onChange={(e) => patch({ identityId: Number(e.target.value) })}>{identities.map((i) => <option key={i.id} value={i.id}>{i.name ? `${i.name} <${i.email}>` : i.email}</option>)}</select>
                    </label>
                )}
                <RecipientField label={t('compose.to')} value={c.to} onChange={(to) => patch({ to })} autoFocus={!c.to.length}
                    extra={!showCc && <button type="button" className="cc-toggle mt-2 self-start whitespace-nowrap text-body-sm text-secondary hover:text-on-surface" onClick={(e) => { e.stopPropagation(); setShowCc(true); }}>{t('compose.showCc')}</button>} />
                {showCc && <>
                    <RecipientField label={t('compose.cc')} value={c.cc} onChange={(cc) => patch({ cc })} />
                    <RecipientField label={t('compose.bcc')} value={c.bcc} onChange={(bcc) => patch({ bcc })} />
                </>}
                <label className={rowClass}><span className={labelClass}>{t('compose.subject')}</span><input type="text" className={`subject-input ${bare}`} value={c.subject} onChange={(e) => patch({ subject: e.target.value })} /></label>

                <Editor key={`${c.id}-${c.html}`} c={c} onInput={onInput} onFiles={addFiles} />

                {(c.attachments.length > 0 || c.forwardAttachments.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 px-3 py-2">
                        {c.forwardAttachments.map((a) => <FileChip key={`f${a.part}`} name={a.name} size={a.size} onRemove={() => patch({ forwardAttachments: c.forwardAttachments.filter((x) => x !== a) })} />)}
                        {c.attachments.map((f, i) => <FileChip key={`n${i}`} name={f.name} size={f.size} onRemove={() => patch({ attachments: c.attachments.filter((_, j) => j !== i) })} />)}
                    </div>
                )}

                {c.sending && c.progress > 0 && <div className="h-[3px] bg-surface-container" role="progressbar" aria-valuenow={Math.round(c.progress * 100)}><span className="block h-full bg-primary transition-[width]" style={{ width: `${c.progress * 100}%` }} /></div>}

                <footer className="flex items-center gap-2 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
                    <Button variant="primary" icon="send" onClick={() => sendCompose(c.id)} busy={c.sending} title={t('compose.shortcut')}>{c.sending ? t('compose.sending') : t('compose.send')}</Button>
                    <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
                    <IconButton icon="paperclip" label={t('compose.attach')} onClick={() => fileInput.current.click()} />
                    <button type="button" className="text-body-sm text-secondary hover:text-on-surface" onClick={switchFormat}>{c.html ? t('compose.plain') : t('compose.rich')}</button>
                    <span className="flex-1" />
                    <span className="text-body-sm text-secondary" aria-live="polite">{c.saving ? t('compose.saving') : c.savedAt && !c.dirty ? t('compose.saved') : ''}</span>
                    <IconButton icon="trash" label={t('compose.discard')} onClick={discard} />
                </footer>
            </div>
            {dragging && <div className="pointer-events-none absolute inset-0 grid place-content-center justify-items-center gap-2 rounded-[inherit] bg-surface-container-lowest/90 text-accent"><Icon name="paperclip" size={26} /><strong>{t('compose.dropFiles')}</strong></div>}
        </section>
    );
}

export function ComposeWindows() {
    const windows = useStore((s) => s.compose);

    return <div className="pointer-events-none fixed inset-0 z-40">{windows.map((c, i) => <ComposeWindow key={c.id} c={c} index={i} count={windows.length} />)}</div>;
}
