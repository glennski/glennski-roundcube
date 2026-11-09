// Client for api.php/v1. The session lives in the Roundcube cookie; every call carries the request token.

// the app lives in <install>/app/, the API one level up
const BASE = '../api.php/v1/';

let token = '';
let onAuthLost = () => {};

export class ApiError extends Error {
    constructor(status, code, message) {
        super(message || code);
        this.status = status;
        this.code = code;
    }
}

export function setAuthLostHandler(fn) {
    onAuthLost = fn;
}

export function setToken(value) {
    if (value) token = value;
}

async function request(method, path, { body, formData, retry = true } = {}) {
    const headers = { 'X-Roundcube-Request': token };
    let payload;

    if (formData) {
        payload = formData;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let response;

    try {
        response = await fetch(BASE + path, { method, headers, body: payload, credentials: 'same-origin' });
    } catch (e) {
        throw new ApiError(0, 'network', 'The server could not be reached');
    }

    const data = await response.json().catch(() => ({}));

    if (data && data.token) token = data.token;

    if (!response.ok) {
        const error = data.error || {};

        // stale token (e.g. after the session was replaced in another tab): fetch a new one and retry once
        if (response.status === 403 && error.code === 'invalid_token' && retry) {
            await request('GET', 'session', { retry: false });

            return request(method, path, { body, formData, retry: false });
        }

        if (response.status === 401 && path !== 'auth/login') onAuthLost(error.code);

        throw new ApiError(response.status, error.code || 'error', error.message || `HTTP ${response.status}`);
    }

    return data;
}

const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const api = {
    session: () => request('GET', 'session'),
    login: (username, password, host) => request('POST', 'auth/login', { body: { username, password, host } }),
    logout: () => request('POST', 'auth/logout', { body: {} }),

    folders: () => request('GET', 'folders'),
    createFolder: (name, parent) => request('POST', 'folders/create', { body: { name, parent } }),
    renameFolder: (folder, name) => request('POST', 'folders/rename', { body: { folder, name } }),
    deleteFolder: (folder) => request('POST', 'folders/delete', { body: { folder } }),
    emptyFolder: (folder) => request('POST', 'folders/empty', { body: { folder } }),

    messages: (params) => request('GET', `messages?${q(params)}`),
    message: (folder, uid, { images, peek } = {}) => request('GET', `message?${q({ folder, uid, images: images ? 1 : 0, peek: peek ? 1 : 0 })}`),
    act: (folder, uids, action, target) => request('POST', 'messages/actions', { body: { folder, uids, action, target } }),
    partUrl: (folder, uid, part, inline) => `${BASE}part?${q({ folder, uid, part, inline: inline ? 1 : 0, _token: token })}`,

    contacts: (params) => request('GET', `contacts?${q(params || {})}`),
    suggest: (text) => request('GET', `contacts/suggest?${q({ q: text })}`),
    saveContact: (contact) => request('POST', 'contacts/save', { body: contact }),
    deleteContact: (id) => request('POST', 'contacts/delete', { body: { id } }),

    identities: () => request('GET', 'identities'),
    saveIdentity: (identity) => request('POST', 'identities/save', { body: identity }),
    deleteIdentity: (id) => request('POST', 'identities/delete', { body: { id } }),

    settings: () => request('GET', 'settings'),
    saveSettings: (settings) => request('POST', 'settings', { body: settings }),

    accounts: () => request('GET', 'accounts'),
    detect: (email) => request('POST', 'accounts/detect', { body: { email } }),
    addAccount: (box) => request('POST', 'accounts/add', { body: box }),
    removeAccount: (id) => request('POST', 'accounts/remove', { body: { id } }),
    defaultAccount: (id) => request('POST', 'accounts/default', { body: { id } }),
    switchAccount: (id) => request('POST', 'accounts/switch', { body: { id } }),
    changePassword: (current, next) => request('POST', 'accounts/password', { body: { current, new: next } }),

    /** Send or save a draft; reports upload progress (0..1). */
    send(payload, files, onProgress) {
        const form = new FormData();

        form.append('payload', JSON.stringify(payload));
        files.forEach((file) => form.append('attachments[]', file, file.name));

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.open('POST', `${BASE}send`);
            xhr.setRequestHeader('X-Roundcube-Request', token);
            xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
            xhr.onerror = () => reject(new ApiError(0, 'network', 'The server could not be reached'));
            xhr.onload = () => {
                let data = {};

                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) { /* not JSON, handled below */ }

                if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
                if (xhr.status === 401) onAuthLost((data.error || {}).code);

                reject(new ApiError(xhr.status, (data.error || {}).code || 'error', (data.error || {}).message || `HTTP ${xhr.status}`));
            };
            xhr.send(form);
        });
    },
};
