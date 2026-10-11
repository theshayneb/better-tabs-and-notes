// Review a note's properties and delete the ones you pick.
// Based on Frontmatter Cleaner by sharfaroz (MIT); see NOTICE.md.

import { Modal, Notice, TFile, type App, type Command } from 'obsidian';
import { Feature } from '../../feature';
import type { FrontmatterCleanerSettings } from '../../settings';
import {
	buildRecordBlock, formatValue, insertRecord, isEmptyValue,
	type RecordFormat, type RecordLocation, type RemovedProperty,
} from './cleanerLogic';

interface Entry {
	key: string;
	displayValue: string;
	isEmpty: boolean;
}

export class FrontmatterCleanerFeature extends Feature {
	readonly id = 'frontmatterCleaner';
	readonly name = 'Frontmatter cleaner';

	private ribbonEl: HTMLElement | null = null;

	get settings(): FrontmatterCleanerSettings {
		return this.plugin.settings.frontmatterCleaner;
	}

	override onload(): void {
		this.updateRibbon();
	}

	override onunload(): void {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
	}

	override onSettingsChange(): void {
		this.updateRibbon();
	}

	override commands(): Command[] {
		const withFile = (run: (file: TFile) => void) => (checking: boolean) => {
			const file = this.app.workspace.getActiveFile();
			if (!(file instanceof TFile) || file.extension !== 'md') return false;
			if (!checking) run(file);
			return true;
		};
		return [
			{
				id: 'clean-frontmatter',
				name: 'Clean properties of current file',
				icon: 'list-checks',
				checkCallback: withFile(file => this.openCleaner(file)),
			},
			{
				id: 'delete-empty-properties',
				name: 'Delete empty properties of current file',
				icon: 'eraser',
				checkCallback: withFile(file => void this.deleteEmpty(file)),
			},
		];
	}

	private updateRibbon(): void {
		if (this.settings.showRibbonIcon && !this.ribbonEl) {
			this.ribbonEl = this.plugin.addRibbonIcon('list-checks', 'Clean properties', () => {
				const file = this.app.workspace.getActiveFile();
				if (file) this.openCleaner(file);
				else new Notice('Open a note first.');
			});
		} else if (!this.settings.showRibbonIcon && this.ribbonEl) {
			this.ribbonEl.remove();
			this.ribbonEl = null;
		}
	}

	openCleaner(file: TFile): void {
		new PropertyCleanerModal(this.app, this, file).open();
	}

	/** Delete blank, null and empty-list properties without asking. */
	async deleteEmpty(file: TFile): Promise<void> {
		let removed = 0;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const key of Object.keys(fm)) {
				if (isEmptyValue(fm[key])) {
					delete fm[key];
					removed++;
				}
			}
		});
		new Notice(removed === 0 ? 'No empty properties.' : `Deleted ${removed} empty propert${removed === 1 ? 'y' : 'ies'}.`);
	}

	/** Delete properties, then (optionally) write a record of them into the note. */
	async deleteProperties(file: TFile, keys: string[], record: { format: RecordFormat; location: RecordLocation } | null): Promise<void> {
		const removed: RemovedProperty[] = [];
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const key of keys) {
				removed.push({ key, value: fm[key] });
				delete fm[key];
			}
		});

		if (record) {
			const block = buildRecordBlock(removed, record.format);
			const heading = { text: this.settings.headingText, level: this.settings.headingLevel };
			await this.app.vault.process(file, content => insertRecord(content, block, record.location, heading));
			// Remember the last choices as the new defaults.
			this.settings.recordFormat = record.format;
			this.settings.recordLocation = record.location;
			await this.plugin.saveSettings();
		}

		new Notice(`Deleted ${keys.length} propert${keys.length === 1 ? 'y' : 'ies'}${record ? ' (record kept).' : '.'}`);
	}
}

class PropertyCleanerModal extends Modal {
	private entries: Entry[] = [];
	private selected = new Set<string>();
	private rows = new Map<string, { row: HTMLElement; checkbox: HTMLInputElement }>();
	private deleteButton!: HTMLButtonElement;
	private keepRecord: boolean;
	private format: RecordFormat;
	private location: RecordLocation;

