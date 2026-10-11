import { App, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type BetterTabsPlugin from './main';
import {
	DEFAULT_SETTINGS, MOD_CLICK_BEHAVIORS, NEW_TAB_GROUP_PLACEMENTS, NEW_TAB_PLACEMENTS,
	type ColorChoice, type EditMode, type FeatureId, type FontChoice, type LogoType, type TabSettings,
} from './settings';
import { LEGACY_PLUGINS, importLegacySettings } from './legacyImport';
import { FOCUS_NEW_TABS, type DeviceTabSettings } from './shared/deviceSettings';
import { FilePickerModal, FolderPickerModal, PatternEditorModal, TagPickerModal } from './features/pinnedIcons/modals';
import { RULE_TYPE_LABELS, findConflicts, ruleMatches } from './features/pinnedIcons/rules';
import { renderIcon } from './features/pinnedIcons/pinnedIcons';

const FEATURE_INFO: Record<FeatureId, { name: string; desc: string }> = {
	homeTab: {
		name: 'Home tab',
		desc: 'A start page with a search bar, bookmarks and recent files that replaces empty new tabs.',
	},
	tabs: {
		name: 'Tab behaviour',
		desc: 'Open files in new tabs, switch to a file that is already open instead of duplicating it, and choose where new tabs go.',
	},
	editMode: {
		name: 'Edit mode switch',
		desc: 'A button in the note header for switching between live preview, source mode and reading view.',
	},
	dailyNote: {
		name: 'Pinned daily note',
		desc: "A command and ribbon button that show today's daily note in one pinned tab.",
	},
	pinnedIcons: {
		name: 'Pinned tab icons',
		desc: 'Shrink pinned tabs to an icon, chosen per file, folder, name pattern, tag or frontmatter property.',
	},
	scrollButtons: {
		name: 'Scroll buttons',
		desc: 'Small buttons in the corner of each note to jump to the top, the bottom, or back to the cursor.',
	},
	frontmatterCleaner: {
		name: 'Frontmatter cleaner',
		desc: 'Review the current note\'s properties in a list and delete the ones you pick, or all the empty ones at once.',
	},
	bulkProperties: {
		name: 'Bulk properties',
		desc: 'Add, change or remove properties in every note of a folder, or in the notes selected in the file explorer.',
	},
};

const COLOR_OPTIONS: Record<ColorChoice, string> = { default: 'Theme default', accent: 'Accent color', custom: 'Custom' };

export class BetterTabsSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: BetterTabsPlugin) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('btn-settings');

		const stillOn = LEGACY_PLUGINS
			.filter(([id]) => this.app.plugins.enabledPlugins.has(id))
			.map(([, name]) => name);
		if (stillOn.length > 0) {
			containerEl.createDiv({
				cls: 'btn-settings-warning',
				text: `Still turned on: ${stillOn.join(', ')}. Import their settings below, then turn them off in Community plugins; running both versions makes them fight over the same tabs.`,
			});
		}

		new Setting(containerEl)
			.setName('Import from the original plugins')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			.setDesc('Copy settings from Home tab, Open Tab Settings, Mononote, Edit mode switch, Pinned Daily Notes, Pinned Tabs Customizer, Scroll to Top, Frontmatter Cleaner and Multi Properties if they are still installed. Turn the originals off afterwards so they don\'t fight with this plugin.')
			.addButton(btn => btn.setButtonText('Import').onClick(async () => {
				const imported = await importLegacySettings(this.app, this.plugin.settings);
				if (imported.length === 0) {
					new Notice('No settings from the original plugins were found.');
					return;
				}
				await this.plugin.saveSettings();
				for (const feature of Object.values(this.plugin.features)) {
					if (feature.isLoaded) feature.onSettingsChange();
				}
				new Notice(`Imported settings from: ${imported.join(', ')}.`);
				this.redraw();
			}));

		this.section('homeTab', el => this.renderHomeTab(el));
		this.section('tabs', el => this.renderTabs(el));
		this.section('editMode', el => this.renderEditMode(el));
		this.section('dailyNote', el => this.renderDailyNote(el));
		this.section('pinnedIcons', el => this.renderPinnedIcons(el));
		this.section('scrollButtons', el => this.renderScrollButtons(el));
		this.section('frontmatterCleaner', el => this.renderFrontmatterCleaner(el));
		this.section('bulkProperties', el => this.renderBulkProperties(el));
	}

	/** Heading, on/off toggles, and the feature's own settings when it's on. */
	private section(id: FeatureId, render: (el: HTMLElement) => void): void {
		const info = FEATURE_INFO[id];
		const { containerEl, plugin } = this;
		new Setting(containerEl).setName(info.name).setHeading();
		new Setting(containerEl)
			.setName(`Use ${info.name.toLowerCase()}`)
			.setDesc(info.desc)
			.addToggle(t => t.setValue(plugin.settings.features[id]).onChange(async value => {
				plugin.settings.features[id] = value;
				await plugin.saveSettings();
				plugin.syncFeatures();
				this.redraw();
			}));
		if (!plugin.settings.features[id]) return;
		new Setting(containerEl)
			.setName('Turn off on this device')
			.setDesc('Not synced. Useful when a feature only makes sense on desktop or on mobile.')
			.addToggle(t => t.setValue(plugin.isDisabledOnDevice(id)).onChange(value => {
				plugin.setDisabledOnDevice(id, value);
				this.redraw();
			}));
		if (plugin.isDisabledOnDevice(id)) return;
		render(containerEl.createDiv({ cls: 'btn-settings-group' }));
	}

	/**
	 * Rebuild the page after a setting that shows or hides other settings,
	 * keeping the scroll position instead of jumping back to the top.
	 */
	private redraw(): void {
		const scrollers = [this.containerEl, this.containerEl.parentElement].filter((el): el is HTMLElement => !!el);
		const positions = scrollers.map(el => el.scrollTop);
		this.display();
		const restore = () => scrollers.forEach((el, i) => { el.scrollTop = positions[i]; });
		restore();
		// Some controls finish laying out a frame later; restore again then.
		window.requestAnimationFrame(restore);
	}

	private save(id: FeatureId, redraw = false): Promise<void> {
		return this.plugin.saveSettings(id).then(() => {
			if (redraw) this.redraw();
		});
	}

	// -----------------------------------------------------------------------

	private renderHomeTab(el: HTMLElement): void {
		const s = this.plugin.settings.homeTab;
		const save = (redraw = false) => this.save('homeTab', redraw);

		new Setting(el).setName('Replace new tabs with the home tab')
			.addToggle(t => t.setValue(s.replaceNewTabs).onChange(v => { s.replaceNewTabs = v; void save(); }));
		new Setting(el).setName('Open the home tab when Obsidian starts')
			.setDesc('Focuses an existing home tab instead if there is one.')
			.addToggle(t => t.setValue(s.openOnStart).onChange(v => { s.openOnStart = v; void save(true); }));
		if (s.openOnStart) {
			new Setting(el).setName('Close other tabs on start')
				.setDesc('Leaves only the home tab and pinned tabs open.')
				.addToggle(t => t.setValue(s.closePreviousSessionTabs).onChange(v => { s.closePreviousSessionTabs = v; void save(); }));
		}

		new Setting(el).setName('Search').setHeading();
		if (this.app.plugins.getPlugin('omnisearch')) {
			new Setting(el)
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
				.setName('Use Omnisearch')
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
				.setDesc('Search note contents with Omnisearch instead of matching file names.')
				.addToggle(t => t.setValue(s.useOmnisearch).onChange(v => { s.useOmnisearch = v; void save(true); }));
			new Setting(el)
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
				.setName('Show Omnisearch excerpts')
				.addToggle(t => t.setValue(s.showOmnisearchExcerpt).onChange(v => { s.showOmnisearchExcerpt = v; void save(); }));
		}
		new Setting(el).setName('Only search notes')
			.setDesc('Leave out attachments unless you filter for them. Type a file type or extension and press tab to filter.')
			.addToggle(t => t.setValue(s.markdownOnly).onChange(v => { s.markdownOnly = v; void save(); }));
		new Setting(el).setName('Show notes that don\'t exist yet')
			.setDesc('Include unresolved links in the results.')
			.addToggle(t => t.setValue(s.showUnresolved).onChange(v => { s.showUnresolved = v; void save(); }));
		new Setting(el).setName('Show folder')
			.addToggle(t => t.setValue(s.showPath).onChange(v => { s.showPath = v; void save(); }));
		new Setting(el).setName('Show keyboard shortcuts')
			.addToggle(t => t.setValue(s.showShortcuts).onChange(v => { s.showShortcuts = v; void save(); }));
		new Setting(el).setName('Number of results')
			.addSlider(sl => sl.setLimits(1, 25, 1).setValue(s.maxResults).setDynamicTooltip()
				.onChange(v => { s.maxResults = v; void save(); }));
		new Setting(el).setName('Web search address')
			.setDesc('Used after typing "web" and pressing tab. %s is replaced by the search.')
			.addText(t => t.setValue(s.webSearchUrl).onChange(v => {
				s.webSearchUrl = v.includes('%s') ? v : DEFAULT_SETTINGS.homeTab.webSearchUrl;
				void save();
			}));

		new Setting(el).setName('Lists').setHeading();
		new Setting(el).setName('Show bookmarks')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			.setDesc('Needs the Bookmarks core plugin.')
			.addToggle(t => t.setValue(s.showBookmarks).onChange(v => { s.showBookmarks = v; void save(); }));
		new Setting(el).setName('Show recent files')
			.addToggle(t => t.setValue(s.showRecentFiles).onChange(v => { s.showRecentFiles = v; void save(true); }));
		if (s.showRecentFiles) {
			new Setting(el).setName('Remember recent files between sessions')
				.addToggle(t => t.setValue(s.storeRecentFiles).onChange(v => {
					s.storeRecentFiles = v;
					if (!v) s.recentFiles = [];
					void save();
				}));
			new Setting(el).setName('Number of recent files')
				.addSlider(sl => sl.setLimits(1, 25, 1).setValue(s.maxRecentFiles).setDynamicTooltip()
					.onChange(v => { s.maxRecentFiles = v; void save(); }));
		}

		new Setting(el).setName('Appearance').setHeading();
		const logoTypes: Record<LogoType, string> = {
			obsidian: 'Obsidian logo', icon: 'Icon', imagePath: 'Image in vault', imageLink: 'Image link', none: 'None',
		};
		new Setting(el).setName('Logo')
			.addDropdown(dd => dd.addOptions(logoTypes).setValue(s.logoType)
				.onChange(v => { s.logoType = v as LogoType; void save(true); }));
		if (s.logoType === 'icon') {
			new Setting(el).setName('Logo icon')
				.setDesc('The name of any icon, such as home, star or book-open.')
				.addText(t => t.setValue(s.logoIcon).onChange(v => { s.logoIcon = v.trim(); void save(); }));
			this.colorSetting(el, 'Logo color', s.logoColorType, s.logoColor, (type, color) => {
				s.logoColorType = type;
				s.logoColor = color;
			}, 'homeTab');
		} else if (s.logoType === 'imagePath') {
			new Setting(el).setName('Image path')
				.setDesc('Path of an image in the vault, e.g. attachments/logo.png.')
				.addText(t => t.setValue(s.logoImagePath).onChange(v => { s.logoImagePath = v.trim(); void save(); }));
		} else if (s.logoType === 'imageLink') {
			new Setting(el).setName('Image link')
				.addText(t => t.setValue(s.logoImageLink).onChange(v => { s.logoImageLink = v.trim(); void save(); }));
		}
		if (s.logoType !== 'none') {
			new Setting(el).setName('Logo size')
				.setDesc('Relative to the title size.')
				.addSlider(sl => sl.setLimits(0.3, 3, 0.1).setValue(s.logoScale).setDynamicTooltip()
					.onChange(v => { s.logoScale = v; void save(); }));
		}
		new Setting(el).setName('Title')
			.addText(t => t.setValue(s.title).onChange(v => { s.title = v; void save(); }));
		const fonts: Record<FontChoice, string> = { interface: 'Interface font', text: 'Text font', monospace: 'Monospace font', custom: 'Custom' };
		new Setting(el).setName('Title font')
			.addDropdown(dd => dd.addOptions(fonts).setValue(s.font).onChange(v => { s.font = v as FontChoice; void save(true); }));
		if (s.font === 'custom') {
			new Setting(el).setName('Custom font')
				.setDesc('Name of an installed font.')
				.addText(t => t.setValue(s.customFont).onChange(v => { s.customFont = v; void save(); }));
		}
		new Setting(el).setName('Title size')
			.setDesc('Any CSS size, e.g. 4em or 48px.')
			.addText(t => t.setValue(s.fontSize).onChange(v => {
				if (CSS.supports('font-size', v)) { s.fontSize = v; void save(); }
			}));
		new Setting(el).setName('Title weight')
			.addSlider(sl => sl.setLimits(100, 900, 100).setValue(s.fontWeight).setDynamicTooltip()
				.onChange(v => { s.fontWeight = v; void save(); }));
		this.colorSetting(el, 'Title color', s.fontColorType, s.fontColor, (type, color) => {
			s.fontColorType = type;
			s.fontColor = color;
		}, 'homeTab');
		new Setting(el).setName('Accent color for the selected result')
			.addToggle(t => t.setValue(s.accentSelection).onChange(v => { s.accentSelection = v; void save(); }));
	}

	private colorSetting(
		el: HTMLElement, name: string, type: ColorChoice, color: string,
		set: (type: ColorChoice, color: string) => void, id: FeatureId,
	): void {
		const setting = new Setting(el).setName(name);
		if (type === 'custom') {
			setting.addColorPicker(cp => cp.setValue(color).onChange(v => { set(type, v); void this.save(id); }));
		}
		setting.addDropdown(dd => dd.addOptions(COLOR_OPTIONS).setValue(type).onChange(v => {
			set(v as ColorChoice, color);
			void this.save(id, true);
		}));
	}

	// -----------------------------------------------------------------------

	private renderTabs(el: HTMLElement): void {
		const tabs = this.plugin.features.tabs;
		const s = this.plugin.settings.tabs;
		const update = async (changes: Partial<TabSettings>) => {
			await tabs.updateSettings(changes);
			this.redraw();
		};

		new Setting(el).setName('Always open in new tab')
			.setDesc('Open files in a new tab by default, from links, the file explorer, search and so on.')
			.addToggle(t => t.setValue(s.openInNewTab).onChange(v => void update({ openInNewTab: v })));
		new Setting(el).setName('Preview tabs')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			.setDesc('Like VS Code: new tabs open as an italic preview that the next file replaces, until you edit it or double-click its tab. Needs "Always open in new tab".')
			.setDisabled(!s.openInNewTab)
			.addToggle(t => t.setValue(s.previewTabs).setDisabled(!s.openInNewTab).onChange(v => void update({ previewTabs: v })));
		new Setting(el).setName('Prevent duplicate tabs')
			.setDesc('If a file is already open, switch to its tab instead of opening it again.')
			.addToggle(t => t.setValue(s.deduplicateTabs).onChange(v => void update({ deduplicateTabs: v })));
		new Setting(el).setName('Prevent duplicates in other splits too')
			.setDesc('Switch to the open file even when it\'s in another split or a popout window.')
			.setDisabled(!s.deduplicateTabs)
			.addToggle(t => t.setValue(s.deduplicateAcrossTabGroups).setDisabled(!s.deduplicateTabs)
				.onChange(v => void update({ deduplicateAcrossTabGroups: v })));
		new Setting(el).setName('Focus tabs opened with ctrl or middle click')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			.setDesc('Same as "Always focus new tabs" in Obsidian\'s editor settings. Tabs opened by a normal click are always focused.')
			.addToggle(t => t.setValue(!!this.app.vault.getConfig('focusNewTab'))
				.onChange(v => this.app.vault.setConfig('focusNewTab', v)));
		new Setting(el).setName('New tab position')
			.addDropdown(dd => dd.addOptions(NEW_TAB_PLACEMENTS).setValue(s.newTabPlacement)
				.onChange(v => void update({ newTabPlacement: v as TabSettings['newTabPlacement'] })));
		new Setting(el).setName('New tab position when split')
			.addDropdown(dd => dd.addOptions(NEW_TAB_GROUP_PLACEMENTS).setValue(s.newTabTabGroupPlacement)
				.onChange(v => void update({ newTabTabGroupPlacement: v as TabSettings['newTabTabGroupPlacement'] })));

		this.renderDeviceTabSettings(el);

		const modOptions: Partial<Record<TabSettings['modClickBehavior'], string>> = { tab: MOD_CLICK_BEHAVIORS.tab };
		if (s.openInNewTab) modOptions.same = MOD_CLICK_BEHAVIORS.same;
		if (s.deduplicateTabs) modOptions.allowDuplicate = MOD_CLICK_BEHAVIORS.allowDuplicate;
		modOptions.opposite = MOD_CLICK_BEHAVIORS.opposite;
		if (s.previewTabs) modOptions.noPreview = MOD_CLICK_BEHAVIORS.noPreview;
		if (s.newTabPlacement !== 'afterActive') modOptions.placeAfterActive = MOD_CLICK_BEHAVIORS.placeAfterActive;
		if (s.newTabPlacement !== 'beginning') modOptions.placeAtBeginning = MOD_CLICK_BEHAVIORS.placeAtBeginning;
		if (s.newTabPlacement !== 'end') modOptions.placeAtEnd = MOD_CLICK_BEHAVIORS.placeAtEnd;
		new Setting(el).setName('Ctrl/cmd/middle click opens links...')
			.addDropdown(dd => dd.addOptions(modOptions).setValue(s.modClickBehavior)
				.onChange(v => void update({ modClickBehavior: v as TabSettings['modClickBehavior'] })));

		new Setting(el).setName('Close duplicates that slip through')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			.setDesc('Mononote\'s approach: if a file still ends up open twice in the same split (e.g. opened by another plugin), go back in the new tab or close it, and switch to the existing one.')
			.addToggle(t => t.setValue(s.closeLateDuplicates).onChange(v => void update({ closeLateDuplicates: v })));
		if (s.closeLateDuplicates) {
			new Setting(el).setName('Delay before closing')
				.setDesc('Increase this if a tab switches and then immediately switches back.')
				.addDropdown(dd => {
					for (const ms of [100, 150, 200, 300, 500]) dd.addOption(String(ms), `${ms} ms`);
					dd.setValue(String(s.lateDuplicateDelayMs)).onChange(v => void update({ lateDuplicateDelayMs: Number(v) }));
				});
		}
	}

	/** Tab choices stored on this device only, overriding the shared ones above. */
	private renderDeviceTabSettings(el: HTMLElement): void {
		const device = this.plugin.getDeviceTabSettings();
		const SHARED = '';
		const set = (changes: Partial<DeviceTabSettings>) => {
			this.plugin.setDeviceTabSettings({ ...device, ...changes });
			this.redraw();
		};

		new Setting(el).setName('On this device only').setHeading()
			.setDesc('Not synced. Leave on "same as other devices" to use the settings above.');
		new Setting(el).setName('Switch to new tabs')
			.setDesc('Whether a newly opened tab comes to the front.')
			.addDropdown(dd => dd
				.addOptions({ [SHARED]: 'Same as other devices', ...FOCUS_NEW_TABS })
				.setValue(device.focusNewTabs ?? SHARED)
				.onChange(v => set({ focusNewTabs: (v || undefined) as DeviceTabSettings['focusNewTabs'] })));
		new Setting(el).setName('New tab position')
			.addDropdown(dd => dd
				.addOptions({ [SHARED]: 'Same as other devices', ...NEW_TAB_PLACEMENTS })
				.setValue(device.newTabPlacement ?? SHARED)
				.onChange(v => set({ newTabPlacement: (v || undefined) as DeviceTabSettings['newTabPlacement'] })));
		new Setting(el).setName('New tab position when split')
			.addDropdown(dd => dd
				.addOptions({ [SHARED]: 'Same as other devices', ...NEW_TAB_GROUP_PLACEMENTS })
				.setValue(device.newTabTabGroupPlacement ?? SHARED)
				.onChange(v => set({ newTabTabGroupPlacement: (v || undefined) as DeviceTabSettings['newTabTabGroupPlacement'] })));
	}

	// -----------------------------------------------------------------------

	private renderEditMode(el: HTMLElement): void {
		const s = this.plugin.settings.editMode;
		const save = (redraw = false) => this.save('editMode', redraw);

		if (this.app.vault.getConfig('livePreview') === false) {
			el.createDiv({ cls: 'btn-settings-warning', text: 'Live preview is turned off in Obsidian\'s editor settings, so switching to it won\'t work.' });
		}

		new Setting(el).setName('Switch button')
			.setDesc('Taking over Obsidian\'s reading/editing button adds nothing to the note header, so other plugins\' header buttons (like Commander\'s) keep their place. With no button, use the commands instead, e.g. as Commander buttons: "Switch to next editing mode", "Switch to live preview", "Switch to source mode" and "Switch to reading view".')
			.addDropdown(dd => dd
				.addOptions({
					replace: 'Take over Obsidian\'s reading/editing button',
					extra: 'Add a separate button',
					none: 'No button (commands only)',
				})
				.setValue(s.buttonPlace)
				.onChange(v => { s.buttonPlace = v as typeof s.buttonPlace; void save(true); }));

		if (s.buttonPlace !== 'replace') {
			new Setting(el).setName('Include reading view')
				.setDesc('Cycle through reading view too, in the order below.')
				.addToggle(t => t.setValue(s.includeReadingMode).onChange(v => { s.includeReadingMode = v; void save(true); }));
		}
		if (s.buttonPlace === 'extra') {
			new Setting(el).setName('One button per mode')
				.setDesc('Show a button for every mode, with the current one highlighted, instead of one button that cycles.')
				.addToggle(t => t.setValue(s.oneButtonPerMode).onChange(v => { s.oneButtonPerMode = v; void save(true); }));
		}
		if (!s.oneButtonPerMode || s.buttonPlace !== 'extra') {
			new Setting(el).setName('Show the next mode\'s icon')
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
				.setDesc('Show the icon of the mode a click switches to, instead of the current mode. Also applies to a Commander button for "Switch to next editing mode".')
				.addToggle(t => t.setValue(s.showNextModeIcon).onChange(v => { s.showNextModeIcon = v; void save(); }));
		}
		new Setting(el).setName('Fold properties in reading view')
			.setDesc('Collapse the properties block whenever a note switches into reading view. Click its heading to unfold it.')
			.addToggle(t => t.setValue(s.collapsePropertiesInReading).onChange(v => { s.collapsePropertiesInReading = v; void save(); }));

		if (s.includeReadingMode || s.buttonPlace === 'replace') {
			new Setting(el).setName('Order').setHeading();
			const labels: Record<EditMode, string> = { live: 'Live preview', source: 'Source mode', preview: 'Reading view' };
			const order = [...new Set([...s.order, 'live', 'source', 'preview'] as EditMode[])];
			order.forEach((mode, i) => {
				new Setting(el).setName(labels[mode])
					.addExtraButton(b => b.setIcon('chevron-up').setTooltip('Move up').setDisabled(i === 0).onClick(() => {
						[order[i - 1], order[i]] = [order[i], order[i - 1]];
						s.order = order;
						void save(true);
					}))
					.addExtraButton(b => b.setIcon('chevron-down').setTooltip('Move down').setDisabled(i === order.length - 1).onClick(() => {
						[order[i + 1], order[i]] = [order[i], order[i + 1]];
						s.order = order;
						void save(true);
					}));
			});
		}
	}

	// -----------------------------------------------------------------------

	private renderDailyNote(el: HTMLElement): void {
		const s = this.plugin.settings.dailyNote;
		const save = (redraw = false) => this.save('dailyNote', redraw);

		new Setting(el).setName('Daily notes settings from')
			.setDesc('Where the folder, date format and template come from.')
			.addDropdown(dd => dd
				.addOptions({ 'daily-notes': 'Daily notes (core plugin)', 'periodic-notes': 'Periodic Notes (community plugin)' })
				.setValue(s.source).onChange(v => { s.source = v as typeof s.source; void save(); }));
		new Setting(el).setName('Where to pin a new daily note tab')
			.setDesc('Only used when there is no pinned daily note tab yet. Move the tab anywhere afterwards and it stays there.')
			.addDropdown(dd => dd
				.addOptions({ editor: 'Editor', left: 'Left sidebar', right: 'Right sidebar' })
				.setValue(s.pinLocation).onChange(v => { s.pinLocation = v as typeof s.pinLocation; void save(); }));
		new Setting(el).setName('Show ribbon button')
			.addToggle(t => t.setValue(s.showRibbonIcon).onChange(v => { s.showRibbonIcon = v; void save(); }));
		new Setting(el).setName('Open on start')
			.setDesc("Show today's note in the pinned tab when Obsidian starts.")
			.addToggle(t => t.setValue(s.openOnStart).onChange(v => { s.openOnStart = v; void save(); }));
		new Setting(el).setName('Move to the new day at midnight')
			.setDesc('If Obsidian is open past midnight, switch the pinned tab to the new daily note (creating it if needed).')
			.addToggle(t => t.setValue(s.rollOver).onChange(v => { s.rollOver = v; void save(); }));
	}

	// -----------------------------------------------------------------------

	private renderBulkProperties(el: HTMLElement): void {
		const s = this.plugin.settings.bulkProperties;
		const save = () => this.save('bulkProperties');

		el.createDiv({
			cls: 'setting-item-description btn-settings-note',
			text: 'Right-click a folder, or select several notes in the file explorer and right-click them, then choose "Add or change properties" or "Remove properties".',
		});
		new Setting(el).setName('If a note already has the property')
			.setDesc('The default when adding properties; you can change it in the form each time.')
			.addDropdown(dd => dd
				.addOptions({ ignore: 'Leave it as it is', overwrite: 'Replace its value', append: 'Add to its list of values' })
				.setValue(s.existingMode).onChange(v => { s.existingMode = v as typeof s.existingMode; void save(); }));
		new Setting(el).setName('Include subfolders')
			.setDesc('When working on a folder, also change the notes in the folders inside it.')
			.addToggle(t => t.setValue(s.includeSubfolders).onChange(v => { s.includeSubfolders = v; void save(); }));
		new Setting(el).setName('List separator')
			.setDesc('Typing this between values in a text property makes it a list.')
			.addText(t => t.setPlaceholder(',').setValue(s.delimiter).onChange(v => {
				s.delimiter = v || DEFAULT_SETTINGS.bulkProperties.delimiter;
				void save();
			}));
	}

	private renderFrontmatterCleaner(el: HTMLElement): void {
		const s = this.plugin.settings.frontmatterCleaner;
		const save = (redraw = false) => this.save('frontmatterCleaner', redraw);

		el.createDiv({
			cls: 'setting-item-description btn-settings-note',
			text: 'Commands: "Clean properties of current file" opens the list; "Delete empty properties of current file" removes blank ones without asking.',
		});
		new Setting(el).setName('Show ribbon button')
			.addToggle(t => t.setValue(s.showRibbonIcon).onChange(v => { s.showRibbonIcon = v; void save(); }));

		new Setting(el).setName('Keeping a record').setHeading()
			.setDesc('Optional: write deleted properties into the note\'s text instead of discarding them.');
		new Setting(el).setName('Keep a record by default')
			.setDesc('Pre-check "keep a record" when the list opens.')
			.addToggle(t => t.setValue(s.keepRecordByDefault).onChange(v => { s.keepRecordByDefault = v; void save(); }));
		new Setting(el).setName('Record format')
			.addDropdown(dd => dd
				.addOptions({ table: 'Markdown table', colon: 'property: value', dataview: 'property:: value' })
				.setValue(s.recordFormat).onChange(v => { s.recordFormat = v as typeof s.recordFormat; void save(); }));
		new Setting(el).setName('Record location')
			.addDropdown(dd => dd
				.addOptions({ top: 'Top of note', bottom: 'Bottom of note', heading: 'Under a heading' })
				.setValue(s.recordLocation).onChange(v => { s.recordLocation = v as typeof s.recordLocation; void save(true); }));
		if (s.recordLocation === 'heading') {
			new Setting(el).setName('Heading text')
				.setDesc('Created if the note doesn\'t have it yet.')
				.addText(t => t.setValue(s.headingText).onChange(v => {
					s.headingText = v.trim() || DEFAULT_SETTINGS.frontmatterCleaner.headingText;
					void save();
				}));
			new Setting(el).setName('Heading level')
				.addDropdown(dd => {
					for (let level = 1; level <= 6; level++) dd.addOption(String(level), `H${level}`);
					dd.setValue(String(s.headingLevel)).onChange(v => { s.headingLevel = Number(v); void save(); });
				});
		}
	}

	private renderScrollButtons(el: HTMLElement): void {
		const s = this.plugin.settings.scrollButtons;
		const save = (redraw = false) => this.save('scrollButtons', redraw);
		const iconSetting = (name: string, desc: string, on: boolean, setOn: (v: boolean) => void, icon: string, setIcon: (v: string) => void, fallback: string) => {
			new Setting(el).setName(name).setDesc(desc)
				.addText(t => t.setPlaceholder(fallback).setValue(icon).onChange(v => { setIcon(v.trim() || fallback); void save(); }))
				.addToggle(t => t.setValue(on).onChange(v => { setOn(v); void save(); }));
		};
		const d = DEFAULT_SETTINGS.scrollButtons;
		iconSetting('Scroll to top', 'Icon name, and whether to show the button.', s.showTop, v => { s.showTop = v; }, s.iconTop, v => { s.iconTop = v; }, d.iconTop);
		iconSetting('Scroll to bottom', 'Icon name, and whether to show the button.', s.showBottom, v => { s.showBottom = v; }, s.iconBottom, v => { s.iconBottom = v; }, d.iconBottom);
		iconSetting('Scroll to cursor', 'Only shown while editing.', s.showCursor, v => { s.showCursor = v; }, s.iconCursor, v => { s.iconCursor = v; }, d.iconCursor);
		new Setting(el).setName('Show tooltips')
			.addToggle(t => t.setValue(s.showTooltips).onChange(v => { s.showTooltips = v; void save(); }));
		new Setting(el).setName('Button size')
			.addSlider(sl => sl.setLimits(0.6, 2, 0.1).setValue(s.size).setDynamicTooltip()
				.onChange(v => { s.size = v; void save(); }))
			.addExtraButton(b => b.setIcon('reset').setTooltip('Reset').onClick(() => { s.size = d.size; void save(true); }));
		if (this.app.plugins.getPlugin('surfing')) {
			new Setting(el).setName('Also on web pages')
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
				.setDesc('Show the top and bottom buttons on web pages opened with the Surfing plugin.')
				.addToggle(t => t.setValue(s.includeWebPages).onChange(v => { s.includeWebPages = v; void save(); }));
		}
	}

	private renderPinnedIcons(el: HTMLElement): void {
		const feature = this.plugin.features.pinnedIcons;
		const s = this.plugin.settings.pinnedIcons;
		const save = (redraw = false) => this.save('pinnedIcons', redraw);

		new Setting(el).setName('Shrink pinned tabs')
			.setDesc('Show pinned tabs as just an icon. The icon rules below only apply while this is on.')
			.addToggle(t => t.setValue(s.shrinkPinnedTabs).onChange(v => { s.shrinkPinnedTabs = v; void save(true); }));
		if (!s.shrinkPinnedTabs) return;

		new Setting(el).setName('Pinned tab width')
			.setDesc('In pixels. 40 fits just the icon.')
			.addSlider(sl => sl.setLimits(32, 200, 4).setValue(s.pinnedTabWidth).setDynamicTooltip()
				.onChange(v => { s.pinnedTabWidth = v; void save(); }))
			.addExtraButton(b => b.setIcon('reset').setTooltip('Reset').onClick(() => {
				s.pinnedTabWidth = DEFAULT_SETTINGS.pinnedIcons.pinnedTabWidth;
				void save(true);
			}));
		new Setting(el).setName('Icon for tabs without a rule')
			.addToggle(t => t.setValue(s.showDefaultIcon).onChange(v => { s.showDefaultIcon = v; void save(true); }));
		if (s.showDefaultIcon) {
			const setting = new Setting(el).setName('Default icon')
				.setDesc('Leave empty for the pin icon.')
				.addText(t => t.setPlaceholder('📌').setValue(s.defaultIcon).onChange(v => { s.defaultIcon = v.trim(); void save(); }))
				.addExtraButton(b => b.setIcon('smile').setTooltip('Pick icon').onClick(() => {
					feature.openIconPicker(icon => { s.defaultIcon = icon; void save(true); });
				}));
			setting.controlEl.addClass('btn-settings-inline');
		}
		new Setting(el).setName('Read the icon from frontmatter')
			.setDesc('A frontmatter property overrides every rule.')
			.addToggle(t => t.setValue(s.readFrontmatter).onChange(v => { s.readFrontmatter = v; void save(true); }));
		if (s.readFrontmatter) {
			new Setting(el).setName('Frontmatter property')
				.addText(t => t.setValue(s.frontmatterProperty).onChange(v => {
					s.frontmatterProperty = v.trim() || DEFAULT_SETTINGS.pinnedIcons.frontmatterProperty;
					void save();
				}));
		}

		new Setting(el).setName('Icon rules').setHeading()
			.setDesc('The first matching rule wins.');
		const add = (type: Parameters<typeof s.rules.unshift>[0]['type'], match: string, icon: string) => {
			s.rules.unshift({ type, match, icon });
			void save(true);
		};
		new Setting(el)
			.addButton(b => b.setButtonText('File').onClick(() => new FilePickerModal(this.app, f => add('exact', f.basename, '📌')).open()))
			.addButton(b => b.setButtonText('Folder').onClick(() => new FolderPickerModal(this.app, f => add('folder', f.path, '📁')).open()))
			.addButton(b => b.setButtonText('Pattern').onClick(() => new PatternEditorModal(this.app, 'starts-with', '', (type, p) => add(type, p, '📝')).open()))
			.addButton(b => b.setButtonText('Tag').onClick(() => new TagPickerModal(this.app, tag => add('tag', tag, '🏷️')).open()));

		if (s.rules.length === 0) {
			el.createDiv({ cls: 'btn-muted btn-settings-empty', text: 'No rules yet.' });
			return;
		}

		const files = this.app.vault.getMarkdownFiles().map(f => feature.fileInfo(f));
		const list = el.createDiv({ cls: 'btn-rule-list' });
		s.rules.forEach((rule, i) => {
			const item = list.createDiv({ cls: 'btn-rule' });
			const setting = new Setting(item);
			const name = createFragment();
			renderIcon(name.createSpan({ cls: 'btn-rule-icon' }), rule.icon);
			name.createSpan({ cls: rule.type === 'regex' ? 'btn-rule-match is-regex' : 'btn-rule-match', text: rule.match || '(empty)' });
			name.createSpan({ cls: 'btn-rule-type', text: RULE_TYPE_LABELS[rule.type] });
			setting.setName(name);

			const matching = files.filter(f => ruleMatches(rule, f)).length;
			const conflicts = findConflicts(s.rules, i, files);
			const desc = createFragment();
			desc.appendText(`Matches ${matching} file${matching === 1 ? '' : 's'}`);
			if (conflicts.length > 0) {
				const warn = desc.createSpan({ cls: 'btn-rule-conflict' });
				setIcon(warn.createSpan(), 'alert-triangle');
				const winners = [...new Set(conflicts.map(c => c.winner + 1))].map(n => `#${n}`).join(', ');
				warn.appendText(` ${conflicts.length} matched by earlier rule ${winners}`);
			}
			setting.setDesc(desc);

			setting
				.addExtraButton(b => b.setIcon('smile').setTooltip('Change icon').onClick(() => {
					feature.openIconPicker(icon => { rule.icon = icon; void save(true); });
				}))
				.addExtraButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => {
					const done = (match: string) => { rule.match = match; void save(true); };
					if (rule.type === 'folder') new FolderPickerModal(this.app, f => done(f.path)).open();
					else if (rule.type === 'tag') new TagPickerModal(this.app, done).open();
					else new PatternEditorModal(this.app, rule.type, rule.match, (type, p) => { rule.type = type; done(p); }).open();
				}))
				.addExtraButton(b => b.setIcon('chevron-up').setTooltip('Move up').setDisabled(i === 0).onClick(() => {
					[s.rules[i - 1], s.rules[i]] = [s.rules[i], s.rules[i - 1]];
					void save(true);
				}))
				.addExtraButton(b => b.setIcon('chevron-down').setTooltip('Move down').setDisabled(i === s.rules.length - 1).onClick(() => {
					[s.rules[i + 1], s.rules[i]] = [s.rules[i], s.rules[i + 1]];
					void save(true);
				}))
				.addExtraButton(b => b.setIcon('trash').setTooltip('Delete').onClick(() => {
					s.rules.splice(i, 1);
					void save(true);
				}));
		});
	}
}
