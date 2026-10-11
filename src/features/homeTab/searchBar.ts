import { Component, Keymap, Notice, Platform, TFile, normalizePath, prepareFuzzySearch, renderMatches, setIcon, type SearchMatches, type WorkspaceLeaf } from 'obsidian';
import type { HomeTabFeature } from './homeTab';
import { iconFor } from './homePage';
import {
	canCreateWith, filterLabel, matchesFilter, orderResults, parentFolderName, parseFilter, type SearchFilter, type SearchItem,
} from './searchIndex';

/** Subset of the Omnisearch plugin's public API (window.omnisearch). */
interface OmnisearchResult {
	path: string;
	basename: string;
	score: number;
	excerpt: string;
}
interface OmnisearchApi {
	search(query: string): Promise<OmnisearchResult[]>;
}

type Result =
	| { kind: 'file'; item: SearchItem; text: string; matches: SearchMatches | null; score: number }
	| { kind: 'omnisearch'; result: OmnisearchResult }
	| { kind: 'create'; name: string }
	| { kind: 'web'; query: string };

interface SearchBarOptions {
	embedded: boolean;
	leafFor: (newTab: boolean) => WorkspaceLeaf;
}

const SHORTCUTS: [string, string][] = [
	['↑↓', 'to navigate'],
	['↵', 'to open'],
	['ctrl ↵', 'to open in new tab'],
	['shift ↵', 'to create'],
	['tab', 'after a file type to filter'],
	['esc', 'to dismiss'],
];

function omnisearchApi(): OmnisearchApi | null {
	const api = (window as unknown as { omnisearch?: OmnisearchApi }).omnisearch;
	return api && typeof api.search === 'function' ? api : null;
}

export class SearchBar extends Component {
	private inputEl!: HTMLInputElement;
	private filterEl!: HTMLElement;
	private resultsEl!: HTMLElement;
	private filter: SearchFilter | null = null;
	private results: Result[] = [];
	private selected = 0;
	private searchId = 0;
	private omniTimer: number | null = null;

	constructor(private containerEl: HTMLElement, private feature: HomeTabFeature, private options: SearchBarOptions) {
		super();
	}

	private get settings() {
		return this.feature.settings;
	}

	override onload(): void {
		const wrapper = this.containerEl;
		wrapper.addClass('btn-home-search');
		wrapper.toggleClass('is-phone', Platform.isPhone);
		wrapper.toggleClass('use-accent', this.settings.accentSelection);

		const bar = wrapper.createDiv({ cls: 'btn-home-search-bar' });
		setIcon(bar.createSpan({ cls: 'btn-home-search-icon' }), 'search');
		this.filterEl = bar.createSpan({ cls: 'btn-home-search-filter nav-file-tag' });
		this.filterEl.hide();
		this.inputEl = bar.createEl('input', {
			type: 'search',
			attr: { placeholder: 'Search files...', spellcheck: 'false', enterkeyhint: 'go' },
		});
		this.resultsEl = wrapper.createDiv({ cls: 'btn-home-results' });

		this.registerDomEvent(this.inputEl, 'input', () => this.search());
		this.registerDomEvent(this.inputEl, 'keydown', evt => this.onKeyDown(evt));
		this.register(() => {
			if (this.omniTimer !== null) window.clearTimeout(this.omniTimer);
		});
	}

	focus(): void {
		// Don't pop up the keyboard on phones just because the tab opened.
		if (!Platform.isMobile) this.inputEl?.focus();
	}

