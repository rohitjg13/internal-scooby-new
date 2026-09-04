<script lang="ts">
	import type { Club } from "$lib/types";
	import clubsData from "$lib/data/clubs.json";
	import { fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";

	const clubs = clubsData as unknown as Club[];

	type Filter = "all" | "cultural" | "technical";

	let filter = $state<Filter>("all");
	let search = $state("");
	let selected = $state<Club | null>(null);
	let closeBtn = $state<HTMLButtonElement | null>(null);

	// Descriptions longer than this get clamped in the card + a "Read more".
	const LONG = 170;
	const isLong = (c: Club) => c.details.length > LONG;

	function close() {
		selected = null;
	}

	// Enter animation: slide up (bottom sheet) on mobile, scale on desktop.
	function popIn(_node: Element) {
		const mobile =
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 600px)").matches;
		if (mobile) {
			return {
				duration: 260,
				easing: cubicOut,
				css: (t: number) => `transform: translateY(${(1 - t) * 100}%);`,
			};
		}
		return {
			duration: 180,
			easing: cubicOut,
			css: (t: number) =>
				`transform: scale(${0.96 + t * 0.04}); opacity: ${t};`,
		};
	}

	// While the dialog is open, lock background scroll and focus the close button.
	$effect(() => {
		if (!selected) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeBtn?.focus();
		return () => {
			document.body.style.overflow = prev;
		};
	});

	const counts = {
		all: clubs.length,
		cultural: clubs.filter((c) => c.category === "cultural").length,
		technical: clubs.filter((c) => c.category === "technical").length,
	};

	const tabs: { key: Filter; label: string }[] = [
		{ key: "all", label: "All" },
		{ key: "cultural", label: "Cultural" },
		{ key: "technical", label: "Technical" },
	];

	let visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return clubs.filter((c) => {
			if (filter !== "all" && c.category !== filter) return false;
			if (!q) return true;
			return (
				c.name.toLowerCase().includes(q) ||
				c.details.toLowerCase().includes(q) ||
				c.handle.toLowerCase().includes(q)
			);
		});
	});

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join("")
			.toUpperCase();
	}
</script>

