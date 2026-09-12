// The calendar PDF, parsed once for whoever asks. Three pages want it now (the
// calendar itself and both attendance calculators), so the glob, the fetch and
// the cache live here rather than being copied into each +page.server.ts.

import { error } from '@sveltejs/kit';
import type { AcademicCalendar } from './academicCalendar';
import { extractPdf, parseAcademicCalendar } from './academicCalendar';

// Whatever calendar PDF is sitting in src/lib/data — drop a newer one in and
// it is picked up on the next build, no conversion step in between.
const pdfUrl = Object.entries(
	import.meta.glob('$lib/data/*calendar*.pdf', { query: '?url', import: 'default', eager: true })
).sort(([a], [b]) => b.localeCompare(a))[0]?.[1] as string | undefined;

// Parsing is pure work over a file that cannot change between requests.
let cached: Promise<AcademicCalendar> | null = null;

export function loadCalendar(fetch: typeof globalThis.fetch): Promise<AcademicCalendar> {
	if (cached) return cached;
	if (!pdfUrl) throw error(404, 'No academic calendar PDF found in src/lib/data/');

	cached = (async () => {
		const response = await fetch(pdfUrl);
		if (!response.ok) throw error(500, `Could not read the calendar PDF: ${response.statusText}`);
		const { items, fills } = await extractPdf(new Uint8Array(await response.arrayBuffer()));
		return parseAcademicCalendar(items, fills);
	})();
	cached.catch(() => (cached = null));
	return cached;
}
