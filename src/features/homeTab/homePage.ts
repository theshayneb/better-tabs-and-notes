import { Component, Keymap, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { HomeTabFeature } from './homeTab';
import { renderLogo } from './logo';
import { SearchBar } from './searchBar';

export interface HomePageOptions {
	embedded: boolean;
	searchOnly: boolean;
	showRecent: () => boolean;
	showBookmarks: () => boolean;
	/** Where to open a file: the home tab itself, or a new tab. */
	leafFor: (newTab: boolean) => WorkspaceLeaf;
}

const FONT_VARS = {
	interface: 'var(--font-interface)',
	text: 'var(--font-text)',
	monospace: 'var(--font-monospace)',
} as const;

export class HomePage extends Component {
	private searchBar: SearchBar | null = null;
	private listsEl!: HTMLElement;

	constructor(private containerEl: HTMLElement, private feature: HomeTabFeature, private options: HomePageOptions) {
		super();
	}

	override onload(): void {
		this.render();
		this.registerEvent(this.feature.events.on('settings-changed', () => this.render()));
		this.registerEvent(this.feature.events.on('lists-changed', () => this.renderLists()));
	}

	override onunload(): void {
		this.containerEl.empty();
	}

	focusSearch(): void {
		this.searchBar?.focus();
	}

	private render(): void {
		if (this.searchBar) this.removeChild(this.searchBar);
		const root = this.containerEl;
		root.empty();
		root.addClass('btn-home');
		root.toggleClass('is-embedded', this.options.embedded);

		if (!this.options.searchOnly) this.renderHeader(root.createDiv({ cls: 'btn-home-header' }));

		this.searchBar = this.addChild(new SearchBar(root.createDiv(), this.feature, {
			embedded: this.options.embedded,
			leafFor: this.options.leafFor,
		}));

		this.listsEl = root.createDiv({ cls: 'btn-home-lists' });
		this.renderLists();
	}

	private renderHeader(header: HTMLElement): void {
		const s = this.feature.settings;
		header.setCssProps({
			'--btn-home-font-size': s.fontSize,
			'--btn-home-logo-scale': String(s.logoScale),
		});
		if (s.logoType !== 'none') {
			const logoEl = header.createDiv({ cls: 'btn-home-logo' });
			renderLogo(logoEl, s, this.feature.app);
		}
		if (s.title) {
			const title = header.createEl('h1', { cls: 'btn-home-title', text: s.title });
			title.setCssProps({
				'font-family': s.font === 'custom' ? s.customFont || 'inherit' : FONT_VARS[s.font],
				'font-weight': String(s.fontWeight),
				color: s.fontColorType === 'accent' ? 'var(--interactive-accent)' : s.fontColorType === 'custom' ? s.fontColor : '',
			});
		}
	}

	private renderLists(): void {
		if (!this.listsEl) return;
		this.listsEl.empty();
		if (this.options.showBookmarks() && this.feature.hasBookmarks()) {
			const bookmarks = this.feature.getBookmarkedFiles();
			if (bookmarks.length > 0) {
				this.renderFileList('Bookmarks', bookmarks.map(b => ({ file: b.file, title: b.title })));
			}
		}
		if (this.options.showRecent()) {
			const recent = this.feature.getRecentFiles();
			if (recent.length > 0) {
				this.renderFileList('Recent files', recent.map(file => ({ file, title: file.basename })), file => {
					this.feature.removeRecent(file.path);
				});
			}
		}
	}

	private renderFileList(heading: string, files: { file: TFile; title: string }[], onRemove?: (file: TFile) => void): void {
		const section = this.listsEl.createDiv({ cls: 'btn-home-list' });
		section.createDiv({ cls: 'btn-home-list-heading', text: heading });
		const list = section.createDiv({ cls: 'btn-home-list-items' });
		// Fill the columns top to bottom, so the list still reads in order down the first column.
		const columns = Math.max(1, Math.min(3, Math.round(this.feature.settings.listColumns)));
		list.toggleClass('is-multi-column', columns > 1);
		list.setCssProps({
			'--btn-home-columns': String(columns),
			'--btn-home-rows': String(Math.ceil(files.length / columns)),
		});
		for (const { file, title } of files) {
			const item = list.createDiv({ cls: 'btn-home-list-item', attr: { 'aria-label': file.path } });
			setIcon(item.createSpan({ cls: 'btn-home-list-icon' }), iconFor(file));
			item.createSpan({ cls: 'btn-home-list-title', text: title });
			if (file.extension !== 'md') item.createSpan({ cls: 'nav-file-tag', text: file.extension });
			item.addEventListener('click', evt => {
				void this.options.leafFor(!!Keymap.isModEvent(evt)).openFile(file);
			});
			item.addEventListener('auxclick', evt => {
				if (evt.button === 1) void this.options.leafFor(true).openFile(file);
			});
			if (onRemove) {
				const remove = item.createSpan({ cls: 'btn-home-list-remove clickable-icon', attr: { 'aria-label': 'Remove from list' } });
				setIcon(remove, 'x');
				remove.addEventListener('click', evt => {
					evt.stopPropagation();
					onRemove(file);
				});
			}
		}
	}
}

export function iconFor(file: { extension: string }): string {
	switch (file.extension) {
		case 'md': return 'file-text';
		case 'canvas': return 'layout-dashboard';
		case 'pdf': return 'file-type-2';
		case 'base': return 'table';
		default: break;
	}
	if (/^(png|jpe?g|gif|svg|bmp|webp|avif)$/.test(file.extension)) return 'image';
	if (/^(mp4|webm|ogv|mov|mkv)$/.test(file.extension)) return 'file-video';
	if (/^(mp3|wav|m4a|ogg|3gp|flac)$/.test(file.extension)) return 'file-audio';
	return 'file';
}
