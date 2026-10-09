import { Plugin, type Command } from 'obsidian';
import type { Feature } from './feature';
import { DEFAULT_SETTINGS, FEATURE_IDS, mergeSettings, type FeatureId, type PluginSettings } from './settings';
import { BetterTabsSettingTab } from './settingsTab';
import { TabBehaviorFeature } from './features/tabs/tabBehavior';
import { HomeTabFeature } from './features/homeTab/homeTab';
import { EditModeFeature } from './features/editMode/editMode';
import { PinnedDailyNoteFeature } from './features/dailyNote/pinnedDailyNote';
import { PinnedIconsFeature } from './features/pinnedIcons/pinnedIcons';

const DEVICE_DISABLED_PREFIX = 'better-tabs-and-notes:disabled-on-device:';

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

		// Views and code block processors can only be registered by the plugin
		// itself, and must exist before the workspace restores saved tabs.
		this.features.homeTab.registerPluginParts();

		for (const feature of Object.values(this.features)) {
			for (const command of feature.commands()) this.addFeatureCommand(feature, command);
		}

		this.addSettingTab(new BetterTabsSettingTab(this.app, this));
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
			if (wanted && !feature.isLoaded) this.addChild(feature);
			else if (!wanted && feature.isLoaded) this.removeChild(feature);
		}
	}

	isFeatureActive(id: FeatureId): boolean {
		return this.settings.features[id] && !this.isDisabledOnDevice(id);
	}

	isDisabledOnDevice(id: FeatureId): boolean {
		return !!this.app.loadLocalStorage(DEVICE_DISABLED_PREFIX + id);
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
