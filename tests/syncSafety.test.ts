import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ Component: class {} }));
import { DEFAULT_SETTINGS, mergeSettings, type PluginSettings } from '../src/settings';
import { applyLog, diffSettings, ensureIds, hasAllEdits, mergeLogs, type EditLog } from '../src/shared/editLog';
import { MAX_WAIT_MS, QUIET_MS, isSettled } from '../src/shared/syncSettle';
import { dailyStep } from '../src/features/dailyNote/dailyNotePaths';

type S = Record<string, unknown>;

/** A device: its settings and every edit it has seen (as the plugin keeps them). */
class Device {
	log: EditLog = {};
	settings: PluginSettings;
	private snapshot: PluginSettings;

	constructor(stored: unknown = structuredClone(DEFAULT_SETTINGS)) {
		this.settings = mergeSettings(stored);
		ensureIds(this.settings as unknown as S);
		this.snapshot = structuredClone(this.settings);
	}

	/** Change something by hand at `time`, as saveSettings records it. */
	edit(time: number, change: (s: PluginSettings) => void): void {
		change(this.settings);
		ensureIds(this.settings as unknown as S);
		this.log = mergeLogs(this.log, diffSettings(this.snapshot as unknown as S, this.settings as unknown as S, time));
		this.snapshot = structuredClone(this.settings);
	}

	/** data.json as this device writes it. */
	file(): S {
		return { ...structuredClone(this.settings), editLog: structuredClone(this.log) };
	}

	/** Take in a data.json (from Sync), as onExternalSettingsChange does. */
	receive(file: S): void {
		this.log = mergeLogs(this.log, (file.editLog ?? {}) as EditLog);
		const settings = mergeSettings(file);
		ensureIds(settings as unknown as S);
		applyLog(settings as unknown as S, this.log);
		this.settings = settings;
		this.snapshot = structuredClone(settings);
	}
}

/** Obsidian Sync's merge of a plugin's data.json: the receiving device's keys over the other copy's. */
const syncMerge = (local: S, remote: S): S => ({ ...remote, ...local });

