// One-off import of settings from the six original plugins' data.json files.

import { normalizePath, type App } from 'obsidian';
import type { EditMode, IconRule, PluginSettings, RuleType } from './settings';

const LEGACY_IDS = {
	homeTab: 'home-tab',
	openTabSettings: 'open-tab-settings',
	mononote: 'mononote',
	editMode: 'shortcut-edit-mode',
	dailyNote: 'pinned-daily-notes',
	pinnedTabs: 'pinned-tabs-customizer',
	scrollToTop: 'obsidian-scroll-to-top-plugin',
} as const;

/** Plugin id and display name of each original plugin. */
export const LEGACY_PLUGINS: [string, string][] = [
	[LEGACY_IDS.homeTab, 'Home tab'],
	[LEGACY_IDS.openTabSettings, 'Open Tab Settings'],
	[LEGACY_IDS.mononote, 'Mononote'],
	[LEGACY_IDS.editMode, 'Edit mode switch'],
	[LEGACY_IDS.dailyNote, 'Pinned Daily Notes'],
	[LEGACY_IDS.pinnedTabs, 'Pinned Tabs Customizer'],
	[LEGACY_IDS.scrollToTop, 'Scroll to Top'],
];

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined;
const bool = (v: unknown): boolean | undefined => typeof v === 'boolean' ? v : undefined;
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const camelCase = (s: string) => s.replace(/[-_]\w/g, x => x[1].toUpperCase());

function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): boolean {
	if (value === undefined) return false;
	target[key] = value;
	return true;
}

