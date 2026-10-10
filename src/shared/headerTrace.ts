// Troubleshooting: record what hides buttons in note headers, and describe a header.

import { MarkdownView, Notice, type App, type Plugin } from 'obsidian';

interface HideRecord {
	time: string;
	label: string;
	how: string;
	stack: string;
}

const MAX_RECORDS = 15;
const records: HideRecord[] = [];

function record(el: Element, how: string): void {
	if (!(el instanceof HTMLElement) || !el.matches('.view-header .view-action')) return;
	const stack = (new Error().stack ?? '')
		.split('\n')
		.slice(2, 9)
		.map(line => line.trim())
		.join('\n    ');
	records.push({ time: new Date().toLocaleTimeString(), label: el.getAttribute('aria-label') ?? '', how, stack });
	if (records.length > MAX_RECORDS) records.shift();
}

type HideFn = (this: HTMLElement, ...args: unknown[]) => unknown;

/**
 * Wrap the DOM helpers Obsidian and plugins use to hide elements, so that
 * hiding a note header button records who did it. Returns a cleanup function.
 */
export function startHeaderTrace(): () => void {
	const proto = HTMLElement.prototype as unknown as Record<string, HideFn>;
	const originals: [string, HideFn][] = [];
	const wrap = (name: string, isHide: (args: unknown[]) => boolean) => {
		const original = proto[name];
		if (typeof original !== 'function') return;
		originals.push([name, original]);
		proto[name] = function (this: HTMLElement, ...args: unknown[]) {
			if (isHide(args)) record(this, `${name}(${args.map(a => JSON.stringify(a)).join(', ')})`);
			return original.apply(this, args);
		};
	};
	wrap('hide', () => true);
	wrap('toggle', args => args[0] === false);
	wrap('toggleVisibility', args => args[0] === false);

	// Direct style.display = 'none'.
	const styleObserver = new MutationObserver(mutations => {
		for (const m of mutations) {
			const el = m.target;
			if (el instanceof HTMLElement && el.style.display === 'none') record(el, 'style display:none (set directly)');
		}
	});
	styleObserver.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });

	return () => {
		styleObserver.disconnect();
		for (const [name, original] of originals) proto[name] = original;
	};
}

/** Copy a description of the active note's header buttons, plus recorded hides. */
export async function copyHeaderReport(app: App, plugin: Plugin, extra: string[]): Promise<void> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice('Open a note first.');
		return;
	}
	const header = view.containerEl.querySelector<HTMLElement>('.view-header');
	const actions = view.containerEl.querySelector<HTMLElement>('.view-header .view-actions');
	const lines = [
		`Better Tabs and Notes ${plugin.manifest.version}`,
		...extra,
		`Phone: ${document.body.hasClass('is-phone')}, mobile: ${document.body.hasClass('is-mobile')}`,
		`Header width: ${header?.clientWidth ?? '?'}px, buttons area: ${actions?.clientWidth ?? '?'}px visible of ${actions?.scrollWidth ?? '?'}px`,
		'Buttons, left to right:',
	];
	for (const el of Array.from(actions?.children ?? []) as HTMLElement[]) {
		const style = window.getComputedStyle(el);
		const hidden = style.display === 'none' || style.visibility === 'hidden';
		const inline = el.getAttribute('style');
		lines.push(`- "${el.getAttribute('aria-label') ?? ''}" [${Array.from(el.classList).join(' ')}]`
			+ `${hidden ? ` HIDDEN (display ${style.display}, visibility ${style.visibility})` : ''}`
			+ `${inline ? ` style="${inline}"` : ''} width ${el.offsetWidth}px`);
	}
	lines.push('', records.length ? 'Header buttons hidden since Obsidian started (newest last):' : 'No header button was hidden by code since Obsidian started.');
	for (const r of records) lines.push(`- ${r.time} "${r.label}" by ${r.how}\n    ${r.stack}`);

	const report = lines.join('\n');
	try {
		await navigator.clipboard.writeText(report);
		new Notice('Copied the note header buttons. Paste them into your message.');
	} catch {
		console.warn(report);
		new Notice('Couldn\'t copy. The list is in the developer console.');
	}
}
