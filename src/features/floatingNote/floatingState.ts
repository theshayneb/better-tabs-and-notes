// Floating note: what's remembered on this computer (never synced: window size and
// position, pin and opacity only make sense on the screen they were set on).
// No Obsidian imports, so it can be unit-tested.
// Ported from PopNote by JD (iijarrett) (MIT); see NOTICE.md.

export interface FloatingBounds {
	x?: number;
	y?: number;
	width: number;
	height: number;
}

export interface FloatingState {
	/** The note the window shows. */
	notePath: string | null;
	/** Show the note you're on each time the window comes up (else the note it showed last, as PopNote did). */
	followActive: boolean;
	bounds: FloatingBounds | null;
	pinned: boolean;
	/** 0.3 to 1. */
	opacity: number;
	/** System-wide shortcut that shows and hides the window, as Electron writes it. Empty means the default. */
	shortcut: string;
	allSpaces: boolean;
	tray: boolean;
	/** The Windows virtual desktop tip was shown once. */
	helpShown: boolean;
}

export const DEFAULT_SHORTCUT = 'Alt+P';
export const MIN_OPACITY = 0.3;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Stored state, with anything missing or broken replaced by the defaults. */
export function cleanState(raw: unknown, defaults: { allSpaces: boolean }): FloatingState {
	const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	let bounds: FloatingBounds | null = null;
	const b = data.bounds;
	if (b && typeof b === 'object') {
		const { x, y, width, height } = b as Record<string, unknown>;
		if (finite(width) && finite(height) && width > 0 && height > 0) {
			bounds = finite(x) && finite(y) ? { x, y, width, height } : { width, height };
		}
	}
	return {
		notePath: typeof data.notePath === 'string' && data.notePath.trim() ? data.notePath : null,
		followActive: data.followActive !== false,
		bounds,
		pinned: data.pinned === true,
		opacity: finite(data.opacity) ? Math.min(1, Math.max(MIN_OPACITY, data.opacity)) : 1,
		shortcut: typeof data.shortcut === 'string' ? data.shortcut.trim() : '',
		allSpaces: typeof data.allSpaces === 'boolean' ? data.allSpaces : defaults.allSpaces,
		tray: data.tray === true,
		helpShown: data.helpShown === true,
	};
}

/** The shortcut to register: the one chosen on this computer, or Alt+P. */
export function shortcutOf(state: FloatingState): string {
	return state.shortcut || DEFAULT_SHORTCUT;
}

/** Follow a renamed or moved note (or its folder). Returns the new path, or null if it isn't affected. */
export function renamedPath(notePath: string | null, oldPath: string, newPath: string): string | null {
	if (!notePath) return null;
	if (notePath === oldPath) return newPath;
	if (notePath.startsWith(`${oldPath}/`)) return newPath + notePath.slice(oldPath.length);
	return null;
}
