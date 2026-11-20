import { MarkdownView, Notice, Plugin, type Command, type WorkspaceLeaf } from 'obsidian';
import type { Feature } from './feature';
import { DEFAULT_SETTINGS, FEATURE_IDS, mergeSettings, type FeatureId, type PluginSettings } from './settings';
import { BetterTabsSettingTab } from './settingsTab';
import { copyHeaderReport, startHeaderTrace } from './shared/headerTrace';
import { closeOtherTabs } from './shared/closeTabs';
import { EDIT_LOG_STORE_KEY, RECENT_FILES_KEY, RECENT_ICONS_KEY, loadStrings, runsBackgroundTasks, saveStrings } from './shared/deviceMemory';
import { EDIT_LOG_KEY, applyLog, cleanLog, diffSettings, ensureIds, hasAllEdits, mergeLogs, type EditLog } from './shared/editLog';
import { SyncWatcher } from './shared/syncSettle';
import {
	sanitizeDeviceStartup, sanitizeDeviceTabSettings, type DeviceStartupSettings, type DeviceTabSettings,
} from './shared/deviceSettings';
import { TabBehaviorFeature } from './features/tabs/tabBehavior';
import { HomeTabFeature } from './features/homeTab/homeTab';
import { EditModeFeature } from './features/editMode/editMode';
import { PinnedDailyNoteFeature } from './features/dailyNote/pinnedDailyNote';
import { PinnedIconsFeature } from './features/pinnedIcons/pinnedIcons';
import { ScrollButtonsFeature } from './features/scrollButtons/scrollButtons';
import { FrontmatterCleanerFeature } from './features/frontmatterCleaner/frontmatterCleaner';
import { BulkPropertiesFeature } from './features/bulkProperties/bulkProperties';
import { TagRenameFeature } from './features/tagRename/tagRename';
import { FrontmatterLinksFeature } from './features/frontmatterLinks/frontmatterLinks';
import { NestedPropertiesFeature } from './features/nestedProperties/nestedProperties';
import { HideCommandsFeature } from './features/hideCommands/hideCommands';
import { LinkIconsFeature } from './features/linkIcons/linkIcons';
import { PropertyTemplatesFeature } from './features/propertyTemplates/propertyTemplates';
import { PinnedNotesFeature } from './features/pinnedNotes/pinnedNotes';
import { TaskSweeperFeature } from './features/taskSweeper/taskSweeper';

const DEVICE_DISABLED_PREFIX = 'better-tabs-and-notes:disabled-on-device:';
const DEVICE_TABS_KEY = 'better-tabs-and-notes:device-tab-settings';
const DEVICE_STARTUP_KEY = 'better-tabs-and-notes:device-startup';

/** Log a failure and show it, without stopping the rest of the plugin. */
export function reportError(what: string, error: unknown): void {
	console.error(`Better Tabs and Notes: ${what}`, error);
	const message = error instanceof Error ? error.message : String(error);
	new Notice(`Better Tabs and Notes: ${what}. ${message}`, 10000);
}

export default class BetterTabsPlugin extends Plugin {
	settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
	features!: {
		tabs: TabBehaviorFeature;
		homeTab: HomeTabFeature;
		editMode: EditModeFeature;
		dailyNote: PinnedDailyNoteFeature;
		pinnedIcons: PinnedIconsFeature;
		scrollButtons: ScrollButtonsFeature;
		frontmatterCleaner: FrontmatterCleanerFeature;
		bulkProperties: BulkPropertiesFeature;
		tagRename: TagRenameFeature;
		frontmatterLinks: FrontmatterLinksFeature;
		nestedProperties: NestedPropertiesFeature;
		hideCommands: HideCommandsFeature;
		linkIcons: LinkIconsFeature;
		propertyTemplates: PropertyTemplatesFeature;
		pinnedNotes: PinnedNotesFeature;
		taskSweeper: TaskSweeperFeature;
	};

