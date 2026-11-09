import { html, useEffect, useRef, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { api } from '../api.js';
import { Avatar, Button, Modal, Spinner } from '../ui.js';
import { t } from '../i18n.js';
import { useStore } from '../store.js';
import { closeDialog, deleteIdentity, openCompose, saveIdentity, saveSettings, setAccounts, switchAccount, toast, openDialog } from '../actions.js';

const errorText = (e) => (e && e.message) || t('common.error');

function Segmented({ value, options, onChange, label }) {
    return html`<div class="segmented" role="radiogroup" aria-label=${label}>${options.map(([v, text]) => html`<button type="button" key=${v} role="radio" aria-checked=${value === v} class=${value === v ? 'on' : ''} onClick=${() => onChange(v)}>${text}</button>`)}</div>`;
}

function Row({ label, hint, children }) {
    return html`<div class="setting-row"><div><strong>${label}</strong>${hint && html`<p class="muted small">${hint}</p>`}</div><div class="setting-control">${children}</div></div>`;
}

// ---- general --------------------------------------------------------------------------

function General() {
    const settings = useStore((s) => s.session.settings);
    const [languages, setLanguages] = useState(null);

    useEffect(() => {
        api.settings().then((r) => setLanguages(r.languages)).catch(() => setLanguages({}));
    }, []);

    return html`<div class="settings-section">
        <${Row} label=${t('settings.language')}>
            <select value=${settings.language} onChange=${(e) => saveSettings({ language: e.target.value })} disabled=${!languages}>
                ${languages ? Object.entries(languages).map(([code, name]) => html`<option key=${code} value=${code}>${name}</option>`) : html`<option>${settings.language}</option>`}
            </select>
        <//>
        <${Row} label=${t('settings.theme')}>
            <${Segmented} label=${t('settings.theme')} value=${settings.theme} onChange=${(theme) => saveSettings({ theme })} options=${[['auto', t('settings.theme.auto')], ['light', t('settings.theme.light')], ['dark', t('settings.theme.dark')]]} />
        <//>
        <${Row} label=${t('settings.density')}>
            <${Segmented} label=${t('settings.density')} value=${settings.density} onChange=${(density) => saveSettings({ density })} options=${[['comfortable', t('settings.density.comfortable')], ['compact', t('settings.density.compact')]]} />
        <//>
        <${Row} label=${t('settings.pagesize')}>
            <select value=${settings.mail_pagesize} onChange=${(e) => saveSettings({ mail_pagesize: Number(e.target.value) })}>${[25, 50, 75, 100].map((n) => html`<option key=${n} value=${n}>${n}</option>`)}</select>
        <//>
        <${Row} label=${t('settings.editor')}>
            <${Segmented} label=${t('settings.editor')} value=${settings.htmleditor === 0 ? 0 : 1} onChange=${(htmleditor) => saveSettings({ htmleditor })} options=${[[1, t('settings.editor.html')], [0, t('settings.editor.text')]]} />
        <//>
    </div>`;
}

// ---- accounts (multi-account mode) -----------------------------------------------------

const PRESETS = [
    ['Google', 'ssl://imap.gmail.com:993', 'tls://smtp.gmail.com:587'],
    ['Microsoft', 'ssl://outlook.office365.com:993', 'tls://smtp.office365.com:587'],
    ['iCloud', 'ssl://imap.mail.me.com:993', 'tls://smtp.mail.me.com:587'],
];

function AddMailbox() {
    const empty = { email: '', password: '', imap_host: '', smtp_host: '', imap_user: '', label: '' };
    const [form, setForm] = useState(empty);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const detect = async () => {
        setStatus('…');

        try {
            const r = await api.detect(form.email);

            if (r.servers) setForm((f) => ({ ...f, imap_host: r.servers.imap_host, smtp_host: r.servers.smtp_host, imap_user: r.servers.imap_user === f.email ? '' : r.servers.imap_user }));
            setStatus(r.servers ? 'ok' : 'none');
        } catch (e) { setStatus('none'); }
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');

        try {
            setAccounts(await api.addAccount({ ...form }));
            setForm(empty);
            setStatus(null);
            toast(t('acc.added'), 'success');
        } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
    };

    return html`<form onSubmit=${submit} class="stack card-form">
        <h4>${t('acc.add')}</h4>
        <div class="stack-sm">
            <div class="row"><span class="muted small">${t('acc.quick')}</span>${PRESETS.map(([name, imap, smtp]) => html`<button type="button" key=${name} class="chip" onClick=${() => setForm({ ...form, imap_host: imap, smtp_host: smtp })}>${name}</button>`)}</div>
            <p class="muted small">${t('acc.appPassword')}</p>
        </div>
        ${error && html`<div class="alert error" role="alert">${error}</div>`}
        <div class="grid2">
            <label class="field"><span>${t('acc.email')}</span><input type="email" required value=${form.email} onInput=${set('email')} autocomplete="off" /></label>
            <label class="field"><span>${t('acc.password')}</span><input type="password" required value=${form.password} onInput=${set('password')} autocomplete="new-password" /></label>
        </div>
        <div class="row"><${Button} onClick=${detect} disabled=${!form.email}>${t('acc.detect')}<//><span class=${`small ${status === 'ok' ? 'ok-text' : 'muted'}`} aria-live="polite">${status === 'ok' ? t('acc.detected') : status === 'none' ? t('acc.notDetected') : ''}</span></div>
        <div class="grid2">
            <label class="field"><span>${t('acc.imap')}</span><input type="text" required placeholder="ssl://imap.example.com:993" value=${form.imap_host} onInput=${set('imap_host')} /></label>
            <label class="field"><span>${t('acc.smtp')}</span><input type="text" placeholder="tls://smtp.example.com:587" value=${form.smtp_host} onInput=${set('smtp_host')} /></label>
            <label class="field"><span>${t('acc.user')} <small class="muted">(${t('acc.userHint')})</small></span><input type="text" value=${form.imap_user} onInput=${set('imap_user')} /></label>
            <label class="field"><span>${t('acc.label')} <small class="muted">(${t('common.optional')})</small></span><input type="text" value=${form.label} onInput=${set('label')} /></label>
        </div>
        <div class="row end"><${Button} variant="primary" type="submit" busy=${busy}>${busy ? html`<${Spinner} size=${16} />` : t('common.add')}<//></div>
    </form>`;
}

function ChangePassword() {
    const [form, setForm] = useState({ current: '', next: '' });
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            await api.changePassword(form.current, form.next);
            setForm({ current: '', next: '' });
            toast(t('acc.passwordChanged'), 'success');
        } catch (err) { setError(errorText(err)); }
    };

    return html`<form onSubmit=${submit} class="stack card-form">
        <h4>${t('acc.changePassword')}</h4>
        ${error && html`<div class="alert error" role="alert">${error}</div>`}
        <div class="grid2">
            <label class="field"><span>${t('acc.currentPassword')}</span><input type="password" required autocomplete="current-password" value=${form.current} onInput=${(e) => setForm({ ...form, current: e.target.value })} /></label>
            <label class="field"><span>${t('acc.newPassword')}</span><input type="password" required minlength="8" autocomplete="new-password" value=${form.next} onInput=${(e) => setForm({ ...form, next: e.target.value })} /></label>
        </div>
        <div class="row end"><${Button} type="submit">${t('acc.changePassword')}<//></div>
    </form>`;
}

