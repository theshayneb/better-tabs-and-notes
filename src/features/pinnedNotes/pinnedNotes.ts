// Pinned notes: notes pinned to the ribbon (each its own icon, with dividers
// between them) or to one menu button, plus commands to open, pin and unpin.
// Ported from Pinned Notes Menu (MIT), which combined Pinned Notes by
// vasilcoin002 and Ribbon Divider by Andrew McGivery (both MIT); see NOTICE.md.

import { Keymap, Menu, Notice, Platform, TFile, normalizePath, type Command, type PaneType } from 'obsidian';
import { Feature } from '../../feature';
import type { PinnedNotesSettings } from '../../settings';
import { runsBackgroundTasks } from '../../shared/deviceMemory';
import { PinnedNoteModal } from './pinnedNotesModals';
import { isKnownIcon, renderNoteIcon } from './pinnedNotesIcons';
import {
	DEFAULT_NOTE_ICON, MENU_BUTTON_TITLE, applyRename, createNote, displayTitle, iconForExtension, importOriginalPlugins,
	importPinnedNotesMenu, isNote, pathMatches, renameAffects, ribbonTitles, type PinnedNote,
} from './pinnedNotesLogic';

/** This plugin's other ribbon icons, whose titles pinned notes mustn't take (Obsidian identifies icons by title). */
const OTHER_RIBBON_TITLES = [MENU_BUTTON_TITLE, "Open today's daily note (pinned)", 'Clean properties'];

/** Remembered on this device once Pinned Notes Menu's settings were brought over automatically. */
const PNM_IMPORTED_KEY = 'better-tabs-and-notes:pinned-notes-menu-imported';
const PNM_ID = 'pinned-notes-menu';

export class PinnedNotesFeature extends Feature {
	readonly id = 'pinnedNotes';
	readonly name = 'Pinned notes';

	private ribbon: { actionId: string; el: HTMLElement }[] = [];
	/** Renames seen here, waiting for Sync to settle before updating the list. */
	private pendingRenames: [string, string][] = [];
	private renameWait: Promise<void> | null = null;

	get settings(): PinnedNotesSettings {
		return this.plugin.settings.pinnedNotes;
	}

