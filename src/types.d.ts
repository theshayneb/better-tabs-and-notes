// Undocumented Obsidian internals this plugin relies on. Everything here can
// change between Obsidian releases, so keep the list short and check it when
// a new Obsidian version breaks something.

import 'obsidian';
import type { EditorPosition, PaneType, TFile, WorkspaceItem, WorkspaceLeaf } from 'obsidian';
import type { TabSettings } from './settings';

declare module 'obsidian' {
	interface App {
		internalPlugins: {
			getPluginById(id: string): { enabled: boolean; instance: unknown } | null;
			plugins: Record<string, { enabled: boolean; instance: unknown } | undefined>;
		};
		plugins: {
			getPlugin(id: string): Plugin | null;
			enabledPlugins: Set<string>;
		};
		commands: {
			executeCommandById(id: string): boolean;
			commands: Record<string, Command | undefined>;
		};
		viewRegistry: {
			getTypeByExtension(extension: string): string | undefined;
		};
		loadLocalStorage(key: string): unknown;
		saveLocalStorage(key: string, value: unknown): void;
	}

	interface Editor {
		/** The link, tag or URL at a position, if any. */
		getClickableTokenAt?(pos: EditorPosition): { type: string; text: string } | null;
	}

	interface MetadataCache {
		/** Every property name in the vault with its registered type, keyed by lower-case name. */
		getAllPropertyInfos?(): Record<string, { name: string; widget?: string; type?: string; occurrences?: number }>;
	}

	interface Vault {
		getConfig(key: string): unknown;
		setConfig(key: string, value: unknown): void;
	}

	interface Workspace {
		getUnpinnedLeaf(focus?: boolean): WorkspaceLeaf;
		iterateLeaves(item: WorkspaceItem, callback: (leaf: WorkspaceLeaf) => unknown): void;
	}

	interface WorkspaceLeaf {
		id: string;
		pinned: boolean;
		activeTime: number;
		tabHeaderEl: HTMLElement;
		history: {
			backHistory: unknown[];
			back(): void;
		};
		canNavigate(): boolean;
		isVisible(): boolean;
		/** Per-leaf state owned by this plugin. Prefixed to avoid clashing with Obsidian internals. */
		pwBtn?: LeafState;
	}

	interface WorkspaceTabs {
		children: WorkspaceLeaf[];
		currentTab: number;
		isStacked: boolean;
		insertChild(index: number, leaf: WorkspaceLeaf): void;
		selectTabIndex(index: number): void;
	}

	interface View {
		navigation: boolean;
	}

	interface ItemView {
		actionsEl: HTMLElement;
	}

	interface TFile {
		deleted?: boolean;
	}
}

export interface OpenInfo {
	openMode: PaneType | false;
	override: Partial<TabSettings>;
	openedFrom?: string;
}

export interface LeafState {
	/** Only valid between getLeaf() and the following openFile(). */
	openInfo?: OpenInfo;
	isPreview?: boolean;
	/** Opened via "Open in duplicate tab"; the late-duplicate check leaves it alone. */
	allowDuplicate?: boolean;
	eventCleanup?: () => void;
	openedTime?: number;
}

export type TabGroup = import('obsidian').WorkspaceTabs;

export type { TFile, WorkspaceLeaf };
