// Finds every font and typeface on a web page.
//
// Rendered (default): opens the page in Edge or Chrome (already on the computer) through playwright-core.
// For each piece of visible text it asks the browser which font actually drew it (Chrome's
// CSS.getPlatformFontsForNode), so fallbacks and missing web fonts show up as they really are. Also
// lists every declared font file with whether it loaded, and draws a specimen of each typeface using
// the site's own loaded font.
//
// CSS (fallback): reads the HTML and stylesheets. Lists declared font families, @font-face files and
// Google Fonts links, ranked by how often the CSS uses them. No specimens or rendered sizes.
//
// Usage: node scrape-fonts.mjs <url> [output.json]

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extractFontCss, googleFamilies, providerOf, parseFamilies, isIconFont, isGeneric, summarise } from './font-utils.mjs';

const SPECIMEN = 'Aa Bb Cc Gg Qq 0123 — The quick brown fox jumps over the lazy dog';
const MAX_ELEMENTS = 1500;

export async function renderFonts(url) {
	let chromium;
	try {
		({ chromium } = await import('playwright-core'));
	} catch {
		throw new Error('"Measure as visitors see it" needs a one-off extra. Double-click Start.bat (it installs it), or run npm install in the FontDesign folder.');
	}
	let browser;
	for (const channel of ['msedge', 'chrome']) {
		try { browser = await chromium.launch({ channel }); break; } catch { /* try the next browser */ }
	}
	if (!browser) throw new Error('"Measure as visitors see it" needs Microsoft Edge or Google Chrome on this computer.');

	try {
		const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
		let response;
		try {
			response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
		} catch (err) {
			throw new Error(err.message.split('\n')[0].replace(/^page\.goto:\s*/, ''));
		}
		// A failed or blocked visit shows an error or "checking your browser" page, whose fonts aren't the site's.
		if (page.url().startsWith('chrome-error://')) throw new Error('the page couldn\'t be loaded (connection problem). Check the address and your internet connection, then try again');
		if (response && response.status() >= 400) throw new Error(`${response.status()}${response.statusText() ? ` ${response.statusText()}` : ''}`);
		if (/access denied|just a moment|attention required|are you a robot|verify you are human/i.test(await page.title())) throw new Error('the site showed a bot check instead of the page, so its fonts can\'t be read');
		await page.evaluate(() => document.fonts.ready);

		// Visible text elements, marked in document order so the browser's own font report can be matched to them.
		const { samples, faces, title } = await page.evaluate((max) => {
			const role = (el) => {
				const tag = el.tagName.toLowerCase();
				if (/^h[1-6]$/.test(tag) || el.closest('h1,h2,h3,h4,h5,h6')) return 'Headings';
				if (el.closest('button, [role="button"], input[type="submit"], .btn, .button, a.wp-block-button__link')) return 'Buttons';
				if (el.closest('nav, [role="navigation"], .menu, .nav')) return 'Navigation';
				if (el.closest('label, input, select, textarea, form')) return 'Forms';
				if (el.closest('a')) return 'Links';
				if (el.closest('footer, [role="contentinfo"]')) return 'Footer';
				if (el.closest('small, figcaption, .caption, sup, sub')) return 'Small print';
				return 'Body text';
			};
			const out = [];
			for (const el of document.querySelectorAll('body *')) {
				if (out.length >= max) break;
				if (el.closest('svg, script, style, noscript, template, iframe')) continue;
				const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
				if (!text) continue;
				if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) continue;
				const cs = getComputedStyle(el);
				const size = parseFloat(cs.fontSize);
				el.setAttribute('data-fd-i', String(out.length));
				out.push({
					tag: el.tagName.toLowerCase(), role: role(el), stack: cs.fontFamily, weight: Number(cs.fontWeight) || 400, style: cs.fontStyle,
					size: Math.round(size * 10) / 10, lineHeight: cs.lineHeight === 'normal' ? null : Math.round(parseFloat(cs.lineHeight) * 10) / 10,
					letterSpacing: cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing) * 100) / 100, transform: cs.textTransform,
					chars: text.length, text: text.slice(0, 80),
				});
			}
			// Every declared font face (CORS-proof, unlike reading stylesheets) and the file it loads from.
			const fileUrls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(u) || /fonts\.gstatic\.com|use\.typekit\.net\/af/.test(u));
			const faces = [...document.fonts].map((f) => {
				const family = f.family.replace(/^["']|["']$/g, '');
				const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
				return { family, weight: f.weight, style: f.style, status: f.status, url: fileUrls.find((u) => u.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key)) || null };
			});
			return { samples: out, faces, title: document.title };
		}, MAX_ELEMENTS);

		// Which font actually drew each element's text.
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('DOM.enable');
		await cdp.send('CSS.enable');
		const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
		const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-fd-i]' });
		for (let k = 0; k < nodeIds.length && k < samples.length; k++) {
			try {
				const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[k] });
				samples[k].platform = fonts.map(({ familyName, isCustomFont, glyphCount }) => ({ familyName, isCustomFont, glyphCount }));
			} catch { samples[k].platform = []; }
		}

		const pageUrl = page.url();
		const result = summarise(samples, faces, pageUrl);

		// Specimens: each typeface drawn by the page itself, so the site's loaded font is used.
		for (const t of result.typefaces.slice(0, 12)) {
			try {
				const handle = await page.evaluateHandle(({ stack, weight, style, text, icon }) => {
					const box = document.createElement('div');
					box.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; display: block; background: #fff; color: #111; padding: 12px 16px; width: 1000px; box-sizing: border-box;');
					const big = document.createElement('div');
					big.textContent = icon ? text.slice(0, 20) : text;
					big.setAttribute('style', `all: initial; display: block; font-family: ${stack}; font-weight: ${weight}; font-style: ${style}; font-size: 40px; line-height: 1.25; color: #111; white-space: nowrap; overflow: hidden;`);
					box.append(big);
					document.body.append(box);
					return box;
				}, { stack: t.stack, weight: t.mainWeight, style: t.styles[0] || 'normal', text: SPECIMEN, icon: t.type === 'icon font' });
				t.specimen = `data:image/png;base64,${(await handle.asElement().screenshot({ type: 'png' })).toString('base64')}`;
				await handle.evaluate((el) => el.remove());
			} catch { t.specimen = null; }
		}

		return { url: pageUrl, title, scrapedAt: new Date().toISOString(), method: 'rendered', ...result, textElements: samples.length };
	} finally {
		await browser.close();
	}
}

