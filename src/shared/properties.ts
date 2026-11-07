import { MarkdownView, type App } from 'obsidian';

/** Redraw the Properties panel of every open note, e.g. after changing how values are drawn. */
export function redrawProperties(app: App): void {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const editor = leaf.view instanceof MarkdownView ? leaf.view.metadataEditor : undefined;
		if (!editor) continue;
		try {
			const data = editor.serialize();
			editor.synchronize({});
			editor.synchronize(data);
		} catch (e) {
			console.error('Better Tabs and Notes: couldn\'t redraw properties', e);
		}
	}
}
