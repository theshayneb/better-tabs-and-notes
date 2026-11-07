// Show and edit nested properties (objects and lists inside a property) as a
// collapsible tree in the Properties panel.
// Based on Nested Properties by Michael Naumov (MIT); see NOTICE.md.

import { Menu, setIcon, type PropertyRenderContext, type PropertyWidget } from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import type { NestedPropertySettings } from '../../settings';
import { confirm } from '../../shared/confirm';
import { redrawProperties } from '../../shared/properties';
import {
	convertValue, fieldTypeKeyFor, isComplexValue, isLossyConversion, isPlainObject, isSimpleArray, summarize, typeKeyFor,
	type PlainObject,
} from './nestedValues';

const OBJECT = 'object';
const LIST = 'list';

/** How to read and change one entry of the tree. */
interface EntryOps {
	get: () => unknown;
	set: (value: unknown) => void;
	remove: () => void;
	/** Redraw the whole tree, after a change to its shape. */
	refresh: () => void;
}

function widgetName(widget: PropertyWidget): string {
	return typeof widget.name === 'function' ? widget.name() : widget.name;
}

export class NestedPropertiesFeature extends Feature {
	readonly id = 'nestedProperties';
	readonly name = 'Nested properties';

	/** Expanded/collapsed choices made this session, by note and property path. */
	private expanded = new Map<string, boolean>();
	private objectWidget!: PropertyWidget;
	private listWidget!: PropertyWidget;

	get settings(): NestedPropertySettings {
		return this.plugin.settings.nestedProperties;
	}

	override onload(): void {
		const types = this.app.metadataTypeManager;
		if (!types) {
			console.warn('Better Tabs and Notes: this Obsidian version has no property types; nested properties are off.');
			return;
		}
		const widgets = types.registeredTypeWidgets;

		this.objectWidget = {
			type: OBJECT,
			icon: 'braces',
			name: () => 'Object',
			render: (el, value, context) => this.renderRoot(el, value, context, OBJECT),
			validate: isPlainObject,
		};
		this.listWidget = {
			type: LIST,
			icon: 'list-tree',
			name: () => 'Nested list',
			render: (el, value, context) => this.renderRoot(el, value, context, LIST),
			validate: value => Array.isArray(value),
		};
		for (const widget of [this.objectWidget, this.listWidget]) {
			// Leave it alone if another plugin (like the original Nested Properties) registered one.
			if (widgets[widget.type]) continue;
			widgets[widget.type] = widget;
			this.register(() => {
				if (widgets[widget.type] === widget) delete widgets[widget.type];
			});
		}

		const pickWidget = (value: unknown): PropertyWidget | undefined => {
			if (isSimpleArray(value)) return widgets.multitext;
			if (Array.isArray(value)) return widgets[LIST];
			if (isComplexValue(value)) return widgets[OBJECT];
			return undefined;
		};

		// Obsidian calls nested values "unknown"; give them the tree instead.
		this.register(around(types, {
			getTypeInfo(original) {
				return function (this: unknown, key: string, value: unknown) {
					const info = original.call(this, key, value);
					if (info?.inferred?.type === 'unknown') {
						const widget = pickWidget(value);
						if (widget) {
							info.inferred = widget;
							info.expected = widget;
						}
					}
					return info;
				};
			},
		}));

		const unknown = widgets.unknown ?? types.getWidget('unknown');
		this.register(around(unknown, {
			render(original) {
				return function (this: PropertyWidget, el: HTMLElement, value: unknown, context: PropertyRenderContext) {
					const widget = pickWidget(value);
					return widget ? widget.render(el, value, context) : original.call(this, el, value, context);
				};
			},
		}));

		// Lists of numbers or yes/no values are still plain lists.
		if (widgets.multitext) {
			this.register(around(widgets.multitext, {
				validate(original) {
					return function (this: PropertyWidget, value: unknown) {
						return original.call(this, value) || isSimpleArray(value);
					};
				},
			}));
		}

		redrawProperties(this.app);
		// Registered last, so it runs after the patches above are removed.
		this.register(() => redrawProperties(this.app));
	}

