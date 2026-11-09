import { Modal } from '../ui.jsx';
import { t } from '../lib/i18n.js';
import { useStore } from '../lib/store.js';
import { closeDialog } from '../lib/actions.js';
import { SettingsDialog } from './Settings.jsx';

export function ImageDialog({ url, name }) {
    return (
        <Modal title={name} onClose={closeDialog} wide>
            <div className="grid place-items-center"><img src={url} alt={name} className="max-h-[72dvh] max-w-full rounded-lg" /></div>
        </Modal>
    );
}

const SHORTCUTS = [
    ['sc.nav', [['j / k', 'sc.next', 'sc.prev'], ['Enter / o', 'sc.open'], ['Esc / u', 'sc.close'], ['g i', 'sc.inbox'], ['/', 'sc.search'], ['?', 'sc.help']]],
    ['sc.actions', [['c', 'sc.compose'], ['r', 'sc.reply'], ['a', 'sc.replyall'], ['f', 'sc.forward'], ['e', 'sc.archive'], ['#  /  Delete', 'sc.delete'], ['s', 'sc.star'], ['Shift+U', 'sc.unread'], ['Ctrl/⌘ + Enter', 'sc.send']]],
];

export function ShortcutsDialog() {
    return (
        <Modal title={t('sc.title')} onClose={closeDialog}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
                {SHORTCUTS.map(([title, rows]) => (
                    <section key={title}>
                        <h4 className="caps mb-2.5">{t(title)}</h4>
                        <dl className="m-0 grid gap-2">
                            {rows.map(([keys, ...labels]) => (
                                <div key={keys} className="flex justify-between gap-3">
                                    <dt className="flex gap-1">{keys.split(' / ').map((k, i) => <span key={k}>{i ? ' / ' : ''}<kbd className="kbd">{k}</kbd></span>)}</dt>
                                    <dd className="m-0 text-right text-secondary">{labels.map((l) => t(l)).join(' / ')}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </Modal>
    );
}

export function Dialogs() {
    const dialog = useStore((s) => s.dialog);

    if (!dialog) return null;
    if (dialog.type === 'settings') return <SettingsDialog tab={dialog.tab} />;
    if (dialog.type === 'image') return <ImageDialog url={dialog.url} name={dialog.name} />;
    if (dialog.type === 'shortcuts') return <ShortcutsDialog />;

    return null;
}
