# Vimov

Vim-style keyboard browsing for Firefox: scrolling, link hints, find, one
search box for tabs, bookmarks and history, and tab commands, with a small
config language that's easy to read.

## Try it

1. Open `about:debugging#/runtime/this-firefox` in Firefox 140 or later.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Press `?` on any page for the list of keys.

Temporary add-ons last until Firefox restarts. To keep it running while you
edit, use [web-ext](https://github.com/mozilla/web-ext), which reloads on save:

```bash
npx web-ext run
```

`npx web-ext build` makes the zip for addons.mozilla.org; `web-ext-config.mjs`
keeps development files out of it. The listing text lives in
`store/amo-listing.md`, and `sh dev/screenshots.sh` retakes its screenshots
(with `node dev/serve.mjs` running).

## Keys

| Keys | Does |
| --- | --- |
| `j` `k` `h` `l`, `d` `u`, `gg` `G` | Scroll; half page; top and bottom |
| `f`, `F`, `yf` | Link hints: click, open in a new tab, copy the URL |
| `/`, `n` `N` | Find in page; next and previous match (Ctrl+J and Ctrl+K while typing) |
| `o` `O`, `b` `B`, `T` | Search tabs, bookmarks, history and the web in the vbar; bookmarks only; open tabs only |
| `K` `J` (or `gt` `gT`), `g0` `g$` | Next and previous tab; first and last tab |
| `t`, `x` (or `ZZ`), `X`, `yt` | New, close, reopen and duplicate a tab |
| `H` `L`, `r`, `gu` `gU`, `yy` | Back and forward, reload, up the URL, copy the URL |
| `}` `{` | Follow the page's "next" and "previous" links |
| `p` `P` | Open the URL on the clipboard (or search for its text), here or in a new tab |
| `gr` | Open the page in Reader View |
| `i`, `gi` | Pass keys to the page until Esc; focus a text field |
| `:` | The command line: any command by name, or a Vim word such as `:q` or `:tabnew` |

A count repeats or scales a command: `5j`, `3K`. Holding `j`, `k`, `h` or `l`
glides smoothly rather than jumping (unless smooth scrolling is off). Esc
leaves a text field, closes hints or find, and clears find highlights. After
`J`, `K`, `g0`, `g$`, `<<` or `>>`, the tab you land on says where it is for a
moment ("Tab 4 of 9"), with a dot sliding over from the tab you left.

`?` lists every key with your own mappings, opposite commands on one row
(`j / k  Scroll down / up`), then the keys inside the vbar, find, the command
line and hints.
Type `/` there to filter it (`/tab`, `/ctrl`); Enter keeps the filter, Esc
drops it. Link hints and find show their own keys in the corner while open.
Pause half a second after the first key of a sequence, such as `g`, and the
keys that can follow it show above the corner of the page. A first install
opens a welcome page with the same list.

While a [Largitude](https://github.com/codexjdub/Largitude) popup is open,
Vimov leaves every key to it, so Largitude's own keys (`?`, `o`, `r`, `f` and
the rest) work.

`}` looks for a link marked `rel="next"`, then one whose text starts with
"Next" or "Newer" (or 下一页 and 下一章 in Chinese), or ends in an arrow such
as `›` or `»`; `{` does the same for "Prev", "Previous" and "Older" (上一页,
上一章). Vimium and Tridactyl use `]]` and `[[`;
Vimov leaves `[` and `]` alone because video speed extensions use them. To
have them anyway, add `map ]] nextPage` and `map [[ previousPage`.

Firefox doesn't let extensions into Reader View, so Vimov's keys don't work
there. Leave it with Firefox's own shortcut (Ctrl+Alt+R, or ⌘⌥R on a Mac),
the Reader View button in the address bar, or the back button.

## The vbar

`o` opens the vbar, one box for everything: open tabs in every window,
bookmarks and their folders, history, and a web search with your default
engine. Every word you type has to appear in a result's title, URL or
folder, in any order. Among results that match about as well, open tabs
come first, then bookmarks, and pages you've visited often and lately move
up.

With nothing typed, `o` lists your five most recently used tabs, then your
most visited sites (the ones on Firefox's new-tab page), then your other tabs
if there's room: 10 results in all. In a private window it lists only your
private tabs.

Results show the site's icon when Firefox already has it from an open tab or
your top sites, and a letter otherwise. Vimov never fetches icons, which would
tell sites what you have open.

- Ctrl+J and Ctrl+K (or Tab and Shift+Tab, or the arrow keys) move down and
  up the results.
- `O` and `B` open results in a new tab; Shift+Enter does the opposite of the
  key you pressed.
- A word on its own limits the search, as in Firefox's address bar:
  `*` bookmarks, `%` tabs, `^` history, `?` the web.
- Start with a search engine's keyword (set in Firefox's search settings) or
  `@` and its name to search with it: `@wikipedia vim`.
- Enter switches to a tab, opens a page, or opens every bookmark in a folder
  (asking first for more than 10). Shift+Delete closes a tab or removes a
  history entry; bookmarks are never removed.
- Type `v` and a space in Firefox's address bar for the same search on pages
  Vimov can't run on, such as the new-tab page.

## The command line

`:` opens a line at the bottom of the page. Type any command by its name, with
options as in a mapping (`:scrollToBottom`, `:reload hard=true`), or one of the
Vim words that mean something in a browser:

| Type | Does |
| --- | --- |
| `:q`, `:wq`, `:x`, `:close` | Close the tab |
| `:tabnew`, `:tabnew example.com` | Open a new tab, or a page in one |
| `:e`, `:e!`, `:e example.com` | Reload, reload bypassing the cache, or open a page here |
| `:o`, `:o example.com` | Open the vbar, or a page here |
| `:b text`, `:bookmarks text`, `:history text` | Search open tabs, bookmarks or history for the text |
| `:tabn` `:tabp`, `:tabfirst` `:tablast` | Next and previous tab; first and last tab |
| `:tabm +2`, `:tabm -1` | Move the tab right or left |
| `:u`, `:pin`, `:back` `:forward`, `:h`, `:set` | Reopen a closed tab; pin or unpin; back and forward; help; the options |

As you type, the line says what Enter will do. Tab completes a command's name
(again for the next one), Up and Down bring back earlier lines, and a line that
can't run says why and stays open to be fixed.

## Configure

The options page (`about:addons` → Vimov → Preferences) takes mappings on top
of the defaults:

```
map <c-d> scrollHalfDown
map F linkHints action=newTabFg
map gm openUrl url=https://mail.google.com
unmap x
```

Commands take `option=value` settings, listed with every command on the options
page. Excluded sites are a URL pattern per line, optionally followed by keys to
pass through to the page:

```
mail.google.com
*.youtube.com f j k l
```

The options page also shows your week with Vimov: links followed with hints,
the distance scrolled with Vimov's keys and tabs switched with them, since
Monday, with last week's beside them. They're counted on this computer only
(in `storage.local`) and never sent anywhere.

The toolbar button does this for the site you're on: click it to turn Vimov
off there (it adds the site to excluded sites, and the button shows "off"),
click again to turn it back on. If a pattern of your own covers the site, the
button opens the options page instead of changing it.

`J` and `K` follow Firefox's tab layout: with vertical tabs, `J` goes down to
the next tab and `K` up to the previous one (the help then says "down / up"),
and they switch back when Firefox does. Firefox 142 and later tell extensions
the layout; on 140 and 141 Vimov treats tabs as across the top. Zen Browser
keeps its tabs down the side whatever Firefox's setting says, so Vimov goes by
Zen's own mark in `runtime.getBrowserInfo()` there (Zen from February 2026 on).
A sidebar extension for tabs, such as Sidebery or Tree Style Tab, can't be
seen; choose "Down the side" for it. Reading it
takes the `browserSettings` permission, which Firefox words as "Read and modify
browser settings"; Vimov only reads `browserSettings.verticalTabs`. Under Tabs
in the options you can set "Across the top" or "Down the side" yourself, and
your own `map` lines for `J` and `K` win either way.

## Development

- `src/content/` runs in every page; `main.js` routes keys to the active mode
  or the keymap, and `actions.js` holds the command implementations.
- `src/shared/` is used by both the content script and the options page: the
  command registry, default keymap and key-notation parser.
- `src/background.js` does the tab work a content script can't, the
  address-bar keyword and the toolbar button; `src/sources.js` finds and ranks
  results for the vbar and the keyword.
- `test/` has Node tests that load the scripts with stand-in browser APIs:
  `npm install` once, then `npm test`. `npm run lint`, `npm run build` and
  `npm start` (Firefox with Vimov loaded) run the pinned web-ext.
- `dev/playground.html` is a page of tricky cases (hidden and covered links,
  shadow DOM, inner scrollers, text split across elements). Open it in Firefox
  with Vimov loaded, or run the content scripts in any browser through the
  harness: `node dev/serve.mjs`, then open
  `http://127.0.0.1:8765/dev/playground.html?harness`.

## Releasing

Publishing a GitHub release submits that version to addons.mozilla.org
(`.github/workflows/release.yml`):

1. Bump `version` in `manifest.json`, commit and push.
2. `gh release create v<version> --title "Vimov <version>" --notes "…"`. The
   notes become AMO's release notes, so write them as plain text.

The workflow checks the tag matches the manifest, runs the tests and lint,
submits with `web-ext sign` (reviewer notes come from `store/reviewer-notes.txt`) and
attaches the zip to the release. Mozilla reviews each version before it
reaches users. It needs the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository
secrets, from AMO's API key page. Pre-releases are skipped, so nothing
reaches AMO until the release is marked as a full release. Everything the
workflow runs is pinned (actions by commit, web-ext by `package-lock.json`),
since those steps hold the AMO keys.

## Limits

Firefox doesn't run extensions on `about:` pages, `addons.mozilla.org`, the
PDF viewer or Reader View, so Vimov can't work there; the `v` address-bar
keyword still searches from them. Link hints and find cover the frame that has
focus; hints across iframes are planned.

## License

[MIT](LICENSE)
