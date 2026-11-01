'use strict';

// Content-script state shared between modules: settings, the active modal
// mode, and messaging to the background page.

Vimov.state = {
  settings: null,
  keymap: null,
  exclusions: [],
  exclusion: null,
  exclusionUrl: null,
};

// A modal mode (link hints, find, help, insert) takes every key press until it
// exits. A mode is { name, status?, shield?, onKey(key, event) → consumed, onExit? }.
// Unless `shield` is false, keys it doesn't consume still never reach the page.
Vimov.mode = (() => {
  let current = null;
  return {
    get current() {
      return current;
    },
    enter(mode) {
      if (current) this.exit();
      current = mode;
      Vimov.ui.setStatus(mode.status || '');
    },
    exit(mode) {
      if (!current || (mode && mode !== current)) return;
      const old = current;
      current = null;
      Vimov.ui.setStatus('');
      old.onExit?.();
    },
  };
})();

Vimov.bg = async (cmd, args = {}) => {
  try {
    const response = await browser.runtime.sendMessage({ cmd, ...args });
    if (response?.error) Vimov.ui.message(response.error);
    return response;
  } catch (err) {
    Vimov.ui.message(`Vimov: ${err.message}`);
    return null;
  }
};

Vimov.copyText = async (text) => {
  let copied = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copied = !!(await Vimov.bg('copyText', { text }))?.ok;
  }
  if (copied) Vimov.ui.message(`Copied ${text}`);
};
