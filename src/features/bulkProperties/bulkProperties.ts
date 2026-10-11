// Add, change or remove properties in many notes at once: a folder, or a selection in the file explorer.
// Based on Multi Properties by technohiker (MIT); see NOTICE.md.

import { Modal, Notice, Setting, TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { Feature } from '../../feature';
import type { BulkPropertiesSettings } from '../../settings';
import {
	applyProperties, countProperties, parseValue, removeProperties,
	type ExistingMode, type NewProperty, type ValueType,
} from './bulkLogic';

const TYPE_LABELS: Record<ValueType, string> = {
	text: 'Text or list',
	number: 'Number',
	checkbox: 'Checkbox',
	date: 'Date',
	datetime: 'Date and time',
};

const INPUT_TYPES: Record<ValueType, string> = {
	text: 'text',
	number: 'number',
	checkbox: 'checkbox',
	date: 'date',
	datetime: 'datetime-local',
};

/** Obsidian's property types mapped to the form's. */
function valueTypeFor(obsidianType: string | undefined): ValueType {
	switch (obsidianType) {
		case 'number': return 'number';
		case 'checkbox': return 'checkbox';
		case 'date': return 'date';
		case 'datetime': return 'datetime';
		default: return 'text';
	}
}

export class BulkPropertiesFeature extends Feature {
	readonly id = 'bulkProperties';
	readonly name = 'Bulk properties';

	get settings(): BulkPropertiesSettings {
		return this.plugin.settings.bulkProperties;
	}

	override onload(): void {
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFolder)) return;
			menu.addItem(item => item
				.setSection('action')
				.setIcon('list-plus')
				.setTitle('Add or change properties in folder')
				.onClick(() => this.openAdd([file], `the folder "${file.name}"`)));
			menu.addItem(item => item
				.setSection('action')
				.setIcon('list-x')
				.setTitle('Remove properties from folder')
				.onClick(() => this.openRemove([file], `the folder "${file.name}"`)));
		}));

		this.registerEvent(this.app.workspace.on('files-menu', (menu, files) => {
			if (this.collectNotes(files).length === 0) return;
			menu.addItem(item => item
				.setSection('action')
				.setIcon('list-plus')
				.setTitle('Add or change properties in selected notes')
				.onClick(() => this.openAdd(files, 'the selected notes')));
			menu.addItem(item => item
				.setSection('action')
				.setIcon('list-x')
				.setTitle('Remove properties from selected notes')
				.onClick(() => this.openRemove(files, 'the selected notes')));
		}));
	}

	/** Markdown notes in the given files and folders (folders include subfolders if set). */
	collectNotes(items: TAbstractFile[]): TFile[] {
		const notes = new Map<string, TFile>();
		const visit = (item: TAbstractFile, depth: number) => {
			if (item instanceof TFile) {
				if (item.extension === 'md') notes.set(item.path, item);
			} else if (item instanceof TFolder && (depth === 0 || this.settings.includeSubfolders)) {
				for (const child of item.children) visit(child, depth + 1);
			}
		};
		for (const item of items) visit(item, 0);
		return [...notes.values()];
	}

	saveSettings(): Promise<void> {
		return this.plugin.saveSettings('bulkProperties');
	}

	propertyType(name: string): string | undefined {
		const info = this.app.metadataCache.getAllPropertyInfos?.()[name.toLowerCase()];
		return info?.widget ?? info?.type;
	}

	knownProperties(): string[] {
		const infos = this.app.metadataCache.getAllPropertyInfos?.() ?? {};
		return Object.values(infos).map(i => i.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	}

	private openAdd(items: TAbstractFile[], where: string): void {
		const notes = this.collectNotes(items);
		if (notes.length === 0) {
			new Notice(`There are no notes in ${where}.`);
			return;
		}
		new AddPropertiesModal(this.app, this, notes, where).open();
	}

	private openRemove(items: TAbstractFile[], where: string): void {
		const notes = this.collectNotes(items);
		const props = countProperties(notes.map(n => this.app.metadataCache.getFileCache(n)?.frontmatter));
		if (props.length === 0) {
			new Notice(`The notes in ${where} have no properties.`);
			return;
		}
		new RemovePropertiesModal(this.app, this, notes, where, props).open();
	}

	/** Run `edit` on every note's frontmatter, reporting progress and failures. */
	async editAll(notes: TFile[], verb: string, edit: (fm: Record<string, unknown>) => boolean): Promise<void> {
		const progress = new Notice(`${verb} 0 of ${notes.length} notes...`, 0);
		let changed = 0;
		const failed: string[] = [];
		for (const [i, note] of notes.entries()) {
			try {
				let didChange = false;
				await this.app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
					didChange = edit(fm);
				});
				if (didChange) changed++;
			} catch (e) {
				console.error(`Better Tabs and Notes: couldn't update ${note.path}`, e);
				failed.push(note.path);
			}
			if (i % 10 === 9) progress.setMessage(`${verb} ${i + 1} of ${notes.length} notes...`);
		}
		progress.hide();
		new Notice(`Updated ${changed} of ${notes.length} notes.${failed.length ? ` Couldn't update ${failed.length}; see the developer console.` : ''}`, 6000);
	}
}