	override async onload(): Promise<void> {
		this.syncWatcher = this.addChild(new SyncWatcher(this.app));
		const stored: unknown = await this.loadData();
		this.moveDeviceListsOut(stored);
		this.useStored(stored);

		this.features = {
			tabs: new TabBehaviorFeature(this),
			homeTab: new HomeTabFeature(this),
			editMode: new EditModeFeature(this),
			dailyNote: new PinnedDailyNoteFeature(this),
			pinnedIcons: new PinnedIconsFeature(this),
			scrollButtons: new ScrollButtonsFeature(this),
			frontmatterCleaner: new FrontmatterCleanerFeature(this),
			bulkProperties: new BulkPropertiesFeature(this),
			tagRename: new TagRenameFeature(this),
			frontmatterLinks: new FrontmatterLinksFeature(this),
			nestedProperties: new NestedPropertiesFeature(this),
			hideCommands: new HideCommandsFeature(this),
			linkIcons: new LinkIconsFeature(this),
			propertyTemplates: new PropertyTemplatesFeature(this),
			pinnedNotes: new PinnedNotesFeature(this),
			taskSweeper: new TaskSweeperFeature(this),
		};

		// Register the settings tab first, so it's there even if a feature fails.
		this.settingTab = new BetterTabsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.register(startHeaderTrace());
		this.addCommand({
			id: 'copy-note-header-buttons',
			name: 'Copy the note header buttons (for troubleshooting)',
			icon: 'clipboard-copy',
			callback: () => {
				const features = FEATURE_IDS.map(id => `${id} ${this.isFeatureActive(id) ? 'on' : 'off'}`).join(', ');
				const extra = [`Features: ${features}`];
				if (this.features.editMode.isLoaded) extra.push(...this.features.editMode.describe());
				void copyHeaderReport(this.app, this, extra);
			},
		});

		// Views and code block processors can only be registered by the plugin
		// itself, and must exist before the workspace restores saved tabs.
		this.features.homeTab.registerPluginParts();
		this.features.linkIcons.registerPluginParts();
		this.features.taskSweeper.registerPluginParts();

		for (const feature of Object.values(this.features) as Feature[]) {
			try {
				for (const command of feature.commands()) this.addFeatureCommand(feature, command);
			} catch (e) {
				reportError(`couldn't add the ${feature.name.toLowerCase()} commands`, e);
			}
		}

		this.syncFeatures();
		this.app.workspace.onLayoutReady(() => {
			void this.openDeviceStartPage();
			void this.repairSyncedSettings();
		});
	}

	// -----------------------------------------------------------------------
	// Settings and Sync
	// -----------------------------------------------------------------------

	/** Watches Obsidian Sync, so automatic work can wait for it to settle. */
	syncWatcher!: SyncWatcher;
	private settingTab!: BetterTabsSettingTab;
	/** Every settings edit seen on any device (also kept in this device's storage). */
	private editLog: EditLog = {};
	/** The settings as last loaded or saved, to tell what an edit changed. */
	private snapshot: PluginSettings | null = null;
	/** data.json as last read or written, so unchanged settings aren't written again. */
	private lastWritten = '';
	/** data.json is missing edits this device knows about (Sync brought back an older copy). */
	private needsRepair = false;
	private repairing = false;
	private lastEditTime = 0;

	/** Up to 0.0.34 recent notes and icons were in data.json; keep them on this device instead. */
	private moveDeviceListsOut(stored: unknown): void {
		const section = (key: string): Record<string, unknown> => {
			const value = stored && typeof stored === 'object' ? (stored as Record<string, unknown>)[key] : undefined;
			return value && typeof value === 'object' ? value as Record<string, unknown> : {};
		};
		for (const [list, key] of [[section('homeTab').recentFiles, RECENT_FILES_KEY], [section('pinnedIcons').recentIcons, RECENT_ICONS_KEY]] as const) {
			if (Array.isArray(list) && loadStrings(this.app, key) === null) {
				saveStrings(this.app, key, list.filter((s): s is string => typeof s === 'string'));
			}
		}
	}

