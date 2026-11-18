# Changelog

## [0.0.35] - 2026-11-18

Safe with Obsidian Sync across devices that sync at different times.

### Added
- "Run background tasks on this device" (top of the settings, not synced; on for desktop, off for phones and tablets by default). Only that device creates today's daily note on its own and repairs synced settings.
- Settings changed on different devices are merged by when each change was made, not by which device saved last. Hidden commands, pinned tab icon rules, link icon rules and property templates merge item by item. If Sync brings back an older copy of the settings from a device that was offline, the background device puts the newer changes back once Sync has settled.

### Changed
- Pinned daily note: if today's note isn't there yet, it waits for Sync to settle first (a quiet minute), showing "Waiting for sync…" with a "Create now" button. Then the background device creates it, and a phone or tablet shows "Create today's note" instead of creating it (and opens the note by itself if it arrives). Opening it by hand creates it once Sync has settled. This replaces the 8-second wait at startup, and also applies to opening it at startup.
- Recent notes (home tab), recent icons, and the last choices in bulk properties and the property cleaner are now kept on each device instead of in the synced settings. Recent notes and icons from before are moved over on each device.

### Fixed
- Opening a note no longer rewrites the plugin's settings file (the recent notes list was saved there), which let a phone that was offline bring back old settings when it synced.
- Settings are only written when something actually changed.
- Settings that arrive from another device while the settings page is open now show there, instead of later edits going to the old copy and being lost.
- "Insert missing template properties" no longer rewrites a note when nothing is missing.

## [0.0.34] - 2026-11-15

### Changed
- Property templates: values to pick from now belong to each rule, so a property such as Genre can offer different values in different kinds of notes. If several matching rules give values, the first one's are used. Values you had set are copied into every rule that lists the property. The section below the rules is now "Values to pick from in every note", for properties no matching rule gives values for.

## [0.0.33] - 2026-11-15

### Added
- Property templates: a switch on each property in a rule hides that property in the Properties panel of the notes the rule matches. The property stays in the note; "Show N hidden properties" under the panel shows them again.

## [0.0.32] - 2026-11-15

### Changed
- Property templates: the dropdown arrow for values to pick from now sits at the start of the value, next to the property name, instead of at the far right.

## [0.0.31] - 2026-11-15

### Fixed
- Property templates: the dropdown arrow for values to pick from didn't show. It is now added to the property rows directly (not through Obsidian's property drawing), so it shows for text and list properties alike, and is easier to see.

## [0.0.30] - 2026-11-15

- Property templates: each property in a rule now has three fields, labelled: its name, the starting value a note gets when it's inserted, and the values to pick from in the dropdown. Before, only the starting value sat next to the name, so a list of choices typed there was inserted into every note in full; the values to pick from were in a separate section further down, which still exists for properties no rule lists.

## [0.0.29] - 2026-11-15

- Fix property templates adding another set of "Insert missing properties" buttons every time a note's properties refreshed. The buttons sit next to "Add property", deeper in the properties panel than where the check for existing buttons looked. Now there's always one set, and extra sets left by 0.0.27 and 0.0.28 are removed.

## [0.0.28] - 2026-11-15

- Fix typing in the settings of property templates, link icons and nested properties: every keystroke redrew the open notes, which took the cursor out of the field. Those redraws now wait until you close the settings (or switch to another settings tab). Settings are still saved as you type.

## [0.0.27] - 2026-11-15

- New feature: property templates. Rules by folder, tag or name list the properties a note should have, in order, with optional starting values; every matching rule counts, the first first. Next to "Add property", "Insert N missing properties" adds the missing ones in the right places without changing existing ones, and "Reorder properties" puts properties in the rules' order, leaving others after them. Also as commands for the current note and from a folder's right-click menu.
- Property templates can also give a property a list of values: a dropdown button next to it offers them, and you can still type anything else.

## [0.0.26] - 2026-11-15

- New feature: link icons. Links to files that aren't notes get an icon before their name, chosen by the file type, so `[[ThingIWantToRead.pdf]]` shows a document icon. Works in reading view and Live Preview; embeds are left alone. Comes with icons for PDFs, images, audio, video, EPUBs, canvases, bases, documents, spreadsheets and archives, and you can change them or add your own file types in the settings (Obsidian icons or emoji).

## [0.0.25] - 2026-11-14

