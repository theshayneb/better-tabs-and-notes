// Which icon goes before a link to a file of a given type; no Obsidian imports so it can be unit-tested.

export interface LinkIconRule {
	/** File extensions, comma- or space-separated, without dots: "png, jpg". */
	extensions: string;
	/** An emoji/text, or "lucide:name" for an Obsidian icon. */
	icon: string;
}

export const DEFAULT_LINK_ICON_RULES: LinkIconRule[] = [
	{ extensions: 'pdf', icon: 'lucide:file-text' },
	{ extensions: 'png, jpg, jpeg, gif, webp, svg, bmp, avif, heic', icon: 'lucide:image' },
	{ extensions: 'mp3, wav, m4a, ogg, flac, 3gp, opus', icon: 'lucide:file-audio' },
	{ extensions: 'mp4, webm, mov, mkv, ogv', icon: 'lucide:file-video' },
	{ extensions: 'epub', icon: 'lucide:book-open' },
	{ extensions: 'canvas', icon: 'lucide:layout-dashboard' },
	{ extensions: 'base', icon: 'lucide:table' },
	{ extensions: 'docx, doc, odt, rtf', icon: 'lucide:file-type' },
	{ extensions: 'xlsx, xls, csv, ods', icon: 'lucide:file-spreadsheet' },
	{ extensions: 'zip, 7z, rar, gz', icon: 'lucide:file-archive' },
];

/** The extensions a rule lists, lower case, without dots. */
export function ruleExtensions(rule: LinkIconRule): string[] {
	return rule.extensions.split(/[\s,;]+/).map(e => e.trim().replace(/^\.+/, '').toLowerCase()).filter(Boolean);
}

/**
 * The file extension a link points at, lower case, or null for a note or a
 * link without one. Handles `file.pdf#page=3`, `file.pdf|alias`, folders and
 * percent-encoded markdown link targets.
 */
export function linkExtension(link: string): string | null {
	let target = link.split('|')[0].split('#')[0].trim();
	try {
		target = decodeURIComponent(target);
	} catch {
		// Not encoded; use it as it is.
	}
	const name = target.split('/').pop() ?? '';
	const dot = name.lastIndexOf('.');
	if (dot <= 0 || dot === name.length - 1) return null;
	const extension = name.slice(dot + 1).toLowerCase();
	// Notes are the normal case; they get no icon.
	if (extension === 'md') return null;
	// "Mr. Smith" or "v1.2" aren't file types: an extension is short and has a letter.
	return /^[a-z0-9]{1,8}$/.test(extension) && /[a-z]/.test(extension) ? extension : null;
}

/** The icon for a link, or null if no rule covers its file type. The first matching rule wins. */
export function iconForLink(link: string, rules: LinkIconRule[]): string | null {
	const extension = linkExtension(link);
	if (!extension) return null;
	for (const rule of rules) {
		if (rule.icon && ruleExtensions(rule).includes(extension)) return rule.icon;
	}
	return null;
}

/** Stored rules cleaned up, falling back to the defaults if there are none at all. */
export function cleanRules(raw: unknown): LinkIconRule[] {
	if (!Array.isArray(raw)) return structuredClone(DEFAULT_LINK_ICON_RULES);
	return raw
		.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
		.map(r => ({ extensions: typeof r.extensions === 'string' ? r.extensions : '', icon: typeof r.icon === 'string' ? r.icon : '' }));
}

export interface FoundLink {
	/** Offset of the opening `[[` in the text. */
	from: number;
	/** The link target, without alias. */
	target: string;
}

/** Wikilinks in a piece of text (embeds, `![[...]]`, skipped: they show the file itself). */
export function findWikilinks(text: string): FoundLink[] {
	const links: FoundLink[] = [];
	for (const m of text.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
		if (m.index > 0 && text[m.index - 1] === '!') continue;
		links.push({ from: m.index, target: m[1].split('|')[0].trim() });
	}
	return links;
}
