// Floating buttons to scroll a note to the top, the bottom, or the cursor.
// Based on Scroll to Top by cloudhao1999 (MIT); see NOTICE.md.

import { ButtonComponent, ItemView, MarkdownView, type Command, type WorkspaceLeaf } from 'obsidian';
import { Feature } from '../../feature';
import type { ScrollButtonSettings } from '../../settings';

const CONTAINER_CLASS = 'btn-scroll-buttons';
const HOST_CLASS = 'btn-has-scroll-buttons';
/** View type of web pages opened with the Surfing plugin. */
const SURFING_VIEW_TYPE = 'surfing-view';

type Target = 'top' | 'bottom' | 'cursor';

const LABELS: Record<Target, string> = {
	top: 'Scroll to top',
	bottom: 'Scroll to bottom',
	cursor: 'Scroll to cursor',
};

/** Surfing's <webview> element, which can run script in the page. */
interface WebviewElement extends HTMLElement {
	executeJavaScript(code: string): Promise<unknown>;
}

export class ScrollButtonsFeature extends Feature {
	readonly id = 'scrollButtons';
	readonly name = 'Scroll buttons';

	/** The button group in each view, so it's built once per view. */
	private groups = new WeakMap<ItemView, HTMLElement>();

	get settings(): ScrollButtonSettings {
		return this.plugin.settings.scrollButtons;
	}

	override onload(): void {
		this.app.workspace.onLayoutReady(() => this.refreshAll());
		this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshAll()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshAll()));
	}

	override onunload(): void {
		this.app.workspace.iterateAllLeaves(leaf => this.removeFrom(leaf));
	}

	override onSettingsChange(): void {
		this.app.workspace.iterateAllLeaves(leaf => this.removeFrom(leaf));
		this.refreshAll();
	}

	override commands(): Command[] {
		const command = (target: Target): Command => ({
			id: `scroll-to-${target}`,
			name: LABELS[target],
			icon: this.iconFor(target),
			checkCallback: (checking: boolean) => {
				const leaf = this.app.workspace.getMostRecentLeaf();
				if (!leaf || !this.supports(leaf, target)) return false;
				if (!checking) void this.scroll(leaf, target);
				return true;
			},
		});
		return [command('top'), command('bottom'), command('cursor')];
	}

	private iconFor(target: Target): string {
		const s = this.settings;
		return target === 'top' ? s.iconTop : target === 'bottom' ? s.iconBottom : s.iconCursor;
	}

	private isWebPage(leaf: WorkspaceLeaf): boolean {
		return this.settings.includeWebPages && leaf.view.getViewType() === SURFING_VIEW_TYPE;
	}

	/** Whether a scroll target makes sense in this leaf right now. */
	private supports(leaf: WorkspaceLeaf, target: Target): boolean {
		if (leaf.view instanceof MarkdownView) return target !== 'cursor' || leaf.view.getMode() === 'source';
		return this.isWebPage(leaf) && target !== 'cursor';
	}

	private refreshAll(): void {
		this.app.workspace.iterateAllLeaves(leaf => this.refresh(leaf));
	}

	private refresh(leaf: WorkspaceLeaf): void {
		const view = leaf.view;
		if (!(view instanceof ItemView) || !(view instanceof MarkdownView || this.isWebPage(leaf))) return;

		let group = this.groups.get(view);
		if (!group || !group.isConnected) {
			group = this.build(leaf);
			this.groups.set(view, group);
		}
		// The cursor button only makes sense while editing.
		group.querySelector<HTMLElement>('[data-target="cursor"]')?.toggle(this.supports(leaf, 'cursor'));
	}

	private build(leaf: WorkspaceLeaf): HTMLElement {
		const host = leaf.view.containerEl;
		host.addClass(HOST_CLASS);
		const group = host.createDiv({ cls: CONTAINER_CLASS });
		group.setCssProps({ '--btn-scroll-size': String(this.settings.size) });

		const s = this.settings;
		const targets: Target[] = [];
		if (s.showCursor) targets.push('cursor');
		if (s.showTop) targets.push('top');
		if (s.showBottom) targets.push('bottom');
		for (const target of targets) {
			const button = new ButtonComponent(group)
				.setIcon(this.iconFor(target))
				.setClass('btn-scroll-button')
				.onClick(() => void this.scroll(leaf, target));
			if (s.showTooltips) button.setTooltip(LABELS[target], { placement: 'left' });
			button.buttonEl.dataset.target = target;
		}
		return group;
	}

	private removeFrom(leaf: WorkspaceLeaf): void {
		const view = leaf.view;
		if (view instanceof ItemView) this.groups.delete(view);
		view.containerEl.querySelectorAll(`:scope > .${CONTAINER_CLASS}`).forEach(el => el.remove());
		view.containerEl.removeClass(HOST_CLASS);
	}

	async scroll(leaf: WorkspaceLeaf, target: Target): Promise<void> {
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			if (target === 'cursor') this.scrollToCursor(view);
			else if (target === 'top') this.scrollToTop(view);
			else await this.scrollToBottom(view);
			return;
		}
		if (this.isWebPage(leaf) && target !== 'cursor') {
			const webview = view.containerEl.querySelector<WebviewElement>('webview');
			await webview?.executeJavaScript(target === 'top' ? 'window.scrollTo(0, 0)' : 'window.scrollTo(0, document.body.scrollHeight)');
		}
	}

	private scrollToTop(view: MarkdownView): void {
		if (view.getMode() === 'preview') {
			view.previewMode.applyScroll(0);
			return;
		}
		view.editor.scrollTo(0, 0);
		view.editor.setCursor(0, 0);
		this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
	}

	private async scrollToBottom(view: MarkdownView): Promise<void> {
		if (view.getMode() === 'source') {
			const editor = view.editor;
			const last = editor.lastLine();
			editor.scrollIntoView({ from: { line: last, ch: 0 }, to: { line: last, ch: 0 } });
			return;
		}
		const file = view.file;
		if (!file) return;
		// Reading view scrolls by line; skip trailing empty lines so it lands on the last text.
		const lines = (await this.app.vault.cachedRead(file)).split('\n');
		let count = lines.length;
		while (count > 0 && lines[count - 1].trim() === '') count--;
		view.previewMode.applyScroll(Math.max(0, count - 1));
	}

	private scrollToCursor(view: MarkdownView): void {
		if (view.getMode() !== 'source') return;
		const editor = view.editor;
		const anchor = editor.getCursor('anchor');
		const head = editor.getCursor('head');
		editor.scrollIntoView({ from: anchor, to: head }, true);
		this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		editor.setSelection(anchor, head);
	}
}