function Accounts() {
    const accounts = useStore((s) => s.session.accounts);

    if (!accounts) return null;

    const run = async (fn, message) => {
        try {
            setAccounts(await fn());
            message && toast(message, 'success');
        } catch (e) { toast(errorText(e), 'error'); }
    };

    return html`<div class="settings-section">
        <p class="muted">${t('acc.hint')}</p>
        <ul class="list-cards">
            ${accounts.mailboxes.map((m) => html`<li key=${m.id} class="list-card">
                <${Avatar} name=${m.label} email=${m.email} size=${38} />
                <div class="grow"><strong>${m.label || m.email}</strong>
                    ${m.id === accounts.current && html` <span class="badge ok">${t('acc.current')}</span>`}${m.default && html` <span class="badge quiet">${t('acc.default')}</span>`}
                    <div class="muted small">${m.email} · ${m.imap_host}</div></div>
                <div class="row">
                    ${m.id !== accounts.current && html`<${Button} onClick=${() => switchAccount(m.id)}>${t('acc.open')}<//>`}
                    ${!m.default && html`<${Button} onClick=${() => run(() => api.defaultAccount(m.id))}>${t('acc.makeDefault')}<//>`}
                    <${Button} variant="danger-ghost" onClick=${() => window.confirm(t('acc.confirmRemove')) && run(() => api.removeAccount(m.id), t('acc.removed'))}>${t('common.remove')}<//>
                </div>
            </li>`)}
        </ul>
        <${AddMailbox} />
        <${ChangePassword} />
    </div>`;
}

