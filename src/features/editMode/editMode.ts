// Switching between live preview, source and reading mode from the note header.
// Based on the idea of Edit Mode Switch by Mara-Li (GPL-3.0); see NOTICE.md.

import { MarkdownView, Notice, setIcon, setTooltip, type Command } from 'obsidian';
import { Feature } from '../../feature';
import type { EditMode, EditModeSettings } from '../../settings';
import { modeCycle, nextMode } from './modes';

const MODE_INFO: Record<EditMode, { icon: string; label: string }> = {
	live: { icon: 'pencil-ruler', label: 'Live preview' },
	source: { icon: 'code', label: 'Source mode' },
	preview: { icon: 'book-open', label: 'Reading view' },
};

/** Our own header buttons ("Add a separate button"). */
const BUTTON_CLASS = 'btn-edit-mode-button';
/** Marks Obsidian's reading/editing button while we've taken it over. */
const TAKEN_OVER_CLASS = 'btn-edit-mode-taken-over';
const CYCLE_COMMAND = 'cycle-edit-mode';
/** Class Commander gives the note header buttons it adds; each also has the command id as a class. */
const COMMANDER_BUTTON_CLASS = 'cmdr-page-header';
/** Commander adds its header buttons a moment after the layout changes. */
const COMMANDER_DELAY_MS = 250;

/** Obsidian's own translation function (undocumented global). */
interface I18next {
	t(key: string): string;
}

/** A button another plugin added; never mistake one of these for Obsidian's. */
function isPluginButton(el: HTMLElement): boolean {
	return el.hasClass(BUTTON_CLASS) || el.hasClass('cmdr') || el.hasClass(COMMANDER_BUTTON_CLASS);
}

/**
 * Obsidian's own reading/editing button in a note's header. Uses the
 * undocumented `modeButtonEl` when present, otherwise finds it by its label
 * (in Obsidian's current language) like the original Edit mode switch did.
 */
function findDefaultModeButton(view: MarkdownView): HTMLElement | null {
	const actions = Array.from(view.containerEl.querySelectorAll<HTMLElement>('.view-header .view-action'));
	const taken = actions.find(el => el.hasClass(TAKEN_OVER_CLASS));
	if (taken) return taken;

	const internal = (view as MarkdownView & { modeButtonEl?: unknown }).modeButtonEl;
	if (internal instanceof HTMLElement && actions.includes(internal)) return internal;

	const i18n = (window as unknown as { i18next?: I18next }).i18next;
	const labels = i18n
		? ['interface.menu.read-view', 'interface.menu.edit-view']
			.map(key => i18n.t(key))
			// A missing key comes back as the key itself.
			.filter(label => label && !label.startsWith('interface.'))
		: [];
	if (labels.length === 0) return null;
	return actions.find(el => !isPluginButton(el) && labels.some(label => el.getAttribute('aria-label')?.includes(label))) ?? null;
}

export function getMode(view: MarkdownView): EditMode {
	const state = view.getState() as { mode?: string; source?: boolean };
	if (state.mode === 'preview') return 'preview';
	return state.source ? 'source' : 'live';
}

interface TakenOver {
	view: MarkdownView;
	originalNodes: Node[];
	originalLabel: string | null;
	release: () => void;
}

export class EditModeFeature extends Feature {
	readonly id = 'editMode';
	readonly name = 'Edit mode switch';

	private buttons = new WeakMap<MarkdownView, HTMLElement[]>();
	private takenOver = new Map<HTMLElement, TakenOver>();
	/** Commander's original icon for buttons whose icon we've replaced. */
	private commanderIcons = new Map<HTMLElement, Node[]>();
	private delayedRefresh: number | null = null;

	get settings(): EditModeSettings {
		return this.plugin.settings.editMode;
	}

	/** The settings the cycle uses: taking over Obsidian's button always includes reading view. */
	private get cycleSettings(): EditModeSettings {
		const s = this.settings;
		return s.buttonPlace === 'replace' ? { ...s, includeReadingMode: true } : s;
	}

