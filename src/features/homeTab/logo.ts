import { setIcon, type App } from 'obsidian';
import type { HomeTabSettings } from '../../settings';

/** The classic Obsidian crystal, built as SVG elements (no innerHTML). */
function renderObsidianLogo(el: HTMLElement): void {
	const svg = el.createSvg('svg', { attr: { viewBox: '0 0 65 100', class: 'btn-home-logo-svg' } });
	const gradientId = `btn-home-gradient-${Math.random().toString(36).slice(2)}`;
	const defs = svg.createSvg('defs');
	const gradient = defs.createSvg('linearGradient', {
		attr: {
			id: gradientId, x1: '82.85', y1: '30.41', x2: '51.26', y2: '105.9',
			gradientTransform: 'matrix(1, 0, 0, -1, -22.41, 110.97)', gradientUnits: 'userSpaceOnUse',
		},
	});
	gradient.createSvg('stop', { attr: { offset: '0', 'stop-color': '#6c56cc' } });
	gradient.createSvg('stop', { attr: { offset: '1', 'stop-color': '#9785e5' } });

	const polygons: [string, string][] = [
		['44.61 0 12.91 17.52 0 45.45 19.57 90.47 47.35 100 52.44 89.8 63 26.39 44.61 0', '#34208c'],
		['63 26.39 43.44 14.41 16.43 35.7 47.35 100 52.44 89.8 63 26.39', `url(#${gradientId})`],
		['63 26.39 63 26.39 44.61 0 43.44 14.41 63 26.39', '#af9ff4'],
		['43.44 14.41 44.61 0 12.91 17.52 16.43 35.7 43.44 14.41', '#4a37a0'],
		['16.43 35.7 19.57 90.47 47.35 100 16.43 35.7', '#4a37a0'],
	];
	for (const [points, fill] of polygons) svg.createSvg('polygon', { attr: { points, fill } });
}

export function renderLogo(el: HTMLElement, settings: HomeTabSettings, app: App): void {
	switch (settings.logoType) {
		case 'obsidian':
			renderObsidianLogo(el);
			break;
		case 'icon': {
			setIcon(el, settings.logoIcon || 'home');
			const color = settings.logoColorType === 'accent'
				? 'var(--interactive-accent)'
				: settings.logoColorType === 'custom' ? settings.logoColor : '';
			el.setCssProps({ color });
			break;
		}
		case 'imagePath': {
			const file = app.vault.getFileByPath(settings.logoImagePath);
			if (file) el.createEl('img', { attr: { src: app.vault.getResourcePath(file), alt: '' } });
			break;
		}
		case 'imageLink':
			if (settings.logoImageLink) el.createEl('img', { attr: { src: settings.logoImageLink, alt: '' } });
			break;
		case 'none':
			break;
	}
}
