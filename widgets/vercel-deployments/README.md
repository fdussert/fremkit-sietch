# Vercel Deployments

Shows up to ten recent deployments from a Vercel personal account or team. Filter the tile by project name or deployment state.

The widget uses a Fremkit `vercel` connection and the `vercel:*` read-only provider channel. It needs the paired Fremkit core change that adds that connection type and provider; older Fremkit hosts will not supply deployment data until that core change is released.

The public preview uses fictional data only. See [`docs/screenshots/vercel-deployments-demo.png`](../../docs/screenshots/vercel-deployments-demo.png).
