import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, normalizeTabSettings } from '../src/settings';

describe('mergeSettings', () => {
	it('returns defaults for empty or invalid data', () => {
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(mergeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps stored values of the right type and ignores the rest', () => {
		const merged = mergeSettings({
			features: { homeTab: false, unknown: true },
			tabs: { openInNewTab: false, newTabPlacement: 'end', bogus: 1, deduplicateTabs: 'yes' },
			pinnedIcons: { rules: [{ type: 'folder', match: 'Projects', icon: '📁' }] },
		});
		expect(merged.features.homeTab).toBe(false);
		expect(merged.features.tabs).toBe(true);
		expect(merged.tabs.openInNewTab).toBe(false);
		expect(merged.tabs.newTabPlacement).toBe('end');
		expect(merged.tabs.deduplicateTabs).toBe(true);
		expect('bogus' in merged.tabs).toBe(false);
		expect(merged.pinnedIcons.rules).toHaveLength(1);
	});

	it('migrates the old on/off edit mode header button', () => {
		expect(mergeSettings({ editMode: { showHeaderButton: false } }).editMode.buttonPlace).toBe('none');
		expect(mergeSettings({ editMode: { showHeaderButton: true } }).editMode.buttonPlace).toBe('replace');
		expect(mergeSettings({ editMode: { buttonPlace: 'extra', showHeaderButton: false } }).editMode.buttonPlace).toBe('extra');
	});

	it('turns the old hide-properties setting into folding', () => {
		expect(mergeSettings({ editMode: { hidePropertiesInReading: true } }).editMode.collapsePropertiesInReading).toBe(true);
		expect(mergeSettings({ editMode: {} }).editMode.collapsePropertiesInReading).toBe(false);
	});

	it('does not share objects with the defaults', () => {
		const merged = mergeSettings({});
		merged.pinnedIcons.rules.push({ type: 'exact', match: 'a', icon: 'b' });
		expect(DEFAULT_SETTINGS.pinnedIcons.rules).toHaveLength(0);
	});
});

describe('normalizeTabSettings', () => {
	it('turns preview tabs off without "always open in new tab"', () => {
		const s = normalizeTabSettings({ ...DEFAULT_SETTINGS.tabs, openInNewTab: false, previewTabs: true });
		expect(s.previewTabs).toBe(false);
	});

	it('resets mod-click options that no longer make sense', () => {
		const base = DEFAULT_SETTINGS.tabs;
		expect(normalizeTabSettings({ ...base, openInNewTab: false, modClickBehavior: 'same' }).modClickBehavior).toBe('tab');
		expect(normalizeTabSettings({ ...base, deduplicateTabs: false, modClickBehavior: 'allowDuplicate' }).modClickBehavior).toBe('tab');
		expect(normalizeTabSettings({ ...base, newTabPlacement: 'end', modClickBehavior: 'placeAtEnd' }).modClickBehavior).toBe('tab');
		expect(normalizeTabSettings({ ...base, modClickBehavior: 'opposite' }).modClickBehavior).toBe('opposite');
	});
});
