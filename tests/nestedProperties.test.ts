import { describe, expect, it } from 'vitest';
import {
	convertValue, fieldTypeKeyFor, isComplexValue, isLossyConversion, isSimpleArray, summarize, typeKeyFor,
} from '../src/features/nestedProperties/nestedValues';

describe('nested properties: values', () => {
	it('tells nested values from plain ones', () => {
		expect(isComplexValue({ a: 1 })).toBe(true);
		expect(isComplexValue([1])).toBe(true);
		expect(isComplexValue('x')).toBe(false);
		expect(isComplexValue(null)).toBe(false);
		expect(isSimpleArray(['a', 2, true])).toBe(true);
		expect(isSimpleArray(['a', { b: 1 }])).toBe(false);
	});

	it('summarizes collapsed values on one line', () => {
		expect(summarize({ author: 'Le Guin', year: 1974, tags: ['a'], meta: { x: 1 } }))
			.toBe('{ author: Le Guin, year: 1974, tags: [ ... ], meta: { ... } }');
		expect(summarize([])).toBe('[]');
		expect(summarize(['a', null])).toBe('[ a,  ]');
		expect(summarize({ long: 'x'.repeat(200) }).length).toBeLessThan(140);
	});

	it('converts between types', () => {
		expect(convertValue('text', 3)).toBe('3');
		expect(convertValue('number', '4')).toBe(4);
		expect(convertValue('number', 'nope')).toBe(0);
		expect(convertValue('checkbox', 'yes')).toBe(true);
		expect(convertValue('multitext', 'one')).toEqual(['one']);
		expect(convertValue('multitext', ['a', { b: 1 }])).toEqual(['a']);
		expect(convertValue('date', '2026-11-07')).toBe('2026-11-07');
		expect(convertValue('date', 'soon')).toBeNull();
		expect(convertValue('list', 'x')).toEqual(['x']);
		expect(convertValue('object', 'x')).toEqual({});
		expect(convertValue('object', { a: 1 })).toEqual({ a: 1 });
	});

	it('warns before conversions that lose data', () => {
		expect(isLossyConversion('object', 'text')).toBe(true);
		expect(isLossyConversion('object', '')).toBe(false);
		expect(isLossyConversion('text', { a: 1 })).toBe(true);
		expect(isLossyConversion('multitext', ['a', 'b'])).toBe(false);
		expect(isLossyConversion('multitext', [{ a: 1 }])).toBe(true);
		expect(isLossyConversion('number', 'x')).toBe(false);
	});

	it('builds type keys', () => {
		expect(typeKeyFor(['book', 'author'])).toBe('book.author');
		expect(fieldTypeKeyFor(['versions', '0', 'released'])).toBe('versions.released');
		expect(fieldTypeKeyFor(['versions', '0'])).toBeNull();
	});
});
