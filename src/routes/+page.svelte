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
	import { stats as attStats, type Course as AttCourse } from "$lib/attendance";
	import { remainingDays, totalDays, TEACHING_DAYS, WEEKDAYS } from "$lib/semester";
	import {
		loadTracker,
		findMinors,
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
		/** Which hue this tool owns, from the list in app.css. */
		hue: string;
	};

	const features: Feature[] = [
		{
			title: "Timetable Planner",
			hue: "blue",
			blurb: "Batch, UWEs, CCCs and electives — with every clash flagged.",
			href: "/collision-checker",
			icon: "calendar",
			tag: "Timetable",
		},
		{
			title: "Academic Calendar",
			hue: "teal",
			blurb: "Holidays, exam weeks and add/drop deadlines.",
			href: "/academic-calendar",
			icon: "semester",
			tag: "Academics",
		},
		{
			title: "GPA Calculator",
			hue: "violet",
			blurb: "SGPA and CGPA on your admission year's scale.",
			href: "/gpa",
			icon: "gpa",
			tag: "Academics",
		},
		{
			title: "Attendance Calculator",
			hue: "green",
			blurb: "How far behind you are, and what you can still skip.",
			href: "/attendance-calculator",
			icon: "attendance",
			tag: "Academics",
		},
		{
			title: "Minors",
			hue: "amber",
			blurb: "Core courses, elective baskets, credit requirements.",
			href: "/minors",
			icon: "minor",
			tag: "Academics",
		},
		{
			title: "Timetable Changes",
			hue: "pink",
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

	// A class already running: what you want is when you get out, not that it
	// started.
	function untilLabel(c: ClassSlot) {
		if (c.start <= mins) return `ends ${minutesToTime(c.end)}`;
		const d = c.start - mins;
		if (d < 60) return `in ${d} min`;
		return `in ${Math.floor(d / 60)}h ${d % 60 ? `${d % 60}m` : ""}`.trim();
	}

	const running = $derived(next !== null && next.start <= mins);

	// The day's dots cycle through the hue list, so a timetable reads as a
	// sequence rather than a column of identical marks.
	const HUES = ["blue", "teal", "green", "amber", "orange", "pink", "violet"];

	const greeting = $derived(
		now.getHours() < 5
			? "Up late"
			: now.getHours() < 12
				? "Good morning"
				: now.getHours() < 17
					? "Good afternoon"
					: "Good evening",
	);

	/* ---- widgets ---- */
	const WIDGET_KEY = "scooby.dashboard.widgets";
	// Each minor you track is its own widget, so the catalogue is only known
	// once the tracker has been read: "gpa" | "attendance" | "semester" |
	// `minor:<curriculum>/<minor>`.
	type WidgetId = string;

	const BASE_WIDGETS = [
		{ id: "gpa", name: "GPA" },
		{ id: "attendance", name: "Attendance" },
		{ id: "semester", name: "Semester" },
	];

	let widgets = $state<WidgetId[]>(["gpa", "attendance"]);
	let widgetsLoaded = $state(false);
	let picking = $state(false);

	function toggle(id: WidgetId) {
		widgets = widgets.includes(id)
			? widgets.filter((w) => w !== id)
			: [...widgets, id];
	}

	$effect(() => {
		if (widgetsLoaded)
			localStorage.setItem(WIDGET_KEY, JSON.stringify({ v: 3, widgets }));
	});

	/* ---- widget data (all read from what the other pages already saved) ---- */
	let gpa = $state<{ cgpa: number; credits: number } | null>(null);
	// Attendance is judged per course, never pooled: 80% across everything
	// still gets you debarred from the one course sitting at 60%. So the
	// widget lists the courses, and there is no overall figure.
	let att = $state<{
		target: number;
		courses: { name: string; pct: number | null; canSkip: number }[];
		below: number;
	} | null>(null);
	type MinorWidget = {
		slug: string;
		name: string;
		href: string;
		done: number;
		doing: number;
		goal: number;
		left: number;
	};
	let minors = $state<MinorWidget[]>([]);
	const minorById = (id: string) =>
		minors.find((m) => `minor:${m.slug}` === id);

	// What Edit offers: the fixed widgets, plus one per minor you track.
	const catalogue = $derived([
		...BASE_WIDGETS,
		...minors.map((m) => ({ id: `minor:${m.slug}`, name: m.name })),
	]);

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

	function readMinors(): MinorWidget[] {
		const { mine, marks } = loadTracker();
		const curricula = [newCurriculum, oldCurriculum] as Curriculum[];
		return findMinors(curricula, mine).map(({ slug, curriculum, minor: m }) => ({
			slug,
			name: m.name,
			href: `/minors?c=${curriculum.id}&m=${m.id}`,
			...progress(marks, curriculum.id, m),
		}));
	}

	function readAttendance() {
		try {
			const raw = localStorage.getItem("scooby.attendance");
			if (!raw) return null;
			const v = JSON.parse(raw) as { courses: AttCourse[]; target: number };
			const named = (v.courses ?? []).filter((c) => c.name?.trim());
			if (!named.length) return null;
			const target = v.target ?? 75;

			// Worst first — the course about to debar you is the one you came
			// to the dashboard to see.
			const courses = named
				.map((c) => {
					const s = attStats(c, target);
					return { name: c.name.trim(), pct: s.current, canSkip: s.canSkip };
				})
				.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

			return {
				target,
				courses,
				below: courses.filter((c) => c.pct !== null && c.pct < target).length,
			};
		} catch {
			return null;
		}
	}

	onMount(() => {
		const tick = setInterval(() => (now = new Date()), 30_000);

		gpa = readGpa();
		att = readAttendance();
		minors = readMinors();

		try {
			const saved = JSON.parse(localStorage.getItem(WIDGET_KEY) ?? "null");
			// A bare array predates the minor widget; a single "minor" entry
			// predates tracking more than one. Either way, expand to one widget
			// per minor you actually track, so nobody has to go re-add them.
			const from: WidgetId[] = Array.isArray(saved)
				? saved
				: Array.isArray(saved?.widgets)
					? saved.widgets
					: [...widgets, "minor"];
			widgets = from.flatMap((id) =>
				id === "minor" ? minors.map((m) => `minor:${m.slug}`) : [id],
			);
			// A first visit with minors already tracked still gets them.
			if (!Array.isArray(saved?.widgets))
				for (const m of minors)
					if (!widgets.includes(`minor:${m.slug}`))
						widgets = [...widgets, `minor:${m.slug}`];
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
		<div class="brand">
			<span class="mark" aria-hidden="true">
				<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
					<path d="M18 20h28" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".5" />
					<path d="M32 20v9" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".5" />
					<circle cx="32" cy="42" r="13" fill="currentColor" />
					<circle cx="32" cy="42" r="4.5" fill="var(--accent)" />
				</svg>
			</span>
			<h1>Scooby</h1>
		</div>
		<p class="greeting">{greeting} · {dateLine}</p>
	</header>

	<!-- Up next, and the shape of the rest of the day. -->
	<section class="today" style="--h: var(--hue-violet)">
		<div class="up-next">
			<span class="tag">{running ? "In class" : "Up next"}</span>

			{#if !planLoaded}
				<p class="big">One sec…</p>
			{:else if !hasPlan}
				<p class="big">No timetable yet</p>
				<a class="cta" href="/collision-checker">Build one →</a>
			{:else if !today}
				<p class="big">It's Sunday 🌤</p>
				<span class="big-sub">Nothing timetabled.</span>
			{:else if !todays.length}
				<p class="big">Nothing today 🎉</p>
				<span class="big-sub">Not a single class.</span>
			{:else if next}
				<a class="next-link" href="/collision-checker">
					<span class="next-time">{minutesToTime(next.start)}</span>
					<span class="next-until">{untilLabel(next)}</span>
					<span class="next-name">{next.courseName}</span>
					<span class="next-meta">{next.courseCode} · {next.room || "Room TBA"}</span>
				</a>
			{:else}
				<p class="big">You're done 🎉</p>
				<span class="big-sub">That was the last one today.</span>
			{/if}
		</div>

		{#if todays.length}
			<ol class="timeline">
				{#each todays as c, i}
					<li class:past={c.end <= mins} class:current={c === next}>
						<span class="dot" style="--h: var(--hue-{HUES[i % HUES.length]})"></span>
						<span class="tl-time">{minutesToTime(c.start)}</span>
						<span class="tl-name">{c.courseName}</span>
						<span class="tl-room">{c.room || "—"}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<!-- Widgets -->
	<section aria-label="Widgets">
		<div class="band">
			<span class="label">Your numbers</span>
			<button class="pill" onclick={() => (picking = !picking)} aria-expanded={picking}>
				{picking ? "Done" : "Edit"}
			</button>
		</div>

		{#if picking}
			<div class="chips">
				{#each catalogue as w}
					<button
						class="pill"
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
			<div class="cards">
				{#each widgets as id (id)}
					{#if id === "gpa"}
						<a class="card tone-bg tone-edge" href="/gpa" style="--h: var(--hue-violet)">
							<span class="label tone-ink">CGPA</span>
							{#if gpa}
								<span class="stat tone-ink">{gpa.cgpa.toFixed(2)}</span>
								<span class="sub">{gpa.credits} credits graded</span>
							{:else}
								<span class="stat dim">—</span>
								<span class="sub">Add your grades</span>
							{/if}
						</a>
					{:else if id === "attendance"}
						<a
							class="card span2 tone-bg tone-edge"
							href="/attendance-calculator"
							style="--h: var(--hue-green)"
						>
							<span class="label tone-ink">Attendance</span>
							{#if att}
								<ul class="att">
									{#each att.courses as c}
										<li>
											<span class="att-name">{c.name}</span>
											<span class="att-track">
												<span
													class="att-fill"
													style:width="{Math.min(100, c.pct ?? 0)}%"
													style:background={c.pct !== null && c.pct >= att.target
														? "var(--ok)"
														: "var(--bad)"}
												></span>
											</span>
											{#if c.pct === null}
												<span class="att-pct dim">—</span>
											{:else}
												<span
													class="att-pct"
													style:color={c.pct >= att.target ? "var(--ok)" : "var(--bad)"}
													>{c.pct.toFixed(0)}%</span
												>
											{/if}
										</li>
									{/each}
								</ul>
								<span class="sub">
									{att.below
										? `${att.below} below ${att.target}%`
										: `all above ${att.target}% ✳`}
								</span>
							{:else}
								<span class="stat dim">—</span>
								<span class="sub">Log your classes</span>
							{/if}
						</a>
					{:else if id === "semester"}
						<a
							class="card tone-bg tone-edge"
							href="/academic-calendar"
							style="--h: var(--hue-teal)"
						>
							<span class="label tone-ink">Semester</span>
							<span class="stat tone-ink">{semLeft.rem}<span class="unit">days</span></span>
							<span class="sub">of teaching left</span>
							<span class="bar"><span class="tone-fill" style:width="{semLeft.pct}%"></span></span>
						</a>
					{:else if minorById(id)}
						{@const m = minorById(id)!}
						<a class="card tone-bg tone-edge" href={m.href} style="--h: var(--hue-amber)">
							<span class="label tone-ink">{m.name}</span>
							<span class="stat tone-ink"
								>{m.done}<span class="unit">/ {m.goal || "—"} cr</span></span
							>
							{#if m.goal}
								<span class="sub">
									{m.left} to go{m.doing ? `, ${m.doing} in progress` : ""}
								</span>
								<span class="bar">
									<span class="tone-fill" style:width="{(m.done / m.goal) * 100}%"></span>
									<span
										class="tone-fill faded"
										style:width="{(m.doing / m.goal) * 100}%"
									></span>
								</span>
							{:else}
								<!-- A minor whose document lists no parseable courses: name it,
								     but don't invent a number for it. -->
								<span class="sub">nothing to tick off yet</span>
							{/if}
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="quiet">No widgets. Hit Edit to add one.</p>
		{/if}
	</section>

	<!-- Everything else -->
	<section aria-label="All tools">
		<div class="band"><span class="label">Everything else</span></div>
		<div class="pages">
			{#each features as f}
				<a class="page" href={f.href} style="--h: var(--hue-{f.hue})">
					<span class="page-icon tone-bg tone-ink">{@render icon(f.icon)}</span>
					<span class="page-body">
						<span class="page-title">{f.title}</span>
						<span class="page-blurb">{f.blurb}</span>
					</span>
				</a>
			{/each}
		</div>

		<!-- Snoopy is a different product, not one of Scooby's pages, so it gets
		     its own quiet line rather than a tile competing with them. -->
		<a
			class="offsite"
			href="https://maps.rohitjg.com"
			target="_blank"
			rel="noopener noreferrer"
		>
			<span class="offsite-icon">{@render icon("map")}</span>
			<span class="offsite-text">
				Lost? <strong>Snoopy</strong> maps the campus — every block, mess and court.
			</span>
			<span class="offsite-go" aria-hidden="true">↗</span>
		</a>
	</section>
</main>

<style>
	/* Paper with a faint dot grid — texture you notice only if you look. */
	.dash {
		flex: 1;
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding: 3.5rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 42px;
		border-radius: 10px;
		background: var(--accent);
		color: var(--accent-ink);
	}

	.mark svg {
		width: 26px;
		height: 26px;
	}

	.head h1 {
		font-size: clamp(2.1rem, 7vw, 2.8rem);
		letter-spacing: -0.04em;
	}

	.greeting {
		margin-top: 0.6rem;
		color: var(--text-secondary);
		font-size: 0.95rem;
	}

	.band {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.9rem;
	}

	.pill {
		padding: 0.35rem 0.8rem;
		border: 2px solid var(--border-hover);
		border-radius: 6px;
		background: var(--bg-card);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s,
			transform 0.15s;
	}

	.pill:hover {
		color: var(--accent);
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.pill.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-bottom: 1rem;
	}

	.quiet {
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 1.4rem;
		background: var(--bg-sunken);
		border-radius: var(--radius);
	}

	/* --- today --- */
	.today {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
	}

	.up-next {
		display: flex;
		flex-direction: column;
		padding: 1.6rem;
		border-radius: 10px;
		background: var(--accent);
		color: var(--accent-ink);
	}

	.tag {
		align-self: flex-start;
		padding: 0.25rem 0.6rem;
		border-radius: 5px;
		/* Mixed from the ink so it holds in both themes — a white wash would
		   vanish on dark, where the accent is light and the ink is dark. */
		background: color-mix(in srgb, var(--accent-ink) 20%, transparent);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.big {
		margin-top: 1.4rem;
		font-size: 1.7rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.15;
	}

	.big-sub {
		font-size: 0.85rem;
		opacity: 0.8;
		margin-top: 0.3rem;
	}

	.cta {
		align-self: flex-start;
		margin-top: 0.8rem;
		padding: 0.45rem 0.9rem;
		border-radius: 6px;
		background: var(--accent-ink);
		color: var(--accent);
		font-size: 0.82rem;
		font-weight: 700;
		text-decoration: none;
	}

	.next-link {
		display: flex;
		flex-direction: column;
		margin-top: auto;
		padding-top: 1.4rem;
		color: inherit;
		text-decoration: none;
	}

	.next-time {
		font-family: var(--font-mono);
		font-size: 2.9rem;
		font-weight: 500;
		letter-spacing: -0.055em;
		line-height: 1;
	}

	.next-until {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		opacity: 0.8;
		margin-top: 0.35rem;
	}

	.next-name {
		font-size: 1.3rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.2;
		margin-top: 0.9rem;
	}

	.next-meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		opacity: 0.8;
		margin-top: 0.25rem;
	}

	/* --- the day, as a spine --- */
	.timeline {
		list-style: none;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		padding: 1.25rem 1.1rem;
		border: 2px solid var(--border);
		border-radius: 10px;
		background: var(--bg-card);
	}

	.timeline li {
		position: relative;
		display: grid;
		grid-template-columns: 1.1rem 4.4rem 1fr auto;
		align-items: center;
		gap: 0.55rem;
		padding: 0.42rem 0.5rem;
		border-radius: 6px;
		font-size: 0.83rem;
	}

	.timeline li:not(:last-child)::before {
		content: "";
		position: absolute;
		left: 1.03rem;
		top: 1.5rem;
		bottom: -0.4rem;
		width: 2px;
		background: var(--border);
	}

	.dot {
		width: 11px;
		height: 11px;
		border-radius: 999px;
		background: oklch(var(--tone-ink-l) var(--tone-ink-c) var(--h));
		justify-self: center;
	}

	.timeline li.current {
		background: var(--accent-dim);
	}

	.timeline li.current .dot {
		box-shadow: 0 0 0 4px var(--accent-dim);
	}

	.timeline li.past {
		opacity: 0.4;
	}

	.tl-time {
		font-family: var(--font-mono);
		font-size: 0.71rem;
		color: var(--text-muted);
	}

	.tl-name,
	.tl-room {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline li.current .tl-name {
		color: var(--text);
		font-weight: 700;
	}

	.tl-room {
		font-family: var(--font-mono);
		font-size: 0.69rem;
		color: var(--text-muted);
	}

	/* --- widget cards --- */
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
		gap: 0.9rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		min-height: 160px;
		padding: 1.25rem;
		border: 2px solid;
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
		transition:
			transform 0.16s ease,
			box-shadow 0.16s ease;
	}

	.card:hover,
	.page:hover {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0 oklch(var(--tone-edge-l) var(--tone-edge-c) var(--h));
	}

	.card.span2 {
		grid-column: span 2;
	}

	.stat {
		font-family: var(--font-mono);
		font-size: 2.1rem;
		font-weight: 500;
		letter-spacing: -0.045em;
		line-height: 1.1;
		margin-top: auto;
	}

	.stat.dim {
		color: var(--text-muted);
	}

	.unit {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		opacity: 0.65;
		margin-left: 0.25rem;
	}

	.sub {
		font-size: 0.76rem;
		color: var(--text-secondary);
		margin-top: 0.2rem;
	}

	.bar {
		display: flex;
		height: 7px;
		margin-top: 0.75rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--text) 8%, transparent);
		overflow: hidden;
	}

	.tone-fill {
		display: block;
		height: 100%;
		background: oklch(var(--tone-ink-l) var(--tone-ink-c) var(--h));
	}

	.tone-fill.faded {
		opacity: 0.35;
	}

	/* --- attendance, per course --- */
	.att {
		list-style: none;
		margin: 0.9rem 0 0.25rem;
		display: grid;
		gap: 0.45rem;
	}

	.att li {
		display: grid;
		grid-template-columns: minmax(0, 8rem) 1fr 2.6rem;
		align-items: center;
		gap: 0.65rem;
	}

	.att-name {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.att-track {
		height: 7px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--text) 8%, transparent);
		overflow: hidden;
	}

	.att-fill {
		display: block;
		height: 100%;
		border-radius: 999px;
	}

	.att-pct {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		text-align: right;
	}

	.att-pct.dim {
		color: var(--text-muted);
	}

	/* --- pages --- */
	.pages {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
		gap: 0.75rem;
	}

	.page {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.9rem 1rem;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-card);
		color: var(--text);
		text-decoration: none;
		transition:
			transform 0.16s ease,
			box-shadow 0.16s ease,
			border-color 0.16s ease;
	}

	.page:hover {
		border-color: oklch(var(--tone-edge-l) var(--tone-edge-c) var(--h));
	}

	.page-icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
	}

	.icon {
		width: 19px;
		height: 19px;
	}

	.page-body {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.page-title {
		font-size: 0.92rem;
		font-weight: 700;
	}

	.page-blurb {
		font-size: 0.75rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Deliberately not a card: no fill, dashed rule — present, but never
	   mistaken for part of the app. */
	.offsite {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-top: 1rem;
		padding: 0.8rem 0.9rem;
		border: 2px dashed var(--border-hover);
		border-radius: var(--radius);
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.8rem;
		transition:
			color 0.18s ease,
			border-color 0.18s ease;
	}

	.offsite:hover {
		color: var(--text-secondary);
		border-color: var(--accent);
	}

	.offsite-icon {
		flex: none;
		display: inline-flex;
	}

	.offsite:hover .offsite-icon {
		color: var(--accent);
	}

	.offsite-icon :global(.icon) {
		width: 15px;
		height: 15px;
	}

	.offsite-text {
		flex: 1;
		min-width: 0;
	}

	.offsite strong {
		font-weight: 700;
		color: var(--text-secondary);
	}

	.offsite-go {
		flex: none;
		font-family: var(--font-mono);
		transition: transform 0.18s ease;
	}

	.offsite:hover .offsite-go {
		transform: translate(2px, -2px);
		color: var(--accent);
	}

	@media (max-width: 720px) {
		.today {
			grid-template-columns: 1fr;
		}

		.card.span2 {
			grid-column: span 1;
		}
	}

	@media (max-width: 520px) {
		.dash {
			padding: 2.5rem 0.9rem 2rem;
			gap: 2rem;
		}

		.next-time {
			font-size: 2.4rem;
		}

		.att li {
			grid-template-columns: minmax(0, 1fr) 2.6rem;
		}

		.att-track {
			display: none;
		}
	}
</style>
