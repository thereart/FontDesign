#!/usr/bin/env node
// Local web UI for Font Design v2 (typography audit). Run: node server.mjs (or double-click Start.bat), then open http://localhost:4342
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { renderFonts, cssFonts } from './scrape-fonts.mjs';
import { audit, recommendedCss, suggestPairings, PROPERTY_LABELS } from './audit.mjs';

const PORT = Number(process.env.PORT) || 4342;
const page = new URL('./index.html', import.meta.url);
const cache = new Map(); // method:url -> result, so switching views doesn't re-read the site

const send = (res, status, body, type = 'application/json') => {
	res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
	res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

createServer(async (req, res) => {
	const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
	if (pathname === '/') return send(res, 200, readFileSync(page), 'text/html');
	if (pathname === '/api/config') return send(res, 200, { propertyTypes: PROPERTY_LABELS });
	if (pathname !== '/api/fonts') return send(res, 404, { error: 'Not found' });

	let target = (searchParams.get('url') || '').trim();
	if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
	try {
		target = new URL(target).href;
	} catch {
		return send(res, 400, { error: "That doesn't look like a website address." });
	}
	const render = searchParams.get('render') !== '0';
	const key = `${render ? 'rendered' : 'css'}:${target}`;
	try {
		let result = searchParams.get('fresh') !== '1' && cache.get(key);
		if (!result && render) {
			try {
				result = await renderFonts(target);
			} catch (err) {
				// No browser or add-on: read the CSS instead, and say so. Real page errors still fail.
				if (!err.message.startsWith('"Measure')) throw err;
				result = { ...(await cssFonts(target)), warning: err.message };
			}
		}
		result ||= await cssFonts(target);
		if (!result.typefaces.length) return send(res, 422, { error: 'No fonts were found on that page.' });
		if (cache.size > 20) cache.delete(cache.keys().next().value);
		cache.set(key, result);
		// The audit needs the page measurements; a CSS-only read can still suggest pairings.
		const property = PROPERTY_LABELS[searchParams.get('property')] ? searchParams.get('property') : 'none';
		const { checks, ...shown } = result;
		send(res, 200, {
			...shown,
			audit: checks ? audit(result) : null,
			css: checks ? recommendedCss(result) : null,
			pairings: suggestPairings(result, property),
			measured: checks ? { fontFiles: checks.fonts.files, fontKB: Math.round(checks.fonts.bytes / 1024), zoomOverflow: checks.zoom.overflow, inputs: checks.inputs.length } : null,
		});
	} catch (err) {
		const blocked = /^(401|403|429|503)\b|bot check/.test(err.message);
		const advice = !blocked ? 'Check the address and try again.'
			: render ? 'This site blocks automated visits, so its fonts can\'t be read automatically.'
			: 'The site may block automated downloads: try turning on "Measure as visitors see it".';
		send(res, 502, { error: `Couldn't read that website (${err.message}). ${advice}` });
	}
}).on('error', (err) => {
	if (err.code !== 'EADDRINUSE') throw err;
	console.error(`Font Design v2 is already running (port ${PORT} is in use). Open http://localhost:${PORT} in your browser, or close the other Font Design window first.`);
	process.exit(1);
}).listen(PORT, '127.0.0.1', () => console.log(`Font Design v2 is running: http://localhost:${PORT}  (close this window to stop it)`));
