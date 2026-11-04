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
<li>j, k, h, l to scroll (hold them to glide); d and u for half a page; gg and G for the top and bottom</li>
<li>Scrolling follows whatever you're looking at, including sidebars and inner panes</li>
<li>H and L for back and forward, gu to go up a level in the URL</li>
<li>]] and [[ follow a page's "next" and "previous" links, through search results, forums and article series</li>
<li>p opens the URL on the clipboard (or searches for the text), P in a new tab; gr opens Reader View</li>
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
<li>n and N jump between matches, or Ctrl+J and Ctrl+K while you type; landing on a link lets you press Enter to follow it</li>
<li>Case-insensitive unless you type a capital letter</li>
</ul>

<b>Search everything from one box</b>
<ul>
<li>o searches open tabs, bookmarks, history and the web together; b searches bookmarks, T open tabs</li>
<li>Type * for bookmarks, % for tabs, ^ for history or ? for the web, just like Firefox's address bar</li>
<li>Ctrl+J and Ctrl+K move through the results; Enter switches to a tab, opens a page or a whole bookmark folder; Shift+Enter opens it in a new tab</li>
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
Or click the toolbar button to turn Vimov off for the site you're on, and again to turn it back on.

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

In [`reviewer-notes.txt`](reviewer-notes.txt). The release workflow sends them
with every version; paste them by hand only when uploading through the website.

## Version notes (0.3.0)

```
New: a toolbar button turns Vimov off for the site you're on, and back on. Holding j, k, h or l now glides smoothly instead of jumping. The Search bar is quicker, looking up tabs, bookmarks and history at the same time, and n and N in find no longer re-read the whole page on every press. Fixed: picking a tab among the address-bar suggestions could load its page instead of switching to it.
```

## Version notes (0.2.2)

```
Link hints no longer cover each other: a hint that would hide another moves beside it. Fixes: a key that switched tabs could swallow the next press of that key on the page you left; searching for words like "constructor" found nothing; find now scrolls to matches deep in long plain-text pages; bookmark folders without a name no longer break the Search bar; address-bar results opened in a background tab stay in the background; excluding a site no longer also excludes addresses that merely start the same way.
```

## Version notes (0.2.1)

```
Ctrl+J and Ctrl+K move through results in the Search bar, and step through matches while you type in the find bar. Esc after a search now clears the last match too, so nothing stays highlighted.
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
