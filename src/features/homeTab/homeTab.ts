// A browser-like start page for new tabs.
// Based on Home tab by Renso (MIT); see NOTICE.md.

import { Events, TFile, debounce, parseFrontMatterAliases, type Command, type EventRef, type WorkspaceLeaf } from 'obsidian';
import { Feature } from '../../feature';
import type { HomeTabSettings } from '../../settings';
import { HOME_CODE_BLOCK, HOME_VIEW_TYPE, LEGACY_HOME_CODE_BLOCK } from './constants';
import { EmbeddedHome, HomeView } from './homeView';
import { pushRecent, type SearchItem } from './searchIndex';

interface BookmarkItem {
	type: string;
	path?: string;
	title?: string;
	items?: BookmarkItem[];
}

interface BookmarksInstance {
	items?: BookmarkItem[];
	on?(name: 'changed', callback: () => void): EventRef;
}

export interface BookmarkedFile {
	file: TFile;
	title: string;
}

/**
 * Events: 'lists-changed' when recent files or bookmarks change,
 * 'settings-changed' when the home tab settings change.
 */
export class HomeTabFeature extends Feature {
	readonly id = 'homeTab';
	readonly name = 'Home tab';

	readonly events = new Events();
	private index: SearchItem[] | null = null;
	private recent: string[] = [];

	get settings(): HomeTabSettings {
		return this.plugin.settings.homeTab;
	}

