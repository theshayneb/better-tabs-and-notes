// Show an icon before links to files that aren't notes (PDFs, images, ...),
// chosen by the file type, in reading view and Live Preview.

import { MarkdownView, editorLivePreviewField } from 'obsidian';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { Feature } from '../../feature';
import { renderIcon } from '../pinnedIcons/pinnedIcons';
import { cleanRules, findWikilinks, iconForLink, type LinkIconRule } from './linkIconRules';

const ICON_CLASS = 'btn-link-icon';

function iconEl(icon: string): HTMLElement {
	const el = createSpan({ cls: ICON_CLASS, attr: { 'aria-hidden': 'true' } });
	renderIcon(el, icon);
	return el;
}

class LinkIconWidget extends WidgetType {
	constructor(readonly icon: string) {
		super();
	}

	override eq(other: LinkIconWidget): boolean {
		return other.icon === this.icon;
	}

	toDOM(): HTMLElement {
		return iconEl(this.icon);
	}
}

export class LinkIconsFeature extends Feature {
	readonly id = 'linkIcons';
	readonly name = 'Link icons';

	/** Goes up whenever the icons should be redrawn, so the editors notice. */
	version = 0;

	get rules(): LinkIconRule[] {
		return cleanRules(this.plugin.settings.linkIcons.rules);
	}

	/** Reading view and editor hooks can only be registered by the plugin; they do nothing while the feature is off. */
	registerPluginParts(): void {
		this.plugin.registerMarkdownPostProcessor(el => {
			if (this.isLoaded) this.decorateLinks(el);
		});
		this.plugin.registerEditorExtension(this.editorExtension());
	}

	override onload(): void {
		this.redraw();
	}

	override onunload(): void {
		this.redraw();
		for (const el of activeDocument.querySelectorAll(`.${ICON_CLASS}`)) el.remove();
	}

	override onSettingsChange(): void {
		this.redraw();
	}

	/** Redraw the icons in open notes, in both reading view and the editor. */
	private redraw(): void {
		this.version++;
		this.app.workspace.updateOptions();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
		}
	}

	/** Reading view: put an icon at the start of each link to a file type that has one. */
	private decorateLinks(el: HTMLElement): void {
		const rules = this.rules;
		for (const link of el.querySelectorAll<HTMLElement>('a.internal-link')) {
			if (link.querySelector(`:scope > .${ICON_CLASS}`)) continue;
			const target = link.dataset.href ?? link.getAttribute('href') ?? '';
			const icon = iconForLink(target, rules);
			if (icon) link.prepend(iconEl(icon));
		}
	}

	/** Live Preview: an icon widget before each such wikilink. Not shown in source mode, where the text is edited as is. */
	private editorExtension(): Extension {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the view plugin class needs the feature
		const feature = this;
		const build = (view: EditorView): DecorationSet => {
			if (!feature.isLoaded || !view.state.field(editorLivePreviewField, false)) return Decoration.none;
			const rules = feature.rules;
			const tree = syntaxTree(view.state);
			const builder = new RangeSetBuilder<Decoration>();
			for (const { from, to } of view.visibleRanges) {
				for (const link of findWikilinks(view.state.sliceDoc(from, to))) {
					const icon = iconForLink(link.target, rules);
					if (!icon) continue;
					const pos = from + link.from;
					// Only real links: not ones inside code or math.
					if (!/internal-link|formatting-link/.test(tree.resolveInner(pos + 2, 1).name)) continue;
					builder.add(pos, pos, Decoration.widget({ widget: new LinkIconWidget(icon), side: -1 }));
				}
			}
			return builder.finish();
		};
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;
			private version = feature.version;

			constructor(view: EditorView) {
				this.decorations = build(view);
			}

			update(update: ViewUpdate): void {
				const modeChanged = update.state.field(editorLivePreviewField, false) !== update.startState.field(editorLivePreviewField, false);
				if (update.docChanged || update.viewportChanged || modeChanged || this.version !== feature.version
					|| syntaxTree(update.state) !== syntaxTree(update.startState)) {
					this.version = feature.version;
					this.decorations = build(update.view);
				}
			}
		}, { decorations: plugin => plugin.decorations });
	}
}
