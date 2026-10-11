// Search data and filters for the home tab. No Obsidian imports, so it's unit-testable.

export const FILE_TYPES = {
	markdown: ['md'],
	image: ['jpg', 'jpeg', 'png', 'svg', 'gif', 'bmp', 'webp', 'avif'],
	video: ['mp4', 'webm', 'ogv', 'mov', 'mkv'],
	audio: ['mp3', 'wav', 'm4a', 'ogg', '3gp', 'flac', 'webm'],
	pdf: ['pdf'],
	canvas: ['canvas'],
	base: ['base'],
} as const;

export type FileType = keyof typeof FILE_TYPES;

export const OMNISEARCH_KEYS = ['omnisearch', 'omni'];
export const WEB_KEYS = ['web', 'internet', 'surfing'];

export type SearchFilter =
	| { kind: 'type'; value: FileType }
	| { kind: 'extension'; value: string }
	| { kind: 'omnisearch' }
	| { kind: 'web' };

export interface SearchItem {
	path: string;
	basename: string;
	extension: string;
	aliases: string[];
	/** True for links to notes that don't exist yet. */
	unresolved: boolean;
}

export function fileTypeOf(extension: string): FileType | undefined {
	const ext = extension.toLowerCase();
	for (const type of Object.keys(FILE_TYPES) as FileType[]) {
		if ((FILE_TYPES[type] as readonly string[]).includes(ext)) return type;
	}
	return undefined;
}

/**
 * Turn what the user typed before pressing Tab into a filter. `knownExtensions`
 * lets any extension in the vault work, not only the built-in list.
 */
export function parseFilter(input: string, knownExtensions: Iterable<string> = []): SearchFilter | null {
	const key = input.trim().toLowerCase().replace(/^\./, '');
	if (!key) return null;
	if (OMNISEARCH_KEYS.includes(key)) return { kind: 'omnisearch' };
	if (WEB_KEYS.includes(key)) return { kind: 'web' };
	if (key in FILE_TYPES) return { kind: 'type', value: key as FileType };
	if (key === 'md') return { kind: 'type', value: 'markdown' };
	const extensions = new Set<string>([...Object.values(FILE_TYPES).flat(), ...knownExtensions]);
	if (extensions.has(key)) return { kind: 'extension', value: key };
	return null;
}

export function filterLabel(filter: SearchFilter): string {
	switch (filter.kind) {
		case 'type': return filter.value;
		case 'extension': return `.${filter.value}`;
		case 'omnisearch': return 'Omnisearch';
		case 'web': return 'Web';
	}
}

export function matchesFilter(item: SearchItem, filter: SearchFilter | null, markdownOnly: boolean): boolean {
	if (!filter) return !markdownOnly || item.extension === 'md';
	if (filter.kind === 'type') return fileTypeOf(item.extension) === filter.value;
	if (filter.kind === 'extension') return item.extension.toLowerCase() === filter.value;
	return false;
}

/** Whether a "create note" row makes sense for this filter. */
export function canCreateWith(filter: SearchFilter | null): boolean {
	return !filter || (filter.kind === 'type' && filter.value === 'markdown');
}

/** Parent folder name for display, or '/' for the vault root. */
export function parentFolderName(path: string): string {
	const parts = path.split('/');
	return parts.length > 1 ? parts[parts.length - 2] : '/';
}

/** Parse the options of a home search code block. */
export function parseCodeBlockOptions(source: string): { searchOnly: boolean; recentFiles: boolean; bookmarks: boolean } {
	const lines = source.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
	return {
		searchOnly: lines.includes('only search bar'),
		recentFiles: lines.includes('show recent files'),
		bookmarks: lines.includes('show bookmarked files') || lines.includes('show bookmarks'),
	};
}

/** Where a file type goes among files with the same name: notes, then bases, then everything else. */
export function typeRank(extension: string): number {
	const ext = extension.toLowerCase();
	if (ext === 'md') return 0;
	if (ext === 'base') return 1;
	return 2;
}

/**
 * Order search results best match first. Files that share a name stay together,
 * at the place of the best-matching one, ordered .md, .base, then other types.
 */
export function orderResults<T extends { score: number; item: Pick<SearchItem, 'basename' | 'extension'> }>(results: T[]): T[] {
	const byScore = [...results].sort((a, b) => b.score - a.score);
	const groups = new Map<string, T[]>();
	for (const result of byScore) {
		const key = result.item.basename.toLowerCase();
		const group = groups.get(key);
		if (group) group.push(result);
		else groups.set(key, [result]);
	}
	return [...groups.values()].flatMap(group =>
		group.sort((a, b) => typeRank(a.item.extension) - typeRank(b.item.extension) || b.score - a.score));
}

/** Add `path` to the front of a recent files list, without duplicates, capped at `max`. */
export function pushRecent(list: string[], path: string, max: number): string[] {
	return [path, ...list.filter(p => p !== path)].slice(0, Math.max(0, max));
}
