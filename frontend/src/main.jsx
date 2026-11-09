import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { createRoot } from 'react-dom/client';
import { useStore, setState } from './lib/store.js';
import { boot } from './lib/actions.js';
import { Login } from './components/Login.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { MessageList } from './components/MessageList.jsx';
import { Reader } from './components/Reader.jsx';
import { ComposeWindows } from './components/Compose.jsx';
import { Dialogs } from './components/Dialogs.jsx';
import { Toasts, Spinner, cx } from './ui.jsx';
import { installShortcuts } from './lib/shortcuts.js';

function App() {
    useStore((s) => s.langVersion); // re-render everything when the language changes

    const booted = useStore((s) => s.booted);
    const authenticated = useStore((s) => !!(s.session && s.session.authenticated));
    const sidebarOpen = useStore((s) => s.sidebarOpen);
    const reading = useStore((s) => !!s.current);

    if (!booted) return <div className="grid h-full place-items-center text-secondary"><Spinner size={30} /></div>;

    return (
        <>
            {authenticated ? (
                <div className="flex h-full">
                    <Sidebar />
                    {sidebarOpen && <div className="fixed inset-0 z-[65] bg-black/40 lg:hidden" onClick={() => setState({ sidebarOpen: false })} />}
                    <main className={cx('grid min-w-0 flex-1 grid-rows-[minmax(0,1fr)]', reading ? 'lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]' : 'mx-auto max-w-5xl grid-cols-[minmax(0,1fr)]')}>
                        <MessageList />
                        <Reader />
                    </main>
                    <ComposeWindows />
                </div>
            ) : <Login />}
            <Dialogs />
            <Toasts />
        </>
    );
}

createRoot(document.getElementById('root')).render(<App />);
installShortcuts();
boot();