- New feature: hide commands from the command palette. Hidden commands keep working from hotkeys, buttons, macros and other plugins; nothing is unregistered. In the settings, search every command and hide or unhide it, see what's hidden (commands of plugins that aren't loaded are marked "Not loaded"), or paste a list of commands to hide them all at once. Only the command palette is filtered by default, so the Hotkeys page and other plugins' command pickers still list everything; "Where to hide them: Everywhere" is there in case that doesn't work. Changes apply the next time the palette opens, and the list syncs between devices.

## [0.0.24] - 2026-11-07

- New feature, from the Frontmatter Markdown Links plugin: links in properties. A property value holding several links, or a link with other text, now shows each link separately in the Properties panel. Click to open (ctrl/cmd-click or middle-click for a new tab), hover to preview, and click the text around the links to edit. The links also resolve and count as backlinks on the notes they point to.
- New feature, from the Nested Properties plugin: nested properties. Properties that contain other properties or lists of objects show as a collapsible tree with a one-line summary when collapsed. Edit values with Obsidian's own controls, add properties and list items, and right-click an entry to change its type or to cut, copy, paste or remove it. Choose how many levels start open in the settings. "Import" in the settings reads Nested Properties' starting level.

## [0.0.23] - 2026-10-22

- Pinned daily note: moving to the new day after midnight now works on mobile. Phones freeze or close Obsidian in the background, so the once-a-minute check slept through midnight, and after a restart the pinned tab kept yesterday's note. Now the pinned tab also moves to today when Obsidian comes back on screen, and a few seconds after Obsidian starts (giving Sync time to bring in today's note if another device already made it).

## [0.0.22] - 2026-10-17

- Home tab lists: the hidden remove button no longer takes up space at the end of every row, so names use the full width of their column and both columns end evenly under the search bar. The button still appears when you hover a row. The list heading now lines up with the icons below it.

## [0.0.21] - 2026-10-16

- Home tab: the bookmarks and recent files lists are the same width as the search bar again, so they line up underneath it instead of spilling past its left edge.

## [0.0.20] - 2026-10-16

- Home tab: the bookmarks and recent files lists can now be shown in columns (two by default, or one or three; setting "Columns" under Lists). The list still reads top to bottom, down the first column and then the next. Narrow screens like phones keep one column.

## [0.0.19] - 2026-10-15

- Scroll buttons: choose which side of the note they sit on (bottom right or bottom left) and how far they are from the bottom and the side, e.g. to lift them clear of the status bar.
- New setting at the top of the settings, "When Obsidian opens on this device": choose a start page for this device only (not synced): just the tabs from last time, the home tab, today's pinned daily note, or a specific note, and optionally close the other tabs. "Same as other devices" keeps using the synced "open on start" settings of the home tab and pinned daily note.

## [0.0.18] - 2026-10-12

- New feature, from the Tag Wrangler plugin: tag renaming. Right-click a tag in the Tags view, in reading view or in the editor to rename it, or to merge it into another tag, in every note at once. Subtags follow along, and tags are changed both in note text and in the tags property. Renaming to a tag that already exists warns that the two will be merged. Also available as the commands "Rename a tag" and "Merge a tag into another". Both ask for confirmation first.

## [0.0.17] - 2026-10-11

- New feature, from the Multi Properties plugin: bulk properties. Right-click a folder, or a selection of notes in the file explorer, to add or change properties in all of them at once, or to remove properties from them. Adding suggests existing property names and keeps their type; a comma-separated value becomes a list; you choose whether notes that already have the property keep it, get it replaced, or get the new values added to its list. Both ask for confirmation first. "Import" in the settings now also reads Multi Properties' settings.

## [0.0.16] - 2026-10-11

- New feature, from the Frontmatter Cleaner plugin: frontmatter cleaner. "Clean properties of current file" (command or ribbon button) lists the note's properties so you can select and delete them, with shortcuts to select all, none or the empty ones. Optionally keeps a record of deleted properties in the note. "Import" in the settings now also reads Frontmatter Cleaner's settings.
- New command "Delete empty properties of current file", which removes blank, null and empty-list properties without opening the list.

## [0.0.15] - 2026-10-11

- New feature, from the Scroll to Top plugin: scroll buttons. Small buttons in the corner of each note jump to the top, to the bottom, or (while editing) back to the cursor. Choose which buttons show, their icons, size and tooltips. Also available as commands, and optionally on Surfing web pages. "Import" in the settings now also reads Scroll to Top's settings.

## [0.0.14] - 2026-10-11

- Home tab search: files with the same name are listed together, notes (.md) first, then bases (.base), then other file types. Results are still ordered by how well they match.