	override onSettingsChange(): void {
		this.expanded.clear();
		redrawProperties(this.app);
	}

	// -----------------------------------------------------------------------
	// Drawing
	// -----------------------------------------------------------------------

	private isExpanded(id: string, depth: number): boolean {
		return this.expanded.get(id) ?? depth < this.settings.expandLevel;
	}

	/**
	 * A collapsible node inside a value: a triangle with a one-line summary, and
	 * the entries below. Everything lives inside the value element, which
	 * Obsidian clears when it redraws the value.
	 */
	private renderNode(valueEl: HTMLElement, id: string, depth: number, value: PlainObject | unknown[]): HTMLElement {
		const node = valueEl.createDiv({ cls: 'btn-np-node' });
		node.toggleClass('is-collapsed', !this.isExpanded(id, depth));
		const toggle = (open: boolean) => {
			node.toggleClass('is-collapsed', !open);
			this.expanded.set(id, open);
		};
		const head = node.createDiv({ cls: 'btn-np-head' });
		const button = head.createDiv({ cls: 'btn-np-collapse clickable-icon' });
		setIcon(button, 'right-triangle');
		button.addEventListener('click', evt => {
			evt.preventDefault();
			evt.stopPropagation();
			toggle(node.hasClass('is-collapsed'));
		});
		const summary = head.createSpan({ cls: 'btn-np-summary', text: summarize(value) });
		summary.addEventListener('click', evt => {
			evt.preventDefault();
			evt.stopPropagation();
			toggle(true);
		});
		return node.createDiv({ cls: 'btn-np-container' });
	}

	/** A top-level property that is an object or a nested list. */
	private renderRoot(el: HTMLElement, raw: unknown, context: PropertyRenderContext, kind: string): unknown {
		let value: unknown = raw;
		if (kind === LIST && !Array.isArray(value)) value = convertValue(LIST, value);
		if (kind === OBJECT && !isPlainObject(value)) value = {};
		// Our own copy: edits change it in place, so later edits build on earlier ones.
		const model = structuredClone(value) as PlainObject | unknown[];
		const id = `${context.sourcePath}:${context.key}`;

		const icon = el.closest('.metadata-property')?.querySelector<HTMLElement>(':scope > .metadata-property-key .metadata-property-icon');
		if (icon) setIcon(icon, kind === LIST ? 'list-tree' : 'braces');

		const container = this.renderNode(el, id, 0, model);
		// Don't rely on Obsidian to redraw after an entry is added or removed.
		const refresh = () => window.requestAnimationFrame(() => {
			if (!el.isConnected) return;
			el.empty();
			this.renderRoot(el, model, context, kind);
		});
		this.renderChildren(container, model, [context.key], context, v => context.onChange(v), refresh);
		return { type: kind, focus: () => container.focus() };
	}

	/** The entries of an object or list. Changes edit `value` in place, then pass a copy up. */
	private renderChildren(
		container: HTMLElement, value: PlainObject | unknown[], path: string[], context: PropertyRenderContext,
		onChange: (value: unknown) => void, refresh: () => void,
	): void {
		if (Array.isArray(value)) {
			value.forEach((item, i) => this.renderEntry(container, String(i), item, [...path, String(i)], context, {
				get: () => value[i],
				set: v => { value[i] = v; onChange([...value]); },
				remove: () => { value.splice(i, 1); onChange([...value]); refresh(); },
				refresh,
			}));
			this.renderAddButton(container, 'Add item', () => {
				value.push('');
				onChange([...value]);
				refresh();
			});
		} else {
			for (const key of Object.keys(value)) {
				this.renderEntry(container, key, value[key], [...path, key], context, {
					get: () => value[key],
					set: v => { value[key] = v; onChange({ ...value }); },
					remove: () => { delete value[key]; onChange({ ...value }); refresh(); },
					refresh,
				});
			}
			this.renderAddButton(container, 'Add property', () => this.askForKey(container, key => {
				if (key in value) return;
				value[key] = '';
				onChange({ ...value });
				refresh();
			}));
		}
	}

