import { Modal, Setting, type App } from 'obsidian';

/** Ask before changing many notes. */
export function confirm(app: App, message: string, action: string): Promise<boolean> {
	return new Promise(resolve => {
		const modal = new Modal(app);
		let done = false;
		modal.setTitle('Are you sure?');
		modal.contentEl.createEl('p', { text: message });
		new Setting(modal.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => modal.close()))
			.addButton(b => b.setButtonText(action).setWarning().onClick(() => {
				done = true;
				resolve(true);
				modal.close();
			}));
		modal.onClose = () => {
			if (!done) resolve(false);
		};
		modal.open();
	});
}
