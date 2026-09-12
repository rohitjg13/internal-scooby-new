<script lang="ts">
	import Seo from "$lib/components/Seo.svelte";
	import { COMPONENTS, stats, statsFor, type ComponentType } from "$lib/attendance";
	import {
		parseReport,
		toCourses,
		classesLeft,
		parseForgiveDate,
		FORGIVE_UNTIL,
		type ParsedCourse
	} from "$lib/attendanceReport";
	import { remainingDays, totalDays, WEEKDAYS, DAY_NAMES, SEM_START } from "$lib/semester";

	const KEY = "scooby.attendance.paste";
	const PRESETS = [75, 70, 65, 50];

	/** ISO dates are for storing, DD/MM/YYYY is for reading */
	const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

	/** DD/MM/YYYY back to ISO; "" for anything half-typed or impossible */
	function isoOf(text: string): string {
		const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
		if (!m) return "";
		const [d, mo, y] = m.slice(1).map(Number);
		if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
		return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
	}

	let raw = $state("");
	let target = $state(75);
	// The native date input renders in the browser's locale, which can't be set
	// from here, so the waiver date is a plain DD/MM/YYYY field instead.
	let waiver = $state(dmy(FORGIVE_UNTIL));
	/** "ECE301/LEC" → the weekdays you picked, overriding what the report showed */
	let picks = $state<Record<string, number[]>>({});
	/** course code → which components its card shows, once you've added or removed one */
	let shape = $state<Record<string, ComponentType[]>>({});
	/** "ECE301/PRAC" → how many hours one of its classes runs for */
	let hours = $state<Record<string, number>>({});
	/** "ECE301/LEC/attended" → what you typed over the report's own count */
	let counts = $state<Record<string, number>>({});
	/** which pickers you've opened or closed by hand; the rest follow hasHrs */
	let opened = $state<Record<string, boolean>>({});

	const left = remainingDays();
	const key = (id: string, type: ComponentType) => `${id}/${type}`;
	const HOURS = [1, 1.5, 2, 3];
	const COUNTS = ["attended", "missed", "leaves", "remaining"] as const;
	type CountField = (typeof COUNTS)[number];
	// Until you say how long a class runs, there's no honest course total to show:
	// one hour per class is a guess, and a two-hour practical makes it a wrong one.
	const hasHrs = (id: string, type: ComponentType) => key(id, type) in hours;
	const ready = (c: ParsedCourse) => c.components.every((k) => hasHrs(c.id, k.type));

	// Closed until you open it. Has to be remembered rather than derived, or every
	// keystroke inside would spring it back.
	const isOpen = (id: string, type: ComponentType) => opened[key(id, type)] ?? false;

	// ponytail: localStorage, same as the other calculator — your numbers, your device.
	$effect(() => {
		const saved = localStorage.getItem(KEY);
		if (!saved) return;
		try {
			const v = JSON.parse(saved);
			if (typeof v.raw === "string") raw = v.raw;
			if (typeof v.target === "number") target = v.target;
			if (typeof v.waiver === "string") waiver = v.waiver;
			else if (typeof v.forgiveUntil === "string") waiver = dmy(v.forgiveUntil);
			if (v.picks && typeof v.picks === "object") picks = v.picks;
			if (v.shape && typeof v.shape === "object") shape = v.shape;
			if (v.hours && typeof v.hours === "object") hours = v.hours;
			if (v.counts && typeof v.counts === "object") counts = v.counts;
		} catch {
			// corrupt blob, start clean
		}
	});

	$effect(() => {
		localStorage.setItem(KEY, JSON.stringify({ raw, target, waiver, picks, shape, hours, counts }));
	});

	const forgiveUntil = $derived(isoOf(waiver));
	const rows = $derived(parseReport(raw));
	const parsed = $derived(toCourses(rows, parseForgiveDate(forgiveUntil)));
	// The report is the starting point: which components a course has, and which
	// weekdays each meets on. Both are yours to change — a tutorial the report
	// doesn't track, a practical you don't have. "Left" follows from the days.
	const courses: ParsedCourse[] = $derived(
		parsed.map((c) => {
			const parsedComps = new Map(c.components.map((k) => [k.type, k]));
			const types = shape[c.id] ?? c.components.map((k) => k.type);
			return {
				...c,
				components: COMPONENTS.filter((t) => types.includes(t)).map((t) => {
					const base = parsedComps.get(t) ?? {
						type: t,
						attended: 0,
						missed: 0,
						leaves: 0,
						remaining: 0,
						hrs: 1,
						days: []
					};
					const days = picks[key(c.id, t)] ?? base.days;
					return {
						...base,
						days,
						attended: counts[`${key(c.id, t)}/attended`] ?? base.attended,
						missed: counts[`${key(c.id, t)}/missed`] ?? base.missed,
						leaves: counts[`${key(c.id, t)}/leaves`] ?? base.leaves,
						hrs: hours[key(c.id, t)] ?? base.hrs,
						remaining: counts[`${key(c.id, t)}/remaining`] ?? classesLeft(days, left)
					};
				})
			};
		})
	);

	const forgiven = $derived(courses.reduce((n, c) => n + c.forgiven, 0));
	const set = $derived(courses.filter(ready));
	const below = $derived(
		set.filter((c) => {
			const s = stats(c, target);
			return s.current !== null && s.current < target;
		}).length
	);

	const fmt = (n: number) => n.toFixed(1);

	function toggleDay(id: string, type: ComponentType, days: number[], d: number) {
		picks = {
			...picks,
			[key(id, type)]: days.includes(d)
				? days.filter((x) => x !== d)
				: WEEKDAYS.filter((x) => x === d || days.includes(x))
		};
		// the days are back in charge of "Left" now
		const { [`${key(id, type)}/remaining`]: _, ...rest } = counts;
		counts = rest;
	}

	const setTypes = (c: ParsedCourse, types: ComponentType[]) =>
		(shape = { ...shape, [c.id]: types });

	const setHrs = (id: string, type: ComponentType, v: number) =>
		(hours = { ...hours, [key(id, type)]: Math.max(0, v || 0) });


	const setCount = (id: string, type: ComponentType, field: CountField, v: number) =>
		(counts = { ...counts, [`${key(id, type)}/${field}`]: Math.max(0, v || 0) });

	const edited = (id: string, type: ComponentType) =>
		COUNTS.some((f) => `${key(id, type)}/${f}` in counts);

	/** back to whatever the report itself said */
	function resetCounts(id: string, type: ComponentType) {
		const out = { ...counts };
		for (const f of COUNTS) delete out[`${key(id, type)}/${f}`];
		counts = out;
	}
