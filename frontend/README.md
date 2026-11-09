# Web interface (source)

React + Tailwind CSS, built with Vite. The build output goes to `../public_html/app/` and **is committed**, so
the interface also works when the folder is uploaded to a plain PHP server (no Node needed there). The Docker
image builds it again from these sources, so the image never depends on the committed files.

```
npm install        # once
npm run build      # -> ../public_html/app  (commit the result)
npm run dev        # Vite dev server on :5173, /api.php is proxied to http://localhost:3002
```

* `src/lib/` - state store, API client, actions, i18n (English/German), keyboard shortcuts. No UI code.
* `src/components/` - the screens: sidebar, message list, reader, compose windows, settings, dialogs.
* `src/ui.jsx`, `src/icons.jsx` - shared building blocks and the inline SVG icon set.
* `tailwind.config.js` + `src/index.css` - the design tokens (Aether look). Colours are CSS variables, so
  light, dark and the user's theme setting work without `dark:` variants.

The page is delivered with a strict Content-Security-Policy (`index.html`): no external scripts, styles or fonts.
The typeface (Plus Jakarta Sans) is bundled by the build.

## Rule for markup that tests rely on

`tests/e2e/ui_test.py` finds elements by role/aria label and a few marker classes (`row`, `row-main`, `compose`,
`message`, `banner`, `bulk-bar`, `chip-addr`, `list-card`, ...). Keep them when restyling.

## Design system (`public/design/`)

Framework-free CSS that both the web interface and the installer (`installer/firstrun.php`) load from
`/app/design/`. Open `app/design/index.html` in a running install to see every primitive in light and dark.

* `tokens.css` - the Plus Jakarta Sans font faces, colours (as RGB channels), radii and shadows. Light by default,
  dark by system setting or `<html data-theme>`. Tailwind reads the same variables (`tailwind.config.js`), so there is
  one definition of every colour.
* `primitives.css` - `btn` (`btn-primary`, `btn-danger`), `icon-btn`, `input`, `field`, `hint`, `status`, `chip`,
  `kbd`, `code`, `caps`, `menu-item`, `alert-error`, `brand-mark`, `card`, `card-form`, `segmented`, `tile`.
  A primitive owns colour, shape, type and states; layout is the page's job (Tailwind in the app, a few lines of
  CSS in the installer).

New screen, new page, plugin: link both files and use these classes before inventing new ones. If a look is needed
twice, add it as a primitive here (and to the gallery), not to a page.
