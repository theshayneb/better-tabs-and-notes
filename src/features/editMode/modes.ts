import type { EditMode, EditModeSettings } from '../../settings';

const ALL_MODES: EditMode[] = ['live', 'source', 'preview'];

/** The modes the switch cycles through, in the configured order. */
export function modeCycle(settings: Pick<EditModeSettings, 'includeReadingMode' | 'order'>): EditMode[] {
	// Repair stored orders that are missing modes or have duplicates.
	const order = [...new Set([...settings.order.filter(m => ALL_MODES.includes(m)), ...ALL_MODES])];
	return settings.includeReadingMode ? order : order.filter(m => m !== 'preview');
}

/** The mode a click on the switch moves to. Returns `current` if it isn't in the cycle. */
export function nextMode(current: EditMode, settings: Pick<EditModeSettings, 'includeReadingMode' | 'order'>): EditMode {
	const cycle = modeCycle(settings);
	const index = cycle.indexOf(current);
	if (index === -1) return current;
	return cycle[(index + 1) % cycle.length];
}
