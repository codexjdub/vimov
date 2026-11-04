# AMO listing

Text for the addons.mozilla.org Developer Hub, kept here so later versions can
reuse it. AMO descriptions accept plain text with line breaks and a few HTML
tags (`<b>`, `<i>`, `<code>`, `<a>`, `<ul>`, `<li>`); Markdown isn't rendered.

## Upload

- Platforms: Firefox (desktop) only. Vimov is keyboard-driven, so leave Firefox
  for Android unticked.
- Source code: no. The package is the source as written, with no build,
  minification or bundling.

## Describe add-on

**Name:** Vimov

**Add-on URL:** `vimov`

**Summary** (250 characters max):

> Browse from the keyboard with Vim-style keys: scroll with j and k, follow links with hints, find on the page, search tabs, bookmarks and history from one box, and switch tabs without the mouse. Remap anything with a few readable lines.

**Description:**

```
Vimov lets you browse without reaching for the mouse, using keys borrowed from Vim. Press ? on any page to see them all.

<b>Move around</b>
<ul>
<li>j, k, h, l to scroll; d and u for half a page; gg and G for the top and bottom</li>
<li>Scrolling follows whatever you're looking at, including sidebars and inner panes</li>
<li>H and L for back and forward, gu to go up a level in the URL</li>
</ul>

<b>Follow links with hints</b>
<ul>
<li>f labels every link and button on screen; type a label to click it</li>
<li>F opens the link in a new tab, yf copies its URL</li>
<li>Hints find buttons that are only wired up with JavaScript, custom checkboxes and elements inside shadow DOM</li>
</ul>

<b>Find on the page</b>
<ul>
<li>/ searches as you type and highlights every match, with a running count</li>
<li>n and N jump between matches; landing on a link lets you press Enter to follow it</li>
<li>Case-insensitive unless you type a capital letter</li>
</ul>

<b>Search everything from one box</b>
<ul>
<li>o searches open tabs, bookmarks, history and the web together; b searches bookmarks, T open tabs</li>
<li>Type * for bookmarks, % for tabs, ^ for history or ? for the web, just like Firefox's address bar</li>
<li>Enter switches to a tab, opens a page or a whole bookmark folder; Shift+Enter opens it in a new tab</li>
<li>Your search engine keywords work too: @wikipedia vim</li>
<li>Type v and a space in the address bar for the same search on the new-tab page</li>
</ul>

<b>Tabs</b>
<ul>
<li>K and J (or gt and gT) for the next and previous tab, g0 and g$ for the first and last</li>
<li>t, x, X and yt to open, close, reopen and duplicate tabs</li>
</ul>

<b>Make it yours</b>
Mappings are plain lines on the options page, checked as you type:
<code>map &lt;c-d&gt; scrollHalfDown</code>
<code>map F linkHints action=newTabFg</code>
<code>map gm openUrl url=https://mail.google.com</code>
<code>unmap x</code>

Turn Vimov off on sites with their own shortcuts, or let just a few keys through:
<code>mail.google.com</code>
<code>*.youtube.com f j k l</code>

Typing in a text field always goes to the page; Esc leaves the field. Press i to send every key to the page until Esc.

Vimov collects no data and makes no network requests. Your tabs, bookmarks and history are only searched on your computer.

Firefox doesn't let extensions run on about: pages, addons.mozilla.org, the PDF viewer or Reader View, so Vimov can't work there.
```

**Categories:** Tabs, Other

**Tags:** keyboard, vim, navigation, productivity, accessibility

**Support email:** leave empty

**Support website:** https://github.com/codexjdub/vimov/issues

**Homepage:** https://github.com/codexjdub/vimov

**License:** MIT

**Privacy policy:** none needed; Vimov collects no data
(`data_collection_permissions` is `none` in the manifest).

## Notes to reviewer

```
No build step: the package contains the source exactly as in the repository (https://github.com/codexjdub/vimov), with no minified or generated code, no remote code and no network requests.

Permissions:
- Content scripts on all URLs: Vimov handles keyboard commands on every page.
- storage: the user's key mappings and settings.
- sessions: "reopen closed tab" (X).
- clipboardWrite: copying the page URL (yy) and link URLs (yf) from the background page when the page itself can't write to the clipboard.
- tabs, bookmarks, history: the Search bar (o) and the "v" address-bar keyword search the titles and URLs of open tabs, bookmarks and history entries, so the user can switch to or open them. Bookmarks are only read, never changed. Shift+Delete on a history result deletes that entry, only when the user asks.
- search: web searches from the Search bar use the user's own search engines through search.search().

Search results are matched in the background page (src/sources.js) and drawn in a closed shadow root on the page; nothing is stored or sent anywhere.

To try it, load the add-on, open any page and press ? for the list of keys, f for link hints or o to search.
```

## Version notes (0.2.0)

```
New: one Search bar for open tabs, bookmarks, history and the web (o, O, b, B, T), with Firefox's * % ^ ? shortcuts, search engine keywords, opening whole bookmark folders, and Shift+Delete to close tabs or remove history entries. Type v and a space in the address bar for the same search on pages Vimov can't run on. openUrl maps a key to a site.

Vimov now asks to access tabs, bookmarks and history so it can search them. Nothing leaves your computer.
```

## Version notes (0.1.0)

```
First release: scrolling, link hints, find, tab and history commands, a help overlay, and an options page for key mappings and excluded sites.
```
