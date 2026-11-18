// Wait for Obsidian Sync to settle before doing automatic work, so a device that
// was offline for hours or days gets the other devices' changes first.

import { Component, type App } from 'obsidian';

/** No vault changes for this long counts as settled. */
export const QUIET_MS = 60_000;
/** Give up waiting after this long, unless Sync still reports it's syncing. */
export const MAX_WAIT_MS = 10 * 60_000;
/** Back on screen after at least this long away counts as a resume, like a fresh start. */
export const RESUME_AFTER_MS = 60_000;

/**
 * Whether it's safe to go ahead. `status` is the core Sync plugin's status,
 * or null when Sync is off or its status can't be read.
 */
export function isSettled(now: number, lastActivity: number, waitingSince: number, status: string | null): boolean {
	if (status === 'syncing') return now - waitingSince >= 3 * MAX_WAIT_MS;
	return now - lastActivity >= QUIET_MS || now - waitingSince >= MAX_WAIT_MS;
}

interface SyncInstance {
	getStatus?: () => unknown;
}

/** Watches the vault and the core Sync plugin; started with the plugin. */
export class SyncWatcher extends Component {
	private lastActivity = Date.now();
	private hiddenAt: number | null = null;

	constructor(private app: App) {
		super();
	}

	override onload(): void {
		const touch = () => { this.lastActivity = Date.now(); };
		const { vault } = this.app;
		this.registerEvent(vault.on('create', touch));
		this.registerEvent(vault.on('modify', touch));
		this.registerEvent(vault.on('delete', touch));
		this.registerEvent(vault.on('rename', touch));
		this.registerDomEvent(window, 'online', touch);
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				this.hiddenAt = Date.now();
			} else if (this.hiddenAt !== null) {
				// Back after a while (a phone waking up): Sync starts catching up now.
				if (Date.now() - this.hiddenAt >= RESUME_AFTER_MS) touch();
				this.hiddenAt = null;
			}
		});
	}

	/** The core Sync plugin's status ("synced", "syncing", "paused"...), or null. Undocumented, so guarded. */
	syncStatus(): string | null {
		try {
			const sync = this.app.internalPlugins?.getPluginById?.('sync');
			if (!sync?.enabled) return null;
			const status = (sync.instance as SyncInstance | undefined)?.getStatus?.();
			return typeof status === 'string' ? status : null;
		} catch {
			return null;
		}
	}

	settledNow(waitingSince = Date.now(), fullWait = false): boolean {
		const last = fullWait ? Math.max(this.lastActivity, waitingSince) : this.lastActivity;
		return isSettled(Date.now(), last, waitingSince, this.syncStatus());
	}

	/**
	 * Resolves once Sync has settled, or when `stop()` returns true (checked
	 * every second). With `fullWait`, waits the whole quiet time from now even if
	 * the vault was already quiet, in case another device is uploading right now.
	 */
	waitUntilSettled(stop: () => boolean = () => false, fullWait = false): Promise<void> {
		const since = Date.now();
		return new Promise(resolve => {
			const check = () => {
				if (stop() || this.settledNow(since, fullWait)) {
					window.clearInterval(timer);
					resolve();
				}
			};
			const timer = window.setInterval(check, 1000);
			this.register(() => window.clearInterval(timer));
			check();
		});
	}
}
