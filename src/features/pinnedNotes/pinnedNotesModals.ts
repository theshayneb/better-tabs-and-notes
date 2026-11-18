// Pickers for pinned notes: the "Open pinned note" picker and the path and icon
// suggestions in the settings. Members use a `pw` prefix so they can't clash
// with Obsidian's own (undocumented) ones.

import { AbstractInputSuggest, FuzzySuggestModal, getIconIds, prepareFuzzySearch, type App, type FuzzyMatch, type TFile } from 'obsidian';
import { DEFAULT_NOTE_ICON, displayTitle, type PinnedNote } from './pinnedNotesLogic';
import { renderNoteIcon } from './pinnedNotesIcons';

const MAX_SUGGESTIONS = 100;

/** Suggests vault files for a path field. */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, private pwInputEl: HTMLInputElement, private pwOnPick: (file: TFile) => void) {
		super(app, pwInputEl);
	}

	protected getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getFiles();
		const trimmed = query.trim();
		if (!trimmed) return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, MAX_SUGGESTIONS);
		const match = prepareFuzzySearch(trimmed);
		return files
			.map(file => ({ file, result: match(file.path) }))
			.filter(entry => entry.result !== null)
			.sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0))
			.slice(0, MAX_SUGGESTIONS)
			.map(entry => entry.file);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.addClass('btn-pn-suggestion');
		el.createSpan({ text: file.extension === 'md' ? file.path.slice(0, -3) : file.path });
		if (file.extension !== 'md') el.createSpan({ cls: 'nav-file-tag', text: file.extension });
	}

	override selectSuggestion(file: TFile): void {
		this.pwInputEl.value = file.path;
		this.pwOnPick(file);
		this.close();
	}
}

/** Suggests icon names, with a preview of each. */
export class IconSuggest extends AbstractInputSuggest<string> {
	private pwIcons: string[] | null = null;

	constructor(app: App, private pwInputEl: HTMLInputElement, private pwOnPick: (icon: string) => void) {
		super(app, pwInputEl);
	}

	protected getSuggestions(query: string): string[] {
		this.pwIcons ??= getIconIds().map(id => id.replace(/^lucide-/, '')).sort();
		const q = query.trim().toLowerCase();
		return this.pwIcons.filter(id => id.includes(q)).slice(0, MAX_SUGGESTIONS);
	}

	renderSuggestion(icon: string, el: HTMLElement): void {
		el.addClass('btn-pn-suggestion');
		renderNoteIcon(el.createSpan({ cls: 'btn-pn-icon-preview' }), icon);
		el.createSpan({ text: icon });
	}

	override selectSuggestion(icon: string): void {
		this.pwInputEl.value = icon;
		this.pwOnPick(icon);
		this.close();
	}
}

/** The "Open pinned note" picker. */
export class PinnedNoteModal extends FuzzySuggestModal<PinnedNote> {
	constructor(app: App, private pwNotes: PinnedNote[], private pwOnChoose: (note: PinnedNote, evt: MouseEvent | KeyboardEvent) => void) {
		super(app);
		this.setPlaceholder('Open a pinned note...');
		this.emptyStateText = 'No pinned notes yet.';
	}

	getItems(): PinnedNote[] {
		return this.pwNotes;
	}

	getItemText(note: PinnedNote): string {
		return displayTitle(note);
	}

	override renderSuggestion(match: FuzzyMatch<PinnedNote>, el: HTMLElement): void {
		el.addClass('btn-pn-suggestion');
		renderNoteIcon(el.createSpan({ cls: 'btn-pn-icon-preview' }), match.item.icon || DEFAULT_NOTE_ICON);
		super.renderSuggestion(match, el.createSpan());
	}

	onChooseItem(note: PinnedNote, evt: MouseEvent | KeyboardEvent): void {
		this.pwOnChoose(note, evt);
	}
}
