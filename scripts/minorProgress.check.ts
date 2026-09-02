// Runnable self-check for minor progress, over the real minor documents.
//   node scripts/minorProgress.check.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
	allCourses,
	progress,
	markKey,
	slug,
	findMinor,
	findMinors,
	asList,
	totalCredits,
	type Curriculum,
	type Status
} from "../src/lib/minorProgress.ts";

const read = (f: string) =>
	JSON.parse(readFileSync(`src/lib/data/${f}`, "utf8")) as Curriculum;
const curricula = [read("minors.new.json"), read("minors.old.json")];

// Two old-curriculum minors have nothing to track: English writes its column
// as "Courses", which the course-column patterns don't match, and Sociology
// carries no sections at all. Pinned rather than hidden — if a parser fix or a
// data update changes this, that should be a deliberate edit here.
const UNTRACKABLE = ["old/english", "old/sociology"];

const empty: string[] = [];
for (const c of curricula)
	for (const m of c.minors) {
		const p = progress({}, c.id, m);
		assert.strictEqual(p.done, 0);
		assert.strictEqual(p.doing, 0);
		assert.strictEqual(p.left, p.goal, "nothing marked means everything left");
		if (!allCourses(m).length || !p.goal) empty.push(`${c.id}/${m.id}`);
	}
assert.deepStrictEqual(empty, UNTRACKABLE, "which minors have nothing to track");

// Marking courses moves credits from left -> doing -> done, and never
// double-counts a course listed in two baskets.
const cur = curricula[0];
const m = cur.minors[0];
const courses = allCourses(m);
const first = courses.find((c) => c.credits > 0)!;

const marks: Record<string, Status> = {};
marks[markKey(cur.id, m.id, first.key)] = "doing";
const doing = progress(marks, cur.id, m);
assert.strictEqual(doing.doing, first.credits);
assert.strictEqual(doing.done, 0);

marks[markKey(cur.id, m.id, first.key)] = "done";
const done = progress(marks, cur.id, m);
assert.strictEqual(done.done, first.credits);
assert.strictEqual(done.doing, 0);
assert.strictEqual(done.left, Math.max(0, done.goal - first.credits));

// A mark keyed to another minor never leaks into this one.
const other = cur.minors[1];
assert.strictEqual(progress(marks, cur.id, other).done, 0);

// findMinor resolves what the tracker saves, and shrugs off stale ids.
const found = findMinor(curricula, slug(cur.id, m.id));
assert.strictEqual(found?.minor.id, m.id);
assert.strictEqual(findMinor(curricula, "nope/gone"), undefined);
assert.strictEqual(findMinor(curricula, ""), undefined);

// You can track several minors; a slug for a minor the documents no longer
// carry drops out rather than breaking the rest.
const two = [slug(cur.id, m.id), slug(cur.id, other.id)];
assert.deepStrictEqual(
	findMinors(curricula, [...two, "old/gone", ""]).map((x) => x.minor.id),
	[m.id, other.id]
);
assert.deepStrictEqual(findMinors(curricula, []), []);

// The single minor saved before multi-tracking existed must survive the move
// to a list — losing it would silently untrack someone's minor.
assert.deepStrictEqual(asList("new/design"), ["new/design"]);
assert.deepStrictEqual(asList(["a", "b"]), ["a", "b"]);
assert.deepStrictEqual(asList(""), []);
assert.deepStrictEqual(asList(undefined), []);

console.log(
	`minorProgress: ok — ${curricula.reduce((n, c) => n + c.minors.length, 0)} minors,` +
		` e.g. ${m.name}: ${courses.length} courses, goal ${done.goal} (${totalCredits(m)})`
);