	/** Take the settings from data.json, with the newest edits from every device laid over them. */
	private useStored(stored: unknown): void {
		this.lastWritten = JSON.stringify(stored ?? null);
		const fileLog = cleanLog(stored && typeof stored === 'object' ? (stored as Record<string, unknown>)[EDIT_LOG_KEY] : undefined);
		const known = cleanLog(this.app.loadLocalStorage(EDIT_LOG_STORE_KEY));
		this.editLog = mergeLogs(known, fileLog);
		if (!hasAllEdits(known, this.editLog)) this.app.saveLocalStorage(EDIT_LOG_STORE_KEY, this.editLog);
		this.needsRepair = !hasAllEdits(fileLog, this.editLog);
		const settings = mergeSettings(stored);
		ensureIds(settings as unknown as Record<string, unknown>);
		applyLog(settings as unknown as Record<string, unknown>, this.editLog);
		this.settings = settings;
		this.snapshot = structuredClone(settings);
	}

	/** Log what changed since the last load or save, as edits made now on this device. Returns whether anything did. */
	private captureEdits(): boolean {
		ensureIds(this.settings as unknown as Record<string, unknown>);
		if (!this.snapshot) return false;
		this.lastEditTime = Math.max(Date.now(), this.lastEditTime + 1);
		const edits = diffSettings(this.snapshot as unknown as Record<string, unknown>, this.settings as unknown as Record<string, unknown>, this.lastEditTime);
		this.snapshot = structuredClone(this.settings);
		if (Object.keys(edits).length === 0) return false;
		this.editLog = mergeLogs(this.editLog, edits);
		this.app.saveLocalStorage(EDIT_LOG_STORE_KEY, this.editLog);
		return true;
	}

	/** Write data.json, unless it would be the same as what's there. */
	private async writeSettings(): Promise<void> {
		const data = { ...this.settings, [EDIT_LOG_KEY]: this.editLog };
		const text = JSON.stringify(data);
		if (text === this.lastWritten) return;
		this.lastWritten = text;
		this.needsRepair = false;
		await this.saveData(data);
	}

	/** data.json changed on disk, e.g. synced from another device: merge it with what this device knows. */
	override async onExternalSettingsChange(): Promise<void> {
		const stored: unknown = await this.loadData();
		if (JSON.stringify(stored ?? null) === this.lastWritten) return;
		// Edits made here but not saved yet are kept.
		this.captureEdits();
		const before = JSON.stringify(this.settings);
		this.useStored(stored);
		if (JSON.stringify(this.settings) !== before) {
			this.syncFeatures();
			for (const feature of Object.values(this.features) as Feature[]) {
				if (feature.isLoaded) feature.onSettingsChange();
			}
			// The settings page would otherwise keep editing the old copy.
			if (this.settingsOpen) this.settingTab.display();
		}
		void this.repairSyncedSettings();
	}

	/**
	 * If Sync brought back an older data.json that lacks edits this device knows,
	 * write them back. Only on the device that runs background tasks, after Sync
	 * has settled.
	 */
	private async repairSyncedSettings(): Promise<void> {
		if (!this.needsRepair || this.repairing || !runsBackgroundTasks(this.app)) return;
		this.repairing = true;
		try {
			await this.syncWatcher.waitUntilSettled();
			// Take in anything that arrived while waiting, then write only if still needed.
			const stored: unknown = await this.loadData();
			if (JSON.stringify(stored ?? null) !== this.lastWritten) await this.onExternalSettingsChange();
			if (this.needsRepair) await this.writeSettings();
		} catch (e) {
			console.error('Better Tabs and Notes: couldn\'t repair the synced settings', e);
		} finally {
			this.repairing = false;
		}
	}

	/** Load or unload features to match the current settings. */
	syncFeatures(): void {
		for (const id of FEATURE_IDS) {
			const feature = this.features[id] as Feature;
			const wanted = this.isFeatureActive(id);
			try {
				if (wanted && !feature.isLoaded) this.addChild(feature);
				else if (!wanted && feature.isLoaded) this.removeChild(feature);
			} catch (e) {
				reportError(`${feature.name} failed to ${wanted ? 'start' : 'stop'}`, e);
			}
		}
	}

	isFeatureActive(id: FeatureId): boolean {
		return this.settings.features[id] && !this.isDisabledOnDevice(id);
	}

	isDisabledOnDevice(id: FeatureId): boolean {
		return !!this.app.loadLocalStorage(DEVICE_DISABLED_PREFIX + id);
	}

