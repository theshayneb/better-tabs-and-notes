// Property templates: which properties a note should have, in which order, and
// the values a property offers. No Obsidian imports so it can be unit-tested.
// Inspired by Fileclass by mdelobelle (MIT); see NOTICE.md.

import type { RuleType } from '../../settings';
import { ruleMatches, type FileInfo } from '../pinnedIcons/rules';

export interface TemplateProperty {
	name: string;
	/** Value for a newly inserted property; empty leaves it empty. */
	value: string;
}

export interface TemplateRule {
	type: RuleType;
	match: string;
	properties: TemplateProperty[];
}

export interface PropertyChoices {
	property: string;
	/** The values offered, separated by commas. */
	options: string;
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * The properties a note should have, from every rule that matches it: the
 * first rule's properties first, then any new ones from later rules.
 */
export function templateFor(rules: TemplateRule[], file: FileInfo): TemplateProperty[] {
	const seen = new Set<string>();
	const result: TemplateProperty[] = [];
	for (const rule of rules) {
		if (!ruleMatches({ type: rule.type, match: rule.match, icon: '' }, file)) continue;
		for (const property of rule.properties) {
			const name = property.name.trim();
			if (!name || seen.has(key(name))) continue;
			seen.add(key(name));
			result.push({ name, value: property.value });
		}
	}
	return result;
}

/** The note's actual key for a property name (properties match regardless of case), or undefined. */
function findKey(frontmatter: Record<string, unknown>, name: string): string | undefined {
	return Object.keys(frontmatter).find(k => key(k) === key(name));
}

/** Template properties the note doesn't have yet (an empty one counts as present). */
export function missingProperties(frontmatter: Record<string, unknown> | undefined, template: TemplateProperty[]): TemplateProperty[] {
	const fm = frontmatter ?? {};
	return template.filter(p => findKey(fm, p.name) === undefined);
}

/** Replace the frontmatter's keys with the same values in a new order (mutates it, keeping the object). */
function reorder(frontmatter: Record<string, unknown>, order: string[]): void {
	const values = new Map(order.map(k => [k, frontmatter[k]]));
	for (const k of Object.keys(frontmatter)) delete frontmatter[k];
	for (const [k, v] of values) frontmatter[k] = v;
}

/**
 * Add the missing template properties (never changing existing ones). Each goes
 * right after the template property before it that the note has, so existing
 * properties keep their order and new ones land where the template puts them.
 * Returns how many were added.
 */
export function insertMissing(
	frontmatter: Record<string, unknown>,
	template: TemplateProperty[],
	toValue: (property: TemplateProperty) => unknown,
): number {
	const missing = missingProperties(frontmatter, template);
	if (missing.length === 0) return 0;
	const order = Object.keys(frontmatter);
	const values = new Map<string, unknown>();
	for (const property of missing) {
		const index = template.findIndex(p => key(p.name) === key(property.name));
		// The nearest earlier template property already in the note...
		let at = -1;
		for (let i = index - 1; i >= 0 && at === -1; i--) {
			const existing = order.findIndex(k => key(k) === key(template[i].name));
			if (existing !== -1) at = existing + 1;
		}
		// ...or else just before the nearest later one, or else at the end.
		if (at === -1) {
			for (let i = index + 1; i < template.length && at === -1; i++) {
				const existing = order.findIndex(k => key(k) === key(template[i].name));
				if (existing !== -1) at = existing;
			}
		}
		if (at === -1) at = order.length;
		order.splice(at, 0, property.name);
		values.set(property.name, toValue(property));
	}
	for (const [k, v] of values) frontmatter[k] = v;
	reorder(frontmatter, order);
	return missing.length;
}

/** The note's keys in template order: template properties first, then the rest as they are. */
function sortedOrder(frontmatter: Record<string, unknown>, template: TemplateProperty[]): string[] {
	const keys = Object.keys(frontmatter);
	const first = template.map(p => findKey(frontmatter, p.name)).filter((k): k is string => k !== undefined);
	const firstSet = new Set(first);
	return [...first, ...keys.filter(k => !firstSet.has(k))];
}

/** Whether the note's properties are already in template order. */
export function isSorted(frontmatter: Record<string, unknown> | undefined, template: TemplateProperty[]): boolean {
	const fm = frontmatter ?? {};
	const keys = Object.keys(fm).filter(k => k !== 'position');
	const sorted = sortedOrder(Object.fromEntries(keys.map(k => [k, fm[k]])), template);
	return sorted.every((k, i) => k === keys[i]);
}

/** Put the note's properties in template order (mutates it). Returns whether anything moved. */
export function sortProperties(frontmatter: Record<string, unknown>, template: TemplateProperty[]): boolean {
	if (isSorted(frontmatter, template)) return false;
	reorder(frontmatter, sortedOrder(frontmatter, template));
	return true;
}

/** The values offered for a property, if any. */
export function choicesFor(choices: PropertyChoices[], property: string): string[] {
	const entry = choices.find(c => key(c.property) === key(property));
	if (!entry) return [];
	return [...new Set(entry.options.split(',').map(o => o.trim()).filter(Boolean))];
}

/**
 * Turn a template's default value into a property value for the property's
 * type (as Obsidian has it registered): lists split on commas, numbers and
 * checkboxes are converted, and an empty value stays empty.
 */
export function templateValue(raw: string, type: string | undefined): unknown {
	const text = raw.trim();
	switch (type) {
		case 'multitext':
		case 'tags':
		case 'aliases': {
			const items = text.split(',').map(s => s.trim()).filter(Boolean);
			return items.length ? items : null;
		}
		case 'number': {
			if (!text) return null;
			const n = Number(text);
			return Number.isFinite(n) ? n : text;
		}
		case 'checkbox':
			return text === '' ? false : /^(true|yes|1)$/i.test(text);
		default:
			return text === '' ? null : text;
	}
}
