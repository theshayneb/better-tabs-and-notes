// Rename a tag, or merge it into another, in every note.
// Based on Tag Wrangler by PJ Eby (ISC); see NOTICE.md.

import { Menu, Modal, Notice, Setting, TFile, getAllTags, type App, type Command } from 'obsidian';
import { Feature } from '../../feature';
import { confirm } from '../../shared/confirm';
import { TagPickerModal } from '../pinnedIcons/modals';
import {
	findMerges, frontmatterHasTag, isAffected, isTagsKey, normalizeTagName, renameInFrontmatter, renameInText, tagNameProblem,
} from './tagLogic';

/** Tag name elements in the Tags view, across Obsidian versions. */
const TAG_PANE_TEXT = '.tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text';

interface Target {
	file: TFile;
	positions: { tag: string; start: number; end: number }[];
	inFrontmatter: boolean;
}

export class TagRenameFeature extends Feature {
	readonly id = 'tagRename';
	readonly name = 'Tag renaming';

	override onload(): void {
		// Tags view.
		this.registerDomEvent(document, 'contextmenu', evt => {
			const tagEl = (evt.target as HTMLElement | null)?.closest?.('.tag-pane-tag');
			const name = tagEl?.querySelector(TAG_PANE_TEXT)?.textContent;
			if (name) this.addMenuItems(Menu.forEvent(evt), name);
		}, { capture: true });

		// Tags in reading view.
		this.registerDomEvent(document, 'contextmenu', evt => {
			const link = (evt.target as HTMLElement | null)?.closest?.('a.tag');
			const href = link?.getAttribute('href');
			if (href?.startsWith('#')) this.addMenuItems(Menu.forEvent(evt), href);
		});

		// Tags in the editor.
		this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
			const token = editor.getClickableTokenAt?.(editor.getCursor());
			if (token?.type === 'tag') this.addMenuItems(menu, token.text);
		}));
	}

	override commands(): Command[] {
		return [
			{
				id: 'rename-tag',
				name: 'Rename a tag',
				icon: 'tag',
				callback: () => new TagPickerModal(this.app, tag => this.openRename(tag)).open(),
			},
			{
				id: 'merge-tag',
				name: 'Merge a tag into another',
				icon: 'merge',
				callback: () => new TagPickerModal(this.app, tag => this.openMerge(tag)).open(),
			},
		];
	}

	private addMenuItems(menu: Menu, rawName: string): void {
		const name = normalizeTagName(rawName);
		if (!name) return;
		menu.addItem(item => item
			.setSection('action')
			.setIcon('pencil')
			.setTitle(`Rename #${name}`)
			.onClick(() => this.openRename(name)));
		menu.addItem(item => item
			.setSection('action')
			.setIcon('merge')
			.setTitle(`Merge #${name} into another tag`)
			.onClick(() => this.openMerge(name)));
	}

	/** Every tag in the vault, without "#", one spelling per tag. */
	allTags(): string[] {
		const tags = new Map<string, string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			for (const tag of cache ? getAllTags(cache) ?? [] : []) {
				const name = tag.replace(/^#/, '');
				if (!tags.has(name.toLowerCase())) tags.set(name.toLowerCase(), name);
			}
		}
		return [...tags.values()];
	}

	/** Notes that use the tag or one of its subtags. */
	findTargets(from: string): Target[] {
		const targets: Target[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;
			const positions = (cache.tags ?? [])
				.filter(t => isAffected(t.tag.replace(/^#/, ''), from))
				.map(t => ({ tag: t.tag, start: t.position.start.offset, end: t.position.end.offset }));
			const fm = cache.frontmatter ?? {};
			const inFrontmatter = Object.keys(fm).some(key => isTagsKey(key) && frontmatterHasTag(fm[key], from));
			if (positions.length || inFrontmatter) targets.push({ file, positions, inFrontmatter });
		}
		return targets;
	}

	openRename(from: string): void {
		new RenameTagModal(this.app, this, from).open();
	}

	openMerge(from: string): void {
		const picker = new TagPickerModal(this.app, into => void this.confirmAndRename(from, into, true),
			tag => !isAffected(tag, from));
		picker.setPlaceholder(`Merge #${from} into...`);
		picker.open();
	}

	/** Ask for confirmation, then rename. Returns false if cancelled. */
	async confirmAndRename(from: string, to: string, merging: boolean): Promise<boolean> {
		const targets = this.findTargets(from);
		if (targets.length === 0) {
			new Notice(`No notes use #${from}.`);
			return false;
		}
		const merges = findMerges(this.allTags(), from, to);
		const notes = `${targets.length} note${targets.length === 1 ? '' : 's'}`;
		const message = merging || merges.length
			? `Merge #${from} (and its subtags) into #${to} in ${notes}? Afterwards they can't be told apart, and this can't be undone.`
			: `Rename #${from} (and its subtags) to #${to} in ${notes}? This can't be undone.`;
		if (!await confirm(this.app, message, merging || merges.length ? 'Merge' : 'Rename')) return false;
		await this.rename(targets, from, to);
		return true;
	}

	private async rename(targets: Target[], from: string, to: string): Promise<void> {
		const progress = new Notice(`Renaming #${from}...`, 0);
		let changed = 0;
		const failed: string[] = [];
		for (const [i, { file, positions, inFrontmatter }] of targets.entries()) {
			try {
				let stale = false;
				if (positions.length) {
					await this.app.vault.process(file, text => {
						const out = renameInText(text, positions, from, to);
						if (out === null) stale = true;
						return out ?? text;
					});
				}
				if (stale) throw new Error('the note changed while renaming');
				if (inFrontmatter) {
					await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
						for (const key of Object.keys(fm)) {
							if (isTagsKey(key)) fm[key] = renameInFrontmatter(fm[key], from, to);
						}
					});
				}
				changed++;
			} catch (e) {
				console.error(`Better Tabs and Notes: couldn't rename #${from} in ${file.path}`, e);
				failed.push(file.path);
			}
			if (i % 10 === 9) progress.setMessage(`Renaming #${from}: ${i + 1} of ${targets.length} notes...`);
		}
		progress.hide();
		new Notice(`Renamed #${from} to #${to} in ${changed} note${changed === 1 ? '' : 's'}.`
			+ (failed.length ? ` Couldn't update ${failed.length}; see the developer console.` : ''), 6000);
	}
}

