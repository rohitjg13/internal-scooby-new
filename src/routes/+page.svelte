<script lang="ts">
	import { onMount } from "svelte";
	import Seo from "$lib/components/Seo.svelte";
	import type { Course } from "$lib/types";
	import { minutesToTime } from "$lib/types";
	import {
		loadPlan,
		myCourses,
		classesOn,
		dayName,
		nowMinutes,
		type ClassSlot,
	} from "$lib/mySchedule";
	import { loadState as loadGpa } from "$lib/gpa/storage";
	import { computeCGPA, cgpaFromSgpa } from "$lib/gpa/calculator";
	import { courseTotals, statsFor, type Course as AttCourse } from "$lib/attendance";
	import { remainingDays, totalDays, TEACHING_DAYS, WEEKDAYS } from "$lib/semester";
	import {
		loadTracker,
		findMinor,
		progress,
		type Curriculum,
	} from "$lib/minorProgress";
	import newCurriculum from "$lib/data/minors.new.json";
	import oldCurriculum from "$lib/data/minors.old.json";

	type IconName =
		| "calendar"
		| "clubs"
		| "map"
		| "minor"
		| "history"
		| "attendance"
		| "gpa"
		| "semester";

	type Feature = {
		title: string;
		blurb: string;
		href: string;
		icon: IconName;
		tag: string;
	};

	const features: Feature[] = [
		{
			title: "Timetable Planner",
			blurb: "Batch, UWEs, CCCs and electives — with every clash flagged.",
			href: "/collision-checker",
			icon: "calendar",
			tag: "Timetable",
		},
		{
			title: "Academic Calendar",
			blurb: "Holidays, exam weeks and add/drop deadlines.",
			href: "/academic-calendar",
			icon: "semester",
			tag: "Academics",
		},
		{
			title: "GPA Calculator",
			blurb: "SGPA and CGPA on your admission year's scale.",
			href: "/gpa",
			icon: "gpa",
			tag: "Academics",
		},
		{
			title: "Attendance Calculator",
			blurb: "How far behind you are, and what you can still skip.",
			href: "/attendance-calculator",
			icon: "attendance",
			tag: "Academics",
		},
		{
			title: "Minors",
			blurb: "Core courses, elective baskets, credit requirements.",
			href: "/minors",
			icon: "minor",
			tag: "Academics",
		},
		{
			title: "Timetable Changes",
			blurb: "Every revision the university pushed, and what moved.",
			href: "/changes",
			icon: "history",
			tag: "Timetable",
		},
	];

	/* ---- clock ---- */
	let now = $state(new Date());
	const today = $derived(dayName(now));
	const mins = $derived(nowMinutes(now));

	/* ---- today's classes ---- */
	let planLoaded = $state(false);
	let hasPlan = $state(false);
	let todays = $state<ClassSlot[]>([]);

	const next = $derived(todays.find((c) => c.end > mins) ?? null);
	const done = $derived(todays.filter((c) => c.end <= mins).length);

	function untilLabel(c: ClassSlot) {
		if (c.start <= mins) return "in progress";
		const d = c.start - mins;
		if (d < 60) return `in ${d} min`;
		return `in ${Math.floor(d / 60)}h ${d % 60 ? `${d % 60}m` : ""}`.trim();
	}

	/* ---- widgets ---- */
	const WIDGET_KEY = "scooby.dashboard.widgets";
	const ALL_WIDGETS = [
		{ id: "gpa", name: "GPA" },
		{ id: "attendance", name: "Attendance" },
		{ id: "semester", name: "Semester" },
		{ id: "minor", name: "Minor" },
	] as const;
	type WidgetId = (typeof ALL_WIDGETS)[number]["id"];

	let widgets = $state<WidgetId[]>(["gpa", "attendance", "minor"]);
	let widgetsLoaded = $state(false);
	let picking = $state(false);

	function toggle(id: WidgetId) {
		widgets = widgets.includes(id)
			? widgets.filter((w) => w !== id)
			: [...widgets, id];
	}

	$effect(() => {
		if (widgetsLoaded)
			localStorage.setItem(WIDGET_KEY, JSON.stringify({ v: 2, widgets }));
	});

	/* ---- widget data (all read from what the other pages already saved) ---- */
	let gpa = $state<{ cgpa: number; credits: number } | null>(null);
	let att = $state<{
		current: number | null;
		target: number;
		canSkip: number;
		worst: { name: string; pct: number } | null;
	} | null>(null);
	let minor = $state<{
		name: string;
		href: string;
		done: number;
		doing: number;
		goal: number;
		left: number;
	} | null>(null);

	const semLeft = $derived.by(() => {
		const left = remainingDays(now);
		const total = WEEKDAYS.reduce((n, d) => n + TEACHING_DAYS[d], 0);
		const rem = totalDays(left);
		return { rem, total, pct: total ? ((total - rem) / total) * 100 : 0 };
	});

	function readGpa() {
		const s = loadGpa();
		if (!s) return null;
		const r =
			s.mode === "sgpa"
				? cgpaFromSgpa(s.terms ?? [])
				: computeCGPA(s.semesters ?? [], s.cohort);
		return r.totalCreditsRegistered
			? { cgpa: r.cgpa, credits: r.totalCreditsRegistered }
			: null;
	}

	function readMinor() {
		const { mine, marks } = loadTracker();
		const found = findMinor([newCurriculum, oldCurriculum] as Curriculum[], mine);
		if (!found) return null;
		const { curriculum, minor: m } = found;
		return {
			name: m.name,
			href: `/minors?c=${curriculum.id}&m=${m.id}`,
			...progress(marks, curriculum.id, m),
		};
	}

	function readAttendance() {
		try {
			const raw = localStorage.getItem("scooby.attendance");
			if (!raw) return null;
			const v = JSON.parse(raw) as { courses: AttCourse[]; target: number };
			const named = (v.courses ?? []).filter((c) => c.name?.trim());
			if (!named.length) return null;
			const target = v.target ?? 75;

			const sum = named.reduce(
				(t, c) => {
					const x = courseTotals(c);
					return {
						attended: t.attended + x.attended,
						missed: t.missed + x.missed,
						remaining: t.remaining + x.remaining,
					};
				},
				{ attended: 0, missed: 0, remaining: 0 },
			);
			const overall = statsFor(sum.attended, sum.missed, sum.remaining, target);

			let worst: { name: string; pct: number } | null = null;
			for (const c of named) {
				const t = courseTotals(c);
				const s = statsFor(t.attended, t.missed, t.remaining, target);
				if (s.current !== null && (!worst || s.current < worst.pct))
					worst = { name: c.name, pct: s.current };
			}
			return { current: overall.current, target, canSkip: overall.canSkip, worst };
		} catch {
			return null;
		}
	}

	onMount(() => {
		const tick = setInterval(() => (now = new Date()), 30_000);

		gpa = readGpa();
		att = readAttendance();
		minor = readMinor();

		try {
			const saved = JSON.parse(localStorage.getItem(WIDGET_KEY) ?? "null");
			// A bare array is a layout saved before the minor widget existed.
			// Leaving it alone would hide the widget from exactly the people
			// already tracking a minor, so they get it added once; anyone who
			// then removes it is saved in the new shape and stays removed.
			if (Array.isArray(saved))
				widgets = minor && !saved.includes("minor") ? [...saved, "minor"] : saved;
			else if (Array.isArray(saved?.widgets)) widgets = saved.widgets;
		} catch {
			// keep the defaults
		}
		widgetsLoaded = true;

		const plan = loadPlan();
		hasPlan = plan.batches.length > 0 || plan.selected.length > 0;
		if (!hasPlan || !today) {
			planLoaded = true;
		} else {
			fetch("/api/timetable?v=2")
				.then((r) => r.json())
				.then((d: { courses?: Course[] }) => {
					if (d.courses) todays = classesOn(myCourses(d.courses, plan), today);
				})
				.catch(() => {})
				.finally(() => (planLoaded = true));
		}

		return () => clearInterval(tick);
	});

	const dateLine = $derived(
		now.toLocaleDateString(undefined, {
			weekday: "long",
			day: "numeric",
			month: "long",
		}),
	);
