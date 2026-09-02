<script lang="ts">
	import "../app.css";
	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#0b0a09" />
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
		margin-top: auto;
		padding: 2.5rem 1.5rem 2rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8rem;
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
