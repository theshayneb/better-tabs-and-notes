import { describe, expect, it } from 'vitest';
import {
	canCreateWith, fileTypeOf, matchesFilter, parentFolderName, parseCodeBlockOptions, parseFilter, pushRecent, type SearchItem,
} from '../src/features/homeTab/searchIndex';

const item = (path: string): SearchItem => {
	const name = path.split('/').pop()!;
	const dot = name.lastIndexOf('.');
	return { path, basename: name.slice(0, dot), extension: name.slice(dot + 1), aliases: [], unresolved: false };
};

describe('home tab search helpers', () => {
	it('parses filters', () => {
		expect(parseFilter('image')).toEqual({ kind: 'type', value: 'image' });
		expect(parseFilter('md')).toEqual({ kind: 'type', value: 'markdown' });
		expect(parseFilter('.PNG')).toEqual({ kind: 'extension', value: 'png' });
		expect(parseFilter('omni')).toEqual({ kind: 'omnisearch' });
		expect(parseFilter('web')).toEqual({ kind: 'web' });
		expect(parseFilter('xyz')).toBeNull();
		expect(parseFilter('xyz', ['xyz'])).toEqual({ kind: 'extension', value: 'xyz' });
		expect(parseFilter('  ')).toBeNull();
	});

	it('filters items', () => {
		expect(matchesFilter(item('a.md'), null, true)).toBe(true);
		expect(matchesFilter(item('a.png'), null, true)).toBe(false);
		expect(matchesFilter(item('a.png'), null, false)).toBe(true);
		expect(matchesFilter(item('a.png'), { kind: 'type', value: 'image' }, true)).toBe(true);
		expect(matchesFilter(item('a.PDF'), { kind: 'extension', value: 'pdf' }, false)).toBe(true);
		expect(fileTypeOf('canvas')).toBe('canvas');
	});

	it('only offers to create notes', () => {
		expect(canCreateWith(null)).toBe(true);
		expect(canCreateWith({ kind: 'type', value: 'markdown' })).toBe(true);
		expect(canCreateWith({ kind: 'type', value: 'image' })).toBe(false);
	});

	it('shows the parent folder', () => {
		expect(parentFolderName('a.md')).toBe('/');
		expect(parentFolderName('x/y/a.md')).toBe('y');
	});

	it('parses code block options', () => {
		expect(parseCodeBlockOptions('only search bar\nShow recent files')).toEqual({ searchOnly: true, recentFiles: true, bookmarks: false });
	});

	it('keeps recent files unique and capped', () => {
		expect(pushRecent(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c']);
		expect(pushRecent(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
	});
});
