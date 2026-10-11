// Tab opening behaviour. Ported from Open Tab Settings by Jesse Hines (MIT) and
// Mononote by Carlo Zottmann (MIT); see NOTICE.md.

import {
	Keymap, MarkdownView, Notice, Platform, TFile, View, Workspace, WorkspaceFloating, WorkspaceLeaf, WorkspaceRoot,
	WorkspaceTabs, type App, type Command, type WorkspaceItem,
} from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import { NEW_TAB_GROUP_PLACEMENTS, normalizeTabSettings, type TabSettings } from '../../settings';
import type { TabGroup } from '../../types';
import { HOME_VIEW_TYPE } from '../homeTab/constants';
import { openFlags } from '../../shared/openFlags';
import { OVERRIDES, parseOverride } from './overrides';
import { applyDeviceTabSettings, shouldFocusNewTab } from '../../shared/deviceSettings';

/**
 * Views added by other plugins that should be deduplicated like normal files.
 * Only needed when the view isn't the default view for the extension.
 */
const PLUGIN_VIEW_TYPES: Record<string, string[]> = {
	md: ['excalidraw', 'kanban', 'smm'],
};

export function isEmptyLeaf(leaf: WorkspaceLeaf): boolean {
	// The home tab replaces new tabs, so treat it as empty.
	return ['empty', HOME_VIEW_TYPE].includes(leaf.view.getViewType());
}

/** Whether the leaf is in the main area or a popout window (not a sidebar). */
export function isMainLeaf(leaf: WorkspaceLeaf): boolean {
	const root = leaf.getRoot();
	// parent can be null on detached leaves, which some plugins open files in.
	return (root instanceof WorkspaceRoot || root instanceof WorkspaceFloating) && !!leaf.parent;
}

type NewLeafOverride = Partial<TabSettings & { replaceEmptyTabs: boolean }>;

export class TabBehaviorFeature extends Feature {
	readonly id = 'tabs';
	readonly name = 'Tab behaviour';

	private processingLeaves = new Set<string>();

	/** The shared tab settings with this device's own choices applied. */
	get settings(): TabSettings {
		return applyDeviceTabSettings(this.plugin.settings.tabs, this.plugin.getDeviceTabSettings());
	}

	/** Whether a new tab comes to the front, per this device's setting. */
	focusNewTab(normalClick: boolean): boolean {
		return shouldFocusNewTab(this.plugin.getDeviceTabSettings(), normalClick, !!this.app.vault.getConfig('focusNewTab'));
	}

