// Property templates: rules (by folder, tag, name...) that list properties in
// order. Buttons under a note's properties insert the missing ones and put
// them in order; properties can offer a list of values to pick from.
// Inspired by Fileclass by mdelobelle (MIT); see NOTICE.md.

import { MarkdownView, Menu, Notice, TFile, TFolder, setIcon, type Command, type TAbstractFile } from 'obsidian';
import { Feature } from '../../feature';
import type { PropertyTemplateSettings } from '../../settings';
import { confirm } from '../../shared/confirm';
import {
	choicesFor, hiddenNames, insertMissing, isSorted, missingProperties, sortProperties, templateFor, templateValue,
	type TemplateProperty,
} from './templateLogic';

const ACTIONS_CLASS = 'btn-pt-actions';
const CHOICES_CLASS = 'btn-pt-choices';
const HIDDEN_CLASS = 'btn-pt-hidden';

export class PropertyTemplatesFeature extends Feature {
	readonly id = 'propertyTemplates';
	readonly name = 'Property templates';

	private refreshTimer: number | null = null;
	/** Notes (by path) whose hidden properties are shown for now. */
	private revealed = new Set<string>();

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
		// Obsidian redraws property values without telling anyone: re-add the dropdown buttons then.
		this.observePanels();
		this.app.workspace.onLayoutReady(later);
	}

	override onunload(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.observer?.disconnect();
		this.observer = null;
		for (const el of activeDocument.querySelectorAll(`.${ACTIONS_CLASS}, .${CHOICES_CLASS}`)) el.remove();
		for (const el of activeDocument.querySelectorAll(`.${HIDDEN_CLASS}`)) el.removeClass(HIDDEN_CLASS);
	}

	override onSettingsChange(): void {
		// Only touches the buttons in the notes, so it's safe while typing in the settings.
		this.scheduleRefresh();
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

	private observer: MutationObserver | null = null;

	private observePanels(): void {
		const ours = (node: Node) => node instanceof HTMLElement && (node.hasClass(ACTIONS_CLASS) || node.hasClass(CHOICES_CLASS) || node.closest(`.${ACTIONS_CLASS}`) !== null);
		this.observer = new MutationObserver(mutations => {
			for (const m of mutations) {
				const target = m.target instanceof HTMLElement ? m.target : m.target.parentElement;
				if (!target?.closest('.metadata-container') || ours(m.target)) continue;
				const changed = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
				if (changed.length && changed.every(ours)) continue;
				this.scheduleRefresh();
				return;
			}
		});
		this.observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
	}

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
				if (view.file) this.renderChoiceButtons(container, view.file);
			}
		}
	}

	private renderButtons(container: HTMLElement, file: TFile | null): void {
		// The buttons sit next to "Add property", deeper inside the container: look anywhere in it,
		// and keep only one set (earlier versions could add several).
		const existing = Array.from(container.querySelectorAll<HTMLElement>(`.${ACTIONS_CLASS}`));
		for (const extra of existing.slice(1)) extra.remove();
		let actions: HTMLElement | null = existing[0] ?? null;
		const fullTemplate = file ? this.templateOf(file) : [];
		const template = this.settings.showButtons ? fullTemplate : [];
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
		const missing = template.length ? missingProperties(fm, template).length : 0;
		const unsorted = template.length > 0 && !isSorted(fm, template);
		const hiddenCount = this.applyHidden(container, file, fullTemplate);
		if (!file || (!missing && !unsorted && !hiddenCount)) {
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
		if (hiddenCount) {
			const shown = this.revealed.has(file.path);
			const plural = hiddenCount === 1 ? 'y' : 'ies';
			this.renderButton(actions, shown ? 'eye-off' : 'eye',
				shown ? `Hide ${hiddenCount} propert${plural} again` : `Show ${hiddenCount} hidden propert${plural}`,
				() => {
					if (shown) this.revealed.delete(file.path);
					else this.revealed.add(file.path);
					return Promise.resolve();
				});
		}
	}

	/**
	 * Hide the rows of properties the note's rules hide (unless they're shown
	 * for now). Returns how many of the note's properties are hidden ones.
	 */
	private applyHidden(container: HTMLElement, file: TFile | null, template: TemplateProperty[]): number {
		const hidden = hiddenNames(template);
		const reveal = file !== null && this.revealed.has(file.path);
		let count = 0;
		for (const row of container.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]')) {
			const isHidden = hidden.has((row.dataset.propertyKey ?? '').toLowerCase());
			if (isHidden) count++;
			row.toggleClass(HIDDEN_CLASS, isHidden && !reveal);
		}
		return count;
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

	/**
	 * Add a dropdown button to each property in the panel that has values to
	 * pick from. Works on the panel's rows rather than Obsidian's property
	 * widgets, so it keeps working whatever draws the values. Typing still works.
	 */
	private renderChoiceButtons(container: HTMLElement, file: TFile): void {
		for (const row of container.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]')) {
			const valueEl = row.querySelector<HTMLElement>(':scope > .metadata-property-value');
			if (!valueEl) continue;
			const name = row.querySelector<HTMLInputElement>('.metadata-property-key-input')?.value || row.dataset.propertyKey || '';
			const options = name ? choicesFor(this.settings.choices, name) : [];
			let button = valueEl.querySelector<HTMLElement>(`:scope > .${CHOICES_CLASS}`);
			if (options.length === 0) {
				button?.remove();
				continue;
			}
			if (button) continue;
			button = valueEl.createDiv({ cls: `${CHOICES_CLASS} clickable-icon`, attr: { 'aria-label': 'Choose a value' } });
			// At the start of the value, right next to the property name, rather than far off on the right.
			valueEl.prepend(button);
			setIcon(button, 'chevron-down');
			button.addEventListener('mousedown', evt => evt.preventDefault());
			button.addEventListener('click', evt => {
				evt.preventDefault();
				evt.stopPropagation();
				this.showChoices(evt, file, name);
			});
		}
	}

	private showChoices(evt: MouseEvent, file: TFile, name: string): void {
		const options = choicesFor(this.settings.choices, name);
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const key = Object.keys(fm).find(k => k.toLowerCase() === name.toLowerCase()) ?? name;
		const current: unknown = fm[key];
		const list = Array.isArray(current) || this.propertyType(key) === 'multitext';
		const items = (Array.isArray(current) ? current : current == null || current === '' ? [] : [current]).map(String);
		const chosen = new Set(list ? items : [typeof current === 'string' ? current : '']);
		const menu = new Menu();
		for (const option of options) {
			menu.addItem(item => item.setTitle(option).setChecked(chosen.has(option)).onClick(() => {
				const next = list ? (chosen.has(option) ? items.filter(i => i !== option) : [...items, option]) : option;
				void this.app.fileManager.processFrontMatter(file, (data: Record<string, unknown>) => {
					const actual = Object.keys(data).find(k => k.toLowerCase() === name.toLowerCase()) ?? key;
					data[actual] = next;
				}).then(() => this.scheduleRefresh());
			}));
		}
		menu.showAtMouseEvent(evt);
	}
}
