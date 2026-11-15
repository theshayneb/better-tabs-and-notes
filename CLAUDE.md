# Better Tabs and Notes: notes for Claude Code

An Obsidian plugin that combines Home tab, Open Tab Settings, Mononote, Edit
mode switch, Pinned Daily Notes, Pinned Tabs Customizer, Scroll to Top, Frontmatter Cleaner, Multi Properties, Tag Wrangler (rename and merge only), Frontmatter Markdown Links and Nested Properties (both in part). The owner is the
only user.

## Workflow

- Push finished, checked work straight to `main`. No pull requests, no asking first.
- Every change that ships gets a new patch version (0.0.x) and a GitHub release:
  1. Bump the version in `manifest.json`, `package.json` and `package-lock.json` (the top-level `version` and `packages[""].version`), and add it to the top of `versions.json` mapped to `manifest.json`'s `minAppVersion`.
  2. Add a `## [x.y.z] - YYYY-MM-DD` entry at the top of `CHANGELOG.md`. The release workflow uses it as the release notes and fails without it.
  3. Commit and push to `main`, then publish the release with `.github/workflows/release.yml`, which builds the plugin and attaches `main.js`, `manifest.json` and `styles.css`. Either push the tag `x.y.z` (no `v` prefix) pointing at that commit, or, where tag pushes are blocked (cloud sessions), run the "Release Plugin" workflow on `main` with the input `version: x.y.z`; it creates the tag itself.
  4. Tell the owner the version number. Don't give them git commands; they use the GitHub web interface.
- Never reuse a version number that was already tagged or released.

## Checks before pushing

```
npm run lint        # eslint + tsc
npm run lint:css
npm test
npm run build
```

`npm install` needs `legacy-peer-deps` (set in `.npmrc`) because
eslint-plugin-obsidianmd pins an older `obsidian` peer.

## Things to know

- Each feature is a `Feature` (a `Component`) in `src/features/<name>/`. `main.ts` adds it as a child while it's enabled, so anything registered with `this.register*` is cleaned up when it's turned off. Commands are registered once and hidden while their feature is off.
- Views and code block processors must be registered by the plugin itself (see `HomeTabFeature.registerPluginParts`).
- Settings live in `data.json`, one section per feature, merged over the defaults by `mergeSettings`. Add new settings to `settings.ts` with a default.
- UI text must be sentence case (eslint-plugin-obsidianmd). Plugin names are proper nouns; disable the rule on that line with a reason.
- `src/types.d.ts` lists the undocumented Obsidian internals in use. Check them first when an Obsidian update breaks something.
- The tab behaviour feature monkey-patches `Workspace.getLeaf`, `getUnpinnedLeaf`, `WorkspaceLeaf.openFile` and `Keymap.isModEvent`. Code that must open a file in one specific tab (e.g. the pinned daily note) wraps it in `withoutDedupe` from `src/shared/openFlags.ts`.
- Don't give subclasses of Obsidian classes members that may clash with undocumented internals; use a `pw` prefix (as in `leaf.pwBtn`).
- Keep logic that doesn't need Obsidian in plain modules (`rules.ts`, `searchIndex.ts`, `dailyNotePaths.ts`, `modes.ts`, `overrides.ts`, `bulkLogic.ts`, `tagLogic.ts`, `linkParse.ts`, `nestedValues.ts`, `hideLogic.ts`, `linkIconRules.ts`, `templateLogic.ts`) and test it in `tests/`.
- Links in properties and nested properties patch the Properties panel's widgets (`app.metadataTypeManager`, declared in `src/types.d.ts`) and add entries to `metadataCache` `frontmatterLinks`. If properties look wrong after an Obsidian update, check those first.
- Hide commands must never unregister, remove or disable a command: it only filters lists (the command palette plugin's `getCommands` and its modal's `getSuggestions`, or `app.commands.listCommands` for "everywhere"). `tests/hideCommandsFeature.test.ts` checks this with a stand-in for Obsidian.
- Link icons registers a markdown post processor and a CodeMirror editor extension once, from `main.ts` (`registerPluginParts`); both do nothing while the feature is off. `@codemirror/*` are dev dependencies for types only, pinned to the versions `obsidian` expects; esbuild keeps them external.
- Property templates adds its buttons after the Properties panel's `.metadata-add-button` and a dropdown button at the start of each `.metadata-property[data-property-key]` row's `.metadata-property-value` that has values to pick from. It works on the panel's DOM, not Obsidian's property widgets, and re-adds them on `metadataCache` `changed`, workspace events and a `MutationObserver` on the workspace (which ignores its own elements, so it can't loop). Picking a value writes it with `processFrontMatter`. Properties a rule hides get the `btn-pt-hidden` class on their row (only a class, so the observer, which watches child lists, isn't triggered). Its rules reuse pinned tab icons' `ruleMatches` and `fileInfo`.
- A feature's `onSettingsChange` runs on every keystroke in its settings. Don't redraw open notes there while `plugin.settingsOpen` is true (it takes the cursor out of the settings field); set a flag and redraw in `onSettingsClosed`, as property templates, link icons and nested properties do.
- The plugin is GPL-3.0 because one original plugin is; keep `NOTICE.md` up to date when porting more code from elsewhere.