## [0.0.13] - 2026-10-11

- Tab behaviour: new "On this device only" settings, which don't sync. Choose per device whether new tabs come to the front (always, only for normal clicks, or never), where new tabs open, and where they open when split. Each defaults to "same as other devices".
- Fix "Fold properties in reading view" sometimes leaving the properties half open. Obsidian marks the heading as folded, which the check missed, so it could click twice while the fold was still animating. It now recognises the folded heading, clicks only once per note, and waits for the reading view to finish drawing first.

## [0.0.12] - 2026-10-11

- Fix "Fold properties in reading view" leaving the properties looking folded while Obsidian thought they were open, so the first click seemed to do nothing. It now finds the Properties heading more reliably and clicks it the way you would, and never just makes the block look folded.
- The troubleshooting report now says what the last attempt to fold properties did.

## [0.0.11] - 2026-10-10

- Edit mode switch: "Hide properties in reading view" is now "Fold properties in reading view". Instead of hiding the properties, it collapses them each time a note switches into reading view, so they're one click away. If you had the old setting on, the new one is on too.

## [0.0.10] - 2026-10-10

- Edit mode switch: new "Hide properties in reading view" setting. When a note is in reading view its properties are hidden; they still show while editing.

## [0.0.9] - 2026-10-10

- The troubleshooting report now names the CSS rule that hides each hidden note header button, and the stylesheet it comes from (a plugin, the theme or a CSS snippet).

## [0.0.8] - 2026-10-10

- "Copy the note header buttons (for troubleshooting)" now works with any feature turned off, shows how each hidden button is hidden, and lists which code hid header buttons since Obsidian started.

## [0.0.7] - 2026-10-10

- Edit mode switch: new default, "Take over Obsidian's reading/editing button". The switch now uses Obsidian's own button instead of adding one, so it no longer takes the place of other header buttons, such as Commander's. Its icon shows the current mode, and a click cycles through the modes in your order. "Add a separate button" and "No button (commands only)" are still available. This replaces "Hide Obsidian's reading/editing button".
- New command "Copy the note header buttons (for troubleshooting)", which copies a list of the buttons in the current note's header.
- Commander's buttons are never mistaken for Obsidian's reading/editing button.

## [0.0.6] - 2026-10-10

- Fix "Hide Obsidian's reading/editing button" not hiding anything. It now finds the button the way the original Edit mode switch plugin did. With it on, the switch (or a Commander button for it) takes the place of Obsidian's button instead of adding one, so other header buttons are no longer pushed out.

## [0.0.5] - 2026-10-10

- A Commander button in the note header for "Switch to next editing mode" now shows the current editing mode's icon (or the next mode's, with "Show the next mode's icon" on), and changes when you switch.

## [0.0.4] - 2026-10-10

- Edit mode switch: new "Button in the note header" setting. Turn it off to drop the header button (which could crowd out other plugins' header buttons, such as Commander's) and use the commands instead.
- New commands: switch to live preview, switch to source mode and switch to reading view. All edit mode commands now have icons, for use as Commander buttons.

## [0.0.3] - 2026-10-10

- The settings page no longer jumps back to the top when you change a setting that shows or hides other settings.

## [0.0.2] - 2026-10-09

- Fix the plugin not starting (and its settings tab not showing) when the original Home tab plugin is still enabled. Both tried to register the `search-bar` code block, and Obsidian refused the second one.
- A feature that fails to start no longer stops the rest of the plugin; you get a notice saying which one failed.
- The settings warn when any of the six original plugins are still turned on.

## [0.0.1] - 2026-10-09

First version: the features of six plugins combined into one.

- Home tab (from Home tab): start page with fuzzy search, filters, Omnisearch and web search, bookmarks, recent files, and a customisable logo and title. Rewritten without Svelte.
- Tab behaviour (from Open Tab Settings and Mononote): open in new tab, prevent duplicate tabs, preview tabs, new tab placement, mod-click behaviour, and an optional check that closes duplicates opened by other plugins.
- Edit mode switch (from Edit mode switch): header button(s) for live preview, source mode and reading view.
- Pinned daily note (from Pinned Daily Notes): today's note in one pinned tab, with optional open on startup and switching to the new day at midnight.
- Pinned tab icons (from Pinned Tabs Customizer): compact pinned tabs with icons from rules, tags or frontmatter.
- Each feature can be turned off, also per device.
- Import settings from the original plugins.