	/** Tab settings for this device only (not synced). */
	getDeviceTabSettings(): DeviceTabSettings {
		return sanitizeDeviceTabSettings(this.app.loadLocalStorage(DEVICE_TABS_KEY));
	}

	setDeviceTabSettings(settings: DeviceTabSettings): void {
		const clean = sanitizeDeviceTabSettings(settings);
		this.app.saveLocalStorage(DEVICE_TABS_KEY, Object.keys(clean).length ? clean : null);
	}

	/** What opens at startup on this device (not synced). */
	getDeviceStartup(): DeviceStartupSettings {
		return sanitizeDeviceStartup(this.app.loadLocalStorage(DEVICE_STARTUP_KEY));
	}

	setDeviceStartup(settings: DeviceStartupSettings): void {
		const clean = sanitizeDeviceStartup(settings);
		this.app.saveLocalStorage(DEVICE_STARTUP_KEY, Object.keys(clean).length ? clean : null);
	}

	/** Open the start page chosen for this device, if any. */
	private async openDeviceStartPage(): Promise<void> {
		const startup = this.getDeviceStartup();
		const { workspace } = this.app;
		try {
			switch (startup.page) {
				case undefined:
				case 'nothing':
					return;
				case 'home':
					if (!this.features.homeTab.isLoaded) {
						new Notice('The start page is set to the home tab, but the home tab feature is off.');
						return;
					}
					await this.features.homeTab.showOnStart(!!startup.closeOthers);
					return;
				case 'daily':
					if (!this.features.dailyNote.isLoaded) {
						new Notice('The start page is set to the daily note, but the pinned daily note feature is off.');
						return;
					}
					await this.features.dailyNote.openToday();
					// The daily note's tab is pinned, so it stays.
					if (startup.closeOthers) closeOtherTabs(this.app, null);
					return;
				case 'note': {
					const file = startup.notePath ? this.app.vault.getFileByPath(startup.notePath) : null;
					if (!file) {
						new Notice(`Couldn't find the start page "${startup.notePath ?? ''}".`);
						return;
					}
					let leaf: WorkspaceLeaf | null = null;
					workspace.iterateRootLeaves(l => {
						if (!leaf && l.view instanceof MarkdownView && l.view.file?.path === file.path) leaf = l;
					});
					if (!leaf) {
						const recent = workspace.getMostRecentLeaf();
						leaf = recent?.view.getViewType() === 'empty' ? recent : workspace.getLeaf('tab');
						await leaf.openFile(file);
					}
					await workspace.revealLeaf(leaf);
					workspace.setActiveLeaf(leaf, { focus: true });
					if (startup.closeOthers) closeOtherTabs(this.app, leaf);
					return;
				}
			}
		} catch (e) {
			reportError('couldn\'t open the start page', e);
		}
	}

	setDisabledOnDevice(id: FeatureId, disabled: boolean): void {
		this.app.saveLocalStorage(DEVICE_DISABLED_PREFIX + id, disabled ? true : null);
		this.syncFeatures();
	}

	/** Whether this plugin's settings tab is showing, so features can hold back redraws of open notes. */
	settingsOpen = false;

	/** The settings tab was closed: let features catch up on redraws they held back. */
	onSettingsClosed(): void {
		this.settingsOpen = false;
		for (const feature of Object.values(this.features) as Feature[]) {
			if (!feature.isLoaded) continue;
			try {
				feature.onSettingsClosed();
			} catch (e) {
				reportError(`${feature.name} couldn't apply its settings`, e);
			}
		}
	}

	async saveSettings(changed?: FeatureId): Promise<void> {
		// Nothing changed: don't touch data.json (and so don't give Sync anything to carry).
		if (this.captureEdits()) await this.writeSettings();
		if (changed) {
			const feature = this.features[changed] as Feature;
			if (feature.isLoaded) feature.onSettingsChange();
		}
	}

	private addFeatureCommand(feature: Feature, command: Command): void {
		const { callback, checkCallback } = command;
		this.addCommand({
			...command,
			callback: undefined,
			checkCallback: (checking: boolean) => {
				if (!feature.isLoaded) return false;
				if (checkCallback) return checkCallback(checking);
				if (!checking) callback?.();
				return true;
			},
		});
	}
}