	private setFilter(filter: SearchFilter | null): void {
		if (filter?.kind === 'omnisearch' && !omnisearchApi()) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- names of other plugins and apps are proper nouns
			new Notice('The Omnisearch plugin is not enabled.');
			filter = null;
		}
		this.filter = filter;
		this.filterEl.setText(filter ? filterLabel(filter) : '');
		this.filterEl.toggle(!!filter);
		this.inputEl.placeholder = filter?.kind === 'web' ? 'Search the web...' : 'Search files...';
		this.inputEl.value = '';
		this.search();
	}

	private onKeyDown(evt: KeyboardEvent): void {
		const mod = Keymap.isModifier(evt, 'Mod');
		switch (evt.key) {
			case 'ArrowDown':
				evt.preventDefault();
				this.select(this.selected + 1);
				return;
			case 'ArrowUp':
				evt.preventDefault();
				this.select(this.selected - 1);
				return;
			case 'Enter':
				evt.preventDefault();
				if (evt.shiftKey) void this.createNote(this.inputEl.value, mod);
				else void this.use(this.results[this.selected], mod);
				return;
			case 'Escape':
				if (this.inputEl.value || this.filter) {
					evt.preventDefault();
					this.inputEl.value = '';
					this.search();
				} else {
					this.inputEl.blur();
				}
				return;
			case 'Tab': {
				const extensions = new Set(this.app().vault.getFiles().map(f => f.extension.toLowerCase()));
				const filter = parseFilter(this.inputEl.value, extensions);
				if (filter) {
					evt.preventDefault();
					this.setFilter(filter);
				}
				return;
			}
			case 'Backspace':
				if (!this.inputEl.value && this.filter) {
					evt.preventDefault();
					this.setFilter(null);
				}
				return;
		}
	}

	private app() {
		return this.feature.app;
	}

	private search(): void {
		const query = this.inputEl.value.trim();
		const id = ++this.searchId;
		if (!query) {
			this.show([]);
			return;
		}
		if (this.filter?.kind === 'web') {
			this.show([{ kind: 'web', query }]);
			return;
		}
		const omni = this.filter?.kind === 'omnisearch' || (!this.filter && this.settings.useOmnisearch && !!omnisearchApi());
		if (omni) {
			// Omnisearch is async and heavier; wait for a short pause in typing.
			if (this.omniTimer !== null) window.clearTimeout(this.omniTimer);
			this.omniTimer = window.setTimeout(() => void this.searchOmnisearch(query, id), 150);
			return;
		}
		this.show(this.searchFiles(query));
	}

	private async searchOmnisearch(query: string, id: number): Promise<void> {
		const api = omnisearchApi();
		if (!api) return;
		const found = await api.search(query);
		if (id !== this.searchId) return;
		const results: Result[] = found.slice(0, this.settings.maxResults).map(result => ({ kind: 'omnisearch', result }));
		if (results.length === 0) results.push({ kind: 'create', name: query });
		this.show(results);
	}

	private searchFiles(query: string): Result[] {
		const fuzzy = prepareFuzzySearch(query);
		const scored: Extract<Result, { kind: 'file' }>[] = [];
		let exactMatch = false;
		for (const item of this.feature.getSearchItems()) {
			if (item.unresolved && !this.settings.showUnresolved) continue;
			if (!matchesFilter(item, this.filter, this.settings.markdownOnly)) continue;
			if (item.basename.toLowerCase() === query.toLowerCase() && item.extension === 'md') exactMatch = true;

			// Best of the file name and its aliases.
			let best: { text: string; score: number; matches: SearchMatches } | null = null;
			for (const text of [item.basename, ...item.aliases]) {
				const match = fuzzy(text);
				if (match && (!best || match.score > best.score)) best = { text, score: match.score, matches: match.matches };
			}
			if (!best) continue;
			// Small bonus for existing files and plain names over aliases.
			const score = best.score + (item.unresolved ? -0.5 : 0) + (best.text === item.basename ? 0.1 : 0);
			scored.push({ kind: 'file', item, text: best.text, matches: best.matches, score });
		}
		const results: Result[] = orderResults(scored).slice(0, this.settings.maxResults);
		if (!exactMatch && canCreateWith(this.filter)) results.push({ kind: 'create', name: query });
		return results;
	}

	private show(results: Result[]): void {
		this.results = results;
		this.selected = 0;
		this.resultsEl.empty();
		this.containerEl.toggleClass('has-results', results.length > 0);
		if (results.length === 0) return;

		const list = this.resultsEl.createDiv({ cls: 'btn-home-result-list' });
		results.forEach((result, i) => {
			const row = list.createDiv({ cls: 'btn-home-result' });
			this.renderResult(row, result);
			row.addEventListener('mousemove', () => {
				if (this.selected !== i) this.select(i);
			});
			// Keep focus in the input while clicking.
			row.addEventListener('mousedown', evt => evt.preventDefault());
			row.addEventListener('click', evt => void this.use(result, !!Keymap.isModEvent(evt)));
			row.addEventListener('auxclick', evt => {
				if (evt.button === 1) void this.use(result, true);
			});
		});
		this.select(0);

		if (this.settings.showShortcuts && !Platform.isMobile) {
			const hints = this.resultsEl.createDiv({ cls: 'btn-home-shortcuts' });
			for (const [key, action] of SHORTCUTS) {
				const hint = hints.createSpan({ cls: 'btn-home-shortcut' });
				hint.createEl('kbd', { text: key });
				hint.appendText(` ${action}`);
			}
		}
	}

	private renderResult(row: HTMLElement, result: Result): void {
		const icon = row.createSpan({ cls: 'btn-home-result-icon' });
		const title = row.createSpan({ cls: 'btn-home-result-title' });
		switch (result.kind) {
			case 'file': {
				const { item } = result;
				setIcon(icon, item.unresolved ? 'file-plus' : iconFor(item));
				renderMatches(title, result.text, result.matches);
				if (result.text !== item.basename) row.createSpan({ cls: 'btn-home-result-alias', text: item.basename });
				if (item.extension !== 'md') row.createSpan({ cls: 'nav-file-tag', text: item.extension });
				if (item.unresolved) row.createSpan({ cls: 'btn-home-result-note', text: 'not created yet' });
				if (this.settings.showPath) row.createSpan({ cls: 'btn-home-result-path', text: parentFolderName(item.path) });
				break;
			}
			case 'omnisearch': {
				setIcon(icon, 'file-search');
				title.setText(result.result.basename);
				if (this.settings.showPath) row.createSpan({ cls: 'btn-home-result-path', text: parentFolderName(result.result.path) });
				if (this.settings.showOmnisearchExcerpt && result.result.excerpt) {
					row.createDiv({ cls: 'btn-home-result-excerpt', text: result.result.excerpt.replace(/<[^>]*>/g, '') });
				}
				break;
			}
			case 'create':
				setIcon(icon, 'file-plus');
				title.setText(`Create "${result.name}"`);
				break;
			case 'web':
				setIcon(icon, 'globe');
				title.setText(`Search the web for "${result.query}"`);
				break;
		}
	}

	private select(index: number): void {
		if (this.results.length === 0) return;
		this.selected = (index + this.results.length) % this.results.length;
		const rows = this.resultsEl.querySelectorAll('.btn-home-result');
		rows.forEach((row, i) => row.toggleClass('is-selected', i === this.selected));
		rows[this.selected]?.scrollIntoView({ block: 'nearest' });
	}

	private async use(result: Result | undefined, newTab: boolean): Promise<void> {
		if (!result) return;
		const { vault } = this.app();
		switch (result.kind) {
			case 'file': {
				const file = vault.getFileByPath(result.item.path);
				if (file) await this.open(file, newTab);
				else await this.createNote(result.item.path.replace(/\.md$/, ''), newTab, true);
				break;
			}
			case 'omnisearch': {
				const file = vault.getFileByPath(result.result.path);
				if (file) await this.open(file, newTab);
				break;
			}
			case 'create':
				await this.createNote(result.name, newTab);
				break;
			case 'web':
				window.open(this.settings.webSearchUrl.replace('%s', encodeURIComponent(result.query)));
				break;
		}
	}

	private async open(file: TFile, newTab: boolean): Promise<void> {
		this.inputEl.value = '';
		this.show([]);
		await this.options.leafFor(newTab).openFile(file);
	}

	/**
	 * Create a note named `name` (opening it instead if it already exists, like
	 * the quick switcher). `isPath` means `name` is a vault path, e.g. from an
	 * unresolved link; otherwise the note goes in the default new note folder.
	 */
	private async createNote(name: string, newTab: boolean, isPath = false): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) return;
		const { vault, fileManager } = this.app();
		const existing = vault.getMarkdownFiles().find(f => f.basename === trimmed || f.path === `${trimmed}.md`);
		if (existing) return this.open(existing, newTab);

		const parent = isPath ? '' : fileManager.getNewFileParent('').path;
		const path = normalizePath(parent && parent !== '/' ? `${parent}/${trimmed}.md` : `${trimmed}.md`);
		const folder = path.split('/').slice(0, -1).join('/');
		if (folder && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
		try {
			const file = await vault.create(path, '');
			await this.open(file, newTab);
		} catch (e) {
			new Notice(`Couldn't create ${path}: ${(e as Error).message}`);
		}
	}
}
