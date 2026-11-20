// Task sweeper: move completed top-level tasks (with everything indented under
// them) to a "## Done" section at the bottom of the note, dated. No Obsidian
// imports, so it can be unit-tested.
// Ported from Task Sweeper by Bryan Hogan (0BSD); see NOTICE.md.

export const DONE_HEADING = '## Done';

const DONE_HEADING_PATTERN = /^## Done\s*$/;
// [x] and [X] are done, and so is [0] (the owner's own status for done).
const COMPLETED_TASK_PATTERN = /^[-*+] \[[xX0]\].*$/;
const OPEN_TASK_PATTERN = /^[-*+] \[ \].*$/;
const INDENTED_LINE_PATTERN = /^[ \t]/;
export const BLOCK_ID_PATTERN = /\s+\^[A-Za-z0-9-]+$/;
export const COMPLETION_DATE_PATTERN = /\s+\(\d{4}-\d{2}-\d{2}\)$/;

const FENCE_OPEN_PATTERN = /^ {0,3}(?:(`{3,})[^`]*$|(~{3,}))/;
const FRONTMATTER_OPEN_PATTERN = /^---\s*$/;
const FRONTMATTER_CLOSE_PATTERN = /^(---|\.\.\.)\s*$/;
const SECTION_HEADING_PATTERN = /^#{1,2}(\s|$)/;

export interface SweepResult {
	content: string;
	didChange: boolean;
	/** Completed tasks moved down from the rest of the note. */
	movedCount: number;
	/** Completed tasks in the note, moved or already in the Done section. */
	totalCompletedCount: number;
	skippedReason?: 'unclosed-code-fence';
}

/** A top-level task that went from open to done (only lines an edit touched are compared). */
export function isCompletionToggle(oldLine: string, newLine: string): boolean {
	return OPEN_TASK_PATTERN.test(oldLine) && COMPLETED_TASK_PATTERN.test(newLine);
}

/** Today as YYYY-MM-DD, in local time. */
export function today(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function sweepCompletedTasks(content: string, completedDate = today()): SweepResult {
	const newline = content.match(/\r\n|\n/)?.[0] ?? '\n';
	const normalized = content.replace(/\r\n/g, '\n');
	const trailingNewline = normalized.endsWith('\n');
	const body = trailingNewline ? normalized.slice(0, -1) : normalized;
	const lines = body.length > 0 ? body.split('\n') : [];
	const protectedLines = findProtectedLines(lines);
	if (protectedLines === null) {
		return { content, didChange: false, movedCount: 0, totalCompletedCount: 0, skippedReason: 'unclosed-code-fence' };
	}

	// The managed section always runs to the end of the note.
	const headingIndex = findManagedHeading(lines, protectedLines);
	const outsideEnd = headingIndex === -1 ? lines.length : headingIndex;
	const managedStart = headingIndex === -1 ? lines.length : headingIndex + 1;

	const outside = extractCompletedBlocks(lines.slice(0, outsideEnd), protectedLines.slice(0, outsideEnd));
	const managed = extractCompletedBlocks(lines.slice(managedStart), protectedLines.slice(managedStart));
	const blocks = [...outside.blocks, ...managed.blocks].map(block => annotateBlock(block, completedDate));
	const completed = blocks.flat();
	if (completed.length === 0) return { content, didChange: false, movedCount: 0, totalCompletedCount: 0 };

	const next = joinLines(rebuild(outside.keptLines, managed.keptLines, completed), newline, trailingNewline);
	return {
		content: next,
		didChange: next !== content,
		movedCount: next === content ? 0 : outside.blocks.length,
		totalCompletedCount: blocks.length,
	};
}

/**
 * Splits lines into completed top-level task blocks and everything else. A
 * block is a completed top-level task plus all following indented lines
 * (subtasks, notes, code); blank lines inside it are kept only when more
 * indented lines follow.
 */
function extractCompletedBlocks(lines: string[], protectedLines: boolean[]): { keptLines: string[]; blocks: string[][] } {
	const keptLines: string[] = [];
	const blocks: string[][] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (protectedLines[index] || !COMPLETED_TASK_PATTERN.test(line)) {
			keptLines.push(line);
			index++;
			continue;
		}
		const end = findBlockEnd(lines, index);
		blocks.push(lines.slice(index, end));
		index = end;
		// Don't leave a doubled blank gap (or a leading blank line) where the block was.
		const previousIsGap = keptLines.length === 0 || keptLines[keptLines.length - 1] === '';
		if (previousIsGap && lines[index] === '') index++;
	}
	return { keptLines, blocks };
}

function findBlockEnd(lines: string[], start: number): number {
	let end = start + 1;
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (line.trim() === '') continue;
		if (!INDENTED_LINE_PATTERN.test(line)) break;
		end = i + 1;
	}
	return end;
}