	private renderEntry(container: HTMLElement, label: string, value: unknown, path: string[], context: PropertyRenderContext, ops: EntryOps): void {
		const widget = this.widgetFor(path, label, value);
		const nests = widget.type === OBJECT || widget.type === LIST || (isComplexValue(value) && !isSimpleArray(value));

		const propertyEl = container.createDiv({ cls: 'metadata-property btn-np-entry' });
		propertyEl.addEventListener('contextmenu', evt => {
			evt.preventDefault();
			evt.stopPropagation();
			this.showMenu(evt, label, path, ops);
		});
		const keyEl = propertyEl.createDiv({ cls: 'metadata-property-key' });
		const icon = keyEl.createSpan({ cls: 'metadata-property-icon' });
		setIcon(icon, !nests ? widget.icon : widget.type === LIST || Array.isArray(value) ? 'list-tree' : 'braces');
		icon.addEventListener('click', evt => {
			evt.stopPropagation();
			this.showMenu(evt, label, path, ops);
		});
		keyEl.createEl('input', {
			cls: 'metadata-property-key-input',
			attr: { readonly: '', tabindex: '-1', value: label, 'aria-label': path.slice(1).join('.') },
		});

		const valueEl = propertyEl.createDiv({ cls: 'metadata-property-value' });
		valueEl.setAttr('data-property-type', widget.type);
		if (nests) {
			let inner: PlainObject | unknown[];
			if (widget.type === LIST || Array.isArray(value)) inner = Array.isArray(value) ? value : [];
			else inner = isPlainObject(value) ? value : {};
			const nested = this.renderNode(valueEl, `${context.sourcePath}:${path.join('.')}`, path.length - 1, inner);
			this.renderChildren(nested, inner, path, context, ops.set, ops.refresh);
			return;
		}
		widget.render(valueEl, value, {
			app: context.app,
			key: label,
			sourcePath: context.sourcePath,
			onChange: ops.set,
			blur: () => context.blur(),
		});
	}

	private renderAddButton(container: HTMLElement, text: string, onClick: () => void): void {
		const button = container.createDiv({ cls: 'btn-np-add' });
		setIcon(button.createSpan({ cls: 'btn-np-add-icon' }), 'plus');
		button.createSpan({ text });
		button.addEventListener('click', evt => {
			evt.preventDefault();
			evt.stopPropagation();
			onClick();
		});
	}

