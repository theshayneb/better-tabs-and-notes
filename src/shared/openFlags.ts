/**
 * Process-wide switches read by the tab behaviour patches. Features that need
 * to open a file in a specific leaf (e.g. the pinned daily note) bump
 * `skipDedupe` around the call so the open isn't redirected to another tab.
 */
export const openFlags = {
	skipDedupe: 0,
};

export async function withoutDedupe<T>(fn: () => Promise<T>): Promise<T> {
	openFlags.skipDedupe++;
	try {
		return await fn();
	} finally {
		openFlags.skipDedupe--;
	}
}
