import { describe, expect, it } from 'vitest';
import {
	addHidden, cleanIds, commandIdOf, describeHidden, matchNames, searchCommands, withoutHidden,
} from '../src/features/hideCommands/hideLogic';

const commands = [
	{ id: 'better-tabs-and-notes:scroll-to-top', name: 'Better Tabs and Notes: Scroll to top' },
	{ id: 'rss:open-dashboard', name: 'RSS Reader: Open dashboard' },
	{ id: 'insights:open-dashboard', name: 'Insights Dashboard: Open dashboard' },
	{ id: 'media:add', name: 'Media Manager: Add a movie, show, game or book…' },
	{ id: 'editor:toggle-bold', name: 'Toggle bold' },
];

describe('hide commands: filtering', () => {
	it('drops hidden commands and search results, keeps everything else', () => {
		const hidden = new Set(['rss:open-dashboard']);
		expect(withoutHidden(commands, hidden).map(c => c.id)).not.toContain('rss:open-dashboard');
		expect(withoutHidden(commands, hidden)).toHaveLength(4);
		const results = commands.map(item => ({ item, match: { score: 0 } }));
		expect(withoutHidden(results, hidden)).toHaveLength(4);
		// Things that aren't commands are left alone.
		expect(withoutHidden([null, 'x', { other: 1 }], hidden)).toHaveLength(3);
		expect(withoutHidden(commands, new Set())).toBe(commands);
	});

	it('reads command IDs from commands and search results', () => {
		expect(commandIdOf({ id: 'a' })).toBe('a');
		expect(commandIdOf({ item: { id: 'b' } })).toBe('b');
		expect(commandIdOf('a')).toBeUndefined();
	});

	it('cleans stored IDs', () => {
		expect(cleanIds(['a', ' a ', '', 3, 'b'])).toEqual(['a', 'b']);
		expect(cleanIds('a')).toEqual([]);
		expect(addHidden(['a'], ['b', 'a'])).toEqual(['a', 'b']);
	});
});

describe('hide commands: pasting names', () => {
	it('matches "Plugin: Command" lines exactly, ignoring case and spacing', () => {
		const result = matchNames([
			'RSS Reader: Open dashboard',
			'  better tabs and notes:   scroll to top ',
			'',
			'Media Manager: Add a movie, show, game or book…',
			'Open dashboard',
			'Media Manager: Add a movie, show, game or book...',
		].join('\n'), commands);
		expect(result.ids).toEqual(['rss:open-dashboard', 'better-tabs-and-notes:scroll-to-top', 'media:add']);
		// A bare name is ambiguous, and "..." is not "…": both reported, not guessed.
		expect(result.notFound).toEqual(['Open dashboard', 'Media Manager: Add a movie, show, game or book...']);
	});

	it('accepts command IDs too', () => {
		expect(matchNames('editor:toggle-bold\r\nnope:id', commands)).toEqual({ ids: ['editor:toggle-bold'], notFound: ['nope:id'] });
	});
});

describe('hide commands: settings lists', () => {
	it('searches names and IDs with every word, sorted, by filter', () => {
		const hidden = new Set(['rss:open-dashboard']);
		expect(searchCommands(commands, 'dashboard open', hidden, 'all').map(c => c.id))
			.toEqual(['insights:open-dashboard', 'rss:open-dashboard']);
		expect(searchCommands(commands, 'dashboard', hidden, 'hidden').map(c => c.id)).toEqual(['rss:open-dashboard']);
		expect(searchCommands(commands, 'dashboard', hidden, 'visible').map(c => c.id)).toEqual(['insights:open-dashboard']);
		expect(searchCommands(commands, 'editor:', hidden, 'all').map(c => c.id)).toEqual(['editor:toggle-bold']);
		expect(searchCommands(commands, '', hidden, 'all')).toHaveLength(5);
	});

	it('lists hidden commands by name, with ones not loaded last', () => {
		expect(describeHidden(['gone:cmd', 'rss:open-dashboard', 'better-tabs-and-notes:scroll-to-top'], commands)).toEqual([
			{ id: 'better-tabs-and-notes:scroll-to-top', name: 'Better Tabs and Notes: Scroll to top' },
			{ id: 'rss:open-dashboard', name: 'RSS Reader: Open dashboard' },
			{ id: 'gone:cmd', name: null },
		]);
	});
});