	/** Swap the "Add property" button for a name box. */
	private askForKey(container: HTMLElement, add: (key: string) => void): void {
		const button = container.querySelector<HTMLElement>(':scope > .btn-np-add');
		if (!button) return;
		button.hide();
		const input = container.createEl('input', { cls: 'btn-np-add-input', attr: { type: 'text', placeholder: 'Property name' } });
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			const key = input.value.trim();
			input.remove();
			button.show();
			if (save && key) add(key);
		};
		input.addEventListener('keydown', evt => {
			evt.stopPropagation();
			if (evt.key === 'Enter') { evt.preventDefault(); finish(true); }
			if (evt.key === 'Escape') { evt.preventDefault(); finish(false); }
		});
		input.addEventListener('blur', () => finish(true));
		input.focus();
	}

	// -----------------------------------------------------------------------
	// Types and the menu
	// -----------------------------------------------------------------------

	private registeredWidget(type: string | null | undefined): PropertyWidget | undefined {
		return type ? this.app.metadataTypeManager?.registeredTypeWidgets[type] : undefined;
	}

	/** The type chosen for this entry (for it alone, or for that field of every list item), else one guessed from the value. */
	private widgetFor(path: string[], label: string, value: unknown): PropertyWidget {
		const types = this.app.metadataTypeManager!;
		const field = fieldTypeKeyFor(path);
		const assigned = this.registeredWidget(types.getAssignedWidget(typeKeyFor(path)))
			?? (field ? this.registeredWidget(types.getAssignedWidget(field)) : undefined);
		return assigned ?? types.getTypeInfo(label, value).inferred;
	}

	private showMenu(evt: MouseEvent, label: string, path: string[], ops: EntryOps): void {
		const types = this.app.metadataTypeManager!;
		const value = ops.get();
		const menu = new Menu();
		const itemKey = typeKeyFor(path);
		const fieldKey = fieldTypeKeyFor(path);
		const current = this.widgetFor(path, label, value).type;

		if (fieldKey && fieldKey !== itemKey) {
			const fieldType = types.getAssignedWidget(fieldKey) ?? types.getTypeInfo(label, value).inferred.type;
			this.addTypeItems(menu, 'Property type (all items)', fieldType, fieldKey, label, value, ops);
			this.addTypeItems(menu, 'Property type (this item only)', current, itemKey, label, value, ops);
		} else {
			this.addTypeItems(menu, 'Property type', current, itemKey, label, value, ops);
		}

		const copy = async () => navigator.clipboard.writeText(JSON.stringify({ [label]: value }));
		menu.addItem(item => item.setSection('action').setIcon('scissors').setTitle('Cut')
			.onClick(async () => { await copy(); ops.remove(); }));
		menu.addItem(item => item.setSection('action').setIcon('copy').setTitle('Copy')
			.onClick(() => void copy()));
		menu.addItem(item => item.setSection('action').setIcon('clipboard-paste').setTitle('Paste')
			.onClick(async () => {
				try {
					const parsed: unknown = JSON.parse(await navigator.clipboard.readText());
					const pasted = isPlainObject(parsed) ? Object.values(parsed)[0] : undefined;
					if (pasted !== undefined) {
						ops.set(pasted);
						ops.refresh();
					}
				} catch {
					// Not something copied from here; ignore it.
				}
			}));
		menu.addItem(item => item.setSection('danger').setIcon('trash-2').setTitle('Remove').setWarning(true)
			.onClick(() => ops.remove()));
		menu.showAtMouseEvent(evt);
	}

	private addTypeItems(menu: Menu, title: string, current: string, typeKey: string, label: string, value: unknown, ops: EntryOps): void {
		const widgets = Object.values(this.app.metadataTypeManager!.registeredTypeWidgets)
			.filter((w): w is PropertyWidget => !!w && w.type !== 'unknown');
		menu.addItem(item => {
			item.setSection('type').setIcon('info').setTitle(title);
			const submenu = item.setSubmenu?.();
			if (!submenu) return;
			for (const widget of widgets) {
				submenu.addItem(sub => sub.setIcon(widget.icon).setTitle(widgetName(widget)).setChecked(widget.type === current)
					.onClick(() => void this.changeType(widget, typeKey, label, value, ops)));
			}
		});
	}

	private async changeType(widget: PropertyWidget, typeKey: string, label: string, value: unknown, ops: EntryOps): Promise<void> {
		const types = this.app.metadataTypeManager!;
		if (isLossyConversion(widget.type, value)
			&& !await confirm(this.app, `The value doesn't fit the type "${widgetName(widget)}", so it will be adapted to fit.`, 'Change')) {
			return;
		}
		(activeDocument.activeElement as HTMLElement | null)?.blur();
		// Store the type only when it differs from what Obsidian would guess anyway.
		if (types.getTypeInfo(label, value).inferred.type === widget.type) await types.unsetType(typeKey);
		else await types.setType(typeKey, widget.type);

		const converted = convertValue(widget.type, value);
		if (JSON.stringify(converted) !== JSON.stringify(value)) ops.set(converted);
		ops.refresh();
	}
}