function annotateBlock(block: string[], completedDate: string): string[] {
	const [first, ...rest] = block;
	return first === undefined ? block : [appendCompletionDate(first, completedDate), ...rest];
}

/** Add " (YYYY-MM-DD)" unless there's one already, keeping a block id (^abc) at the very end. */
function appendCompletionDate(line: string, completedDate: string): string {
	const trimmed = line.trimEnd();
	const blockId = trimmed.match(BLOCK_ID_PATTERN)?.[0] ?? '';
	const body = blockId ? trimmed.slice(0, -blockId.length) : trimmed;
	if (COMPLETION_DATE_PATTERN.test(body)) return trimmed;
	return `${body} (${completedDate})${blockId}`;
}

function rebuild(keptLines: string[], managedLines: string[], completed: string[]): string[] {
	const result = [...keptLines];
	trimTrailingBlanks(result);
	if (result.length > 0) result.push('');
	result.push(DONE_HEADING, '');
	const managed = trimBlankEdges(managedLines);
	if (managed.length > 0) result.push(...managed, '');
	result.push(...completed);
	return result;
}

function joinLines(lines: string[], newline: string, trailingNewline: boolean): string {
	if (lines.length === 0) return '';
	const joined = lines.join(newline);
	return trailingNewline ? `${joined}${newline}` : joined;
}

function trimTrailingBlanks(lines: string[]): void {
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
}

function trimBlankEdges(lines: string[]): string[] {
	const trimmed = [...lines];
	while (trimmed.length > 0 && trimmed[0] === '') trimmed.shift();
	trimTrailingBlanks(trimmed);
	return trimmed;
}

// ---------------------------------------------------------------------------
// Note structure
// ---------------------------------------------------------------------------

/**
 * Lines that must never be treated as tasks or headings: YAML frontmatter and
 * top-level fenced code blocks (fence lines included). Null if a fence is unclosed.
 */
export function findProtectedLines(lines: string[]): boolean[] | null {
	const result = new Array<boolean>(lines.length).fill(false);
	let index = markFrontmatter(lines, result);
	while (index < lines.length) {
		const opening = (lines[index] ?? '').match(FENCE_OPEN_PATTERN);
		const fence = opening?.[1] ?? opening?.[2];
		if (fence === undefined) {
			index++;
			continue;
		}
		const close = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
		let end = index + 1;
		while (end < lines.length && !close.test(lines[end] ?? '')) end++;
		if (end === lines.length) return null;
		for (let i = index; i <= end; i++) result[i] = true;
		index = end + 1;
	}
	return result;
}

function markFrontmatter(lines: string[], result: boolean[]): number {
	if (!FRONTMATTER_OPEN_PATTERN.test(lines[0] ?? '')) return 0;
	for (let i = 1; i < lines.length; i++) {
		if (FRONTMATTER_CLOSE_PATTERN.test(lines[i] ?? '')) {
			for (let j = 0; j <= i; j++) result[j] = true;
			return i + 1;
		}
	}
	// No closing delimiter: not frontmatter.
	return 0;
}

/**
 * The managed Done heading: the last "## Done" not followed by any other level
 * 1 or 2 heading, or -1. A Done heading followed by other sections is the
 * user's own and is left alone.
 */
export function findManagedHeading(lines: string[], protectedLines: boolean[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (protectedLines[i]) continue;
		const line = lines[i] ?? '';
		if (DONE_HEADING_PATTERN.test(line)) return i;
		if (SECTION_HEADING_PATTERN.test(line)) return -1;
	}
	return -1;
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export type SweepScope = 'global' | 'selective';

export interface SweepScopeSettings {
	scope: SweepScope;
	includedFiles: string[];
	includedFolders: string[];
}

/** A vault path as typed: forward slashes, no leading or trailing slashes. Null if empty. */
export function cleanPath(path: string): string | null {
	const trimmed = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	return trimmed || null;
}

/** One path per line, cleaned, without repeats. */
export function parsePathList(value: string | string[]): string[] {
	const lines = Array.isArray(value) ? value : value.split(/\r?\n/);
	return [...new Set(lines.map(p => cleanPath(String(p))).filter((p): p is string => p !== null))];
}

export function isInScope(filePath: string, settings: SweepScopeSettings): boolean {
	if (settings.scope !== 'selective') return true;
	const path = cleanPath(filePath);
	if (!path) return false;
	return settings.includedFiles.includes(path) || settings.includedFolders.some(folder => path.startsWith(`${folder}/`));
}

/** The files list with `filePath` added, or null if it's already covered by a file or folder. */
export function addIncludedFile(settings: SweepScopeSettings, filePath: string): string[] | null {
	const path = cleanPath(filePath);
	if (!path || isInScope(path, { ...settings, scope: 'selective' })) return null;
	return [...settings.includedFiles, path];
}
