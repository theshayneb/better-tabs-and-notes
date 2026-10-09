import { Component, type App, type Command } from 'obsidian';
import type BetterTabsPlugin from './main';
import type { FeatureId } from './settings';

/**
 * One switchable part of the plugin. A feature is loaded as a child component of
 * the plugin while it's enabled, so everything it registers (events, patches,
 * DOM) is cleaned up when it's turned off.
 */
export abstract class Feature extends Component {
	abstract readonly id: FeatureId;
	abstract readonly name: string;

	constructor(protected readonly plugin: BetterTabsPlugin) {
		super();
	}

	get app(): App {
		return this.plugin.app;
	}

	get isLoaded(): boolean {
		return this.pwLoaded;
	}

	private pwLoaded = false;

	override load(): void {
		this.pwLoaded = true;
		super.load();
	}

	override unload(): void {
		this.pwLoaded = false;
		super.unload();
	}

	/**
	 * Commands are registered once for the plugin's lifetime and hidden while the
	 * feature is off. Only use `checkCallback` or `callback`.
	 */
	commands(): Command[] {
		return [];
	}

	/** Called after this feature's settings changed while it's loaded. */
	onSettingsChange(): void {}
}
