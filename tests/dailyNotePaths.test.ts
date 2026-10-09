import moment from 'moment';
import { describe, expect, it } from 'vitest';
import { applyTemplate, dailyNotePath, isDailyNotePath, normalizeConfig } from '../src/features/dailyNote/dailyNotePaths';

const date = moment('2024-03-05 14:30', 'YYYY-MM-DD HH:mm');

describe('daily note paths', () => {
	it('normalizes the config', () => {
		expect(normalizeConfig(undefined)).toEqual({ folder: '', format: 'YYYY-MM-DD', template: '' });
		expect(normalizeConfig({ folder: '/Journal/', format: ' ', template: ' t ' })).toEqual({ folder: 'Journal', format: 'YYYY-MM-DD', template: 't' });
	});

	it('builds the path for a date', () => {
		expect(dailyNotePath(normalizeConfig({}), date)).toBe('2024-03-05.md');
		expect(dailyNotePath(normalizeConfig({ folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' }), date)).toBe('Journal/2024/03/2024-03-05.md');
	});

	it('recognises daily notes', () => {
		const config = normalizeConfig({ folder: 'Journal' });
		expect(isDailyNotePath(config, 'Journal/2024-03-05.md', moment)).toBe(true);
		expect(isDailyNotePath(config, 'Journal/Ideas.md', moment)).toBe(false);
		expect(isDailyNotePath(config, '2024-03-05.md', moment)).toBe(false);
		expect(isDailyNotePath(config, 'Journal/2024-03-05.canvas', moment)).toBe(false);
		const nested = normalizeConfig({ format: 'YYYY/MM/YYYY-MM-DD' });
		expect(isDailyNotePath(nested, '2024/03/2024-03-05.md', moment)).toBe(true);
	});
});

describe('applyTemplate', () => {
	it('fills title, date and time placeholders', () => {
		const out = applyTemplate('# {{title}}\n{{date}} {{time}}\n{{date:dddd}} {{ date+1d:YYYY-MM-DD }}', '2024-03-05', date, 'YYYY-MM-DD');
		expect(out).toBe('# 2024-03-05\n2024-03-05 14:30\nTuesday 2024-03-06');
	});
});
