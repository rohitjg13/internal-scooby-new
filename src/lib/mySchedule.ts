// The timetable you saved in the planner, read back from localStorage.
// The planner owns these keys; the dashboard only reads them, so the key
// helpers live here and CollisionChecker imports them.

import type { Course } from './types.ts';
import { isMajorElective, offeredTo, parseDays, timeToMinutes, DAYS } from './types.ts';

// Bump only when saved course codes stop meaning anything (a new semester).
export const STORE_VERSION = 'monsoon26r21';
export const key = (name: string) => `scooby_${STORE_VERSION}_${name}`;
export const BATCH_KEY = 'scooby_batches_kept';
export const NOBATCH_KEY = 'scooby_nobatch_kept';

const read = <T>(k: string, fallback: T): T => {
	try {
		const raw = localStorage.getItem(k);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
};

export type SavedPlan = {
	batches: string[];
	selected: Course[];
	swapped: Map<string, string>;
	excluded: Set<string>;
};

export function loadPlan(): SavedPlan {
	if (typeof localStorage === 'undefined')
		return { batches: [], selected: [], swapped: new Map(), excluded: new Set() };
	return {
		batches: read<string[]>(BATCH_KEY, []),
		selected: read<Course[]>(key('selected'), []),
		swapped: new Map(read<[string, string][]>(key('swapped'), [])),
		excluded: new Set(read<string[]>(key('excluded'), []))
	};
}

/**
 * Every class row that is actually yours: your batch's rows plus what you
 * added, with swaps applied and exclusions dropped — the same resolution the
 * planner's calendar does.
 */
export function myCourses(all: Course[], plan: SavedPlan): Course[] {
	const batches = plan.batches.map((b) => b.toUpperCase().trim()).filter(Boolean);
	const mine = batches.length
		? all.filter((c) => offeredTo(c, batches) && !isMajorElective(c))
		: [];
	const codes = new Set(plan.selected.map((c) => c.courseCode));

	const seen = new Set<string>();
	const out: Course[] = [];
	for (const c of [...mine, ...all.filter((c) => codes.has(c.courseCode))]) {
		if (seen.has(c.courseCode)) continue;
		seen.add(c.courseCode);
		if (plan.excluded.has(c.courseCode)) continue;
		const to = plan.swapped.get(c.courseCode);
		out.push((to && all.find((x) => x.courseCode === to)) || c);
	}
	return out;
}

export type ClassSlot = Course & { start: number; end: number };

/** Your classes on one weekday ("Monday"…), earliest first. */
export function classesOn(courses: Course[], day: string): ClassSlot[] {
	return courses
		.filter((c) => c.day && c.startTime && parseDays(c.day).includes(day))
		.map((c) => ({ ...c, start: timeToMinutes(c.startTime!), end: timeToMinutes(c.endTime ?? '') }))
		.sort((a, b) => a.start - b.start);
}

/** Weekday name for a Date, or "" on Sunday — nothing is timetabled then. */
export const dayName = (d = new Date()) => DAYS[d.getDay() - 1] ?? '';

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
