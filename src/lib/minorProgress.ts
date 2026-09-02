// The minor documents' shape, and your progress through one.
//
// Lives here rather than in the page because the dashboard's minor widget
// needs the same numbers, and a second copy of this parser would drift from
// the page's within a semester.

import { creditsOf } from './minorCredits.ts';

export type Section = {
	title: string;
	note?: string;
	columns: string[];
	rows: string[][];
};
export type Minor = {
	id: string;
	name: string;
	school: string;
	department: string;
	philosophy?: string;
	why?: string[];
	goals?: string[];
	glance?: string[][];
	sections: Section[];
	notes?: string[];
};
export type Curriculum = {
	id: string;
	label: string;
	subtitle: string;
	minors: Minor[];
};

// --- reading the ragged section shapes ---------------------------------
const COL = {
	code: /code/i,
	name: /course (name|title)|course name & code|elective course|core course/i,
	credits: /credit|^l:t:p$/i,
	prereq: /pre-?requisite/i,
	blurb: /description|detail/i,
	// A bare "Course" column is the title in some tables and the code in
	// others; which one depends on whether a title column exists already.
	plain: /^course$/i,
};

// Row counters and learning-goal cross-references say nothing on a card.
const NOISE = /^(sr\.?|s\.?\s*no\.?|sr\.?\s*no\.?|plgs?( mapping)?)$/i;

const at = (row: string[], i: number) => (i === -1 ? "" : (row[i] ?? ""));

// A section lists courses when it names them; everything else is reference
// data (credit matrices, eligibility rules, semester plans).
export function readCourses(s: Section) {
	const find = (re: RegExp) => s.columns.findIndex((c) => re.test(c));
	let code = find(COL.code);
	let name = find(COL.name);

	const plain = find(COL.plain);
	if (plain !== -1) {
		if (name === -1) name = plain;
		else if (code === -1) code = plain;
	}
	if (name === -1 && code === -1) return null;

	const prereq = find(COL.prereq);
	const blurb = find(COL.blurb);
	// Credits can span two columns ("L:T:P" plus "Credits"); keep both.
	const credits = s.columns
		.map((c, i) => (COL.credits.test(c) ? i : -1))
		.filter((i) => i !== -1);
	const used = new Set([code, name, prereq, blurb, ...credits]);
	const extra = s.columns
		.map((c, i) => ({ label: c, i }))
		.filter(
			({ i, label }) =>
				!used.has(i) && label.trim() !== "" && !NOISE.test(label.trim()),
		);

	// New-curriculum Chemistry uses one "Course Name & Code" column holding
	// "Chemical Principles (CHY1011)". Requiring digits keeps titles like
	// "Building Information Modelling (BIM)" intact.
	const EMBEDDED = /^(.*?)\s*\(([A-Z]{2,4}\s?\d{3,4})\)$/;

	return s.rows.map((row) => {
		let title = at(row, name) || at(row, code);
		let tag = code === name ? "" : at(row, code);
		const split = title.match(EMBEDDED);
		if (split && !tag) {
			title = split[1];
			tag = split[2];
		}
		return {
			heading:
				row.filter(Boolean).length === 1 ? row.find(Boolean) : null,
			code: tag,
			name: title,
			prereq: at(row, prereq),
			blurb: at(row, blurb),
			credits: credits.map((i) => row[i]).filter(Boolean),
			extra: extra
				.map(({ label, i }) => ({ label, value: row[i] }))
				.filter((e) => e.value && e.value !== "—" && e.value !== "-"),
		};
	});
}


// Never trimmed. Several minors state two figures ("22 for an Engineering
// major; 28 for a Non-Engineering major") or qualify the number, and
// cutting at the first bracket turned those into wrong answers.
export const totalCredits = (m: Minor) => {
	const stated = m.glance?.find(([k]) =>
		k.toLowerCase().startsWith("total credits"),
	)?.[1];
	if (stated) return stated;

	const matrix = m.sections.find((s) =>
		s.columns.at(-1)?.toLowerCase().startsWith("total credits"),
	);
	const total = matrix?.rows[0]?.at(-1);
	return total && /^\d/.test(total) ? `${total} credits` : "";
};

// --- your progress ------------------------------------------------------

export const STORE = "minors:tracker:v1";
export type Status = "doing" | "done";

export const slug = (curriculumId: string, minorId: string) =>
	`${curriculumId}/${minorId}`;
export const markKey = (curriculumId: string, minorId: string, course: string) =>
	`${slug(curriculumId, minorId)}#${course}`;

// The same de-duplication the tile preview does: a course listed in two
// baskets is still one course you take once.
export function allCourses(m: Minor) {
	const seen = new Set<string>();
	const out: { key: string; credits: number }[] = [];
	for (const s of m.sections) {
		for (const c of readCourses(s) ?? []) {
			if (c.heading) continue;
			const key = (c.code || c.name).trim();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push({ key, credits: creditsOf(c.credits) });
		}
	}
	return out;
}

export const courseKey = (c: { code: string; name: string }) =>
	(c.code || c.name).trim();

/** What the tracker saved: which minors are yours, and each course's status. */
export type Tracker = { mine: string[]; marks: Record<string, Status> };

/** A single minor was saved as a bare slug before you could track several. */
export const asList = (mine: unknown): string[] =>
	Array.isArray(mine) ? mine.filter((s) => typeof s === 'string') : mine ? [String(mine)] : [];

export function loadTracker(): Tracker {
	if (typeof localStorage === 'undefined') return { mine: [], marks: {} };
	try {
		const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
		return { mine: asList(saved.mine), marks: saved.marks ?? {} };
	} catch {
		return { mine: [], marks: {} };
	}
}

/** The minor "curriculumId/minorId" names, if it is still in the data. */
export function findMinor(curricula: Curriculum[], mine: string) {
	if (!mine) return undefined;
	const cut = mine.indexOf('/');
	if (cut === -1) return undefined;
	const curriculum = curricula.find((c) => c.id === mine.slice(0, cut));
	const minor = curriculum?.minors.find((m) => m.id === mine.slice(cut + 1));
	return curriculum && minor ? { curriculum, minor } : undefined;
}

/**
 * Every tracked minor that is still in the data, in the order they were
 * tracked. Slugs for minors the documents no longer carry simply drop out.
 */
export function findMinors(curricula: Curriculum[], mine: string[]) {
	return mine
		.map((s) => {
			const found = findMinor(curricula, s);
			return found && { slug: s, ...found };
		})
		.filter((x) => x !== undefined);
}

export function progress(
	marks: Record<string, Status>,
	curriculumId: string,
	m: Minor
) {
	let done = 0;
	let doing = 0;
	let listed = 0;
	for (const c of allCourses(m)) {
		listed += c.credits;
		const s = marks[markKey(curriculumId, m.id, c.key)];
		if (s === "done") done += c.credits;
		else if (s === "doing") doing += c.credits;
	}
	// The requirement is the goal; the sum of everything on offer is only
	// a fallback for minors that never state a total.
	const goal = Number(totalCredits(m).match(/\d+/)?.[0]) || listed;
	return { done, doing, goal, left: Math.max(0, goal - done - doing) };
}
