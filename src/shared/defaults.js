'use strict';

// Default key mappings and settings. Storage holds only the user's settings;
// their keymap lines are applied on top of DEFAULT_KEYMAP.

Vimov.DEFAULT_KEYMAP = `# Scrolling
map j scrollDown
map k scrollUp
map h scrollLeft
map l scrollRight
map d scrollHalfDown
map u scrollHalfUp
map gg scrollToTop
map G scrollToBottom
map zH scrollToLeft
map zL scrollToRight

# Page
map H goBack
map L goForward
map r reload
map R reload hard=true
map gu goUp
map gU goRoot
map yy copyUrl
map gi focusInput
map i enterInsertMode

# Links
map f linkHints
map F linkHints action=newTab
map yf linkHints action=copyUrl

# Find
map / find
map n findNext
map N findPrevious

# Tabs
map K nextTab
map J previousTab
map gt nextTab
map gT previousTab
map g0 firstTab
map g$ lastTab
map t newTab
map x closeTab
map X restoreTab
map yt duplicateTab
map << moveTabLeft
map >> moveTabRight
map <a-p> togglePinTab

# Other
map ? showHelp
`;

Vimov.DEFAULT_SETTINGS = {
  keymap: '',
  exclusions: '',
  hintChars: 'sadfjklewcmpgh',
  scrollStep: 60,
  smoothScroll: true,
};

// Lower-cases and de-duplicates hint characters. Returns null when fewer than
// two remain.
Vimov.normalizeHintChars = (chars) => {
  const unique = [...new Set([...String(chars).toLowerCase()].filter((c) => /\S/.test(c)))];
  return unique.length >= 2 ? unique.join('') : null;
};
