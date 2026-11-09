// Application logic: everything that talks to the API and changes the state.

import { api, setAuthLostHandler, setToken } from './api.js';
import { getState, setState } from './store.js';
import { getLocale, setLanguage, t } from './i18n.js';
import { escapeHtml, fmtFullDate, formatAddress, uid } from './util.js';

// ---- toasts --------------------------------------------------------------

let toastSeq = 0;

export function toast(text, kind = 'info', { timeout = 4500, action } = {}) {
    const id = ++toastSeq;

    // at most three at once, and the same message is not shown twice
    setState((s) => ({ toasts: [...s.toasts.filter((x) => x.text !== text), { id, text, kind, action }].slice(-3) }));

    if (timeout) setTimeout(() => dismissToast(id), timeout);

    return id;
}

export function dismissToast(id) {
    setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

const failure = (e) => toast(e && e.message ? e.message : t('toast.failed'), 'error', { timeout: 6000 });

// ---- session ----------------------------------------------------------------

let pollTimer = null;

export function applyAppearance(settings = {}) {
    const root = document.documentElement;

    if (settings.theme && settings.theme !== 'auto') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;

    root.dataset.density = settings.density || 'comfortable';
}

function applySession(session) {
    setToken(session.token);
    setLanguage(session.settings ? session.settings.language : undefined);
    applyAppearance(session.settings);
    setState((s) => ({ session, mode: session.mode, langVersion: (s.langVersion || 0) + 1 }));
}

export async function boot() {
    setAuthLostHandler((code) => {
        stopPolling();
        setState({ session: { ...getState().session, authenticated: false }, current: null, message: null, compose: [] });
        if (code === 'session_expired') toast(t('toast.sessionExpired'), 'error', { timeout: 8000 });
    });

    window.addEventListener('online', () => { setState({ online: true }); toast(t('toast.online'), 'success'); poll(); });
    window.addEventListener('offline', () => { setState({ online: false }); toast(t('toast.offline'), 'error', { timeout: 0 }); });
    document.addEventListener('visibilitychange', () => !document.hidden && getState().session?.authenticated && poll());

    try {
        const session = await api.session();

        applySession(session);
        setState({ booted: true });

        if (session.authenticated) await enter();
    } catch (e) {
        setState({ booted: true, session: { authenticated: false }, bootError: e.message });
    }
}

export async function login(username, password, host) {
    const session = await api.login(username, password, host);

    applySession(session);
    await enter();
}

export async function logout() {
    stopPolling();

    try {
        const session = await api.logout();

        applySession({ ...session, mode: getState().mode });
    } catch (e) { /* the session is gone either way */ }

    setState({ folders: [], messages: [], current: null, message: null, compose: [], dialog: null, folder: 'INBOX', query: '', filter: 'all' });
}

async function enter() {
    await refreshFolders();
    await openFolder('INBOX');
    startPolling();
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(poll, 60000);
}

function stopPolling() {
    clearInterval(pollTimer);
}

async function poll() {
    const before = getState();
    const inbox = before.folders.find((f) => f.role === 'inbox');

    try {
        await refreshFolders();
    } catch (e) {
        return;
    }

    const now = getState();
    const after = now.folders.find((f) => f.role === 'inbox');

    if (inbox && after && after.total > inbox.total && now.folder === after.name && now.page === 1 && !now.query) {
        toast(t('toast.newmail'), 'info');
        loadList({ silent: true });
    }

    document.title = (after && after.unseen ? `(${after.unseen}) ` : '') + (now.session?.product || 'Webmail');
}

// ---- folders ------------------------------------------------------------------

export async function refreshFolders() {
    const r = await api.folders();

    setState({ folders: r.folders, delimiter: r.delimiter, quota: r.quota });
}

export const folderByRole = (role) => getState().folders.find((f) => f.role === role);

export function folderLabel(folder) {
    return folder.role ? t(`folder.${folder.role}`) : folder.label;
}

export async function openFolder(name) {
    setState({ folder: name, query: '', filter: 'all', current: null, message: null, nav: 'list', sidebarOpen: false, selected: [], page: 1 });
    await loadList();
}

export async function createFolder(name, parent) {
    try {
        await api.createFolder(name, parent);
        await refreshFolders();
        toast(t('toast.folderCreated'), 'success');
    } catch (e) { failure(e); }
}

export async function renameFolder(folder, name) {
    try {
        const r = await api.renameFolder(folder, name);

        await refreshFolders();
        if (getState().folder === folder) await openFolder(r.name);
    } catch (e) { failure(e); }
}

export async function deleteFolder(folder) {
    try {
        await api.deleteFolder(folder);
        await refreshFolders();
        toast(t('toast.folderDeleted'), 'success');
        if (getState().folder === folder) await openFolder('INBOX');
    } catch (e) { failure(e); }
}

export async function emptyFolder(folder) {
    try {
        await api.emptyFolder(folder);
        await refreshFolders();
        toast(t('toast.emptied'), 'success');
        if (getState().folder === folder) await loadList();
    } catch (e) { failure(e); }
}

// ---- message list -------------------------------------------------------------

let listSeq = 0;

export async function loadList({ append = false, silent = false } = {}) {
    const s = getState();
    const seq = ++listSeq;
    const page = append ? s.page + 1 : 1;

    if (!silent) setState({ listLoading: true, listError: null });

    try {
        const r = await api.messages({
            folder: s.folder, page, q: s.query, filter: s.filter === 'all' ? '' : s.filter, sort: s.sort, order: s.order,
            per_page: s.session?.settings?.mail_pagesize,
        });

        if (seq !== listSeq) return;

        const known = new Set(append ? s.messages.map((m) => m.uid) : []);
        const messages = append ? [...s.messages, ...r.messages.filter((m) => !known.has(m.uid))] : r.messages;
        const uids = new Set(messages.map((m) => m.uid));

        setState({
            messages, page: r.page, pages: r.pages, total: r.total, listLoading: false,
            selected: getState().selected.filter((u) => uids.has(u)),
        });
    } catch (e) {
        if (seq === listSeq) setState({ listLoading: false, listError: e.message });
    }
}

export function setFilter(filter) {
    setState({ filter, current: null, message: null });
    return loadList();
}

export function search(query) {
    setState({ query, current: null, message: null });
    return loadList();
}

export function toggleSelected(uidValue, on) {
    setState((s) => ({ selected: on ? [...new Set([...s.selected, uidValue])] : s.selected.filter((u) => u !== uidValue) }));
}

export function selectAll(on) {
    setState((s) => ({ selected: on ? s.messages.map((m) => m.uid) : [] }));
}

// ---- reading ---------------------------------------------------------------------

export async function openMessage(summary, { images = false } = {}) {
    const key = { folder: summary.folder, uid: summary.uid };

    setState((s) => ({ current: key, message: images ? s.message : null, messageLoading: !images, messageError: null, nav: 'reader' }));

    try {
        const message = await api.message(summary.folder, summary.uid, { images });
        const now = getState().current;

        if (!now || now.uid !== key.uid || now.folder !== key.folder) return;

        setState({ message, messageLoading: false });

        if (!summary.seen) setSeenLocally(summary.uid, true);
    } catch (e) {
        const now = getState().current;

        if (now && now.uid === key.uid) setState({ messageLoading: false, messageError: e.message });
    }
}

export function closeMessage() {
    setState({ current: null, message: null, nav: 'list' });
}

function setSeenLocally(uidValue, seen) {
    setState((s) => ({
        messages: s.messages.map((m) => (m.uid === uidValue ? { ...m, seen } : m)),
        folders: s.folders.map((f) => (f.name === s.folder ? { ...f, unseen: Math.max(0, f.unseen + (seen ? -1 : 1)) } : f)),
    }));
}

/** Next message to show after the current one disappeared: the closest one below, else above. */
function neighbour(messages, removed, currentUid) {
    const i = messages.findIndex((m) => m.uid === currentUid);
    const stays = (m) => !removed.includes(m.uid);

    return messages.slice(i + 1).find(stays) || messages.slice(0, i).reverse().find(stays) || null;
}

const wide = () => window.matchMedia('(min-width: 1000px)').matches;

export async function act(action, uids, { target, folder } = {}) {
    const s = getState();
    const from = folder || s.folder;
    const removing = ['move', 'delete', 'archive', 'spam'].includes(action);
    const before = s.messages;
    const viewing = s.current && uids.includes(s.current.uid) ? s.current : null;
    const next = viewing ? neighbour(before, uids, viewing.uid) : null;

    // optimistic update, rolled back if the server refuses
    if (removing) {
        setState({ messages: before.filter((m) => !uids.includes(m.uid)), selected: [], total: s.total - uids.length });
        if (viewing) {
            if (next && wide()) openMessage(next);
            else closeMessage();
        }
    } else {
        const patch = { mark_read: { seen: true }, mark_unread: { seen: false }, flag: { flagged: true }, unflag: { flagged: false } }[action];

        setState({ messages: before.map((m) => (uids.includes(m.uid) ? { ...m, ...patch } : m)) });
        if (s.message && uids.includes(s.message.uid)) setState({ message: { ...s.message, ...patch } });
    }

    try {
        await api.act(from, uids, action, target);
        await refreshFolders();

        const done = {
            delete: () => t(folderByRole('trash') && from !== folderByRole('trash').name ? 'toast.deleted' : 'toast.deletedForever'),
            archive: () => t('toast.archived'),
            spam: () => t('toast.spam'),
            move: () => t('toast.moved', { folder: folderLabel(getState().folders.find((f) => f.name === target) || { label: target }) }),
        }[action];

        if (done) toast(done(), 'success');
        if (removing && getState().messages.length < 10 && getState().page < getState().pages) loadList({ silent: true });
    } catch (e) {
        setState({ messages: before });
        failure(e);
        loadList({ silent: true });
    }
}

export const toggleStar = (m) => act(m.flagged ? 'unflag' : 'flag', [m.uid], { folder: m.folder });

export async function markUnread(m) {
    await act('mark_unread', [m.uid], { folder: m.folder });
    await refreshFolders();
}

// ---- composing -----------------------------------------------------------------------

const editors = new Map();

/** The compose window registers a function that returns what the user typed. */
export function registerEditor(id, getter) {
    editors.set(id, getter);

    return () => editors.delete(id);
}

/** What the user has typed so far: { html, text }. */
export function readEditor(id) {
    const getter = editors.get(id);

    return getter ? getter() : { html: '', text: '' };
}

export const getCompose = (id) => getState().compose.find((c) => c.id === id);

export function updateCompose(id, patch) {
    setState((s) => ({ compose: s.compose.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) }));
}

