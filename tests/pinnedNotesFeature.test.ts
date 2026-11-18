import { describe, expect, it, vi } from 'vitest';

// Just enough of Obsidian for the pinned notes feature.
vi.mock('obsidian', () => {
	class Component {
		_loaded = true;
		register(): void {}
		registerEvent(): void {}
		registerDomEvent(): void {}
		registerInterval(): void {}
	}
	class Notice {
		static messages: string[] = [];
		constructor(message: string) { Notice.messages.push(message); }
	}
	class TFile { constructor(public path: string) {} }
	class Base {}
	return {
		Component, Notice, TFile, Menu: Base, AbstractInputSuggest: Base, FuzzySuggestModal: Base,
		Keymap: { isModEvent: () => false },
		Platform: { isDesktopApp: false, isPhone: false },
		normalizePath: (p: string) => p,
		getIcon: () => null, setIcon: () => {}, getIconIds: () => [], prepareFuzzySearch: () => () => null,
	};
});

const { Notice } = await import('obsidian') as unknown as { Notice: { messages: string[] } };
const { PinnedNotesFeature } = await import('../src/features/pinnedNotes/pinnedNotes');
const { DEFAULT_SETTINGS } = await import('../src/settings');
type Item = { id: string; type: string; path?: string };

function setup(options: { background: boolean; files?: string[]; pnmData?: unknown; pnmOn?: boolean }) {
	Notice.messages.length = 0;
	const files = new Set(options.files ?? []);
	const local = new Map<string, unknown>([['better-tabs-and-notes:background-tasks', options.background]]);
	const events: string[] = [];
	let onSettled: (() => void) | null = null;
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.pinnedNotes.items = [
		{ id: 'a', type: 'note', title: '', path: 'Notes/A.md', icon: '' },
		{ id: 'b', type: 'note', title: '', path: 'Projects/B.md', icon: '' },
	];
	const app = {
		loadLocalStorage: (k: string) => local.get(k) ?? null,
		saveLocalStorage: (k: string, v: unknown) => { local.set(k, v); },
		vault: {
			configDir: '.obsidian',
			getAbstractFileByPath: (p: string) => files.has(p) ? { path: p } : null,
			adapter: {
				exists: async () => options.pnmData !== undefined,
				read: async () => JSON.stringify(options.pnmData),
			},
		},
		plugins: { enabledPlugins: new Set(options.pnmOn ? ['pinned-notes-menu'] : []) },
		workspace: { leftRibbon: {} },
	};
	const plugin = {
		app,
		manifest: { id: 'better-tabs-and-notes' },
		settings,
		addRibbonIcon: () => ({ addEventListener() {}, addClass() {}, removeAttribute() {}, remove() {} }),
		saveSettings: async () => { events.push('save'); },
		syncWatcher: {
			// Resolves when the test says Sync has settled.
			waitUntilSettled: () => {
				events.push('wait');
				return new Promise<void>(resolve => { onSettled = resolve; });
			},
		},
	};
	const feature = new PinnedNotesFeature(plugin as never);
	// As if turned on (the feature checks this after waiting).
	(feature as unknown as { pwLoaded: boolean }).pwLoaded = true;
	const settle = async () => {
		onSettled?.();
		await new Promise(r => setTimeout(r, 0));
	};
	const paths = () => (settings.pinnedNotes.items as Item[]).map(i => i.path ?? '---');
	return { feature, files, events, settle, paths, settings, local };
}

describe('pinned notes: following renames', () => {
	it('does nothing on a device that doesn\'t run background tasks', async () => {
		const t = setup({ background: false, files: ['Notes/A2.md'] });
		await t.feature.onRename('Notes/A.md', 'Notes/A2.md');
		expect(t.events).toEqual([]);
		expect(t.paths()).toEqual(['Notes/A.md', 'Projects/B.md']);
	});

	it('on the background device, updates the path only after Sync has settled', async () => {
		const t = setup({ background: true, files: ['Notes/A2.md'] });
		const done = t.feature.onRename('Notes/A.md', 'Notes/A2.md');
		await new Promise(r => setTimeout(r, 0));
		expect(t.events).toEqual(['wait']);
		expect(t.paths()).toEqual(['Notes/A.md', 'Projects/B.md']);
		await t.settle();
		await done;
		expect(t.paths()).toEqual(['Notes/A2.md', 'Projects/B.md']);
		expect(t.events).toEqual(['wait', 'save']);
	});

	it('follows a renamed folder, and several renames in one wait save once', async () => {
		const t = setup({ background: true, files: ['Work', 'Work/B.md', 'Notes/A2.md'] });
		const one = t.feature.onRename('Projects', 'Work');
		const two = t.feature.onRename('Notes/A.md', 'Notes/A2.md');
		await t.settle();
		await Promise.all([one, two]);
		expect(t.paths()).toEqual(['Notes/A2.md', 'Work/B.md']);
		expect(t.events).toEqual(['wait', 'save']);
	});

	it('writes nothing if another device updated the list while waiting', async () => {
		const t = setup({ background: true, files: ['Notes/A2.md'] });
		const done = t.feature.onRename('Notes/A.md', 'Notes/A2.md');
		// Sync brings in the list with the new path already.
		(t.settings.pinnedNotes.items[0] as Item).path = 'Notes/A2.md';
		await t.settle();
		await done;
		expect(t.events).toEqual(['wait']);
	});

	it('writes nothing if the note was renamed back while waiting', async () => {
		const t = setup({ background: true, files: ['Notes/A.md'] });
		const done = t.feature.onRename('Notes/A.md', 'Notes/A2.md');
		await t.settle();
		await done;
		expect(t.events).toEqual(['wait']);
		expect(t.paths()).toEqual(['Notes/A.md', 'Projects/B.md']);
	});

	it('ignores renames of files that aren\'t pinned', async () => {
		const t = setup({ background: true });
		await t.feature.onRename('Other.md', 'Else.md');
		expect(t.events).toEqual([]);
	});
});

describe('pinned notes: bringing over Pinned Notes Menu', () => {
	const pnmData = { items: [{ id: 'x', type: 'note', title: '', path: 'X.md', icon: '' }], showMenuButton: true };

	it('imports once, on the background device, after Sync has settled, and says to turn it off', async () => {
		const t = setup({ background: true, pnmData, pnmOn: true });
		const run = (t.feature as unknown as { autoImportPinnedNotesMenu(): Promise<void> }).autoImportPinnedNotesMenu.bind(t.feature);
		const done = run();
		await new Promise(r => setTimeout(r, 0));
		expect(t.events).toEqual(['wait']);
		await t.settle();
		await done;
		expect(t.paths()).toEqual(['Notes/A.md', 'Projects/B.md', 'X.md']);
		expect(t.settings.pinnedNotes.showMenuButton).toBe(true);
		expect(Notice.messages.join(' ')).toContain('Turn off Pinned Notes Menu');
		// Never again on this device.
		await run();
		expect(t.events).toEqual(['wait', 'save']);
	});

	it('doesn\'t import by itself on a phone or tablet', async () => {
		const t = setup({ background: false, pnmData });
		await (t.feature as unknown as { autoImportPinnedNotesMenu(): Promise<void> }).autoImportPinnedNotesMenu();
		expect(t.events).toEqual([]);
		expect(t.paths()).toEqual(['Notes/A.md', 'Projects/B.md']);
	});
});
