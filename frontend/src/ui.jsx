// Shared building blocks: avatar, buttons, popover menu, modal, toasts.

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { initials } from './lib/util.js';
import { dismissToast } from './lib/actions.js';
import { useStore } from './lib/store.js';
import { t } from './lib/i18n.js';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Avatar({ name, email, size = 24, className = '' }) {
    return (
        <span className={cx('inline-grid shrink-0 select-none place-items-center rounded-full bg-secondary-fixed font-medium text-on-secondary-fixed', className)} style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }} aria-hidden="true">
            {initials(name, email)}
        </span>
    );
}

export function IconButton({ icon, label, onClick, active, disabled, className = '', size = 17, ...rest }) {
    return (
        <button type="button" className={cx('icon-btn', active && 'text-star', className)} title={label} aria-label={label} onClick={onClick} disabled={disabled} {...rest}>
            <Icon name={icon} size={size} />
        </button>
    );
}

export function Button({ children, variant = 'default', icon, busy, className = '', type = 'button', ...rest }) {
    const v = { primary: 'btn-primary', danger: 'btn-danger', default: '' }[variant];

    return (
        <button type={type} className={cx('btn', v, className)} disabled={busy || rest.disabled} {...rest}>
            {icon && <Icon name={icon} size={16} />}
            {children}
        </button>
    );
}

export function Spinner({ size = 20 }) {
    return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" style={{ width: size, height: size }} role="status" aria-label={t('common.loading')} />;
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

/** Button that opens a popover. `children` is a function receiving close(). `up` opens it above the trigger. */
export function Popover({ trigger, children, align = 'right', up = false, className = '' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const close = () => setOpen(false);

    useDismiss(ref, close, open);

    return (
        <div className={cx('relative inline-block', className)} ref={ref}>
            {trigger({ open, toggle: () => setOpen(!open) })}
            {open && (
                <div role="menu" className={cx('absolute z-[60] max-h-[60vh] min-w-[220px] overflow-auto rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0', up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]')}>
                    {children(close)}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ icon, children, onClick, danger, checked, disabled }) {
    return (
        <button type="button" role="menuitem" className={cx('menu-item', danger && 'text-error')} onClick={onClick} disabled={disabled}>
            {icon ? <Icon name={icon} size={16} /> : <span className="w-4" />}
            <span className="min-w-0 flex-1">{children}</span>
            {checked && <Icon name="check" size={16} />}
        </button>
    );
}

export function Modal({ title, onClose, children, wide, footer, className = '', bodyClass = 'p-5' }) {
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

    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-5 backdrop-blur-[2px] max-sm:items-end max-sm:p-0" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} className={cx('flex max-h-[min(86dvh,760px)] w-full flex-col rounded-2xl bg-surface-container-lowest shadow-modal outline-none max-sm:max-h-[94dvh] max-sm:rounded-b-none', wide ? 'max-w-[900px]' : 'max-w-[460px]', className)}>
                <header className="flex items-center justify-between py-3 pl-5 pr-3">
                    <h2 className="truncate text-headline-sm">{title}</h2>
                    <IconButton icon="close" label={t('common.close')} onClick={onClose} />
                </header>
                <div className={cx('min-h-0 overflow-auto', bodyClass)}>{children}</div>
                {footer && <footer className="px-5 py-3">{footer}</footer>}
            </div>
        </div>
    );
}

/** A small prompt dialog (rename, create folder, ...). */
export function PromptDialog({ title, label, initial = '', confirmLabel, onSubmit, onClose }) {
    const [value, setValue] = useState(initial);

    const submit = (e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
    };

    return (
        <Modal title={title} onClose={onClose}>
            <form onSubmit={submit} className="grid gap-4">
                <label className="field">
                    <span>{label}</span>
                    <input className="input" type="text" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
                </label>
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" type="submit" disabled={!value.trim()}>{confirmLabel || t('common.save')}</Button>
                </div>
            </form>
        </Modal>
    );
}

export function Toasts() {
    const toasts = useStore((s) => s.toasts);

    return (
        <div className="pointer-events-none fixed bottom-16 left-4 z-[90] grid w-[min(340px,calc(100vw-24px))] gap-2" aria-live="polite">
            {toasts.map((x) => (
                <div key={x.id} role={x.kind === 'error' ? 'alert' : 'status'} className={cx('toast ' + x.kind, 'pointer-events-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-label-lg shadow-pop', x.kind === 'error' ? 'bg-error text-surface' : 'bg-on-surface text-surface')}>
                    {x.kind === 'success' && <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />}
                    <span className="flex-1">{x.text}</span>
                    {x.action && (
                        <button type="button" className="font-semibold underline" onClick={() => { x.action.run(); dismissToast(x.id); }}>{x.action.label}</button>
                    )}
                    <button type="button" className="opacity-70 hover:opacity-100" aria-label={t('common.close')} onClick={() => dismissToast(x.id)}><Icon name="close" size={14} /></button>
                </div>
            ))}
        </div>
    );
}

export function EmptyState({ icon, title, hint, children }) {
    return (
        <div className="grid justify-items-center gap-2 px-7 py-16 text-center text-secondary">
            <div className="mb-1 grid h-12 w-12 place-items-center rounded-xl bg-surface-container text-outline"><Icon name={icon} size={24} /></div>
            <h3 className="text-headline-sm text-on-surface">{title}</h3>
            {hint && <p className="max-w-xs">{hint}</p>}
            {children}
        </div>
    );
}
