// Keep today's daily note in one pinned tab.
// Based on Pinned Daily Notes by Jeremy Neiman (MIT); see NOTICE.md.

import { Notice, TFile, normalizePath, type Command, type WorkspaceLeaf } from 'obsidian';
import { moment, type Moment } from '../../shared/moment';
import { Feature } from '../../feature';
import type { DailyNoteSettings } from '../../settings';
import { withoutDedupe } from '../../shared/openFlags';
import { applyTemplate, dailyNotePath, isDailyNotePath, normalizeConfig, type DailyNoteConfig } from './dailyNotePaths';

interface DailyNotesInstance {
	options?: Partial<DailyNoteConfig>;
}

interface PeriodicNotesPlugin {
	settings?: { daily?: Partial<DailyNoteConfig> & { enabled?: boolean } };
}

export class PinnedDailyNoteFeature extends Feature {
	readonly id = 'dailyNote';
	readonly name = 'Pinned daily note';

	private ribbonEl: HTMLElement | null = null;
	private lastDate = '';
	/** The openToday call in progress, so overlapping calls don't create the note twice. */
	private opening: Promise<void> | null = null;

	get settings(): DailyNoteSettings {
		return this.plugin.settings.dailyNote;
	}

	override onload(): void {
		this.updateRibbon();
		this.lastDate = moment().format('YYYY-MM-DD');
		this.registerInterval(window.setInterval(() => void this.checkRollOver(), 60_000));
		// Phones freeze Obsidian in the background, so the timer can sleep through
		// midnight. Check again as soon as Obsidian is back on screen.
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.checkRollOver();
		});
		this.registerDomEvent(window, 'focus', () => void this.checkRollOver());
		this.app.workspace.onLayoutReady(() => {
			// A start page chosen for this device replaces the synced setting.
			if (this.settings.openOnStart && !this.plugin.getDeviceStartup().page) void this.openToday();
			// Obsidian may have been closed overnight and restored yesterday's note.
			// Wait a little first, so Sync can bring in today's note if another device made it.
			else if (this.settings.rollOver) {
				this.registerInterval(window.setTimeout(() => void this.rollOverIfStale(), 8_000));
			}
		});
	}

	override onunload(): void {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
	}

	override onSettingsChange(): void {
		this.updateRibbon();
	}

	override commands(): Command[] {
		return [{
			id: 'open-pinned-daily-note',
			name: "Open today's daily note in the pinned tab",
			callback: () => void this.openToday(),
		}];
	}

	private updateRibbon(): void {
		if (this.settings.showRibbonIcon && !this.ribbonEl) {
			this.ribbonEl = this.plugin.addRibbonIcon('calendar-check', "Open today's daily note (pinned)", () => {
				void this.openToday();
			});
		} else if (!this.settings.showRibbonIcon && this.ribbonEl) {
			this.ribbonEl.remove();
			this.ribbonEl = null;
		}
	}

	/** Folder, format and template from the configured daily notes plugin, or null if it's off. */
	getConfig(): DailyNoteConfig | null {
		if (this.settings.source === 'periodic-notes') {
			const periodic = this.app.plugins.getPlugin('periodic-notes') as unknown as PeriodicNotesPlugin | null;
			const daily = periodic?.settings?.daily;
			if (daily && daily.enabled !== false) return normalizeConfig(daily);
			return null;
		}
		const core = this.app.internalPlugins.getPluginById('daily-notes');
		if (!core?.enabled) return null;
		return normalizeConfig((core.instance as DailyNotesInstance | undefined)?.options);
	}

	private findPinnedDailyLeaf(config: DailyNoteConfig): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves(leaf => {
			if (found || !leaf.pinned) return;
			const path = leaf.getViewState().state?.file;
			if (typeof path === 'string' && isDailyNotePath(config, path, moment)) found = leaf;
		});
		return found;
	}

	private newLeaf(): WorkspaceLeaf {
		const { workspace } = this.app;
		if (this.settings.pinLocation === 'left') return workspace.getLeftLeaf(false) ?? workspace.getLeaf('tab');
		if (this.settings.pinLocation === 'right') return workspace.getRightLeaf(false) ?? workspace.getLeaf('tab');
		return workspace.getLeaf('tab');
	}

	async openToday(focus = true): Promise<void> {
		if (!this.opening) {
			this.opening = this.doOpenToday(focus).finally(() => { this.opening = null; });
			return this.opening;
		}
		await this.opening;
		// The call in progress may not have focused the tab.
		if (focus) await this.doOpenToday(true);
	}

	private async doOpenToday(focus: boolean): Promise<void> {
		const config = this.getConfig();
		if (!config) {
			const source = this.settings.source === 'periodic-notes' ? 'Periodic Notes plugin (daily notes)' : 'Daily notes core plugin';
			new Notice(`Turn on the ${source} to use the pinned daily note.`);
			return;
		}

		const today = moment();
		const path = normalizePath(dailyNotePath(config, today));
		const file = this.app.vault.getFileByPath(path) ?? await this.createDailyNote(config, today, path);

		let leaf = this.findPinnedDailyLeaf(config);
		if (!leaf) {
			leaf = this.newLeaf();
			leaf.setPinned(true);
		}
		const target = leaf;
		if (target.getViewState().state?.file !== path) {
			await withoutDedupe(() => target.openFile(file));
		}
		if (focus) {
			await this.app.workspace.revealLeaf(target);
			this.app.workspace.setActiveLeaf(target, { focus: true });
		}
	}

	private async createDailyNote(config: DailyNoteConfig, date: Moment, path: string): Promise<TFile> {
		let content = '';
		if (config.template) {
			const templateFile = this.app.metadataCache.getFirstLinkpathDest(config.template, '');
			if (templateFile instanceof TFile) {
				const raw = await this.app.vault.cachedRead(templateFile);
				content = applyTemplate(raw, date.format(config.format).split('/').pop() ?? '', date, config.format);
			} else {
				new Notice(`Daily note template not found: ${config.template}`);
			}
		}
		await this.ensureFolder(path.split('/').slice(0, -1).join('/'));
		return this.app.vault.create(path, content);
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		let current = '';
		for (const part of folder.split('/')) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
		}
	}

	/** After midnight, move an existing pinned daily note tab to the new day. */
	private async checkRollOver(): Promise<void> {
		const date = moment().format('YYYY-MM-DD');
		if (date === this.lastDate) return;
		this.lastDate = date;
		if (this.settings.rollOver) await this.rollOverIfStale();
	}

	/** Move the pinned daily note tab to today if it shows an earlier day. */
	private async rollOverIfStale(): Promise<void> {
		const config = this.getConfig();
		if (!config) return;
		const leaf = this.findPinnedDailyLeaf(config);
		if (!leaf) return;
		const today = normalizePath(dailyNotePath(config, moment()));
		if (leaf.getViewState().state?.file !== today) await this.openToday(false);
	}
}
