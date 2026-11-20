import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUT, cleanState, renamedPath, shortcutOf } from '../src/features/floatingNote/floatingState';

describe('floating note: what each computer remembers', () => {
	it('starts with Alt+P, full opacity and nothing pinned', () => {
		const state = cleanState(null, { allSpaces: false });
		expect(DEFAULT_SHORTCUT).toBe('Alt+P');
		expect(shortcutOf(state)).toBe('Alt+P');
		expect(state).toEqual({
			notePath: null, followActive: true, bounds: null, pinned: false, opacity: 1, shortcut: '', allSpaces: false, tray: false, helpShown: false,
		});
		expect(cleanState(undefined, { allSpaces: true }).allSpaces).toBe(true);
	});

	it('follows the note you\'re on unless turned off', () => {
		expect(cleanState({ followActive: false }, { allSpaces: false }).followActive).toBe(false);
		expect(cleanState({ notePath: 'A.md' }, { allSpaces: false }).followActive).toBe(true);
	});

	it('keeps a shortcut chosen on this computer', () => {
		expect(shortcutOf(cleanState({ shortcut: ' Ctrl+Alt+N ' }, { allSpaces: false }))).toBe('Ctrl+Alt+N');
	});

	it('repairs broken values', () => {
		const state = cleanState({
			notePath: '  ', opacity: 0.1, pinned: 'yes', tray: 1,
			bounds: { x: 'left', y: 5, width: 400, height: 300 },
		}, { allSpaces: false });
		expect(state.notePath).toBeNull();
		expect(state.opacity).toBe(0.3);
		expect(state.pinned).toBe(false);
		expect(state.tray).toBe(false);
		expect(state.bounds).toEqual({ width: 400, height: 300 });
		expect(cleanState({ bounds: { width: 0, height: 10 } }, { allSpaces: false }).bounds).toBeNull();
		expect(cleanState({ opacity: 4 }, { allSpaces: false }).opacity).toBe(1);
	});

	it('follows its note when the note or its folder is renamed', () => {
		expect(renamedPath('Work/List.md', 'Work/List.md', 'Work/To do.md')).toBe('Work/To do.md');
		expect(renamedPath('Work/List.md', 'Work', 'Jobs')).toBe('Jobs/List.md');
		expect(renamedPath('Work 2/List.md', 'Work', 'Jobs')).toBeNull();
		expect(renamedPath(null, 'a.md', 'b.md')).toBeNull();
	});
});
