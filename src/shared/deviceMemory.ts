// Things remembered on this device only (Obsidian's local storage, never
// data.json), so using the plugin never makes Sync carry settings around.

import { Platform, type App } from 'obsidian';

const PREFIX = 'better-tabs-and-notes:';
export const BACKGROUND_KEY = `${PREFIX}background-tasks`;
export const RECENT_FILES_KEY = `${PREFIX}recent-files`;
export const RECENT_ICONS_KEY = `${PREFIX}recent-icons`;
export const BULK_MODE_KEY = `${PREFIX}bulk-existing-mode`;
export const CLEANER_RECORD_KEY = `${PREFIX}cleaner-record`;
export const EDIT_LOG_STORE_KEY = `${PREFIX}edit-log`;

/** Whether automatic work (creating notes, repairing synced settings) runs here. On for desktop by default. */
export function runsBackgroundTasks(app: App): boolean {
	const stored: unknown = app.loadLocalStorage(BACKGROUND_KEY);
	return typeof stored === 'boolean' ? stored : Platform.isDesktopApp;
}

export function setRunsBackgroundTasks(app: App, on: boolean): void {
	app.saveLocalStorage(BACKGROUND_KEY, on === Platform.isDesktopApp ? null : on);
}

export function loadStrings(app: App, key: string): string[] | null {
	const stored: unknown = app.loadLocalStorage(key);
	return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : null;
}

export function saveStrings(app: App, key: string, values: string[] | null): void {
	app.saveLocalStorage(key, values && values.length ? values : null);
}

/** Icons picked lately on this device, newest first. */
export function recentIcons(app: App): string[] {
	return loadStrings(app, RECENT_ICONS_KEY) ?? [];
}

export function rememberIcon(app: App, icon: string, max = 24): void {
	saveStrings(app, RECENT_ICONS_KEY, [icon, ...recentIcons(app).filter(i => i !== icon)].slice(0, max));
}

/** A remembered choice, if it's one of `allowed`. */
export function loadChoice<T extends string>(app: App, key: string, allowed: readonly T[]): T | null {
	const stored: unknown = app.loadLocalStorage(key);
	return allowed.includes(stored as T) ? stored as T : null;
}

export function loadRecord(app: App, key: string): Record<string, unknown> {
	const stored: unknown = app.loadLocalStorage(key);
	return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
}
