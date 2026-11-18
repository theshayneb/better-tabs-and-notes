import { describe, expect, it, vi } from 'vitest';

// Just enough of Obsidian for the pinned daily note feature.
vi.mock('obsidian', () => {
	class El {
		isConnected = true;
		texts: string[] = [];
		children: El[] = [];
		listeners: Record<string, ((evt: { stopPropagation(): void }) => void)[]> = {};
		empty(): void { this.texts = []; this.children = []; }
		toggleClass(): void {}
		remove(): void { this.isConnected = false; }
		createSpan(o?: { text?: string }): El { return this.createEl('span', o); }
		createEl(_tag: string, o?: { text?: string }): El {
			const el = new El();
			if (o?.text) this.texts.push(o.text);
			this.children.push(el);
			return el;
		}
		addEventListener(type: string, fn: (evt: { stopPropagation(): void }) => void): void {
			(this.listeners[type] ??= []).push(fn);
		}
	}
	class Notice {
		static shown: Notice[] = [];
		messageEl = new El();
		constructor() { Notice.shown.push(this); }
		hide(): void { this.messageEl.isConnected = false; }
	}
	class Component {
		register(): void {}
		registerEvent(): void {}
		registerDomEvent(): void {}
		registerInterval(): void {}
	}
	return {
		Component, Notice, TFile: class {},
		Platform: { isDesktopApp: false },
		normalizePath: (p: string) => p,
		setIcon: () => {},
		moment: () => ({ format: () => '2026-11-18' }),
	};
});

const { Notice } = await import('obsidian') as unknown as { Notice: { shown: { messageEl: { texts: string[]; isConnected: boolean; children: { listeners: Record<string, ((evt: { stopPropagation(): void }) => void)[]> }[] } }[] } };
const { PinnedDailyNoteFeature } = await import('../src/features/dailyNote/pinnedDailyNote');
const { DEFAULT_SETTINGS } = await import('../src/settings');

const TODAY = 'Daily/2026-11-18.md';

function setup(options: { background?: boolean; settled?: boolean; arrivesWhileWaiting?: boolean } = {}) {
	Notice.shown.length = 0;
	const files = new Map<string, { path: string }>();
	const created: string[] = [];
	const opened: string[] = [];
	const waits: boolean[] = [];
	const local = new Map<string, unknown>();
	if (options.background !== undefined) local.set('better-tabs-and-notes:background-tasks', options.background);
	const leaf = {
		pinned: false,
		setPinned(v: boolean) { this.pinned = v; },
		getViewState: () => ({ state: {} }),
		openFile: async (file: { path: string }) => { opened.push(file.path); },
	};
	const app = {
		loadLocalStorage: (k: string) => local.get(k) ?? null,
		internalPlugins: {
			getPluginById: (id: string) => id === 'daily-notes'
				? { enabled: true, instance: { options: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' } } } : null,
		},
		vault: {
			getFileByPath: (p: string) => files.get(p) ?? null,
			getAbstractFileByPath: (p: string) => files.get(p) ?? (p === 'Daily' ? {} : null),
			createFolder: async () => {},
			create: async (p: string) => {
				const file = { path: p };
				files.set(p, file);
				created.push(p);
				return file;
			},
		},
		workspace: {
			iterateAllLeaves: () => {},
			getLeaf: () => leaf,
			revealLeaf: async () => {},
			setActiveLeaf: () => {},
		},
		metadataCache: { getFirstLinkpathDest: () => null },
	};
	const plugin = {
		app,
		settings: structuredClone(DEFAULT_SETTINGS),
		syncWatcher: {
			// Like the real one: a full wait is never over at the moment it starts.
			settledNow: (_since: number, fullWait: boolean) => !fullWait && (options.settled ?? false),
			waitUntilSettled: async (stop: () => boolean, fullWait: boolean) => {
				waits.push(fullWait);
				if (options.arrivesWhileWaiting) files.set(TODAY, { path: TODAY });
				stop();
			},
		},
	};
	const feature = new PinnedDailyNoteFeature(plugin as never);
	const promptText = () => Notice.shown.filter(n => n.messageEl.isConnected).flatMap(n => n.messageEl.texts).join(' | ');
	return { feature, files, created, opened, waits, promptText };
}

describe('pinned daily note and Sync', () => {
	it('opens today\'s note straight away when it\'s there, without waiting or writing', async () => {
		const t = setup();
		t.files.set(TODAY, { path: TODAY });
		await t.feature.openToday(false);
		expect(t.opened).toEqual([TODAY]);
		expect(t.waits).toEqual([]);
		expect(t.created).toEqual([]);
	});

	it('on a phone, automatically: waits for Sync, then asks instead of creating', async () => {
		const t = setup({ background: false });
		await t.feature.openToday(false);
		expect(t.waits).toEqual([true]);
		expect(t.created).toEqual([]);
		expect(t.opened).toEqual([]);
		expect(t.promptText()).toContain('isn\'t here yet');
	});

	it('on a phone, opens the note when it arrives from another device while waiting', async () => {
		const t = setup({ background: false, arrivesWhileWaiting: true });
		await t.feature.openToday(false);
		expect(t.created).toEqual([]);
		expect(t.opened).toEqual([TODAY]);
	});

	it('the "Create today\'s note" button creates it', async () => {
		const t = setup({ background: false, settled: true });
		await t.feature.openToday(false);
		expect(t.created).toEqual([]);
		const button = Notice.shown[0].messageEl.children.at(-1)!;
		button.listeners.click[0]({ stopPropagation: () => {} });
		await new Promise(r => setTimeout(r, 0));
		await t.feature.openToday(false);
		expect(t.created).toEqual([TODAY]);
		expect(t.promptText()).toBe('');
	});

	it('on the background device: waits the full quiet time, then creates it', async () => {
		const t = setup({ background: true, settled: true });
		await t.feature.openToday(false);
		expect(t.waits).toEqual([true]);
		expect(t.created).toEqual([TODAY]);
	});

	it('by hand when Sync has already settled: creates it without waiting', async () => {
		const t = setup({ background: false, settled: true });
		await t.feature.openToday(true, true);
		expect(t.waits).toEqual([]);
		expect(t.created).toEqual([TODAY]);
	});

	it('by hand on a phone: waits only while Sync is catching up, then creates it', async () => {
		const t = setup({ background: false });
		await t.feature.openToday(true, true);
		expect(t.waits).toEqual([false]);
		expect(t.created).toEqual([TODAY]);
		expect(t.opened).toEqual([TODAY]);
	});
});