</script>

{#snippet icon(name: IconName)}
	<svg
		class="icon"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === "semester"}
			<rect x="3" y="4.5" width="18" height="16" rx="2" />
			<path d="M3 9.5h18" />
			<path d="M8 2.5v4M16 2.5v4" />
			<rect x="14" y="12.5" width="4" height="4" rx="1" fill="currentColor" />
			<path d="M6.5 13h4M6.5 16.5h4" />
		{:else if name === "calendar"}
			<rect x="3" y="4.5" width="18" height="16" rx="2" />
			<path d="M3 9.5h18" />
			<path d="M8 2.5v4M16 2.5v4" />
			<path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
		{:else if name === "gpa"}
			<rect x="5" y="3" width="14" height="18" rx="2" />
			<path d="M8 7h8" />
			<path d="M8 11h2M12 11h2M16 11h0" />
			<path d="M8 15h2M12 15h2M16 15h0" />
			<path d="M8 18h2M12 18h2M16 18h0" />
		{:else if name === "attendance"}
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<path d="M22 4 12 14.01l-3-3" />
		{:else if name === "clubs"}
			<circle cx="9" cy="8" r="3" />
			<path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
			<path d="M16 5.5a3 3 0 0 1 0 5.5" />
			<path d="M17 14.2a5.5 5.5 0 0 1 3.5 4.8" />
		{:else if name === "map"}
			<path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0 1 13 0c0 4.8-6.5 10-6.5 10z" />
			<circle cx="12" cy="11" r="2.5" />
		{:else if name === "minor"}
			<path d="M12 4L3 8l9 4 9-4-9-4z" />
			<path d="M6.5 10.2V15c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4.8" />
			<path d="M21 8v5" />
		{:else if name === "history"}
			<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
			<path d="M3 3.5V9h5.5" />
			<path d="M12 7.5V12l3 2" />
		{/if}
	</svg>
{/snippet}