describe('settings edits merge by edit time', () => {
	it('records only what changed', () => {
		const a = structuredClone(DEFAULT_SETTINGS) as unknown as S;
		const b = structuredClone(DEFAULT_SETTINGS) as PluginSettings;
		b.scrollButtons.size = 1.5;
		ensureIds(a);
		ensureIds(b as unknown as S);
		expect(diffSettings(a, structuredClone(a), 1)).toEqual({});
		expect(Object.keys(diffSettings(a, b as unknown as S, 1))).toEqual(['scrollButtons.size']);
	});

	it('an offline phone bringing back an old data.json doesn\'t undo the desktop\'s edits', () => {
		const desktop = new Device();
		const phone = new Device();
		// Desktop, online: hides a command and moves the scroll buttons.
		desktop.edit(100, s => { s.hideCommands.hiddenIds.push('app:a'); });
		desktop.edit(110, s => { s.scrollButtons.offsetBottom = 40; });
		// Phone, offline for days: changes the daily note setting.
		phone.edit(200, s => { s.dailyNote.rollOver = false; });
		// The phone syncs: its data.json wins every key it has (all of them).
		const merged = syncMerge(phone.file(), desktop.file());
		expect((merged.hideCommands as S).hiddenIds).toEqual([]);
		// The desktop takes it in, and keeps both its edits and the phone's.
		desktop.receive(merged);
		expect(desktop.settings.hideCommands.hiddenIds).toEqual(['app:a']);
		expect(desktop.settings.scrollButtons.offsetBottom).toBe(40);
		expect(desktop.settings.dailyNote.rollOver).toBe(false);
		// ...and knows data.json needs repairing.
		expect(hasAllEdits(merged.editLog as EditLog, desktop.log)).toBe(false);
		// Once it writes it back, the phone ends up the same.
		phone.receive(desktop.file());
		expect(phone.settings).toEqual(desktop.settings);
	});

	it('the newer edit of the same setting wins, whichever device saved last', () => {
		const desktop = new Device();
		const phone = new Device();
		phone.edit(100, s => { s.scrollButtons.size = 0.8; });
		desktop.edit(200, s => { s.scrollButtons.size = 1.4; });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(desktop.settings.scrollButtons.size).toBe(1.4);
	});

	it('hiding and showing different commands on two devices keeps both', () => {
		const start = structuredClone(DEFAULT_SETTINGS);
		start.hideCommands.hiddenIds = ['x', 'y'];
		const desktop = new Device(start);
		const phone = new Device(start);
		desktop.edit(100, s => { s.hideCommands.hiddenIds.push('z'); });
		phone.edit(200, s => { s.hideCommands.hiddenIds = s.hideCommands.hiddenIds.filter(i => i !== 'x'); });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(desktop.settings.hideCommands.hiddenIds.sort()).toEqual(['y', 'z']);
	});

	it('edits to different rules of one list both survive; a removal and an older edit: newest wins', () => {
		const start = structuredClone(DEFAULT_SETTINGS);
		start.pinnedIcons.rules = [
			{ type: 'folder', match: 'Books', icon: 'book' },
			{ type: 'folder', match: 'Films', icon: 'film' },
			{ type: 'tag', match: 'old', icon: 'x' },
		];
		const desktop = new Device(start);
		const phone = new Device(start);
		desktop.edit(100, s => { s.pinnedIcons.rules[0].icon = 'library'; });
		desktop.edit(110, s => { s.pinnedIcons.rules[2].icon = 'y'; });
		phone.edit(200, s => { s.pinnedIcons.rules[1].icon = 'clapperboard'; });
		phone.edit(210, s => { s.pinnedIcons.rules.splice(2, 1); });
		phone.edit(220, s => { s.pinnedIcons.rules.push({ type: 'tag', match: 'new', icon: 'star' }); });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(desktop.settings.pinnedIcons.rules.map(r => `${r.match}:${r.icon}`)).toEqual(['Books:library', 'Films:clapperboard', 'new:star']);
	});

	it('a reorder is kept, and a rule added on another device is added after', () => {
		const start = structuredClone(DEFAULT_SETTINGS);
		start.linkIcons.rules = [{ extensions: 'pdf', icon: 'P' }, { extensions: 'png', icon: 'I' }];
		const desktop = new Device(start);
		const phone = new Device(start);
		desktop.edit(100, s => { s.linkIcons.rules.reverse(); });
		phone.edit(200, s => { s.linkIcons.rules.push({ extensions: 'epub', icon: 'E' }); });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(desktop.settings.linkIcons.rules.map(r => r.extensions)).toEqual(['png', 'pdf', 'epub']);
	});

	it('a rule added at the top on one device stays at the top on the others', () => {
		const start = structuredClone(DEFAULT_SETTINGS);
		start.pinnedIcons.rules = [{ type: 'folder', match: 'A', icon: 'a' }, { type: 'folder', match: 'B', icon: 'b' }];
		const desktop = new Device(start);
		const phone = new Device(start);
		phone.edit(100, s => { s.pinnedIcons.rules.unshift({ type: 'exact', match: 'Note', icon: 'n' }); });
		desktop.edit(200, s => { s.pinnedIcons.rules[1].icon = 'bb'; });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(desktop.settings.pinnedIcons.rules.map(r => `${r.match}:${r.icon}`)).toEqual(['Note:n', 'A:a', 'B:bb']);
	});

	it('gives the same rules the same ids on every device, and repeated rules different ones', () => {
		const make = () => ({ propertyTemplates: { rules: [
			{ type: 'folder', match: 'A', properties: [] },
			{ type: 'folder', match: 'A', properties: [] },
		] } });
		const one = make();
		const two = make();
		ensureIds(one);
		ensureIds(two);
		const ids = one.propertyTemplates.rules.map(r => (r as { id?: string }).id);
		expect(ids).toEqual(two.propertyTemplates.rules.map(r => (r as { id?: string }).id));
		expect(new Set(ids).size).toBe(2);
	});

	it('ignores edits that don\'t fit the settings (from another plugin version)', () => {
		const settings = structuredClone(DEFAULT_SETTINGS) as unknown as S;
		applyLog(settings, {
			'scrollButtons.size': { v: 'big', t: 1 },
			'scrollButtons.gone': { v: 1, t: 1 },
			'nothing.here': { v: 1, t: 1 },
		});
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});
});

describe('waiting for Sync to settle', () => {
	it('waits for a quiet minute', () => {
		expect(isSettled(QUIET_MS - 1, 0, 0, 'synced')).toBe(false);
		expect(isSettled(QUIET_MS, 0, 0, 'synced')).toBe(true);
		expect(isSettled(QUIET_MS, 0, 0, null)).toBe(true);
		// Offline or paused: the same quiet minute, then go ahead (the phone then offers a button).
		expect(isSettled(QUIET_MS, 0, 0, 'paused')).toBe(true);
	});

	it('keeps waiting while Sync is syncing, within limits', () => {
		expect(isSettled(QUIET_MS * 2, 0, 0, 'syncing')).toBe(false);
		expect(isSettled(MAX_WAIT_MS, MAX_WAIT_MS - 1000, 0, 'synced')).toBe(true);
		expect(isSettled(MAX_WAIT_MS * 3, MAX_WAIT_MS * 3, 0, 'syncing')).toBe(true);
	});
});

describe('today\'s daily note', () => {
	const step = (exists: boolean, settled: boolean, byHand: boolean, background: boolean) =>
		dailyStep({ exists, settled, byHand, background });

	it('opens it when it\'s there, without waiting', () => {
		expect(step(true, false, false, false)).toBe('open');
	});

	it('never creates it before Sync has settled', () => {
		for (const byHand of [true, false]) {
			for (const background of [true, false]) expect(step(false, false, byHand, background)).toBe('wait');
		}
	});

	it('creates it automatically only on the background device; elsewhere asks', () => {
		expect(step(false, true, false, true)).toBe('create');
		expect(step(false, true, false, false)).toBe('ask');
		expect(step(false, true, true, false)).toBe('create');
	});
});
