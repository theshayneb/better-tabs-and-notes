import type { App, WorkspaceLeaf } from 'obsidian';

/** Close every tab in the main area except `keep` and pinned tabs. */
export function closeOtherTabs(app: App, keep: WorkspaceLeaf | null): void {
	const toClose: WorkspaceLeaf[] = [];
	app.workspace.iterateRootLeaves(leaf => {
		if (leaf !== keep && !leaf.pinned) toClose.push(leaf);
	});
	toClose.forEach(l => l.detach());
}
