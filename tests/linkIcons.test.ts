import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LINK_ICON_RULES, cleanRules, findWikilinks, iconForLink, linkExtension, ruleExtensions,
} from '../src/features/linkIcons/linkIconRules';

describe('link icons: file types', () => {
	it('reads the extension a link points at', () => {
		expect(linkExtension('ThingIWantToRead.pdf')).toBe('pdf');
		expect(linkExtension('Papers/Thing.PDF#page=3')).toBe('pdf');
		expect(linkExtension('Thing.pdf|my paper')).toBe('pdf');
		expect(linkExtension('My%20scan.png')).toBe('png');
		expect(linkExtension('folder.v2/Note')).toBeNull();
		expect(linkExtension('Note')).toBeNull();
		expect(linkExtension('Note.md')).toBeNull();
		expect(linkExtension('Mr. Smith')).toBeNull();
		expect(linkExtension('Version 1.2')).toBeNull();
		expect(linkExtension('.hidden')).toBeNull();
	});

	it('picks the icon of the first rule listing the type', () => {
		expect(iconForLink('ThingIWantToRead.pdf', DEFAULT_LINK_ICON_RULES)).toBe('lucide:file-text');
		expect(iconForLink('photo.JPG', DEFAULT_LINK_ICON_RULES)).toBe('lucide:image');
		expect(iconForLink('Note', DEFAULT_LINK_ICON_RULES)).toBeNull();
		expect(iconForLink('data.xyz', DEFAULT_LINK_ICON_RULES)).toBeNull();
		const rules = [{ extensions: '.pdf', icon: '📕' }, { extensions: 'pdf', icon: 'lucide:file' }];
		expect(iconForLink('a.pdf', rules)).toBe('📕');
		expect(iconForLink('a.pdf', [{ extensions: 'pdf', icon: '' }])).toBeNull();
	});

	it('splits and cleans extension lists', () => {
		expect(ruleExtensions({ extensions: ' .PNG, jpg;gif  webp ', icon: 'x' })).toEqual(['png', 'jpg', 'gif', 'webp']);
		expect(cleanRules(undefined)).toEqual(DEFAULT_LINK_ICON_RULES);
		expect(cleanRules([{ extensions: 'pdf', icon: 'x' }, null, { extensions: 3 }])).toEqual([
			{ extensions: 'pdf', icon: 'x' }, { extensions: '', icon: '' },
		]);
	});
});

describe('link icons: finding wikilinks', () => {
	it('finds links, skipping embeds', () => {
		expect(findWikilinks('* [[ThingIWantToRead.pdf]] and ![[pic.png]] and [[Note|alias]]')).toEqual([
			{ from: 2, target: 'ThingIWantToRead.pdf' },
			{ from: 48, target: 'Note' },
		]);
	});
});