// ---- integrations (MCP) ---------------------------------------------------------------------

function Copy({ text }) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast(t('int.copied'), 'success');
        } catch (e) { /* the field is selectable as a fallback */ }
    };

    return html`<${Button} onClick=${copy}>${t('int.copy')}<//>`;
}

function Integrations() {
    const [tokens, setTokens] = useState(null);
    const [name, setName] = useState('');
    const [fresh, setFresh] = useState(null);
    const endpoint = new URL('../mcp.php', window.location.href).href;

    useEffect(() => { api.tokens().then((r) => setTokens(r.tokens)).catch((e) => toast(errorText(e), 'error')); }, []);

    const create = async (e) => {
        e.preventDefault();

        try {
            const r = await api.createToken(name.trim() || 'MCP');

            setFresh(r.access_token);
            setTokens(r.tokens);
            setName('');
        } catch (err) { toast(errorText(err), 'error'); }
    };

    const revoke = async (id) => {
        if (!window.confirm(t('int.confirmRevoke'))) return;

        try {
            setTokens((await api.revokeToken(id)).tokens);
            toast(t('int.revoked'), 'success');
        } catch (err) { toast(errorText(err), 'error'); }
    };

    const command = `claude mcp add --transport http glennski-mail ${endpoint} --header "Authorization: Bearer ${fresh || '<token>'}"`;

    return html`<div class="settings-section">
        <p class="muted">${t('int.hint')}</p>
        <label class="field"><span>${t('int.endpoint')}</span><span class="row nowrap"><input type="text" readonly value=${endpoint} onFocus=${(e) => e.target.select()} /><${Copy} text=${endpoint} /></span></label>
        <form onSubmit=${create} class="row nowrap">
            <label class="field grow"><span>${t('int.name')}</span><input type="text" maxlength="100" placeholder=${t('int.namePlaceholder')} value=${name} onInput=${(e) => setName(e.target.value)} /></label>
            <${Button} variant="primary" type="submit">${t('int.create')}<//>
        </form>
        ${fresh && html`<div class="banner token-new" role="status"><div class="grow stack-sm"><strong>${t('int.created')}</strong><span class="row nowrap"><input type="text" readonly value=${fresh} onFocus=${(e) => e.target.select()} aria-label="Token" /><${Copy} text=${fresh} /></span></div></div>`}
        <div class="stack-sm"><h4>${t('int.example')}</h4><pre class="code">${command}</pre></div>
        <div class="stack-sm"><h4>${t('int.tokens')}</h4>
            ${tokens && !tokens.length && html`<p class="muted">${t('int.none')}</p>`}
            <ul class="list-cards">${(tokens || []).map((k) => html`<li key=${k.token_id} class="list-card">
                <div class="grow"><strong>${k.name || 'MCP'}</strong><div class="muted small">${k.last_used ? `${t('int.lastUsed')}: ${k.last_used}` : t('int.never')}</div></div>
                <${Button} variant="danger-ghost" onClick=${() => revoke(k.token_id)}>${t('int.revoke')}<//>
            </li>`)}</ul>
        </div>
    </div>`;
}

// ---- identities ---------------------------------------------------------------------------

