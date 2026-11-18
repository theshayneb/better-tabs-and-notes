// Keep today's daily note in one pinned tab.
// Based on Pinned Daily Notes by Jeremy Neiman (MIT); see NOTICE.md.

import { Notice, TFile, normalizePath, setIcon, type Command, type WorkspaceLeaf } from 'obsidian';
import { moment, type Moment } from '../../shared/moment';
import { Feature } from '../../feature';
import type { DailyNoteSettings } from '../../settings';
import { runsBackgroundTasks } from '../../shared/deviceMemory';
import { withoutDedupe } from '../../shared/openFlags';
import { applyTemplate, dailyNotePath, dailyStep, isDailyNotePath, normalizeConfig, type DailyNoteConfig } from './dailyNotePaths';

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
	/** Today's note was asked for by hand (ribbon, command, button) while a wait was in progress. */
	private byHand = false;
	/** "Create now" was clicked: stop waiting for Sync. */
	private createNow = false;
	/** The waiting / "create today's note" message, in the pinned tab or as a notice. */
	private prompt: { el: HTMLElement; notice: Notice | null; path: string } | null = null;

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
		// Today's note arrived from another device while we were asking: open it.
		this.registerEvent(this.app.vault.on('create', file => {
			if (this.prompt && file.path === this.prompt.path && !this.opening) void this.openToday(false);
		}));
		this.app.workspace.onLayoutReady(() => {
			// A start page chosen for this device replaces the synced setting.
			if (this.settings.openOnStart && !this.plugin.getDeviceStartup().page) void this.openToday();
			// Obsidian may have been closed overnight and restored yesterday's note.
			// If today's note isn't here yet, openToday waits for Sync before doing anything.
			else if (this.settings.rollOver) void this.rollOverIfStale();
		});
	}

	override onunload(): void {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
		this.clearPrompt();
	}

	override onSettingsChange(): void {
		this.updateRibbon();
	}

	override commands(): Command[] {
		return [{
			id: 'open-pinned-daily-note',
			name: "Open today's daily note in the pinned tab",
			callback: () => void this.openToday(true, true),
		}];
	}

	private updateRibbon(): void {
		if (this.settings.showRibbonIcon && !this.ribbonEl) {
			this.ribbonEl = this.plugin.addRibbonIcon('calendar-check', "Open today's daily note (pinned)", () => {
				void this.openToday(true, true);
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

	/**
	 * Open today's note in the pinned tab. If it isn't there yet, wait for Sync
	 * to settle first (another device may have made it), then create it, but
	 * only if asked for by hand or this device runs background tasks; otherwise
	 * offer a "Create today's note" button.
	 */
	async openToday(focus = true, byHand = false): Promise<void> {
		if (byHand) this.byHand = true;
		if (!this.opening) {
			this.opening = this.doOpenToday(focus).finally(() => { this.opening = null; });
			return this.opening;
		}
		await this.opening;
		// The call in progress may not have focused the tab.
		const config = this.getConfig();
		if (focus && config && this.todayFile(config)) await this.doOpenToday(true);
	}

	private todayFile(config: DailyNoteConfig): TFile | null {
		return this.app.vault.getFileByPath(normalizePath(dailyNotePath(config, moment())));
	}

	private async doOpenToday(focus: boolean): Promise<void> {
		const config = this.getConfig();
		if (!config) {
			const source = this.settings.source === 'periodic-notes' ? 'Periodic Notes plugin (daily notes)' : 'Daily notes core plugin';
			new Notice(`Turn on the ${source} to use the pinned daily note.`);
			return;
		}

		let file = this.todayFile(config);
		if (!file) {
			const watcher = this.plugin.syncWatcher;
			// Automatic: always wait the full quiet time, in case another device is
			// uploading it right now. By hand: only while Sync is still catching up.
			const fullWait = !this.byHand;
			const settled = this.createNow || watcher.settledNow(Date.now(), fullWait);
			if (dailyStep({ exists: false, settled, byHand: this.byHand, background: false }) === 'wait') {
				this.showPrompt(config, 'waiting');
				await watcher.waitUntilSettled(() => this.createNow || !!this.todayFile(config), fullWait);
			}
			file = this.todayFile(config);
			const step = dailyStep({
				exists: !!file, settled: true,
				byHand: this.byHand || this.createNow, background: runsBackgroundTasks(this.app),
			});
			if (step === 'ask') {
				this.showPrompt(config, 'missing');
				this.byHand = false;
				return;
			}
			if (!file) file = await this.createDailyNote(config, moment(), normalizePath(dailyNotePath(config, moment())));
		}
		this.byHand = false;
		this.createNow = false;
		this.clearPrompt();

		const path = file.path;
		let leaf = this.findPinnedDailyLeaf(config);
		if (!leaf) {
			leaf = this.newLeaf();
			leaf.setPinned(true);
		}
		const target = leaf;
		const opened = file;
		if (target.getViewState().state?.file !== path) {
			await withoutDedupe(() => target.openFile(opened));
		}
		if (focus) {
			await this.app.workspace.revealLeaf(target);
			this.app.workspace.setActiveLeaf(target, { focus: true });
		}
	}

	// -----------------------------------------------------------------------
	// Waiting for Sync / "Create today's note"
	// -----------------------------------------------------------------------

	/** Show the waiting or "create" message at the top of the pinned tab, or as a notice if there's none. */
	private showPrompt(config: DailyNoteConfig, state: 'waiting' | 'missing'): void {
		const date = moment();
		const path = normalizePath(dailyNotePath(config, date));
		const leaf = this.findPinnedDailyLeaf(config);
		const content = leaf?.view.containerEl.querySelector<HTMLElement>(':scope > .view-content');
		// Reuse the message if it's still showing where it belongs (a notice can be clicked away).
		const where = this.prompt?.notice ? !content : this.prompt?.el.parentElement === leaf?.view.containerEl;
		if (this.prompt?.el.isConnected && where) {
			this.prompt.path = path;
		} else {
			this.clearPrompt();
			if (leaf && content) {
				const el = createDiv({ cls: 'btn-dn-prompt' });
				leaf.view.containerEl.insertBefore(el, content);
				this.prompt = { el, notice: null, path };
			} else {
				const notice = new Notice('', 0);
				this.prompt = { el: notice.messageEl, notice, path };
			}
		}
		const el = this.prompt.el;
		el.empty();
		el.toggleClass('is-waiting', state === 'waiting');
		setIcon(el.createSpan({ cls: 'btn-dn-prompt-icon' }), state === 'waiting' ? 'refresh-cw' : 'calendar-plus');
		el.createSpan({
			cls: 'btn-dn-prompt-text',
			text: state === 'waiting'
				? 'Waiting for sync… today\'s note may still be on its way from another device.'
				: `Today's note (${date.format('YYYY-MM-DD')}) isn't here yet.`,
		});
		const button = el.createEl('button', { cls: state === 'missing' ? 'mod-cta' : '', text: state === 'waiting' ? 'Create now' : 'Create today\'s note' });
		button.addEventListener('click', evt => {
			evt.stopPropagation();
			this.createNow = true;
			void this.openToday(true, true);
		});
	}

	private clearPrompt(): void {
		if (!this.prompt) return;
		if (this.prompt.notice) this.prompt.notice.hide();
		else this.prompt.el.remove();
		this.prompt = null;
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