	override onload(): void {
		this.app.workspace.onLayoutReady(() => this.refreshAll());
		this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshAll()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshAll()));
		this.register(() => {
			if (this.delayedRefresh !== null) window.clearTimeout(this.delayedRefresh);
		});
	}

	override onunload(): void {
		this.forEachMarkdownView(view => this.removeButtons(view));
		this.releaseAll();
		this.restoreCommanderIcons();
	}

	override onSettingsChange(): void {
		this.forEachMarkdownView(view => this.removeButtons(view));
		this.releaseAll();
		this.refreshAll();
	}

	override commands(): Command[] {
		const command = (id: string, name: string, icon: string, target: (view: MarkdownView) => EditMode): Command => ({
			id,
			name,
			icon,
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;
				if (!checking) void this.setMode(view, target(view));
				return true;
			},
		});
		return [
			command(CYCLE_COMMAND, 'Switch to next editing mode', 'pencil-ruler', view => this.next(view)),
			command('switch-to-live-preview', 'Switch to live preview', MODE_INFO.live.icon, () => 'live'),
			command('switch-to-source-mode', 'Switch to source mode', MODE_INFO.source.icon, () => 'source'),
			command('switch-to-reading-view', 'Switch to reading view', MODE_INFO.preview.icon, () => 'preview'),
			{
				id: 'copy-note-header-buttons',
				name: 'Copy the note header buttons (for troubleshooting)',
				icon: 'clipboard-copy',
				checkCallback: (checking: boolean) => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view) return false;
					if (!checking) void this.copyHeaderReport(view);
					return true;
				},
			},
		];
	}

	/** The mode a click switches to. From a mode outside the cycle, go to the cycle's first mode. */
	private next(view: MarkdownView): EditMode {
		const current = getMode(view);
		const cycle = modeCycle(this.cycleSettings);
		return cycle.includes(current) ? nextMode(current, this.cycleSettings) : cycle[0];
	}

	private forEachMarkdownView(fn: (view: MarkdownView) => void): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) fn(leaf.view);
		});
	}

	private refreshAll(): void {
		this.forEachMarkdownView(view => this.refresh(view));
		// Catch Commander buttons (and late header redraws) after this layout change.
		if (this.delayedRefresh !== null) window.clearTimeout(this.delayedRefresh);
		this.delayedRefresh = window.setTimeout(() => {
			this.delayedRefresh = null;
			this.forEachMarkdownView(view => this.refresh(view));
		}, COMMANDER_DELAY_MS);
	}

	private refresh(view: MarkdownView): void {
		const mode = getMode(view);
		this.updateCommanderButtons(view, mode);
		switch (this.settings.buttonPlace) {
			case 'replace':
				this.removeButtons(view);
				this.takeOver(view);
				break;
			case 'extra':
				this.release(view);
				this.refreshOwnButtons(view, mode);
				break;
			case 'none':
				this.removeButtons(view);
				this.release(view);
				break;
		}
	}

	private iconFor(view: MarkdownView): { icon: string; tooltip: string } {
		const mode = getMode(view);
		const next = this.next(view);
		const shown = this.settings.showNextModeIcon ? next : mode;
		return {
			icon: MODE_INFO[shown].icon,
			tooltip: this.settings.showNextModeIcon
				? `Switch to ${MODE_INFO[next].label.toLowerCase()}`
				: `${MODE_INFO[mode].label} (click for ${MODE_INFO[next].label.toLowerCase()})`,
		};
	}

	// -----------------------------------------------------------------------
	// Taking over Obsidian's reading/editing button
	// -----------------------------------------------------------------------

	private takeOver(view: MarkdownView): void {
		const el = findDefaultModeButton(view);
		if (!el) return;
		if (!this.takenOver.has(el)) {
			// Run before Obsidian's own click handler and stop it.
			const onClick = (evt: MouseEvent) => {
				evt.preventDefault();
				evt.stopImmediatePropagation();
				void this.setMode(view, this.next(view));
			};
			el.addEventListener('click', onClick, { capture: true });
			// Obsidian redraws its button when the mode changes; put our icon back.
			const observer = new MutationObserver(() => this.styleTakenOver(el, view));
			observer.observe(el, { childList: true, attributes: true, attributeFilter: ['aria-label'] });
			this.takenOver.set(el, {
				view,
				originalNodes: Array.from(el.childNodes).map(n => n.cloneNode(true)),
				originalLabel: el.getAttribute('aria-label'),
				release: () => {
					observer.disconnect();
					el.removeEventListener('click', onClick, { capture: true });
				},
			});
			el.addClass(TAKEN_OVER_CLASS);
		}
		this.styleTakenOver(el, view);
		// Forget buttons of closed notes.
		for (const [button, info] of this.takenOver) {
			if (!button.isConnected) {
				info.release();
				this.takenOver.delete(button);
			}
		}
	}

	private styleTakenOver(el: HTMLElement, view: MarkdownView): void {
		const { icon, tooltip } = this.iconFor(view);
		// Only touch the button when it's out of date, so our own changes don't loop through the observer.
		if (!el.querySelector(`svg.lucide-${icon}`)) setIcon(el, icon);
		if (el.getAttribute('aria-label') !== tooltip) el.setAttribute('aria-label', tooltip);
	}

	private release(view: MarkdownView): void {
		for (const [el, info] of this.takenOver) {
			if (info.view === view) this.releaseButton(el, info);
		}
	}

	private releaseAll(): void {
		for (const [el, info] of this.takenOver) this.releaseButton(el, info);
	}

	private releaseButton(el: HTMLElement, info: TakenOver): void {
		info.release();
		el.removeClass(TAKEN_OVER_CLASS);
		el.replaceChildren(...info.originalNodes);
		if (info.originalLabel !== null) el.setAttribute('aria-label', info.originalLabel);
		this.takenOver.delete(el);
	}

	// -----------------------------------------------------------------------
	// Our own buttons
	// -----------------------------------------------------------------------

	private removeButtons(view: MarkdownView): void {
		this.buttons.get(view)?.forEach(el => el.remove());
		this.buttons.delete(view);
	}

	private refreshOwnButtons(view: MarkdownView, mode: EditMode): void {
		const settings = this.settings;
		const modes = settings.oneButtonPerMode ? modeCycle(settings) : [null];

		let buttons = this.buttons.get(view);
		if (!buttons || buttons.length !== modes.length || buttons.some(b => !b.isConnected)) {
			this.removeButtons(view);
			// addAction prepends, so add in reverse to keep the configured order.
			buttons = [...modes].reverse().map(target => {
				const el = view.addAction('pencil', '', () => void this.setMode(view, target ?? this.next(view)));
				el.addClass(BUTTON_CLASS);
				return el;
			}).reverse();
			this.buttons.set(view, buttons);
		}

		buttons.forEach((el, i) => {
			const target = modes[i];
			if (target) {
				// One button per mode: highlight the active one.
				setIcon(el, MODE_INFO[target].icon);
				setTooltip(el, MODE_INFO[target].label);
				el.toggleClass('is-active', target === mode);
				el.toggle(true);
				return;
			}
			// In reading view with reading view left out of the cycle, there's nothing to cycle.
			el.toggle(modeCycle(settings).includes(mode));
			const { icon, tooltip } = this.iconFor(view);
			setIcon(el, icon);
			setTooltip(el, tooltip);
		});
	}

	// -----------------------------------------------------------------------
	// Commander buttons for our command
	// -----------------------------------------------------------------------

	/** Make a Commander header button for "Switch to next editing mode" show the mode's icon. */
	private updateCommanderButtons(view: MarkdownView, mode: EditMode): void {
		const commandId = `${this.plugin.manifest.id}:${CYCLE_COMMAND}`;
		const buttons = view.containerEl.querySelectorAll<HTMLElement>(`.${COMMANDER_BUTTON_CLASS}`);
		for (const el of Array.from(buttons)) {
			if (!el.classList.contains(commandId)) continue;
			const icon = MODE_INFO[this.settings.showNextModeIcon ? this.next(view) : mode].icon;
			if (el.dataset.btnModeIcon === icon) continue;
			if (!this.commanderIcons.has(el)) this.commanderIcons.set(el, Array.from(el.childNodes).map(n => n.cloneNode(true)));
			setIcon(el, icon);
			el.dataset.btnModeIcon = icon;
		}
		for (const el of this.commanderIcons.keys()) {
			if (!el.isConnected) this.commanderIcons.delete(el);
		}
	}

	private restoreCommanderIcons(): void {
		for (const [el, nodes] of this.commanderIcons) {
			el.replaceChildren(...nodes);
			delete el.dataset.btnModeIcon;
		}
		this.commanderIcons.clear();
	}

	// -----------------------------------------------------------------------

	/** Copy what's in the note header, so a layout problem can be diagnosed without dev tools. */
	private async copyHeaderReport(view: MarkdownView): Promise<void> {
		const header = view.containerEl.querySelector<HTMLElement>('.view-header');
		const actions = view.containerEl.querySelector<HTMLElement>('.view-header .view-actions');
		const lines = [
			`Better Tabs and Notes ${this.plugin.manifest.version}, edit mode switch: ${this.settings.buttonPlace}`,
			`Mode: ${getMode(view)}, phone: ${document.body.hasClass('is-phone')}, mobile: ${document.body.hasClass('is-mobile')}`,
			`Header width: ${header?.clientWidth ?? '?'}px, buttons area: ${actions?.clientWidth ?? '?'}px visible of ${actions?.scrollWidth ?? '?'}px`,
			`Obsidian's button found: ${findDefaultModeButton(view) ? 'yes' : 'no'}`,
			'Buttons, left to right:',
		];
		for (const el of Array.from(actions?.children ?? []) as HTMLElement[]) {
			const style = window.getComputedStyle(el);
			const hidden = style.display === 'none' || style.visibility === 'hidden';
			lines.push(`- "${el.getAttribute('aria-label') ?? ''}" [${Array.from(el.classList).join(' ')}]${hidden ? ' HIDDEN' : ''} width ${el.offsetWidth}px`);
		}
		const report = lines.join('\n');
		try {
			await navigator.clipboard.writeText(report);
			new Notice('Copied the note header buttons. Paste them into your message.');
		} catch {
			console.warn(report);
			new Notice('Couldn\'t copy. The list is in the developer console.');
		}
	}

	async setMode(view: MarkdownView, mode: EditMode): Promise<void> {
		const leaf = view.leaf;
		const viewState = leaf.getViewState();
		viewState.state = {
			...viewState.state,
			mode: mode === 'preview' ? 'preview' : 'source',
			source: mode === 'source',
		};
		await leaf.setViewState(viewState);
		if (mode !== 'preview') view.editor.focus();
		this.refresh(view);
	}
}
