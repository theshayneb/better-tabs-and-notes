// Make every link in a property value a real link: shown separately in the
// Properties panel, clickable, and counted as a backlink.
// Based on Frontmatter Markdown Links by Michael Naumov (MIT); see NOTICE.md.

import { Keymap, TFile, getLinkpath, type CachedMetadata, type FrontmatterLinkCache, type HoverParent, type PropertyWidget } from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import { redrawProperties } from '../../shared/properties';
import { extraLinks, findLinkedValues, toLinkCache, type ParsedLink } from './linkParse';

const HAS_LINKS = 'btn-fml-has-links';
const EDITING = 'is-editing';

export class FrontmatterLinksFeature extends Feature {
	readonly id = 'frontmatterLinks';
	readonly name = 'Links in properties';

	/** Link cache entries this feature added, so they can be taken back out. */
	private added = new WeakSet<FrontmatterLinkCache>();
	/** Notes that currently have entries from this feature. */
	private notesWithLinks = new Set<string>();

	override onload(): void {
		this.patchTextWidget();

		this.app.workspace.onLayoutReady(() => {
			if (!this.isLoaded) return;
			for (const file of this.app.vault.getMarkdownFiles()) this.addLinks(file);
			this.registerEvent(this.app.metadataCache.on('changed', (file, _data, cache) => this.addLinks(file, cache)));
			this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
				if (this.notesWithLinks.delete(oldPath)) this.notesWithLinks.add(file.path);
			}));
			this.registerEvent(this.app.vault.on('delete', file => this.notesWithLinks.delete(file.path)));
		});
	}

	override onunload(): void {
		for (const path of this.notesWithLinks) {
			const file = this.app.vault.getFileByPath(path);
			const cache = file && this.app.metadataCache.getFileCache(file);
			if (!file || !cache?.frontmatterLinks) continue;
			cache.frontmatterLinks = cache.frontmatterLinks.filter(l => !this.added.has(l));
			if (cache.frontmatterLinks.length === 0) delete cache.frontmatterLinks;
			this.resolve(file);
		}
		this.notesWithLinks.clear();
	}

	// -----------------------------------------------------------------------
	// Backlinks
	// -----------------------------------------------------------------------

	/** Put the links of multi-link values into Obsidian's link cache, so they resolve and count as backlinks. */
	private addLinks(file: TFile, cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file)): void {
		if (!cache || file.extension !== 'md') return;
		const values = findLinkedValues(cache.frontmatter);
		const hadLinks = this.notesWithLinks.has(file.path);
		if (values.length === 0 && !hadLinks) return;

		// Obsidian's own entry for such a value is one broken link; replace it.
		const keys = new Set(values.map(v => v.key));
		const kept = (cache.frontmatterLinks ?? []).filter(l => !keys.has(l.key) && !this.added.has(l));
		const ours = values.flatMap(v => v.links
			.filter(l => !l.isExternal)
			.map(l => {
				const entry = toLinkCache(v.key, l);
				this.added.add(entry);
				return entry;
			}));
		const all = [...kept, ...ours];
		if (all.length) cache.frontmatterLinks = all;
		else delete cache.frontmatterLinks;

		if (ours.length) this.notesWithLinks.add(file.path);
		else this.notesWithLinks.delete(file.path);
		this.resolve(file);
	}

	/** Recount the note's links, and tell the backlinks pane. */
	private resolve(file: TFile): void {
		const { metadataCache } = this.app;
		if (typeof metadataCache.resolveLinks !== 'function') return;
		metadataCache.resolveLinks(file.path);
		metadataCache.trigger('resolve', file);
	}

	// -----------------------------------------------------------------------
	// Properties panel
	// -----------------------------------------------------------------------

	/** Draw text values that hold links as text with separate, clickable links. */
	private patchTextWidget(): void {
		const widget = this.app.metadataTypeManager?.registeredTypeWidgets.text;
		if (!widget) return;
		const decorate = (el: HTMLElement, sourcePath: string) => this.decorate(el, sourcePath);
		this.register(around(widget, {
			render(original) {
				return function (this: PropertyWidget, el: HTMLElement, value: unknown, context) {
					const result = original.call(this, el, value, context);
					try {
						decorate(el, context.sourcePath);
					} catch (e) {
						console.error('Better Tabs and Notes: couldn\'t draw links in a property', e);
					}
					return result;
				};
			},
		}));
		redrawProperties(this.app);
		// Registered after the patch, so it runs once the patch is removed.
		this.register(() => redrawProperties(this.app));
	}

	/** Add (or refresh) the link display next to a text property's input. */
	private decorate(el: HTMLElement, sourcePath: string): void {
		const input = el.querySelector<HTMLElement>('[contenteditable], input, textarea');
		if (!input) return;
		const text = () => input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value : input.textContent ?? '';

		let display = el.querySelector<HTMLElement>(':scope > .btn-fml-display');
		const refresh = () => {
			const value = text();
			const links = extraLinks(value);
			el.toggleClass(HAS_LINKS, links.length > 0);
			el.removeClass(EDITING);
			if (!links.length) return;
			if (!display) {
				display = el.createDiv({ cls: 'btn-fml-display' });
				display.addEventListener('click', evt => {
					if ((evt.target as HTMLElement).closest('a')) return;
					this.startEditing(el, input);
				});
			}
			this.renderLinks(display, value, links, sourcePath);
		};

		if (!input.dataset.pwFmlWatched) {
			input.dataset.pwFmlWatched = '1';
			// Typing a link into a value that had none should turn it into links too.
			input.addEventListener('blur', () => window.requestAnimationFrame(refresh));
		}
		refresh();
	}

	private startEditing(el: HTMLElement, input: HTMLElement): void {
		el.addClass(EDITING);
		input.focus();
		// Put the cursor at the end.
		if (input.isContentEditable) {
			const selection = input.win.getSelection();
			const range = input.doc.createRange();
			range.selectNodeContents(input);
			range.collapse(false);
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
	}

	private renderLinks(display: HTMLElement, value: string, links: ParsedLink[], sourcePath: string): void {
		display.empty();
		let pos = 0;
		for (const link of links) {
			if (link.start > pos) display.appendText(value.slice(pos, link.start));
			this.renderLink(display, link, sourcePath);
			pos = link.end;
		}
		if (pos < value.length) display.appendText(value.slice(pos));
	}

	private renderLink(parent: HTMLElement, link: ParsedLink, sourcePath: string): void {
		if (link.isExternal) {
			const a = parent.createEl('a', { cls: 'external-link', text: link.display, href: link.target });
			a.setAttr('target', '_blank');
			a.setAttr('rel', 'noopener');
			a.addEventListener('click', evt => {
				evt.preventDefault();
				evt.stopPropagation();
				window.open(link.target, '_blank');
			});
			return;
		}
		const resolved = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(link.target), sourcePath);
		const a = parent.createEl('a', { cls: 'internal-link', text: link.display, attr: { 'data-href': link.target, href: link.target } });
		a.toggleClass('is-unresolved', !resolved);
		a.setAttr('aria-label', link.target);
		const open = (evt: MouseEvent, newTab: boolean) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.app.workspace.openLinkText(link.target, sourcePath, newTab);
		};
		a.addEventListener('click', evt => open(evt, Keymap.isModEvent(evt) !== false));
		a.addEventListener('auxclick', evt => {
			if (evt.button === 1) open(evt, true);
		});
		const hoverParent: HoverParent = { hoverPopover: null };
		a.addEventListener('mouseover', evt => {
			this.app.workspace.trigger('hover-link', {
				event: evt, source: 'preview', hoverParent, targetEl: a, linktext: link.target, sourcePath,
			});
		});
	}
}