function IdentityForm({ identity, onDone, locked }) {
    const [form, setForm] = useState(identity);
    const [error, setError] = useState('');
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            await saveIdentity(form);
            onDone();
        } catch (err) { setError(errorText(err)); }
    };

    return html`<form onSubmit=${submit} class="stack card-form">
        ${error && html`<div class="alert error" role="alert">${error}</div>`}
        <div class="grid2">
            <label class="field"><span>${t('id.name')}</span><input type="text" value=${form.name} onInput=${set('name')} /></label>
            <label class="field"><span>${t('id.email')}</span><input type="email" required value=${form.email} onInput=${set('email')} /></label>
            <label class="field"><span>${t('id.replyTo')}</span><input type="text" value=${form.reply_to} onInput=${set('reply_to')} /></label>
            <label class="field"><span>${t('id.bcc')}</span><input type="text" value=${form.bcc} onInput=${set('bcc')} /></label>
        </div>
        <label class="field"><span>${t('id.signature')}</span><textarea rows="4" value=${form.signature} onInput=${set('signature')}></textarea></label>
        <label class="check"><input type="checkbox" checked=${form.html_signature} onChange=${set('html_signature')} /> HTML</label>
        <label class="check"><input type="checkbox" checked=${form.standard} onChange=${set('standard')} /> ${t('id.makeDefault')}</label>
        <div class="row end"><${Button} onClick=${onDone}>${t('common.cancel')}<//><${Button} variant="primary" type="submit">${t('common.save')}<//></div>
    </form>`;
}

