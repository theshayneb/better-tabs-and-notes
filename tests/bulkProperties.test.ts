import { describe, expect, it } from 'vitest';
import { applyProperties, cleanTag, countProperties, parseValue, removeProperties } from '../src/features/bulkProperties/bulkLogic';

const noType = () => undefined;

describe('bulk properties: parsing', () => {
	it('parses values by type', () => {
		expect(parseValue('status', 'text', 'done', ',')).toBe('done');
		expect(parseValue('status', 'text', '  ', ',')).toBeNull();
		expect(parseValue('topics', 'text', 'a, b,,c', ',')).toEqual(['a', 'b', 'c']);
		expect(parseValue('count', 'number', '3', ',')).toBe(3);
		expect(parseValue('done', 'checkbox', true, ',')).toBe(true);
		expect(parseValue('due', 'date', '2026-10-11', ',')).toBe('2026-10-11');
	});

	it('cleans tags', () => {
		expect(cleanTag('my tag!')).toBe('mytag');
		expect(parseValue('tags', 'text', 'a b, c?', ',')).toEqual(['ab', 'c']);
	});
});

describe('bulk properties: applying', () => {
	it('adds missing properties in every mode', () => {
		for (const mode of ['ignore', 'overwrite', 'append'] as const) {
			const fm: Record<string, unknown> = {};
			applyProperties(fm, [{ name: 'status', type: 'text', value: 'done' }], mode, noType);
			expect(fm.status).toBe('done');
		}
	});

	it('treats empty existing properties as missing', () => {
		const fm: Record<string, unknown> = { status: null, list: [] };
		applyProperties(fm, [
			{ name: 'status', type: 'text', value: 'done' },
			{ name: 'list', type: 'text', value: ['a'] },
		], 'ignore', noType);
		expect(fm).toEqual({ status: 'done', list: ['a'] });
	});

	it('skips, overwrites or appends existing values', () => {
		const prop = { name: 'topics', type: 'text' as const, value: ['b', 'c'] };
		const skip: Record<string, unknown> = { topics: ['a', 'b'] };
		applyProperties(skip, [prop], 'ignore', noType);
		expect(skip.topics).toEqual(['a', 'b']);

		const over: Record<string, unknown> = { topics: ['a', 'b'] };
		applyProperties(over, [prop], 'overwrite', noType);
		expect(over.topics).toEqual(['b', 'c']);

		const append: Record<string, unknown> = { topics: ['a', 'b'] };
		applyProperties(append, [prop], 'append', noType);
		expect(append.topics).toEqual(['a', 'b', 'c']);
	});

	it("doesn't append to numbers, dates or checkboxes", () => {
		const fm: Record<string, unknown> = { count: 1 };
		applyProperties(fm, [{ name: 'count', type: 'text', value: '2' }], 'append', () => 'number');
		expect(fm.count).toBe(1);
	});

	it('always stores tags as a list', () => {
		const fm: Record<string, unknown> = {};
		applyProperties(fm, [{ name: 'tags', type: 'text', value: 'project' }], 'ignore', noType);
		expect(fm.tags).toEqual(['project']);
	});
});

describe('bulk properties: removing and counting', () => {
	it('removes only existing properties', () => {
		const fm: Record<string, unknown> = { a: 1, b: 2 };
		expect(removeProperties(fm, ['a', 'c'])).toBe(1);
		expect(fm).toEqual({ b: 2 });
	});

	it('counts properties across notes', () => {
		expect(countProperties([{ b: 1, a: 1 }, { a: 2 }, undefined, { position: {} }]))
			.toEqual([{ name: 'a', count: 2 }, { name: 'b', count: 1 }]);
	});
});
