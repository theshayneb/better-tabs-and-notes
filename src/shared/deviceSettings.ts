// Tab settings that apply to one device only. They're kept in Obsidian's
// per-device local storage, not in data.json, so they never sync.

import { NEW_TAB_GROUP_PLACEMENTS, NEW_TAB_PLACEMENTS, type TabSettings } from '../settings';

export const FOCUS_NEW_TABS = {
	always: 'Always switch to new tabs',
	normal: 'Only for normal clicks (ctrl/middle click opens in the background)',
	never: 'Never (open new tabs in the background)',
} as const;

export type FocusNewTabs = keyof typeof FOCUS_NEW_TABS;

export interface DeviceTabSettings {
	newTabPlacement?: TabSettings['newTabPlacement'];
	newTabTabGroupPlacement?: TabSettings['newTabTabGroupPlacement'];
	focusNewTabs?: FocusNewTabs;
}

/** Keep only known keys with valid values, so bad stored data can't break anything. */
export function sanitizeDeviceTabSettings(raw: unknown): DeviceTabSettings {
	const result: DeviceTabSettings = {};
	if (typeof raw !== 'object' || raw === null) return result;
	const data = raw as Record<string, unknown>;
	if (typeof data.newTabPlacement === 'string' && data.newTabPlacement in NEW_TAB_PLACEMENTS) {
		result.newTabPlacement = data.newTabPlacement as DeviceTabSettings['newTabPlacement'];
	}
	if (typeof data.newTabTabGroupPlacement === 'string' && data.newTabTabGroupPlacement in NEW_TAB_GROUP_PLACEMENTS) {
		result.newTabTabGroupPlacement = data.newTabTabGroupPlacement as DeviceTabSettings['newTabTabGroupPlacement'];
	}
	if (typeof data.focusNewTabs === 'string' && data.focusNewTabs in FOCUS_NEW_TABS) {
		result.focusNewTabs = data.focusNewTabs as FocusNewTabs;
	}
	return result;
}

/** The shared tab settings with this device's placement choices on top. */
export function applyDeviceTabSettings(shared: TabSettings, device: DeviceTabSettings): TabSettings {
	return {
		...shared,
		newTabPlacement: device.newTabPlacement ?? shared.newTabPlacement,
		newTabTabGroupPlacement: device.newTabTabGroupPlacement ?? shared.newTabTabGroupPlacement,
	};
}

/**
 * Whether a newly opened tab should come to the front.
 * @param normalClick The tab was opened by a plain click (with "Always open in new tab"),
 *   rather than ctrl/middle click or "open in new tab".
 * @param obsidianFocusNewTab Obsidian's own "Always focus new tabs" setting.
 */
export function shouldFocusNewTab(device: DeviceTabSettings, normalClick: boolean, obsidianFocusNewTab: boolean): boolean {
	switch (device.focusNewTabs) {
		case 'always': return true;
		case 'never': return false;
		case 'normal': return normalClick;
		default: return normalClick || obsidianFocusNewTab;
	}
}

// ---------------------------------------------------------------------------
// What opens when Obsidian starts, on this device

export const START_PAGES = {
	nothing: 'Only the tabs from last time',
	home: 'Home tab',
	daily: 'Today\'s daily note (pinned tab)',
	note: 'A specific note',
} as const;

export type StartPage = keyof typeof START_PAGES;

export interface DeviceStartupSettings {
	/** Unset: follow the synced "open on start" settings of the home tab and pinned daily note. */
	page?: StartPage;
	/** Path of the note to open, for page "note". */
	notePath?: string;
	/** Close the other (unpinned) tabs after opening the start page. */
	closeOthers?: boolean;
}

export function sanitizeDeviceStartup(raw: unknown): DeviceStartupSettings {
	const result: DeviceStartupSettings = {};
	if (typeof raw !== 'object' || raw === null) return result;
	const data = raw as Record<string, unknown>;
	if (typeof data.page === 'string' && data.page in START_PAGES) result.page = data.page as StartPage;
	if (typeof data.notePath === 'string' && data.notePath) result.notePath = data.notePath;
	if (data.closeOthers === true) result.closeOthers = true;
	return result;
}
