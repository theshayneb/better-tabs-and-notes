import { describe, expect, it } from 'vitest';
import { buildRecordBlock, formatValue, insertRecord, isEmptyValue } from '../src/features/frontmatterCleaner/cleanerLogic';

describe('frontmatter cleaner', () => {
	it('recognises empty values', () => {
		for (const v of [null, undefined, '', '  ', [], {}]) expect(isEmptyValue(v)).toBe(true);
		for (const v of [0, false, 'x', ['a'], { a: 1 }]) expect(isEmptyValue(v)).toBe(false);
	});

	it('formats values for the list', () => {
		expect(formatValue(null)).toBe('(empty)');
		expect(formatValue([])).toBe('(empty list)');
		expect(formatValue(['a', 'b'])).toBe('a, b');
		expect(formatValue('x'.repeat(70))).toHaveLength(60);
	});

	it('builds records', () => {
		const removed = [{ key: 'a', value: 'x|y' }, { key: 'b', value: null }];
		expect(buildRecordBlock(removed, 'colon')).toBe('a: x|y\nb: ');
		expect(buildRecordBlock(removed, 'dataview')).toBe('a:: x|y\nb:: ');
		expect(buildRecordBlock(removed, 'table')).toBe('| Property | Value |\n| --- | --- |\n| a | x\\|y |\n| b |  |');
	});

	it('inserts records at the chosen place', () => {
		const note = '---\ntitle: x\n---\nBody\n';
		const heading = { text: 'Removed', level: 2 };
		expect(insertRecord(note, 'R', 'top', heading)).toBe('---\ntitle: x\n---\nR\n\nBody\n');
		expect(insertRecord(note, 'R', 'bottom', heading)).toBe('---\ntitle: x\n---\nBody\n\nR\n');
		expect(insertRecord(note, 'R', 'heading', heading)).toBe('---\ntitle: x\n---\nBody\n\n## Removed\n\nR\n');
		expect(insertRecord('Body\n## Removed\nold', 'R', 'heading', heading)).toBe('Body\n## Removed\n\nR\nold');
	});
});
