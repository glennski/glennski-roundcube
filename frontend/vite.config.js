import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The build lands in public_html/app, which is what the web server delivers (and what is committed,
// so a plain PHP upload works without Node).
export default defineConfig({
    base: './',
    plugins: [react()],
    build: { outDir: '../public_html/app', emptyOutDir: true, assetsInlineLimit: 0 },
    server: { proxy: { '/api.php': 'http://localhost:3002' } },
});
