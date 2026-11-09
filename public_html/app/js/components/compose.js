import { html, useEffect, useRef, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { api } from '../api.js';
import { Button, IconButton, Spinner } from '../ui.js';
import { t } from '../i18n.js';
import { useStore } from '../store.js';
import { closeCompose, discardCompose, readEditor, registerEditor, saveDraft, sendCompose, updateCompose } from '../actions.js';
import { debounce, escapeHtml, fmtSize, isEmail, parseAddress, splitAddresses } from '../util.js';

// ---- recipients with autocomplete ------------------------------------------------

function RecipientField({ label, value, onChange, autofocus }) {
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

    return html`<div class="rcpt-field" onClick=${() => input.current && input.current.focus()}>
        <span class="rcpt-label">${label}</span>
        <div class="rcpt-chips">
            ${value.map((a, i) => html`<span key=${a.email} class=${`chip addr ${isEmail(a.email) ? '' : 'invalid'}`} title=${a.email}>
                ${a.name || a.email}
                <button type="button" aria-label=${t('common.remove')} onClick=${(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}><${Icon} name="close" size=${12} /></button>
            </span>`)}
            <input ref=${input} type="text" class="rcpt-input" autocomplete="off" spellcheck="false" autofocus=${autofocus} aria-label=${label} value=${text}
                onInput=${(e) => { setText(e.target.value); lookup(e.target.value); }}
                onKeyDown=${onKeyDown}
                onBlur=${() => setTimeout(() => commit(), 120)}
                onPaste=${(e) => { const pasted = e.clipboardData.getData('text'); if (/[,;\n]/.test(pasted)) { e.preventDefault(); commit(text + pasted); } }} />
            ${suggestions.length > 0 && html`<ul class="suggest" role="listbox">${suggestions.map((s, i) => html`<li key=${s.email} role="option" aria-selected=${i === index} class=${i === index ? 'on' : ''} onMouseDown=${(e) => { e.preventDefault(); pick(s); }}>
                <strong>${s.name || s.email}</strong>${s.name && html`<small>${s.email}</small>`}
            </li>`)}</ul>`}
        </div>
    </div>`;
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

    if (!rich) return html`<textarea ref=${ref} class="editor plain" aria-label=${t('compose.message')} onInput=${onInput} onPaste=${onPaste}></textarea>`;

    return html`<div class="editor-wrap">
        <div class="format-bar" role="toolbar" aria-label=${t('compose.rich')}>
            <${IconButton} icon="bold" label=${t('compose.bold')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('bold')} />
            <${IconButton} icon="italic" label=${t('compose.italic')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('italic')} />
            <${IconButton} icon="underline" label=${t('compose.underline')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('underline')} />
            <span class="bar-sep"></span>
            <${IconButton} icon="list" label=${t('compose.list')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('insertUnorderedList')} />
            <${IconButton} icon="listordered" label=${t('compose.olist')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('insertOrderedList')} />
            <${IconButton} icon="quote" label=${t('compose.quote')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('formatBlock', 'blockquote')} />
            <${IconButton} icon="link" label=${t('compose.link')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${link} />
            <${IconButton} icon="eraser" label=${t('compose.clear')} size=${16} onMouseDown=${(e) => e.preventDefault()} onClick=${() => run('removeFormat')} />
        </div>
        <div ref=${ref} class="editor rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label=${t('compose.message')} spellcheck="true" onInput=${onInput} onPaste=${onPaste}></div>
    </div>`;
}

// ---- window ----------------------------------------------------------------------

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
    const offset = (count - 1 - index) * 8;

    return html`<section class=${`compose ${c.minimized ? 'min' : ''} ${c.maximized ? 'max' : ''} ${dragging ? 'drag' : ''}`} data-compose=${c.id} style=${c.maximized ? '' : `--slot:${count - 1 - index}`} aria-label=${t('compose.title')}
        onDragOver=${(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave=${(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop=${(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}
        onKeyDown=${(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendCompose(c.id); } }}>
        <header class="compose-head" onClick=${() => c.minimized && updateCompose(c.id, { minimized: false })}>
            <strong class="compose-title">${title}</strong>
            <${IconButton} icon="minimize" label=${c.minimized ? t('compose.restore') : t('compose.minimize')} size=${16} onClick=${(e) => { e.stopPropagation(); updateCompose(c.id, { minimized: !c.minimized }); }} />
            <${IconButton} icon="expand" label=${t('compose.maximize')} size=${16} class="hide-small" onClick=${(e) => { e.stopPropagation(); updateCompose(c.id, { maximized: !c.maximized, minimized: false }); }} />
            <${IconButton} icon="close" label=${t('common.close')} size=${16} onClick=${(e) => { e.stopPropagation(); close(); }} />
        </header>
        <div class="compose-body" hidden=${c.minimized}>
            ${c.error && html`<div class="alert error" role="alert">${c.error}</div>`}
            ${identities.length > 1 && html`<label class="rcpt-field"><span class="rcpt-label">${t('compose.from')}</span>
                <select class="plain-select" value=${c.identityId} onChange=${(e) => patch({ identityId: Number(e.target.value) })}>${identities.map((i) => html`<option key=${i.id} value=${i.id}>${i.name ? `${i.name} <${i.email}>` : i.email}</option>`)}</select></label>`}
            <${RecipientField} label=${t('compose.to')} value=${c.to} onChange=${(to) => patch({ to })} autofocus=${!c.to.length} />
            <button type="button" class="link-btn cc-toggle" hidden=${showCc} onClick=${() => setShowCc(true)}>${t('compose.showCc')}</button>
            ${showCc && html`<${RecipientField} label=${t('compose.cc')} value=${c.cc} onChange=${(cc) => patch({ cc })} />
                             <${RecipientField} label=${t('compose.bcc')} value=${c.bcc} onChange=${(bcc) => patch({ bcc })} />`}
            <label class="rcpt-field"><span class="rcpt-label">${t('compose.subject')}</span><input type="text" class="subject-input" value=${c.subject} onInput=${(e) => patch({ subject: e.target.value })} /></label>

            <${Editor} key=${`${c.id}-${c.html}`} c=${c} onInput=${onInput} onFiles=${addFiles} />

            ${(c.attachments.length > 0 || c.forwardAttachments.length > 0) && html`<div class="compose-atts">
                ${c.forwardAttachments.map((a) => html`<span class="chip file" key=${`f${a.part}`}><${Icon} name="paperclip" size=${13} /> ${a.name} <small>${fmtSize(a.size)}</small>
                    <button type="button" aria-label=${t('common.remove')} onClick=${() => patch({ forwardAttachments: c.forwardAttachments.filter((x) => x !== a) })}><${Icon} name="close" size=${12} /></button></span>`)}
                ${c.attachments.map((f, i) => html`<span class="chip file" key=${`n${i}`}><${Icon} name="paperclip" size=${13} /> ${f.name} <small>${fmtSize(f.size)}</small>
                    <button type="button" aria-label=${t('common.remove')} onClick=${() => patch({ attachments: c.attachments.filter((_, j) => j !== i) })}><${Icon} name="close" size=${12} /></button></span>`)}
            </div>`}

            ${c.sending && c.progress > 0 && html`<div class="progress" role="progressbar" aria-valuenow=${Math.round(c.progress * 100)}><span style=${`width:${c.progress * 100}%`}></span></div>`}

            <footer class="compose-foot">
                <${Button} variant="primary" icon="send" onClick=${() => sendCompose(c.id)} busy=${c.sending} title=${t('compose.shortcut')}>${c.sending ? t('compose.sending') : t('compose.send')}<//>
                <input ref=${fileInput} type="file" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
                <${IconButton} icon="paperclip" label=${t('compose.attach')} onClick=${() => fileInput.current.click()} />
                <button type="button" class="link-btn" onClick=${switchFormat}>${c.html ? t('compose.plain') : t('compose.rich')}</button>
                <span class="grow"></span>
                <span class="muted small" aria-live="polite">${c.saving ? t('compose.saving') : c.savedAt && !c.dirty ? t('compose.saved') : ''}</span>
                <${IconButton} icon="trash" label=${t('compose.discard')} onClick=${discard} />
            </footer>
        </div>
        ${dragging && html`<div class="drop-hint"><${Icon} name="paperclip" size=${28} /><strong>${t('compose.dropFiles')}</strong></div>`}
    </section>`;
}

export function ComposeWindows() {
    const windows = useStore((s) => s.compose);

    return html`<div class="compose-layer">${windows.map((c, i) => html`<${ComposeWindow} key=${c.id} c=${c} index=${i} count=${windows.length} />`)}</div>`;
}
