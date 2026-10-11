import { Notice, Plugin, type Command } from 'obsidian';
import type { Feature } from './feature';
import { DEFAULT_SETTINGS, FEATURE_IDS, mergeSettings, type FeatureId, type PluginSettings } from './settings';
import { BetterTabsSettingTab } from './settingsTab';
import { copyHeaderReport, startHeaderTrace } from './shared/headerTrace';
import { sanitizeDeviceTabSettings, type DeviceTabSettings } from './shared/deviceSettings';
import { TabBehaviorFeature } from './features/tabs/tabBehavior';
import { HomeTabFeature } from './features/homeTab/homeTab';
import { EditModeFeature } from './features/editMode/editMode';
import { PinnedDailyNoteFeature } from './features/dailyNote/pinnedDailyNote';
import { PinnedIconsFeature } from './features/pinnedIcons/pinnedIcons';

const DEVICE_DISABLED_PREFIX = 'better-tabs-and-notes:disabled-on-device:';
const DEVICE_TABS_KEY = 'better-tabs-and-notes:device-tab-settings';

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
	};

	override async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());

		this.features = {
			tabs: new TabBehaviorFeature(this),
			homeTab: new HomeTabFeature(this),
			editMode: new EditModeFeature(this),
			dailyNote: new PinnedDailyNoteFeature(this),
			pinnedIcons: new PinnedIconsFeature(this),
		};

		// Register the settings tab first, so it's there even if a feature fails.
		this.addSettingTab(new BetterTabsSettingTab(this.app, this));

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

		for (const feature of Object.values(this.features) as Feature[]) {
			try {
				for (const command of feature.commands()) this.addFeatureCommand(feature, command);
			} catch (e) {
				reportError(`couldn't add the ${feature.name.toLowerCase()} commands`, e);
			}
		}

		this.syncFeatures();
	}

	/** data.json changed on disk, e.g. synced from another device. */
	override async onExternalSettingsChange(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.syncFeatures();
		for (const feature of Object.values(this.features) as Feature[]) {
			if (feature.isLoaded) feature.onSettingsChange();
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

	setDisabledOnDevice(id: FeatureId, disabled: boolean): void {
		this.app.saveLocalStorage(DEVICE_DISABLED_PREFIX + id, disabled ? true : null);
		this.syncFeatures();
	}

	async saveSettings(changed?: FeatureId): Promise<void> {
		await this.saveData(this.settings);
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
