// Helpers for hiding commands from the command palette; no Obsidian imports so they can be unit-tested.
// The approach comes from Command Block List by Ryota Ushio (MIT); see NOTICE.md.

export interface CommandInfo {
	id: string;
	/** As the palette shows it, e.g. "Better Tabs and Notes: Scroll to top". */
	name: string;
}

export type HideScope = 'palette' | 'everywhere';

/** Keep only what the palette (or a command list) should show. Items may be commands or fuzzy matches of commands. */
export function withoutHidden<T>(items: T[], hidden: ReadonlySet<string>): T[] {
	if (hidden.size === 0 || !Array.isArray(items)) return items;
	return items.filter(item => {
		const id = commandIdOf(item);
		return id === undefined || !hidden.has(id);
	});
}

/** The command ID of a command, or of a search result holding one in `item`. */
export function commandIdOf(item: unknown): string | undefined {
	if (!item || typeof item !== 'object') return undefined;
	const record = item as { id?: unknown; item?: unknown };
	if (typeof record.id === 'string') return record.id;
	const inner = record.item as { id?: unknown } | undefined;
	return inner && typeof inner.id === 'string' ? inner.id : undefined;
}

/** Stored IDs cleaned up: strings only, no blanks or repeats, order kept. */
export function cleanIds(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	for (const id of raw) {
		if (typeof id === 'string' && id.trim()) seen.add(id.trim());
	}
	return [...seen];
}

const normalize = (name: string) => name.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

export interface NameMatch {
	/** IDs of the commands found, in the order of the lines. */
	ids: string[];
	/** Lines that matched no command, as typed. */
	notFound: string[];
}

/**
 * Turn pasted lines ("Plugin: Command name", as the palette shows them) into
 * command IDs. Matching ignores case and extra spaces but is otherwise exact.
 * A line that is already a command ID also works. Blank lines are skipped.
 */
export function matchNames(text: string, commands: CommandInfo[]): NameMatch {
	const byName = new Map<string, string[]>();
	const ids = new Set(commands.map(c => c.id));
	for (const command of commands) {
		const key = normalize(command.name);
		byName.set(key, [...(byName.get(key) ?? []), command.id]);
	}
	const found = new Set<string>();
	const notFound: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const matches = byName.get(normalize(trimmed)) ?? (ids.has(trimmed) ? [trimmed] : []);
		if (matches.length === 0) notFound.push(trimmed);
		for (const id of matches) found.add(id);
	}
	return { ids: [...found], notFound };
}

/** Add IDs to the hidden list, without repeats. */
export function addHidden(list: string[], ids: string[]): string[] {
	return cleanIds([...list, ...ids]);
}

export type CommandFilter = 'all' | 'visible' | 'hidden';

/**
 * Commands matching a search, sorted by name. Every word of the query must
 * appear in the name or the ID, in any order.
 */
export function searchCommands(commands: CommandInfo[], query: string, hidden: ReadonlySet<string>, filter: CommandFilter): CommandInfo[] {
	const words = normalize(query).split(' ').filter(Boolean);
	return commands
		.filter(c => filter === 'all' || (filter === 'hidden') === hidden.has(c.id))
		.filter(c => {
			const haystack = `${normalize(c.name)} ${c.id.toLowerCase()}`;
			return words.every(w => haystack.includes(w));
		})
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export interface HiddenEntry {
	id: string;
	/** Null when no loaded plugin has this command right now. */
	name: string | null;
}

/** The hidden list for display: loaded commands by name, then the ones not loaded by ID. */
export function describeHidden(hiddenIds: string[], commands: CommandInfo[]): HiddenEntry[] {
	const names = new Map(commands.map(c => [c.id, c.name]));
	const entries = hiddenIds.map(id => ({ id, name: names.get(id) ?? null }));
	return entries.sort((a, b) => {
		if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
		return (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' });
	});
}
