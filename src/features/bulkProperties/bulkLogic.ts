// Pure helpers for bulk property edits; no Obsidian imports so they can be unit-tested.
// Based on Multi Properties by technohiker (MIT); see NOTICE.md.

export type ExistingMode = 'ignore' | 'overwrite' | 'append';
export type ValueType = 'text' | 'number' | 'checkbox' | 'date' | 'datetime';

export interface NewProperty {
	name: string;
	type: ValueType;
	value: string | number | boolean | string[] | null;
}

/** Property types whose values can't be merged into a list. */
const NOT_APPENDABLE = ['number', 'date', 'datetime', 'checkbox'];

/** Characters that aren't allowed in tags. From Quick Tagger, via Multi Properties. */
const BAD_TAG_CHARACTERS = /[‒–—―⁏‽‘‚‛‹›“”„‟⁅⁆⁋⁎⁑⁄⁊‰‱⁒†‡•‣⁃⁌⁍′‵‸※⁐⁁⁂‖‑″‴⁗‶‷`^‾‗⁓;:!‼⁉?⁈⁇.․‥…'"()[\]{}@*&%⁔+<=>|~$⁕⁖⁘⁙⁚⁛⁜⁝⁞⸀-⸗⸜⸝ #]/g;

export function cleanTag(tag: string): string {
	return tag.replace(BAD_TAG_CHARACTERS, '');
}

/**
 * Turn what was typed in the form into a property value. Text containing the
 * list delimiter becomes a list; an empty value becomes null (an empty property).
 */
export function parseValue(name: string, type: ValueType, raw: string | boolean, delimiter: string): NewProperty['value'] {
	if (type === 'checkbox') return raw === true || raw === 'true';
	const text = String(raw).trim();
	if (text === '') return null;
	if (type === 'number') {
		const n = Number(text);
		return Number.isFinite(n) ? n : text;
	}
	if (type !== 'text') return text;

	const isTags = name.toLowerCase() === 'tags';
	if (delimiter && text.includes(delimiter)) {
		const items = text.split(delimiter).map(s => s.trim()).map(s => isTags ? cleanTag(s) : s).filter(Boolean);
		return items.length ? items : null;
	}
	return isTags ? cleanTag(text) : text;
}

function toList(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [value];
}

/** Whether a property already has a value worth keeping. */
function hasValue(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return false;
	return !(Array.isArray(value) && value.length === 0);
}

/**
 * Apply new properties to one note's frontmatter (mutates it). `existingType`
 * gives the type Obsidian has registered for a property name, if any.
 */
export function applyProperties(
	frontmatter: Record<string, unknown>,
	props: NewProperty[],
	mode: ExistingMode,
	existingType: (name: string) => string | undefined,
): void {
	for (const prop of props) {
		const current = frontmatter[prop.name];
		const exists = prop.name in frontmatter && hasValue(current);

		// Tags are always a list, even with one tag.
		const value = prop.name.toLowerCase() === 'tags' && prop.value !== null && !Array.isArray(prop.value)
			? [prop.value]
			: prop.value;

		if (!exists) {
			frontmatter[prop.name] = value;
			continue;
		}
		if (mode === 'ignore') continue;
		if (mode === 'overwrite') {
			frontmatter[prop.name] = value;
			continue;
		}
		// Append: merge into a list, without duplicates, when both sides are list-friendly.
		if (value === null) continue;
		if (NOT_APPENDABLE.includes(prop.type) || NOT_APPENDABLE.includes(existingType(prop.name) ?? '')) continue;
		if (current === value) continue;
		frontmatter[prop.name] = [...new Set([...toList(current), ...toList(value)])];
	}
}

/** Remove properties from one note's frontmatter (mutates it). Returns how many were there. */
export function removeProperties(frontmatter: Record<string, unknown>, names: string[]): number {
	let removed = 0;
	for (const name of names) {
		if (name in frontmatter) {
			delete frontmatter[name];
			removed++;
		}
	}
	return removed;
}

/** How many of the given notes have each property, most common first, then by name. */
export function countProperties(frontmatters: (Record<string, unknown> | undefined)[]): { name: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const fm of frontmatters) {
		for (const key of Object.keys(fm ?? {})) {
			if (key === 'position') continue;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