class RenameTagModal extends Modal {
	constructor(app: App, private feature: TagRenameFeature, private from: string) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		this.setTitle(`Rename #${this.from}`);
		const count = this.feature.findTargets(this.from).length;
		contentEl.createEl('p', {
			cls: 'btn-muted',
			text: `Used in ${count} note${count === 1 ? '' : 's'}. Subtags are renamed too. Type an existing tag to merge into it.`,
		});

		const allTags = this.feature.allTags();
		const datalistId = `btn-tag-names-${Math.random().toString(36).slice(2)}`;
		const datalist = contentEl.createEl('datalist', { attr: { id: datalistId } });
		for (const tag of allTags.filter(t => !isAffected(t, this.from)).sort()) {
			datalist.createEl('option', { attr: { value: tag } });
		}

		const input = contentEl.createEl('input', { type: 'text', cls: 'btn-tag-rename-input', attr: { list: datalistId } });
		input.value = this.from;
		const hint = contentEl.createEl('p', { cls: 'btn-tag-rename-hint' });

		let button!: HTMLButtonElement;
		const update = () => {
			const to = normalizeTagName(input.value);
			const problem = to === this.from ? null : tagNameProblem(to);
			const merges = problem ? [] : findMerges(allTags, this.from, to);
			hint.toggleClass('mod-warning', !!problem || merges.length > 0);
			if (problem) hint.setText(problem);
			else if (merges.length) {
				const [old, existing] = merges[0];
				hint.setText(`#${existing} already exists, so #${old} will be merged into it`
					+ (merges.length > 1 ? ` (and ${merges.length - 1} more subtag${merges.length === 2 ? '' : 's'}).` : '.'));
			} else hint.setText('');
			button.setText(merges.length ? 'Merge' : 'Rename');
			button.disabled = !!problem || to === this.from;
		};

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => {
				button = b.buttonEl;
				b.setButtonText('Rename').setCta().onClick(() => void this.submit(input.value));
			});

		input.addEventListener('input', update);
		input.addEventListener('keydown', evt => {
			if (evt.key === 'Enter' && !evt.isComposing && !button.disabled) {
				evt.preventDefault();
				void this.submit(input.value);
			}
		});
		update();
		input.focus();
		input.select();
	}

	private async submit(value: string): Promise<void> {
		const to = normalizeTagName(value);
		if (to === this.from || tagNameProblem(to)) return;
		this.close();
		await this.feature.confirmAndRename(this.from, to, false);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
