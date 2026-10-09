import { describe, expect, it } from 'vitest';
import { OVERRIDES, buildOverride, parseOverride } from '../src/features/tabs/overrides';

describe('getLeaf overrides', () => {
	it('parses plain getLeaf arguments', () => {
		expect(parseOverride(undefined)).toEqual([false, {}]);
		expect(parseOverride(false)).toEqual([false, {}]);
		expect(parseOverride(true)).toEqual(['tab', {}]);
		expect(parseOverride('split')).toEqual(['split', {}]);
	});

	it('round-trips overrides', () => {
		expect(parseOverride(buildOverride('tab', { newTabPlacement: 'end' }))).toEqual(['tab', { newTabPlacement: 'end' }]);
		expect(parseOverride(OVERRIDES.same)).toEqual([false, { openInNewTab: false }]);
	});

	it('survives malformed JSON', () => {
		expect(parseOverride('tab:{oops')).toEqual(['tab', {}]);
	});
});
