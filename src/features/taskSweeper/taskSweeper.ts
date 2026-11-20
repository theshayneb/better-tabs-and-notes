// Task sweeper: move completed top-level tasks to a "## Done" section at the
// bottom of the note, by command or right after a task is checked off.
// Ported from Task Sweeper by Bryan Hogan (0BSD); see NOTICE.md.
//
// Every write is the direct result of something done by hand (checking a task
// off in the open note, or running the command), so it runs on any device.

import { MarkdownView, Notice, TFile, editorInfoField, type Command } from 'obsidian';
import { Annotation, type ChangeSet, type Extension, type Text } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { Feature } from '../../feature';
import type { TaskSweeperSettings } from '../../settings';
import {
	BLOCK_ID_PATTERN, COMPLETION_DATE_PATTERN, addIncludedFile, isCompletionToggle, isInScope, sweepCompletedTasks,
} from './sweepLogic';

/** Marks the sweep's own edits, so they don't set off another sweep. */
const SWEEP = Annotation.define<boolean>();

export class TaskSweeperFeature extends Feature {
	readonly id = 'taskSweeper';
	readonly name = 'Task sweeper';

	get settings(): TaskSweeperSettings {
		return this.plugin.settings.taskSweeper;
	}

	isFileActive(file: TFile): boolean {
		return isInScope(file.path, this.settings);
	}

	/** The auto sweep editor extension is registered once by the plugin; it does nothing while the feature is off. */
	registerPluginParts(): void {
		this.plugin.registerEditorExtension(this.editorExtension());
	}

	override commands(): Command[] {
		return [
			{
				id: 'sweep-completed-tasks',
				name: 'Sweep completed tasks to bottom of note',
				icon: 'list-checks',
				checkCallback: checking => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view?.file) return false;
					if (!checking) void this.sweepNote(view, view.file);
					return true;
				},
			},
			{
				id: 'add-current-file-to-sweep-scope',
				name: 'Add current file to task sweeper scope',
				icon: 'list-plus',
				checkCallback: checking => {
					const file = this.app.workspace.getActiveFile();
					if (!(file instanceof TFile) || file.extension !== 'md') return false;
					if (!checking) void this.addToScope(file);
					return true;
				},
			},
		];
	}

	/** The sweep command: in the editor (so it can be undone), or in the file in reading view. */
	private async sweepNote(view: MarkdownView, file: TFile): Promise<void> {
		if (!this.isFileActive(file)) {
			new Notice('This note is outside the task sweeper scope.');
			return;
		}
		let result = sweepCompletedTasks(view.editor.getValue());
		if (result.didChange && view.getMode() === 'source') {
			const last = view.editor.lastLine();
			view.editor.replaceRange(result.content, { line: 0, ch: 0 }, { line: last, ch: view.editor.getLine(last).length }, 'task-sweeper');
		} else if (result.didChange) {
			await this.app.vault.process(file, text => {
				result = sweepCompletedTasks(text);
				return result.content;
			});
		}
		if (result.skippedReason === 'unclosed-code-fence') new Notice('Close the code block before sweeping tasks.');
		else if (!result.didChange) new Notice(result.totalCompletedCount > 0 ? 'Completed tasks are already at the bottom of the note.' : 'No completed top-level tasks found.');
		else if (result.movedCount === 0) new Notice('Added completion dates to the tasks at the bottom of the note.');
		else new Notice(`Moved ${result.movedCount} completed task${result.movedCount === 1 ? '' : 's'} to the bottom of the note.`);
	}

	private async addToScope(file: TFile): Promise<void> {
		const files = addIncludedFile(this.settings, file.path);
		if (!files) {
			new Notice('This note is already in the task sweeper scope.');
			return;
		}
		this.settings.includedFiles = files;
		await this.plugin.saveSettings('taskSweeper');
		new Notice(`Added this note to the task sweeper scope.${this.settings.scope === 'selective' ? '' : ' The scope is still every note.'}`);
	}

	/** Auto sweep: shortly after a top-level task is checked off in the editor. */
	private editorExtension(): Extension {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the view plugin class needs the feature
		const feature = this;
		const active = (view: EditorView): boolean => {
			if (!feature.isLoaded || !feature.settings.autoSweep) return false;
			let file: TFile | null = null;
			try {
				file = view.state.field(editorInfoField).file;
			} catch {
				return false;
			}
			return !!file && feature.isFileActive(file);
		};
		return ViewPlugin.fromClass(class {
			private timer: number | null = null;

			constructor(private readonly view: EditorView) {}

			update(update: ViewUpdate): void {
				if (!update.docChanged) return;
				if (!active(this.view)) {
					this.cancel();
					return;
				}
				if (update.transactions.some(t => t.annotation(SWEEP))) return;
				// Undo and redo never sweep, so a sweep can be undone.
				if (update.transactions.some(t => t.isUserEvent('undo') || t.isUserEvent('redo'))) {
					this.cancel();
					return;
				}
				if (hasCompletionToggle(update.changes, update.startState.doc, update.state.doc)) {
					this.cancel();
					this.timer = window.setTimeout(() => {
						this.timer = null;
						this.sweep();
					}, 80);
				}
			}

			destroy(): void {
				this.cancel();
			}

			private cancel(): void {
				if (this.timer !== null) window.clearTimeout(this.timer);
				this.timer = null;
			}

			private sweep(): void {
				if (!active(this.view)) return;
				const result = sweepCompletedTasks(this.view.state.doc.toString());
				if (!result.didChange) return;
				const oldDoc = this.view.state.doc;
				const head = this.view.state.selection.main.head;
				const cursorLine = oldDoc.lineAt(head);
				const column = head - cursorLine.from;
				this.view.dispatch({ changes: { from: 0, to: oldDoc.length, insert: result.content }, annotations: SWEEP.of(true) });
				// Put the cursor back on the same line, wherever it moved to.
				const newDoc = this.view.state.doc;
				const lineFrom = locateLine(newDoc, cursorLine.text);
				const next = lineFrom !== null ? Math.min(lineFrom + column, newDoc.lineAt(lineFrom).to) : Math.min(head, newDoc.length);
				this.view.dispatch({ selection: { anchor: next }, annotations: SWEEP.of(true) });
			}
		});
	}
}

