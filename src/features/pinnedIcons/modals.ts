// Pickers used by the pinned tab icon rules.
// Based on Pinned Tabs Customizer by Diego (0BSD); see NOTICE.md.

import { App, FuzzySuggestModal, Modal, Setting, TFile, TFolder, getAllTags, getIconIds, setIcon, type FuzzyMatch } from 'obsidian';
import type { RuleType } from '../../settings';
import { EMOJI_CATEGORIES } from './emojiData';
import { LUCIDE_PREFIX, RULE_TYPE_LABELS, isLucideIcon, lucideName, testPattern } from './rules';

export class FilePickerModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (file: TFile) => void) {
		super(app);
		this.setPlaceholder('Search for a file...');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private onPick: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder('Search for a folder...');
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && !f.isRoot());
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}

export class TagPickerModal extends FuzzySuggestModal<string> {
	private tags: string[];

	constructor(app: App, private onPick: (tag: string) => void) {
		super(app);
		this.setPlaceholder('Search for a tag...');
		const tags = new Set<string>();
		for (const file of app.vault.getMarkdownFiles()) {
			const cache = app.metadataCache.getFileCache(file);
			if (cache) getAllTags(cache)?.forEach(t => tags.add(t.replace(/^#/, '')));
		}
		this.tags = [...tags].sort();
	}

	getItems(): string[] {
		return this.tags;
	}

	getItemText(tag: string): string {
		return tag;
	}

	override renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		el.createSpan({ text: '#', cls: 'btn-tag-hash' });
		el.createSpan({ text: match.item });
	}

	onChooseItem(tag: string): void {
		this.onPick(tag);
	}
}

/** Lucide icons registered in Obsidian, without the `lucide-` prefix. */
function lucideIconNames(): string[] {
	return getIconIds()
		.filter(id => id.startsWith('lucide-'))
		.map(id => id.slice('lucide-'.length))
		.sort();
}

const MAX_ICONS_SHOWN = 240;

export class IconPickerModal extends Modal {
	private query = '';
	private category = 'recent';
	private gridEl!: HTMLElement;
	private icons = lucideIconNames();

	constructor(app: App, private recent: string[], private onPick: (icon: string) => void) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('btn-icon-picker');
		this.setTitle('Choose an icon');

		const search = contentEl.createEl('input', {
			type: 'search',
			cls: 'btn-icon-search',
			attr: { placeholder: 'Search icons...' },
		});
		search.addEventListener('input', () => {
			this.query = search.value.trim().toLowerCase();
			this.renderGrid();
		});

		const tabs = contentEl.createDiv({ cls: 'btn-icon-tabs' });
		const categories = [
			{ id: 'recent', name: 'Recent' },
			{ id: 'icons', name: 'Icons' },
			...EMOJI_CATEGORIES.map(c => ({ id: c.name, name: c.name })),
		];
		for (const cat of categories) {
			const tab = tabs.createEl('button', { text: cat.name, cls: 'btn-icon-tab' });
			tab.toggleClass('is-active', cat.id === this.category);
			tab.addEventListener('click', () => {
				this.category = cat.id;
				tabs.querySelectorAll('.btn-icon-tab').forEach(t => t.removeClass('is-active'));
				tab.addClass('is-active');
				this.renderGrid();
			});
		}

		this.gridEl = contentEl.createDiv({ cls: 'btn-icon-grid' });
		this.renderGrid();

		let custom = '';
		const useCustom = () => {
			if (custom.trim()) this.pick(custom.trim());
		};
		new Setting(contentEl)
			.setName('Custom')
			.setDesc('Any emoji or short text.')
			.addText(text => {
				text.setPlaceholder('🏠').onChange(value => { custom = value; });
				text.inputEl.addEventListener('keydown', e => {
					if (e.key === 'Enter') useCustom();
				});
			})
			.addButton(btn => btn.setButtonText('Use').onClick(useCustom));

		search.focus();
	}

	private pick(icon: string): void {
		this.onPick(icon);
		this.close();
	}

	private addButton(icon: string): void {
		const btn = this.gridEl.createEl('button', { cls: 'btn-icon-option' });
		if (isLucideIcon(icon)) {
			setIcon(btn, lucideName(icon));
			btn.setAttr('aria-label', lucideName(icon));
		} else {
			btn.setText(icon);
		}
		btn.addEventListener('click', () => this.pick(icon));
	}

	private renderGrid(): void {
		this.gridEl.empty();
		let icons: string[];
		if (this.query) {
			icons = this.icons.filter(name => name.includes(this.query)).map(name => LUCIDE_PREFIX + name);
		} else if (this.category === 'recent') {
			icons = this.recent;
		} else if (this.category === 'icons') {
			icons = this.icons.map(name => LUCIDE_PREFIX + name);
		} else {
			icons = EMOJI_CATEGORIES.find(c => c.name === this.category)?.icons ?? [];
		}

		if (icons.length === 0) {
			this.gridEl.createDiv({
				cls: 'btn-icon-empty',
				text: this.query ? 'No icons found.' : 'No recent icons yet.',
			});
			return;
		}
		icons.slice(0, MAX_ICONS_SHOWN).forEach(icon => this.addButton(icon));
		if (icons.length > MAX_ICONS_SHOWN) {
			this.gridEl.createDiv({
				cls: 'btn-icon-empty',
				text: `${icons.length - MAX_ICONS_SHOWN} more. Search to narrow down.`,
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

interface PatternPreset {
	name: string;
	type: RuleType;
	pattern: string;
}

const PATTERN_PRESETS: PatternPreset[] = [
	{ name: 'Daily notes (2024-01-15)', type: 'regex', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
	{ name: 'Weekly notes (2024-W03)', type: 'regex', pattern: '^\\d{4}-W\\d{2}$' },
	{ name: 'Monthly notes (2024-01)', type: 'regex', pattern: '^\\d{4}-\\d{2}$' },
	{ name: 'Meeting notes', type: 'starts-with', pattern: 'Meeting' },
	{ name: 'Index files', type: 'regex', pattern: '^[Ii]ndex$' },
	{ name: 'Templates', type: 'starts-with', pattern: 'Template' },
];

const NAME_RULE_TYPES: RuleType[] = ['exact', 'starts-with', 'ends-with', 'contains', 'regex'];
const MAX_PREVIEW = 20;

/** Edit a name-based rule with presets and a live list of matching files. */
export class PatternEditorModal extends Modal {
	private type: RuleType;
	private previewEl!: HTMLElement;

	constructor(app: App, type: RuleType, private pattern: string, private onSave: (type: RuleType, pattern: string) => void) {
		super(app);
		this.type = NAME_RULE_TYPES.includes(type) ? type : 'starts-with';
	}

	override onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('btn-pattern-editor');
		this.setTitle('Name pattern');

		const presets = contentEl.createDiv({ cls: 'btn-pattern-presets' });
		for (const preset of PATTERN_PRESETS) {
			presets.createEl('button', { text: preset.name }).addEventListener('click', () => {
				this.type = preset.type;
				this.pattern = preset.pattern;
				this.render();
			});
		}

		new Setting(contentEl)
			.setName('Match type')
			.addDropdown(dd => {
				for (const type of NAME_RULE_TYPES) dd.addOption(type, RULE_TYPE_LABELS[type]);
				dd.setValue(this.type).onChange(value => {
					this.type = value as RuleType;
					this.renderPreview();
				});
			});

		new Setting(contentEl)
			.setName('Pattern')
			.setDesc('Matched against the file name without its extension. Case sensitive.')
			.addText(text => {
				text.setValue(this.pattern).onChange(value => {
					this.pattern = value;
					this.renderPreview();
				});
				text.inputEl.addClass('btn-pattern-input');
				window.setTimeout(() => text.inputEl.focus(), 20);
			});

		this.previewEl = contentEl.createDiv({ cls: 'btn-pattern-preview' });
		this.renderPreview();

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Save').setCta().onClick(() => {
				if (!this.pattern.trim()) return;
				this.onSave(this.type, this.pattern);
				this.close();
			}))
			.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private renderPreview(): void {
		this.previewEl.empty();
		if (!this.pattern) {
			this.previewEl.createDiv({ cls: 'btn-muted', text: 'Type a pattern to see which files match.' });
			return;
		}
		if (this.type === 'regex') {
			try {
				new RegExp(this.pattern);
			} catch (e) {
				this.previewEl.createDiv({ cls: 'btn-error', text: `Invalid regex: ${(e as Error).message}` });
				return;
			}
		}
		const matches = this.app.vault.getMarkdownFiles().filter(f => testPattern(f.basename, this.type, this.pattern));
		this.previewEl.createDiv({
			cls: 'btn-muted',
			text: matches.length === 1 ? '1 matching file' : `${matches.length} matching files`,
		});
		const list = this.previewEl.createEl('ul');
		for (const file of matches.slice(0, MAX_PREVIEW)) list.createEl('li', { text: file.path });
		if (matches.length > MAX_PREVIEW) list.createEl('li', { cls: 'btn-muted', text: `...and ${matches.length - MAX_PREVIEW} more` });
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
