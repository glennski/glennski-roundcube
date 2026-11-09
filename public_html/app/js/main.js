import { html, render } from './vendor/htm-preact.mjs';
import { useStore, setState } from './store.js';
import { boot } from './actions.js';
import { Login } from './components/login.js';
import { Sidebar } from './components/sidebar.js';
import { MessageList } from './components/list.js';
import { Reader } from './components/reader.js';
import { ComposeWindows } from './components/compose.js';
import { Dialogs } from './components/dialogs.js';
import { Toasts, Spinner } from './ui.js';
import { installShortcuts } from './shortcuts.js';

function App() {
    useStore((s) => s.langVersion); // re-render everything when the language changes

    const booted = useStore((s) => s.booted);
    const authenticated = useStore((s) => !!(s.session && s.session.authenticated));
    const sidebarOpen = useStore((s) => s.sidebarOpen);

    if (!booted) return html`<div class="splash"><${Spinner} size=${32} /></div>`;

    return html`
        ${authenticated
            ? html`<div class="app">
                <${Sidebar} />
                ${sidebarOpen && html`<div class="scrim" onClick=${() => setState({ sidebarOpen: false })}></div>`}
                <main class="main">
                    <${MessageList} />
                    <${Reader} />
                </main>
                <${ComposeWindows} />
            </div>`
            : html`<${Login} />`}
        <${Dialogs} />
        <${Toasts} />
    `;
}

render(html`<${App} />`, document.getElementById('root'));
installShortcuts();
boot();
