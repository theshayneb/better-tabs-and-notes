import { ItemView, MarkdownRenderChild, type WorkspaceLeaf } from 'obsidian';
import { HOME_VIEW_TYPE } from './constants';
import type { HomeTabFeature } from './homeTab';
import { HomePage } from './homePage';
import { parseCodeBlockOptions } from './searchIndex';

export class HomeView extends ItemView {
	private page: HomePage | null = null;

	constructor(leaf: WorkspaceLeaf, private feature: HomeTabFeature) {
		super(leaf);
		// Lets Obsidian (and the tab behaviour feature) navigate this tab like an empty one.
		this.navigation = true;
	}

	getViewType(): string {
		return HOME_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Home';
	}

	override getIcon(): string {
		return 'home';
	}

	override async onOpen(): Promise<void> {
		this.page = this.addChild(new HomePage(this.contentEl, this.feature, {
			embedded: false,
			searchOnly: false,
			showRecent: () => this.feature.settings.showRecentFiles,
			showBookmarks: () => this.feature.settings.showBookmarks,
			leafFor: newTab => this.leafFor(newTab),
		}));
		await Promise.resolve();
		this.focusSearch();
	}

	override async onClose(): Promise<void> {
		if (this.page) this.removeChild(this.page);
		this.page = null;
		await Promise.resolve();
	}

	focusSearch(): void {
		this.page?.focusSearch();
	}

	/**
	 * Go through getLeaf while this tab is active so the tab behaviour rules
	 * (reuse this tab, switch to an already open file) apply.
	 */
	private leafFor(newTab: boolean): WorkspaceLeaf {
		const { workspace } = this.app;
		if (newTab) return workspace.getLeaf('tab');
		return workspace.getActiveViewOfType(HomeView) === this ? workspace.getLeaf(false) : this.leaf;
	}
}

/** The home page rendered inside a note by a `home-search` code block. */
export class EmbeddedHome extends MarkdownRenderChild {
	constructor(containerEl: HTMLElement, private feature: HomeTabFeature, private source: string) {
		super(containerEl);
	}

	override onload(): void {
		const options = parseCodeBlockOptions(this.source);
		this.addChild(new HomePage(this.containerEl, this.feature, {
			embedded: true,
			searchOnly: options.searchOnly,
			showRecent: () => options.recentFiles,
			showBookmarks: () => options.bookmarks,
			leafFor: newTab => this.feature.leafForEmbedded(newTab),
		}));
	}
}
