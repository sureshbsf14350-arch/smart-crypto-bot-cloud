SMART CRYPTO BOT PWA v3 — CORS FIX

This package adds a Netlify Function proxy. Browser fetches same-origin /.netlify/functions/candles; the function fetches public CoinDCX Futures candles server-side.

Deploy the COMPLETE folder structure, not only index.html. Root must include index.html, app.js, manifest.webmanifest, sw.js, netlify.toml, and netlify/functions/candles.mjs.

On Android: extract ZIP; in Netlify Drop select the complete extracted folder. If the deployed file browser only lists index.html, the deploy is incomplete. Function must appear in Netlify Functions list as candles.

Test after deploy: https://YOUR-SITE/.netlify/functions/candles?pair=B-BTC_USDT&from=1786579200&to=1794355200&resolution=60&pcode=f
Expected JSON with s=ok and data array.

PAPER ONLY. No API keys, private account access or real orders. Signal score is not win probability. No 70% accuracy guarantee. Background Android execution is not guaranteed. Fees, funding, spread, slippage, leverage, liquidation and exchange order precision are not modelled.
