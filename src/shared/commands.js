'use strict';

// Command registry, shared by the content script (dispatch, help overlay) and
// the options page (validation, reference). Implementations live in
// src/content/actions.js.

globalThis.Vimov = globalThis.Vimov || {};

(() => {
  const HINT_ACTIONS = {
    click: 'Click a link, button or field',
    newTab: 'Open a link in a new background tab',
    newTabFg: 'Open a link in a new tab and switch to it',
    copyUrl: 'Copy a link’s URL',
    hover: 'Hover over an element',
    focus: 'Focus an element',
  };

  const SEARCH_SOURCES = {
    all: 'Search tabs, bookmarks, history and the web',
    tabs: 'Search open tabs',
    bookmarks: 'Search bookmarks',
    history: 'Search history',
  };

  // `options` maps option names to types: an array lists the allowed values,
  // otherwise 'boolean', 'number' or 'string'. `required` lists options a
  // mapping must set. `description` may depend on the options.
  const COMMANDS = {
    scrollDown: { category: 'Scrolling', description: 'Scroll down' },
    scrollUp: { category: 'Scrolling', description: 'Scroll up' },
    scrollLeft: { category: 'Scrolling', description: 'Scroll left' },
    scrollRight: { category: 'Scrolling', description: 'Scroll right' },
    scrollHalfDown: { category: 'Scrolling', description: 'Scroll down half a page' },
    scrollHalfUp: { category: 'Scrolling', description: 'Scroll up half a page' },
    scrollPageDown: { category: 'Scrolling', description: 'Scroll down a page' },
    scrollPageUp: { category: 'Scrolling', description: 'Scroll up a page' },
    scrollToTop: { category: 'Scrolling', description: 'Scroll to the top' },
    scrollToBottom: { category: 'Scrolling', description: 'Scroll to the bottom' },
    scrollToLeft: { category: 'Scrolling', description: 'Scroll all the way left' },
    scrollToRight: { category: 'Scrolling', description: 'Scroll all the way right' },

    goBack: { category: 'Page', description: 'Go back in history' },
    goForward: { category: 'Page', description: 'Go forward in history' },
    reload: {
      category: 'Page',
      description: (o) => (o.hard ? 'Reload, bypassing the cache' : 'Reload the page'),
      options: { hard: 'boolean' },
    },
    goUp: { category: 'Page', description: 'Go up one level in the URL' },
    goRoot: { category: 'Page', description: 'Go to the root of the site' },
    copyUrl: { category: 'Page', description: 'Copy the page URL' },
    focusInput: { category: 'Page', description: 'Focus the first text field in view (nth with a count)' },
    enterInsertMode: { category: 'Page', description: 'Pass every key to the page until Esc' },
    openUrl: {
      category: 'Page',
      description: (o) => (o.url ? `Open ${o.url}` : 'Open a URL') + (o.newTab ? ' in a new tab' : ''),
      options: { url: 'string', newTab: 'boolean' },
      required: ['url'],
    },

    linkHints: {
      category: 'Links',
      description: (o) => HINT_ACTIONS[o.action || 'click'],
      options: { action: Object.keys(HINT_ACTIONS) },
    },

    find: { category: 'Find', description: 'Find in page' },
    findNext: { category: 'Find', description: 'Go to the next match' },
    findPrevious: { category: 'Find', description: 'Go to the previous match' },

    search: {
      category: 'Search',
      description: (o) => SEARCH_SOURCES[o.in || 'all'] + (o.newTab ? ', opening in a new tab' : ''),
      options: { in: Object.keys(SEARCH_SOURCES), newTab: 'boolean' },
    },

    nextTab: { category: 'Tabs', description: 'Go one tab right' },
    previousTab: { category: 'Tabs', description: 'Go one tab left' },
    firstTab: { category: 'Tabs', description: 'Go to the first tab' },
    lastTab: { category: 'Tabs', description: 'Go to the last tab' },
    newTab: { category: 'Tabs', description: 'Open a new tab' },
    closeTab: { category: 'Tabs', description: 'Close the tab' },
    restoreTab: { category: 'Tabs', description: 'Reopen the last closed tab' },
    duplicateTab: { category: 'Tabs', description: 'Duplicate the tab' },
    moveTabLeft: { category: 'Tabs', description: 'Move the tab left' },
    moveTabRight: { category: 'Tabs', description: 'Move the tab right' },
    togglePinTab: { category: 'Tabs', description: 'Pin or unpin the tab' },

    showHelp: { category: 'Other', description: 'Show this help' },
    openOptions: { category: 'Other', description: 'Open the options page' },
  };

  Vimov.COMMANDS = COMMANDS;
  Vimov.SEARCH_SOURCES = SEARCH_SOURCES;
  Vimov.CATEGORIES = ['Scrolling', 'Page', 'Links', 'Find', 'Search', 'Tabs', 'Other'];

  Vimov.describeCommand = (name, options = {}) => {
    const { description } = COMMANDS[name] || {};
    if (!description) return name;
    return typeof description === 'function' ? description(options) : description;
  };
})();
