// Merge settings edited on several devices by when each edit was made.
//
// Obsidian Sync merges data.json per top-level key, and the device that saved
// last wins whole keys, so a phone that was offline for days can bring back old
// copies of settings changed elsewhere since. To undo that, every edit made
// through the plugin is also kept in an edit log: setting path -> { value, time
// of the edit }. Each device keeps every edit it has seen in its own storage and
// writes the log into data.json; the settings are the stored ones with the
// newest edit for each path laid over them. A log that Sync rolled back is put
// right again by any device that has seen the newer edits.
//
// No Obsidian imports, so it can be unit-tested.

export interface Edit {
	/** The new value; null means removed (a list item). */
	v: unknown;
	/** When the edit was made (ms since 1970). */
	t: number;
}

export type EditLog = Record<string, Edit>;

/**
 * Lists merged item by item instead of as a whole, so edits to different items
 * on different devices both survive. "set": a list of unique strings (order
 * doesn't matter). "items": a list of objects, each with a stable `id`.
 */
export const ITEM_LISTS: Record<string, 'set' | 'items'> = {
	'hideCommands.hiddenIds': 'set',
	'pinnedIcons.rules': 'items',
	'linkIcons.rules': 'items',
	'propertyTemplates.rules': 'items',
	'propertyTemplates.choices': 'items',
	'pinnedNotes.items': 'items',
	'taskSweeper.includedFiles': 'set',
	'taskSweeper.includedFolders': 'set',
};

const FIRST = '^';
const LAST = '$';

/** The key data.json keeps the log under. */
export const EDIT_LOG_KEY = 'editLog';