export function closeCompose(id) {
    editors.delete(id);
    setState((s) => ({ compose: s.compose.filter((c) => c.id !== id) }));
}

const textToHtml = (text) => escapeHtml(text).replace(/\r?\n/g, '<br>');

function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4,tr').forEach((el) => el.append('\n'));

    return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function bodyOfHtml(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');

    doc.querySelectorAll('style,title,meta,link,base').forEach((el) => el.remove());

    return doc.body.innerHTML;
}

function signatureOf(identity, asHtml) {
    if (!identity || !identity.signature) return asHtml ? '' : '';

    if (asHtml) return `<div class="gl-sig">-- <br>${identity.html_signature ? identity.signature : textToHtml(identity.signature)}</div>`;

    return `\n-- \n${identity.html_signature ? htmlToText(identity.signature) : identity.signature}\n`;
}

const mine = (identities) => new Set(identities.map((i) => i.email.toLowerCase()));

function pickIdentity(identities, message) {
    const recipients = [...(message?.to || []), ...(message?.cc || [])].map((a) => a.email.toLowerCase());

    return identities.find((i) => recipients.includes(i.email.toLowerCase())) || identities.find((i) => i.standard) || identities[0];
}

function quoteHeader(message) {
    const who = message.from.name || message.from.email;

    return t('compose.wrote', { date: fmtFullDate(message.date, getLocale()), name: who });
}

