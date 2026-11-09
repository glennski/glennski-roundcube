import { Icon } from '../icons.jsx';
import { Button } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { useStore } from '../lib/store.js';
import { logout, switchAccount } from '../lib/actions.js';
import { AddMailbox } from './Settings.jsx';

/** Shown to an account that has no mailbox yet: add the first one, then the mail view opens. */
export function Welcome() {
    const session = useStore((s) => s.session);

    return (
        <main className="h-full overflow-auto p-6">
            <section className="mx-auto grid w-full max-w-[640px] gap-6 py-8">
                <div className="flex items-center justify-between">
                    <div className="brand-mark" aria-hidden="true"><Icon name="mail" size={18} /></div>
                    <Button variant="danger" icon="logout" onClick={logout}>{t('common.logout')}</Button>
                </div>
                <div className="grid gap-1">
                    <h1 className="text-headline-lg">{t('welcome.title', { name: session.user.username })}</h1>
                    <p className="text-body-lg text-secondary">{t('welcome.text')}</p>
                </div>
                <AddMailbox onAdded={(state) => switchAccount(state.mailboxes[0].id)} />
            </section>
        </main>
    );
}
