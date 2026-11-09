// Shared building blocks: avatar, buttons, popover menu, modal, toasts.

import { html, useEffect, useRef, useState } from './vendor/htm-preact.mjs';
import { Icon } from './icons.js';
import { colorFor, initials } from './util.js';
import { dismissToast } from './actions.js';
import { useStore } from './store.js';
import { t } from './i18n.js';

export function Avatar({ name, email, size = 36 }) {
    return html`<span class="avatar" style=${`width:${size}px;height:${size}px;background:${colorFor(email || name)};font-size:${Math.round(size * 0.38)}px`} aria-hidden="true">${initials(name, email)}</span>`;
}

export function IconButton({ icon, label, onClick, active, disabled, class: cls = '', size = 18, ...rest }) {
    return html`<button type="button" class=${`icon-btn ${active ? 'active' : ''} ${cls}`} title=${label} aria-label=${label} onClick=${onClick} disabled=${disabled} ...${rest}><${Icon} name=${icon} size=${size} /></button>`;
}

export function Button({ children, variant = 'default', icon, busy, class: cls = '', ...rest }) {
    return html`<button type="button" class=${`btn ${variant} ${cls}`} disabled=${busy || rest.disabled} ...${rest}>${icon && html`<${Icon} name=${icon} size=${16} />`}${children}</button>`;
}

export function Spinner({ size = 20 }) {
    return html`<span class="spinner" style=${`width:${size}px;height:${size}px`} role="status" aria-label=${t('common.loading')}></span>`;
}

/** Calls handler when the user clicks outside of the referenced element or presses Escape. */
export function useDismiss(ref, handler, active = true) {
    useEffect(() => {
        if (!active) return undefined;

        const onDown = (e) => ref.current && !ref.current.contains(e.target) && handler(e);
        const onKey = (e) => e.key === 'Escape' && handler(e);

        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [active, handler]);
}

/**
 * Button that opens a popover. `children` is a function receiving close().
 */
export function Popover({ trigger, children, align = 'right', class: cls = '' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const close = () => setOpen(false);

    useDismiss(ref, close, open);

    return html`<div class=${`popover-wrap ${cls}`} ref=${ref}>
        ${trigger({ open, toggle: () => setOpen(!open) })}
        ${open && html`<div class=${`popover ${align}`} role="menu">${children(close)}</div>`}
    </div>`;
}

export function MenuItem({ icon, children, onClick, danger, checked, disabled }) {
    return html`<button type="button" role="menuitem" class=${`menu-item ${danger ? 'danger' : ''}`} onClick=${onClick} disabled=${disabled}>
        ${icon ? html`<${Icon} name=${icon} size=${16} />` : html`<span class="menu-icon-gap"></span>`}
        <span class="grow">${children}</span>
        ${checked && html`<${Icon} name="check" size=${16} />`}
    </button>`;
}

export function Modal({ title, onClose, children, wide, footer, class: cls = '' }) {
    const ref = useRef(null);

    useEffect(() => {
        const previous = document.activeElement;

        ref.current && ref.current.focus();

        return () => previous && previous.focus && previous.focus();
    }, []);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();

        document.addEventListener('keydown', onKey);

        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return html`<div class="modal-backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
        <div class=${`modal ${wide ? 'wide' : ''} ${cls}`} role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref}>
            <header class="modal-head"><h2>${title}</h2><${IconButton} icon="close" label=${t('common.close')} onClick=${onClose} /></header>
            <div class="modal-body">${children}</div>
            ${footer && html`<footer class="modal-foot">${footer}</footer>`}
        </div>
    </div>`;
}

/** A small prompt dialog (rename, create folder, ...). */
export function PromptDialog({ title, label, initial = '', confirmLabel, onSubmit, onClose }) {
    const [value, setValue] = useState(initial);

    const submit = (e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
    };

    return html`<${Modal} title=${title} onClose=${onClose}>
        <form onSubmit=${submit} class="stack">
            <label class="field"><span>${label}</span><input type="text" value=${value} onInput=${(e) => setValue(e.target.value)} autofocus /></label>
            <div class="row end"><${Button} onClick=${onClose}>${t('common.cancel')}<//><${Button} variant="primary" type="submit" disabled=${!value.trim()}>${confirmLabel || t('common.save')}<//></div>
        </form>
    <//>`;
}

export function Toasts() {
    const toasts = useStore((s) => s.toasts);

    return html`<div class="toasts" aria-live="polite">
        ${toasts.map((x) => html`<div class=${`toast ${x.kind}`} key=${x.id} role=${x.kind === 'error' ? 'alert' : 'status'}>
            <span>${x.text}</span>
            ${x.action && html`<button type="button" class="toast-action" onClick=${() => { x.action.run(); dismissToast(x.id); }}>${x.action.label}</button>`}
            <button type="button" class="toast-close" aria-label=${t('common.close')} onClick=${() => dismissToast(x.id)}><${Icon} name="close" size=${14} /></button>
        </div>`)}
    </div>`;
}

export function EmptyState({ icon, title, hint, children }) {
    return html`<div class="empty"><div class="empty-icon"><${Icon} name=${icon} size=${28} /></div><h3>${title}</h3>${hint && html`<p>${hint}</p>`}${children}</div>`;
}
