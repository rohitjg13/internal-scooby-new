// Runnable self-check for the dashboard's schedule resolution. No framework.
//   node scripts/mySchedule.check.ts
import assert from "node:assert";
import { myCourses, classesOn, dayName, type SavedPlan } from "../src/lib/mySchedule.ts";
import type { Course } from "../src/lib/types.ts";

const row = (c: Partial<Course>): Course => ({
	sno: 0,
	courseCode: "X",
	courseName: "X",
	credits: 3,
	faculty: "",
	slot: "",
	room: "",
	major: "",
	...c
});

const all: Course[] = [
	row({ courseCode: "CSD101-LEC1", courseName: "Algorithms", major: "CSD3YR", day: "MW", startTime: "9:00 AM", endTime: "10:20 AM" }),
	row({ courseCode: "CSD101-LEC2", courseName: "Algorithms", major: "CSD3YR", day: "MW", startTime: "2:00 PM", endTime: "3:20 PM" }),
	row({ courseCode: "CSD102-LEC1", courseName: "Networks", major: "CSD3YR", day: "TTh", startTime: "11:00 AM", endTime: "12:20 PM" }),
	row({ courseCode: "ECE201-LEC1", courseName: "Signals", major: "ECE2YR", day: "M", startTime: "8:00 AM", endTime: "9:20 AM" }),
	row({ courseCode: "CSD450-LEC1", courseName: "ML", courseType: "Major Elective", major: "CSD3YR", day: "M", startTime: "4:00 PM", endTime: "5:20 PM" }),
	// Same code, a second meeting at another time on another day — how the
	// real sheet writes a course that meets more than once.
	row({ courseCode: "CSD450-LEC1", courseName: "ML", courseType: "Major Elective", major: "CSD3YR", day: "W", startTime: "10:00 AM", endTime: "11:20 AM" }),
	row({ courseCode: "CSD102-LEC1", courseName: "Networks", major: "CSD3YR", day: "M", startTime: "3:00 PM", endTime: "4:20 PM" })
];

const plan = (p: Partial<SavedPlan> = {}): SavedPlan => ({
	batches: ["CSD31"],
	selected: [],
	swapped: new Map(),
	excluded: new Set(),
	...p
});

// Batch rows come in; another batch's rows and unpicked major electives don't.
// Every row of a kept code comes through, not just the first — CSD102-LEC1
// meets twice, so it appears twice.
const mine = myCourses(all, plan()).map((c) => c.courseCode);
assert.deepStrictEqual(mine.sort(), [
	"CSD101-LEC1",
	"CSD101-LEC2",
	"CSD102-LEC1",
	"CSD102-LEC1"
]);

// An added elective shows up — with both of its meetings.
const withElective = myCourses(all, plan({ selected: [all[4]] }));
assert.strictEqual(
	withElective.filter((c) => c.courseCode === "CSD450-LEC1").length,
	2,
	"an added course must keep every one of its meetings"
);

// Exclusion drops a row; a swap replaces it with the section you swapped to.
assert.ok(
	!myCourses(all, plan({ excluded: new Set(["CSD101-LEC1"]) })).some(
		(c) => c.courseCode === "CSD101-LEC1"
	)
);
const swapped = myCourses(all, plan({ swapped: new Map([["CSD101-LEC1", "CSD101-LEC2"]]) }));
assert.ok(!swapped.some((c) => c.courseCode === "CSD101-LEC1"));
assert.strictEqual(
	swapped.filter((c) => c.courseCode === "CSD101-LEC2").length,
	2,
	"swapping to a section you already hold must not drop or duplicate it"
);

// Monday, sorted by start time; Tuesday only has the TTh course.
const mon = classesOn(myCourses(all, plan()), "Monday");
assert.deepStrictEqual(
	mon.map((c) => c.courseCode),
	["CSD101-LEC1", "CSD101-LEC2", "CSD102-LEC1"],
	"a course's second weekly meeting belongs on its own day, sorted by time"
);
assert.strictEqual(mon[0].start, 9 * 60);
assert.strictEqual(mon[0].end, 10 * 60 + 20);
assert.deepStrictEqual(
	classesOn(myCourses(all, plan()), "Tuesday").map((c) => c.courseCode),
	["CSD102-LEC1"]
);

// Wednesday holds the added elective's second meeting.
assert.deepStrictEqual(
	classesOn(myCourses(all, plan({ selected: [all[4]] })), "Wednesday").map(
		(c) => c.courseCode
	),
	["CSD101-LEC1", "CSD450-LEC1", "CSD101-LEC2"]
);

// Sunday is not a timetabled day.
assert.strictEqual(dayName(new Date(2026, 8, 6)), "");
assert.strictEqual(dayName(new Date(2026, 8, 7)), "Monday");
assert.strictEqual(dayName(new Date(2026, 8, 12)), "Saturday");

console.log("mySchedule: ok");
