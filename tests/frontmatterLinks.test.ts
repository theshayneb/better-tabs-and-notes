import { describe, expect, it } from 'vitest';
import { extraLinks, findLinkedValues, parseLinks, toLinkCache } from '../src/features/frontmatterLinks/linkParse';

describe('links in properties: parsing', () => {
	it('finds wikilinks and markdown links in order', () => {
		const links = parseLinks('[[Chapter one]] and [Chapter two](<Chapter two.md>), [[B#Part|bee]]');
		expect(links.map(l => [l.target, l.display, l.isWikilink])).toEqual([
			['Chapter one', 'Chapter one', true],
			['Chapter two.md', 'Chapter two', false],
			['B#Part', 'bee', true],
		]);
		expect(links[0]).toMatchObject({ start: 0, end: 15, raw: '[[Chapter one]]' });
	});

	it('decodes encoded paths and spots external links and embeds', () => {
		const [enc, ext, embed] = parseLinks('[a](My%20note.md) [site](https://example.com/x) ![[pic.png]]');
		expect(enc.target).toBe('My note.md');
		expect(ext).toMatchObject({ isExternal: true, target: 'https://example.com/x' });
		expect(embed).toMatchObject({ isEmbed: true, target: 'pic.png' });
	});

	it('leaves single-link values to Obsidian', () => {
		expect(extraLinks('[[Only]]')).toEqual([]);
		expect(extraLinks('[text](Only.md)')).toEqual([]);
		expect(extraLinks('plain text')).toEqual([]);
		expect(extraLinks('see [[Only]]')).toHaveLength(1);
		expect(extraLinks('[[A]], [[B]]')).toHaveLength(2);
	});
});

describe('links in properties: frontmatter', () => {
	it('finds linked values at any depth with Obsidian-style keys', () => {
		const fm = {
			title: 'x',
			related: ['[[A]]', '[[B]] and [[C]]'],
			source: '[[D]] p. 4',
			nested: { inner: '[x](E.md), [[F]]' },
			single: '[[G]]',
			position: { start: 0 },
		};
		expect(findLinkedValues(fm).map(v => [v.key, v.links.length])).toEqual([
			['related.1', 2],
			['source', 1],
			['nested.inner', 2],
		]);
	});

	it('makes link cache entries', () => {
		const [link] = parseLinks('[[Note#Heading|shown]]');
		expect(toLinkCache('k', link)).toEqual({ key: 'k', link: 'Note#Heading', original: '[[Note#Heading|shown]]', displayText: 'shown' });
		const [plain] = parseLinks('[[Note]]');
		expect(toLinkCache('k', plain)).toEqual({ key: 'k', link: 'Note', original: '[[Note]]' });
	});
});
