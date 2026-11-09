// Minimal global store: one state object, subscribers re-render when their selected slice changes.

import { useEffect, useRef, useState } from './vendor/htm-preact.mjs';

const state = {
    booted: false,
    session: null, // result of GET session (authenticated or not)
    mode: 'single',

    folders: [],
    delimiter: '.',
    quota: null,

    folder: 'INBOX',
    filter: 'all', // all | unseen | flagged
    query: '',
    sort: 'date',
    order: 'DESC',
    page: 1,
    pages: 1,
    total: 0,
    messages: [],
    listLoading: false,
    selected: [], // uids of the checked rows

    current: null, // { folder, uid } of the open message
    message: null, // full message
    messageLoading: false,
    messageError: null,

    compose: [], // open compose windows
    toasts: [],
    dialog: null, // { type: 'settings', tab } | { type: 'shortcuts' } | { type: 'folder', ... }
    nav: 'list', // small screens: list | reader
    sidebarOpen: false,
    online: true,
};

const subscribers = new Set();

export const getState = () => state;

export function setState(patch) {
    Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
    subscribers.forEach((fn) => fn());
}

/**
 * Subscribe a component to a slice of the state. The selector must return a stable value
 * (a primitive or a reference that is only replaced when it changes).
 */
export function useStore(selector) {
    const [, rerender] = useState(0);
    const latest = useRef(selector);
    const last = useRef(selector(state));

    latest.current = selector;

    useEffect(() => {
        const check = () => {
            const next = latest.current(state);

            if (!Object.is(next, last.current)) {
                last.current = next;
                rerender((n) => n + 1);
            }
        };

        subscribers.add(check);
        check();

        return () => subscribers.delete(check);
    }, []);

    return selector(state);
}
