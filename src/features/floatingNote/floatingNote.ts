// Floating note: one note in its own small desktop window, shown and hidden from
// any app with a system-wide shortcut (Alt+P by default), with pin-on-top,
// opacity, a note picker and an optional tray icon. Desktop only.
// Ported from PopNote by JD (iijarrett) (MIT); see NOTICE.md.
//
// Everything it remembers is per computer (local storage), so moving or
// resizing the window never touches the synced settings.

import { Notice, Platform, TFile, type Command } from 'obsidian';
import { Feature } from '../../feature';
import { FloatingNative, type TrayItem } from './floatingNative';
import { OverlayControls } from './floatingControls';
import { FloatingWindow } from './floatingWindow';
import { rankNotes } from './noteRank';
import { cleanState, renamedPath, shortcutOf, type FloatingState } from './floatingState';

const STATE_KEY = 'better-tabs-and-notes:floating-note';

export class FloatingNoteFeature extends Feature {
	readonly id = 'floatingNote';
	readonly name = 'Floating note';

	private native: FloatingNative | null = null;
	private popout: FloatingWindow | null = null;
	private overlay?: OverlayControls;
	private state!: FloatingState;
	private busy = false;
	private operation = 0;
	private stopped = false;
	private shortcutActive = false;
	private stopWatchingBounds?: () => void;
	private boundsTimer?: number;

	/** Only on desktop; on phones and tablets the feature does nothing. */
	get available(): boolean {
		return Platform.isDesktopApp;
	}