function Identities() {
    const identities = useStore((s) => s.session.identities);
    const [editing, setEditing] = useState(null); // identity object, or {} for a new one
    const blank = { id: 0, name: '', email: '', reply_to: '', bcc: '', signature: '', html_signature: false, standard: false };

    return html`<div class="settings-section">
        <p class="muted">${t('id.hint')}</p>
        ${!editing && html`<ul class="list-cards">${identities.map((i) => html`<li key=${i.id} class="list-card">
            <${Avatar} name=${i.name} email=${i.email} size=${38} />
            <div class="grow"><strong>${i.name || i.email}</strong>${i.standard && html` <span class="badge quiet">${t('id.default')}</span>`}<div class="muted small">${i.email}</div></div>
            <div class="row"><${Button} onClick=${() => setEditing(i)}>${t('common.edit')}<//>
                ${identities.length > 1 && html`<${Button} variant="danger-ghost" onClick=${() => window.confirm(t('id.confirmDelete')) && deleteIdentity(i.id)}>${t('common.delete')}<//>`}</div>
        </li>`)}</ul>
        <${Button} icon="plus" onClick=${() => setEditing(blank)}>${t('id.add')}<//>`}
        ${editing && html`<${IdentityForm} identity=${editing} onDone=${() => setEditing(null)} />`}
    </div>`;
}

// ---- contacts ------------------------------------------------------------------------------

function ContactForm({ contact, onDone }) {
    const [form, setForm] = useState(contact);
    const [error, setError] = useState('');
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();

        try {
            await api.saveContact(form);
            toast(t('ct.saved'), 'success');
            onDone(true);
        } catch (err) { setError(errorText(err)); }
    };

    return html`<form onSubmit=${submit} class="stack card-form">
        ${error && html`<div class="alert error" role="alert">${error}</div>`}
        <div class="grid2">
            <label class="field"><span>${t('ct.name')}</span><input type="text" value=${form.name} onInput=${set('name')} autofocus /></label>
            <label class="field"><span>${t('ct.email')}</span><input type="email" value=${form.email} onInput=${set('email')} /></label>
            <label class="field"><span>${t('ct.phone')}</span><input type="text" value=${form.phone} onInput=${set('phone')} /></label>
            <label class="field"><span>${t('ct.org')}</span><input type="text" value=${form.organization} onInput=${set('organization')} /></label>
        </div>
        <label class="field"><span>${t('ct.notes')}</span><textarea rows="3" value=${form.notes} onInput=${set('notes')}></textarea></label>
        <div class="row end"><${Button} onClick=${() => onDone(false)}>${t('common.cancel')}<//><${Button} variant="primary" type="submit">${t('common.save')}<//></div>
    </form>`;
}

function Contacts() {
    const [list, setList] = useState(null);
    const [q, setQ] = useState('');
    const [editing, setEditing] = useState(null);
    const timer = useRef(null);

    const load = (query = q) => api.contacts({ q: query }).then((r) => setList(r.contacts)).catch(() => setList([]));

    useEffect(() => { load(''); }, []);

    const onSearch = (e) => {
        setQ(e.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => load(e.target.value), 250);
    };

    if (editing) return html`<${ContactForm} contact=${editing} onDone=${(changed) => { setEditing(null); changed && load(); }} />`;

    return html`<div class="settings-section">
        <div class="row"><label class="search grow"><${Icon} name="search" size=${16} /><input type="search" placeholder=${t('ct.search')} value=${q} onInput=${onSearch} aria-label=${t('ct.search')} /></label>
            <${Button} icon="plus" onClick=${() => setEditing({ id: '', name: '', email: '', phone: '', organization: '', notes: '' })}>${t('ct.add')}<//></div>
        ${list === null && html`<div class="center pad"><${Spinner} /></div>`}
        ${list && !list.length && html`<p class="muted center pad">${t('ct.empty')}</p>`}
        ${list && list.length > 0 && html`<ul class="list-cards">${list.map((c) => html`<li key=${c.id} class="list-card">
            <${Avatar} name=${c.name} email=${c.email} size=${38} />
            <div class="grow"><strong>${c.name || c.email}</strong><div class="muted small">${[c.email, c.phone, c.organization].filter(Boolean).join(' · ')}</div></div>
            <div class="row">
                ${c.email && html`<${Button} onClick=${() => { closeDialog(); openCompose('new', null, { to: [{ name: c.name, email: c.email }] }); }}>${t('ct.write')}<//>`}
                <${Button} onClick=${() => setEditing(c)}>${t('common.edit')}<//>
                <${Button} variant="danger-ghost" onClick=${async () => { if (window.confirm(t('ct.confirmDelete'))) { await api.deleteContact(c.id); load(); } }}>${t('common.delete')}<//>
            </div>
        </li>`)}</ul>`}
    </div>`;
}

// ---- about -----------------------------------------------------------------------------------

function About() {
    const session = useStore((s) => s.session);

    return html`<div class="settings-section about">
        <div class="brand-mark" aria-hidden="true"><${Icon} name="mail" size=${28} /></div>
        <h3>${session.product || 'Webmail'}</h3>
        <p class="muted">${t('about.text')}</p>
        <p>${t('about.version')}: <strong>${session.version || '—'}</strong></p>
        <p><${Button} onClick=${() => openDialog({ type: 'shortcuts' })}>${t('sc.title')}<//> <a class="btn" href="../?classic=1">${t('about.classic')}</a></p>
    </div>`;
}

// ---- dialog -----------------------------------------------------------------------------------

export function SettingsDialog({ tab: initial }) {
    const multi = useStore((s) => !!s.session.accounts);
    const [tab, setTab] = useState(initial || 'general');
    const tabs = [['general', 'sliders', t('settings.general')], ...(multi ? [['accounts', 'users', t('settings.accounts')]] : []), ...(multi ? [['integrations', 'shield', t('settings.integrations')]] : []), ['identities', 'user', t('settings.identities')], ['contacts', 'users', t('settings.contacts')], ['about', 'shield', t('settings.about')]];
    const content = { general: General, accounts: Accounts, integrations: Integrations, identities: Identities, contacts: Contacts, about: About }[tab] || General;

    return html`<${Modal} title=${t('settings.title')} onClose=${closeDialog} wide class="settings">
        <div class="settings-layout">
            <nav class="settings-nav" role="tablist" aria-orientation="vertical">${tabs.map(([id, , label]) => html`<button type="button" key=${id} role="tab" aria-selected=${tab === id} class=${tab === id ? 'on' : ''} onClick=${() => setTab(id)}>${label}</button>`)}</nav>
            <div class="settings-content" role="tabpanel"><${content} /></div>
        </div>
    <//>`;
}