<Seo
	title="Scooby"
	description="Scooby is a one-stop university app for planning your timetable, checking your exam schedule, working out your GPA and more."
	image="default"
/>

<main class="dash">
	<header class="head">
		<p class="label">{dateLine}</p>
		<h1>Scooby</h1>
	</header>

	<!-- Today -->
	<section class="panel today" aria-label="Today">
		<div class="panel-head">
			<span class="label">Today</span>
			{#if todays.length}
				<span class="count">{done}/{todays.length} done</span>
			{/if}
		</div>

		{#if !planLoaded}
			<p class="quiet">Reading your timetable…</p>
		{:else if !hasPlan}
			<div class="empty">
				<p>No timetable saved yet.</p>
				<a class="btn btn-primary btn-sm" href="/collision-checker">Build one</a>
			</div>
		{:else if !today}
			<p class="quiet">Sunday. Nothing timetabled.</p>
		{:else if !todays.length}
			<p class="quiet">No classes today.</p>
		{:else if next}
			<a class="next" href="/collision-checker">
				<span class="next-when">
					<span class="next-time">{minutesToTime(next.start)}</span>
					<span class="next-until">{untilLabel(next)}</span>
				</span>
				<span class="next-body">
					<span class="next-code">{next.courseCode}</span>
					<span class="next-name">{next.courseName}</span>
					<span class="next-meta">
						{next.room || "Room TBA"}{next.faculty ? ` · ${next.faculty}` : ""}
					</span>
				</span>
			</a>

			{#if todays.length > 1}
				<ul class="rest">
					{#each todays as c}
						<li class:past={c.end <= mins} class:current={c === next}>
							<span class="mono">{minutesToTime(c.start)}</span>
							<span class="rest-code">{c.courseCode}</span>
							<span class="rest-name">{c.courseName}</span>
							<span class="rest-room mono">{c.room || "—"}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="quiet">That's all of today's classes done.</p>
		{/if}
	</section>

	<!-- Widgets -->
	<section aria-label="Widgets">
		<div class="panel-head widgets-head">
			<span class="label">Widgets</span>
			<button class="add" onclick={() => (picking = !picking)} aria-expanded={picking}>
				{picking ? "Done" : "Edit"}
			</button>
		</div>

		{#if picking}
			<div class="chips">
				{#each ALL_WIDGETS as w}
					<button
						class="chip"
						class:on={widgets.includes(w.id)}
						onclick={() => toggle(w.id)}
					>
						{widgets.includes(w.id) ? "−" : "+"}
						{w.name}
					</button>
				{/each}
			</div>
		{/if}

		{#if widgets.length}
			<div class="widgets">
				{#if widgets.includes("gpa")}
					<a class="panel widget" href="/gpa">
						<span class="label">CGPA</span>
						{#if gpa}
							<span class="stat">{gpa.cgpa.toFixed(2)}</span>
							<span class="sub">{gpa.credits} credits graded</span>
						{:else}
							<span class="stat dim">—</span>
							<span class="sub">Add your grades</span>
						{/if}
					</a>
				{/if}

				{#if widgets.includes("attendance")}
					<a class="panel widget" href="/attendance-calculator">
						<span class="label">Attendance</span>
						{#if att && att.current !== null}
							<span
								class="stat"
								style:color={att.current >= att.target ? "var(--ok)" : "var(--bad)"}
								>{att.current.toFixed(0)}<span class="unit">%</span></span
							>
							<span class="sub">
								{att.canSkip > 0
									? `${att.canSkip} more you can skip`
									: `below your ${att.target}% target`}
							</span>
							{#if att.worst}
								<span class="sub dim">
									lowest: {att.worst.name} · {att.worst.pct.toFixed(0)}%
								</span>
							{/if}
						{:else}
							<span class="stat dim">—</span>
							<span class="sub">Log your classes</span>
						{/if}
					</a>
				{/if}

				{#if widgets.includes("minor")}
					<a class="panel widget" href={minor?.href ?? "/minors"}>
						<span class="label">Minor</span>
						{#if minor && minor.goal}
							<span class="stat"
								>{minor.done}<span class="unit">/ {minor.goal} cr</span></span
							>
							<span class="sub">
								{minor.left} to go{minor.doing
									? `, ${minor.doing} in progress`
									: ""}
							</span>
							<span class="sub dim">{minor.name}</span>
							<span class="bar">
								<span
									class="bar-done"
									style:width="{(minor.done / minor.goal) * 100}%"
								></span>
								<span
									class="bar-doing"
									style:width="{(minor.doing / minor.goal) * 100}%"
								></span>
							</span>
						{:else if minor}
							<!-- A minor whose document lists no parseable courses: name it,
							     but don't invent a number for it. -->
							<span class="stat dim">—</span>
							<span class="sub">{minor.name}</span>
							<span class="sub dim">nothing to tick off yet</span>
						{:else}
							<span class="stat dim">—</span>
							<span class="sub">Pick a minor to track</span>
						{/if}
					</a>
				{/if}

				{#if widgets.includes("semester")}
					<a class="panel widget" href="/academic-calendar">
						<span class="label">Semester</span>
						<span class="stat">{semLeft.rem}<span class="unit">days</span></span>
						<span class="sub">of teaching left</span>
						<span class="bar"><span style:width="{semLeft.pct}%"></span></span>
					</a>
				{/if}
			</div>
		{:else}
			<p class="quiet">No widgets. Hit Edit to add one.</p>
		{/if}
	</section>

	<!-- Everything else -->
	<section aria-label="All tools">
		<div class="panel-head"><span class="label">Everything else</span></div>
		<div class="index">
			{#each features as f}
				<a class="row" href={f.href}>
					<span class="row-icon">{@render icon(f.icon)}</span>
					<span class="row-body">
						<span class="row-title">{f.title}</span>
						<span class="row-blurb">{f.blurb}</span>
					</span>
					<span class="row-tag mono">{f.tag}</span>
					<svg
						class="row-arrow"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M9 6l6 6-6 6" />
					</svg>
				</a>
			{/each}

			<a
				class="row"
				href="https://maps.rohitjg.com"
				target="_blank"
				rel="noopener noreferrer"
			>
				<span class="row-icon">{@render icon("map")}</span>
				<span class="row-body">
					<span class="row-title">Snoopy</span>
					<span class="row-blurb">
						The campus map — every block, mess and court pinned.
					</span>
				</span>
				<span class="row-tag mono">Campus</span>
				<svg
					class="row-arrow"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M7 17 17 7M9 7h8v8" />
				</svg>
			</a>
		</div>
	</section>
</main>

<style>
	.dash {
		flex: 1;
		width: 100%;
		max-width: 780px;
		margin: 0 auto;
		padding: 3.5rem 1.25rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
	}

	.head h1 {
		font-size: clamp(2.6rem, 11vw, 3.4rem);
		margin-top: 0.35rem;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.6rem;
		margin-bottom: 0.85rem;
		border-bottom: 1px solid var(--border);
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
	}

	.quiet {
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 0.4rem 0;
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	/* --- next class --- */
	.next {
		display: flex;
		gap: 1.1rem;
		padding: 1.1rem 1.15rem;
		border: 1px solid var(--border-hover);
		border-left: 2px solid var(--accent);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		text-decoration: none;
		transition: background 0.15s;
	}

	.next:hover {
		background: var(--bg-hover);
	}

	.next-when {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: none;
		min-width: 5.5rem;
	}

	.next-time {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--accent);
	}

	.next-until {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
	}

	.next-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.next-code {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		letter-spacing: 0.06em;
	}

	.next-name {
		font-family: var(--font-display);
		font-size: 1.35rem;
		line-height: 1.15;
	}

	.next-meta {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	/* --- rest of the day --- */
	.rest {
		list-style: none;
		margin-top: 0.9rem;
	}

	.rest li {
		display: grid;
		grid-template-columns: 5.5rem 5.5rem 1fr auto;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.5rem 0.2rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
	}

	.rest li:last-child {
		border-bottom: none;
	}

	.rest li.past {
		opacity: 0.4;
	}

	.rest li.current .rest-name {
		color: var(--text);
	}

	.rest-code {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.rest-name,
	.rest-room {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rest-room {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* --- widgets --- */
	.widgets-head .add {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: color 0.15s;
	}

	.widgets-head .add:hover {
		color: var(--accent);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.85rem;
	}

	.chip {
		padding: 0.3rem 0.6rem;
		border: 1px dashed var(--border-hover);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.chip.on {
		border-style: solid;
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-dim);
	}

	.widgets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.widget {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		text-decoration: none;
		transition:
			border-color 0.15s,
			background 0.15s;
	}

	.widget:hover {
		border-color: var(--border-hover);
		background: var(--bg-hover);
	}

	.stat {
		font-family: var(--font-display);
		font-size: 2.4rem;
		line-height: 1.1;
		margin-top: 0.5rem;
	}

	.stat.dim {
		color: var(--text-muted);
	}

	.unit {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-left: 0.25rem;
	}

	.sub {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.sub.dim {
		color: var(--text-muted);
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bar {
		display: flex;
		height: 2px;
		margin-top: 0.7rem;
		background: var(--border);
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	/* done is solid, in-progress is the same hue held back */
	.bar-doing {
		background: color-mix(in srgb, var(--accent) 38%, transparent);
	}

	/* --- index --- */
	.index {
		border-top: 1px solid var(--border);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.85rem 0.35rem;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		text-decoration: none;
		transition: background 0.15s;
	}

	.row:hover {
		background: var(--bg-card);
	}

	.row-icon {
		flex: none;
		color: var(--text-muted);
		display: inline-flex;
	}

	.row:hover .row-icon {
		color: var(--accent);
	}

	.icon {
		width: 18px;
		height: 18px;
	}

	.row-body {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.row-title {
		font-size: 0.95rem;
		font-weight: 500;
	}

	.row-blurb {
		font-size: 0.8rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-tag {
		flex: none;
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.row-arrow {
		flex: none;
		width: 15px;
		height: 15px;
		color: var(--text-muted);
		transition: transform 0.15s;
	}

	.row:hover .row-arrow {
		transform: translateX(3px);
		color: var(--accent);
	}

	@media (max-width: 560px) {
		.dash {
			padding: 2.5rem 1rem 1.5rem;
			gap: 1.75rem;
		}

		.next {
			flex-direction: column;
			gap: 0.6rem;
		}

		.next-when {
			flex-direction: row;
			align-items: baseline;
			gap: 0.5rem;
		}

		.rest li {
			grid-template-columns: 4.6rem 1fr auto;
		}

		.rest-code {
			display: none;
		}

		.row-tag {
			display: none;
		}
	}
</style>
