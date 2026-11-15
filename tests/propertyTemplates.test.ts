import { describe, expect, it } from 'vitest';
import {
	choicesFor, insertMissing, isSorted, missingProperties, sortProperties, templateFor, templateValue,
	type TemplateRule,
} from '../src/features/propertyTemplates/templateLogic';

const book = { basename: 'Dune', path: 'Books/Dune.md', tags: ['scifi'] };
const rules: TemplateRule[] = [
	{ type: 'folder', match: 'Books', properties: [{ name: 'author', value: '' }, { name: 'status', value: 'to read' }, { name: 'rating', value: '' }] },
	{ type: 'tag', match: 'scifi', properties: [{ name: 'Status', value: 'x' }, { name: 'subgenre', value: 'space' }] },
	{ type: 'folder', match: 'Projects', properties: [{ name: 'due', value: '' }] },
];
const names = (fm: Record<string, unknown>) => Object.keys(fm);

describe('property templates: rules', () => {
	it('combines matching rules, first rule first, without duplicates', () => {
		expect(templateFor(rules, book)).toEqual([
			{ name: 'author', value: '' }, { name: 'status', value: 'to read' }, { name: 'rating', value: '' }, { name: 'subgenre', value: 'space' },
		]);
		expect(templateFor(rules, { basename: 'x', path: 'Other/x.md', tags: [] })).toEqual([]);
	});
});

describe('property templates: inserting', () => {
	const template = templateFor(rules, book);
	const value = (p: { value: string }) => p.value || null;

	it('adds missing properties in template order, never touching existing ones', () => {
		const fm: Record<string, unknown> = { title: 'Dune', Status: '', rating: 5 };
		expect(missingProperties(fm, template).map(p => p.name)).toEqual(['author', 'subgenre']);
		expect(insertMissing(fm, template, value)).toBe(2);
		// author goes before Status (the next template property the note has); subgenre after rating.
		expect(names(fm)).toEqual(['title', 'author', 'Status', 'rating', 'subgenre']);
		expect(fm).toMatchObject({ title: 'Dune', author: null, Status: '', rating: 5, subgenre: 'space' });
		expect(insertMissing(fm, template, value)).toBe(0);
	});

	it('fills an empty note in template order', () => {
		const fm: Record<string, unknown> = {};
		insertMissing(fm, template, value);
		expect(names(fm)).toEqual(['author', 'status', 'rating', 'subgenre']);
		expect(fm.status).toBe('to read');
	});
});

describe('property templates: sorting', () => {
	const template = templateFor(rules, book);

	it('puts template properties first and keeps the rest in their order', () => {
		const fm: Record<string, unknown> = { title: 'Dune', rating: 5, tags: ['a'], author: 'Herbert', cover: 'x.png' };
		expect(isSorted(fm, template)).toBe(false);
		expect(sortProperties(fm, template)).toBe(true);
		expect(names(fm)).toEqual(['author', 'rating', 'title', 'tags', 'cover']);
		expect(fm.author).toBe('Herbert');
		expect(isSorted(fm, template)).toBe(true);
		expect(sortProperties(fm, template)).toBe(false);
	});

	it('ignores Obsidian\'s position entry', () => {
		expect(isSorted({ author: 'a', status: 'b', position: {} }, template)).toBe(true);
	});
});

describe('property templates: values', () => {
	it('lists the choices for a property, regardless of case', () => {
		const choices = [{ property: 'Status', options: 'to read, reading, done, , reading' }];
		expect(choicesFor(choices, 'status')).toEqual(['to read', 'reading', 'done']);
		expect(choicesFor(choices, 'other')).toEqual([]);
	});

	it('converts default values for the property type', () => {
		expect(templateValue('', 'text')).toBeNull();
		expect(templateValue('to read', 'text')).toBe('to read');
		expect(templateValue('a, b', 'text')).toBe('a, b');
		expect(templateValue('a, b', 'multitext')).toEqual(['a', 'b']);
		expect(templateValue('', 'tags')).toBeNull();
		expect(templateValue('4', 'number')).toBe(4);
		expect(templateValue('yes', 'checkbox')).toBe(true);
		expect(templateValue('', 'checkbox')).toBe(false);
	});
});