	override onload(): void {
		this.registerPatches();
		this.registerFileMenu();
		this.registerPreviewTabs();
		this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
			if (leaf && this.settings.closeLateDuplicates) void this.closeLateDuplicate(leaf);
		}));
	}

	override onunload(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			this.setLeafIsPreview(leaf, false);
			delete leaf.pwBtn;
		});
	}

	override onSettingsChange(): void {
		if (!this.settings.previewTabs) {
			this.app.workspace.iterateAllLeaves(leaf => this.setLeafIsPreview(leaf, false));
		}
	}

	async updateSettings(changes: Partial<TabSettings>): Promise<void> {
		// Only the shared settings; this device's own choices are stored separately.
		this.plugin.settings.tabs = normalizeTabSettings({ ...this.plugin.settings.tabs, ...changes });
		await this.plugin.saveSettings('tabs');
	}

	override commands(): Command[] {
		const commands: Command[] = [];
		const toggles = [
			['openInNewTab', 'always open in new tab'],
			['deduplicateTabs', 'prevent duplicate tabs'],
		] as const;
		for (const [key, label] of toggles) {
			const set = async (value: boolean) => {
				await this.updateSettings({ [key]: value });
				new Notice(`${label[0].toUpperCase()}${label.slice(1)}: ${this.settings[key] ? 'on' : 'off'}`, 2500);
			};
			commands.push(
				{ id: `toggle-${key}`, name: `Toggle ${label}`, callback: () => void set(!this.settings[key]) },
				{ id: `enable-${key}`, name: `Turn on ${label}`, callback: () => void set(true) },
				{ id: `disable-${key}`, name: `Turn off ${label}`, callback: () => void set(false) },
			);
		}
		commands.push({
			id: 'cycle-tab-group-placement',
			name: 'Cycle new tab group placement',
			callback: () => {
				const values = Object.keys(NEW_TAB_GROUP_PLACEMENTS) as (keyof typeof NEW_TAB_GROUP_PLACEMENTS)[];
				const next = values[(values.indexOf(this.settings.newTabTabGroupPlacement) + 1) % values.length];
				void this.updateSettings({ newTabTabGroupPlacement: next }).then(() => {
					new Notice(`New tab group placement: ${NEW_TAB_GROUP_PLACEMENTS[next].toLowerCase()}`, 2500);
				});
			},
		});
		// workspace:new-tab ignores placement, so offer explicit versions.
		const placements = [
			['afterPinned', 'Open new tab after pinned tabs'],
			['afterActive', 'Open new tab after active tab'],
			['beginning', 'Open new tab at beginning'],
		] as const;
		for (const [placement, name] of placements) {
			commands.push({
				id: `new-tab-${placement}`,
				name,
				callback: () => { this.createNewLeaf(true, { newTabPlacement: placement, replaceEmptyTabs: false }); },
			});
		}
		return commands;
	}

	// -----------------------------------------------------------------------
	// Patches
	// -----------------------------------------------------------------------

	private registerPatches(): void {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- patched methods need their own `this`
		const feature = this;

		this.register(around(Workspace.prototype, {
			// Open in a new tab by default, following the placement settings.
			getLeaf(original) {
				return function (this: Workspace, openModeIn?: string | boolean, ...args: unknown[]) {
					const [openMode, override] = parseOverride(openModeIn);
					const settings = { ...feature.settings, ...override };
					const activeLeaf = this.getActiveViewOfType(View)?.leaf;

					let leaf: WorkspaceLeaf;
					if (openMode === 'tab' || (!openMode && settings.openInNewTab)) {
						// By default normal clicks focus the new tab whatever focusNewTab says;
						// the per-device setting can change that.
						leaf = feature.createNewLeaf(feature.focusNewTab(!openMode), settings);
					} else if (!openMode) {
						leaf = feature.getUnpinnedLeaf(true, settings);
					} else {
						leaf = (original as (...a: unknown[]) => WorkspaceLeaf).call(this, openMode, ...args);
					}

					// Read by openFile to decide whether to deduplicate.
					leaf.pwBtn = { ...leaf.pwBtn, openInfo: { openMode, override, openedFrom: activeLeaf?.id } };
					return leaf;
				};
			},

			// Deprecated in favour of getLeaf(false), but Obsidian and many plugins still use it.
			getUnpinnedLeaf() {
				return function (this: Workspace, focus?: boolean) {
					if (feature.settings.openInNewTab) return this.getLeaf(false);
					return feature.getUnpinnedLeaf(focus);
				};
			},
		}));

		this.register(around(WorkspaceLeaf.prototype, {
			// Switch to an existing tab instead of opening a duplicate.
			openFile(original) {
				const callOriginal = (leaf: WorkspaceLeaf, ...a: unknown[]) =>
					(original as (...args: unknown[]) => Promise<void>).apply(leaf, a);
				return async function (this: WorkspaceLeaf, file: TFile, openState?: Parameters<WorkspaceLeaf['openFile']>[1], ...args: unknown[]) {
					// openInfo is only valid right after getLeaf.
					if (!isEmptyLeaf(this)) delete this.pwBtn?.openInfo;

					const { openMode, override, openedFrom } = this.pwBtn?.openInfo ?? {};
					const settings = { ...feature.settings, ...override };
					if (openFlags.skipDedupe > 0) settings.deduplicateTabs = false;
					if (override?.deduplicateTabs === false) this.pwBtn = { ...this.pwBtn, allowDuplicate: true };

					let matches = feature.findMatchingLeaves(file);

					// Explicit splits, new windows and sidebars never deduplicate. Opening in a
					// new window doesn't go through getLeaf, so an unknown openMode means a window.
					const isSpecialOpen = !isMainLeaf(this)
						|| (isEmptyLeaf(this) && ![false, 'tab'].includes(openMode ?? 'unknown'));
					const isInternalLink = isEmptyLeaf(this) && openMode === false
						&& !!(openState?.eState as { subpath?: string } | undefined)?.subpath
						&& matches.some(l => l.id === openedFrom);

					let target: WorkspaceLeaf | undefined;
					// eslint-disable-next-line @typescript-eslint/no-this-alias -- `this` is the leaf being opened
					if (matches.includes(this)) target = this;
					// Heading links within the same note should never open a new tab.
					if (!target && isInternalLink && !isSpecialOpen) target = matches.find(l => l.id === openedFrom);
					if (!settings.deduplicateAcrossTabGroups) matches = matches.filter(l => l.parent === this.parent);
					if (settings.deduplicateTabs && !isSpecialOpen && matches.length > 0) {
						target ??= matches.find(l => l.id === openedFrom)
							?? matches.find(l => l.isVisible() && l.parent === this.parent)
							?? matches.find(l => l.isVisible())
							?? matches.find(l => l.parent === this.parent)
							?? matches[0];
					}
					// eslint-disable-next-line @typescript-eslint/no-this-alias -- `this` is the leaf being opened
					target ??= this;
					target.pwBtn = { ...target.pwBtn, openedTime: performance.now() };

					let result: void;
					if (target !== this) {
						if (target.view.getViewType() === 'kanban') {
							// Kanban breaks when reopened: https://github.com/mgmeyers/obsidian-kanban/issues/1102
							feature.app.workspace.setActiveLeaf(target);
						} else {
							const activeLeaf = feature.app.workspace.getActiveViewOfType(View)?.leaf;
							result = await callOriginal(target, file, {
								...openState,
								active: !!openState?.active || activeLeaf === this,
							}, ...args);
						}
					} else {
						result = await callOriginal(target, file, openState, ...args);
					}

					// A new tab that ended up unused (deduplicated, or the file opened in
					// another app) is closed again.
					const group = this.parent as TabGroup | null;
					if (isEmptyLeaf(this) && isMainLeaf(this) && group && group.children.length > 1) {
						const wasCurrent = group.children[group.currentTab] === this;
						const lastActive = group.children
							.filter(l => l !== this)
							.reduce((max, l) => l.activeTime > max.activeTime ? l : max);
						this.detach();
						if (wasCurrent) group.selectTabIndex(group.children.indexOf(lastActive));
					}

					delete this.pwBtn?.openInfo;
					return result;
				};
			},
		}));

		// Let the mod-click behaviour setting decide what ctrl/cmd/middle click does.
		this.register(around(Keymap, {
			isModEvent(original) {
				return function (this: typeof Keymap, ...args: Parameters<typeof Keymap.isModEvent>) {
					const result = original.call(this, ...args);
					if (result === 'tab') return OVERRIDES[feature.settings.modClickBehavior];
					return result;
				};
			},
		}));
	}

	// -----------------------------------------------------------------------
	// File menu
	// -----------------------------------------------------------------------

	private registerFileMenu(): void {
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			if (this.settings.openInNewTab) {
				menu.addItem(item => item
					.setSection('open')
					.setIcon('file-minus')
					.setTitle('Open in same tab')
					.onClick(() => void this.app.workspace.getLeaf(OVERRIDES.same).openFile(file)));
			}
			if (this.settings.deduplicateTabs && this.findMatchingLeaves(file).length > 0) {
				menu.addItem(item => item
					.setSection('open')
					.setIcon('files')
					.setTitle('Open in duplicate tab')
					.onClick(() => void this.app.workspace.getLeaf(OVERRIDES.allowDuplicate).openFile(file)));
			}
			const recent = this.app.workspace.getMostRecentLeaf();
			if (recent && this.getAllTabGroups(recent.getRoot()).length > 1) {
				menu.addItem(item => item
					.setSection('open')
					.setIcon('lucide-split-square-horizontal')
					.setTitle('Open in opposite tab group')
					.onClick(() => void this.app.workspace.getLeaf(OVERRIDES.opposite).openFile(file)));
			}
		}));
	}

	// -----------------------------------------------------------------------
	// Preview tabs
	// -----------------------------------------------------------------------

	private registerPreviewTabs(): void {
		this.registerEvent(this.app.workspace.on('editor-change', (_editor, info) => {
			if (info instanceof MarkdownView) this.setLeafIsPreview(info.leaf, false);
		}));
		this.registerEvent(this.app.workspace.on('layout-change', this.syncPreviewTabs));

		// Track click times so a double click that opened a file can promote it.
		// Capture on window so another plugin can't stop propagation first.
		const clickTimes: number[] = [];
		const onClick = (e: MouseEvent) => {
			clickTimes.push(e.timeStamp);
			if (clickTimes.length > 2) clickTimes.shift();
		};
		const onDblClick = (e: MouseEvent) => {
			const target = e.target;
			if (!this.settings.previewTabs || !(target instanceof Element)) return;

			const tabHeader = target.closest('.workspace-tab-header');
			if (tabHeader) {
				this.app.workspace.iterateAllLeaves(l => {
					if (l.tabHeaderEl === tabHeader) this.setLeafIsPreview(l, false);
				});
				return;
			}

			// The file explorer doesn't reopen the active file, so handle that here.
			const explorerPath = target.closest('.nav-files-container .nav-file-title[data-path]')?.getAttr('data-path');
			if (explorerPath) {
				const leaf = this.app.workspace.getMostRecentLeaf();
				if (leaf?.getViewState()?.state?.file === explorerPath) this.setLeafIsPreview(leaf, false);
				return;
			}

			const firstClick = clickTimes.length >= 2 && e.timeStamp - clickTimes[1] < 15 ? clickTimes[0] : undefined;
			if (firstClick !== undefined) {
				const opened: WorkspaceLeaf[] = [];
				this.app.workspace.iterateAllLeaves(leaf => {
					if (isMainLeaf(leaf) && (leaf.pwBtn?.openedTime ?? 0) >= firstClick) opened.push(leaf);
				});
				if (opened.length === 1) this.setLeafIsPreview(opened[0], false);
			}
		};

		const windows = this.getAllWindows();
		for (const win of windows) {
			win.addEventListener('click', onClick, { capture: true });
			win.addEventListener('dblclick', onDblClick);
		}
		this.registerEvent(this.app.workspace.on('window-open', ({ win }) => {
			windows.add(win);
			win.addEventListener('click', onClick, { capture: true });
			win.addEventListener('dblclick', onDblClick);
		}));
		this.register(() => {
			for (const win of windows) {
				win.removeEventListener('click', onClick, { capture: true });
				win.removeEventListener('dblclick', onDblClick);
			}
		});
	}

	private setLeafIsPreview(leaf: WorkspaceLeaf, isPreview: boolean): void {
		if ((leaf.pwBtn?.isPreview ?? false) === isPreview) return;

		const state = leaf.pwBtn = { ...leaf.pwBtn, isPreview };
		leaf.tabHeaderEl?.toggleClass('btn-is-preview-tab', isPreview);
		if (isPreview) {
			if (!state.eventCleanup) {
				// registerEvent would keep closed leaves alive, so clean up by hand.
				const ref = leaf.on('pinned-change', this.syncPreviewTabs);
				state.eventCleanup = () => leaf.offref(ref);
			}
			// One preview tab per group.
			(leaf.parent as TabGroup).children
				.filter(l => l !== leaf)
				.forEach(l => this.setLeafIsPreview(l, false));
		} else if (state.eventCleanup) {
			state.eventCleanup();
			delete state.eventCleanup;
		}
	}

	/** Pinned tabs and sidebar tabs are never previews. */
	private syncPreviewTabs = (): void => {
		this.app.workspace.iterateAllLeaves(l => {
			if (!isMainLeaf(l) || l.pinned) this.setLeafIsPreview(l, false);
		});
	};

	// -----------------------------------------------------------------------
	// Mononote-style safety net
	// -----------------------------------------------------------------------

	/**
	 * Catch duplicates that bypass openFile (e.g. setViewState from another
	 * plugin): if the newly active leaf shows a file that's already open in the
	 * same tab group, go back (or close the tab) and focus the existing one.
	 */
	private async closeLateDuplicate(leaf: WorkspaceLeaf): Promise<void> {
		if (this.processingLeaves.has(leaf.id) || !isMainLeaf(leaf) || leaf.pwBtn?.allowDuplicate) return;
		const path = leaf.view.getState().file;
		if (typeof path !== 'string') return;

		const viewType = leaf.view.getViewType();
		const duplicates = this.app.workspace.getLeavesOfType(viewType)
			.filter(l => l.parent === leaf.parent && l !== leaf && l.view.getState().file === path)
			// Most recently active first; never-active leaves last.
			.sort((a, b) => (b.activeTime || -1) - (a.activeTime || -1));
		if (duplicates.length === 0) return;

		const target = duplicates.find(l => l.pinned) ?? duplicates[0];
		const delay = this.settings.lateDuplicateDelayMs;
		this.processingLeaves.add(leaf.id);
		try {
			// Give Obsidian time to update the tab's history first.
			await sleep(delay);
			const ephemeral = { ...leaf.getEphemeralState() } as Record<string, unknown>;
			if (leaf.view.navigation && leaf.history.backHistory.length > 0) {
				leaf.history.back();
			} else if (leaf.pinned) {
				return;
			} else {
				leaf.detach();
			}
			await sleep(delay);
			this.app.workspace.setActiveLeaf(target, { focus: true });
			if (Object.keys(ephemeral).length > 0) target.setEphemeralState(ephemeral);
		} finally {
			this.processingLeaves.delete(leaf.id);
		}
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private getAllWindows(): Set<Window> {
		const windows = new Set<Window>([window]);
		this.app.workspace.iterateAllLeaves(l => { windows.add(l.getContainer().win); });
		return windows;
	}

	findMatchingLeaves(file: TFile): WorkspaceLeaf[] {
		const matches: WorkspaceLeaf[] = [];
		const defaultType = this.app.viewRegistry.getTypeByExtension(file.extension);
		this.app.workspace.iterateAllLeaves(leaf => {
			const viewType = leaf.view.getViewType();
			// Only switch to plain file views, not e.g. outgoing links for the file.
			const isTypeMatch = defaultType === viewType || !!PLUGIN_VIEW_TYPES[file.extension]?.includes(viewType);
			if (isMainLeaf(leaf) && leaf.getViewState()?.state?.file === file.path && isTypeMatch) matches.push(leaf);
		});
		return matches;
	}

	/** Tab groups under a root, excluding the sidebars. Ordered. */
	private getAllTabGroups(root: WorkspaceItem): TabGroup[] {
		const groups = new Set<TabGroup>();
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.getRoot() === root && leaf.parent instanceof WorkspaceTabs) groups.add(leaf.parent);
		});
		return [...groups];
	}

	/**
	 * Our version of the internal workspace.createLeafInTabGroup that follows the
	 * placement settings.
	 * @param focus Whether to focus the new tab. Undefined follows this device's setting for ctrl/middle click.
	 */
	createNewLeaf(focus?: boolean, override: NewLeafOverride = {}): WorkspaceLeaf {
		const workspace = this.app.workspace;
		const shouldFocus = focus ?? this.focusNewTab(false);
		const settings = { ...this.settings, replaceEmptyTabs: true, ...override };

		const activeLeaf = workspace.getMostRecentLeaf();
		if (!activeLeaf) throw new Error('No tab group found.');
		const activeGroup = activeLeaf.parent as TabGroup;

		let group: TabGroup;
		if (settings.newTabTabGroupPlacement === 'same' || Platform.isPhone) {
			group = activeGroup;
		} else {
			const groups = this.getAllTabGroups(activeLeaf.getRoot());
			if (settings.newTabTabGroupPlacement === 'opposite') {
				group = groups.filter(g => g !== activeGroup).at(-1) ?? activeGroup;
			} else if (settings.newTabTabGroupPlacement === 'first') {
				group = groups.at(0) ?? activeGroup;
			} else {
				group = groups.at(-1) ?? activeGroup;
			}
		}

		let index: number;
		if (group === activeGroup) {
			if (settings.newTabPlacement === 'afterPinned') {
				const lastPinned = group.children.findLastIndex(l => l.pinned);
				index = lastPinned >= 0 ? lastPinned + 1 : group.currentTab + 1;
			} else if (settings.newTabPlacement === 'beginning') {
				index = 0;
			} else if (settings.newTabPlacement === 'end') {
				index = group.children.length;
			} else {
				index = group.currentTab + 1;
			}
		} else {
			index = settings.newTabPlacement === 'beginning' ? 0 : group.children.length;
		}

		let newLeaf: WorkspaceLeaf | undefined;
		// Like Obsidian, reuse the active tab if it's empty...
		if (settings.replaceEmptyTabs && isEmptyLeaf(activeLeaf) && activeLeaf.canNavigate()) newLeaf = activeLeaf;
		// ...and also an empty tab sitting where the new one would go.
		const displaced = group.children[Math.min(index, group.children.length - 1)];
		if (!newLeaf && settings.replaceEmptyTabs && displaced && isEmptyLeaf(displaced) && displaced.canNavigate()) {
			newLeaf = displaced;
		}
		// Reuse the group's preview tab, wherever it is.
		if (!newLeaf && settings.previewTabs) newLeaf = group.children.find(l => l.pwBtn?.isPreview);

		if (!newLeaf) {
			newLeaf = new (WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf)(this.app);
			const currentTab = group.currentTab;
			group.insertChild(index, newLeaf);
			// Keep the originally selected tab selected when inserting before it in the background.
			if (index <= currentTab && (group !== activeGroup || !shouldFocus)) {
				group.selectTabIndex(currentTab + 1);
			} else {
				group.selectTabIndex(group.currentTab);
			}
		}

		this.setLeafIsPreview(newLeaf, settings.previewTabs);
		if (shouldFocus) workspace.setActiveLeaf(newLeaf);
		return newLeaf;
	}

	/** getUnpinnedLeaf that uses our placement when it has to make a new tab. */
	private getUnpinnedLeaf(focus = true, override: Partial<TabSettings> = {}): WorkspaceLeaf {
		const workspace = this.app.workspace;
		const activeLeaf = workspace.getActiveViewOfType(View)?.leaf;
		if (activeLeaf?.canNavigate()) return activeLeaf;

		const container = activeLeaf?.getContainer() ?? workspace.rootSplit;
		let leaf: WorkspaceLeaf | null = null;
		workspace.iterateLeaves(container, l => {
			if (!l.canNavigate()) return;
			const group = l.parent as TabGroup | null;
			if (
				group
				&& (group.children[group.currentTab] === l || (group instanceof WorkspaceTabs && group.isStacked))
				&& (!leaf || leaf.activeTime < l.activeTime)
			) {
				leaf = l;
			}
		});

		if (!leaf) return this.createNewLeaf(focus, { ...this.settings, ...override });
		if (focus) workspace.setActiveLeaf(leaf);
		return leaf;
	}
}
