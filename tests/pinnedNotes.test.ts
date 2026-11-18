import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, type PluginSettings } from '../src/settings';
import { applyLog, diffSettings, ensureIds, mergeLogs, type EditLog } from '../src/shared/editLog';
import {
	MENU_BUTTON_TITLE, applyRename, createNote, importOriginalPlugins, importPinnedNotesMenu, moveItem, renameAffects, ribbonTitles,
	type PinnedItem, type PinnedNote,
} from '../src/features/pinnedNotes/pinnedNotesLogic';

type S = Record<string, unknown>;
const note = (id: string, path: string, title = '', icon = ''): PinnedNote => ({ id, type: 'note', title, path, icon });
const summary = (items: PinnedItem[]) => items.map(i => i.type === 'note' ? `${i.id}:${i.path}` : `${i.id}:---`);

/** A device with its settings and edit log, saving and receiving as the plugin does. */
class Device {
	log: EditLog = {};
	settings: PluginSettings = mergeSettings(structuredClone(DEFAULT_SETTINGS));
	private snapshot = structuredClone(this.settings);

	edit(time: number, change: (s: PluginSettings) => void): void {
		change(this.settings);
		ensureIds(this.settings as unknown as S);
		this.log = mergeLogs(this.log, diffSettings(this.snapshot as unknown as S, this.settings as unknown as S, time));
		this.snapshot = structuredClone(this.settings);
	}

	file(): S {
		return { ...structuredClone(this.settings), editLog: structuredClone(this.log) };
	}

	receive(file: S): void {
		this.log = mergeLogs(this.log, (file.editLog ?? {}) as EditLog);
		const settings = mergeSettings(file);
		ensureIds(settings as unknown as S);
		applyLog(settings as unknown as S, this.log);
		this.settings = settings;
		this.snapshot = structuredClone(settings);
	}
}
const syncMerge = (local: S, remote: S): S => ({ ...remote, ...local });

// Pinned Notes Menu 0.0.2's data.json.
const PNM_002 = {
	items: [
		{ id: 'b', type: 'note', title: '', path: 'Inbox.md', icon: 'inbox', order: 2, updatedAt: 100 },
		{ id: 'a', type: 'note', title: 'Home', path: 'Home.md', icon: '', order: 1, updatedAt: 100 },
		{ id: 'd', type: 'divider', order: 3, updatedAt: 100 },
		{ id: 'gone', type: 'note', title: '', path: 'Old.md', icon: '', order: 4, updatedAt: 100 },
		{ id: 'back', type: 'note', title: '', path: 'Back.md', icon: '', order: 5, updatedAt: 300 },
		{ id: 'c', type: 'note', title: '', path: 'Tasks', icon: '', order: 2, updatedAt: 100 },
	],
	tombstones: { gone: 200, back: 250 },
	prefs: {
		showRibbonIcons: { value: false, updatedAt: 5 },
		showMenuButton: { value: true, updatedAt: 5 },
		menuIcon: { value: 'star', updatedAt: 5 },
		openIn: { value: 'tab', updatedAt: 5 },
	},
	// Plain copies for 0.0.1, which the prefs above override.
	showRibbonIcons: true, showMenuButton: false, menuIcon: 'pin', openIn: 'tab', focusExisting: false,
};

describe('pinned notes: importing Pinned Notes Menu', () => {
	it('reads 0.0.2: sorted by order then id, removed items left out, ids kept, settings mapped', () => {
		const { items, prefs } = importPinnedNotesMenu(PNM_002, []);
		expect(summary(items)).toEqual(['a:Home.md', 'b:Inbox.md', 'c:Tasks', 'd:---', 'back:Back.md']);
		expect(items[0]).toEqual(note('a', 'Home.md', 'Home'));
		expect(prefs).toEqual({ showRibbonIcons: false, showMenuButton: true, menuIcon: 'star' });
	});

	it('reads 0.0.1: plain items in list order, settings as plain keys', () => {
		const { items, prefs } = importPinnedNotesMenu({
			items: [note('x', 'B.md'), { id: 'y', type: 'divider' }, note('z', 'A.md', 'A', 'star')],
			showRibbonIcons: true, showMenuButton: true, menuIcon: 'bookmark', openIn: 'split',
		}, []);
		expect(summary(items)).toEqual(['x:B.md', 'y:---', 'z:A.md']);
		expect(prefs).toEqual({ showRibbonIcons: true, showMenuButton: true, menuIcon: 'bookmark' });
	});

	it('skips items already in the list, by id or path', () => {
		const { items } = importPinnedNotesMenu(PNM_002, [note('a', 'Home.md'), note('other', 'Inbox')]);
		expect(summary(items)).toEqual(['c:Tasks', 'd:---', 'back:Back.md']);
		expect(importPinnedNotesMenu(null, []).items).toEqual([]);
	});

	it('importing on two devices and merging gives no duplicates', () => {
		const desktop = new Device();
		const phone = new Device();
		desktop.edit(100, s => { s.pinnedNotes.items.push(...importPinnedNotesMenu(PNM_002, s.pinnedNotes.items).items); });
		phone.edit(200, s => { s.pinnedNotes.items.push(...importPinnedNotesMenu(PNM_002, s.pinnedNotes.items).items); });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(summary(desktop.settings.pinnedNotes.items)).toEqual(['a:Home.md', 'b:Inbox.md', 'c:Tasks', 'd:---', 'back:Back.md']);
		phone.receive(desktop.file());
		expect(phone.settings.pinnedNotes.items).toEqual(desktop.settings.pinnedNotes.items);
	});
});

