// Pure helpers for renaming and merging tags; no Obsidian imports so they can be unit-tested.
// Based on Tag Wrangler by PJ Eby (ISC); see NOTICE.md.
// Tag names here are without the leading "#".

/** Characters Obsidian doesn't allow in tags. */
const TAG_NAME = /^[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]+$/;

/** Tidy what was typed: no leading "#", no surrounding spaces or slashes. */
export function normalizeTagName(input: string): string {
	return input.trim().replace(/^#+/, '').replace(/^\/+|\/+$/g, '');
}

/** Why a tag name can't be used, or null if it's fine. */
export function tagNameProblem(name: string): string | null {
	if (!name) return 'Type a tag name.';
	if (!TAG_NAME.test(name)) return 'Tags can\'t contain spaces or punctuation other than - _ and /.';
	if (name.split('/').some(part => part === '')) return 'Tags can\'t contain "//".';
	if (/^\d+$/.test(name.replace(/\//g, ''))) return 'Tags need at least one character that isn\'t a number.';
	return null;
}

/**
 * The new name of `tag` when `from` is renamed to `to`, or null if `tag` isn't
 * `from` or one of its subtags. Matching ignores case, like Obsidian does.
 */
export function renamedTag(tag: string, from: string, to: string): string | null {
	const lower = tag.toLowerCase();
	const prefix = from.toLowerCase();
	if (lower === prefix) return to;
	if (lower.startsWith(prefix + '/')) return to + tag.slice(from.length);
	return null;
}

/** Whether the tag is `from` or one of its subtags. */
export function isAffected(tag: string, from: string): boolean {
	return renamedTag(tag, from, from) !== null;
}

/**
 * Existing tags the rename would merge into, as [old, existing] pairs. A rename
 * that only changes case merges nothing.
 */
export function findMerges(allTags: string[], from: string, to: string): [string, string][] {
	if (from.toLowerCase() === to.toLowerCase()) return [];
	const untouched = new Map<string, string>();
	for (const tag of allTags) {
		if (!isAffected(tag, from)) untouched.set(tag.toLowerCase(), tag);
	}
	const merges: [string, string][] = [];
	for (const tag of allTags) {
		const renamed = renamedTag(tag, from, to);
		const existing = renamed && untouched.get(renamed.toLowerCase());
		if (existing) merges.push([tag, existing]);
	}
	return merges;
}

/**
 * Rename tags in a note's text at the positions Obsidian found them. Returns
 * null if the text no longer matches those positions (the note changed since).
 */
export function renameInText(
	text: string,
	positions: { tag: string; start: number; end: number }[],
	from: string,
	to: string,
): string | null {
	// Work from the end so earlier offsets stay valid.
	const sorted = [...positions].sort((a, b) => b.start - a.start);
	let out = text;
	for (const { tag, start, end } of sorted) {
		if (out.slice(start, end) !== tag) return null;
		const renamed = renamedTag(tag.replace(/^#/, ''), from, to);
		if (renamed === null) continue;
		out = out.slice(0, start) + '#' + renamed + out.slice(end);
	}
	return out;
}

/** Rename one tag word, keeping a leading "#" if it had one. */
function renameWord(word: string, from: string, to: string): string {
	const hash = word.startsWith('#') ? '#' : '';
	const renamed = renamedTag(word.slice(hash.length), from, to);
	return renamed === null ? word : hash + renamed;
}

/** Rename tags in a string of tags separated by spaces or commas, keeping the separators. */
function renameInString(value: string, from: string, to: string): string {
	return value.split(/([\s,]+)/).map((part, i) => i % 2 ? part : renameWord(part, from, to)).join('');
}

/**
 * Rename tags in a frontmatter `tags` value: a list, or a string of tags.
 * Merging can make a list hold the same tag twice; the repeat is dropped.
 */
export function renameInFrontmatter(value: unknown, from: string, to: string): unknown {
	if (typeof value === 'string') return renameInString(value, from, to);
	if (!Array.isArray(value)) return value;
	const seen = new Set<string>();
	const out: unknown[] = [];
	for (const item of value) {
		if (typeof item !== 'string') {
			out.push(item);
			continue;
		}
		const renamed = renameInString(item, from, to);
		const key = renamed.replace(/^#/, '').toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(renamed);
	}
	return out;
}

/** Whether a frontmatter `tags` value contains the tag or one of its subtags. */
export function frontmatterHasTag(value: unknown, from: string): boolean {
	const words = typeof value === 'string' ? [value]
		: Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string')
		: [];
	return words.some(w => w.split(/[\s,]+/).some(word => isAffected(word.replace(/^#/, ''), from)));
}

/** Frontmatter keys Obsidian reads tags from. */
export function isTagsKey(key: string): boolean {
	return /^tags?$/i.test(key);
}
