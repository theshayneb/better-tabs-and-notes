// Hide commands from the command palette without touching the commands themselves.
// The approach comes from Command Block List by Ryota Ushio (MIT); see NOTICE.md.
//
// Commands are never unregistered or changed: app.commands.commands and
// executeCommandById are left alone, so hotkeys, buttons, macros and other
// plugins still run hidden commands. Only the lists of commands are filtered.

import { FuzzySuggestModal, SuggestModal } from 'obsidian';
import { around } from 'monkey-around';
import { Feature } from '../../feature';
import type { HideCommandsSettings } from '../../settings';
import { addHidden, cleanIds, withoutHidden, type CommandInfo, type HideScope } from './hideLogic';

/** The parts of the core command palette plugin used here (undocumented). */
interface PaletteInstance {
	getCommands?: (...args: unknown[]) => unknown;
	modal?: object;
}

type ListFunction = (this: unknown, ...args: unknown[]) => unknown;

export class HideCommandsFeature extends Feature {
	readonly id = 'hideCommands';
	readonly name = 'Hide commands';

	/** Why commands can't be hidden right now, or null when it's working. Shown in the settings. */
	problem: string | null = null;

	private hidden = new Set<string>();
	private removers: (() => void)[] = [];
	private patchedScope: HideScope | null = null;

	get settings(): HideCommandsSettings {
		return this.plugin.settings.hideCommands;
	}

	get scope(): HideScope {
		return this.settings.scope === 'everywhere' ? 'everywhere' : 'palette';
	}

	override onload(): void {
		this.apply();
	}

	override onunload(): void {
		this.removePatches();
	}

	override onSettingsChange(): void {
		this.apply();
	}

	/** Every registered command (from all plugins and core), unfiltered. */
	allCommands(): CommandInfo[] {
		return Object.values(this.app.commands.commands)
			.filter(c => c !== undefined)
			.map(c => ({ id: c.id, name: c.name }));
	}

	isHidden(id: string): boolean {
		return this.hidden.has(id);
	}

	async hide(ids: string[]): Promise<void> {
		this.settings.hiddenIds = addHidden(this.settings.hiddenIds, ids);
		await this.plugin.saveSettings('hideCommands');
	}

	async unhide(id: string): Promise<void> {
		this.settings.hiddenIds = cleanIds(this.settings.hiddenIds).filter(h => h !== id);
		await this.plugin.saveSettings('hideCommands');
	}

	/** Read the settings and (re)install the filter in the chosen place. Takes effect the next time a list is shown. */
	private apply(): void {
		this.hidden = new Set(cleanIds(this.settings.hiddenIds));
		// The filters read `this.hidden` every time, so a new list needs no re-patching.
		if (this.patchedScope === this.scope) return;
		this.removePatches();
		try {
			this.problem = this.scope === 'everywhere' ? this.patchEverywhere() : this.patchPalette();
		} catch (e) {
			console.error('Better Tabs and Notes: couldn\'t hide commands', e);
			this.removePatches();
			this.problem = 'Something went wrong while hiding commands; see the developer console.';
		}
		this.patchedScope = this.problem ? null : this.scope;
	}

	private removePatches(): void {
		for (const remove of this.removers.splice(0)) remove();
		this.patchedScope = null;
	}

	/** Wrap a list-returning method so it leaves out hidden commands. */
	private filterMethod(target: object, method: string): void {
		const hidden = () => this.hidden;
		this.removers.push(around(target as Record<string, ListFunction>, {
			[method](original: ListFunction): ListFunction {
				return function (this: unknown, ...args: unknown[]) {
					const result = original.apply(this, args);
					if (result instanceof Promise) return result.then(list => withoutHidden(list as unknown[], hidden()));
					return Array.isArray(result) ? withoutHidden(result, hidden()) : result;
				};
			},
		}));
	}

	/** Filter only the core command palette. Returns a problem, or null. */
	private patchPalette(): string | null {
		const instance = this.app.internalPlugins.getPluginById('command-palette')?.instance as PaletteInstance | null | undefined;
		if (!instance) return 'The command palette core plugin wasn\'t found, so no commands are hidden.';

		// The palette builds its list here...
		if (typeof instance.getCommands === 'function') this.filterMethod(instance, 'getCommands');

		// ...and its search results (pinned commands included) come from its modal. Patch the
		// palette's own modal class only, never Obsidian's shared suggestion modal classes.
		const modalClass = instance.modal ? Object.getPrototypeOf(instance.modal) as object | null : null;
		const shared: object[] = [FuzzySuggestModal.prototype, SuggestModal.prototype, Object.prototype];
		if (modalClass && !shared.includes(modalClass)
			&& typeof (modalClass as { getSuggestions?: unknown }).getSuggestions === 'function') {
			this.filterMethod(modalClass, 'getSuggestions');
		}

		if (this.removers.length === 0) {
			return 'This version of Obsidian\'s command palette works differently, so no commands are hidden. Try "Everywhere" below.';
		}
		return null;
	}

	/** Filter app.commands.listCommands(): every list of commands, including the Hotkeys page. Returns a problem, or null. */
	private patchEverywhere(): string | null {
		const commands = this.app.commands;
		if (typeof commands.listCommands !== 'function') {
			return 'This version of Obsidian lists commands differently, so no commands are hidden.';
		}
		this.filterMethod(commands, 'listCommands');
		return null;
	}
}