// CSS fallback: what the stylesheets declare, without seeing the page.
export async function cssFonts(pageUrl, { guard } = {}) {
	const get = async (u) => {
		if (guard) await guard(u);
		const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (font-scraper)' }, signal: AbortSignal.timeout(20000) });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.text();
	};
	const html = await get(pageUrl);
	const sheets = [];
	const queue = [];
	for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
		const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
		if (href && /rel\s*=\s*["'][^"']*stylesheet/i.test(tag)) queue.push(new URL(href.replace(/&amp;/g, '&'), pageUrl).href);
	}
	const faces = [], declarations = [], google = [], skipped = [];
	const read = (css, base) => {
		const found = extractFontCss(css, base);
		faces.push(...found.faces.map((f) => ({ ...f, sheet: base })));
		declarations.push(...found.declarations);
	};
	for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) read(css, pageUrl);
	for (const [, , style] of html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) read(`x{${style}}`, pageUrl);
	for (let i = 0; i < queue.length; i++) {
		const u = queue[i];
		google.push(...googleFamilies(u).map((g) => ({ ...g, url: u })));
		try {
			const css = await get(u);
			sheets.push(u);
			read(css, u);
			for (const [, imp] of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) {
				const next = new URL(imp, u).href;
				if (!queue.includes(next)) queue.push(next);
			}
		} catch (err) { skipped.push({ url: u, reason: err.message }); }
	}

	// One entry per typeface named in the CSS (the first non-generic family of each stack).
	const byFamily = new Map();
	const add = (family, stack, uses = 1) => {
		const e = byFamily.get(family) ?? { family, uses: 0, stacks: {} };
		e.uses += uses;
		if (stack) e.stacks[stack] = (e.stacks[stack] || 0) + uses;
		byFamily.set(family, e);
	};
	for (const d of declarations) {
		const fam = parseFamilies(d.stack).find((f) => !isGeneric(f) && !/^var\(/.test(f));
		if (fam) add(fam, d.stack);
	}
	for (const g of google) add(g.family, null, 0);
	const norm = (f) => f.toLowerCase().replace(/[^a-z0-9]/g, '');
	const totalUses = [...byFamily.values()].reduce((s, e) => s + e.uses, 0) || 1;
	const typefaces = [...byFamily.values()].map((e) => {
		const own = faces.filter((f) => norm(f.family) === norm(e.family));
		const g = google.find((x) => norm(x.family) === norm(e.family));
		const files = [...new Set(own.flatMap((f) => f.src))];
		const webFont = own.length > 0 || !!g;
		return {
			family: e.family, cssFamily: e.family,
			type: isIconFont(e.family) ? 'icon font' : webFont ? 'web font' : 'system font',
			provider: g ? 'Google Fonts' : files.length ? [...new Set(files.map((f) => (f.startsWith('embedded') ? 'Embedded in the CSS' : providerOf(f, pageUrl))))].join(', ') : webFont ? 'Web font' : 'Installed on the visitor\'s device (if they have it)',
			share: +(e.uses / totalUses).toFixed(4), uses: e.uses,
			weights: [...new Set([...own.map((f) => f.weight), ...(g?.weights ?? [])].map(String))],
			stack: Object.entries(e.stacks).sort((a, b) => b[1] - a[1])[0]?.[0] ?? `'${e.family}'`,
			files,
		};
	}).sort((a, b) => b.uses - a.uses);
	const fontFiles = faces.flatMap((f) => f.src.map((url) => ({ family: f.family, weight: f.weight, style: f.style, status: 'declared', url, provider: url.startsWith('embedded') ? 'Embedded in the CSS' : providerOf(url, pageUrl), icon: isIconFont(f.family) })));
	return {
		url: pageUrl, scrapedAt: new Date().toISOString(), method: 'css', typefaces, typeScale: [], fontFiles,
		googleFonts: google, stylesheets: sheets, skipped,
		notes: ['Read from the CSS only, so this lists what the site declares, ranked by how often the code uses it. Sizes, specimens and which fonts actually render need "Measure as visitors see it".'],
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [arg, out] = process.argv.slice(2);
	if (!arg) {
		console.error('Usage: node scrape-fonts.mjs <url> [output.json]');
		process.exit(1);
	}
	const url = /^https?:\/\//.test(arg) ? arg : `https://${arg}`;
	let result;
	try { result = await renderFonts(url); } catch (err) {
		if (!err.message.startsWith('"Measure')) throw err;
		console.warn(err.message, 'Falling back to reading the CSS.');
		result = await cssFonts(url);
	}
	const file = out || `fonts-${new URL(url).hostname}.json`;
	writeFileSync(file, JSON.stringify(result, null, '\t') + '\n');
	console.log(`${result.typefaces.length} typefaces (${result.method}) -> ${file}`);
	for (const t of result.typefaces) console.log(`  ${t.family.padEnd(28)} ${t.type.padEnd(12)} ${(t.share * 100).toFixed(1).padStart(5)}%  ${t.provider}`);
}
