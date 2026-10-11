// All settings live in the plugin's data.json. Each feature owns one section.

export const FEATURE_IDS = ['homeTab', 'tabs', 'editMode', 'dailyNote', 'pinnedIcons', 'scrollButtons', 'frontmatterCleaner'] as const;
export type FeatureId = typeof FEATURE_IDS[number];

// ---------------------------------------------------------------------------
// Tab behaviour (Open Tab Settings + Mononote)
// ---------------------------------------------------------------------------

export const NEW_TAB_PLACEMENTS = {
	afterActive: 'After active tab',
	afterPinned: 'After pinned tabs',
	beginning: 'At beginning',
	end: 'At end',
} as const;

export const NEW_TAB_GROUP_PLACEMENTS = {
	same: 'In same tab group',
	opposite: 'In opposite tab group',
	first: 'In first tab group',
	last: 'In last tab group',
} as const;

export const MOD_CLICK_BEHAVIORS = {
	tab: 'In new tab',
	same: 'In same tab',
	allowDuplicate: 'In duplicate tab',
	opposite: 'In opposite tab group',
	noPreview: 'As a persistent (non-preview) tab',
	placeAfterActive: 'After active tab',
	placeAtBeginning: 'At beginning',
	placeAtEnd: 'At end',
} as const;

export interface TabSettings {
	openInNewTab: boolean;
	previewTabs: boolean;
	deduplicateTabs: boolean;
	deduplicateAcrossTabGroups: boolean;
	newTabPlacement: keyof typeof NEW_TAB_PLACEMENTS;
	newTabTabGroupPlacement: keyof typeof NEW_TAB_GROUP_PLACEMENTS;
	modClickBehavior: keyof typeof MOD_CLICK_BEHAVIORS;
	/** Mononote-style safety net: close duplicates that slipped past the open hook. */
	closeLateDuplicates: boolean;
	lateDuplicateDelayMs: number;
}

// ---------------------------------------------------------------------------
// Home tab
// ---------------------------------------------------------------------------

export type ColorChoice = 'default' | 'accent' | 'custom';
export type LogoType = 'obsidian' | 'icon' | 'imagePath' | 'imageLink' | 'none';
export type FontChoice = 'interface' | 'text' | 'monospace' | 'custom';

export interface HomeTabSettings {
	replaceNewTabs: boolean;
	openOnStart: boolean;
	closePreviousSessionTabs: boolean;

	useOmnisearch: boolean;
	showOmnisearchExcerpt: boolean;
	markdownOnly: boolean;
	showUnresolved: boolean;
	showPath: boolean;
	maxResults: number;
	showShortcuts: boolean;
	webSearchUrl: string;

	showBookmarks: boolean;
	showRecentFiles: boolean;
	maxRecentFiles: number;
	storeRecentFiles: boolean;
	recentFiles: string[];

	logoType: LogoType;
	logoIcon: string;
	logoImagePath: string;
	logoImageLink: string;
	logoScale: number;
	logoColorType: ColorChoice;
	logoColor: string;
	title: string;
	font: FontChoice;
	customFont: string;
	fontSize: string;
	fontWeight: number;
	fontColorType: ColorChoice;
	fontColor: string;
	accentSelection: boolean;
}

// ---------------------------------------------------------------------------
// Edit mode switch
// ---------------------------------------------------------------------------

export type EditMode = 'live' | 'source' | 'preview';

/**
 * replace: take over Obsidian's own reading/editing button (adds nothing to the header).
 * extra: add our own button(s). none: commands only, e.g. for a Commander button.
 */
export type EditButtonPlace = 'replace' | 'extra' | 'none';

export interface EditModeSettings {
	buttonPlace: EditButtonPlace;
	includeReadingMode: boolean;
	order: EditMode[];
	/** Show the icon of the mode a click switches to instead of the current one. */
	showNextModeIcon: boolean;
	/** One button per mode instead of a single cycling button. */
	oneButtonPerMode: boolean;
	/** Fold the properties block when a note switches into reading view. */
	collapsePropertiesInReading: boolean;
}

