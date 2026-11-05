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
`store/amo-listing.md`.

## Keys

| Keys | Does |
| --- | --- |
| `j` `k` `h` `l`, `d` `u`, `gg` `G` | Scroll; half page; top and bottom |
| `f`, `F`, `yf` | Link hints: click, open in a new tab, copy the URL |
| `/`, `n` `N` | Find in page; next and previous match (Ctrl+J and Ctrl+K while typing) |
| `o` `O`, `b` `B`, `T` | Search tabs, bookmarks, history and the web in the vbar; bookmarks only; open tabs only |
| `K` `J` (or `gt` `gT`), `g0` `g$` | Next and previous tab; first and last tab |
| `t`, `x`, `X`, `yt` | New, close, reopen and duplicate a tab |
| `H` `L`, `r`, `gu` `gU`, `yy` | Back and forward, reload, up the URL, copy the URL |
| `}` `{` | Follow the page's "next" and "previous" links |
| `p` `P` | Open the URL on the clipboard (or search for its text), here or in a new tab |
| `gr` | Open the page in Reader View |
| `i`, `gi` | Pass keys to the page until Esc; focus a text field |

A count repeats or scales a command: `5j`, `3K`. Holding `j`, `k`, `h` or `l`
glides smoothly rather than jumping (unless smooth scrolling is off). Esc
leaves a text field, closes hints or find, and clears find highlights.

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
folder, in any order.

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

The toolbar button does this for the site you're on: click it to turn Vimov
off there (it adds the site to excluded sites, and the button shows "off"),
click again to turn it back on. If a pattern of your own covers the site, the
button opens the options page instead of changing it.

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