</script>

<Seo
	title="New Attendance Calculator"
	description="Paste your SAMS course-wise attendance report and get every course's percentage, with the attendance waiver up to 7 September already applied."
	image="attendance-calculator"
/>

<main class="att">
	<header class="att-head">
		<h1>New Attendance Calculator</h1>
		<p class="sub">
			Paste your course-wise attendance report and it reads every course off it.
			Absences up to the waiver date are credited back to you, which the portal
			hasn't done yet.
		</p>
	</header>

	<section class="paste">
		<p class="howto">
			<a href="https://snulinks.snu.edu.in/" target="_blank" rel="noopener">SNU Links</a>
			→ Student Attendance Recording → Reports → <b>Course-wise Attendance View</b>.
			Select the whole page, copy, and paste it here. Nothing leaves your browser.
		</p>

		<textarea
			class="input src"
			rows={rows.length ? 3 : 8}
			spellcheck="false"
			placeholder={"Course Code\n17 Aug-1\n19 Aug-1\nCCC448 - LECCCF    P    A"}
			bind:value={raw}
		></textarea>

		<div class="paste-foot">
			{#if raw && !rows.length}
				<span class="miss">
					No course rows in that. Copy the whole report page, not just a selection.
				</span>
			{:else if rows.length}
				<span class="found">
					{rows.length} section{rows.length === 1 ? "" : "s"} · {courses.length} course{courses.length ===
					1
						? ""
						: "s"}
					{#if forgiven}· <b>{forgiven}</b> absence{forgiven === 1 ? "" : "s"} credited{/if}
				</span>
			{/if}
			{#if raw}
				<button class="btn btn-sm" onclick={() => ((raw = ""), (picks = {}), (shape = {}))}>
					Clear
				</button>
			{/if}
		</div>
	</section>

	<div class="bar">
		<span class="bar-group">
			<label for="target">Target</label>
			<input
				id="target"
				class="input target-input"
				type="number"
				min="1"
				max="100"
				bind:value={target}
			/>
			<span class="pcnt">%</span>
			{#each PRESETS as preset}
				<button
					class="btn btn-sm"
					class:on={target === preset}
					onclick={() => (target = preset)}>{preset}</button
				>
			{/each}
		</span>

		<span class="bar-sep"></span>

		<span class="bar-group">
			<label for="waiver">Waiver up to</label>
			<input
				id="waiver"
				class="input date-input"
				class:bad-date={waiver.trim() !== "" && !forgiveUntil}
				type="text"
				inputmode="numeric"
				placeholder="DD/MM/YYYY"
				bind:value={waiver}
			/>
			{#if waiver}
				<button class="btn btn-sm" onclick={() => (waiver = "")}>Off</button>
			{:else}
				<button class="btn btn-sm" onclick={() => (waiver = dmy(FORGIVE_UNTIL))}>
					{dmy(FORGIVE_UNTIL)}
				</button>
			{/if}
		</span>
	</div>

	{#if courses.length}
		{@const waiting = courses.length - set.length}
		<section class="tally" class:waiting={waiting > 0}>
			{#if waiting}
				<span class="tally-n">{waiting}</span>
				<span class="tally-label">
					<span>course{waiting === 1 ? "" : "s"} still need an <b>Hour / class</b></span>
					<span class="tally-sub">
						A two-hour practical weighs twice what a lecture does, so a course total
						waits for that number rather than assuming one hour and getting it wrong.
					</span>
				</span>
			{:else}
				<span class="tally-n">
					{set.length - below}<span class="tally-of">/{set.length}</span>
				</span>
				<span class="tally-label">
					courses at or above {target}%
					<span class="tally-sub">
						{forgiven} absence{forgiven === 1 ? "" : "s"} credited ·
						{totalDays(left)} teaching days left since {dmy(SEM_START)}
					</span>
				</span>
			{/if}
		</section>
	{/if}

	<div class="cards">
		{#each courses as course (course.id)}
			{@const s = stats(course, target)}
			{@const ok = ready(course)}
			<section class="card">
				<div class="card-head">
					<h2 class="name">{course.name}</h2>
					<span class="sections">{course.sections.join(" · ")}</span>
				</div>

				<div class="grid grid-head">
					<span></span>
					<span>Attended</span>
					<span>Missed</span>
					<span>Left</span>
					<span title="Leave — doesn't count against you">Leave</span>
					<span title="How long one class of this component runs">Hour / class</span>
					<span class="col-pct">Now</span>
				</div>

				{#each course.components as comp (comp.type)}
					{@const cs = statsFor(comp.attended, comp.missed, comp.remaining, target)}
					{@const hrsSet = hasHrs(course.id, comp.type)}
					<div class="grid">
						<span class="ctype">{comp.type}</span>
						<label class="cell">
							<span class="m-label">Attended</span>
							<input
								class="input n"
								type="number"
								min="0"
								value={comp.attended}
								oninput={(e) => setCount(course.id, comp.type, "attended", +e.currentTarget.value)}
							/>
						</label>
						<label class="cell" class:miss={comp.missed > 0}>
							<span class="m-label">Missed</span>
							<input
								class="input n"
								type="number"
								min="0"
								value={comp.missed}
								oninput={(e) => setCount(course.id, comp.type, "missed", +e.currentTarget.value)}
							/>
						</label>
						<label class="cell">
							<span class="m-label">Left</span>
							<input
								class="input n"
								type="number"
								min="0"
								title="Counted off the days below — type over it if that's not the pattern"
								value={comp.remaining}
								oninput={(e) => setCount(course.id, comp.type, "remaining", +e.currentTarget.value)}
							/>
						</label>
						<label class="cell">
							<span class="m-label">Leave</span>
							<input
								class="input n"
								type="number"
								min="0"
								title="Menstrual or medical leave — counts as neither attended nor missed"
								value={comp.leaves}
								oninput={(e) => setCount(course.id, comp.type, "leaves", +e.currentTarget.value)}
							/>
						</label>
						<label class="cell hrs-cell" class:unset={!hrsSet}>
							<span class="m-label">Hour / class</span>
							<input
								class="input n"
								type="number"
								min="0"
								step="0.5"
								placeholder="?"
								title="How long one {comp.type} class runs. Nothing is assumed — set it."
								value={hrsSet ? comp.hrs : ""}
								oninput={(e) => setHrs(course.id, comp.type, +e.currentTarget.value)}
							/>
						</label>
						<span class="col-pct mono" class:bad={cs.current !== null && cs.current < target}>
							{cs.current === null ? "—" : fmt(cs.current) + "%"}
						</span>
					</div>

					<details
						class="picker"
						open={isOpen(course.id, comp.type)}
						ontoggle={(e) =>
							(opened = {
								...opened,
								[key(course.id, comp.type)]: e.currentTarget.open
							})}
					>
						<summary class:unset={!comp.days.length}>
							<span class="sum-days">
								{comp.days.length
									? comp.days.map((d) => DAY_NAMES[d]).join(" · ")
									: "No days picked"}
							</span>
							<span class="sum-hrs">change days</span>
						</summary>

						<div class="pick-body">
							<div class="pick-row">
								{#each WEEKDAYS as d}
									<button
										class="d"
										class:on={comp.days.includes(d)}
										onclick={() => toggleDay(course.id, comp.type, comp.days, d)}
										aria-pressed={comp.days.includes(d)}
										title="{left[d]} {DAY_NAMES[d]}s left this semester"
									>
										{DAY_NAMES[d]}<span class="d-n">{left[d]}</span>
									</button>
								{/each}
							</div>

							<span class="tools">
								{#if edited(course.id, comp.type)}
									<button
										class="drop"
										onclick={() => resetCounts(course.id, comp.type)}
										title="Back to what the report says">Reset counts</button
									>
								{/if}
								<button
									class="drop"
									onclick={() =>
										setTypes(
											course,
											course.components.map((k) => k.type).filter((t) => t !== comp.type)
										)}
									title="This course has no {comp.type}">Remove {comp.type}</button
								>
							</span>
						</div>
					</details>
				{/each}

				{#if course.components.length < COMPONENTS.length}
					{@const missing = COMPONENTS.filter(
						(t) => !course.components.some((k) => k.type === t)
					)}
					<div class="adds">
						{#each missing as t}
							<button
								class="add-comp"
								onclick={() =>
									setTypes(course, [...course.components.map((k) => k.type), t])}
								>+ {t}</button
							>
						{/each}
					</div>
				{/if}

				<div class="out">
					<div class="big" class:bad={ok && s.current !== null && s.current < target}>
						{!ok || s.current === null ? "—" : fmt(s.current) + "%"}
						<span class="big-label">course total</span>
					</div>
					{#if !ok}
						<div class="range">
							<span class="needs">Fill in <b>Hour / class</b> and this total appears.</span>
						</div>
					{:else}
					<div class="range">
						<span>Best case <b>{fmt(s.best)}%</b></span>
						<span>Skip everything left <b>{fmt(s.worst)}%</b></span>
					</div>
					{/if}
				</div>

				<p class="verdict" class:bad={s.impossible}>
					{#if !ok}
						&nbsp;
					{:else if s.impossible}
						Can't reach {target}% any more — best you can finish at is {fmt(s.best)}%.
					{:else if s.mustAttend > 0}
						Attend <b>{fmt(s.mustAttend)} hrs</b> of what's left
						{#if s.canSkip > 0}— you can skip <b>{fmt(s.canSkip)} hrs</b>.
						{:else}— every single one.{/if}
					{:else if s.canSkip > 0}
						You're clear. You can skip <b>{fmt(s.canSkip)} hrs</b> more and still hold {target}%.
					{:else}
						Nothing left to attend.
					{/if}
				</p>
			</section>
		{/each}
	</div>

	<div class="note">
		<p>
			<b>Left</b> comes from the days under each component: the report's own
			dates say which weekdays it has met on, and the academic calendar says how
			many of those are still to come. Open <b>change days</b> to add or drop one,
			or type straight over the Left box. Attended, Missed and Leave are yours to
			correct too — the report is only the starting point.
		</p>
		<p>
			<b>+ TUT</b>, <b>+ PRAC</b> and <b>+ LEC</b> add a component the report
			doesn't carry — a tutorial that isn't tracked yet, say. <b>Remove</b> takes
			one off a course that doesn't have it. Anything the report did carry comes
			back with its numbers intact if you add it again.
		</p>
		<p>
			<b>Credited</b> — absences on or before the waiver date, counted as
			attended. The portal will catch up eventually; until it does, this is what
			your percentage actually is.
		</p>
		<p>
			<b>Hour / class</b> — how long one class of that component runs. Nothing is
			assumed, so the box starts empty and the course total waits for it. Every
			total on the card is then in hours. A component that meets twice on the same
			day is the same thing: give it two hours.
		</p>
		<p>
			Shiv Nadar IoE expects you at every scheduled class. Nothing here is an
			allowance to skip — the only absences you're permitted are the ones covered
			by a waiver you've actually been granted. This page just does the arithmetic
			on where that leaves you.
		</p>
		<p>
			LEC, TUT and PRAC are added up, since attendance is judged on the course
			total. A tutorial and a practical on the same day stay separate — the
			report gives each its own row, so each keeps its own P and A.
			<b>Leave</b> counts as neither attended nor missed. Saved in this browser only.
		</p>
	</div>
</main>

<style>
	.att {
		flex: 1;
		width: 100%;
		max-width: 1140px;
		margin: 0 auto;
		padding: 4rem 1.5rem 3rem;
		overflow-x: clip;
	}

	.att-head {
		margin-bottom: 2rem;
	}

	.sub {
		margin-top: 0.5rem;
		color: var(--text-secondary);
		font-size: 0.9rem;
		max-width: 60ch;
	}

	.needs {
		color: var(--bad);
		max-width: 30ch;
	}

	.needs b {
		color: var(--bad);
		font-weight: 500;
	}

	.howto {
		margin-bottom: 0.5rem;
		font-size: 0.76rem;
		line-height: 1.6;
		color: var(--text-muted);
		max-width: 72ch;
	}

	.howto b {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.howto a {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	/* the paste box */
	.paste {
		margin-bottom: 1.25rem;
	}

	.src {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.6;
		resize: vertical;
		white-space: pre;
		overflow-wrap: normal;
		overflow-x: auto;
	}

	.paste-foot {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.paste-foot .btn {
		margin-left: auto;
	}

	.found b {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.miss {
		color: var(--bad);
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.9rem;
		margin-bottom: 1.25rem;
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.bar-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.bar-sep {
		width: 1px;
		align-self: stretch;
		background: var(--border);
	}

	.bar-group .btn {
		padding-inline: 0.6rem;
	}

	.bar-group .on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}

	.target-input {
		width: 4rem;
		padding-inline: 0.5rem;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	/* the spinner eats the room the number needs */
	.target-input::-webkit-outer-spin-button,
	.target-input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.bad-date {
		border-color: var(--bad);
		color: var(--bad);
	}

	.date-input {
		width: 8.5rem;
		padding-inline: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.pcnt {
		margin-left: -0.25rem;
	}

	/* headline count, cut like the semester box on the other calculator */
	.tally {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
	}

	.tally-n {
		font-family: var(--font-mono);
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.tally-of {
		color: var(--text-muted);
		font-size: 1.1rem;
	}

	.tally-label {
		display: flex;
		flex-direction: column;
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.tally-sub {
		font-size: 0.68rem;
		line-height: 1.5;
		color: var(--text-muted);
		max-width: 70ch;
	}

	.tally.waiting {
		border-color: var(--bad);
	}

	.tally.waiting .tally-n,
	.tally.waiting b {
		color: var(--bad);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(28rem, 100%), 1fr));
		/* every card the same size, whatever the tallest one needs */
		grid-auto-rows: 1fr;
		gap: 1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
	}

	.card-head {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin-bottom: 1rem;
	}

	.name {
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.sections {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
		margin-left: auto;
	}

	.grid {
		display: grid;
		min-width: 0;
		grid-template-columns: 2.8rem repeat(5, minmax(0, 1fr)) 3.2rem;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.4rem;
	}

	.grid-head {
		font-size: 0.66rem;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
		text-align: center;
	}

	.grid-head .col-pct {
		text-align: right;
	}

	.ctype {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.cell {
		display: flex;
		justify-content: center;
		min-width: 0;
		font-size: 0.8rem;
	}

	.cell.miss .n {
		color: var(--bad);
	}

	/* nothing is assumed about how long a class runs, so an empty one shouts */
	.hrs-cell.unset .n {
		border-color: var(--bad);
		color: var(--bad);
	}

	.hrs-cell.unset .n::placeholder {
		color: var(--bad);
		opacity: 0.8;
	}

	.n {
		min-width: 0;
		padding: 0.45rem 0.25rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	/* which weekdays this component meets on, and how long a class runs — both
	   set once and then out of the way, so the cards stay the same shape */
	.picker {
		padding-left: 2.8rem;
		margin-bottom: 0.9rem;
	}

	.picker summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.5rem;
		border: 1px dashed var(--border-hover);
		border-radius: var(--radius-sm);
		list-style: none;
		cursor: pointer;
		font-size: 0.68rem;
		color: var(--text-muted);
		transition: all 0.15s;
	}

	.picker summary::-webkit-details-marker {
		display: none;
	}

	.picker summary::before {
		content: "+";
		font-size: 0.75rem;
		line-height: 1;
		opacity: 0.7;
	}

	.picker[open] summary::before {
		content: "−";
	}

	.picker summary.unset {
		border-color: var(--bad);
		border-style: solid;
		color: var(--bad);
	}

	.picker summary.unset .sum-days {
		color: var(--bad);
	}

	.picker summary:hover {
		border-color: var(--text-secondary);
		color: var(--text-secondary);
	}

	.sum-days {
		color: var(--text-secondary);
		letter-spacing: 0.03em;
	}

	.sum-hrs {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.66rem;
	}

	.pick-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem 0 0.15rem;
	}

	.pick-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}

	.d {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		padding: 0.2rem 0.4rem;
		background: var(--bg-input);
		border: 1px dashed var(--border-hover);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.68rem;
		letter-spacing: 0.03em;
		cursor: pointer;
		transition: all 0.15s;
	}

	.d:hover {
		border-color: var(--text-secondary);
		color: var(--text);
	}

	.d.on {
		background: var(--text);
		border-style: solid;
		border-color: var(--text);
		color: var(--bg);
	}

	.d-n {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		opacity: 0.6;
	}

	.tools {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.3rem;
	}

	.drop,
	.add-comp {
		padding: 0.2rem 0.45rem;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.68rem;
		cursor: pointer;
		transition: color 0.15s;
	}


	.drop:hover,
	.add-comp:hover {
		color: var(--text);
	}

	.adds {
		display: flex;
		gap: 0.2rem;
		padding-left: 2.8rem;
		margin-top: -0.35rem;
	}

	.add-comp {
		border: 1px dashed var(--border-hover);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
	}

	.add-comp:hover {
		border-color: var(--text-secondary);
	}

	.col-pct {
		text-align: right;
		font-size: 0.78rem;
	}

	.mono {
		font-family: var(--font-mono);
		color: var(--text-secondary);
	}

	.mono.bad {
		color: var(--text-muted);
	}

	.m-label {
		display: none;
	}

	/* the totals sit on the floor of the card, so they line up across a row */
	.out {
		display: flex;
		align-items: baseline;
		gap: 1.25rem;
		flex-wrap: wrap;
		margin-top: auto;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
	}

	.big {
		font-family: var(--font-mono);
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.big.bad {
		color: var(--text-secondary);
	}

	.big-label {
		font-family: var(--font);
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-left: 0.4rem;
	}

	.range {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.range b {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-weight: 500;
	}

	.verdict {
		margin-top: 0.9rem;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.verdict b {
		color: var(--text);
	}

	.verdict.bad {
		color: var(--text-muted);
	}

	.note {
		margin-top: 1.5rem;
		font-size: 0.78rem;
		line-height: 1.6;
		color: var(--text-muted);
		max-width: 65ch;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.note b {
		color: var(--text-secondary);
		font-weight: 500;
	}

	@media (max-width: 560px) {
		.att {
			padding: 2.5rem 1rem 2.5rem;
		}

		.card {
			padding: 1rem;
		}

		.bar {
			gap: 0.5rem;
		}

		.bar-sep {
			display: none;
		}

		.bar-group {
			flex: 1 0 100%;
		}

		/* the field takes whatever the label and button leave */
		.date-input {
			flex: 1;
			width: auto;
		}

		.grid-head {
			display: none;
		}

		/* same tiles as the other calculator once the columns won't fit */
		.grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 0.5rem;
			padding-bottom: 0.75rem;
			margin-bottom: 0.75rem;
			border-bottom: 1px solid var(--border);
		}

		/* the total's own rule follows straight after, so don't draw two */
		.grid:has(+ .out) {
			border-bottom: none;
			padding-bottom: 0;
		}

		.ctype {
			grid-column: 1 / 4;
		}

		.col-pct {
			grid-column: 4 / 7;
			grid-row: 1;
		}

		/* three tiles, then Leave and the wider Hours tile fill the next row */
		.cell {
			grid-column: span 2;
		}

		.hrs-cell {
			grid-column: span 4;
		}

		.picker,
		.adds {
			padding-left: 0;
		}

		.cell {
			flex-direction: column;
			align-items: center;
			gap: 0.1rem;
			min-width: 0;
			padding: 0.4rem 0.3rem 0.45rem;
			background: var(--bg-input);
			border: 1px dashed var(--border-hover);
			border-radius: var(--radius);
		}

		.cell .n {
			width: 100%;
			padding: 0;
			border: none;
			background: transparent;
			line-height: 1.3;
			appearance: textfield;
			-moz-appearance: textfield;
		}

		.cell .n:focus {
			box-shadow: none;
		}

		/* spinners eat width the number needs */
		.cell .n::-webkit-outer-spin-button,
		.cell .n::-webkit-inner-spin-button {
			appearance: none;
			margin: 0;
		}

		.m-label {
			display: block;
			font-size: 0.68rem;
			letter-spacing: 0.04em;
			color: var(--text-muted);
			white-space: nowrap;
		}
	}
</style>
