(function () {
  const left = document.getElementById('left');
  const gutter = document.getElementById('gutter');
  const highlight = document.getElementById('highlight');
  const tree = document.getElementById('tree');
  const leftStatus = document.getElementById('leftStatus');
  const rightStatus = document.getElementById('rightStatus');

  function setStatus(el, msg, kind) {
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function tryParse(text, statusEl) {
    if (!text.trim()) {
      setStatus(statusEl, 'Nothing to parse — the box is empty.', 'error');
      return { ok: false };
    }
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      setStatus(statusEl, 'Invalid JSON: ' + e.message, 'error');
      return { ok: false };
    }
  }

  function countInfo(value) {
    if (Array.isArray(value)) return value.length + ' item' + (value.length === 1 ? '' : 's');
    if (value && typeof value === 'object') {
      const n = Object.keys(value).length;
      return n + ' key' + (n === 1 ? '' : 's');
    }
    return typeof value;
  }

  function treePlaceholder(msg) {
    tree.innerHTML = '<span class="placeholder">' + (msg || 'Press “→ Format” to build the tree.') + '</span>';
  }
  function buildTree(value) {
    tree.innerHTML = '';
    tree.appendChild(buildNode(value, null, true));
  }

  // FORMAT: prettify the left editor and (re)build the tree on the right — together.
  function formatAll() {
    const res = tryParse(left.value, leftStatus);
    if (!res.ok) {
      updateLeftValidity();
      treePlaceholder('Fix the JSON on the left, then press “→ Format”.');
      setStatus(rightStatus, '');
      return;
    }
    left.value = JSON.stringify(res.value, null, 2);
    activeRight = res.value;        // "right" only changes when Format is pressed
    renderEditor();
    buildTree(res.value);
    saveActiveFile();               // persist the updated left + right together
    setStatus(leftStatus, 'Formatted (' + countInfo(res.value) + ').', 'ok');
    setStatus(rightStatus, 'Tree built (' + countInfo(res.value) + ').', 'ok');
  }
  document.getElementById('formatBtn').addEventListener('click', formatAll);

  // Prettify the left pane in place, WITHOUT touching the tree on the right.
  document.getElementById('prettifyLeft').addEventListener('click', function () {
    const res = tryParse(left.value, leftStatus);
    if (!res.ok) { updateLeftValidity(); return; }
    left.value = JSON.stringify(res.value, null, 2);
    renderEditor();
    setStatus(leftStatus, 'Prettified.', 'ok');
  });

  // Build a collapsible DOM tree for a JSON value
  function buildNode(value, key, isRoot) {
    const node = document.createElement('div');
    node.className = 'node';

    const isArr = Array.isArray(value);
    const isObj = value && typeof value === 'object';

    const line = document.createElement('div');
    line.className = 'node-line';

    // key label
    let keyHTML = '';
    if (key !== null) {
      keyHTML = '<span class="t-key">"' + escapeHtml(key) + '"</span><span class="t-punct">: </span>';
    }

    if (isObj) {
      const entries = isArr
        ? value.map((v, i) => [i, v])
        : Object.entries(value);
      const open = isArr ? '[' : '{';
      const close = isArr ? ']' : '}';

      const toggle = document.createElement('span');
      toggle.className = 'toggle';   // glyph (▼/▶) comes from CSS based on node state

      line.appendChild(toggle);
      const head = document.createElement('span');
      head.innerHTML = keyHTML +
        '<span class="t-punct">' + open + '</span>' +
        '<span class="preview"> ' + entries.length + (isArr ? ' items ' : ' keys ') + close + '</span>';
      line.appendChild(head);

      const children = document.createElement('div');
      children.className = 'node-children';
      entries.forEach(([k, v], idx) => {
        const child = buildNode(v, isArr ? null : k, false);
        // for arrays show index-less; add trailing comma punct
        if (idx < entries.length - 1) child.dataset.comma = '1';
        children.appendChild(child);
      });

      const tail = document.createElement('div');
      tail.className = 'node-tail';
      tail.innerHTML = '<span class="t-punct">' + close + '</span>';

      node.appendChild(line);
      node.appendChild(children);
      node.appendChild(tail);
      node.classList.add('expanded');

      const toggleFn = function () {
        const collapsed = node.classList.toggle('collapsed');
        node.classList.toggle('expanded', !collapsed);
      };
      toggle.addEventListener('click', toggleFn);
      head.style.cursor = 'pointer';
      head.addEventListener('click', toggleFn);
    } else {
      line.innerHTML = keyHTML + valueHTML(value);
      node.appendChild(line);
    }
    return node;
  }

  function valueHTML(v) {
    if (v === null) return '<span class="t-null">null</span>';
    switch (typeof v) {
      case 'string': return '<span class="t-string">"' + escapeHtml(v) + '"</span>';
      case 'number': return '<span class="t-number">' + v + '</span>';
      case 'boolean': return '<span class="t-bool">' + v + '</span>';
      default: return '<span>' + escapeHtml(String(v)) + '</span>';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---- Left editor: syntax highlight + line numbers ----
  const TOKENS = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  function highlightJSON(src) {
    return escapeHtml(src).replace(TOKENS, function (m) {
      if (m[0] === '"') {
        if (/:\s*$/.test(m)) {                      // object key -> "key" + colon
          const i = m.lastIndexOf('"');
          return '<span class="t-key">' + m.slice(0, i + 1) + '</span>' +
                 '<span class="t-punct">' + m.slice(i + 1) + '</span>';
        }
        return '<span class="t-string">' + m + '</span>';
      }
      if (m === 'true' || m === 'false') return '<span class="t-bool">' + m + '</span>';
      if (m === 'null') return '<span class="t-null">' + m + '</span>';
      return '<span class="t-number">' + m + '</span>';
    });
  }

  // Wire a textarea to its highlight layer + line-number gutter. Returns a render fn.
  function setupEditor(ta, gutterEl, hlEl) {
    function sync() {
      hlEl.scrollTop = ta.scrollTop;
      hlEl.scrollLeft = ta.scrollLeft;
      gutterEl.scrollTop = ta.scrollTop;
    }
    function render() {
      hlEl.innerHTML = highlightJSON(ta.value);
      const lines = ta.value.split('\n').length;
      let g = '';
      for (let i = 1; i <= lines; i++) g += '<div>' + i + '</div>';
      gutterEl.innerHTML = g;
      // The textarea's horizontal scrollbar steals height only from it, letting it scroll
      // further than the gutter/highlight. Pad them by that height so all three align.
      const scrollbar = ta.offsetHeight - ta.clientHeight; // 0 when no horizontal scrollbar
      hlEl.style.paddingBottom = (12 + scrollbar) + 'px';
      gutterEl.style.paddingBottom = (12 + scrollbar) + 'px';
      sync();
      scheduleAutosave();
    }
    ta.addEventListener('input', render);
    ta.addEventListener('scroll', sync);
    window.addEventListener('resize', render);
    // Clicking anywhere in the editor focuses the textarea (so Ctrl+A targets it)
    ta.parentNode.addEventListener('mousedown', function (e) {
      if (e.target !== ta) { e.preventDefault(); ta.focus(); }
    });
    // Ctrl/Cmd+A selects only this textarea's text, never the whole page
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        ta.select();
      }
    });
    return render;
  }

  const renderEditor = setupEditor(left, gutter, highlight);

  // Wrap a bare "key": value fragment, then run jsonrepair (single quotes, missing
  // quotes/commas, comments, trailing commas, Python None/True/False, truncation, ...)
  function autoRepairText(s) {
    let t = s.trim();
    if (/^"[^"]*"\s*:/.test(t)) t = '{' + t + '}';
    return JSONRepair.jsonrepair(t);
  }

  // Live validity indicator per pane; shows an "Auto repair" button when JSON is invalid.
  function makeValidity(ta, statusEl, renderFn) {
    function repair() {
      let value;
      try {
        value = JSON.parse(autoRepairText(ta.value));
      } catch (e) {
        setStatus(statusEl, "Couldn't auto-repair: " + e.message, 'error');
        return;
      }
      ta.value = JSON.stringify(value, null, 2);
      renderFn();
      update();
    }
    function update() {
      const text = ta.value;
      if (!text.trim()) { setStatus(statusEl, ''); return; }
      try {
        JSON.parse(text);
        setStatus(statusEl, 'Valid JSON.', 'ok');
      } catch (e) {
        setStatus(statusEl, 'Invalid JSON: ' + e.message, 'error');
        const btn = document.createElement('button');
        btn.className = 'btn-mini repair-btn';
        btn.textContent = 'Auto repair';
        btn.addEventListener('click', repair);
        statusEl.appendChild(document.createTextNode(' '));
        statusEl.appendChild(btn);
      }
    }
    ta.addEventListener('input', update);
    return update;
  }

  const updateLeftValidity = makeValidity(left, leftStatus, renderEditor);

  // Expand / collapse every node in the tree (each container node carries
  // an 'expanded' or 'collapsed' class; the glyph + visibility follow via CSS).
  function setAllCollapsed(collapsed) {
    tree.querySelectorAll('.node.expanded, .node.collapsed').forEach(function (n) {
      n.classList.toggle('collapsed', collapsed);
      n.classList.toggle('expanded', !collapsed);
    });
  }
  document.getElementById('expandAll').addEventListener('click', function () { setAllCollapsed(false); });
  document.getElementById('collapseAll').addEventListener('click', function () { setAllCollapsed(true); });

  // Copy to clipboard, with a fallback for file:// pages where the async API may be blocked.
  function flashCopied(btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = old; }, 1100);
  }
  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopied(btn); },
                                                function () { fallbackCopy(text, btn); });
    } else {
      fallbackCopy(text, btn);
    }
  }
  function fallbackCopy(text, btn) {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.focus();
    t.select();
    try { document.execCommand('copy'); flashCopied(btn); } catch (e) { /* ignore */ }
    document.body.removeChild(t);
  }
  document.getElementById('copyLeft').addEventListener('click', function () {
    copyText(left.value, this);
  });
  document.getElementById('copyRight').addEventListener('click', function () {
    copyText(left.value, this);
  });

  // Tree is a div, not a textarea: make it focusable and give Ctrl/Cmd+A its own scope
  tree.setAttribute('tabindex', '0');
  tree.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(tree);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // ---------- Persistence (Files) ----------
  // The editor always belongs to an "active file". Edits auto-save back to that file,
  // so switching files and returning keeps your latest changes.
  const ACTIVE_KEY = 'jsonhelper:active';   // remembers which file was open (+ a fast content cache)
  let activeFile = null;
  let activeRight;                               // parsed JSON of the active file's last Format (or undefined)
  let autosaveTimer;

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveActiveFile, 400);
  }
  function saveActiveFile() {
    if (!activeFile) return;
    const rec = { name: activeFile, left: left.value, savedAt: Date.now() };
    if (activeRight !== undefined) rec.right = activeRight;   // parsed JSON from the last Format
    // Fast synchronous cache so a reload restores instantly even if IndexedDB lags.
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ name: activeFile, left: left.value, right: activeRight })); } catch (e) { /* ignore */ }
    idbPut(rec).catch(function () { /* ignore */ });
  }

  // IndexedDB: one record per file — { name, left, savedAt }.
  const DB_NAME = 'jsonhelper';
  const STORE = 'files';
  function openDB() {
    return new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, 2); }   // v2: 'snapshots' store renamed to 'files'
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbReq(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = fn(store);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const out = [];
        const cur = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        cur.onsuccess = function () {
          const c = cur.result;
          if (c) { out.push(c.value); c.continue(); } else { resolve(out); }
        };
        cur.onerror = function () { reject(cur.error); };
      });
    });
  }
  const idbGet = function (name) { return idbReq('readonly', function (s) { return s.get(name); }); };
  const idbPut = function (rec) { return idbReq('readwrite', function (s) { return s.put(rec); }); };
  const idbDel = function (name) { return idbReq('readwrite', function (s) { return s.delete(name); }); };

  const snapList = document.getElementById('snapList');
  let snapMsgTimer;

  function snapMsg(text, isErr) {
    const el = document.getElementById('snapMsg');
    el.textContent = text;
    el.style.color = isErr ? 'var(--error)' : 'var(--string)';
    clearTimeout(snapMsgTimer);
    snapMsgTimer = setTimeout(function () { el.textContent = ''; }, 2500);
  }
  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  // Pick a name not already in `names` (adds " 2", " 3", … or " copy" as needed).
  function uniqueName(base, names) {
    if (names.indexOf(base) === -1) return base;
    let i = 2;
    while (names.indexOf(base + ' ' + i) !== -1) i++;
    return base + ' ' + i;
  }

  // Render the file list: one clickable row per file, each with duplicate + delete.
  // Order is by name (IndexedDB key order) so rows never shuffle as files auto-save.
  function refreshFiles() {
    idbAll().then(function (list) {
      snapList.innerHTML = '';
      if (!list.length) {
        snapList.innerHTML = '<div class="snap-empty">No files yet. Click “Create file”.</div>';
        return;
      }
      list.forEach(function (r) {
        const item = document.createElement('div');
        item.className = 'snap-item' + (r.name === activeFile ? ' active' : '');

        const main = document.createElement('div');
        main.className = 'snap-item-main';
        const nm = document.createElement('div');
        nm.className = 'snap-name';
        nm.textContent = r.name;
        const tm = document.createElement('div');
        tm.className = 'snap-time';
        tm.textContent = fmtTime(r.savedAt);
        main.appendChild(nm);
        main.appendChild(tm);
        main.title = (r.name === activeFile) ? 'Click to rename' : 'Open “' + r.name + '”';
        main.addEventListener('click', function () {
          if (r.name === activeFile) startRename(nm, r.name);   // click the open file's name to rename
          else openFile(r.name);
        });

        const actions = document.createElement('div');
        actions.className = 'snap-actions';

        const dup = document.createElement('button');
        dup.className = 'snap-dup';
        dup.title = 'Duplicate “' + r.name + '”';
        dup.textContent = '⧉';
        dup.addEventListener('click', function (e) { e.stopPropagation(); duplicateFile(r.name); });

        const del = document.createElement('button');
        del.className = 'snap-del';
        del.title = 'Delete “' + r.name + '”';
        del.textContent = '×';
        del.addEventListener('click', function (e) { e.stopPropagation(); deleteFile(r.name); });

        actions.appendChild(dup);
        actions.appendChild(del);
        item.appendChild(main);
        item.appendChild(actions);
        snapList.appendChild(item);
      });
    }).catch(function () {
      snapList.innerHTML = '<div class="snap-empty">Files unavailable in this browser.</div>';
    });
  }

  // `right` is stored as a parsed object; tolerate legacy string values just in case.
  function normalizeRight(v) {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return undefined; } }
    return v;
  }

  // Show a file in the editor: `leftText` fills the editor, the tree renders from `rightVal`.
  function showContent(leftText, rightVal) {
    left.value = leftText || '';
    activeRight = normalizeRight(rightVal);
    renderEditor();
    updateLeftValidity();
    if (activeRight !== undefined) {
      buildTree(activeRight);                         // the last thing that was Formatted
    } else {
      // No stored tree yet — best effort from the current text, else a hint.
      try { buildTree(JSON.parse(left.value)); }
      catch (e) { treePlaceholder(); }
    }
  }

  function openFile(name) {
    if (name === activeFile) return;
    saveActiveFile();                       // flush current file before leaving it
    idbGet(name).then(function (r) {
      if (!r) { snapMsg('File not found.', true); refreshFiles(); return; }
      activeFile = name;
      const leftText = (typeof r.left === 'string' && r.left) ? r.left
                     : (typeof r.right === 'string' ? r.right : '');   // legacy fallback
      showContent(leftText, r.right);
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ name: activeFile, left: left.value, right: activeRight })); } catch (e) {}
      refreshFiles();
      snapMsg('Opened “' + name + '”.');
    }).catch(function (e) { snapMsg('Open failed: ' + e, true); });
  }

  function createFile() {
    saveActiveFile();
    idbAll().then(function (list) {
      // Auto-name it "Untitled" (or "Untitled 2", …); rename later by clicking its name.
      const name = uniqueName('Untitled', list.map(function (r) { return r.name; }));
      activeFile = name;
      showContent('', undefined);
      saveActiveFile();
      refreshFiles();
      snapMsg('Created “' + name + '”. Click its name to rename.');
    });
  }

  function duplicateFile(name) {
    Promise.all([idbGet(name), idbAll()]).then(function (res) {
      const src = res[0];
      if (!src) { snapMsg('File not found.', true); return; }
      const copy = uniqueName(name + ' copy', res[1].map(function (r) { return r.name; }));
      if (name === activeFile) saveActiveFile();   // make sure we copy the latest content
      const content = (name === activeFile) ? left.value : (src.left || '');
      const rightVal = (name === activeFile) ? activeRight : normalizeRight(src.right);
      const rec = { name: copy, left: content, savedAt: Date.now() };
      if (rightVal !== undefined) rec.right = rightVal;
      idbPut(rec).then(function () {
        activeFile = copy;
        showContent(content, rightVal);
        try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ name: activeFile, left: left.value, right: activeRight })); } catch (e) {}
        refreshFiles();
        snapMsg('Duplicated to “' + copy + '”.');
      });
    }).catch(function (e) { snapMsg('Duplicate failed: ' + e, true); });
  }

  function deleteFile(name) {
    if (!window.confirm('Delete file “' + name + '”?')) return;
    idbDel(name).then(function () {
      if (name === activeFile) {
        activeFile = null;
        // Open the most recent remaining file, or start a fresh blank one.
        idbAll().then(function (list) {
          list.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
          if (list.length) { openFile(list[0].name); }
          else {
            activeFile = 'Untitled';
            showContent('', undefined);
            saveActiveFile();
            refreshFiles();
          }
        });
      } else {
        refreshFiles();
      }
      snapMsg('Deleted “' + name + '”.');
    }).catch(function (e) { snapMsg('Delete failed: ' + e, true); });
  }

  // Turn a file's name row into an inline text box for renaming.
  function startRename(nm, oldName) {
    const input = document.createElement('input');
    input.className = 'snap-rename';
    input.value = oldName;
    nm.replaceWith(input);
    input.focus();
    input.select();
    let settled = false;
    function commit() { if (settled) return; settled = true; renameFile(oldName, input.value); }
    function cancel() { if (settled) return; settled = true; refreshFiles(); }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();                       // keep editor shortcuts (Ctrl+A) out of it
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });   // don't re-trigger the row
    input.addEventListener('blur', commit);
  }

  function renameFile(oldName, rawName) {
    const newName = rawName.trim();
    if (!newName || newName === oldName) { refreshFiles(); return; }
    clearTimeout(autosaveTimer);                 // stop a pending save from re-creating the old name
    idbAll().then(function (list) {
      if (list.some(function (r) { return r.name === newName; })) {
        snapMsg('A file named “' + newName + '” already exists.', true);
        refreshFiles();
        return;
      }
      const rec = list.filter(function (r) { return r.name === oldName; })[0];
      const content = (oldName === activeFile) ? left.value : (rec ? (rec.left || '') : '');
      const rightVal = (oldName === activeFile) ? activeRight : (rec ? normalizeRight(rec.right) : undefined);
      const savedAt = (rec && rec.savedAt) || Date.now();
      const newRec = { name: newName, left: content, savedAt: savedAt };
      if (rightVal !== undefined) newRec.right = rightVal;
      idbPut(newRec)
        .then(function () { return idbDel(oldName); })
        .then(function () {
          if (activeFile === oldName) {
            activeFile = newName;
            try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ name: activeFile, left: left.value, right: activeRight })); } catch (e) {}
          }
          refreshFiles();
          snapMsg('Renamed to “' + newName + '”.');
        });
    }).catch(function (e) { snapMsg('Rename failed: ' + e, true); });
  }

  document.getElementById('newFile').addEventListener('click', createFile);

  // ---- Share via base64 (UTF-8 safe, so emoji/accents survive) ----
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s+/g, ''));           // tolerate pasted line breaks
    const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }

  // Export: copy the current JSON, base64-encoded, to the clipboard to share.
  document.getElementById('exportSnap').addEventListener('click', function () {
    if (!left.value.trim()) { snapMsg('Nothing to export.', true); return; }
    copyText(b64encode(left.value), this);
    snapMsg('Export code copied — send it to anyone.');
  });

  // Import: paste an export code + a name, create a new file from it and open it.
  document.getElementById('importSnap').addEventListener('click', function () {
    const code = (window.prompt('Paste the exported code:') || '').trim();
    if (!code) return;
    let content;
    try {
      content = b64decode(code);
    } catch (e) {
      snapMsg("That doesn't look like a valid export code.", true);
      return;
    }
    const proposed = (window.prompt('Name this file:', '') || '').trim();
    if (!proposed) return;
    saveActiveFile();
    let rightVal;
    try { rightVal = JSON.parse(content); } catch (e) { rightVal = undefined; }
    idbAll().then(function (list) {
      const name = uniqueName(proposed, list.map(function (r) { return r.name; }));
      const rec = { name: name, left: content, savedAt: Date.now() };
      if (rightVal !== undefined) rec.right = rightVal;
      idbPut(rec).then(function () {
        activeFile = name;
        showContent(content, rightVal);
        try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ name: activeFile, left: left.value, right: activeRight })); } catch (e) {}
        refreshFiles();
        snapMsg('Imported “' + name + '”.');
      });
    }).catch(function (e) { snapMsg('Import failed: ' + e, true); });
  });

  // ---------- Init ----------
  const SEED = JSON.stringify({
    name: "json helper",
    version: 1,
    features: ["prettify", "tree view", "collapse"],
    active: true,
    author: { handle: "you", team: null }
  }, null, 2);

  // Paint instantly from the localStorage cache to avoid a flash while IndexedDB opens.
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { /* ignore */ }
  if (cached && typeof cached.left === 'string') {
    activeFile = cached.name || 'Untitled';
    showContent(cached.left, cached.right);
  }

  idbAll().then(function (list) {
    if (!list.length) {
      // First run: create a starter file.
      activeFile = 'Untitled';
      if (cached && typeof cached.left === 'string') showContent(cached.left, cached.right);
      else showContent(SEED, undefined);
      saveActiveFile();
      refreshFiles();
      return;
    }
    list.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    const names = list.map(function (r) { return r.name; });
    if (activeFile && names.indexOf(activeFile) !== -1) {
      refreshFiles();                 // cache already painted the active file
    } else {
      activeFile = null;              // don't resurrect a stale cache entry
      openFile(list[0].name);         // open the most recently saved file
    }
  }).catch(function () {
    // IndexedDB unavailable: single-file mode off the cache/seed.
    if (!activeFile) { activeFile = 'Untitled'; showContent(SEED, undefined); }
    refreshFiles();
  });
})();
