// Compact pinned tabs with custom icons.
// Based on Pinned Tabs Customizer by Diego (0BSD); see NOTICE.md.

import { TFile, WorkspaceLeaf, debounce, getAllTags, setIcon, type Command } from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import type { IconRule, PinnedIconSettings, RuleType } from '../../settings';
import { FilePickerModal, FolderPickerModal, IconPickerModal, PatternEditorModal, TagPickerModal } from './modals';
import { NATIVE_PIN_ICON, isLucideIcon, lucideName, normalizeTag, resolveIcon, type FileInfo } from './rules';

const COMPACT_CLASS = 'btn-pinned-compact';
const HAS_ICON_CLASS = 'btn-has-pinned-icon';
const ICON_CLASS = 'btn-pinned-icon';
const MAX_RECENT_ICONS = 12;

/** Render an icon value (emoji/text, `lucide:name`, or the native pin marker) into an element. */
export function renderIcon(el: HTMLElement, icon: string): void {
	el.empty();
	if (icon === NATIVE_PIN_ICON) setIcon(el, 'pin');
	else if (isLucideIcon(icon)) setIcon(el, lucideName(icon));
	else el.setText(icon);
}

export class PinnedIconsFeature extends Feature {
	readonly id = 'pinnedIcons';
	readonly name = 'Pinned tab icons';

	private scheduleRefresh = debounce(() => this.refresh(), 50, true);

	get settings(): PinnedIconSettings {
		return this.plugin.settings.pinnedIcons;
	}

	override onload(): void {
		const { workspace, metadataCache, vault } = this.app;
		workspace.onLayoutReady(() => this.refresh());
		this.registerEvent(workspace.on('layout-change', this.scheduleRefresh));
		this.registerEvent(workspace.on('active-leaf-change', this.scheduleRefresh));
		this.registerEvent(metadataCache.on('changed', this.scheduleRefresh));
		this.registerEvent(vault.on('rename', this.scheduleRefresh));

		// Pinning doesn't trigger a layout change, so watch it directly.
		const schedule = this.scheduleRefresh;
		this.register(around(WorkspaceLeaf.prototype, {
			setPinned(original) {
				return function (this: WorkspaceLeaf, pinned: boolean) {
					const result = original.call(this, pinned);
					schedule();
					return result;
				};
			},
		}));

		this.registerEvent(workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			menu.addItem(item => item
				.setTitle('Set pinned tab icon')
				.setIcon('pin')
				.onClick(() => this.pickIconForFile(file)));
		}));
	}

	override onunload(): void {
		this.app.workspace.iterateAllLeaves(leaf => this.clearHeader(leaf.tabHeaderEl));
	}

	override onSettingsChange(): void {
		this.refresh();
	}

	override commands(): Command[] {
		return [
			{
				id: 'set-pinned-icon-current-file',
				name: 'Set pinned tab icon for current file',
				checkCallback: (checking: boolean) => {
					const file = this.app.workspace.getActiveFile();
					if (!file) return false;
					if (!checking) this.pickIconForFile(file);
					return true;
				},
			},
			{
				id: 'set-pinned-icon-file',
				name: 'Set pinned tab icon for a file',
				callback: () => new FilePickerModal(this.app, file => this.pickIconForFile(file)).open(),
			},
			{
				id: 'add-pinned-icon-folder-rule',
				name: 'Add pinned tab icon rule for a folder',
				callback: () => new FolderPickerModal(this.app, folder => this.pickIconForRule('folder', folder.path)).open(),
			},
			{
				id: 'add-pinned-icon-pattern-rule',
				name: 'Add pinned tab icon rule for a name pattern',
				callback: () => new PatternEditorModal(this.app, 'starts-with', '', (type, pattern) => this.pickIconForRule(type, pattern)).open(),
			},
			{
				id: 'add-pinned-icon-tag-rule',
				name: 'Add pinned tab icon rule for a tag',
				callback: () => new TagPickerModal(this.app, tag => this.pickIconForRule('tag', tag)).open(),
			},
		];
	}

	openIconPicker(onSelect: (icon: string) => void): void {
		new IconPickerModal(this.app, this.settings.recentIcons, icon => {
			this.settings.recentIcons = [icon, ...this.settings.recentIcons.filter(i => i !== icon)].slice(0, MAX_RECENT_ICONS);
			onSelect(icon);
		}).open();
	}

	private pickIconForFile(file: TFile): void {
		this.openIconPicker(icon => {
			const existing = this.settings.rules.find(r => r.type === 'exact' && r.match === file.basename);
			if (existing) existing.icon = icon;
			else this.settings.rules.unshift({ type: 'exact', match: file.basename, icon });
			void this.save();
		});
	}

	private pickIconForRule(type: RuleType, match: string): void {
		this.openIconPicker(icon => {
			this.settings.rules.unshift({ type, match, icon } satisfies IconRule);
			void this.save();
		});
	}

	async save(): Promise<void> {
		await this.plugin.saveSettings('pinnedIcons');
	}

	fileInfo(file: TFile): FileInfo {
		const cache = this.app.metadataCache.getFileCache(file);
		return {
			basename: file.basename,
			path: file.path,
			tags: cache ? (getAllTags(cache) ?? []).map(normalizeTag) : [],
			frontmatter: cache?.frontmatter,
		};
	}

	refresh(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			const header = leaf.tabHeaderEl;
			if (!header) return;
			if (!leaf.pinned || !this.settings.shrinkPinnedTabs) {
				this.clearHeader(header);
				return;
			}
			header.addClass(COMPACT_CLASS);
			header.setCssProps({ '--btn-pinned-width': `${this.settings.pinnedTabWidth}px` });

			const file = (leaf.view as { file?: TFile | null }).file;
			const icon = resolveIcon(file instanceof TFile ? this.fileInfo(file) : null, this.settings);
			const inner = header.querySelector<HTMLElement>('.workspace-tab-header-inner');
			let iconEl = header.querySelector<HTMLElement>(`.${ICON_CLASS}`);
			if (!icon || !inner) {
				iconEl?.remove();
				header.removeClass(HAS_ICON_CLASS);
				return;
			}
			if (!iconEl) {
				iconEl = createSpan({ cls: ICON_CLASS });
				inner.prepend(iconEl);
			}
			if (iconEl.dataset.icon !== icon) {
				renderIcon(iconEl, icon);
				iconEl.dataset.icon = icon;
			}
			header.addClass(HAS_ICON_CLASS);
		});
	}

	private clearHeader(header: HTMLElement | undefined): void {
		if (!header) return;
		header.querySelector(`.${ICON_CLASS}`)?.remove();
		header.removeClasses([COMPACT_CLASS, HAS_ICON_CLASS]);
		header.setCssProps({ '--btn-pinned-width': '' });
	}
}
