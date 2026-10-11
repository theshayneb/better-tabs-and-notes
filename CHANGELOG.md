# Changelog

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
