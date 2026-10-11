// Pure helpers for the frontmatter cleaner; no Obsidian imports so they can be unit-tested.
// From Frontmatter Cleaner by sharfaroz (MIT); see NOTICE.md.

export type RecordFormat = 'table' | 'colon' | 'dataview';
export type RecordLocation = 'top' | 'bottom' | 'heading';

export interface RemovedProperty {
	key: string;
	value: unknown;
}

/** Text for a single value: strings as they are, everything else as JSON. */
function text(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value) ?? '';
}

/** Blank strings, null, and empty lists or objects. */
export function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim().length === 0;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value).length === 0;
	return false;
}

/** Short text for a property value in the cleaner's list. */
export function formatValue(value: unknown): string {
	if (value === null || value === undefined) return '(empty)';
	if (Array.isArray(value)) {
		if (value.length === 0) return '(empty list)';
		return value.map(text).join(', ');
	}
	if (typeof value === 'object') return Object.keys(value).length === 0 ? '(empty)' : JSON.stringify(value);
	const str = text(value);
	if (str.trim().length === 0) return '(empty)';
	return str.length > 60 ? `${str.slice(0, 57)}...` : str;
}

function serializeValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(text).join(', ');
	return text(value);
}

function escapeTableCell(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The record of removed properties, in the chosen format. */
export function buildRecordBlock(records: RemovedProperty[], format: RecordFormat): string {
	switch (format) {
		case 'table':
			return [
				'| Property | Value |',
				'| --- | --- |',
				...records.map(r => `| ${escapeTableCell(r.key)} | ${escapeTableCell(serializeValue(r.value))} |`),
			].join('\n');
		case 'colon':
			return records.map(r => `${r.key}: ${serializeValue(r.value)}`).join('\n');
		case 'dataview':
			return records.map(r => `${r.key}:: ${serializeValue(r.value)}`).join('\n');
	}
}

/** Note content with the record block inserted at the chosen place. */
export function insertRecord(
	content: string, block: string, location: RecordLocation, heading: { text: string; level: number },
): string {
	switch (location) {
		case 'top': {
			const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
			const at = fm ? fm[0].length : 0;
			return `${content.slice(0, at)}${block}\n\n${content.slice(at)}`;
		}
		case 'bottom':
			return `${content.replace(/\s+$/, '')}\n\n${block}\n`;
		case 'heading': {
			const prefix = '#'.repeat(heading.level);
			const match = new RegExp(`^${prefix}\\s+${escapeRegExp(heading.text)}\\s*$`, 'm').exec(content);
			if (match) {
				const at = match.index + match[0].length;
				return `${content.slice(0, at)}\n\n${block}${content.slice(at)}`;
			}
			return `${content.replace(/\s+$/, '')}\n\n${prefix} ${heading.text}\n\n${block}\n`;
		}
	}
}
