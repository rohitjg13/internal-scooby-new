<script lang="ts">
	import { onMount } from "svelte";
	import "../app.css";
	let { children } = $props();

	// "" means no choice made: follow the system, which the CSS already does.
	let theme = $state<"" | "light" | "dark">("");

	onMount(() => {
		const saved = localStorage.getItem("scooby:theme");
		if (saved === "light" || saved === "dark") theme = saved;
	});

	// System → Light → Dark → System. Cycling through all three keeps "follow
	// my system" reachable instead of stranding you on an explicit choice.
	const NEXT = { "": "light", light: "dark", dark: "" } as const;

	function cycle() {
		theme = NEXT[theme];
		const root = document.documentElement;
		if (theme) {
			root.setAttribute("data-theme", theme);
			localStorage.setItem("scooby:theme", theme);
		} else {
			root.removeAttribute("data-theme");
			localStorage.removeItem("scooby:theme");
		}
	}

	const LABEL = { "": "System", light: "Light", dark: "Dark" };
</script>

<svelte:head>
	<meta name="theme-color" content="#faf9f7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#131211" media="(prefers-color-scheme: dark)" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="preconnect"
		href="https://fonts.gstatic.com"
		crossorigin="anonymous"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Libre+Franklin:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="app-container">
	{@render children()}

	<footer class="footer">
		<button class="theme" onclick={cycle} title="Switch theme">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
				{#if theme === "dark"}
					<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
				{:else if theme === "light"}
					<circle cx="12" cy="12" r="4" />
					<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
				{:else}
					<circle cx="12" cy="12" r="8" />
					<path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
				{/if}
			</svg>
			{LABEL[theme]}
		</button>
		<span class="rule"></span>
		<p>
			Built and maintained by <a
				href="https://github.com/rohitjg13"
				target="_blank"
				rel="noopener noreferrer">Rohit J G</a
			>
			with the Academic Committee · <a href="/credits">Credits</a>
		</p>
	</footer>
</div>

<style>
	.app-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: auto;
		padding: 2.5rem 1.5rem 2rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.theme {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 auto 1.5rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-card);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.theme:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.theme svg {
		width: 14px;
		height: 14px;
	}

	.rule {
		display: block;
		width: 28px;
		height: 1px;
		margin: 0 auto 1.25rem;
		background: var(--border-hover);
	}

	.footer a {
		color: var(--text-secondary);
		text-decoration: none;
		border-bottom: 1px solid var(--border-hover);
		transition: color 0.15s;
	}

	.footer a:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
</style>
