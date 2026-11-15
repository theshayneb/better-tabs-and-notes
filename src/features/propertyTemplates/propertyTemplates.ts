// Property templates: rules (by folder, tag, name...) that list properties in
// order. Buttons under a note's properties insert the missing ones and put
// them in order; properties can offer a list of values to pick from.
// Inspired by Fileclass by mdelobelle (MIT); see NOTICE.md.

import { MarkdownView, Menu, Notice, TFile, TFolder, setIcon, type Command, type PropertyRenderContext, type PropertyWidget, type TAbstractFile } from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import type { PropertyTemplateSettings } from '../../settings';
import { confirm } from '../../shared/confirm';
import { redrawProperties } from '../../shared/properties';
import {
	choicesFor, insertMissing, isSorted, missingProperties, sortProperties, templateFor, templateValue,
	type TemplateProperty,
} from './templateLogic';

const ACTIONS_CLASS = 'btn-pt-actions';

export class PropertyTemplatesFeature extends Feature {
	readonly id = 'propertyTemplates';
	readonly name = 'Property templates';

	private refreshTimer: number | null = null;
	/** A redraw of the properties panels held back while the settings are open. */
	private redrawPending = false;

	get settings(): PropertyTemplateSettings {
		return this.plugin.settings.propertyTemplates;
	}

