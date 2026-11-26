'use strict';

// On-page UI: a closed shadow root that holds the HUD, hint markers, find bar,
// help overlay and vbar, isolated from the page's CSS.

Vimov.ui = (() => {
  const CSS = `
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    /* One palette for every piece, light or dark with the system. The names
       are prefixed so a page's own variables can't leak in. */
    :host {
      --vm-surface: #ffffff;
      --vm-raised: #f4f4f5;
      --vm-fg: #18181b;
      --vm-muted: #71717a;
      --vm-line: rgba(24, 24, 27, 0.07);
      --vm-border: rgba(24, 24, 27, 0.12);
      --vm-accent: #b45309;
      --vm-mark: #f59e0b;
      --vm-selected: rgba(24, 24, 27, 0.05);
      --vm-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05), 0 4px 16px rgba(0, 0, 0, 0.1);
      --vm-shadow-lg: 0 1px 3px rgba(0, 0, 0, 0.05), 0 12px 28px rgba(0, 0, 0, 0.1), 0 32px 72px rgba(0, 0, 0, 0.14);
      --vm-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
      --vm-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --vm-ease: cubic-bezier(0.2, 0, 0, 1);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --vm-surface: #1c1c1f;
        --vm-raised: #2a2a2e;
        --vm-fg: #f4f4f5;
        --vm-muted: #a1a1aa;
        --vm-line: rgba(255, 255, 255, 0.07);
        --vm-border: rgba(255, 255, 255, 0.12);
        --vm-accent: #fbbf24;
        --vm-selected: rgba(255, 255, 255, 0.06);
        --vm-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.35);
        --vm-shadow-lg: 0 1px 3px rgba(0, 0, 0, 0.3), 0 12px 28px rgba(0, 0, 0, 0.35), 0 32px 72px rgba(0, 0, 0, 0.45);
      }
    }

    /* Panels rise into place; the backdrop fades in. Nothing moves when the
       system asks for less motion. */
    @keyframes vimov-in { from { opacity: 0; transform: translateY(4px); } }
    @keyframes vimov-appear { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .hud, .next, .find, .backdrop, .help, .search { animation: none !important; }
    }

    /* The pieces in the corners: the mode line, the keys that can follow a
       partly typed one, and the find bar. */
    .hud, .next, .find {
      position: fixed;
      bottom: 12px;
      border: 1px solid var(--vm-border);
      border-radius: 8px;
      background: var(--vm-surface);
      color: var(--vm-fg);
      font: 12.5px/1.5 var(--vm-sans);
      box-shadow: var(--vm-shadow-sm);
      animation: vimov-in 140ms var(--vm-ease);
    }
    .hud {
      right: 12px;
      max-width: min(70vw, 640px);
      padding: 5px 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    /* Text drawn from an attribute isn't page text, so the browser's own
       find doesn't match it. */
    .hud::after { content: attr(data-text); }
    /* In a narrow window the find bar's keys go above the bar, not beside it. */
    @media (max-width: 860px) {
      .hud:has(~ .find) { bottom: 50px; left: 12px; right: auto; }
    }

    .next {
      right: 12px;
      bottom: 50px;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 14px;
      max-width: min(60vw, 420px);
      padding: 8px 12px;
      pointer-events: none;
    }
    .next .key { color: var(--vm-accent); font: 500 12px/1.55 var(--vm-mono); }
    .next .key::after, .next .what::after { content: attr(data-text); }

    /* Hint labels keep one look on every page, light or dark: the page's
       colors, not the system's, are what they sit on. */
    .hint {
      position: fixed;
      padding: 1px 5px;
      border-radius: 4px;
      background: #fbbf24;
      color: #1c1407;
      font: 650 11px/1.35 var(--vm-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      box-shadow: 0 0 0 1px rgba(120, 53, 15, 0.45), 0 2px 6px rgba(0, 0, 0, 0.22);
      pointer-events: none;
    }
    .hint .typed { opacity: 0.4; }

    .flash {
      position: fixed;
      border-radius: 4px;
      outline: 2px solid var(--vm-mark);
      outline-offset: 1px;
      background: rgba(245, 158, 11, 0.16);
      pointer-events: none;
      animation: vimov-fade 320ms ease-out forwards;
    }
    @keyframes vimov-fade { to { opacity: 0; } }

    .find {
      left: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 11px;
      font-size: 13px;
    }
    .find::before { content: "/"; color: var(--vm-accent); font: 600 13px/1.5 var(--vm-mono); }
    .find input {
      all: unset;
      width: 36ch;
      max-width: 60vw;
      color: inherit;
      font: inherit;
      caret-color: var(--vm-accent);
    }
    .find .count { color: var(--vm-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .find .count::after { content: attr(data-text); }

    .backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: rgba(9, 9, 11, 0.28);
      animation: vimov-appear 120ms ease-out;
    }
    .backdrop.top { align-items: flex-start; padding-top: 12vh; }
    .help, .search {
      max-height: 100%;
      border: 1px solid var(--vm-border);
      border-radius: 14px;
      background: var(--vm-surface);
      color: var(--vm-fg);
      box-shadow: var(--vm-shadow-lg);
      animation: vimov-in 160ms var(--vm-ease);
    }
    .help kbd, .search kbd {
      display: inline-block;
      min-width: 1.75em;
      padding: 0 5px;
      border: 1px solid var(--vm-border);
      border-radius: 4px;
      background: var(--vm-raised);
      color: var(--vm-fg);
      font: 11.5px/1.6 var(--vm-mono);
      text-align: center;
    }

    .help {
      width: min(880px, 100%);
      overflow: auto;
      padding: 22px 26px 10px;
      font: 13px/1.45 var(--vm-sans);
    }
    .help header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .help h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
    .help .note { margin-left: auto; color: var(--vm-muted); }
    .help .filter {
      all: unset;
      width: 18ch;
      padding: 4px 10px;
      border: 1px solid var(--vm-border);
      border-radius: 8px;
      color: inherit;
      font: inherit;
      caret-color: var(--vm-accent);
    }
    .help .filter::placeholder { color: var(--vm-muted); }
    .help .filter:focus { border-color: var(--vm-mark); box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); }
    .help .none { margin: 8px 0 16px; color: var(--vm-muted); }
    .help button {
      padding: 4px 12px;
      border: 1px solid var(--vm-border);
      border-radius: 8px;
      background: var(--vm-raised);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .help button:hover { border-color: var(--vm-muted); }
    .help .columns { columns: 2 300px; column-gap: 36px; }
    .help section { break-inside: avoid; margin-bottom: 18px; }
    .help h2 {
      margin: 0 0 6px;
      color: var(--vm-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .help .row { display: flex; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--vm-line); }
    .help .row:last-child { border-bottom: 0; }
    .help .keys { flex: 0 0 136px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .help .or { color: var(--vm-muted); }

    .search {
      display: flex;
      flex-direction: column;
      width: min(640px, 100%);
      overflow: hidden;
      font: 14px/1.4 var(--vm-sans);
    }
    .search input {
      all: unset;
      display: block;
      padding: 15px 18px;
      border-bottom: 1px solid var(--vm-line);
      color: inherit;
      font: 16px/1.4 var(--vm-sans);
      caret-color: var(--vm-accent);
    }
    .search input::placeholder { color: var(--vm-muted); }
    .search .results { margin: 0; padding: 6px; overflow: auto; list-style: none; }
    .search .result {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 12px;
      border-radius: 8px;
      cursor: pointer;
    }
    .search .result.selected { background: var(--vm-selected); }
    .search .result.selected::before {
      content: "";
      position: absolute;
      left: 0;
      top: 9px;
      bottom: 9px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--vm-mark);
    }
    .search .icon {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      object-fit: contain;
    }
    .search .icon.letter {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vm-raised);
      color: var(--vm-muted);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
    }
    .search .icon.glyph { color: var(--vm-muted); }
    .search .icon svg {
      display: block;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .search .text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .search .title, .search .detail { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .search .detail { color: var(--vm-muted); font-size: 12px; }
    .search b { color: var(--vm-fg); font-weight: 650; }
    /* What a result is, quietly, at the end of its row. */
    .search .tag { flex: none; color: var(--vm-muted); font-size: 12px; }
    .search .empty { padding: 14px 18px; color: var(--vm-muted); }
    .search .footer {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      padding: 9px 18px;
      border-top: 1px solid var(--vm-line);
      color: var(--vm-muted);
      font-size: 12px;
    }
  `;

  // Elements are made as HTML even in an SVG or XML document, where
  // createElement() would make plain XML elements that can't hold a shadow
  // root or take styles. (SVG doesn't draw HTML, so the UI isn't seen there,
  // but keys keep working.)
  const make = (tag) => document.createElementNS('http://www.w3.org/1999/xhtml', tag);

  // An element with an optional class and text, for building the overlays.
  function el(tag, className, text) {
    const node = make(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // When Vimov is updated, Firefox runs the new version in open tabs, but
  // whatever the old one had on the page (an open vbar or help) stays there
  // with nothing left to close it. It goes before the new one starts.
  for (const old of document.querySelectorAll('vimov-ui')) old.remove();

  let host = null;
  let root = null;
  let hud = null;
  let nextBox = null; // the keys that can follow a partly typed sequence
  let status = '';
  let message = '';
  let messageTimer = 0;

  // An open modal dialog or fullscreen element covers the rest of the page
  // and stops it taking focus, so the UI goes inside the topmost one. Not
  // inside a video or other element that can't show children, though.
  const NO_CHILDREN = new Set(['video', 'audio', 'img', 'canvas', 'iframe', 'embed', 'object']);
  function container() {
    const covering = [...document.querySelectorAll(':modal')].filter((node) => !NO_CHILDREN.has(node.localName));
    return covering.at(-1) || document.documentElement;
  }

  function getRoot() {
    if (!host) {
      const node = make('vimov-ui');
      node.style.cssText = [
        'all: initial !important',
        'display: block !important',
        'position: fixed !important',
        'top: 0 !important',
        'left: 0 !important',
        'width: 0 !important',
        'height: 0 !important',
        'z-index: 2147483647 !important',
      ].join(';');
      const shadow = node.attachShadow({ mode: 'closed' });
      const line = el('div', 'hud');
      line.hidden = true;
      shadow.append(el('style', '', CSS), line);
      // Kept only once it's all built, so a failure can be retried.
      [host, root, hud] = [node, shadow, line];
    }
    // Put the host back if the page dropped it (some rebuild their DOM
    // wholesale), and move it in or out of a dialog that opened or closed.
    const parent = container();
    if (host.parentNode !== parent) parent.append(host);
    return root;
  }

  function render() {
    getRoot();
    const text = message || status;
    hud.dataset.text = text;
    hud.hidden = !text;
  }

  return {
    el,
    root: getRoot,
    // Whether a node is Vimov's own UI, as the page sees it.
    owns: (node) => !!host && node === host,

    // The persistent HUD text: the current mode or the keys typed so far.
    setStatus(text) {
      status = text;
      if (host || text) render();
    },

    // Lists the keys that can follow what's been typed, above the HUD, as
    // [{ key, description }]; an empty list hides it. Drawn from attributes,
    // like the HUD, so the browser's find doesn't match it.
    showNext(rows) {
      if (!rows.length) {
        nextBox?.remove();
        nextBox = null;
        return;
      }
      nextBox ||= el('div', 'next');
      nextBox.replaceChildren(
        ...rows.flatMap(({ key, description }) => {
          const keyCell = el('span', 'key');
          const what = el('span', 'what');
          keyCell.dataset.text = key;
          what.dataset.text = description;
          return [keyCell, what];
        }),
      );
      getRoot().append(nextBox);
    },

    // A transient HUD message that overrides the status for a while.
    message(text, ms = 2500) {
      message = text;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => {
        message = '';
        render();
      }, ms);
      render();
    },

    // Briefly outlines a rectangle, to show what a command acted on.
    flash(rect) {
      if (!rect) return;
      const box = el('div', 'flash');
      Object.assign(box.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.right - rect.left}px`,
        height: `${rect.bottom - rect.top}px`,
      });
      getRoot().append(box);
      setTimeout(() => box.remove(), 340);
    },
  };
})();