/**
 * Whether an edit checked off a top-level task. Only changed ranges that keep
 * the same number of lines count (a checkbox click), so lines merely moving
 * around never do.
 */
function hasCompletionToggle(changes: ChangeSet, oldDoc: Text, newDoc: Text): boolean {
	let found = false;
	changes.iterChangedRanges((fromA, toA, fromB, toB) => {
		if (found) return;
		const oldFirst = oldDoc.lineAt(fromA).number;
		const oldLast = oldDoc.lineAt(toA).number;
		const newFirst = newDoc.lineAt(fromB).number;
		const newLast = newDoc.lineAt(toB).number;
		if (oldLast - oldFirst !== newLast - newFirst) return;
		for (let offset = 0; offset <= oldLast - oldFirst; offset++) {
			if (isCompletionToggle(oldDoc.line(oldFirst + offset).text, newDoc.line(newFirst + offset).text)) {
				found = true;
				return;
			}
		}
	});
	return found;
}

/** The start of the one line matching `text` (ignoring an added date or block id), or null. */
function locateLine(doc: Text, text: string): number | null {
	const target = signature(text);
	if (!target) return null;
	let match: number | null = null;
	for (let n = 1; n <= doc.lines; n++) {
		const line = doc.line(n);
		if (signature(line.text) !== target) continue;
		if (match !== null) return null;
		match = line.from;
	}
	return match;
}

function signature(text: string): string {
	let result = text.trimEnd();
	const blockId = result.match(BLOCK_ID_PATTERN);
	if (blockId) result = result.slice(0, -blockId[0].length);
	const date = result.match(COMPLETION_DATE_PATTERN);
	if (date) result = result.slice(0, -date[0].length);
	return result;
}
