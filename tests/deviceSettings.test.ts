import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyDeviceTabSettings, sanitizeDeviceTabSettings, shouldFocusNewTab } from '../src/shared/deviceSettings';

describe('per-device tab settings', () => {
	it('keeps only valid stored values', () => {
		expect(sanitizeDeviceTabSettings(null)).toEqual({});
		expect(sanitizeDeviceTabSettings({ newTabPlacement: 'end', newTabTabGroupPlacement: 'nowhere', focusNewTabs: 'never', other: 1 }))
			.toEqual({ newTabPlacement: 'end', focusNewTabs: 'never' });
	});

	it('overrides only what the device sets', () => {
		const shared = { ...DEFAULT_SETTINGS.tabs, newTabPlacement: 'afterActive' as const, newTabTabGroupPlacement: 'same' as const };
		expect(applyDeviceTabSettings(shared, {})).toEqual(shared);
		const applied = applyDeviceTabSettings(shared, { newTabPlacement: 'end' });
		expect(applied.newTabPlacement).toBe('end');
		expect(applied.newTabTabGroupPlacement).toBe('same');
	});

	it('decides whether new tabs come to the front', () => {
		// Same as other devices: normal clicks focus, ctrl/middle click follows Obsidian.
		expect(shouldFocusNewTab({}, true, false)).toBe(true);
		expect(shouldFocusNewTab({}, false, false)).toBe(false);
		expect(shouldFocusNewTab({}, false, true)).toBe(true);
		expect(shouldFocusNewTab({ focusNewTabs: 'always' }, false, false)).toBe(true);
		expect(shouldFocusNewTab({ focusNewTabs: 'never' }, true, true)).toBe(false);
		expect(shouldFocusNewTab({ focusNewTabs: 'normal' }, true, false)).toBe(true);
		expect(shouldFocusNewTab({ focusNewTabs: 'normal' }, false, true)).toBe(false);
	});
});