	/** Parts that must be registered by the plugin itself, even while the feature is off. */
	registerPluginParts(): void {
		this.plugin.registerView(HOME_VIEW_TYPE, leaf => new HomeView(leaf, this));
		for (const lang of [HOME_CODE_BLOCK, LEGACY_HOME_CODE_BLOCK]) {
			this.plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
				if (!this.isLoaded) {
					el.createDiv({ cls: 'btn-muted', text: 'The home tab feature is turned off.' });
					return;
				}
				ctx.addChild(new EmbeddedHome(el, this, source));
			});
		}
	}

	override onload(): void {
		const { workspace, vault, metadataCache } = this.app;
		this.recent = this.settings.storeRecentFiles ? [...this.settings.recentFiles] : [];

		const invalidate = () => { this.index = null; };
		this.registerEvent(vault.on('create', invalidate));
		this.registerEvent(vault.on('delete', file => {
			invalidate();
			this.removeRecent(file.path);
		}));
		this.registerEvent(vault.on('rename', (file, oldPath) => {
			invalidate();
			if (this.recent.includes(oldPath)) {
				this.recent = this.recent.map(p => p === oldPath ? file.path : p);
				this.recentChanged();
			}
		}));
		this.registerEvent(metadataCache.on('resolved', invalidate));

		this.registerEvent(workspace.on('file-open', file => {
			if (!file) return;
			this.recent = pushRecent(this.recent, file.path, this.settings.maxRecentFiles);
			this.recentChanged();
		}));

		this.registerEvent(workspace.on('layout-change', () => {
			if (this.settings.replaceNewTabs) this.replaceEmptyLeaf();
		}));
		this.registerEvent(workspace.on('active-leaf-change', leaf => {
			if (leaf?.view instanceof HomeView) leaf.view.focusSearch();
		}));

		workspace.onLayoutReady(() => {
			this.watchBookmarks();
			if (this.settings.openOnStart) this.openOnStart();
			else if (this.settings.replaceNewTabs) this.replaceEmptyLeaf();
		});
	}

	override onunload(): void {
		// Turn open home tabs back into empty tabs so they don't show a dead view.
		for (const leaf of this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)) {
			void leaf.setViewState({ type: 'empty' });
		}
	}

	override onSettingsChange(): void {
		this.recent = this.recent.slice(0, this.settings.maxRecentFiles);
		this.index = null;
		this.events.trigger('settings-changed');
	}

	override commands(): Command[] {
		return [
			{ id: 'open-home-tab', name: 'Open home tab in a new tab', callback: () => void this.openHome(true) },
			{ id: 'replace-with-home-tab', name: 'Show home tab in current tab', callback: () => void this.openHome(false) },
		];
	}

	async openHome(newTab: boolean): Promise<void> {
		const { workspace } = this.app;
		const leaf = newTab ? workspace.getLeaf('tab') : workspace.getMostRecentLeaf() ?? workspace.getLeaf('tab');
		await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	private replaceEmptyLeaf(): void {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf?.view.getViewType() === 'empty') void leaf.setViewState({ type: HOME_VIEW_TYPE });
	}

	private openOnStart(): void {
		const { workspace } = this.app;
		const homes = workspace.getLeavesOfType(HOME_VIEW_TYPE);
		if (homes.length > 0) {
			void workspace.revealLeaf(homes[0]);
			homes.slice(1).forEach(l => l.detach());
		} else {
			void this.openHome(true);
		}
		if (this.settings.closePreviousSessionTabs) {
			const toClose: WorkspaceLeaf[] = [];
			workspace.iterateRootLeaves(leaf => {
				// Pinned tabs (like the pinned daily note) stay.
				if (leaf.view.getViewType() !== HOME_VIEW_TYPE && !leaf.pinned) toClose.push(leaf);
			});
			toClose.forEach(l => l.detach());
		}
	}

	// -----------------------------------------------------------------------
	// Search index
	// -----------------------------------------------------------------------

	getSearchItems(): SearchItem[] {
		if (this.index) return this.index;
		const { vault, metadataCache } = this.app;
		const items: SearchItem[] = vault.getFiles().map(file => ({
			path: file.path,
			basename: file.basename,
			extension: file.extension,
			aliases: file.extension === 'md'
				? parseFrontMatterAliases(metadataCache.getFileCache(file)?.frontmatter) ?? []
				: [],
			unresolved: false,
		}));

		const seen = new Set<string>();
		for (const links of Object.values(metadataCache.unresolvedLinks)) {
			for (const link of Object.keys(links)) {
				// Links to non-markdown files keep their extension; only offer notes.
				if (/\.[^/.]+$/.test(link) && !link.endsWith('.md')) continue;
				const linkpath = link.replace(/\.md$/, '');
				if (seen.has(linkpath)) continue;
				seen.add(linkpath);
				items.push({
					path: `${linkpath}.md`,
					basename: linkpath.split('/').pop() ?? linkpath,
					extension: 'md',
					aliases: [],
					unresolved: true,
				});
			}
		}
		this.index = items;
		return items;
	}

	// -----------------------------------------------------------------------
	// Recent files and bookmarks
	// -----------------------------------------------------------------------

	getRecentFiles(): TFile[] {
		return this.recent
			.map(path => this.app.vault.getFileByPath(path))
			.filter((f): f is TFile => !!f)
			.slice(0, this.settings.maxRecentFiles);
	}

	removeRecent(path: string): void {
		if (!this.recent.includes(path)) return;
		this.recent = this.recent.filter(p => p !== path);
		this.recentChanged();
	}

	private saveRecent = debounce(() => {
		this.settings.recentFiles = this.settings.storeRecentFiles ? [...this.recent] : [];
		void this.plugin.saveSettings();
	}, 2000, true);

	private recentChanged(): void {
		this.events.trigger('lists-changed');
		this.saveRecent();
	}

	private bookmarksInstance(): BookmarksInstance | null {
		const plugin = this.app.internalPlugins.getPluginById('bookmarks');
		return plugin?.enabled ? plugin.instance as BookmarksInstance : null;
	}

	hasBookmarks(): boolean {
		return !!this.bookmarksInstance();
	}

	private watchBookmarks(): void {
		const instance = this.bookmarksInstance();
		if (typeof instance?.on === 'function') {
			this.registerEvent(instance.on('changed', () => this.events.trigger('lists-changed')));
		}
	}

	getBookmarkedFiles(): BookmarkedFile[] {
		const result: BookmarkedFile[] = [];
		const walk = (items: BookmarkItem[] | undefined) => {
			for (const item of items ?? []) {
				if (item.type === 'group') {
					walk(item.items);
				} else if (item.type === 'file' && item.path) {
					const file = this.app.vault.getFileByPath(item.path);
					if (file) result.push({ file, title: item.title || file.basename });
				}
			}
		};
		walk(this.bookmarksInstance()?.items);
		return result;
	}

	/** Leaf to open a search result in from an embedded search bar. */
	leafForEmbedded(newTab: boolean): WorkspaceLeaf {
		return this.app.workspace.getLeaf(newTab ? 'tab' : false);
	}
}
