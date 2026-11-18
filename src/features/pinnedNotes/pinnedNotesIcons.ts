// Icons for pinned notes: a Lucide icon name, or an emoji or short text.

import { getIcon, setIcon } from 'obsidian';
import { DEFAULT_NOTE_ICON } from './pinnedNotesLogic';

/** Whether `icon` is an icon Obsidian has (a Lucide name like "file"). */
export function isKnownIcon(icon: string): boolean {
	return !!icon && getIcon(icon) !== null;
}

/** Looks like an icon name (not an emoji) but Obsidian doesn't have it. */
export function isUnknownIconName(icon: string): boolean {
	const name = icon.trim();
	return /^[a-z0-9-]+$/i.test(name) && !isKnownIcon(name);
}

/** The icon picker gives "lucide:name" for icons; pinned notes store just the name, as Pinned Notes Menu did. */
export function fromPicker(icon: string): string {
	return icon.startsWith('lucide:') ? icon.slice('lucide:'.length) : icon;
}

/** Draw a note's icon: a Lucide icon, or the emoji/text itself. */
export function renderNoteIcon(el: HTMLElement, icon: string): void {
	const name = icon.trim() || DEFAULT_NOTE_ICON;
	el.empty();
	if (isKnownIcon(name) || isUnknownIconName(name)) setIcon(el, isKnownIcon(name) ? name : DEFAULT_NOTE_ICON);
	else el.createSpan({ cls: 'btn-pn-emoji', text: name });
}
