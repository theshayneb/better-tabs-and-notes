// eslint-disable-next-line no-restricted-imports -- type only; the value comes from Obsidian
import type { Moment } from 'moment';

export interface DailyNoteConfig {
	folder: string;
	format: string;
	template: string;
}

export const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD';

type MomentFactory = (input?: string, format?: string, strict?: boolean) => Moment;

function cleanFolder(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, '');
}

export function normalizeConfig(raw: Partial<DailyNoteConfig> | undefined): DailyNoteConfig {
	return {
		folder: cleanFolder(raw?.folder ?? ''),
		format: raw?.format?.trim() || DEFAULT_DAILY_FORMAT,
		template: raw?.template?.trim() ?? '',
	};
}

/** Vault path of the daily note for `date`. */
export function dailyNotePath(config: DailyNoteConfig, date: Moment): string {
	const name = date.format(config.format);
	return `${config.folder ? `${config.folder}/` : ''}${name}.md`;
}

/** Whether `path` is a daily note under `config` (any date). */
export function isDailyNotePath(config: DailyNoteConfig, path: string | undefined, moment: MomentFactory): boolean {
	if (!path?.endsWith('.md')) return false;
	const prefix = config.folder ? `${config.folder}/` : '';
	if (prefix && !path.startsWith(prefix)) return false;
	const name = path.slice(prefix.length, -'.md'.length);
	return moment(name, config.format, true).isValid();
}

/**
 * Fill a daily note template the way the core Daily notes plugin does:
 * {{title}}, {{date}}, {{time}}, and {{date:FORMAT}} / {{time:FORMAT}}, with
 * optional +/- offsets like {{date+1d:YYYY-MM-DD}}.
 */
export function applyTemplate(template: string, title: string, date: Moment, dateFormat: string): string {
	return template
		.replace(/{{\s*title\s*}}/gi, title)
		.replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_m, kind: string, _offset, amount?: string, unit?: string, format?: string) => {
			const shifted = date.clone();
			if (amount && unit) shifted.add(parseInt(amount, 10), unit as 'd');
			const fallback = kind.toLowerCase() === 'time' ? 'HH:mm' : dateFormat;
			return shifted.format(format ? format.slice(1).trim() : fallback);
		});
}