/**
 * Open a compose window.
 *
 * @param {'new'|'reply'|'replyall'|'forward'|'draft'} kind
 * @param {object} message the message being answered/forwarded/edited
 * @param {object} preset extra fields, e.g. { to: [{ email }] } for mailto links
 */
export function openCompose(kind = 'new', message = null, preset = {}) {
    const s = getState();
    const identities = s.session.identities || [];
    const asHtml = (s.session.settings?.htmleditor ?? 1) !== 0;
    const identity = pickIdentity(identities, kind === 'draft' ? null : message) || identities[0];
    const me = mine(identities);
    const c = {
        id: uid(), kind, minimized: false, maximized: false, identityId: identity ? identity.id : 0,
        to: [], cc: [], bcc: [], subject: '', html: asHtml, body: '', attachments: [], forwardAttachments: [],
        inReplyTo: '', references: '', replyTo: null, forwardOf: null, draftUid: null, draftFolder: null,
        dirty: false, sending: false, saving: false, savedAt: null, error: null, progress: 0, ...preset,
    };

    if (message && kind === 'reply') {
        c.to = message.reply_to.length ? message.reply_to : [message.from];
    } else if (message && kind === 'replyall') {
        const everyone = [...(message.reply_to.length ? message.reply_to : [message.from]), ...message.to, ...message.cc];
        const seen = new Set(me);

        c.to = [];
        c.cc = [];
        everyone.forEach((a, i) => {
            if (seen.has(a.email.toLowerCase())) return;
            seen.add(a.email.toLowerCase());
            (i === 0 ? c.to : c.cc).push(a);
        });
        if (!c.to.length) c.to = c.cc.splice(0, 1);
    }

    if (message && (kind === 'reply' || kind === 'replyall')) {
        c.subject = /^(re|aw):/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
        c.inReplyTo = message.message_id || '';
        c.references = `${message.references || ''} ${message.message_id || ''}`.trim();
        c.replyTo = { folder: message.folder, uid: message.uid };

        const original = message.text || '';

        c.body = asHtml
            ? `<p><br></p>${signatureOf(identity, true)}<div class="gl-quote-head">${escapeHtml(quoteHeader(message))}</div><blockquote>${textToHtml(original)}</blockquote>`
            : `\n${signatureOf(identity, false)}\n${quoteHeader(message)}\n${original.split(/\r?\n/).map((l) => `> ${l}`).join('\n')}\n`;
    } else if (message && kind === 'forward') {
        const header = [
            `---------- ${t('compose.forwarded')} ----------`,
            `${t('reader.from')}: ${formatAddress(message.from)}`,
            `${t('reader.date')}: ${fmtFullDate(message.date, getLocale())}`,
            `${t('compose.subject')}: ${message.subject}`,
            `${t('reader.to')}: ${message.to.map(formatAddress).join(', ')}`,
        ];

        c.subject = /^(fwd?|wg):/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`;
        c.forwardOf = { folder: message.folder, uid: message.uid };
        c.forwardAttachments = message.attachments.map((a) => ({ folder: message.folder, uid: message.uid, part: a.part, name: a.name, size: a.size }));
        c.body = asHtml
            ? `<p><br></p>${signatureOf(identity, true)}<div class="gl-quote-head">${header.map(escapeHtml).join('<br>')}</div><br>${textToHtml(message.text || '')}`
            : `\n${signatureOf(identity, false)}\n${header.join('\n')}\n\n${message.text || ''}`;
    } else if (message && kind === 'draft') {
        c.to = message.to;
        c.cc = message.cc;
        c.bcc = message.bcc;
        c.subject = message.subject;
        c.inReplyTo = message.in_reply_to || '';
        c.references = message.references || '';
        c.draftUid = message.uid;
        c.draftFolder = message.folder;
        c.body = asHtml ? bodyOfHtml(message.html) : message.text || '';
        c.forwardAttachments = message.attachments.map((a) => ({ folder: message.folder, uid: message.uid, part: a.part, name: a.name, size: a.size }));
    } else {
        c.body = asHtml ? `<p><br></p>${signatureOf(identity, true)}` : `\n${signatureOf(identity, false)}`;
    }

    // keep at most three windows open, the older ones shrink
    setState((st) => ({ compose: [...st.compose.map((w) => ({ ...w, minimized: st.compose.length >= 2 ? true : w.minimized })), c] }));

    return c.id;
}

const addr = (list) => list.map(formatAddress);

function payloadOf(c, draft) {
    const typed = editors.get(c.id) ? editors.get(c.id)() : { html: c.html ? c.body : '', text: c.html ? '' : c.body };

    return {
        draft,
        identity_id: c.identityId,
        to: addr(c.to), cc: addr(c.cc), bcc: addr(c.bcc),
        subject: c.subject,
        html: c.html ? typed.html : '',
        text: c.html ? '' : typed.text,
        in_reply_to: c.inReplyTo,
        references: c.references,
        reply_to_message: c.replyTo,
        forward_of: c.forwardOf,
        forward_attachments: c.forwardAttachments,
        draft_uid: c.draftUid,
    };
}

export async function saveDraft(id, { silent = false } = {}) {
    const c = getCompose(id);

    if (!c || c.saving || c.sending) return;

    updateCompose(id, { saving: true });

    try {
        const r = await api.send(payloadOf(c, true), c.attachments);

        updateCompose(id, { saving: false, dirty: false, draftUid: r.uid || null, draftFolder: r.folder, savedAt: Date.now(), error: null });
        if (!silent) toast(t('compose.saved'), 'success');
        if (getState().folder === r.folder) loadList({ silent: true });
    } catch (e) {
        updateCompose(id, { saving: false });
        if (!silent) failure(e);
    }
}

export async function sendCompose(id) {
    const c = getCompose(id);

    if (!c || c.sending) return;

    const bad = [...c.to, ...c.cc, ...c.bcc].find((a) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a.email));

    if (!c.to.length && !c.cc.length && !c.bcc.length) return updateCompose(id, { error: t('compose.noRecipient') });
    if (bad) return updateCompose(id, { error: t('compose.invalid', { value: bad.email }) });
    if (!c.subject.trim() && !window.confirm(t('compose.noSubject'))) return;

    updateCompose(id, { sending: true, error: null, progress: 0 });

    try {
        await api.send(payloadOf(c, false), c.attachments, (p) => updateCompose(id, { progress: p }));
        closeCompose(id);
        toast(t('compose.sent'), 'success');
        await refreshFolders();

        const folder = getState().folder;

        if (['sent', 'drafts'].includes((getState().folders.find((f) => f.name === folder) || {}).role)) loadList({ silent: true });
    } catch (e) {
        updateCompose(id, { sending: false, error: e.message || t('compose.sendFailed') });
    }
}

export async function discardCompose(id) {
    const c = getCompose(id);

    closeCompose(id);

    if (c && c.draftUid && c.draftFolder) {
        try {
            await api.act(c.draftFolder, [c.draftUid], 'delete');
            await refreshFolders();
            if (getState().folder === c.draftFolder) loadList({ silent: true });
        } catch (e) { /* the draft stays, harmless */ }
    }
}

// ---- settings, identities, contacts, accounts --------------------------------------------

export async function saveSettings(patch) {
    try {
        const r = await api.saveSettings(patch);
        const session = { ...getState().session, settings: r.settings };

        setLanguage(r.settings.language);
        applyAppearance(r.settings);
        setState((s) => ({ session, langVersion: (s.langVersion || 0) + 1 }));
        toast(t('settings.saved'), 'success');

        if ('mail_pagesize' in patch) loadList({ silent: true });
    } catch (e) { failure(e); }
}

export async function saveIdentity(identity) {
    const r = await api.saveIdentity(identity);

    setState((s) => ({ session: { ...s.session, identities: r.identities } }));
    toast(t('id.saved'), 'success');
}

export async function deleteIdentity(id) {
    try {
        const r = await api.deleteIdentity(id);

        setState((s) => ({ session: { ...s.session, identities: r.identities } }));
    } catch (e) { failure(e); }
}

export function setAccounts(accounts) {
    setState((s) => ({ session: { ...s.session, accounts } }));
}

export async function switchAccount(id) {
    try {
        const session = await api.switchAccount(id);

        applySession(session);
        setState({ dialog: null, compose: [], current: null, message: null, messages: [] });
        await enter();
        toast(t('acc.opened', { email: session.user.email }), 'success');
    } catch (e) { failure(e); }
}

export function openDialog(dialog) {
    setState({ dialog });
}

export function closeDialog() {
    setState({ dialog: null });
}

export function mailtoToCompose(href) {
    const url = new URL(href);
    const to = decodeURIComponent(url.pathname).split(',').filter(Boolean).map((email) => ({ name: '', email }));

    openCompose('new', null, { to, subject: url.searchParams.get('subject') || '', dirty: false });
}