	override onload(): void {
		const later = () => this.scheduleRefresh();
		this.registerEvent(this.app.metadataCache.on('changed', later));
		this.registerEvent(this.app.workspace.on('layout-change', later));
		this.registerEvent(this.app.workspace.on('file-open', later));
		this.registerEvent(this.app.workspace.on('active-leaf-change', later));
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFolder) this.addFolderItems(menu, file);
		}));
		this.patchWidgets();
		this.app.workspace.onLayoutReady(later);
	}

	override onunload(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		for (const el of activeDocument.querySelectorAll(`.${ACTIONS_CLASS}`)) el.remove();
	}

	override onSettingsChange(): void {
		this.scheduleRefresh();
		// Redrawing the properties panels while typing in the settings would take the cursor away.
		if (this.plugin.settingsOpen) this.redrawPending = true;
		else redrawProperties(this.app);
	}

	override onSettingsClosed(): void {
		if (!this.redrawPending) return;
		this.redrawPending = false;
		redrawProperties(this.app);
	}

	override commands(): Command[] {
		const withNote = (run: (file: TFile) => void) => (checking: boolean) => {
			const file = this.app.workspace.getActiveFile();
			if (!(file instanceof TFile) || file.extension !== 'md' || this.templateOf(file).length === 0) return false;
			if (!checking) run(file);
			return true;
		};
		return [
			{
				id: 'insert-template-properties',
				name: 'Insert missing template properties',
				icon: 'list-plus',
				checkCallback: withNote(file => void this.insert(file)),
			},
			{
				id: 'sort-template-properties',
				name: 'Reorder properties by template',
				icon: 'arrow-up-down',
				checkCallback: withNote(file => void this.sort(file)),
			},
		];
	}

	// -----------------------------------------------------------------------
	// Templates
	// -----------------------------------------------------------------------

	templateOf(file: TFile): TemplateProperty[] {
		return templateFor(this.settings.rules, this.plugin.features.pinnedIcons.fileInfo(file));
	}

	/** The property's type as Obsidian has it, to convert default values. */
	private propertyType(name: string): string | undefined {
		const assigned = this.app.metadataTypeManager?.getAssignedWidget(name);
		if (assigned) return assigned;
		const info = this.app.metadataCache.getAllPropertyInfos?.()[name.toLowerCase()];
		return info?.widget ?? info?.type;
	}

	/** Insert the note's missing template properties. Returns how many were added. */
	async insert(file: TFile, quiet = false): Promise<number> {
		const template = this.templateOf(file);
		let added = 0;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			added = insertMissing(fm, template, p => templateValue(p.value, this.propertyType(p.name)));
		});
		if (!quiet) new Notice(added ? `Added ${added} propert${added === 1 ? 'y' : 'ies'}.` : 'Nothing to add.');
		return added;
	}

	/** Put the note's properties in template order. Returns whether anything moved. */
	async sort(file: TFile): Promise<boolean> {
		const template = this.templateOf(file);
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || isSorted(fm, template)) return false;
		let moved = false;
		await this.app.fileManager.processFrontMatter(file, (data: Record<string, unknown>) => {
			moved = sortProperties(data, template);
		});
		return moved;
	}

	// -----------------------------------------------------------------------
	// Buttons under the properties
	// -----------------------------------------------------------------------

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		// After Obsidian has redrawn the properties.
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refreshButtons();
		}, 80);
	}

	private refreshButtons(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;
			for (const container of view.containerEl.querySelectorAll<HTMLElement>('.metadata-container')) {
				this.renderButtons(container, view.file);
			}
		}
	}

	private renderButtons(container: HTMLElement, file: TFile | null): void {
		let actions = container.querySelector<HTMLElement>(`:scope > .${ACTIONS_CLASS}`);
		const template = file && this.settings.showButtons ? this.templateOf(file) : [];
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
		const missing = template.length ? missingProperties(fm, template).length : 0;
		const unsorted = template.length > 0 && !isSorted(fm, template);
		if (!file || (!missing && !unsorted)) {
			actions?.remove();
			return;
		}
		if (!actions) {
			actions = createDiv({ cls: ACTIONS_CLASS });
			const add = container.querySelector('.metadata-add-button');
			if (add) add.after(actions);
			else container.appendChild(actions);
		}
		actions.empty();
		if (missing) {
			this.renderButton(actions, 'list-plus', `Insert ${missing} missing propert${missing === 1 ? 'y' : 'ies'}`, () => this.insert(file, true));
		}
		if (unsorted) this.renderButton(actions, 'arrow-up-down', 'Reorder properties', () => this.sort(file));
	}

	private renderButton(parent: HTMLElement, icon: string, text: string, run: () => Promise<unknown>): void {
		// The same classes as Obsidian's "Add property" button, so it looks the same.
		const button = parent.createDiv({ cls: 'text-icon-button btn-pt-button', attr: { tabindex: '0' } });
		setIcon(button.createSpan({ cls: 'text-button-icon' }), icon);
		button.createSpan({ cls: 'text-button-label', text });
		const go = () => void run().then(() => this.scheduleRefresh());
		button.addEventListener('click', evt => {
			evt.preventDefault();
			go();
		});
		button.addEventListener('keydown', evt => {
			if (evt.key === 'Enter' || evt.key === ' ') {
				evt.preventDefault();
				go();
			}
		});
	}

	// -----------------------------------------------------------------------
	// Folders
	// -----------------------------------------------------------------------

	private addFolderItems(menu: Menu, folder: TFolder): void {
		const notes = (): TFile[] => {
			const found: TFile[] = [];
			const visit = (item: TAbstractFile) => {
				if (item instanceof TFile && item.extension === 'md' && this.templateOf(item).length) found.push(item);
				else if (item instanceof TFolder) item.children.forEach(visit);
			};
			visit(folder);
			return found;
		};
		menu.addItem(item => item.setSection('action').setIcon('list-plus').setTitle('Insert missing template properties')
			.onClick(() => void this.runOnFolder(folder, notes(), 'Insert missing template properties in', f => this.insert(f, true).then(n => n > 0))));
		menu.addItem(item => item.setSection('action').setIcon('arrow-up-down').setTitle('Reorder properties by template')
			.onClick(() => void this.runOnFolder(folder, notes(), 'Reorder the properties of', f => this.sort(f))));
	}

	private async runOnFolder(folder: TFolder, notes: TFile[], verb: string, run: (file: TFile) => Promise<boolean>): Promise<void> {
		if (notes.length === 0) {
			new Notice(`No notes in "${folder.name}" match a property template.`);
			return;
		}
		if (!await confirm(this.app, `${verb} ${notes.length} note${notes.length === 1 ? '' : 's'} in "${folder.name}"? This can't be undone.`, 'Go')) return;
		let changed = 0;
		let failed = 0;
		for (const note of notes) {
			try {
				if (await run(note)) changed++;
			} catch (e) {
				failed++;
				console.error(`Better Tabs and Notes: couldn't update ${note.path}`, e);
			}
		}
		new Notice(`Updated ${changed} of ${notes.length} notes.${failed ? ` Couldn't update ${failed}; see the developer console.` : ''}`);
	}

	// -----------------------------------------------------------------------
	// Choices
	// -----------------------------------------------------------------------

	/** Add a dropdown button to text and list properties that have choices. Typing still works as usual. */
	private patchWidgets(): void {
		const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
		if (!widgets) return;
		const decorate = (el: HTMLElement, value: unknown, context: PropertyRenderContext, list: boolean) => {
			try {
				this.addChoiceButton(el, value, context, list);
			} catch (e) {
				console.error('Better Tabs and Notes: couldn\'t add property choices', e);
			}
		};
		for (const [type, list] of [['text', false], ['multitext', true]] as const) {
			const widget = widgets[type];
			if (!widget) continue;
			this.register(around(widget, {
				render(original) {
					return function (this: PropertyWidget, el: HTMLElement, value: unknown, context: PropertyRenderContext) {
						const result = original.call(this, el, value, context);
						decorate(el, value, context, list);
						return result;
					};
				},
			}));
		}
		redrawProperties(this.app);
		// Registered after the patches, so it runs once they're removed.
		this.register(() => redrawProperties(this.app));
	}

	private addChoiceButton(el: HTMLElement, value: unknown, context: PropertyRenderContext, list: boolean): void {
		const options = choicesFor(this.settings.choices, context.key);
		if (options.length === 0) return;
		let current = value;
		const button = el.createDiv({ cls: 'btn-pt-choices clickable-icon', attr: { 'aria-label': 'Choose a value' } });
		setIcon(button, 'chevron-down');
		button.addEventListener('click', evt => {
			evt.preventDefault();
			evt.stopPropagation();
			const menu = new Menu();
			const chosen = list
				? new Set((Array.isArray(current) ? current : []).map(String))
				: new Set([typeof current === 'string' ? current : '']);
			for (const option of options) {
				menu.addItem(item => item.setTitle(option).setChecked(chosen.has(option)).onClick(() => {
					if (list) {
						const items = (Array.isArray(current) ? current : []).map(String);
						current = chosen.has(option) ? items.filter(i => i !== option) : [...items, option];
					} else {
						current = option;
						// Show it straight away; Obsidian saves it through onChange.
						const input = el.querySelector<HTMLElement>('[contenteditable], input');
						if (input instanceof HTMLInputElement) input.value = option;
						else if (input) input.textContent = option;
					}
					context.onChange(current);
					// Obsidian doesn't redraw list pills changed from outside its own input.
					if (list) window.setTimeout(() => redrawProperties(this.app), 50);
				}));
			}
			menu.showAtMouseEvent(evt);
		});
	}
}
