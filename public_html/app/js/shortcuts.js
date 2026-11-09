// Global keyboard shortcuts (Gmail-like). They never fire while typing in a field or when a dialog is open.

import { getState } from './store.js';
import { act, closeDialog, closeMessage, folderByRole, openCompose, openDialog, openFolder, openMessage, toggleStar } from './actions.js';

let pendingG = false;
let timer;

function typing(target) {
    return target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

function move(delta) {
    const { messages, current } = getState();

    if (!messages.length) return;

    const i = current ? messages.findIndex((m) => m.uid === current.uid) : -1;
    const next = messages[Math.max(0, Math.min(messages.length - 1, i + delta))];

    if (next) {
        openMessage(next);
        document.querySelector(`[data-uid="${next.uid}"]`)?.scrollIntoView({ block: 'nearest' });
    }
}

export function installShortcuts() {
    document.addEventListener('keydown', (e) => {
        const s = getState();

        // Escape always closes an open dialog, wherever the focus is (also while it is still opening)
        if (e.key === 'Escape' && s.dialog) {
            closeDialog();
            return;
        }

        if (!s.session || !s.session.authenticated || typing(e.target) || s.dialog || e.altKey || e.metaKey || e.ctrlKey) return;

        const open = s.message && s.current ? s.message : null;
        const key = e.key;

        if (pendingG) {
            pendingG = false;
            clearTimeout(timer);

            if (key === 'i') {
                e.preventDefault();
                openFolder((folderByRole('inbox') || { name: 'INBOX' }).name);
            }

            return;
        }

        const handlers = {
            j: () => move(1),
            k: () => move(-1),
            ArrowDown: () => move(1),
            ArrowUp: () => move(-1),
            Enter: () => !open && s.messages[0] && !s.current && openMessage(s.messages[0]),
            o: () => !open && s.messages[0] && !s.current && openMessage(s.messages[0]),
            Escape: closeMessage,
            u: closeMessage,
            c: () => openCompose('new'),
            r: () => open && openCompose('reply', open),
            a: () => open && openCompose('replyall', open),
            f: () => open && openCompose('forward', open),
            e: () => (open ? act('archive', [open.uid], { folder: open.folder }) : s.selected.length && act('archive', s.selected)),
            '#': () => (open ? act('delete', [open.uid], { folder: open.folder }) : s.selected.length && act('delete', s.selected)),
            Delete: () => (open ? act('delete', [open.uid], { folder: open.folder }) : s.selected.length && act('delete', s.selected)),
            s: () => open && toggleStar(open),
            U: () => open && act('mark_unread', [open.uid], { folder: open.folder }),
            '/': () => window.dispatchEvent(new Event('gl:focus-search')),
            '?': () => openDialog({ type: 'shortcuts' }),
            g: () => {
                pendingG = true;
                timer = setTimeout(() => { pendingG = false; }, 1200);
            },
        };

        if (handlers[key]) {
            e.preventDefault();
            handlers[key]();
        }
    });
}
