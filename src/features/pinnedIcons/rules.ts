// Pure rule matching for pinned tab icons; no Obsidian imports so it can be unit-tested.

import type { IconRule, PinnedIconSettings, RuleType } from '../../settings';

export const NATIVE_PIN_ICON = '__native_pin__';
export const LUCIDE_PREFIX = 'lucide:';

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
	exact: 'Exact name',
	folder: 'Folder',
	'starts-with': 'Starts with',
	'ends-with': 'Ends with',
	contains: 'Contains',
	regex: 'Regex',
	tag: 'Tag',
};

export interface FileInfo {
	basename: string;
	path: string;
	/** Lower case, without the leading #. */
	tags: string[];
	frontmatter?: Record<string, unknown>;
}

export function isLucideIcon(icon: string): boolean {
	return icon.startsWith(LUCIDE_PREFIX);
}

export function lucideName(icon: string): string {
	return icon.slice(LUCIDE_PREFIX.length);
}

export function normalizeTag(tag: string): string {
	return tag.replace(/^#/, '').toLowerCase();
}

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
	if (!regexCache.has(pattern)) {
		let regex: RegExp | null = null;
		try {
			regex = new RegExp(pattern);
		} catch {
			regex = null;
		}
		regexCache.set(pattern, regex);
	}
	return regexCache.get(pattern) ?? null;
}

/** Test a file name (without extension) against a name-based pattern. */
export function testPattern(name: string, type: RuleType, pattern: string): boolean {
	if (!pattern) return false;
	switch (type) {
		case 'exact': return name === pattern;
		case 'starts-with': return name.startsWith(pattern);
		case 'ends-with': return name.endsWith(pattern);
		case 'contains': return name.includes(pattern);
		case 'regex': return compile(pattern)?.test(name) ?? false;
		default: return false;
	}
}

export function ruleMatches(rule: IconRule, file: FileInfo): boolean {
	if (!rule.match) return false;
	switch (rule.type) {
		case 'folder': {
			const folder = rule.match.replace(/\/+$/, '');
			return file.path === folder || file.path.startsWith(`${folder}/`);
		}
		case 'tag': return file.tags.includes(normalizeTag(rule.match));
		default: return testPattern(file.basename, rule.type, rule.match);
	}
}

/** Icon for a pinned tab: frontmatter first, then the first matching rule, then the default. */
export function resolveIcon(file: FileInfo | null, settings: PinnedIconSettings): string | null {
	if (file) {
		if (settings.readFrontmatter && settings.frontmatterProperty) {
			const value = file.frontmatter?.[settings.frontmatterProperty];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		const rule = settings.rules.find(r => r.icon && ruleMatches(r, file));
		if (rule) return rule.icon;
	}
	if (settings.showDefaultIcon) return settings.defaultIcon || NATIVE_PIN_ICON;
	return null;
}

/** Index of the first earlier rule that also matches, for files this rule matches. */
export function findConflicts(rules: IconRule[], index: number, files: FileInfo[]): { file: FileInfo; winner: number }[] {
	const rule = rules[index];
	const conflicts: { file: FileInfo; winner: number }[] = [];
	for (const file of files) {
		if (!ruleMatches(rule, file)) continue;
		const winner = rules.slice(0, index).findIndex(r => ruleMatches(r, file));
		if (winner !== -1) conflicts.push({ file, winner });
	}
	return conflicts;
}
