import { describe, expect, it, vi } from 'vitest';

// Just enough of Obsidian for the feature: a Component and the suggestion modal classes.
vi.mock('obsidian', () => {
	class Component {
		private cleanups: (() => void)[] = [];
		load(): void { this.onload(); }
		unload(): void {
			this.onunload();
			for (const cleanup of this.cleanups.splice(0)) cleanup();
		}
		onload(): void {}
		onunload(): void {}
		register(cleanup: () => void): void { this.cleanups.push(cleanup); }
	}
	class SuggestModal { getSuggestions(): unknown[] { return []; } }
	class FuzzySuggestModal extends SuggestModal {}
	return { Component, SuggestModal, FuzzySuggestModal };
});

// Typed as the stand-in above, not as Obsidian's real class.
const { FuzzySuggestModal } = await import('obsidian') as unknown as { FuzzySuggestModal: new () => { getSuggestions(): unknown[] } };
const { HideCommandsFeature } = await import('../src/features/hideCommands/hideCommands');
const { DEFAULT_SETTINGS } = await import('../src/settings');

interface Cmd { id: string; name: string }

function setup(options: { palette?: boolean } = {}) {
	const ran: string[] = [];
	const registry: Record<string, Cmd> = {
		'a:one': { id: 'a:one', name: 'A: One' },
		'a:two': { id: 'a:two', name: 'A: Two' },
		'b:three': { id: 'b:three', name: 'B: Three' },
	};
	const commands = {
		commands: registry,
		listCommands: () => Object.values(registry),
		executeCommandById: (id: string) => { ran.push(id); return id in registry; },
	};
	// The palette's own modal class, as Obsidian has it: a subclass of FuzzySuggestModal.
	class PaletteModal extends FuzzySuggestModal {
		override getSuggestions(): { item: Cmd }[] {
			return Object.values(registry).map(item => ({ item }));
		}
	}
	const palette = options.palette === false ? null : {
		getCommands: () => Object.values(registry),
		modal: new PaletteModal(),
	};
	const app = {
		commands,
		internalPlugins: { getPluginById: (id: string) => (id === 'command-palette' && palette ? { enabled: true, instance: palette } : null) },
	};
	const settings = structuredClone(DEFAULT_SETTINGS);
	const plugin = {
		app,
		settings,
		saveSettings: vi.fn(async () => { if (feature.isLoaded) feature.onSettingsChange(); }),
	};
	const feature = new HideCommandsFeature(plugin as never);
	return { feature, settings, commands, palette, PaletteModal, ran };
}

const ids = (list: unknown[]) => list.map(x => ((x as { item?: Cmd }).item ?? (x as Cmd)).id);

describe('hide commands feature', () => {
	it('hides commands from the palette only, and they still run', async () => {
		const { feature, commands, palette, ran } = setup();
		feature.load();
		await feature.hide(['a:two']);

		expect(ids(palette!.getCommands())).toEqual(['a:one', 'b:three']);
		expect(ids(palette!.modal.getSuggestions())).toEqual(['a:one', 'b:three']);
		// Everything else still sees and runs the command.
		expect(ids(commands.listCommands())).toEqual(['a:one', 'a:two', 'b:three']);
		expect(commands.commands['a:two']).toBeDefined();
		expect(commands.executeCommandById('a:two')).toBe(true);
		expect(ran).toEqual(['a:two']);
		expect(feature.problem).toBeNull();
	});

	it('leaves other suggestion modals alone', async () => {
		const { feature } = setup();
		feature.load();
		await feature.hide(['a:one']);
		class OtherModal extends FuzzySuggestModal {
			override getSuggestions() { return [{ item: { id: 'a:one', name: 'A: One' } }]; }
		}
		expect(new OtherModal().getSuggestions()).toHaveLength(1);
	});

	it('applies changes right away, and undoes everything when turned off', async () => {
		const { feature, palette, commands, PaletteModal } = setup();
		const originalGetCommands = palette!.getCommands;
		feature.load();
		await feature.hide(['a:one', 'b:three']);
		expect(ids(palette!.getCommands())).toEqual(['a:two']);
		await feature.unhide('b:three');
		expect(ids(palette!.getCommands())).toEqual(['a:two', 'b:three']);

		feature.unload();
		expect(palette!.getCommands).toBe(originalGetCommands);
		expect(ids(palette!.getCommands())).toHaveLength(3);
		expect(ids(new PaletteModal().getSuggestions())).toHaveLength(3);
		expect(ids(commands.listCommands())).toHaveLength(3);
	});

	it('can hide everywhere instead, and switch back', async () => {
		const { feature, settings, commands, palette } = setup();
		feature.load();
		await feature.hide(['a:one']);
		settings.hideCommands.scope = 'everywhere';
		feature.onSettingsChange();
		expect(ids(commands.listCommands())).toEqual(['a:two', 'b:three']);
		expect(ids(palette!.getCommands())).toHaveLength(3);
		expect(commands.executeCommandById('a:one')).toBe(true);

		settings.hideCommands.scope = 'palette';
		feature.onSettingsChange();
		expect(ids(commands.listCommands())).toHaveLength(3);
		expect(ids(palette!.getCommands())).toEqual(['a:two', 'b:three']);
	});

	it('turns itself off when the palette can\'t be found', async () => {
		const { feature, commands } = setup({ palette: false });
		feature.load();
		await feature.hide(['a:one']);
		expect(feature.problem).toMatch(/command palette/);
		expect(ids(commands.listCommands())).toHaveLength(3);
	});
});
