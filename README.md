# JSON Helper

A tiny, dependency-light JSON prettifier + tree viewer that runs entirely in your
browser. Paste messy JSON on the left, hit **Format**, and get a clean, colorized,
collapsible tree on the right. Your work is organized into **files** that auto-save
locally, so nothing is lost between sessions.

No build step, no server, no network — just open `index.html`.

## Features

- **Format** — prettifies the JSON in the editor *and* builds the collapsible tree, in one click.
- **Prettify** — reformats just the editor, without rebuilding the tree.
- **Auto repair** — when the JSON is invalid, a one-click button fixes common mistakes
  (trailing commas, single quotes, unquoted keys, comments, Python `None`/`True`/`False`,
  truncation, bare `"key": value` fragments, …) via the bundled
  [`jsonrepair`](https://github.com/josdejong/jsonrepair) library.
- **Editor niceties** — line numbers, live syntax highlighting, live validity status.
- **Tree view** — read-only, colorized, with **Expand all** / **Collapse all** and per-node toggles.
- **Files** — a left-hand panel of named files that:
  - auto-save as you type (each file remembers its own content),
  - support **Create**, **Duplicate** (`⧉`), **Delete** (`×`), and inline **rename**
    (click the name of the open file),
- **Copy** — copy the current JSON to the clipboard.
- **Export / Import** — share a file as a base64 code (Export copies it to your clipboard;
  Import turns a pasted code into a new file). UTF-8 safe, so emoji/accents survive.

## Running it

Just open the file in a browser:

```sh
open index.html          # macOS
# or double-click index.html
```

Everything works from `file://`. If you prefer a clean, stable origin (recommended if
clipboard or storage ever behave oddly on `file://`), serve the folder over HTTP:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

## Project layout

```
jsonhelper/
├── index.html     # markup + element IDs
├── styles.css     # all styling
├── app.js         # all app logic (single IIFE, no globals leaked)
├── jsonrepair.js  # vendored MIT-licensed library (github.com/josdejong/jsonrepair)
└── README.md
```

Scripts are plain `<script>` tags (not ES modules) so the app keeps working under
`file://`. `jsonrepair.js` must load before `app.js` (it exposes the `JSONRepair` global).

## How it works

### The two panes
- **Left** = the editable JSON text. It's the source of truth and may be invalid while you type.
- **Right** = a read-only tree, rebuilt only when you press **Format**. This means the tree
  reflects the last thing you Formatted, independent of in-progress edits.

### Persistence (all in-browser)
- **localStorage** holds a small cache of the currently open file plus its name, so a
  reload repaints instantly (key: `jsonhelper-mini:active`).
- **IndexedDB** (`jsonhelper-mini` database, `files` store) holds one record per file:

  ```js
  { name: string, left: string, right: <parsed JSON>, savedAt: number }
  ```

  - `left` is a **string** (may be invalid JSON) and is written on every edit.
  - `right` is a **parsed object** (guaranteed valid) and is written **only on Format**.
    It's stored as a real object rather than a string because IndexedDB's structured-clone
    storage handles objects natively — no redundant stringify/parse, and the type itself
    enforces validity.

Storage is scoped to the page's origin. On `file://` this can vary by browser and is
cleared by "clear browsing data"; a `localhost` origin is more stable.

## Credits

JSON repair is powered by [`jsonrepair`](https://github.com/josdejong/jsonrepair) by
Jos de Jong (MIT). Everything else is hand-rolled vanilla HTML/CSS/JS.
