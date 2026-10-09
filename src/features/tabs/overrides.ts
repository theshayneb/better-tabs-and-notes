import type { PaneType } from 'obsidian';
import type { TabSettings } from '../../settings';

/**
 * Overrides are smuggled through the string passed to getLeaf so mod-click and
 * menu items can tweak the settings for a single open.
 */
export function buildOverride(mode: PaneType | false, override: Partial<TabSettings>): PaneType {
	return `${mode || ''}:${JSON.stringify(override)}` as PaneType;
}

export function parseOverride(value?: string | boolean): [PaneType | false, Partial<TabSettings>] {
	if (!value) return [false, {}];
	if (value === true) return ['tab', {}];
	const [mode, ...rest] = value.split(':');
	const json = rest.join(':') || '{}';
	try {
		return [(mode || false) as PaneType | false, JSON.parse(json) as Partial<TabSettings>];
	} catch {
		return [(mode || false) as PaneType | false, {}];
	}
}

export const OVERRIDES = {
	tab: 'tab',
	same: buildOverride(false, { openInNewTab: false }),
	allowDuplicate: buildOverride(false, { deduplicateTabs: false }),
	opposite: buildOverride('tab', { newTabTabGroupPlacement: 'opposite' }),
	noPreview: buildOverride('tab', { previewTabs: false }),
	placeAfterActive: buildOverride('tab', { newTabPlacement: 'afterActive' }),
	placeAtBeginning: buildOverride('tab', { newTabPlacement: 'beginning' }),
	placeAtEnd: buildOverride('tab', { newTabPlacement: 'end' }),
} as const;
