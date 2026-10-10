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

	get settings(): EditModeSettings {
		return this.plugin.settings.editMode;
	}

	override onload(): void {
		this.app.workspace.onLayoutReady(() => this.refreshAll());
		this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshAll()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshAll()));
	}

	override onunload(): void {
		this.forEachMarkdownView(view => {
			this.removeButtons(view);
			(view as ViewWithModeButton).modeButtonEl?.removeClass(HIDDEN_DEFAULT_CLASS);
		});
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
