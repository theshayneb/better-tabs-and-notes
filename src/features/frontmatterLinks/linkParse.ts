// Find links inside property values; no Obsidian imports so it can be unit-tested.
// Based on Frontmatter Markdown Links by Michael Naumov (MIT); see NOTICE.md.

export interface ParsedLink {
	/** Offsets of the whole link in the value. */
	start: number;
	end: number;
	/** The link as written, e.g. `[[Note|alias]]` or `[text](Note.md)`. */
	raw: string;
	/** Where it points: a note name or path (with any #heading), or a URL. */
	target: string;
	/** The text to show. */
	display: string;
	isExternal: boolean;
	isEmbed: boolean;
	isWikilink: boolean;
}

const WIKILINK = /(!?)\[\[([^\]\n]+?)\]\]/g;
// [text](<path with spaces.md>), [text](path%20encoded.md "title")
const MARKDOWN_LINK = /(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+"[^"\n]*")?\s*\)/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function decode(text: string): string {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

/** Every wikilink and markdown link in the text, in order. */
export function parseLinks(text: string): ParsedLink[] {
	const links: ParsedLink[] = [];
	for (const m of text.matchAll(WIKILINK)) {
		const [raw, bang, inner] = m;
		const bar = inner.indexOf('|');
		const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
		if (!target) continue;
		const alias = bar === -1 ? '' : inner.slice(bar + 1).trim();
		links.push({
			start: m.index, end: m.index + raw.length, raw, target,
			display: alias || target,
			isExternal: false, isEmbed: bang === '!', isWikilink: true,
		});
	}
	for (const m of text.matchAll(MARKDOWN_LINK)) {
		const [raw, bang, label, dest] = m;
		const start = m.index;
		// Skip a markdown link that sits inside a wikilink.
		if (links.some(l => start < l.end && start + raw.length > l.start)) continue;
		const url = dest.startsWith('<') ? dest.slice(1, -1).trim() : dest;
		if (!url) continue;
		const isExternal = URL_SCHEME.test(url);
		const target = isExternal ? url : decode(url);
		links.push({
			start, end: start + raw.length, raw, target,
			display: label.trim() || target,
			isExternal, isEmbed: bang === '!', isWikilink: false,
		});
	}
	return links.sort((a, b) => a.start - b.start);
}

/**
 * The links Obsidian doesn't handle itself: those in a value that is more than
 * one bare link (several links, or a link with other text around it). Obsidian
 * already treats a value that is exactly one link as a link. Empty if none.
 */
export function extraLinks(value: string): ParsedLink[] {
	const links = parseLinks(value);
	if (links.length === 0) return [];
	if (links.length === 1 && links[0].raw === value.trim()) return [];
	return links;
}

export interface LinkedValue {
	/** Property path as Obsidian writes it: `related`, `related.1`, `parent.child`. */
	key: string;
	value: string;
	links: ParsedLink[];
}

/** Every string in the frontmatter (at any depth) that holds links Obsidian doesn't handle. */
export function findLinkedValues(frontmatter: unknown): LinkedValue[] {
	const found: LinkedValue[] = [];
	const visit = (value: unknown, key: string) => {
		if (typeof value === 'string') {
			const links = extraLinks(value);
			if (links.length) found.push({ key, value, links });
		} else if (Array.isArray(value)) {
			value.forEach((item, i) => visit(item, `${key}.${i}`));
		} else if (value && typeof value === 'object') {
			for (const [k, v] of Object.entries(value)) visit(v, key ? `${key}.${k}` : k);
		}
	};
	if (frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
		for (const [k, v] of Object.entries(frontmatter)) {
			if (k !== 'position') visit(v, k);
		}
	}
	return found;
}

/** The entry for Obsidian's link cache for one internal link. */
export function toLinkCache(key: string, link: ParsedLink): { key: string; link: string; original: string; displayText?: string } {
	const entry: { key: string; link: string; original: string; displayText?: string } = { key, link: link.target, original: link.raw };
	if (link.display !== link.target) entry.displayText = link.display;
	return entry;
}