describe('pinned notes: syncing', () => {
	it('pinning on the phone while the desktop reorders keeps both changes', () => {
		const desktop = new Device();
		desktop.edit(10, s => { s.pinnedNotes.items = [note('a', 'A.md'), note('b', 'B.md'), note('c', 'C.md')]; });
		const phone = new Device();
		phone.receive(desktop.file());
		// Desktop moves C to the top; the phone, offline, pins D.
		desktop.edit(100, s => { s.pinnedNotes.items = moveItem(moveItem(s.pinnedNotes.items, 'c', -1), 'c', -1); });
		phone.edit(200, s => { s.pinnedNotes.items.push(note('d', 'D.md')); });
		// The phone's data.json wins every key when it syncs; the desktop takes it in.
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(summary(desktop.settings.pinnedNotes.items)).toEqual(['c:C.md', 'a:A.md', 'b:B.md', 'd:D.md']);
		phone.receive(desktop.file());
		expect(summary(phone.settings.pinnedNotes.items)).toEqual(['c:C.md', 'a:A.md', 'b:B.md', 'd:D.md']);
	});

	it('unpinning on one device and renaming another note on the other keeps both', () => {
		const desktop = new Device();
		desktop.edit(10, s => { s.pinnedNotes.items = [note('a', 'A.md'), note('b', 'B.md')]; });
		const phone = new Device();
		phone.receive(desktop.file());
		desktop.edit(100, s => { applyRename(s.pinnedNotes.items, 'B.md', 'Done/B.md'); });
		phone.edit(200, s => { s.pinnedNotes.items = s.pinnedNotes.items.filter(i => i.id !== 'a'); });
		desktop.receive(syncMerge(phone.file(), desktop.file()));
		expect(summary(desktop.settings.pinnedNotes.items)).toEqual(['b:Done/B.md']);
	});
});

describe('pinned notes: ribbon titles', () => {
	it('makes every title unique, keeping the menu button\'s title free', () => {
		const items: PinnedItem[] = [
			note('1', 'A/Pinned notes.md'), note('2', 'B/Daily.md'), note('3', 'C/Daily.md'),
			{ id: '4', type: 'divider' }, note('5', 'X.md', 'Daily'), { id: '6', type: 'divider' }, note('7', ''),
		];
		const titles = ribbonTitles(items, [MENU_BUTTON_TITLE]);
		expect([...titles.values()]).toEqual(['Pinned notes (2)', 'Daily', 'Daily (2)', 'Divider 1', 'Daily (3)', 'Divider 2', 'Untitled']);
		expect(new Set(titles.values()).size).toBe(items.length);
	});
});

describe('pinned notes: renames', () => {
	it('follows a renamed or moved note, also one stored without .md', () => {
		const items: PinnedItem[] = [note('a', 'Notes/A.md'), note('b', 'Notes/B'), note('c', 'Other.md')];
		expect(renameAffects(items, 'Notes/A.md')).toBe(true);
		expect(applyRename(items, 'Notes/A.md', 'Archive/A2.md')).toBe(true);
		expect(applyRename(items, 'Notes/B.md', 'Notes/B renamed.md')).toBe(true);
		expect(items.map(i => (i as PinnedNote).path)).toEqual(['Archive/A2.md', 'Notes/B renamed.md', 'Other.md']);
		expect(renameAffects(items, 'Nothing.md')).toBe(false);
		expect(applyRename(items, 'Nothing.md', 'Else.md')).toBe(false);
	});

	it('follows a renamed folder, without touching folders that only start the same', () => {
		const items: PinnedItem[] = [note('a', 'Projects/A.md'), note('b', 'Projects/Sub/B.md'), note('c', 'Projects 2/C.md')];
		expect(applyRename(items, 'Projects', 'Work')).toBe(true);
		expect(items.map(i => (i as PinnedNote).path)).toEqual(['Work/A.md', 'Work/Sub/B.md', 'Projects 2/C.md']);
	});
});

describe('pinned notes: importing the original plugins', () => {
	it('takes notes not already pinned, and dividers only into a list without any', () => {
		const pinnedNotes = { pinnedNotes: [{ title: 'Home', path: 'Home', icon: 'home' }, { title: '', path: 'Inbox.md', icon: '' }, { path: '' }] };
		const ribbonDivider = { dividers: { one: { id: 'one' }, two: { id: 'two' } } };
		const items = importOriginalPlugins(pinnedNotes, ribbonDivider, [note('x', 'Inbox')]);
		expect(items.map(i => i.type === 'note' ? `${i.title}|${i.path}|${i.icon}` : '---')).toEqual(['Home|Home|home', '---', '---']);
		expect(new Set(items.map(i => i.id)).size).toBe(3);
		expect(importOriginalPlugins(pinnedNotes, ribbonDivider, [{ id: 'd', type: 'divider' }, createNote('Home.md')])
			.map(i => i.type)).toEqual(['note']);
	});
});