async function readData(app: App, id: string): Promise<Json | null> {
	const path = normalizePath(`${app.vault.configDir}/plugins/${id}/data.json`);
	try {
		if (!(await app.vault.adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Copy settings from the original plugins into `settings`. Returns the names of
 * the plugins that had settings to import.
 */
export async function importLegacySettings(app: App, settings: PluginSettings): Promise<string[]> {
	const imported: string[] = [];

	const home = await readData(app, LEGACY_IDS.homeTab);
	if (home) {
		const h = settings.homeTab;
		assign(h, 'replaceNewTabs', bool(home.replaceNewTabs));
		assign(h, 'openOnStart', bool(home.newTabOnStart));
		assign(h, 'closePreviousSessionTabs', bool(home.closePreviousSessionTabs));
		assign(h, 'useOmnisearch', bool(home.omnisearch));
		assign(h, 'showOmnisearchExcerpt', bool(home.showOmnisearchExcerpt));
		assign(h, 'markdownOnly', bool(home.markdownOnly));
		assign(h, 'showUnresolved', bool(home.unresolvedLinks));
		assign(h, 'showPath', bool(home.showPath));
		assign(h, 'maxResults', num(home.maxResults));
		assign(h, 'showShortcuts', bool(home.showShortcuts));
		assign(h, 'showBookmarks', bool(home.showbookmarkedFiles));
		assign(h, 'showRecentFiles', bool(home.showRecentFiles));
		assign(h, 'maxRecentFiles', num(home.maxRecentFiles));
		assign(h, 'storeRecentFiles', bool(home.storeRecentFile));
		assign(h, 'title', str(home.wordmark));
		assign(h, 'fontSize', str(home.fontSize));
		assign(h, 'fontWeight', num(home.fontWeight));
		assign(h, 'logoScale', num(home.logoScale));
		if (Array.isArray(home.recentFilesStore)) {
			h.recentFiles = home.recentFilesStore
				.map(r => isRecord(r) ? str(r.filepath) ?? str(r.path) : undefined)
				.filter((p): p is string => !!p);
		}
		const logo = isRecord(home.logo) ? home.logo : {};
		const logoType = str(home.logoType);
		if (logoType === 'default' || logoType === 'oldLogo') h.logoType = 'obsidian';
		else if (logoType === 'none') h.logoType = 'none';
		else if (logoType === 'lucideIcon' && str(logo.lucideIcon)) { h.logoType = 'icon'; h.logoIcon = str(logo.lucideIcon) ?? h.logoIcon; }
		else if (logoType === 'imagePath' && str(logo.imagePath)) { h.logoType = 'imagePath'; h.logoImagePath = str(logo.imagePath) ?? ''; }
		else if (logoType === 'imageLink' && str(logo.imageLink)) { h.logoType = 'imageLink'; h.logoImageLink = str(logo.imageLink) ?? ''; }
		const colorMap = { default: 'default', accentColor: 'accent', custom: 'custom' } as const;
		const fontColorType = str(home.fontColorType) as keyof typeof colorMap | undefined;
		if (fontColorType && fontColorType in colorMap) h.fontColorType = colorMap[fontColorType];
		assign(h, 'fontColor', str(home.fontColor));
		const iconColorType = str(home.iconColorType) as keyof typeof colorMap | undefined;
		if (iconColorType && iconColorType in colorMap) h.logoColorType = colorMap[iconColorType];
		assign(h, 'logoColor', str(home.iconColor));
		const fontMap = { interfaceFont: 'interface', textFont: 'text', monospaceFont: 'monospace', custom: 'custom' } as const;
		const font = str(home.customFont) as keyof typeof fontMap | undefined;
		if (font && font in fontMap) h.font = fontMap[font];
		assign(h, 'customFont', str(home.font));
		h.accentSelection = str(home.selectionHighlight) === 'accentColor';
		imported.push('Home tab');
	}

	const ots = await readData(app, LEGACY_IDS.openTabSettings);
	if (ots) {
		const t = settings.tabs;
		assign(t, 'openInNewTab', bool(ots.openInNewTab));
		assign(t, 'previewTabs', bool(ots.previewTabs));
		assign(t, 'deduplicateTabs', bool(ots.deduplicateTabs));
		assign(t, 'deduplicateAcrossTabGroups', bool(ots.deduplicateAcrossTabGroups));
		const placement = str(ots.newTabPlacement);
		if (placement) assign(t, 'newTabPlacement', camelCase(placement) as typeof t.newTabPlacement);
		assign(t, 'newTabTabGroupPlacement', str(ots.newTabTabGroupPlacement) as typeof t.newTabTabGroupPlacement | undefined);
		const modClick = str(ots.modClickBehavior);
		if (modClick) assign(t, 'modClickBehavior', camelCase(modClick) as typeof t.modClickBehavior);
		imported.push('Open Tab Settings');
	}

	const mono = await readData(app, LEGACY_IDS.mononote);
	if (mono) {
		settings.tabs.closeLateDuplicates = true;
		assign(settings.tabs, 'lateDuplicateDelayMs', num(mono.delayInMs));
		imported.push('Mononote');
	}

	const edit = await readData(app, LEGACY_IDS.editMode);
	if (edit) {
		const e = settings.editMode;
		assign(e, 'includeReadingMode', bool(edit.includeReadingMode));
		assign(e, 'showNextModeIcon', bool(edit.reverseButtonGraphics));
		assign(e, 'oneButtonPerMode', bool(edit.allButtonMode));
		// "All button" mode needs buttons of its own; otherwise take over Obsidian's button.
		e.buttonPlace = edit.allButtonMode === true ? 'extra' : 'replace';
		if (Array.isArray(edit.order)) e.order = edit.order.filter((m): m is EditMode => m === 'live' || m === 'source' || m === 'preview');
		imported.push('Edit mode switch');
	}

	const daily = await readData(app, LEGACY_IDS.dailyNote);
	if (daily) {
		const d = settings.dailyNote;
		const where = str(daily.whereToPin);
		if (where === 'leftSideBar') d.pinLocation = 'left';
		else if (where === 'rightSideBar') d.pinLocation = 'right';
		else if (where === 'editor') d.pinLocation = 'editor';
		const source = str(daily.plugin);
		if (source === 'daily-notes' || source === 'periodic-notes') d.source = source;
		imported.push('Pinned Daily Notes');
	}

	const pinned = await readData(app, LEGACY_IDS.pinnedTabs);
	if (pinned) {
		const p = settings.pinnedIcons;
		assign(p, 'shrinkPinnedTabs', bool(pinned.shrinkPinnedTabs));
		assign(p, 'pinnedTabWidth', num(pinned.pinnedTabWidth));
		assign(p, 'showDefaultIcon', bool(pinned.showDefaultIcon));
		assign(p, 'defaultIcon', str(pinned.defaultIcon));
		assign(p, 'readFrontmatter', bool(pinned.enableFrontmatter));
		assign(p, 'frontmatterProperty', str(pinned.frontmatterProperty));
		const types: RuleType[] = ['exact', 'folder', 'starts-with', 'ends-with', 'contains', 'regex', 'tag'];
		if (Array.isArray(pinned.iconMappings)) {
			p.rules = pinned.iconMappings
				.filter(isRecord)
				.map(m => ({ type: str(m.type) as RuleType, match: str(m.match) ?? '', icon: str(m.icon) ?? '' }))
				.filter((r): r is IconRule => types.includes(r.type) && !!r.match && !!r.icon);
		}
		if (Array.isArray(pinned.recentIcons)) p.recentIcons = pinned.recentIcons.filter((i): i is string => typeof i === 'string');
		imported.push('Pinned Tabs Customizer');
	}

	const scroll = await readData(app, LEGACY_IDS.scrollToTop);
	if (scroll) {
		const b = settings.scrollButtons;
		assign(b, 'showTop', bool(scroll.enabledScrollToTop));
		assign(b, 'showBottom', bool(scroll.enabledScrollToBottom));
		assign(b, 'showCursor', bool(scroll.enabledScrollToCursor));
		assign(b, 'iconTop', str(scroll.iconScrollToTop));
		assign(b, 'iconBottom', str(scroll.iconScrollToBottom));
		assign(b, 'iconCursor', str(scroll.iconScrollToCursor));
		assign(b, 'showTooltips', bool(scroll.showTooltip));
		assign(b, 'size', num(scroll.resizeButton));
		assign(b, 'includeWebPages', bool(scroll.enableSurfingPlugin));
		imported.push('Scroll to Top');
	}

	return imported;
}