/** Ask before changing many notes. */
function confirm(app: App, message: string, action: string): Promise<boolean> {
	return new Promise(resolve => {
		const modal = new Modal(app);
		let done = false;
		modal.setTitle('Are you sure?');
		modal.contentEl.createEl('p', { text: message });
		new Setting(modal.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => modal.close()))
			.addButton(b => b.setButtonText(action).setWarning().onClick(() => {
				done = true;
				resolve(true);
				modal.close();
			}));
		modal.onClose = () => {
			if (!done) resolve(false);
		};
		modal.open();
	});
}

interface Row {
	name: HTMLInputElement;
	type: HTMLSelectElement;
	value: HTMLInputElement;
}

class AddPropertiesModal extends Modal {
	private rows: Row[] = [];
	private rowsEl!: HTMLElement;
	private datalistId = `btn-bulk-props-${Math.random().toString(36).slice(2)}`;

	constructor(app: App, private feature: BulkPropertiesFeature, private notes: TFile[], private where: string) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('btn-bulk-modal');
		this.setTitle('Add or change properties');
		contentEl.createEl('p', {
			cls: 'btn-muted',
			text: `In ${this.notes.length} note${this.notes.length === 1 ? '' : 's'} in ${this.where}. `
				+ `For a list, use the "Text or list" type and separate values with "${this.feature.settings.delimiter}".`,
		});

		const datalist = contentEl.createEl('datalist', { attr: { id: this.datalistId } });
		for (const name of this.feature.knownProperties()) datalist.createEl('option', { attr: { value: name } });

		new Setting(contentEl)
			.setName('If a note already has the property')
			.addDropdown(dd => dd
				.addOptions({ ignore: 'Leave it as it is', overwrite: 'Replace its value', append: 'Add to its list of values' })
				.setValue(this.feature.settings.existingMode)
				.onChange(v => { this.feature.settings.existingMode = v as ExistingMode; }));

