'use strict';

// The command line: ":" then a command by name, as in a keymap line
// (scrollToTop, reload hard=true), or one of the Vim words that mean
// something in a browser (:q, :tabnew, :e, :b). Enter runs it, Tab completes
// the word, and Up and Down bring back earlier lines.

Vimov.commandLine = (() => {
  // Vim words → what they do, given what follows the word: a URL, a search,
  // or nothing. Each returns { command, options, count } or throws.
  const nothing = (word, command, options = {}) => (rest) => {
    if (rest) throw new Error(`:${word} takes nothing after it`);
    return { command, options };
  };
  const url = (newTab, otherwise) => (rest) =>
    rest ? { command: 'openUrl', options: { url: rest, newTab } } : otherwise;
  const search = (source) => (rest) => ({ command: 'search', options: { in: source, query: rest } });
  const move = (rest) => {
    const match = /^([+-])(\d+)$/.exec(rest);
    if (!match) throw new Error(':tabmove takes +N or -N, the tabs to move by');
    return { command: match[1] === '+' ? 'moveTabRight' : 'moveTabLeft', options: {}, count: Number(match[2]) || 1 };
  };

  // The long words are offered by Tab; the short ones work when typed.
  const LONG = {
    quit: (w) => nothing(w, 'closeTab'),
    close: (w) => nothing(w, 'closeTab'),
    tabclose: (w) => nothing(w, 'closeTab'),
    tabnext: (w) => nothing(w, 'nextTab'),
    tabprevious: (w) => nothing(w, 'previousTab'),
    tabfirst: (w) => nothing(w, 'firstTab'),
    tablast: (w) => nothing(w, 'lastTab'),
    tabnew: () => url(true, { command: 'newTab', options: {} }),
    tabedit: () => url(true, { command: 'newTab', options: {} }),
    tabmove: () => move,
    edit: () => url(false, { command: 'reload', options: {} }),
    open: () => url(false, { command: 'search', options: {} }),
    buffer: () => search('tabs'),
    bookmarks: () => search('bookmarks'),
    history: () => search('history'),
    undo: (w) => nothing(w, 'restoreTab'),
    pin: (w) => nothing(w, 'togglePinTab'),
    back: (w) => nothing(w, 'goBack'),
    forward: (w) => nothing(w, 'goForward'),
    help: (w) => nothing(w, 'showHelp'),
    options: (w) => nothing(w, 'openOptions'),
  };
  const SHORT = {
    q: 'quit', wq: 'quit', x: 'quit', clo: 'close', tabc: 'tabclose',
    tabn: 'tabnext', bn: 'tabnext', bnext: 'tabnext',
    tabp: 'tabprevious', tabN: 'tabprevious', tabNext: 'tabprevious', bp: 'tabprevious', bprevious: 'tabprevious',
    tabfir: 'tabfirst', tabr: 'tabfirst', tabrewind: 'tabfirst', bfirst: 'tabfirst',
    tabl: 'tablast', blast: 'tablast',
    tabe: 'tabedit', tabm: 'tabmove',
    e: 'edit', o: 'open', b: 'buffer', buffers: 'buffer', ls: 'buffer',
    marks: 'bookmarks', his: 'history', u: 'undo',
    h: 'help', set: 'options', se: 'options', settings: 'options',
  };
  const NAMES = Object.keys(Vimov.COMMANDS);

  // What a command line does: { command, options, count }, null for an
  // empty line, or { error } for one that can't run.
  function resolve(text) {
    const line = text.trim().replace(/^:+\s*/, '');
    if (!line) return null;
    const [, word, rest] = /^(\S+)\s*(.*)$/su.exec(line);
    try {
      if (word === 'e!' || word === 'edit!') return { ...nothing(word, 'reload', { hard: true })(rest), count: 1 };
      const long = Object.hasOwn(SHORT, word) ? SHORT[word] : word;
      if (Object.hasOwn(LONG, long)) return { count: 1, ...LONG[long](word)(rest) };
      const name = NAMES.find((n) => n === word) || NAMES.find((n) => n.toLowerCase() === word.toLowerCase());
      if (!name) return { error: `Not a command: ${word}` };
      const options = Vimov.keys.parseOptions(name, rest ? rest.split(/\s+/) : []);
      return { command: name, options, count: 1 };
    } catch (err) {
      return { error: err.message };
    }
  }

  // What Enter will do, in the help's words.
  function describe({ command, options }) {
    const what = Vimov.describeCommand(command, options, Vimov.state?.layout);
    return options.query ? `${what} for “${options.query}”` : what;
  }

  // The words Tab offers for the start of one, commands first.
  function complete(start) {
    if (!start) return [];
    const lower = start.toLowerCase();
    return [...NAMES, ...Object.keys(LONG)].filter((name) => name.toLowerCase().startsWith(lower) && name !== start);
  }

  const history = []; // lines run, newest last, for as long as the page is open

  function open() {
    const { ui } = Vimov;
    const focused = document.activeElement;
    const bar = ui.el('div', 'find command');
    const input = ui.el('input');
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Vimov command');
    const preview = ui.el('span', 'count');
    bar.append(input, preview);
    ui.root().append(bar);

    let completing = null; // { words, i } while Tab goes through them
    let recalled = history.length; // which earlier line Up and Down are on

    function show() {
      const result = resolve(input.value);
      const word = input.value.trim().split(/\s+/)[0] || '';
      let text = '';
      if (result?.error) {
        const words = /\s/.test(input.value.trim()) ? [] : complete(word);
        text = words.length ? `Tab: ${words.slice(0, 3).join(', ')}${words.length > 3 ? '…' : ''}` : result.error;
      } else if (result) {
        text = describe(result);
      }
      preview.dataset.text = text;
      preview.classList.toggle('error', !!result?.error);
    }

    // Puts the next word Tab offers (the one before with Shift) in place of
    // the first word.
    function completeWord(dir) {
      if (!completing) {
        const [word = '', ...rest] = input.value.trimStart().split(/(\s+)/);
        completing = { words: complete(word), i: -1, rest: rest.join('') };
      }
      const { words } = completing;
      if (!words.length) return;
      completing.i = (completing.i + dir + words.length) % words.length;
      input.value = words[completing.i] + completing.rest;
      show();
    }

    function recall(dir) {
      const i = recalled + dir;
      if (i < 0 || i > history.length) return;
      recalled = i;
      input.value = history[i] ?? '';
      completing = null;
      show();
    }

    function run() {
      const text = input.value.trim();
      const result = resolve(text);
      if (result?.error) {
        // Stays open to be fixed; the words say what's wrong.
        bar.classList.remove('shake');
        bar.getBoundingClientRect();
        bar.classList.add('shake');
        return;
      }
      Vimov.mode.exit(mode);
      if (!result) return;
      if (history.at(-1) !== text) history.push(text);
      const { command, options, count } = result;
      try {
        const done = Vimov.actions[command](count, options);
        done?.catch?.((err) => console.error('Vimov:', err));
      } catch (err) {
        console.error('Vimov:', err);
        ui.message(`Couldn’t ${describe(result).replace(/^./, (c) => c.toLowerCase())}`);
      }
    }

    input.addEventListener('input', (e) => {
      e.stopPropagation(); // typing here isn't for the page's own listeners
      completing = null;
      show();
    });

    const mode = {
      name: 'command',
      status: 'Enter run · Tab complete · ↑↓ earlier lines · Esc cancel',
      onKey(key) {
        switch (key) {
          case '<esc>':
            Vimov.mode.exit(mode);
            return true;
          case '<enter>':
            run();
            return true;
          case '<tab>':
          case '<s-tab>':
            completeWord(key === '<tab>' ? 1 : -1);
            return true;
          case '<up>':
          case '<down>':
            recall(key === '<up>' ? -1 : 1);
            return true;
          case '<backspace>':
            // Backspace on an empty line closes it, as in Vim.
            if (input.value) return false;
            Vimov.mode.exit(mode);
            return true;
          default:
            return false; // typed into the line
        }
      },
      onExit() {
        bar.remove();
        focused?.focus?.({ preventScroll: true });
      },
    };
    input.addEventListener('blur', () => Vimov.mode.exit(mode));
    Vimov.mode.enter(mode);
    input.focus();
    show();
  }

  return { open, resolve, complete };
})();
