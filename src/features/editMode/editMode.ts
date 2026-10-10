// Header button(s) for switching between live preview, source and reading mode.
// Based on the idea of Edit Mode Switch by Mara-Li (GPL-3.0); see NOTICE.md.

import { MarkdownView, setIcon, setTooltip, type Command } from 'obsidian';
import { Feature } from '../../feature';
import type { EditMode, EditModeSettings } from '../../settings';
import { modeCycle, nextMode } from './modes';

const MODE_INFO: Record<EditMode, { icon: string; label: string }> = {
	live: { icon: 'pencil-ruler', label: 'Live preview' },
	source: { icon: 'code', label: 'Source mode' },
	preview: { icon: 'book-open', label: 'Reading view' },
};

const BUTTON_CLASS = 'btn-edit-mode-button';
const CYCLE_COMMAND = 'cycle-edit-mode';
/** Class Commander gives the note header buttons it adds; each also has the command id as a class. */
const COMMANDER_BUTTON_CLASS = 'cmdr-page-header';
/** Commander adds its header buttons a moment after the layout changes. */
const COMMANDER_DELAY_MS = 250;
const HIDDEN_DEFAULT_CLASS = 'btn-edit-mode-hidden';

/** MarkdownView keeps its own reading/editing toggle here (undocumented). */
type ViewWithModeButton = MarkdownView & { modeButtonEl?: HTMLElement };

export function getMode(view: MarkdownView): EditMode {
	const state = view.getState() as { mode?: string; source?: boolean };
	if (state.mode === 'preview') return 'preview';
	return state.source ? 'source' : 'live';
}

export class EditModeFeature extends Feature {
	readonly id = 'editMode';
	readonly name = 'Edit mode switch';

	private buttons = new WeakMap<MarkdownView, HTMLElement[]>();
	/** Commander's original icon for buttons whose icon we've replaced. */
	private commanderIcons = new Map<HTMLElement, Node[]>();
	private delayedRefresh: number | null = null;

	get settings(): EditModeSettings {
		return this.plugin.settings.editMode;
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
		this.forEachMarkdownView(view => {
			this.removeButtons(view);
			(view as ViewWithModeButton).modeButtonEl?.removeClass(HIDDEN_DEFAULT_CLASS);
		});
		this.restoreCommanderIcons();
	}

	override onSettingsChange(): void {
		this.forEachMarkdownView(view => this.removeButtons(view));
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
			command('cycle-edit-mode', 'Switch to next editing mode', 'pencil-ruler', view => nextMode(getMode(view), this.settings)),
			command('switch-to-live-preview', 'Switch to live preview', MODE_INFO.live.icon, () => 'live'),
			command('switch-to-source-mode', 'Switch to source mode', MODE_INFO.source.icon, () => 'source'),
			command('switch-to-reading-view', 'Switch to reading view', MODE_INFO.preview.icon, () => 'preview'),
		];
	}

	private forEachMarkdownView(fn: (view: MarkdownView) => void): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView) fn(leaf.view);
		});
	}

	private refreshAll(): void {
		this.forEachMarkdownView(view => this.refresh(view));
		// Catch Commander buttons added after this layout change.
		if (this.delayedRefresh !== null) window.clearTimeout(this.delayedRefresh);
		this.delayedRefresh = window.setTimeout(() => {
			this.delayedRefresh = null;
			this.forEachMarkdownView(view => this.updateCommanderButtons(view, getMode(view)));
		}, COMMANDER_DELAY_MS);
	}

	/**
	 * Make a Commander header button for "Switch to next editing mode" show the
	 * current mode's icon (or the next one's, per the settings), like our own button.
	 */
	private updateCommanderButtons(view: MarkdownView, mode: EditMode): void {
		const commandId = `${this.plugin.manifest.id}:${CYCLE_COMMAND}`;
		const buttons = view.containerEl.querySelectorAll<HTMLElement>(`.${COMMANDER_BUTTON_CLASS}`);
		for (const el of Array.from(buttons)) {
			if (!el.classList.contains(commandId)) continue;
			const next = nextMode(mode, this.settings);
			const icon = MODE_INFO[this.settings.showNextModeIcon ? next : mode].icon;
			if (el.dataset.btnModeIcon === icon) continue;
			if (!this.commanderIcons.has(el)) this.commanderIcons.set(el, Array.from(el.childNodes).map(n => n.cloneNode(true)));
			setIcon(el, icon);
			el.dataset.btnModeIcon = icon;
		}
		// Forget buttons Commander has since removed.
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

	private removeButtons(view: MarkdownView): void {
		this.buttons.get(view)?.forEach(el => el.remove());
		this.buttons.delete(view);
	}

	/** Create the buttons for a view if needed and make them reflect its mode. */
	private refresh(view: MarkdownView): void {
		const mode = getMode(view);
		const settings = this.settings;

		const hideDefault = settings.hideDefaultButton && settings.includeReadingMode;
		(view as ViewWithModeButton).modeButtonEl?.toggleClass(HIDDEN_DEFAULT_CLASS, hideDefault);
		this.updateCommanderButtons(view, mode);
		if (!settings.showHeaderButton) {
			this.removeButtons(view);
			return;
		}

		const modes = settings.oneButtonPerMode ? modeCycle(settings) : [null];

		let buttons = this.buttons.get(view);
		if (!buttons || buttons.length !== modes.length || buttons.some(b => !b.isConnected)) {
			this.removeButtons(view);
			// addAction prepends, so add in reverse to keep the configured order.
			buttons = [...modes].reverse().map(target => {
				const el = view.addAction('pencil', '', () => {
					const current = getMode(view);
					void this.setMode(view, target ?? nextMode(current, this.settings));
				});
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
			const next = nextMode(mode, settings);
			// Reading view isn't part of the cycle: nothing to switch to.
			el.toggle(next !== mode);
			const shown = settings.showNextModeIcon ? next : mode;
			setIcon(el, MODE_INFO[shown].icon);
			setTooltip(el, settings.showNextModeIcon
				? `Switch to ${MODE_INFO[next].label.toLowerCase()}`
				: `${MODE_INFO[mode].label} (click for ${MODE_INFO[next].label.toLowerCase()})`);
		});
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
