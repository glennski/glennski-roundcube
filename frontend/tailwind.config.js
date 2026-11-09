import containerQueries from "@tailwindcss/container-queries";
// Design tokens taken from the "Aether" mockup. Colours are CSS variables (see src/index.css) so that
// light, dark and the user's theme setting need no dark: variants.
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const names = [
    'surface', 'surface-bright', 'surface-dim', 'surface-variant',
    'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest',
    'on-surface', 'on-surface-variant', 'outline', 'outline-variant', 'secondary', 'secondary-fixed', 'on-secondary-fixed',
    'primary', 'on-primary', 'accent', 'accent-soft', 'error', 'error-container', 'on-error-container', 'ok', 'star',
];

export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: Object.fromEntries(names.map((n) => [n, c(n)])),
            borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem' },
            spacing: { 'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '0.875rem', 'space-lg': '1.25rem', 'space-xl': '2rem', gutter: '1.5rem', margin: '2.5rem' },
            fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'] },
            fontSize: {
                'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '500' }],
                'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
                'label-lg': ['13.5px', { lineHeight: '20px', letterSpacing: '-0.005em', fontWeight: '500' }],
                'body-sm': ['12px', { lineHeight: '18px', letterSpacing: '0.005em' }],
                'body-md': ['13.5px', { lineHeight: '20px' }],
                'body-lg': ['15px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
                'headline-sm': ['16px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
                'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
                'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '600' }],
            },
            boxShadow: { pop: '0 10px 30px rgb(0 0 0 / 0.12)', modal: '0 24px 64px rgb(0 0 0 / 0.25)' },
        },
    },
    plugins: [containerQueries],
};
