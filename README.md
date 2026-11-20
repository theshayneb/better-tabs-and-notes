# Better Tabs and Notes

One Obsidian plugin that replaces eighteen:

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
| **Tag renaming**: rename a tag, or merge it into another, everywhere | [Tag Wrangler](https://github.com/pjeby/tag-wrangler) |
| **Links in properties**: several links in one property, each a real link and a backlink | [Frontmatter Markdown Links](https://github.com/mnaoumov/obsidian-frontmatter-markdown-links) |
| **Nested properties**: nested properties as a collapsible, editable tree | [Nested Properties](https://github.com/mnaoumov/obsidian-nested-properties) |
| **Hide commands**: hide commands from the command palette, keeping them working | [Command Block List](https://github.com/RyotaUshio/obsidian-command-block-list) |
| **Link icons**: an icon before links to PDFs, images and other files, by file type | (new) |
| **Property templates**: properties by folder or tag, inserted and ordered with a click, and values to pick from | Part of [Fileclass](https://github.com/mdelobelle/fileclass) (new code) |
| **Task sweeper**: completed tasks move to a dated Done section at the bottom of the note | [Task Sweeper](https://github.com/BryanHogan/task-sweeper) |
| **Pinned notes**: notes pinned to the ribbon, with dividers between icons, or to one menu button | [Pinned Notes Menu](https://github.com/theshayneb/pinned-notes-menu), which combined [Pinned Notes](https://github.com/vasilcoin002/pinned-notes-plugin-obsidian) and [Ribbon Divider](https://github.com/andrewmcgivery/obsidian-ribbon-divider) |

Every feature can be turned on or off on its own in the settings, and also
turned off on just one device (handy for desktop-only features like compact
pinned tabs).

## Start page per device

At the top of the settings, *When Obsidian opens on this device* picks what
opens at startup on that device only (it isn't synced): just the tabs from
last time, the home tab, today's pinned daily note, or a specific note,
optionally closing the other tabs. Left on *Same as other devices*, the
synced "open on start" settings of the home tab and pinned daily note apply.

## Several devices and Obsidian Sync

The plugin is built for one always-on desktop plus phones and tablets that sync
now and then:

- **Run background tasks on this device** (top of the settings, not synced; on
  for desktop, off for phones and tablets by default). Only that device creates
  today's daily note on its own and repairs synced settings.
- Automatic work waits for Sync to settle first: a quiet minute with no vault
  changes and Sync not busy (at most 10 minutes; longer while Sync reports it's
  syncing).
- Using the plugin never writes its settings: recent notes, recent icons and
  remembered choices are kept on each device. Settings are written only when
  you change one, and not at all when nothing changed.
- Settings changed on different devices are merged by when each change was
  made, not by which device saved last. Lists (hidden commands, pinned tab
  icon rules, link icon rules, property templates, pinned notes) merge item by
  item. If Sync
  brings back an older copy from a device that was offline, the background
  device puts the newer changes back once Sync has settled.

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
- Bookmarks and recent files can be shown in one, two or three columns.
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
- If today's note isn't there yet, it first waits for Sync to settle (another
  device may have made it), showing *Waiting for sync…* with a *Create now*
  button. Then the background device creates it; a phone or tablet shows
  *Create today's note* instead, and opens the note by itself if it arrives.
  Opening it by hand creates it once Sync has settled.

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
- Choose which buttons show, their icons, size and tooltips, and where they
  sit: bottom right or bottom left, and how far from the edges.
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

### Tag renaming

- Right-click a tag in the Tags view, in reading view or in the editor and
  choose *Rename #tag* or *Merge #tag into another tag*. Or use the commands
  *Rename a tag* and *Merge a tag into another*.
- Renaming also renames subtags (`#project/alpha` follows `#project`), in note
  text and in the `tags` property. Typing the name of a tag that already
  exists merges the two, with a warning first.
- Merging picks the tag to merge into from a list of existing tags.
- Both ask for confirmation first.

### Links in properties

- A property value that holds several links, or a link with other text
  (`[[Chapter one]] and [Chapter two](<Chapter two.md>)`), shows each link
  separately in the Properties panel. Click one to open it (ctrl/cmd-click or
  middle-click for a new tab), hover to preview it, and click the text around
  the links to edit the value.
- Those links resolve and count as backlinks on the notes they point to,
  including links inside nested properties.
- Wikilinks and markdown links both work; paths with spaces can be in angle
  brackets or percent-encoded. A value that is exactly one link is left to
  Obsidian, which already handles it.

### Nested properties

- Properties that contain other properties or lists of objects show as a
  collapsible tree. A collapsed one shows a one-line summary; choose how many
  levels start open in the settings.
- Each value in the tree is edited with Obsidian's own controls (text, number,
  checkbox, date, list...). Add properties and list items with the buttons at
  the bottom of each level.
- Right-click an entry (or click its icon) to change its type, or to cut, copy,
  paste or remove it. In a list of objects, a field's type can be set for every
  item at once or for one item only.

### Hide commands

- Hide commands from the command palette by ID. Hidden commands keep working:
  nothing is unregistered or disabled, so hotkeys, buttons (e.g. Meta Bind),
  Commander macros and `executeCommandById` still run them.
- In the settings: search every command (core and all plugins) and hide or
  unhide it; see the hidden list, where commands of plugins that aren't loaded
  are marked *Not loaded* so they can be removed; or paste a list of commands
  ("Plugin: Command", one per line) to hide them all at once.
- By default only the command palette is filtered, so the Hotkeys page and other
  plugins' command pickers still list everything. If that doesn't work in your
  Obsidian version, *Where to hide them: Everywhere* filters every list of
  commands instead (including the Hotkeys page).
- Changes apply the next time the palette opens; the list syncs between devices.

### Link icons

- Links to files that aren't notes get an icon before their name, chosen by
  the file type: `[[ThingIWantToRead.pdf]]` shows a document icon. Shown in
  reading view and Live Preview (not in source mode, and not for embeds, which
  show the file itself).
- Comes with icons for PDFs, images, audio, video, EPUBs, canvases, bases,
  documents, spreadsheets and archives. Change them in the settings: each rule
  is a list of extensions and an icon (an Obsidian icon or an emoji).

### Property templates

- Rules by folder, tag or name (the same kinds as pinned tab icons) list the
  properties a note should have, in order, each with an optional starting value
  and optional values to pick from.
  Every rule that matches a note counts, the first rule first.
- Under a note's properties, next to *Add property*, **Insert N missing
  properties** adds the ones it doesn't have yet in the right places (existing
  properties are never changed, even empty ones), and **Reorder properties**
  puts them in the rules' order, leaving any others after them. Each button only
  shows when there's something to do.
- The same from the command palette for the current note, or for every note in
  a folder from its right-click menu.
- **Values to pick from**: give a property in a rule a list of values, and a
  dropdown button next to it offers them in the notes that rule matches, so
  *Genre* can offer different values for books and films. If several matching
  rules give values, the first one's are used. Values in "Values to pick from in
  every note" apply to any note no matching rule gives values for. You can still
  type anything else; for list properties a value is added or removed.
- **Hide** (the switch on each property in a rule): the property is hidden in
  the Properties panel of notes that rule matches, but stays in the note.
  **Show N hidden properties** under the panel shows them again for that note.

### Pinned notes

- Each pinned note is its own ribbon icon, in the order of the list in the
  settings; dividers draw a thin line between ribbon icons (not on phones).
  Middle-click opens a new tab. Notes open like a link click, so tab behaviour
  (new tab, no duplicate tabs) applies.
- Optional menu button: one ribbon button with all pinned notes, dividers as
  separators, plus *Pin current note* and *Edit pinned notes*.
- Commands *Open pinned note* (a picker), *Pin current note* and *Unpin current
  note*, and *Pin to / Unpin from pinned notes* in a file's right-click menu.
- In the settings: a title (optional, the file name by default), path and icon
  (a Lucide name or an emoji) for each note, with warnings for a missing note
  or an unknown icon.
- Pinned notes follow their note or folder when it's renamed or moved (on the
  device that runs background tasks, once Sync has settled).
- Imports from Pinned Notes Menu (also done once by itself on the device that
  runs background tasks), and from the original Pinned Notes and Ribbon
  Divider plugins. CSS snippets for Ribbon Divider's `ribbon-divider` class
  keep working.

### Task sweeper

- *Sweep completed tasks to bottom of note* moves completed top-level tasks,
  with everything indented under them (subtasks, notes, code), to a `## Done`
  section at the bottom of the note, and adds the date they were swept
  `(YYYY-MM-DD)` to any that don't have one. Open tasks stay where they are.
- Optional auto sweep, right after you check a task off. Undo puts it back.
- Works in every note, or only in chosen files and folders (*Add current file
  to task sweeper scope* adds the open note).
- Only `- [x]` / `- [X]` tasks that aren't indented count; other statuses
  (`[-]`, `[/]`), numbered tasks, frontmatter and code blocks are left alone,
  and nothing is swept while a code block is unclosed. Block ids (`^abc`) stay
  at the end of the line. A `## Done` heading followed by other sections is
  yours: a new one is made at the bottom.
- Everything stays plain Markdown.

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
    tagRename/         rename and merge tags
    frontmatterLinks/  links inside property values
    nestedProperties/  nested properties tree
    hideCommands/      hide commands from the command palette
    linkIcons/         icons before links to non-note files
    propertyTemplates/ property templates and value choices
    pinnedNotes/       pinned notes in the ribbon or a menu, ribbon dividers
    taskSweeper/       move completed tasks to a Done section
  shared/editLog.ts    merging settings edits from several devices by edit time
  shared/syncSettle.ts waiting for Obsidian Sync to settle
  shared/deviceMemory.ts things kept on this device only (local storage)
tests/                 unit tests for the Obsidian-free logic
```

## License

GPL-3.0, because Edit mode switch is GPL-3.0. The other original plugins are
MIT, ISC or 0BSD; see [NOTICE.md](NOTICE.md) for credits and their license texts.
