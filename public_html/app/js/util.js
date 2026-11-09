// Small helpers without dependencies.

export function debounce(fn, ms) {
    let timer;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

export function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function initials(name, email) {
    const source = (name || email || '?').replace(/<.*>/, '').trim();
    const words = source.split(/[\s._@-]+/).filter(Boolean);

    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Stable pastel colour for an address, so a sender always looks the same. */
export function colorFor(text) {
    let hash = 0;

    for (const ch of String(text || '?').toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    return `hsl(${hash % 360} 55% 45%)`;
}

export function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;

    return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Short date for lists: time today, weekday this week, day+month this year, else full date. */
export function fmtListDate(iso, locale) {
    if (!iso) return '';

    const d = new Date(iso);
    const now = new Date();
    const days = (now - d) / 86400000;

    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (days < 6 && days >= 0) return d.toLocaleDateString(locale, { weekday: 'short' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtFullDate(iso, locale) {
    return iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' }) : '';
}

export function isEmail(value) {
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

/** "Name <a@b.c>", "a@b.c" or "Name, <a@b.c>" -> { name, email } */
export function parseAddress(text) {
    const match = String(text).trim().match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/);

    if (match) return { name: (match[1] || '').trim(), email: match[2].trim() };

    return { name: '', email: String(text).trim() };
}

export function formatAddress(a) {
    return a.name ? `${a.name} <${a.email}>` : a.email;
}

/** Split pasted text like "a@b.c, Name <d@e.f>; g@h.i" at commas/semicolons/newlines outside quotes and brackets. */
export function splitAddresses(text) {
    const out = [];
    let current = '';
    let quoted = false;
    let angle = false;

    for (const ch of String(text)) {
        if (ch === '"') quoted = !quoted;
        if (!quoted && ch === '<') angle = true;
        if (!quoted && ch === '>') angle = false;

        if (!quoted && !angle && /[,;\n]/.test(ch)) {
            if (current.trim()) out.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) out.push(current.trim());

    return out;
}

export function uid() {
    return Math.random().toString(36).slice(2, 10);
}

export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