	override onload(): void {
		if (!this.available) return;
		const layout = this.plugin.floatingLayout;
		if (!layout) return;
		this.stopped = false;
		this.state = cleanState(this.app.loadLocalStorage(STATE_KEY), { allSpaces: Platform.isMacOS });
		this.popout = new FloatingWindow(this.app, layout, reason => this.releaseWindowBinding(reason));
		this.native = new FloatingNative(Platform.isWin ? 'pop-up-menu' : undefined);
		if (this.state.tray) this.applyTray(true);

		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.popout?.checkOwnership();
			this.plugin.floatingLayout?.audit();
			this.refreshOverlayLabel();
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshOverlayLabel()));
		// The note it shows is remembered on this computer only, so following a rename here writes nothing that syncs.
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			const path = renamedPath(this.state.notePath, oldPath, file.path);
			if (path) {
				this.state.notePath = path;
				this.saveState();
			}
		}));
		this.registerEvent(this.app.workspace.on('quit', () => this.flushBounds()));
		const mainWindow = this.app.workspace.containerEl?.ownerDocument?.defaultView;
		if (mainWindow) {
			// Obsidian can replace the page without unloading plugins: let go of the shortcut and tray then.
			this.registerDomEvent(mainWindow, 'beforeunload', event => {
				if (!event.defaultPrevented) this.finishRendererShutdown();
			});
			this.registerDomEvent(mainWindow, 'pagehide', event => {
				if (!event.persisted) this.finishRendererShutdown();
			});
		}
		this.registerShortcut(shortcutOf(this.state), false);
	}

	override onunload(): void {
		if (!this.native) return;
		this.stopped = true;
		this.flushBounds();
		this.native.dispose();
		this.popout?.close();
		this.overlay?.dispose();
		this.overlay = undefined;
		this.native = null;
		this.popout = null;
		this.shortcutActive = false;
	}

	override commands(): Command[] {
		const desktop = (run: () => void) => (checking: boolean) => {
			if (!this.available || !this.native) return false;
			if (!checking) run();
			return true;
		};
		return [
			{ id: 'floating-note-toggle', name: 'Show or hide the floating note', icon: 'picture-in-picture-2', checkCallback: desktop(() => void this.toggle('command')) },
			{
				id: 'floating-note-use-current',
				name: 'Show the current note in the floating note',
				icon: 'picture-in-picture',
				checkCallback: desktop(() => {
					const file = this.app.workspace.getActiveFile();
					if (!file) {
						new Notice('Floating note: open a note first.');
						return;
					}
					void this.chooseNote(file.path).then(chosen => {
						if (!chosen) return;
						new Notice(this.shortcutActive
							? `Floating note: showing ${file.path}. Press ${shortcutOf(this.state)} to open it.`
							: `Floating note: showing ${file.path}. No shortcut is registered; set one in the settings or use "Show or hide the floating note".`);
					});
				}),
			},
			{ id: 'floating-note-show-controls', name: 'Show the floating note controls', icon: 'sliders-horizontal', checkCallback: desktop(() => this.overlay?.recover(true)) },
		];
	}

	/** The plugin's layout guard asks before a layout save: is the window still ours? */
	checkOwnership(): void {
		this.popout?.checkOwnership();
	}

	// -----------------------------------------------------------------------
	// Settings (this computer only)
	// -----------------------------------------------------------------------

	private saveState(): void {
		this.app.saveLocalStorage(STATE_KEY, this.state);
	}

	/** The shortcut in use, or the one that would be used, for the settings. */
	currentShortcut(): string {
		return this.state ? shortcutOf(this.state) : shortcutOf(cleanState(this.app.loadLocalStorage(STATE_KEY), { allSpaces: false }));
	}

	settingsSnapshot(): { allSpaces: boolean; tray: boolean } {
		const state = this.state ?? cleanState(this.app.loadLocalStorage(STATE_KEY), { allSpaces: Platform.isMacOS });
		return { allSpaces: state.allSpaces, tray: state.tray };
	}

	/** Register a new shortcut; a refused one keeps the previous one. */
	applyShortcut(value: string): void {
		if (!this.native) {
			new Notice('Turn on the floating note first.');
			return;
		}
		this.registerShortcut(value, true);
	}

	private registerShortcut(value: string, persist: boolean): void {
		const accelerator = value.trim();
		if (!accelerator) {
			new Notice('Floating note: enter a shortcut first.');
			return;
		}
		// At startup an earlier registration (from before a reload) may still be held; take it back.
		const registered = this.native?.registerShortcut(accelerator, () => void this.toggle('shortcut'), !persist) ?? false;
		if (!registered) return;
		this.shortcutActive = true;
		if (persist) {
			this.state.shortcut = accelerator;
			this.saveState();
		}
	}

	setAllSpaces(value: boolean): void {
		if (!this.state) return;
		this.state.allSpaces = value;
		this.saveState();
		if (value && this.popout?.isOpen()) this.native?.allSpaces(true);
	}

	setTray(value: boolean): boolean {
		if (!this.state) return false;
		const applied = this.applyTray(value);
		this.state.tray = value && applied;
		this.saveState();
		return this.state.tray === value;
	}

	private applyTray(enabled: boolean): boolean {
		if (!this.native) return false;
		if (!enabled) {
			this.native.destroyTray();
			return true;
		}
		return this.native.createTray(() => void this.toggle('tray'), () => this.trayItems());
	}

	/** The tray icon's right-click menu, built each time it opens so it shows the current state. */
	private trayItems(): TrayItem[] {
		const percent = Math.round(this.state.opacity * 100);
		const notes = this.noteMatches('').slice(0, 5);
		const synced = (changed: boolean) => {
			if (changed) this.overlay?.sync(this.state.pinned, this.state.opacity);
		};
		return [
			{ label: 'Show or hide the floating note', click: () => void this.toggle('tray') },
			{ label: 'Keep on top', checked: this.state.pinned, click: () => synced(this.setPinned(!this.state.pinned)) },
			{
				label: 'Opacity', submenu: [
					...[100, 80, 60, 40].map(value => ({
						label: `${value}%`, checked: value === percent, click: () => synced(this.setOpacityValue(value / 100)),
					})),
					'separator' as const,
					{ label: 'Slider…', click: () => void this.openPanel('opacity') },
				],
			},
			'separator',
			{ label: 'Find note…', click: () => void this.openPanel('notes') },
			{
				label: 'Switch note', submenu: notes.length ? notes.map(path => ({
					label: path.replace(/\.md$/i, ''), checked: path === this.state.notePath, click: () => void this.showNote(path),
				})) : [{ label: 'No notes', disabled: true }],
			},
		];
	}

	/** Pin from the window's button or the tray. With no window open it's remembered for next time. */
	private setPinned(value: boolean): boolean {
		if (this.popout?.isOpen() && !this.native?.pin(value)) return false;
		this.state.pinned = value;
		this.saveState();
		this.native?.refreshTrayMenu();
		return true;
	}

	private setOpacityValue(value: number): boolean {
		if (this.popout?.isOpen() && !this.native?.opacity(value)) return false;
		this.state.opacity = value;
		this.saveState();
		this.native?.refreshTrayMenu();
		return true;
	}

	// -----------------------------------------------------------------------
	// The window
	// -----------------------------------------------------------------------

	/** Bring the window up with the note picker or the opacity slider open (from the tray menu). */
	private async openPanel(panel: 'notes' | 'opacity'): Promise<void> {
		if (this.popout?.isOpen()) this.native?.toggle('show');
		else await this.toggle('tray');
		this.overlay?.openPanel(panel);
	}

	/** Choose a note from the tray and bring the window up with it. */
	private async showNote(path: string): Promise<void> {
		if (!(await this.chooseNote(path))) return;
		if (this.popout?.isOpen()) this.native?.toggle('show');
		else await this.toggle('tray');
	}

	private noteMatches(query: string): string[] {
		const notes = this.app.vault.getMarkdownFiles().map(file => ({ path: file.path, modified: file.stat?.mtime ?? 0 }));
		const recent = [this.state.notePath, ...(this.app.workspace.getLastOpenFiles?.() ?? [])]
			.filter((path): path is string => typeof path === 'string');
		return rankNotes(notes, query, recent);
	}

	/** Show `path` in the open window, or remember it for next time. */
	private async chooseNote(path: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`Floating note: ${path} is not a note in this vault.`);
			return false;
		}
		if (this.popout?.isOpen() && !(await this.popout.showNote(file))) {
			new Notice(`Floating note: couldn't show ${path}.`);
			return false;
		}
		this.state.notePath = file.path;
		this.saveState();
		this.overlay?.setNote(file.path);
		this.native?.refreshTrayMenu();
		return true;
	}

	/** The note to show when none was chosen yet: the one in front, else the last one opened, else any. */
	private firstNote(): TFile | null {
		const active = this.app.workspace.getActiveFile();
		if (active) return active;
		const recent = this.app.workspace.getLastOpenFiles?.()[0];
		const file = recent ? this.app.vault.getAbstractFileByPath(recent) : null;
		return file instanceof TFile ? file : this.app.vault.getMarkdownFiles()[0] ?? null;
	}

	private refreshOverlayLabel(): void {
		if (!this.overlay) return;
		const label = this.popout?.noteLabel();
		if (label !== undefined) this.overlay.setNote(label);
	}

	private releaseWindowBinding(reason: string): void {
		this.operation++;
		this.busy = false;
		this.flushBounds();
		const overlay = this.overlay;
		this.overlay = undefined;
		try {
			overlay?.dispose();
		} finally {
			this.native?.release();
		}
		if (reason === 'window is no longer exclusively owned' && !this.stopped) {
			new Notice('Floating note: the window is now an ordinary Obsidian window. Use the shortcut again for a new floating note.');
		}
	}

	private flushBounds(): void {
		this.stopWatchingBounds?.();
		this.stopWatchingBounds = undefined;
		if (this.boundsTimer !== undefined) {
			window.clearTimeout(this.boundsTimer);
			this.boundsTimer = undefined;
			this.saveState();
		}
	}

	private finishRendererShutdown(): void {
		this.flushBounds();
		this.native?.destroyTray();
		if (this.shortcutActive && this.native?.unregisterShortcut()) this.shortcutActive = false;
	}

	/** Put the cursor in the note once the window shows. Obsidian moves focus just after, so it's done twice. */
	private focusNote(): void {
		const focus = () => {
			if (this.stopped || !this.popout?.isOpen() || this.overlay?.hasOpenPanel()) return;
			this.popout.focusEditor();
		};
		focus();
		window.setTimeout(focus, 150);
	}

	private async toggle(source: 'command' | 'shortcut' | 'tray'): Promise<void> {
		const native = this.native;
		const popout = this.popout;
		if (this.stopped || !native || !popout || this.busy) return;
		const open = popout.isOpen();
		this.busy = true;
		const operation = ++this.operation;
		try {
			if (open && Platform.isWin && !popout.isShowing() && !native.justShown()) {
				// A visible window whose page isn't showing was left on another virtual desktop. Showing it as usual would
				// switch back to that desktop, so it's hidden and shown again on this one.
				if (await native.showOnThisDesktop()) {
					if (!this.stopped && popout.isOpen()) this.focusNote();
					return;
				}
			}
			if (open) {
				// On Windows a tray click takes focus from the window, so a visible window hides whatever its focus.
				const action = native.toggle(source === 'tray' && !Platform.isMacOS ? 'hide-if-visible' : 'toggle');
				if (action === 'shown' || action === 'focused') this.focusNote();
				return;
			}
			const saved = this.state.notePath ? this.app.vault.getAbstractFileByPath(this.state.notePath) : null;
			const file = saved instanceof TFile ? saved : this.firstNote();
			if (!(file instanceof TFile)) {
				new Notice('Floating note: this vault has no notes to show yet.');
				return;
			}
			if (this.state.notePath && !(saved instanceof TFile)) {
				new Notice(`Floating note: ${this.state.notePath} isn't there any more, so showing ${file.path} instead.`);
			}
			const document = await popout.open(file);
			if (this.stopped) {
				popout.close();
				return;
			}
			// Each callback belongs to this exact opening, never to a later one.
			const allowed = () => !this.stopped && this.popout?.ownsDocument(document) === true;
			if (!allowed()) return;
			const controls = popout.mountControls();
			const overlay = this.overlay = new OverlayControls(controls, file.path, this.state.pinned, this.state.opacity, {
				allowed,
				pin: value => allowed() && this.setPinned(value),
				notes: query => this.noteMatches(query),
				choose: path => allowed() ? this.chooseNote(path) : Promise.resolve(false),
				pinHint: Platform.isWin
					? 'The shortcut and tray icon bring it to the desktop you are on. To keep one window on every desktop instead, press Win+Tab, right-click it, then choose Show this window on all desktops'
					: undefined,
				opacity: value => allowed() && this.setOpacityValue(value),
			});
			this.stopWatchingBounds?.();
			this.stopWatchingBounds = undefined;
			if (!native.bind(document, allowed)) return;
			native.minimumSize();
			native.keepOutOfFullScreen();
			if (this.state.bounds) native.restoreBounds(this.state.bounds);
			this.stopWatchingBounds = native.watchBounds(bounds => {
				if (!allowed()) return;
				this.state.bounds = bounds;
				// Saved once the window stops moving.
				if (this.boundsTimer !== undefined) window.clearTimeout(this.boundsTimer);
				this.boundsTimer = window.setTimeout(() => {
					this.boundsTimer = undefined;
					this.saveState();
				}, 250);
			});
			native.allSpaces(this.state.allSpaces);
			overlay.setNativeAvailability(native.pin(this.state.pinned), native.opacity(this.state.opacity));
			if (this.state.notePath !== file.path) {
				this.state.notePath = file.path;
				this.saveState();
			}
			if (Platform.isWin && !this.state.helpShown) {
				this.state.helpShown = true;
				this.saveState();
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- key names and a Windows menu item
				new Notice('Floating note tip: if it is left on another virtual desktop, the shortcut or tray icon brings it to the desktop you are on. To keep one window on every desktop instead, press Win+Tab, right-click it, then choose Show this window on all desktops.', 15000);
			}
		} catch (error) {
			new Notice(`Floating note: couldn't open: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			if (this.operation === operation) this.busy = false;
		}
	}
}
