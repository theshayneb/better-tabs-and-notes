// Pinned notes: the list of pinned notes and ribbon dividers, and imports from
// the plugins it replaces. No Obsidian imports, so it can be unit-tested.
// Ported from Pinned Notes Menu (MIT), which combined Pinned Notes by
// vasilcoin002 and Ribbon Divider by Andrew McGivery (both MIT); see NOTICE.md.
//
// Syncing between devices is done by the plugin's edit log (shared/editLog.ts):
// the list merges item by item, by `id`.

export interface PinnedNote {
	id: string;
	type: 'note';
	/** Shown on hover and in the menu. Empty means "use the file name". */
	title: string;
	/** Vault path, e.g. `Folder/Note.md`. Older entries may omit the `.md`. */
	path: string;
	/** Lucide icon name (or an emoji). Empty means the default icon. */
	icon: string;
}

export interface PinnedDivider {
	id: string;
	type: 'divider';
}

export type PinnedItem = PinnedNote | PinnedDivider;

/** The ribbon settings Pinned Notes Menu had (and this feature keeps). */
export interface PinnedNotesPrefs {
	showRibbonIcons: boolean;
	showMenuButton: boolean;
	menuIcon: string;
}

export const DEFAULT_NOTE_ICON = 'file';
export const DEFAULT_MENU_ICON = 'pin';
export const MENU_BUTTON_TITLE = 'Pinned notes';

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;

export function createNote(path: string, title = '', icon = ''): PinnedNote {
	return { id: newId(), type: 'note', title, path, icon };
}

export function createDivider(): PinnedDivider {
	return { id: newId(), type: 'divider' };
}

export function isNote(item: PinnedItem): item is PinnedNote {
	return item.type === 'note';
}

/** One stored item, or null if it's broken. Keeps the id (or makes one up if missing). */
function cleanItem(entry: unknown): PinnedItem | null {
	if (!isRecord(entry)) return null;
	const id = str(entry.id) || newId();
	if (entry.type === 'divider') return { id, type: 'divider' };
	if (entry.type === 'note') return { id, type: 'note', title: str(entry.title), path: str(entry.path), icon: str(entry.icon) };
	return null;
}

/** The stored list, dropping broken items and repeated ids. */
export function cleanItems(raw: unknown): PinnedItem[] {
	const seen = new Set<string>();
	const items: PinnedItem[] = [];
	for (const entry of Array.isArray(raw) ? raw : []) {
		const item = cleanItem(entry);
		if (!item || seen.has(item.id)) continue;
		seen.add(item.id);
		items.push(item);
	}
	return items;
}

/** Move the item with `id` by `delta` places. Acts on the id, not a position, so a list changed by a sync can't move the wrong one. */
export function moveItem(items: PinnedItem[], id: string, delta: number): PinnedItem[] {
	const index = items.findIndex(i => i.id === id);
	const target = index + delta;
	if (index < 0 || target < 0 || target >= items.length) return items;
	const result = [...items];
	const [item] = result.splice(index, 1);
	result.splice(target, 0, item);
	return result;
}

// ---------------------------------------------------------------------------
// Paths and titles
// ---------------------------------------------------------------------------

/** True when a stored note path refers to the file at `filePath`. */
export function pathMatches(notePath: string, filePath: string): boolean {
	return notePath === filePath || (filePath.endsWith('.md') && notePath === filePath.slice(0, -3));
}

