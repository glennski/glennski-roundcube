import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { api } from '../lib/api.js';
import { Avatar, Button, Modal, Spinner, cx } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { useStore } from '../lib/store.js';
import { closeDialog, deleteIdentity, openCompose, saveIdentity, saveSettings, setAccounts, switchAccount, toast, openDialog } from '../lib/actions.js';

const errorText = (e) => (e && e.message) || t('common.error');

const card = 'card-form grid gap-4 rounded-xl bg-surface-container-low p-4';
const listCard = 'list-card flex flex-wrap items-center gap-3 rounded-xl bg-surface-container-low p-3';
const grid2 = 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5';
const muted = 'text-body-sm text-secondary';
const pill = 'rounded-full bg-surface-container-highest px-2 py-0.5 text-label-sm font-medium';

function Segmented({ value, options, onChange, label }) {
    return (
        <div className="inline-flex gap-0.5 rounded-lg bg-surface-container-low p-0.5" role="radiogroup" aria-label={label}>
            {options.map(([v, text]) => (
                <button type="button" key={v} role="radio" aria-checked={value === v} className={cx('rounded-md px-3.5 py-1.5 text-label-md transition-all', value === v ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-secondary hover:text-on-surface')} onClick={() => onChange(v)}>{text}</button>
            ))}
        </div>
    );
}

function Row({ label, hint, children }) {
    return (
        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <div><strong className="text-label-lg">{label}</strong>{hint && <p className={muted}>{hint}</p>}</div>
            <div>{children}</div>
        </div>
    );
}

const Select = (props) => <select className="input !w-auto min-w-40" {...props} />;
const Error = ({ children }) => (children ? <div className="alert-error" role="alert">{children}</div> : null);

// ---- general --------------------------------------------------------------------------

function General() {
    const settings = useStore((s) => s.session.settings);
    const [languages, setLanguages] = useState(null);

    useEffect(() => {
        api.settings().then((r) => setLanguages(r.languages)).catch(() => setLanguages({}));
    }, []);

    return (
        <div className="grid gap-5">
            <Row label={t('settings.language')}>
                <Select value={settings.language} onChange={(e) => saveSettings({ language: e.target.value })} disabled={!languages}>
                    {languages ? Object.entries(languages).map(([code, name]) => <option key={code} value={code}>{name}</option>) : <option>{settings.language}</option>}
                </Select>
            </Row>
            <Row label={t('settings.theme')}>
                <Segmented label={t('settings.theme')} value={settings.theme} onChange={(theme) => saveSettings({ theme })} options={[['auto', t('settings.theme.auto')], ['light', t('settings.theme.light')], ['dark', t('settings.theme.dark')]]} />
            </Row>
            <Row label={t('settings.density')}>
                <Segmented label={t('settings.density')} value={settings.density} onChange={(density) => saveSettings({ density })} options={[['comfortable', t('settings.density.comfortable')], ['compact', t('settings.density.compact')]]} />
            </Row>
            <Row label={t('settings.pagesize')}>
                <Select value={settings.mail_pagesize} onChange={(e) => saveSettings({ mail_pagesize: Number(e.target.value) })}>{[25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
            </Row>
            <Row label={t('settings.editor')}>
                <Segmented label={t('settings.editor')} value={settings.htmleditor === 0 ? 0 : 1} onChange={(htmleditor) => saveSettings({ htmleditor })} options={[[1, t('settings.editor.html')], [0, t('settings.editor.text')]]} />
            </Row>
        </div>
    );
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

    return (
        <form onSubmit={submit} className={card}>
            <h4 className="text-headline-sm">{t('acc.add')}</h4>
            <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5"><span className={muted}>{t('acc.quick')}</span>{PRESETS.map(([name, imap, smtp]) => <button type="button" key={name} className="chip bg-surface-container-lowest" onClick={() => setForm({ ...form, imap_host: imap, smtp_host: smtp })}>{name}</button>)}</div>
                <p className={muted}>{t('acc.appPassword')}</p>
            </div>
            <Error>{error}</Error>
            <div className={grid2}>
                <label className="field"><span>{t('acc.email')}</span><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="off" /></label>
                <label className="field"><span>{t('acc.password')}</span><input className="input" type="password" required value={form.password} onChange={set('password')} autoComplete="new-password" /></label>
            </div>
            <div className="flex items-center gap-2"><Button onClick={detect} disabled={!form.email}>{t('acc.detect')}</Button><span className={cx(muted, status === 'ok' && '!text-ok')} aria-live="polite">{status === 'ok' ? t('acc.detected') : status === 'none' ? t('acc.notDetected') : ''}</span></div>
            <div className={grid2}>
                <label className="field"><span>{t('acc.imap')}</span><input className="input" type="text" required placeholder="ssl://imap.example.com:993" value={form.imap_host} onChange={set('imap_host')} /></label>
                <label className="field"><span>{t('acc.smtp')}</span><input className="input" type="text" placeholder="tls://smtp.example.com:587" value={form.smtp_host} onChange={set('smtp_host')} /></label>
                <label className="field"><span>{t('acc.user')} <small className="text-secondary">({t('acc.userHint')})</small></span><input className="input" type="text" value={form.imap_user} onChange={set('imap_user')} /></label>
                <label className="field"><span>{t('acc.label')} <small className="text-secondary">({t('common.optional')})</small></span><input className="input" type="text" value={form.label} onChange={set('label')} /></label>
            </div>
            <div className="flex justify-end"><Button variant="primary" type="submit" busy={busy}>{busy ? <Spinner size={16} /> : t('common.add')}</Button></div>
        </form>
    );
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

    return (
        <form onSubmit={submit} className={card}>
            <h4 className="text-headline-sm">{t('acc.changePassword')}</h4>
            <Error>{error}</Error>
            <div className={grid2}>
                <label className="field"><span>{t('acc.currentPassword')}</span><input className="input" type="password" required autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>
                <label className="field"><span>{t('acc.newPassword')}</span><input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
            </div>
            <div className="flex justify-end"><Button type="submit">{t('acc.changePassword')}</Button></div>
        </form>
    );
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

    return (
        <div className="grid gap-5">
            <p className="text-secondary">{t('acc.hint')}</p>
            <ul className="m-0 grid list-none gap-2.5 p-0">
                {accounts.mailboxes.map((m) => (
                    <li key={m.id} className={listCard}>
                        <Avatar name={m.label} email={m.email} size={34} />
                        <div className="min-w-0 flex-1">
                            <strong>{m.label || m.email}</strong>
                            {m.id === accounts.current && <span className={cx(pill, 'ml-2 !bg-ok/15 text-ok')}>{t('acc.current')}</span>}
                            {m.default && <span className={cx(pill, 'ml-2 text-secondary')}>{t('acc.default')}</span>}
                            <div className={muted}>{m.email} · {m.imap_host}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {m.id !== accounts.current && <Button onClick={() => switchAccount(m.id)}>{t('acc.open')}</Button>}
                            {!m.default && <Button onClick={() => run(() => api.defaultAccount(m.id))}>{t('acc.makeDefault')}</Button>}
                            <Button variant="danger" onClick={() => window.confirm(t('acc.confirmRemove')) && run(() => api.removeAccount(m.id), t('acc.removed'))}>{t('common.remove')}</Button>
                        </div>
                    </li>
                ))}
            </ul>
            <AddMailbox />
            <ChangePassword />
        </div>
    );
}

// ---- integrations (MCP) ---------------------------------------------------------------------

function Copy({ text }) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast(t('int.copied'), 'success');
        } catch (e) { /* the field is selectable as a fallback */ }
    };

    return <Button onClick={copy}>{t('int.copy')}</Button>;
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
    const select = (e) => e.target.select();

    return (
        <div className="grid gap-5">
            <p className="text-secondary">{t('int.hint')}</p>
            <label className="field"><span>{t('int.endpoint')}</span><span className="flex items-end gap-2"><input className="input min-w-0" type="text" readOnly value={endpoint} onFocus={select} /><Copy text={endpoint} /></span></label>
            <form onSubmit={create} className="flex items-end gap-2">
                <label className="field min-w-0 flex-1"><span>{t('int.name')}</span><input className="input" type="text" maxLength={100} placeholder={t('int.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} /></label>
                <Button variant="primary" type="submit">{t('int.create')}</Button>
            </form>
            {fresh && (
                <div className="token-new grid gap-1.5 rounded-xl bg-accent-soft p-3.5" role="status">
                    <strong>{t('int.created')}</strong>
                    <span className="flex items-end gap-2"><input className="input min-w-0" type="text" readOnly value={fresh} onFocus={select} aria-label="Token" /><Copy text={fresh} /></span>
                </div>
            )}
            <div className="grid gap-1.5"><h4 className="text-headline-sm">{t('int.example')}</h4><pre className="code m-0 select-all whitespace-pre-wrap break-all rounded-xl bg-surface-container-low p-3.5 font-mono text-[12px] leading-relaxed">{command}</pre></div>
            <div className="grid gap-2">
                <h4 className="text-headline-sm">{t('int.tokens')}</h4>
                {tokens && !tokens.length && <p className="text-secondary">{t('int.none')}</p>}
                <ul className="m-0 grid list-none gap-2.5 p-0">
                    {(tokens || []).map((k) => (
                        <li key={k.token_id} className={listCard}>
                            <div className="min-w-0 flex-1"><strong>{k.name || 'MCP'}</strong><div className={muted}>{k.last_used ? `${t('int.lastUsed')}: ${k.last_used}` : t('int.never')}</div></div>
                            <Button variant="danger" onClick={() => revoke(k.token_id)}>{t('int.revoke')}</Button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ---- identities ---------------------------------------------------------------------------

function IdentityForm({ identity, onDone }) {
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

    return (
        <form onSubmit={submit} className={card}>
            <Error>{error}</Error>
            <div className={grid2}>
                <label className="field"><span>{t('id.name')}</span><input className="input" type="text" value={form.name} onChange={set('name')} /></label>
                <label className="field"><span>{t('id.email')}</span><input className="input" type="email" required value={form.email} onChange={set('email')} /></label>
                <label className="field"><span>{t('id.replyTo')}</span><input className="input" type="text" value={form.reply_to} onChange={set('reply_to')} /></label>
                <label className="field"><span>{t('id.bcc')}</span><input className="input" type="text" value={form.bcc} onChange={set('bcc')} /></label>
            </div>
            <label className="field"><span>{t('id.signature')}</span><textarea className="input resize-y" rows={4} value={form.signature} onChange={set('signature')} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.html_signature} onChange={set('html_signature')} /> HTML</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.standard} onChange={set('standard')} /> {t('id.makeDefault')}</label>
            <div className="flex justify-end gap-2"><Button onClick={onDone}>{t('common.cancel')}</Button><Button variant="primary" type="submit">{t('common.save')}</Button></div>
        </form>
    );
}

function Identities() {
    const identities = useStore((s) => s.session.identities);
    const [editing, setEditing] = useState(null); // identity object, or blank for a new one
    const blank = { id: 0, name: '', email: '', reply_to: '', bcc: '', signature: '', html_signature: false, standard: false };

    return (
        <div className="grid gap-5">
            <p className="text-secondary">{t('id.hint')}</p>
            {!editing && (
                <>
                    <ul className="m-0 grid list-none gap-2.5 p-0">
                        {identities.map((i) => (
                            <li key={i.id} className={listCard}>
                                <Avatar name={i.name} email={i.email} size={34} />
                                <div className="min-w-0 flex-1"><strong>{i.name || i.email}</strong>{i.standard && <span className={cx(pill, 'ml-2 text-secondary')}>{t('id.default')}</span>}<div className={muted}>{i.email}</div></div>
                                <div className="flex gap-1.5">
                                    <Button onClick={() => setEditing(i)}>{t('common.edit')}</Button>
                                    {identities.length > 1 && <Button variant="danger" onClick={() => window.confirm(t('id.confirmDelete')) && deleteIdentity(i.id)}>{t('common.delete')}</Button>}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div><Button icon="plus" onClick={() => setEditing(blank)}>{t('id.add')}</Button></div>
                </>
            )}
            {editing && <IdentityForm identity={editing} onDone={() => setEditing(null)} />}
        </div>
    );
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

    return (
        <form onSubmit={submit} className={card}>
            <Error>{error}</Error>
            <div className={grid2}>
                <label className="field"><span>{t('ct.name')}</span><input className="input" type="text" value={form.name} onChange={set('name')} autoFocus /></label>
                <label className="field"><span>{t('ct.email')}</span><input className="input" type="email" value={form.email} onChange={set('email')} /></label>
                <label className="field"><span>{t('ct.phone')}</span><input className="input" type="text" value={form.phone} onChange={set('phone')} /></label>
                <label className="field"><span>{t('ct.org')}</span><input className="input" type="text" value={form.organization} onChange={set('organization')} /></label>
            </div>
            <label className="field"><span>{t('ct.notes')}</span><textarea className="input resize-y" rows={3} value={form.notes} onChange={set('notes')} /></label>
            <div className="flex justify-end gap-2"><Button onClick={() => onDone(false)}>{t('common.cancel')}</Button><Button variant="primary" type="submit">{t('common.save')}</Button></div>
        </form>
    );
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

    if (editing) return <ContactForm contact={editing} onDone={(changed) => { setEditing(null); changed && load(); }} />;

    return (
        <div className="grid gap-4">
            <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-container-low px-3 text-outline focus-within:bg-surface-container-lowest focus-within:ring-1 focus-within:ring-outline-variant">
                    <Icon name="search" size={16} />
                    <input type="search" className="min-w-0 flex-1 border-0 bg-transparent py-2 text-on-surface outline-none" placeholder={t('ct.search')} value={q} onChange={onSearch} aria-label={t('ct.search')} />
                </label>
                <Button icon="plus" onClick={() => setEditing({ id: '', name: '', email: '', phone: '', organization: '', notes: '' })}>{t('ct.add')}</Button>
            </div>
            {list === null && <div className="grid place-items-center p-8"><Spinner /></div>}
            {list && !list.length && <p className="p-8 text-center text-secondary">{t('ct.empty')}</p>}
            {list && list.length > 0 && (
                <ul className="m-0 grid list-none gap-2.5 p-0">
                    {list.map((c) => (
                        <li key={c.id} className={listCard}>
                            <Avatar name={c.name} email={c.email} size={34} />
                            <div className="min-w-0 flex-1"><strong>{c.name || c.email}</strong><div className={muted}>{[c.email, c.phone, c.organization].filter(Boolean).join(' · ')}</div></div>
                            <div className="flex flex-wrap gap-1.5">
                                {c.email && <Button onClick={() => { closeDialog(); openCompose('new', null, { to: [{ name: c.name, email: c.email }] }); }}>{t('ct.write')}</Button>}
                                <Button onClick={() => setEditing(c)}>{t('common.edit')}</Button>
                                <Button variant="danger" onClick={async () => { if (window.confirm(t('ct.confirmDelete'))) { await api.deleteContact(c.id); load(); } }}>{t('common.delete')}</Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ---- about -----------------------------------------------------------------------------------

function About() {
    const session = useStore((s) => s.session);

    return (
        <div className="grid justify-items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-on-primary" aria-hidden="true"><Icon name="mail" size={18} /></div>
            <h3 className="text-headline-md">{session.product || 'Webmail'}</h3>
            <p className="text-secondary">{t('about.text')}</p>
            <p>{t('about.version')}: <strong>{session.version || '—'}</strong></p>
            <p className="flex flex-wrap gap-2"><Button onClick={() => openDialog({ type: 'shortcuts' })}>{t('sc.title')}</Button> <a className="btn" href="../?classic=1">{t('about.classic')}</a></p>
        </div>
    );
}

// ---- dialog -----------------------------------------------------------------------------------

export function SettingsDialog({ tab: initial }) {
    const multi = useStore((s) => !!s.session.accounts);
    const [tab, setTab] = useState(initial || 'general');
    const tabs = [['general', t('settings.general')], ...(multi ? [['accounts', t('settings.accounts')], ['integrations', t('settings.integrations')]] : []), ['identities', t('settings.identities')], ['contacts', t('settings.contacts')], ['about', t('settings.about')]];
    const Content = { general: General, accounts: Accounts, integrations: Integrations, identities: Identities, contacts: Contacts, about: About }[tab] || General;

    return (
        <Modal title={t('settings.title')} onClose={closeDialog} wide className="settings" bodyClass="p-0">
            <div className="grid min-h-[440px] grid-cols-[180px_minmax(0,1fr)] max-sm:grid-cols-1">
                <nav className="flex flex-col content-start gap-0.5 p-3 max-sm:flex-row max-sm:overflow-auto max-sm:p-2" role="tablist" aria-orientation="vertical">
                    {tabs.map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={cx('rounded-lg px-3 py-2 text-left text-label-lg transition-colors max-sm:whitespace-nowrap', tab === id ? 'bg-surface-container-highest text-on-surface' : 'text-secondary hover:bg-surface-container-high hover:text-on-surface')} onClick={() => setTab(id)}>{label}</button>)}
                </nav>
                <div className="max-h-[calc(86dvh-70px)] overflow-auto p-6 pt-2 max-sm:p-4" role="tabpanel"><Content /></div>
            </div>
        </Modal>
    );
}
