import { Plugin, TFile, Notice } from 'obsidian';
import { exec } from 'child_process';

/**
 * Preview Opener Plugin
 *
 * Double-click images and PDFs to open them in macOS Preview.app
 */
export default class PreviewOpenerPlugin extends Plugin {

	async onload() {
		console.log('Preview Opener: Loading plugin');

		// Register double-click handler for images and PDFs
		this.registerDomEvent(document, 'dblclick', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;

			// Handle images (both internal and external)
			if (target.tagName === 'IMG') {
				evt.preventDefault();
				evt.stopPropagation();
				this.handleImageDoubleClick(target as HTMLImageElement);
				return;
			}

			// Handle PDF embeds - check if we clicked inside a PDF container
			const pdfEmbed = target.closest('.pdf-embed, .internal-embed[src$=".pdf"]');
			if (pdfEmbed) {
				evt.preventDefault();
				evt.stopPropagation();
				this.handlePdfDoubleClick(pdfEmbed as HTMLElement);
				return;
			}
		});

		// Add command to open current file's images in Preview
		this.addCommand({
			id: 'open-image-in-preview',
			name: 'Open image under cursor in Preview',
			callback: () => {
				new Notice('Double-click an image to open it in Preview');
			}
		});

		console.log('Preview Opener: Plugin loaded successfully');
	}

	/**
	 * Handle double-click on an image element
	 */
	private handleImageDoubleClick(img: HTMLImageElement) {
		const src = img.src;

		if (!src) {
			new Notice('Could not determine image path');
			return;
		}

		// Handle different URL schemes
		let filePath: string | null = null;

		if (src.startsWith('app://')) {
			// Obsidian internal URL - extract the path
			// Format: app://local/path/to/file.png or app://obsidian.md/path
			filePath = this.resolveAppUrl(src);
		} else if (src.startsWith('file://')) {
			// Direct file URL
			filePath = decodeURIComponent(src.replace('file://', ''));
		} else if (src.startsWith('http://') || src.startsWith('https://')) {
			// External URL - can't open in Preview directly
			new Notice('External images cannot be opened in Preview. Try downloading first.');
			return;
		} else {
			// Relative path or other - try to resolve
			filePath = this.resolveRelativePath(src);
		}

		if (filePath) {
			this.openInPreview(filePath);
		} else {
			new Notice('Could not resolve image path');
		}
	}

	/**
	 * Handle double-click on a PDF embed
	 */
	private handlePdfDoubleClick(pdfEmbed: HTMLElement) {
		// Try to get the file path from the embed
		const src = pdfEmbed.getAttribute('src');

		if (!src) {
			// Try getting from data attributes or nested elements
			const iframe = pdfEmbed.querySelector('iframe');
			if (iframe && iframe.src) {
				this.handleImageDoubleClick({ src: iframe.src } as HTMLImageElement);
				return;
			}
			new Notice('Could not determine PDF path');
			return;
		}

		// Resolve the path
		const file = this.app.vault.getAbstractFileByPath(src);
		if (file instanceof TFile) {
			const adapter = this.app.vault.adapter as any;
			if (adapter.getFullPath) {
				const fullPath = adapter.getFullPath(file.path);
				this.openInPreview(fullPath);
			} else {
				// Fallback: construct path manually
				const vaultPath = (this.app.vault.adapter as any).basePath;
				if (vaultPath) {
					this.openInPreview(`${vaultPath}/${file.path}`);
				} else {
					new Notice('Could not resolve PDF path');
				}
			}
		} else {
			new Notice(`PDF not found: ${src}`);
		}
	}

	/**
	 * Resolve Obsidian's app:// URL to a file path
	 */
	private resolveAppUrl(appUrl: string): string | null {
		try {
			// app:// URLs encode the file path
			// Format varies: app://local/... or app://obsidian.md/...
			const url = new URL(appUrl);
			let path = decodeURIComponent(url.pathname);

			// Remove leading slash on macOS paths
			if (path.startsWith('/') && path.charAt(2) === ':') {
				// Windows path like /C:/...
				path = path.substring(1);
			}

			return path;
		} catch (e) {
			console.error('Preview Opener: Failed to parse app URL', e);
			return null;
		}
	}

	/**
	 * Resolve a relative path to absolute using the vault path
	 */
	private resolveRelativePath(relativePath: string): string | null {
		try {
			const adapter = this.app.vault.adapter as any;
			const vaultPath = adapter.basePath;

			if (vaultPath) {
				// Clean up the path
				const cleanPath = relativePath.replace(/^\.\//, '');
				return `${vaultPath}/${cleanPath}`;
			}
			return null;
		} catch (e) {
			console.error('Preview Opener: Failed to resolve relative path', e);
			return null;
		}
	}

	/**
	 * Open a file in macOS Preview.app
	 */
	private openInPreview(filePath: string) {
		console.log('Preview Opener: Opening file:', filePath);

		// Escape special characters in the path
		const escapedPath = filePath.replace(/"/g, '\\"');

		// Use macOS open command with Preview.app
		exec(`open -a Preview "${escapedPath}"`, (error: Error | null) => {
			if (error) {
				console.error('Preview Opener: Failed to open file', error);
				new Notice(`Failed to open in Preview: ${error.message}`);
				return;
			}
			console.log('Preview Opener: File opened successfully');
		});
	}

	onunload() {
		console.log('Preview Opener: Unloading plugin');
	}
}
