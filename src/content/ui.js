'use strict';

// On-page UI: a closed shadow root that holds the HUD, hint markers, find bar,
// help overlay and vbar, isolated from the page's CSS.

Vimov.ui = (() => {
  const CSS = `
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .hud, .find {
      position: fixed;
      bottom: 12px;
      padding: 5px 10px;
      border-radius: 6px;
      background: rgba(24, 24, 27, 0.94);
      color: #f4f4f5;
      font: 12px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    .hud {
      right: 12px;
      max-width: min(60vw, 520px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    /* Text drawn from an attribute isn't page text, so the browser's own
       find doesn't match it. */
    .hud::after { content: attr(data-text); }

    .hint {
      position: fixed;
      padding: 1px 4px;
      border: 1px solid #c38a22;
      border-radius: 3px;
      background: linear-gradient(#fff785, #ffc542);
      color: #302505;
      font: bold 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      pointer-events: none;
    }
    .hint .typed { opacity: 0.4; }

    .flash {
      position: fixed;
      border-radius: 3px;
      outline: 2px solid #f59e0b;
      outline-offset: 1px;
      background: rgba(245, 158, 11, 0.18);
      pointer-events: none;
      animation: vimov-fade 320ms ease-out forwards;
    }
    @keyframes vimov-fade { to { opacity: 0; } }

    .find {
      left: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .find::before { content: "/"; color: #fbbf24; }
    .find input {
      all: unset;
      width: 36ch;
      max-width: 60vw;
      color: inherit;
      font: inherit;
      caret-color: #fbbf24;
    }
    .find .count { color: #a1a1aa; font-size: 12px; }
    .find .count::after { content: attr(data-text); }

    .backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: rgba(9, 9, 11, 0.4);
    }
    .backdrop.top { align-items: flex-start; padding-top: 12vh; }
    .help, .search {
      --bg: #ffffff;
      --fg: #18181b;
      --muted: #71717a;
      --line: #e4e4e7;
      --key: #f4f4f5;
      --accent: #b45309;
      --selected: #fef3c7;
    }
    @media (prefers-color-scheme: dark) {
      .help, .search {
        --bg: #18181b;
        --fg: #f4f4f5;
        --muted: #a1a1aa;
        --line: #333338;
        --key: #27272a;
        --accent: #fbbf24;
        --selected: #3a3220;
      }
    }
    .help {
      width: min(880px, 100%);
      max-height: 100%;
      overflow: auto;
      padding: 20px 24px 8px;
      border-radius: 12px;
      background: var(--bg);
      color: var(--fg);
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
    }
    .help header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .help h1 { margin: 0; font-size: 18px; font-weight: 650; }
    .help .note { margin-left: auto; color: var(--muted); }
    .help button {
      font: inherit;
      color: inherit;
      background: var(--key);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 3px 10px;
      cursor: pointer;
    }
    .help .columns { columns: 2 300px; column-gap: 32px; }
    .help section { break-inside: avoid; margin-bottom: 16px; }
    .help h2 {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .help .row { display: flex; gap: 12px; padding: 3px 0; border-bottom: 1px solid var(--line); }
    .help .keys { flex: 0 0 104px; display: flex; flex-wrap: wrap; gap: 4px; }
    .help kbd, .search kbd {
      padding: 0 5px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: var(--key);
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .search {
      display: flex;
      flex-direction: column;
      width: min(640px, 100%);
      max-height: 100%;
      overflow: hidden;
      border-radius: 12px;
      background: var(--bg);
      color: var(--fg);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
    }
    .search input {
      all: unset;
      display: block;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      color: inherit;
      font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      caret-color: var(--accent);
    }
    .search input::placeholder { color: var(--muted); }
    .search .results { margin: 0; padding: 6px; overflow: auto; list-style: none; }
    .search .result {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .search .result.selected { background: var(--selected); }
    .search .tag {
      flex: 0 0 60px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .search .text { display: flex; flex-direction: column; min-width: 0; }
    .search .title, .search .detail { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .search .detail { color: var(--muted); font-size: 12px; }
    .search b { color: var(--accent); font-weight: 650; }
    .search .footer {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      padding: 8px 16px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
    }
  `;

  // An element with an optional class and text, for building the overlays.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  let host = null;
  let root = null;
  let hud = null;
  let status = '';
  let message = '';
  let messageTimer = 0;

  function getRoot() {
    if (!host) {
      host = document.createElement('vimov-ui');
      host.style.cssText = [
        'all: initial !important',
        'display: block !important',
        'position: fixed !important',
        'top: 0 !important',
        'left: 0 !important',
        'width: 0 !important',
        'height: 0 !important',
        'z-index: 2147483647 !important',
      ].join(';');
      root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS;
      hud = document.createElement('div');
      hud.className = 'hud';
      hud.hidden = true;
      root.append(style, hud);
    }
    // Some pages rebuild their DOM wholesale; put the host back if it was dropped.
    if (!host.isConnected) document.documentElement.append(host);
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

    // The persistent HUD text: the current mode or the keys typed so far.
    setStatus(text) {
      status = text;
      if (host || text) render();
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
      const el = document.createElement('div');
      el.className = 'flash';
      Object.assign(el.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.right - rect.left}px`,
        height: `${rect.bottom - rect.top}px`,
      });
      getRoot().append(el);
      setTimeout(() => el.remove(), 340);
    },
  };
})();