type Settings = Record<string, unknown>;
type Item = Record<string, unknown> & { id?: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const json = (v: unknown) => JSON.stringify(v);

function hash(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}

/**
 * Give every item of the item lists an id. New ids come from the item's
 * content, so two devices upgrading the same settings give the same items the
 * same ids. Changes the settings in place; returns whether any id was added.
 */
export function ensureIds(settings: Settings): boolean {
	let added = false;
	for (const [path, kind] of Object.entries(ITEM_LISTS)) {
		if (kind !== 'items') continue;
		const list = getPath(settings, path);
		if (!Array.isArray(list)) continue;
		const used = new Set<string>();
		for (const item of list as Item[]) {
			if (!isRecord(item)) continue;
			if (typeof item.id === 'string' && item.id && !used.has(item.id)) {
				used.add(item.id);
				continue;
			}
			const { id: _old, ...content } = item;
			const base = hash(json(content));
			let id = base;
			for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
			item.id = id;
			used.add(id);
			added = true;
		}
	}
	return added;
}

function getPath(settings: Settings, path: string): unknown {
	const [section, field] = path.split('.');
	const s = settings[section];
	return isRecord(s) ? s[field] : undefined;
}

/** The edits that turn `before` into `after`, all made at `time`. */
export function diffSettings(before: Settings, after: Settings, time: number): EditLog {
	const log: EditLog = {};
	for (const [section, value] of Object.entries(after)) {
		if (!isRecord(value)) continue;
		const old = isRecord(before[section]) ? before[section] : {};
		for (const [field, next] of Object.entries(value)) {
			const path = `${section}.${field}`;
			const prev = old[field];
			const kind = ITEM_LISTS[path];
			if (kind === 'set' && Array.isArray(next)) {
				const was = new Set(Array.isArray(prev) ? prev.map(String) : []);
				const now = new Set(next.map(String));
				for (const id of now) if (!was.has(id)) log[`${path}/${id}`] = { v: true, t: time };
				for (const id of was) if (!now.has(id)) log[`${path}/${id}`] = { v: null, t: time };
			} else if (kind === 'items' && Array.isArray(next)) {
				const was = new Map((Array.isArray(prev) ? prev as Item[] : []).filter(isRecord).map(i => [String(i.id), i]));
				const items = (next as Item[]).filter(isRecord);
				for (const item of items) {
					const id = String(item.id);
					if (json(was.get(id)) !== json(item)) log[`${path}/${id}`] = { v: structuredClone(item), t: time };
				}
				const ids = items.map(i => String(i.id));
				for (const id of was.keys()) if (!ids.includes(id)) log[`${path}/${id}`] = { v: null, t: time };
				// The order only counts when items that were already there moved, so adding an
				// item here doesn't undo a reorder made on another device.
				const kept = ids.filter(id => was.has(id));
				if (json([...was.keys()].filter(id => ids.includes(id))) !== json(kept)) log[`${path}#order`] = { v: ids, t: time };
				// Where a new item went: first, last, or after another item.
				ids.forEach((id, i) => {
					if (was.has(id)) return;
					const where = i === 0 ? FIRST : i === ids.length - 1 ? LAST : ids[i - 1];
					log[`${path}#after/${id}`] = { v: where, t: time };
				});
			} else if (json(prev) !== json(next)) {
				log[path] = { v: structuredClone(next), t: time };
			}
		}
	}
	return log;
}

/** Both logs together, keeping the newer edit of each path. */
export function mergeLogs(a: EditLog, b: EditLog): EditLog {
	const result: EditLog = { ...a };
	for (const [path, edit] of Object.entries(b)) {
		const mine = result[path];
		// The same time on both: pick one the same way on every device.
		if (!mine || edit.t > mine.t || (edit.t === mine.t && json(edit.v) > json(mine.v))) result[path] = edit;
	}
	return result;
}

/** Whether `log` has every edit of `other` (or a newer one). */
export function hasAllEdits(log: EditLog, other: EditLog): boolean {
	return Object.entries(other).every(([path, edit]) => {
		const mine = log[path];
		return !!mine && (mine.t > edit.t || (mine.t === edit.t && json(mine.v) === json(edit.v)));
	});
}

/** A log read from storage, keeping only well-formed edits. */
export function cleanLog(raw: unknown): EditLog {
	const log: EditLog = {};
	if (!isRecord(raw)) return log;
	for (const [path, edit] of Object.entries(raw)) {
		if (isRecord(edit) && typeof edit.t === 'number' && Number.isFinite(edit.t) && 'v' in edit) {
			log[path] = { v: edit.v, t: edit.t };
		}
	}
	return log;
}

const sameKind = (a: unknown, b: unknown) =>
	Array.isArray(a) ? Array.isArray(b) : isRecord(a) ? isRecord(b) : typeof a === typeof b;

/**
 * Lay the newest edits over the settings (in place). Only paths the settings
 * already have, with values of the same kind, are used, so an edit from a
 * newer or older version of the plugin can't break anything.
 */
export function applyLog(settings: Settings, log: EditLog): void {
	const listEdits = new Map<string, { items: [string, Edit][]; order?: Edit; after: Map<string, string> }>();
	for (const [path, edit] of Object.entries(log)) {
		const list = Object.keys(ITEM_LISTS).find(l => path.startsWith(`${l}/`) || path.startsWith(`${l}#`));
		if (list) {
			const entry = listEdits.get(list) ?? { items: [], after: new Map<string, string>() };
			if (path === `${list}#order`) entry.order = edit;
			else if (path.startsWith(`${list}#after/`)) entry.after.set(path.slice(list.length + 7), String(edit.v));
			else if (path.startsWith(`${list}/`)) entry.items.push([path.slice(list.length + 1), edit]);
			listEdits.set(list, entry);
			continue;
		}
		const [section, field, ...rest] = path.split('.');
		const target = settings[section];
		if (rest.length || !isRecord(target) || !(field in target)) continue;
		if (!sameKind(target[field], edit.v) || edit.v === null) continue;
		target[field] = structuredClone(edit.v);
	}
	for (const [list, { items, order, after }] of listEdits) {
		const [section, field] = list.split('.');
		const target = settings[section];
		if (!isRecord(target) || !Array.isArray(target[field])) continue;
		items.sort((a, b) => a[1].t - b[1].t);
		if (ITEM_LISTS[list] === 'set') {
			const values = (target[field] as unknown[]).map(String);
			const set = new Set(values);
			for (const [id, edit] of items) {
				if (edit.v === null) set.delete(id);
				else set.add(id);
			}
			// Keep the stored order, then add new ones in the order they were added.
			target[field] = [...values.filter(v => set.has(v)), ...[...set].filter(v => !values.includes(v))]
				.filter((v, i, all) => all.indexOf(v) === i);
		} else {
			const byId = new Map<string, Item>();
			const base: string[] = [];
			for (const item of (target[field] as Item[]).filter(isRecord)) {
				byId.set(String(item.id), item);
				base.push(String(item.id));
			}
			const added: string[] = [];
			for (const [id, edit] of items) {
				if (edit.v === null) byId.delete(id);
				else if (isRecord(edit.v)) {
					if (!byId.has(id) && !base.includes(id)) added.push(id);
					byId.set(id, { ...structuredClone(edit.v), id });
				}
			}
			const wanted = Array.isArray(order?.v) ? (order.v as unknown[]).map(String) : [];
			const ids = [...wanted, ...base].filter((id, i, all) => all.indexOf(id) === i && byId.has(id));
			// Items added on another device go where they were added (first, last, or after an item).
			for (const id of added) {
				if (ids.includes(id) || !byId.has(id)) continue;
				const where = after.get(id) ?? LAST;
				const at = where === FIRST ? 0 : where === LAST ? ids.length : ids.indexOf(where) + 1 || ids.length;
				ids.splice(at, 0, id);
			}
			target[field] = ids.map(id => byId.get(id));
		}
	}
}
