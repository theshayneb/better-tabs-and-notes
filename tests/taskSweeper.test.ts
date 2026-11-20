import { describe, expect, it } from 'vitest';
import {
	addIncludedFile, isCompletionToggle, isInScope, parsePathList, sweepCompletedTasks, today,
} from '../src/features/taskSweeper/sweepLogic';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';
import { applyLog, diffSettings, mergeLogs } from '../src/shared/editLog';

const DAY = '2026-11-20';
const sweep = (note: string) => sweepCompletedTasks(note, DAY);

describe('task sweeper: sweeping', () => {
	it('moves completed tasks under a dated Done section at the bottom (the README example)', () => {
		const result = sweep('## Groceries\n\n- [ ] Oat milk\n- [x] Coffee beans\n- [ ] Bread\n- [x] Rice\n');
		expect(result.content).toBe('## Groceries\n\n- [ ] Oat milk\n- [ ] Bread\n\n## Done\n\n- [x] Coffee beans (2026-11-20)\n- [x] Rice (2026-11-20)\n');
		expect(result.movedCount).toBe(2);
		// Running it again changes nothing.
		const again = sweep(result.content);
		expect(again.didChange).toBe(false);
		expect(again.totalCompletedCount).toBe(2);
	});

	it('moves a completed task with all its subtasks; a done subtask under an open task stays', () => {
		const note = '- [x] Parent\n  - [ ] Open child\n  Some notes\n- [ ] Open parent\n  - [x] Done child\n';
		expect(sweep(note).content).toBe('- [ ] Open parent\n  - [x] Done child\n\n## Done\n\n- [x] Parent (2026-11-20)\n  - [ ] Open child\n  Some notes\n');
	});

	it('adds new tasks before ones already in Done, keeps what else is written there, and keeps dates and block ids', () => {
		const note = '- [X] New ^abc1\n- [x] Dated (2026-01-02)\n\n## Done\n\nKept text\n\n- [x] Old (2026-01-01)\n';
		expect(sweep(note).content).toBe('## Done\n\nKept text\n\n- [X] New (2026-11-20) ^abc1\n- [x] Dated (2026-01-02)\n- [x] Old (2026-01-01)\n');
	});

	it('leaves a Done heading followed by other sections alone and makes a new one', () => {
		const note = '## Done\n\n- [ ] a\n\n## Later\n\n- [x] b\n';
		expect(sweep(note).content).toBe('## Done\n\n- [ ] a\n\n## Later\n\n## Done\n\n- [x] b (2026-11-20)\n');
	});

	it('only sweeps [x] top-level bullet tasks, never frontmatter, other statuses or numbered tasks', () => {
		const note = '---\ntags: [a]\n- [x] not a task\n---\n- [-] cancelled\n- [/] doing\n1. [x] numbered\n  - [x] indented\n';
		const result = sweep(note);
		expect(result.didChange).toBe(false);
		expect(result.totalCompletedCount).toBe(0);
	});

	it('keeps Windows line endings', () => {
		expect(sweep('- [x] a\r\n- [ ] b\r\n').content).toBe('- [ ] b\r\n\r\n## Done\r\n\r\n- [x] a (2026-11-20)\r\n');
	});

	// The original plugin's tests.
	it('leaves notes with an unclosed code fence untouched', () => {
		for (const note of [
			'- [x] Finished task\n\n```text\nunfinished example',
			'- [x] Finished task\r\n\r\n## Done\r\n\r\n~~~text\r\n```\r\n- [x] Example\r\n',
		]) {
			const result = sweep(note);
			expect(result).toEqual({ content: note, didChange: false, movedCount: 0, totalCompletedCount: 0, skippedReason: 'unclosed-code-fence' });
		}
	});

	it('sweeps a completed task and its subtasks past a closed code fence', () => {
		const result = sweep('- [x] Finished task (2026-11-19)\n  - [ ] Subtask\n\n```text\n- [x] Example\n```\n');
		expect(result.movedCount).toBe(1);
		expect(result.skippedReason).toBeUndefined();
		expect(result.content).toBe('```text\n- [x] Example\n```\n\n## Done\n\n- [x] Finished task (2026-11-19)\n  - [ ] Subtask\n');
	});

	it('treats a line of inline backticks as ordinary note content', () => {
		const result = sweep('- [x] Finished task (2026-11-19)\n\n```inline code```\n');
		expect(result.movedCount).toBe(1);
		expect(result.content).toBe('```inline code```\n\n## Done\n\n- [x] Finished task (2026-11-19)\n');
	});

	it('spots a task being checked off', () => {
		expect(isCompletionToggle('- [ ] a', '- [x] a')).toBe(true);
		expect(isCompletionToggle('  - [ ] a', '  - [x] a')).toBe(false);
		expect(isCompletionToggle('- [x] a', '- [x] ab')).toBe(false);
		expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('task sweeper: scope', () => {
	const settings = { scope: 'selective' as const, includedFiles: ['To do.md'], includedFolders: ['Projects'] };

	it('sweeps every note, or only the listed files and folders', () => {
		expect(isInScope('Anything.md', { ...settings, scope: 'global' })).toBe(true);
		expect(isInScope('To do.md', settings)).toBe(true);
		expect(isInScope('Projects/Sub/A.md', settings)).toBe(true);
		expect(isInScope('Projects 2/A.md', settings)).toBe(false);
		expect(isInScope('Other.md', settings)).toBe(false);
	});

	it('adds a file unless a file or folder already covers it', () => {
		expect(addIncludedFile(settings, 'Other.md')).toEqual(['To do.md', 'Other.md']);
		expect(addIncludedFile(settings, 'Projects/A.md')).toBeNull();
		expect(addIncludedFile(settings, 'To do.md')).toBeNull();
	});

	it('cleans typed path lists', () => {
		expect(parsePathList(' /Projects/ \n\nA\\B.md\nProjects\n')).toEqual(['Projects', 'A/B.md']);
	});

	it('merges files added on two devices by edit time', () => {
		const start = mergeSettings(structuredClone(DEFAULT_SETTINGS));
		const desktop = structuredClone(start);
		desktop.taskSweeper.includedFiles.push('A.md');
		const phone = structuredClone(start);
		phone.taskSweeper.includedFiles.push('B.md');
		const log = mergeLogs(
			diffSettings(start as never, desktop as never, 100),
			diffSettings(start as never, phone as never, 200),
		);
		// Sync hands the desktop the phone's copy; the log puts the desktop's file back.
		const merged = mergeSettings(phone);
		applyLog(merged as never, log);
		expect(merged.taskSweeper.includedFiles).toEqual(['B.md', 'A.md']);
	});
});
