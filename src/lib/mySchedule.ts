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
 *
 * A course code has one row per meeting (BIO1004-LEC1 is Tue 4:20 *and* Thu
 * 2:10), so deduping is by code to decide what's in your plan; every row of a
 * kept code then comes through, or half your week goes missing.
 */
export function myCourses(all: Course[], plan: SavedPlan): Course[] {
	const byCode = new Map<string, Course[]>();
	for (const c of all) {
		const rows = byCode.get(c.courseCode);
		if (rows) rows.push(c);
		else byCode.set(c.courseCode, [c]);
	}

	const batches = plan.batches.map((b) => b.toUpperCase().trim()).filter(Boolean);
	const mine = batches.length
		? all.filter((c) => offeredTo(c, batches) && !isMajorElective(c))
		: [];

	const codes = new Set([...mine, ...plan.selected].map((c) => c.courseCode));

	const out: Course[] = [];
	for (const code of codes) {
		if (plan.excluded.has(code)) continue;
		out.push(...(byCode.get(plan.swapped.get(code) ?? code) ?? []));
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
