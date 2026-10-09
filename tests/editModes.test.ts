import { describe, expect, it } from 'vitest';
import { modeCycle, nextMode } from '../src/features/editMode/modes';

describe('edit mode cycle', () => {
	const base = { includeReadingMode: false, order: ['live', 'source', 'preview'] as const };

	it('toggles live preview and source mode by default', () => {
		const s = { ...base, order: [...base.order] };
		expect(modeCycle(s)).toEqual(['live', 'source']);
		expect(nextMode('live', s)).toBe('source');
		expect(nextMode('source', s)).toBe('live');
		expect(nextMode('preview', s)).toBe('preview');
	});

	it('follows the configured order when reading view is included', () => {
		const s = { includeReadingMode: true, order: ['preview' as const, 'live' as const, 'source' as const] };
		expect(nextMode('preview', s)).toBe('live');
		expect(nextMode('source', s)).toBe('preview');
	});

	it('repairs incomplete or duplicated orders', () => {
		const s = { includeReadingMode: true, order: ['source' as const, 'source' as const] };
		expect(modeCycle(s)).toEqual(['source', 'live', 'preview']);
	});
});
