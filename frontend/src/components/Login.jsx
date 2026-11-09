import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Button, Spinner } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { login } from '../lib/actions.js';
import { useStore } from '../lib/store.js';

export function Login() {
    const session = useStore((s) => s.session);
    const bootError = useStore((s) => s.bootError);
    const multi = session && session.mode === 'multi';
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');

        try {
            await login(user.trim(), pass);
        } catch (err) {
            const known = { 429: t('login.rate'), 502: t('login.server') };

            setError(known[err.status] || (err.status === 401 || err.status === 400 ? t('login.failed') : err.message));
            setPass('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="grid h-full place-items-center overflow-auto p-6">
            <section className="grid w-full max-w-[380px] gap-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-on-primary" aria-hidden="true"><Icon name="mail" size={18} /></div>
                <div className="grid gap-1">
                    <h1 className="text-headline-lg">{t('login.title')}</h1>
                    <p className="text-body-lg text-secondary">{t(multi ? 'login.subtitle.multi' : 'login.subtitle.single')}</p>
                </div>

                {(error || bootError) && <div className="alert-error" role="alert">{error || bootError}</div>}

                <form onSubmit={submit} className="grid gap-4">
                    <label className="field">
                        <span>{t(multi ? 'login.user.multi' : 'login.user.single')}</span>
                        <input className="input" type={multi ? 'text' : 'email'} name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" required autoFocus value={user} onChange={(e) => setUser(e.target.value)} />
                    </label>
                    <label className="field">
                        <span>{t('login.password')}</span>
                        <span className="relative block">
                            <input className="input pr-10" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
                            <button type="button" className="icon-btn absolute right-1 top-1/2 -translate-y-1/2" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}><Icon name="eye" size={17} /></button>
                        </span>
                    </label>
                    <Button variant="primary" type="submit" className="w-full py-2.5" busy={busy}>{busy ? <Spinner size={16} /> : t('login.submit')}</Button>
                </form>
                <p className="text-center text-body-sm text-secondary"><a className="underline hover:text-on-surface" href="../?classic=1">{t('login.classic')}</a></p>
            </section>
        </main>
    );
}