	override onload(): void {
		this.renderRibbon();
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			const pinned = this.isPinned(file);
			menu.addItem(item => item
				.setTitle(pinned ? 'Unpin from pinned notes' : 'Pin to pinned notes')
				.setIcon(pinned ? 'pin-off' : 'pin')
				.setSection('action')
				.onClick(() => void (pinned ? this.unpinFile(file) : this.pinFile(file))));
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => void this.onRename(oldPath, file.path)));
		this.app.workspace.onLayoutReady(() => void this.autoImportPinnedNotesMenu());
	}

	override onunload(): void {
		this.clearRibbon();
	}

	override onSettingsChange(): void {
		// Only the ribbon; open notes aren't affected, so this is fine while typing in the settings.
		this.renderRibbon();
	}

	override commands(): Command[] {
		return [
			{ id: 'open-pinned-note', name: 'Open pinned note', icon: 'pin', callback: () => this.openPicker() },
			{
				id: 'pin-current-note',
				name: 'Pin current note',
				icon: 'pin',
				checkCallback: checking => {
					const file = this.app.workspace.getActiveFile();
					if (!file || this.isPinned(file)) return false;
					if (!checking) void this.pinFile(file);
					return true;
				},
			},
			{
				id: 'unpin-current-note',
				name: 'Unpin current note',
				icon: 'pin-off',
				checkCallback: checking => {
					const file = this.app.workspace.getActiveFile();
					if (!file || !this.isPinned(file)) return false;
					if (!checking) void this.unpinFile(file);
					return true;
				},
			},
		];
	}

	// -----------------------------------------------------------------------
	// Ribbon and menu
	// -----------------------------------------------------------------------

	renderRibbon(): void {
		this.clearRibbon();
		if (!this.isLoaded) return;
		const { items, showMenuButton, showRibbonIcons, menuIcon } = this.settings;
		if (showMenuButton) this.addIcon(menuIcon, MENU_BUTTON_TITLE, evt => this.showMenu(evt));
		if (!showRibbonIcons) return;
		const titles = ribbonTitles(items, OTHER_RIBBON_TITLES);
		for (const item of items) {
			const title = titles.get(item.id) ?? item.id;
			if (isNote(item)) {
				const el = this.addIcon(item.icon, title, evt => void this.openNote(item, evt));
				// The ribbon only reports left clicks; a middle click opens a new tab, like a link.
				el.addEventListener('auxclick', evt => {
					if (evt.button === 1) void this.openNote(item, evt);
				});
			} else {
				// The phone's ribbon is a list, where a divider would just be an empty row.
				if (Platform.isPhone) continue;
				const el = this.addIcon('', title, () => {});
				// `ribbon-divider` keeps CSS snippets written for the Ribbon Divider plugin working.
				el.addClass('pnm-ribbon-divider', 'ribbon-divider', `ribbon-divider-${item.id}`);
				el.removeAttribute('aria-label');
			}
		}
	}

	private addIcon(icon: string, title: string, onClick: (evt: MouseEvent) => void): HTMLElement {
		const name = icon.trim();
		const el = this.plugin.addRibbonIcon(isKnownIcon(name) || !name ? name : DEFAULT_NOTE_ICON, title, onClick);
		// An emoji instead of an icon.
		if (name && !isKnownIcon(name)) renderNoteIcon(el, name);
		this.ribbon.push({ actionId: `${this.plugin.manifest.id}:${title}`, el });
		return el;
	}

	/** Remove the icons; the ribbon's own record too (undocumented, guarded), so changes show without a restart. */
	private clearRibbon(): void {
		const ribbon = this.app.workspace.leftRibbon;
		for (const { actionId, el } of this.ribbon) {
			try {
				ribbon?.removeRibbonAction?.(actionId);
			} catch (e) {
				console.warn('Better Tabs and Notes: couldn\'t remove a ribbon icon', e);
			}
			el.remove();
		}
		this.ribbon = [];
	}

	private showMenu(evt: MouseEvent): void {
		const menu = new Menu();
		let hasNotes = false;
		let separator = false;
		for (const item of this.settings.items) {
			if (!isNote(item)) {
				separator = hasNotes;
				continue;
			}
			if (separator) menu.addSeparator();
			separator = false;
			hasNotes = true;
			menu.addItem(menuItem => menuItem
				.setTitle(displayTitle(item))
				.setIcon(isKnownIcon(item.icon.trim()) ? item.icon.trim() : DEFAULT_NOTE_ICON)
				.onClick(clickEvt => void this.openNote(item, clickEvt)));
		}
		if (!hasNotes) menu.addItem(menuItem => menuItem.setTitle('No pinned notes yet').setDisabled(true));
		menu.addSeparator();
		const active = this.app.workspace.getActiveFile();
		if (active && !this.isPinned(active)) {
			menu.addItem(menuItem => menuItem.setTitle('Pin current note').setIcon('pin').onClick(() => void this.pinFile(active)));
		}
		menu.addItem(menuItem => menuItem.setTitle('Edit pinned notes').setIcon('settings').onClick(() => this.openSettings()));
		menu.showAtMouseEvent(evt);
	}

	openPicker(): void {
		new PinnedNoteModal(this.app, this.settings.items.filter(isNote), (note, evt) => void this.openNote(note, evt)).open();
	}

	private openSettings(): void {
		this.app.setting?.open();
		this.app.setting?.openTabById(this.plugin.manifest.id);
	}

	// -----------------------------------------------------------------------
	// Notes
	// -----------------------------------------------------------------------

	resolveNote(note: PinnedNote): TFile | null {
		const path = note.path.trim();
		if (!path) return null;
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (file instanceof TFile) return file;
		// Older entries (and the original Pinned Notes plugin) store paths without ".md".
		return this.app.metadataCache.getFirstLinkpathDest(path, '');
	}

	/** Open it the way a link click would, so tab behaviour (new tab, no duplicates) applies. */
	async openNote(note: PinnedNote, evt?: MouseEvent | KeyboardEvent): Promise<void> {
		const file = this.resolveNote(note);
		if (!file) {
			new Notice(`Pinned note not found: ${note.path || displayTitle(note)}`);
			return;
		}
		let pane: PaneType | boolean = false;
		if (evt) pane = evt instanceof MouseEvent && evt.button === 1 ? 'tab' : Keymap.isModEvent(evt);
		await this.app.workspace.openLinkText(file.path, '', pane);
	}

	isPinned(file: TFile): boolean {
		return this.settings.items.some(item => isNote(item) && pathMatches(item.path, file.path));
	}

	async pinFile(file: TFile): Promise<void> {
		this.settings.items.push(createNote(file.path, '', iconForExtension(file.extension)));
		await this.plugin.saveSettings('pinnedNotes');
		new Notice(`Pinned ${file.basename}`);
	}

	async unpinFile(file: TFile): Promise<void> {
		this.settings.items = this.settings.items.filter(item => !(isNote(item) && pathMatches(item.path, file.path)));
		await this.plugin.saveSettings('pinnedNotes');
		new Notice(`Unpinned ${file.basename}`);
	}

	// -----------------------------------------------------------------------
	// Renames
	// -----------------------------------------------------------------------

	/**
	 * A pinned note (or its folder) was renamed or moved. Sync applies a rename on
	 * every device, so updating the list is automatic work: only on the device
	 * that runs background tasks, once Sync has settled, and only if the list
	 * still needs it then (another device may already have done it).
	 */
	async onRename(oldPath: string, newPath: string): Promise<void> {
		if (!renameAffects(this.settings.items, oldPath) || !runsBackgroundTasks(this.app)) return;
		this.pendingRenames.push([oldPath, newPath]);
		this.renameWait ??= this.applyRenamesWhenSettled().finally(() => { this.renameWait = null; });
		await this.renameWait;
	}

	private async applyRenamesWhenSettled(): Promise<void> {
		await this.plugin.syncWatcher.waitUntilSettled();
		const renames = this.pendingRenames.splice(0);
		const { vault } = this.app;
		let changed = false;
		for (const [oldPath, newPath] of renames) {
			// Still needed? The old path must be gone, the new one there, and the list still pointing at the old one.
			if (!renameAffects(this.settings.items, oldPath)) continue;
			if (vault.getAbstractFileByPath(oldPath) || !vault.getAbstractFileByPath(newPath)) continue;
			changed = applyRename(this.settings.items, oldPath, newPath) || changed;
		}
		if (changed) await this.plugin.saveSettings('pinnedNotes');
	}

	// -----------------------------------------------------------------------
	// Imports
	// -----------------------------------------------------------------------

	private async readPluginData(pluginId: string): Promise<unknown> {
		const path = normalizePath(`${this.app.vault.configDir}/plugins/${pluginId}/data.json`);
		try {
			if (!(await this.app.vault.adapter.exists(path))) return null;
			return JSON.parse(await this.app.vault.adapter.read(path)) as unknown;
		} catch (e) {
			console.error(`Better Tabs and Notes: couldn't read ${path}`, e);
			return null;
		}
	}

	/** Copy notes from Pinned Notes and dividers from Ribbon Divider. */
	async importOriginalPlugins(): Promise<void> {
		const items = importOriginalPlugins(await this.readPluginData('pinned-notes'), await this.readPluginData('ribbon-divider'), this.settings.items);
		if (items.length === 0) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- plugin names are proper nouns
			new Notice('Nothing new to import from Pinned Notes or Ribbon Divider.');
			return;
		}
		this.settings.items.push(...items);
		await this.plugin.saveSettings('pinnedNotes');
		const notes = items.filter(isNote).length;
		new Notice(`Imported ${notes} note${notes === 1 ? '' : 's'} and ${items.length - notes} divider${items.length - notes === 1 ? '' : 's'}. You can turn off the old plugins now.`);
	}

	/** Bring over Pinned Notes Menu's list and ribbon settings. Returns false if it has no settings here. */
	async importPinnedNotesMenu(quiet = false): Promise<boolean> {
		const raw = await this.readPluginData(PNM_ID);
		if (raw === null) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- plugin names are proper nouns
			if (!quiet) new Notice('No Pinned Notes Menu settings found.');
			return false;
		}
		const { items, prefs } = importPinnedNotesMenu(raw, this.settings.items);
		this.settings.items.push(...items);
		Object.assign(this.settings, prefs);
		await this.plugin.saveSettings('pinnedNotes');
		const stillOn = this.app.plugins.enabledPlugins.has(PNM_ID);
		if (!quiet || items.length || stillOn) {
			new Notice(`Imported ${items.length} pinned item${items.length === 1 ? '' : 's'} from Pinned Notes Menu.`
				+ (stillOn ? ' Turn off Pinned Notes Menu in Community plugins: with both on, every icon shows twice.' : ''), stillOn ? 15000 : 5000);
		}
		return true;
	}

	/** Once, on the device that runs background tasks, after Sync has settled. */
	private async autoImportPinnedNotesMenu(): Promise<void> {
		if (this.app.loadLocalStorage(PNM_IMPORTED_KEY) || !runsBackgroundTasks(this.app)) return;
		await this.plugin.syncWatcher.waitUntilSettled();
		if (!this.isLoaded || this.app.loadLocalStorage(PNM_IMPORTED_KEY)) return;
		if (await this.importPinnedNotesMenu(true)) this.app.saveLocalStorage(PNM_IMPORTED_KEY, true);
	}
}
