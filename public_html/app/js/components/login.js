import { html, useState } from '../vendor/htm-preact.mjs';
import { Icon } from '../icons.js';
import { Button, Spinner } from '../ui.js';
import { t } from '../i18n.js';
import { login } from '../actions.js';
import { useStore } from '../store.js';

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

    return html`<main class="login">
        <section class="login-card">
            <div class="brand-mark" aria-hidden="true"><${Icon} name="mail" size=${28} /></div>
            <h1>${t('login.title')}</h1>
            <p class="muted">${t(multi ? 'login.subtitle.multi' : 'login.subtitle.single')}</p>

            ${(error || bootError) && html`<div class="alert error" role="alert">${error || bootError}</div>`}

            <form onSubmit=${submit} class="stack">
                <label class="field">
                    <span>${t(multi ? 'login.user.multi' : 'login.user.single')}</span>
                    <input type=${multi ? 'text' : 'email'} name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus value=${user} onInput=${(e) => setUser(e.target.value)} />
                </label>
                <label class="field">
                    <span>${t('login.password')}</span>
                    <span class="input-affix">
                        <input type=${show ? 'text' : 'password'} name="password" autocomplete="current-password" required value=${pass} onInput=${(e) => setPass(e.target.value)} />
                        <button type="button" class="affix-btn" aria-label=${show ? 'Hide password' : 'Show password'} onClick=${() => setShow(!show)}><${Icon} name="eye" size=${18} /></button>
                    </span>
                </label>
                <${Button} variant="primary" type="submit" class="block" busy=${busy}>${busy ? html`<${Spinner} size=${16} />` : t('login.submit')}<//>
            </form>
            <p class="login-foot"><a href="../?classic=1">${t('login.classic')}</a></p>
        </section>
    </main>`;
}