export function baseName(path: string): string {
	const name = path.split('/').pop() ?? '';
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

export function displayTitle(note: PinnedNote): string {
	return note.title.trim() || baseName(note.path.trim()) || 'Untitled';
}

/**
 * Obsidian identifies ribbon icons by `<plugin id>:<title>`, so every icon the
 * plugin adds needs a unique title. Returns the title to use for each item.
 */
export function ribbonTitles(items: PinnedItem[], reserved: string[] = []): Map<string, string> {
	const used = new Set(reserved);
	const titles = new Map<string, string>();
	let dividers = 0;
	for (const item of items) {
		const base = isNote(item) ? displayTitle(item) : `Divider ${++dividers}`;
		let title = base;
		for (let n = 2; used.has(title); n++) title = `${base} (${n})`;
		used.add(title);
		titles.set(item.id, title);
	}
	return titles;
}

/** Default icon for a newly pinned file, by extension. */
export function iconForExtension(extension: string): string {
	switch (extension) {
		case 'canvas': return 'layout-dashboard';
		case 'base': return 'table';
		case 'pdf': return 'file-text';
		default: return '';
	}
}

/**
 * Update note paths after a file or folder was renamed or moved (changes the
 * items in place). Returns whether anything changed.
 */
export function applyRename(items: PinnedItem[], oldPath: string, newPath: string): boolean {
	let changed = false;
	for (const item of items) {
		if (!isNote(item)) continue;
		if (pathMatches(item.path, oldPath)) {
			item.path = newPath;
			changed = true;
		} else if (item.path.startsWith(`${oldPath}/`)) {
			item.path = newPath + item.path.slice(oldPath.length);
			changed = true;
		}
	}
	return changed;
}

/** Whether a rename would change any pinned note's path. */
export function renameAffects(items: PinnedItem[], oldPath: string): boolean {
	return items.some(i => isNote(i) && (pathMatches(i.path, oldPath) || i.path.startsWith(`${oldPath}/`)));
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const alreadyPinned = (existing: PinnedItem[], path: string) =>
	existing.some(i => isNote(i) && (pathMatches(i.path, path) || pathMatches(path, i.path)));

/**
 * Items from the original Pinned Notes (`pinned-notes`: `pinnedNotes: [{title,
 * path, icon}]`) and Ribbon Divider (`ribbon-divider`: `dividers: {id: {id}}`)
 * plugins. Notes already pinned are skipped. Dividers have nothing to match on,
 * so they're only imported into a list without any, after the notes.
 */
export function importOriginalPlugins(pinnedNotesData: unknown, ribbonDividerData: unknown, existing: PinnedItem[]): PinnedItem[] {
	const result: PinnedItem[] = [];
	const notes = isRecord(pinnedNotesData) && Array.isArray(pinnedNotesData.pinnedNotes) ? pinnedNotesData.pinnedNotes : [];
	for (const entry of notes) {
		if (!isRecord(entry)) continue;
		const path = str(entry.path).trim();
		if (!path || alreadyPinned([...existing, ...result], path)) continue;
		result.push(createNote(path, str(entry.title).trim(), str(entry.icon).trim()));
	}
	if (!existing.some(i => i.type === 'divider') && isRecord(ribbonDividerData) && isRecord(ribbonDividerData.dividers)) {
		for (let i = 0; i < Object.keys(ribbonDividerData.dividers).length; i++) result.push(createDivider());
	}
	return result;
}

/**
 * The list and ribbon settings from Pinned Notes Menu's data.json, in either of
 * its formats:
 * - 0.0.2: items with `order` and `updatedAt`, `tombstones` (id -> time
 *   removed) and `prefs` ({key: {value, updatedAt}}, with plain copies at the
 *   top level). Sorted by `order`, then `id`; tombstoned items are left out.
 * - 0.0.1: plain items in list order, settings as plain top-level keys.
 * Ids are kept, so devices importing it separately get the same items. Items
 * already in `existing` (same id, or a note with the same path) are skipped.
 */
export function importPinnedNotesMenu(raw: unknown, existing: PinnedItem[]): { items: PinnedItem[]; prefs: Partial<PinnedNotesPrefs> } {
	const data = isRecord(raw) ? raw : {};
	const tombstones = isRecord(data.tombstones) ? data.tombstones : {};
	const entries = (Array.isArray(data.items) ? data.items : [])
		.map((entry: unknown, index: number) => {
			const item = cleanItem(entry);
			if (!item || !isRecord(entry) || !str(entry.id)) return null;
			const updatedAt = num(entry.updatedAt) ?? 0;
			const removedAt = num(tombstones[item.id]);
			if (removedAt !== null && removedAt >= updatedAt) return null;
			return { item, order: num(entry.order) ?? index + 1 };
		})
		.filter((e): e is { item: PinnedItem; order: number } => e !== null)
		.sort((a, b) => a.order - b.order || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));

	const items: PinnedItem[] = [];
	const ids = new Set(existing.map(i => i.id));
	for (const { item } of entries) {
		if (ids.has(item.id)) continue;
		if (isNote(item) && (!item.path.trim() || alreadyPinned([...existing, ...items], item.path))) continue;
		ids.add(item.id);
		items.push(item);
	}

	const prefs: Partial<PinnedNotesPrefs> = {};
	const stored = isRecord(data.prefs) ? data.prefs : {};
	const pick = (key: keyof PinnedNotesPrefs, valid: (v: unknown) => boolean): unknown => {
		const entry = stored[key];
		if (isRecord(entry) && valid(entry.value)) return entry.value;
		return valid(data[key]) ? data[key] : undefined;
	};
	const isBool = (v: unknown) => typeof v === 'boolean';
	const showRibbonIcons = pick('showRibbonIcons', isBool);
	const showMenuButton = pick('showMenuButton', isBool);
	const menuIcon = pick('menuIcon', v => typeof v === 'string' && v.trim() !== '');
	if (typeof showRibbonIcons === 'boolean') prefs.showRibbonIcons = showRibbonIcons;
	if (typeof showMenuButton === 'boolean') prefs.showMenuButton = showMenuButton;
	if (typeof menuIcon === 'string') prefs.menuIcon = menuIcon.trim();
	return { items, prefs };
}
