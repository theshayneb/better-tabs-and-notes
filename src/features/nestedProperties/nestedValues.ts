// Helpers for nested property values; no Obsidian imports so they can be unit-tested.
// Based on Nested Properties by Michael Naumov (MIT); see NOTICE.md.

export type PlainObject = Record<string, unknown>;

/** An object or a list (anything that nests). */
export function isComplexValue(value: unknown): value is PlainObject | unknown[] {
	return value !== null && typeof value === 'object' && !(value instanceof Date);
}

/** A list of plain values, which Obsidian's own list type can show. */
export function isSimpleArray(value: unknown): value is unknown[] {
	return Array.isArray(value) && value.every(item => !isComplexValue(item));
}

export function isPlainObject(value: unknown): value is PlainObject {
	return isComplexValue(value) && !Array.isArray(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

function asText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	return JSON.stringify(value) ?? '';
}

/** The value adapted to a property type (as named by Obsidian, plus "object" and "list"). */
export function convertValue(targetType: string, value: unknown): unknown {
	switch (targetType) {
		case 'aliases':
		case 'multitext':
		case 'tags':
			if (Array.isArray(value)) return value.filter(item => !isComplexValue(item));
			if (isComplexValue(value)) return [];
			return asText(value) ? [asText(value)] : [];
		case 'checkbox':
			return Boolean(value);
		case 'date':
		case 'datetime':
			return typeof value === 'string' && DATE.test(value) ? value : null;
		case 'number':
			return Number(asText(value)) || 0;
		case 'list':
			if (Array.isArray(value)) return value;
			return value === null || value === undefined || value === '' ? [] : [value];
		case 'object':
			return isPlainObject(value) ? value : {};
		default:
			return asText(value);
	}
}

/** Whether converting would drop or reshape data, so it's worth asking first. */
export function isLossyConversion(targetType: string, value: unknown): boolean {
	switch (targetType) {
		case 'aliases':
		case 'multitext':
		case 'tags':
			return !isSimpleArray(value) && !(value === null || value === undefined || value === '');
		case 'list':
			return !Array.isArray(value) && isComplexValue(value);
		case 'object':
			return !isPlainObject(value) && !(value === null || value === undefined || value === '');
		default:
			return isComplexValue(value);
	}
}

const MAX_SUMMARY = 120;

/** One line describing a collapsed value, with anything nested inside it shortened to { ... } or [ ... ]. */
export function summarize(value: unknown): string {
	const item = (v: unknown) => Array.isArray(v) ? '[ ... ]' : isComplexValue(v) ? '{ ... }' : asText(v);
	let open: string, close: string, entries: string[];
	if (Array.isArray(value)) {
		[open, close, entries] = ['[', ']', value.map(item)];
	} else if (isPlainObject(value)) {
		[open, close, entries] = ['{', '}', Object.entries(value).map(([k, v]) => `${k}: ${item(v)}`)];
	} else {
		return asText(value);
	}
	if (entries.length === 0) return `${open}${close}`;
	const body = entries.join(', ');
	return `${open} ${body.length > MAX_SUMMARY ? `${body.slice(0, MAX_SUMMARY)}…` : body} ${close}`;
}

/**
 * The key Obsidian stores a nested property's type under: the dotted path,
 * e.g. `book.author` or `versions.0.released` for one list item.
 */
export function typeKeyFor(path: string[]): string {
	return path.join('.');
}

/**
 * The shared key for a field of every item in a list: `versions.released` for
 * `versions.0.released`. Null when the last part is itself a list index.
 */
export function fieldTypeKeyFor(path: string[]): string | null {
	const last = path[path.length - 1];
	if (last === undefined || /^\d+$/.test(last)) return null;
	return path.filter(part => !/^\d+$/.test(part)).join('.');
}
