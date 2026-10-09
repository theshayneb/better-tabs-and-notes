import { moment as obsidianMoment } from 'obsidian';
// eslint-disable-next-line no-restricted-imports -- type only; the value comes from Obsidian
import type { Moment } from 'moment';

/** Obsidian's bundled moment, typed as the callable it is. */
export const moment = obsidianMoment as unknown as (input?: string, format?: string, strict?: boolean) => Moment;
export type { Moment };