	constructor(app: App, private feature: FrontmatterCleanerFeature, private file: TFile) {
		super(app);
		const s = feature.settings;
		this.keepRecord = s.keepRecordByDefault;
		this.format = s.recordFormat;
		this.location = s.recordLocation;
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('btn-fmc-modal');
		this.setTitle('Properties');
		contentEl.createEl('p', { text: this.file.basename, cls: 'btn-fmc-filename' });

		const frontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const keys = frontmatter ? Object.keys(frontmatter).filter(k => k !== 'position') : [];
		if (!frontmatter || keys.length === 0) {
			contentEl.createEl('p', { text: 'This note has no properties.' });
			return;
		}
		this.entries = keys.map(key => ({
			key,
			displayValue: formatValue(frontmatter[key]),
			isEmpty: isEmptyValue(frontmatter[key]),
		}));

		this.renderToolbar(contentEl);

		const list = contentEl.createDiv({ cls: 'btn-fmc-list' });
		for (const entry of this.entries) {
			const row = list.createDiv({ cls: 'btn-fmc-row' });
			const checkbox = row.createEl('input', { type: 'checkbox', cls: 'btn-fmc-checkbox' });
			checkbox.tabIndex = -1;
			const text = row.createDiv({ cls: 'btn-fmc-text' });
			const keyLine = text.createDiv({ cls: 'btn-fmc-key-line' });
			keyLine.createSpan({ text: entry.key, cls: 'btn-fmc-key' });
			if (entry.isEmpty) keyLine.createSpan({ text: 'Empty', cls: 'btn-fmc-badge' });
			text.createSpan({ text: entry.displayValue, cls: 'btn-fmc-value' });
			// The whole row is the tap target, not just the checkbox.
			row.addEventListener('click', () => this.setSelected(entry.key, !checkbox.checked));
			this.rows.set(entry.key, { row, checkbox });
		}

		this.renderRecordOptions(contentEl);

		const footer = contentEl.createDiv({ cls: 'btn-fmc-footer' });
		footer.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		this.deleteButton = footer.createEl('button', { text: 'Delete selected (0)', cls: 'mod-warning' });
		this.deleteButton.disabled = true;
		this.deleteButton.addEventListener('click', () => void this.deleteSelected());
	}

	private renderToolbar(contentEl: HTMLElement): void {
		const emptyCount = this.entries.filter(e => e.isEmpty).length;
		const toolbar = contentEl.createDiv({ cls: 'btn-fmc-toolbar' });
		toolbar.createEl('button', { text: 'Select all', cls: 'btn-fmc-chip' })
			.addEventListener('click', () => this.selectWhere(() => true));
		toolbar.createEl('button', { text: 'Select none', cls: 'btn-fmc-chip' })
			.addEventListener('click', () => this.selectWhere(() => false));
		const empty = toolbar.createEl('button', { text: `Empty (${emptyCount})`, cls: 'btn-fmc-chip' });
		empty.disabled = emptyCount === 0;
		empty.addEventListener('click', () => this.selectWhere(e => e.isEmpty));
	}

	private renderRecordOptions(contentEl: HTMLElement): void {
		const section = contentEl.createDiv({ cls: 'btn-fmc-record' });
		const label = section.createEl('label', { cls: 'btn-fmc-record-toggle' });
		const toggle = label.createEl('input', { type: 'checkbox' });
		toggle.checked = this.keepRecord;
		label.createSpan({ text: 'Keep a record in the note instead of just deleting' });

		const options = section.createDiv({ cls: 'btn-fmc-record-options' });
		options.toggleClass('is-hidden', !this.keepRecord);

		const formatSelect = options.createEl('select', { cls: 'dropdown' });
		formatSelect.createEl('option', { text: 'Markdown table', value: 'table' });
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- shows the literal syntax
		formatSelect.createEl('option', { text: 'property: value', value: 'colon' });
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- shows the literal syntax
		formatSelect.createEl('option', { text: 'property:: value', value: 'dataview' });
		formatSelect.value = this.format;

		const s = this.feature.settings;
		const locationSelect = options.createEl('select', { cls: 'dropdown' });
		locationSelect.createEl('option', { text: 'Top of note', value: 'top' });
		locationSelect.createEl('option', { text: 'Bottom of note', value: 'bottom' });
		locationSelect.createEl('option', { text: `Under heading "${'#'.repeat(s.headingLevel)} ${s.headingText}"`, value: 'heading' });
		locationSelect.value = this.location;

		toggle.addEventListener('change', () => {
			this.keepRecord = toggle.checked;
			options.toggleClass('is-hidden', !this.keepRecord);
		});
		formatSelect.addEventListener('change', () => { this.format = formatSelect.value as RecordFormat; });
		locationSelect.addEventListener('change', () => { this.location = locationSelect.value as RecordLocation; });
	}

	private setSelected(key: string, selected: boolean): void {
		const refs = this.rows.get(key);
		if (!refs) return;
		refs.checkbox.checked = selected;
		refs.row.toggleClass('is-selected', selected);
		if (selected) this.selected.add(key);
		else this.selected.delete(key);
		this.deleteButton.setText(`Delete selected (${this.selected.size})`);
		this.deleteButton.disabled = this.selected.size === 0;
	}

	private selectWhere(predicate: (entry: Entry) => boolean): void {
		for (const entry of this.entries) this.setSelected(entry.key, predicate(entry));
	}

	private async deleteSelected(): Promise<void> {
		if (this.selected.size === 0) return;
		const record = this.keepRecord ? { format: this.format, location: this.location } : null;
		await this.feature.deleteProperties(this.file, Array.from(this.selected), record);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.rows.clear();
	}
}
