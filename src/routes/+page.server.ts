import type { PageServerLoad } from './$types';
import { loadCalendar } from '$lib/server/calendarSource';
import { semesterFrom } from '$lib/semester';

// Same build-time parse the academic calendar page does; the home page only
// wants the teaching days off it, for the "days left" tile.
export const prerender = true;

export const load: PageServerLoad = async ({ fetch }) => ({
	semester: semesterFrom((await loadCalendar(fetch)).days)
});