{#snippet contactLinks(club: Club)}
	{#if club.instagram}
		<a
			class="contact"
			href={club.instagram}
			target="_blank"
			rel="noopener noreferrer"
		>
			<svg
				class="contact-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="3" y="3" width="18" height="18" rx="5" />
				<circle cx="12" cy="12" r="4" />
				<path d="M17.5 6.5h.01" />
			</svg>
			<span>{club.handle || "Instagram"}</span>
		</a>
	{/if}
	{#if club.email}
		<a class="contact" href="mailto:{club.email}">
			<svg
				class="contact-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="3" y="5" width="18" height="14" rx="2" />
				<path d="M4 7.5l8 5.5 8-5.5" />
			</svg>
			<span>{club.email}</span>
		</a>
	{/if}
{/snippet}

<main class="clubs">
	<div class="intro">
		<p class="tagline">
			Explore the cultural and technical clubs on campus — what they do
			and where to find them.
		</p>
	</div>

	<div class="controls">
		<div class="tabs" role="tablist" aria-label="Club category">
			{#each tabs as t}
				<button
					class="tab"
					class:active={filter === t.key}
					role="tab"
					aria-selected={filter === t.key}
					onclick={() => (filter = t.key)}
				>
					{t.label}
					<span class="tab-count">{counts[t.key]}</span>
				</button>
			{/each}
		</div>

		<div class="search-wrap">
			<svg
				class="search-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" />
				<path d="M21 21l-4.3-4.3" />
			</svg>
			<input
				type="text"
				class="input search"
				placeholder="Search clubs"
				bind:value={search}
			/>
		</div>
	</div>

	{#if visible.length === 0}
		<div class="empty">
			<p>No clubs match “{search}”.</p>
		</div>
	{:else}
		<section class="grid">
			{#each visible as club (club.category + club.name)}
				<article class="card">
					<div
						class="card-head"
						role="button"
						tabindex="0"
						title="View {club.name} details"
						onclick={() => (selected = club)}
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								selected = club;
							}
						}}
					>
						<div class="logo-tile">
							{#if club.logo}
								<img
									src={club.logo}
									alt="{club.name} logo"
									loading="lazy"
								/>
							{:else}
								<span class="logo-fallback"
									>{initials(club.name)}</span
								>
							{/if}
						</div>
						<div class="head-text">
							<h2 class="club-name">{club.name}</h2>
							<span class="cat-badge {club.category}"
								>{club.category}</span
							>
						</div>
					</div>

					<p class="details" class:clamp={isLong(club)}>
						{club.details}
					</p>
					{#if isLong(club)}
						<button class="more-btn" onclick={() => (selected = club)}>
							Read more
						</button>
					{/if}

					{#if club.instagram || club.email}
						<div class="card-links">
							{@render contactLinks(club)}
						</div>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
</main>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") close();
	}}
/>

{#if selected}
	<div class="overlay">
		<button
			class="backdrop"
			aria-label="Close"
			onclick={close}
			transition:fade={{ duration: 150 }}
		></button>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="club-modal-title"
			transition:popIn
		>
			<div class="grabber" aria-hidden="true"></div>
			<button
				class="modal-close"
				aria-label="Close"
				onclick={close}
				bind:this={closeBtn}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>

			<div class="modal-head">
				<div class="logo-tile modal-logo">
					{#if selected.logo}
						<img src={selected.logo} alt="{selected.name} logo" />
					{:else}
						<span class="logo-fallback">{initials(selected.name)}</span>
					{/if}
				</div>
				<div class="head-text">
					<h2 id="club-modal-title" class="club-name">{selected.name}</h2>
					<span class="cat-badge {selected.category}"
						>{selected.category}</span
					>
				</div>
			</div>

			<div class="modal-body">
				<p>{selected.details}</p>
			</div>

			{#if selected.instagram || selected.email}
				<div class="card-links modal-links">
					{@render contactLinks(selected)}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.clubs {
		flex: 1;
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 3rem;
	}

	.intro {
		margin: 0.75rem 0 2rem;
	}

	.tagline {
		color: var(--text-secondary);
		font-size: 1rem;
		max-width: 60ch;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}

	.tabs {
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		border-radius: 7px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.tab:hover {
		color: var(--text);
	}

	.tab.active {
		background: var(--text);
		color: var(--bg);
	}

	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		opacity: 0.7;
	}

	.search-wrap {
		position: relative;
		flex: 1;
		min-width: 200px;
		max-width: 320px;
	}

	.search-icon {
		position: absolute;
		left: 0.8rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: var(--text-muted);
		pointer-events: none;
	}

	.input.search {
		padding-left: 2.3rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.1rem;
		align-items: start;
	}

	.card {
		display: flex;
		flex-direction: column;
		padding: 1.35rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 14px;
		transition:
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.card:hover {
		border-color: var(--border-hover);
		transform: translateY(-2px);
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 1rem;
		cursor: pointer;
		border-radius: 10px;
		outline-offset: 3px;
	}

	.card-head:focus-visible {
		outline: 2px solid var(--text-secondary);
	}

	.card-head:hover .club-name {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.card-head:hover .logo-tile {
		border-color: var(--border-hover);
	}

	.logo-tile {
		flex-shrink: 0;
		width: 56px;
		height: 56px;
		border-radius: 12px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.logo-tile img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 5px;
	}

	.logo-fallback {
		font-weight: 600;
		color: var(--text);
		font-size: 1.1rem;
	}

	.head-text {
		min-width: 0;
	}

	.club-name {
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.25;
	}

	.cat-badge {
		display: inline-block;
		margin-top: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--text-secondary);
	}

	.details {
		color: var(--text-secondary);
		font-size: 0.875rem;
		line-height: 1.55;
	}

	.details.clamp {
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.more-btn {
		align-self: flex-start;
		margin-top: 0.5rem;
		padding: 0;
		background: none;
		border: none;
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.more-btn:hover {
		opacity: 0.75;
	}

	.card-links {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.55rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.contact {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		max-width: 100%;
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 0.85rem;
		transition: color 0.15s;
		word-break: break-all;
	}

	.contact:hover {
		color: var(--text);
	}

	.contact-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.empty {
		padding: 4rem 1rem;
		text-align: center;
		color: var(--text-secondary);
	}

	/* Modal */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: none;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.modal {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 560px;
		max-height: 85vh;
		padding: 1.75rem;
		background: var(--bg-card);
		border: 1px solid var(--border-hover);
		border-radius: 16px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
	}

	.grabber {
		display: none;
	}

	.modal-close {
		position: absolute;
		top: 0.9rem;
		right: 0.9rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--bg-input);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}

	.modal-close:hover {
		background: var(--bg-hover);
		border-color: var(--border-hover);
		color: var(--text);
	}

	.modal-close svg {
		width: 17px;
		height: 17px;
	}

	.modal-head {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding-right: 2.5rem;
		margin-bottom: 1.25rem;
	}

	.modal-logo {
		width: 64px;
		height: 64px;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		color: var(--text-secondary);
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.modal-links {
		margin-top: 1.25rem;
		gap: 0.7rem;
	}

	.modal-links .contact {
		font-size: 0.9rem;
	}

	@media (max-width: 600px) {
		.clubs {
			padding: 2rem 1rem 2rem;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.controls {
			flex-direction: column;
			align-items: stretch;
		}

		.search-wrap {
			max-width: none;
		}

		/* Bottom sheet on mobile: hugs content, slides up from the bottom */
		.overlay {
			padding: 0;
			align-items: flex-end;
		}

		.modal {
			max-width: none;
			width: 100%;
			max-height: 88dvh;
			border: none;
			border-radius: 22px 22px 0 0;
			padding: 0.75rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom));
		}

		.grabber {
			display: block;
			width: 40px;
			height: 4px;
			margin: 0.25rem auto 1rem;
			border-radius: 999px;
			background: var(--border-hover);
		}

		.modal-close {
			top: 0.85rem;
		}
	}
</style>