// ---------------------------------------------------------------------------
// Pinned daily note
// ---------------------------------------------------------------------------

export type PinLocation = 'editor' | 'left' | 'right';
export type DailyNoteSource = 'daily-notes' | 'periodic-notes';

export interface DailyNoteSettings {
	pinLocation: PinLocation;
	source: DailyNoteSource;
	showRibbonIcon: boolean;
	openOnStart: boolean;
	/** Switch the pinned tab to the new day's note after midnight. */
	rollOver: boolean;
}

// ---------------------------------------------------------------------------
// Pinned tab icons (Pinned Tabs Customizer)
// ---------------------------------------------------------------------------

export type RuleType = 'exact' | 'folder' | 'starts-with' | 'ends-with' | 'contains' | 'regex' | 'tag';

export interface IconRule {
	type: RuleType;
	match: string;
	icon: string;
}

export interface PinnedIconSettings {
	shrinkPinnedTabs: boolean;
	pinnedTabWidth: number;
	showDefaultIcon: boolean;
	/** Empty means the native pin icon. */
	defaultIcon: string;
	readFrontmatter: boolean;
	frontmatterProperty: string;
	rules: IconRule[];
	recentIcons: string[];
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scroll buttons (Scroll to Top)
// ---------------------------------------------------------------------------

export interface ScrollButtonSettings {
	showTop: boolean;
	showBottom: boolean;
	/** Only shown while editing. */
	showCursor: boolean;
	iconTop: string;
	iconBottom: string;
	iconCursor: string;
	showTooltips: boolean;
	/** Button size relative to the default. */
	size: number;
	/** Also show the buttons on web pages opened with the Surfing plugin. */
	includeWebPages: boolean;
}

// ---------------------------------------------------------------------------
// Frontmatter cleaner
// ---------------------------------------------------------------------------

export interface FrontmatterCleanerSettings {
	showRibbonIcon: boolean;
	/** Pre-check "Keep a record" when the cleaner opens. */
	keepRecordByDefault: boolean;
	recordFormat: 'table' | 'colon' | 'dataview';
	recordLocation: 'top' | 'bottom' | 'heading';
	headingText: string;
	headingLevel: number;
}

// ---------------------------------------------------------------------------

export interface PluginSettings {
	features: Record<FeatureId, boolean>;
	tabs: TabSettings;
	homeTab: HomeTabSettings;
	editMode: EditModeSettings;
	dailyNote: DailyNoteSettings;
	pinnedIcons: PinnedIconSettings;
	scrollButtons: ScrollButtonSettings;
	frontmatterCleaner: FrontmatterCleanerSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	features: {
		homeTab: true,
		tabs: true,
		editMode: true,
		dailyNote: true,
		pinnedIcons: true,
		scrollButtons: true,
		frontmatterCleaner: true,
	},
	tabs: {
		openInNewTab: true,
		previewTabs: false,
		deduplicateTabs: true,
		deduplicateAcrossTabGroups: true,
		newTabPlacement: 'afterActive',
		newTabTabGroupPlacement: 'same',
		modClickBehavior: 'tab',
		closeLateDuplicates: false,
		lateDuplicateDelayMs: 100,
	},
	homeTab: {
		replaceNewTabs: true,
		openOnStart: false,
		closePreviousSessionTabs: false,
		useOmnisearch: false,
		showOmnisearchExcerpt: true,
		markdownOnly: false,
		showUnresolved: false,
		showPath: true,
		maxResults: 5,
		showShortcuts: true,
		webSearchUrl: 'https://duckduckgo.com/?q=%s',
		showBookmarks: true,
		showRecentFiles: false,
		maxRecentFiles: 5,
		storeRecentFiles: true,
		recentFiles: [],
		logoType: 'obsidian',
		logoIcon: 'home',
		logoImagePath: '',
		logoImageLink: '',
		logoScale: 1.2,
		logoColorType: 'default',
		logoColor: '#7f6df2',
		title: 'Obsidian',
		font: 'interface',
		customFont: '',
		fontSize: '4em',
		fontWeight: 600,
		fontColorType: 'default',
		fontColor: '#7f6df2',
		accentSelection: false,
	},
	editMode: {
		buttonPlace: 'replace',
		includeReadingMode: false,
		order: ['live', 'source', 'preview'],
		showNextModeIcon: false,
		oneButtonPerMode: false,
		collapsePropertiesInReading: false,
	},
	dailyNote: {
		pinLocation: 'editor',
		source: 'daily-notes',
		showRibbonIcon: true,
		openOnStart: false,
		rollOver: false,
	},
	pinnedIcons: {
		shrinkPinnedTabs: false,
		pinnedTabWidth: 40,
		showDefaultIcon: true,
		defaultIcon: '',
		readFrontmatter: false,
		frontmatterProperty: 'pinned-icon',
		rules: [],
		recentIcons: [],
	},
	scrollButtons: {
		showTop: true,
		showBottom: true,
		showCursor: true,
		iconTop: 'arrow-up',
		iconBottom: 'arrow-down',
		iconCursor: 'text-cursor-input',
		showTooltips: true,
		size: 1,
		includeWebPages: false,
	},
	frontmatterCleaner: {
		showRibbonIcon: true,
		keepRecordByDefault: false,
		recordFormat: 'table',
		recordLocation: 'bottom',
		headingText: 'Removed Properties',
		headingLevel: 2,
	},
};

type Section = Exclude<keyof PluginSettings, 'features'>;
const SECTIONS: Section[] = ['tabs', 'homeTab', 'editMode', 'dailyNote', 'pinnedIcons', 'scrollButtons', 'frontmatterCleaner'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge stored data over the defaults one section deep, ignoring unknown keys. */
export function mergeSettings(stored: unknown): PluginSettings {
	const data = isRecord(stored) ? stored : {};
	const result = structuredClone(DEFAULT_SETTINGS);
	if (isRecord(data.features)) {
		for (const id of FEATURE_IDS) {
			if (typeof data.features[id] === 'boolean') result.features[id] = data.features[id];
		}
	}
	for (const section of SECTIONS) {
		const value = data[section];
		if (!isRecord(value)) continue;
		const target = result[section] as unknown as Record<string, unknown>;
		for (const key of Object.keys(target)) {
			if (key in value && typeof value[key] === typeof target[key]) {
				target[key] = structuredClone(value[key]);
			}
		}
	}
	const storedEdit = data.editMode;
	// 0.0.10 hid properties in reading view; 0.0.11 folds them instead.
	if (isRecord(storedEdit) && storedEdit.hidePropertiesInReading === true && !('collapsePropertiesInReading' in storedEdit)) {
		result.editMode.collapsePropertiesInReading = true;
	}
	// 0.0.4-0.0.6 had an on/off header button instead of buttonPlace.
	if (isRecord(storedEdit) && !('buttonPlace' in storedEdit) && storedEdit.showHeaderButton === false) {
		result.editMode.buttonPlace = 'none';
	}
	return result;
}

/** Keep tab settings internally consistent; returns the corrected copy. */
export function normalizeTabSettings(settings: TabSettings): TabSettings {
	const s = { ...settings };
	if (s.previewTabs && !s.openInNewTab) s.previewTabs = false;
	if (
		(s.modClickBehavior === 'same' && !s.openInNewTab) ||
		(s.modClickBehavior === 'noPreview' && !s.previewTabs) ||
		(s.modClickBehavior === 'allowDuplicate' && !s.deduplicateTabs) ||
		(s.modClickBehavior === 'placeAfterActive' && s.newTabPlacement === 'afterActive') ||
		(s.modClickBehavior === 'placeAtBeginning' && s.newTabPlacement === 'beginning') ||
		(s.modClickBehavior === 'placeAtEnd' && s.newTabPlacement === 'end')
	) {
		s.modClickBehavior = 'tab';
	}
	return s;
}
