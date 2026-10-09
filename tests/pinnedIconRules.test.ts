import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type PinnedIconSettings } from '../src/settings';
import { NATIVE_PIN_ICON, findConflicts, resolveIcon, ruleMatches, testPattern, type FileInfo } from '../src/features/pinnedIcons/rules';

const file = (path: string, tags: string[] = [], frontmatter?: Record<string, unknown>): FileInfo => ({
	path,
	basename: path.split('/').pop()!.replace(/\.md$/, ''),
	tags,
	frontmatter,
});

describe('testPattern', () => {
	it('matches names', () => {
		expect(testPattern('Meeting notes', 'starts-with', 'Meeting')).toBe(true);
		expect(testPattern('Meeting notes', 'ends-with', 'notes')).toBe(true);
		expect(testPattern('Meeting notes', 'contains', 'ing no')).toBe(true);
		expect(testPattern('Home', 'exact', 'home')).toBe(false);
		expect(testPattern('2024-01-15', 'regex', '^\\d{4}-\\d{2}-\\d{2}$')).toBe(true);
	});

	it('treats an invalid regex as no match', () => {
		expect(testPattern('anything', 'regex', '(')).toBe(false);
	});
});

describe('ruleMatches', () => {
	it('matches folders and their subfolders only', () => {
		const rule = { type: 'folder' as const, match: 'Projects', icon: '📁' };
		expect(ruleMatches(rule, file('Projects/a.md'))).toBe(true);
		expect(ruleMatches(rule, file('Projects/sub/b.md'))).toBe(true);
		expect(ruleMatches(rule, file('Projects2/c.md'))).toBe(false);
	});

	it('matches tags case-insensitively with or without #', () => {
		const rule = { type: 'tag' as const, match: '#Work', icon: '💼' };
		expect(ruleMatches(rule, file('a.md', ['work']))).toBe(true);
		expect(ruleMatches(rule, file('a.md', ['home']))).toBe(false);
	});
});

describe('resolveIcon', () => {
	const settings = (patch: Partial<PinnedIconSettings>): PinnedIconSettings => ({ ...DEFAULT_SETTINGS.pinnedIcons, ...patch });

	it('prefers frontmatter, then the first matching rule, then the default', () => {
		const s = settings({
			readFrontmatter: true,
			rules: [
				{ type: 'exact', match: 'Home', icon: '🏠' },
				{ type: 'folder', match: 'Daily', icon: '📅' },
			],
		});
		expect(resolveIcon(file('Home.md', [], { 'pinned-icon': '⭐' }), s)).toBe('⭐');
		expect(resolveIcon(file('Home.md'), s)).toBe('🏠');
		expect(resolveIcon(file('Daily/2024-01-01.md'), s)).toBe('📅');
		expect(resolveIcon(file('Other.md'), s)).toBe(NATIVE_PIN_ICON);
		expect(resolveIcon(file('Other.md'), settings({ defaultIcon: '📌' }))).toBe('📌');
		expect(resolveIcon(file('Other.md'), settings({ showDefaultIcon: false }))).toBeNull();
	});

	it('ignores frontmatter when turned off', () => {
		expect(resolveIcon(file('a.md', [], { 'pinned-icon': '⭐' }), settings({}))).toBe(NATIVE_PIN_ICON);
	});
});

describe('findConflicts', () => {
	it('reports files already claimed by an earlier rule', () => {
		const rules = [
			{ type: 'folder' as const, match: 'Daily', icon: '📅' },
			{ type: 'regex' as const, match: '^\\d{4}', icon: '🗓️' },
		];
		const files = [file('Daily/2024-01-01.md'), file('2024-02-02.md')];
		expect(findConflicts(rules, 1, files)).toEqual([{ file: files[0], winner: 0 }]);
		expect(findConflicts(rules, 0, files)).toEqual([]);
	});
});