		this.rowsEl = contentEl.createDiv({ cls: 'btn-bulk-rows' });
		this.addRow();

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Add another property').setIcon('plus').onClick(() => this.addRow()))
			.addButton(b => b.setButtonText('Apply').setCta().onClick(() => void this.submit()));
	}

	private addRow(): void {
		const rowEl = this.rowsEl.createDiv({ cls: 'btn-bulk-row' });
		const name = rowEl.createEl('input', { type: 'text', cls: 'btn-bulk-name', attr: { placeholder: 'Property', list: this.datalistId } });
		const type = rowEl.createEl('select', { cls: 'dropdown btn-bulk-type' });
		for (const [value, label] of Object.entries(TYPE_LABELS)) type.createEl('option', { text: label, value });
		const value = rowEl.createEl('input', { type: 'text', cls: 'btn-bulk-value', attr: { placeholder: 'Value' } });
		const remove = rowEl.createEl('button', { cls: 'clickable-icon btn-bulk-remove', attr: { 'aria-label': 'Remove' } });
		remove.setText('×');

		const row: Row = { name, type, value };
		const setType = (t: ValueType) => {
			type.value = t;
			value.type = INPUT_TYPES[t];
		};
		// Pick the type Obsidian already uses for a known property.
		name.addEventListener('change', () => {
			const known = this.feature.propertyType(name.value.trim());
			if (known) setType(valueTypeFor(known));
		});
		type.addEventListener('change', () => setType(type.value as ValueType));
		remove.addEventListener('click', () => {
			if (this.rows.length === 1) return;
			this.rows = this.rows.filter(r => r !== row);
			rowEl.remove();
		});
		this.rows.push(row);
		name.focus();
	}

	private async submit(): Promise<void> {
		const delimiter = this.feature.settings.delimiter;
		const props: NewProperty[] = [];
		const names = new Set<string>();
		for (const row of this.rows) {
			const name = row.name.value.trim();
			if (!name) continue;
			if (names.has(name.toLowerCase())) {
				new Notice(`"${name}" is in the list twice.`);
				return;
			}
			names.add(name.toLowerCase());
			const type = row.type.value as ValueType;
			const raw = type === 'checkbox' ? row.value.checked : row.value.value;
			props.push({ name, type, value: parseValue(name, type, raw, delimiter) });
		}
		if (props.length === 0) {
			new Notice('Type a property name first.');
			return;
		}

		const mode = this.feature.settings.existingMode;
		const list = props.map(p => p.name).join(', ');
		const ok = await confirm(this.app,
			`Set ${list} in ${this.notes.length} note${this.notes.length === 1 ? '' : 's'} in ${this.where}?`, 'Apply');
		if (!ok) return;
		// Remember the choice for next time.
		await this.feature.saveSettings();
		this.close();
		await this.feature.editAll(this.notes, 'Updating', fm => {
			const before = JSON.stringify(fm);
			applyProperties(fm, props, mode, n => this.feature.propertyType(n));
			return JSON.stringify(fm) !== before;
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

class RemovePropertiesModal extends Modal {
	private selected = new Set<string>();

	constructor(
		app: App, private feature: BulkPropertiesFeature, private notes: TFile[], private where: string,
		private props: { name: string; count: number }[],
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('btn-bulk-modal');
		this.setTitle('Remove properties');
		contentEl.createEl('p', {
			cls: 'btn-muted',
			text: `Properties found in the ${this.notes.length} note${this.notes.length === 1 ? '' : 's'} in ${this.where}, with how many notes have each.`,
		});

		const list = contentEl.createDiv({ cls: 'btn-bulk-remove-list' });
		for (const { name, count } of this.props) {
			const label = list.createEl('label', { cls: 'btn-bulk-remove-row' });
			const box = label.createEl('input', { type: 'checkbox' });
			label.createSpan({ cls: 'btn-bulk-remove-name', text: name });
			label.createSpan({ cls: 'btn-muted', text: `${count} note${count === 1 ? '' : 's'}` });
			box.addEventListener('change', () => {
				if (box.checked) this.selected.add(name);
				else this.selected.delete(name);
			});
		}

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Remove').setWarning().onClick(() => void this.submit()));
	}

	private async submit(): Promise<void> {
		const names = [...this.selected];
		if (names.length === 0) {
			new Notice('Tick the properties to remove first.');
			return;
		}
		// Only touch notes that have one of the properties.
		const affected = this.notes.filter(n => {
			const fm = this.app.metadataCache.getFileCache(n)?.frontmatter;
			return fm && names.some(name => name in fm);
		});
		const ok = await confirm(this.app,
			`Remove ${names.join(', ')} from ${affected.length} note${affected.length === 1 ? '' : 's'} in ${this.where}? This can't be undone.`, 'Remove');
		if (!ok) return;
		this.close();
		await this.feature.editAll(affected, 'Removing from', fm => removeProperties(fm, names) > 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
