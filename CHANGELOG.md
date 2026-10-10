# Changelog

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
