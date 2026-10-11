# Better Tabs and Notes

One Obsidian plugin that replaces nine:

| Feature | Replaces |
| --- | --- |
| **Home tab**: a start page with search, bookmarks and recent files | [Home tab](https://github.com/olrenso/obsidian-home-tab) |
| **Tab behaviour**: open in new tab, no duplicate tabs, tab placement, preview tabs | [Open Tab Settings](https://github.com/jesse-r-s-hines/obsidian-open-tab-settings) and [Mononote](https://github.com/czottmann/obsidian-mononote) |
| **Edit mode switch**: a header button for live preview / source / reading | [Edit mode switch](https://github.com/mara-li/obsidian-edit-shortcut) |
| **Pinned daily note**: today's note in one pinned tab | [Pinned Daily Notes](https://github.com/docmarionum1/obsidian-pinned-daily-notes) |
| **Pinned tab icons**: shrink pinned tabs to custom icons | [Pinned Tabs Customizer](https://github.com/diegomarzaa/obsidian-pinned-tabs-customizer) |
| **Scroll buttons**: jump to the top, bottom or cursor of a note | [Scroll to Top](https://github.com/cloudhao1999/obsidian-scroll-to-top-plugin) |
| **Frontmatter cleaner**: delete a note's properties from a list | [Frontmatter Cleaner](https://github.com/sharfaroz7/frontmatter-cleaner) |
| **Bulk properties**: add, change or remove properties in many notes at once | [Multi Properties](https://github.com/technohiker/obsidian-multi-properties) |

Every feature can be turned on or off on its own in the settings, and also
turned off on just one device (handy for desktop-only features like compact
pinned tabs).

## Moving over from the original plugins

1. Install and enable Better Tabs and Notes.
2. In its settings, click **Import** under *Import from the original plugins*.
   It reads the originals' settings from `.obsidian/plugins/*/data.json`.
3. Turn the original plugins off. Running both versions of a feature at the
   same time makes them fight over the same tabs.

## Features

### Home tab

- Replaces empty new tabs with a start page (can also open on startup and
  close the previous session's tabs, keeping pinned tabs).
- Search box that fuzzy-matches file names and aliases, highlights the match,
  and offers to create the note if it doesn't exist. Files with the same name
  are listed together: notes first, then bases, then other file types.
  - <kbd>↑</kbd>/<kbd>↓</kbd> to move, <kbd>Enter</kbd> to open,
    <kbd>Ctrl/Cmd</kbd>+<kbd>Enter</kbd> to open in a new tab,
    <kbd>Shift</kbd>+<kbd>Enter</kbd> to create.
  - Type a file type (`image`, `pdf`, `canvas`, `audio`, `video`, `markdown`)
    or an extension (`png`, `.excalidraw`...) and press <kbd>Tab</kbd> to
    filter. <kbd>Backspace</kbd> on an empty box removes the filter.
  - Type `omni` + <kbd>Tab</kbd> to search note contents with
    [Omnisearch](https://github.com/scambier/obsidian-omnisearch), or make it
    the default in the settings.
  - Type `web` + <kbd>Tab</kbd> to search the web (search engine is
    configurable).
- Lists of bookmarked and recent files.
- Customisable logo (Obsidian logo, any icon, or an image), title, font, size
  and colours.
- Put the page inside a note with a code block:

  ````
  ```home-search
  show bookmarked files
  show recent files
  ```
  ````

  Add `only search bar` to leave out the logo and title. The old
  `search-bar` code block from the Home tab plugin still works.

### Tab behaviour

- **Always open in new tab**: links, the file explorer, search, the quick
  switcher and so on open in a new tab.
- **Prevent duplicate tabs**: if the file is already open, switch to it,
  optionally across splits and popout windows too.
- **Preview tabs** (like VS Code): a new tab stays an italic preview that the
  next file replaces, until you edit it or double-click its tab.
- **New tab position**: after the active tab, after pinned tabs, at the
  beginning or at the end, and which split to use.
- **On this device only** (not synced): whether new tabs come to the front,
  and where they open, can differ per device, e.g. switch to new tabs on your
  phone but open them in the background on desktop.
- **Ctrl/Cmd/middle click**: choose what it does (new tab, same tab, duplicate
  tab, opposite split...).
- File menu items: *Open in same tab*, *Open in duplicate tab*, *Open in
  opposite tab group*.
- **Close duplicates that slip through** (off by default): Mononote's
  after-the-fact check, for duplicates opened by other plugins in ways the
  main hook can't see.
- Commands to toggle the main options and to open a new tab at a given
  position.

### Edit mode switch

- By default it takes over Obsidian's own reading/editing button: same place,
  but a click cycles through live preview, source mode and reading view (in an
  order you choose), and its icon shows the current mode. Nothing is added to
  the note header, so other plugins' header buttons (like Commander's) keep
  their place.
- Or a separate button that switches between live preview and source mode
  (optionally reading view too), or one button per mode with the current one
  highlighted.
- Optionally folds the properties block whenever a note switches into reading
  view (click *Properties* to unfold it).
- *Copy the note header buttons* lists what's in the current note's header,
  for troubleshooting.
- Or no header button at all: use the commands *Switch to next editing mode*,
  *Switch to live preview*, *Switch to source mode* and *Switch to reading
  view* instead, e.g. as Commander buttons. A Commander note header button
  for *Switch to next editing mode* shows the current mode's icon.

### Pinned daily note

- Ribbon button and command that open today's daily note in a pinned tab,
  reusing the same pinned tab every day. Move it wherever you like.
- Creates today's note if needed, using the folder, date format and template
  from the Daily notes core plugin or the Periodic Notes plugin.
- Optional: open on startup, and switch to the new day's note at midnight.

### Pinned tab icons

- Shrink pinned tabs to a fixed width that shows only an icon.
- Icon rules by exact file name, folder, name pattern (starts with, ends
  with, contains, regex, with presets and a live preview), or tag. The first
  matching rule wins, and rules that are shadowed by earlier ones are flagged.
- A frontmatter property (default `pinned-icon`) can override the rules per
  note.
- Icons can be emoji, text or any of Obsidian's built-in icons.
- *Set pinned tab icon* in the file menu, plus commands.

### Scroll buttons

- Small floating buttons in the bottom right corner of each note: scroll to
  the top, to the bottom, and (while editing) back to the cursor.
- Choose which buttons show, their icons, size and tooltips.
- Commands for each, e.g. to bind to hotkeys or Commander buttons.
- Optionally also on web pages opened with the Surfing plugin.

### Frontmatter cleaner

- *Clean properties of current file* (command or ribbon button) lists the
  note's properties with their values. Tap rows to select them, or use
  *Select all*, *Select none* or *Empty*, then *Delete selected*.
- *Delete empty properties of current file* removes blank, null and empty-list
  properties in one go, without the list.
- Optionally keep a record of what was deleted in the note's text: as a table,
  `property: value` or `property:: value` lines, at the top, at the bottom or
  under a heading.

### Bulk properties

- Right-click a folder and choose *Add or change properties in folder* or
  *Remove properties from folder*. Subfolders are included unless you turn
  that off.
- Or select several notes (and folders) in the file explorer, right-click the
  selection and choose *Add or change properties in selected notes* or
  *Remove properties from selected notes*.
- Adding: type one or more property names (existing ones are suggested and
  keep their type), pick a type and a value. Separate values with a comma to
  make a list. Choose what happens when a note already has the property:
  leave it, replace it, or add to its list.
- Removing: tick properties from a list of those found in the notes, with how
  many notes have each.
- Both ask for confirmation first.

## Development

```
npm install
npm run dev         # rebuild main.js on change
npm run lint        # eslint + tsc
npm run lint:css
npm test
npm run build
```

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/better-tabs-and-notes/` to try it out.

### Layout

```
src/
  main.ts              plugin entry; loads/unloads features as settings change
  feature.ts           base class for a switchable feature
  settings.ts          all settings and defaults
  settingsTab.ts       the settings screen
  legacyImport.ts      import from the original plugins
  types.d.ts           undocumented Obsidian internals we rely on
  features/
    homeTab/           home view, search bar, recent files, bookmarks
    tabs/              tab opening patches (Open Tab Settings + Mononote)
    editMode/          header mode button
    dailyNote/         pinned daily note
    pinnedIcons/       compact pinned tabs, icon rules and pickers
    scrollButtons/     scroll to top / bottom / cursor buttons
    frontmatterCleaner/ property cleaner list and commands
    bulkProperties/    add, change or remove properties in many notes
tests/                 unit tests for the Obsidian-free logic
```

## License

GPL-3.0, because Edit mode switch is GPL-3.0. The other original plugins are
MIT or 0BSD; see [NOTICE.md](NOTICE.md) for credits and their license texts.
