import { describe, expect, it } from 'vitest';
import {
	findMerges, frontmatterHasTag, isTagsKey, normalizeTagName, renameInFrontmatter, renameInText, renamedTag, tagNameProblem,
} from '../src/features/tagRename/tagLogic';

describe('tag rename: names', () => {
	it('normalizes and validates', () => {
		expect(normalizeTagName('  ##project/a/ ')).toBe('project/a');
		expect(tagNameProblem('project/a-b_c')).toBeNull();
		expect(tagNameProblem('')).not.toBeNull();
		expect(tagNameProblem('two words')).not.toBeNull();
		expect(tagNameProblem('a//b')).not.toBeNull();
		expect(tagNameProblem('1984')).not.toBeNull();
		expect(tagNameProblem('y1984')).toBeNull();
	});

	it('renames a tag and its subtags, ignoring case', () => {
		expect(renamedTag('Project', 'project', 'work')).toBe('work');
		expect(renamedTag('project/Alpha', 'project', 'work')).toBe('work/Alpha');
		expect(renamedTag('projects', 'project', 'work')).toBeNull();
		expect(renamedTag('other', 'project', 'work')).toBeNull();
	});
});

describe('tag rename: merges', () => {
	it('finds existing tags that would be merged into', () => {
		const tags = ['a', 'a/x', 'b', 'b/x', 'c'];
		expect(findMerges(tags, 'a', 'b')).toEqual([['a', 'b'], ['a/x', 'b/x']]);
		expect(findMerges(tags, 'a', 'd')).toEqual([]);
		expect(findMerges(['Tag'], 'Tag', 'tag')).toEqual([]);
	});

	it('does not count tags that are renamed themselves', () => {
		expect(findMerges(['a', 'a/a'], 'a', 'a/a')).toEqual([]);
	});
});

describe('tag rename: notes', () => {
	it('renames tags in text at their positions', () => {
		const text = 'Hi #a and #a/x and #ab.';
		const positions = [
			{ tag: '#a', start: 3, end: 5 },
			{ tag: '#a/x', start: 10, end: 14 },
			{ tag: '#ab', start: 19, end: 22 },
		];
		expect(renameInText(text, positions, 'a', 'b')).toBe('Hi #b and #b/x and #ab.');
		expect(renameInText('changed', positions, 'a', 'b')).toBeNull();
	});

	it('renames tags in frontmatter lists and strings, dropping repeats', () => {
		expect(renameInFrontmatter(['a', 'b', 'a/x', 3], 'a', 'b')).toEqual(['b', 'b/x', 3]);
		expect(renameInFrontmatter('#a, c a/x', 'a', 'b')).toBe('#b, c b/x');
		expect(renameInFrontmatter(null, 'a', 'b')).toBeNull();
		expect(frontmatterHasTag(['c', 'A/x'], 'a')).toBe(true);
		expect(frontmatterHasTag('c d', 'a')).toBe(false);
		expect(isTagsKey('Tags') && isTagsKey('tag') && !isTagsKey('tagged')).toBe(true);
	});
});
