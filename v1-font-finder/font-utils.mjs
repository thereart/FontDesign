// Pure helpers for FontDesign: reading CSS font declarations, naming providers, spotting icon fonts,
// and summarising measured text into typefaces and a type scale.

const GENERIC = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial', 'unset', 'revert'];
const ICON = /awesome|icon|dashicons|glyph|material symbols|eicons|fontello|icomoon|elegant|themify|ionicons|feather|bootstrap-icons|^ti$|slick|swiper-icons|wpforms|socicon|genericons|fa-(solid|regular|brands)|star(s)?$/i;

export const isIconFont = (family) => ICON.test(family || '');
export const isGeneric = (family) => GENERIC.includes((family || '').toLowerCase());

// "'Open Sans', Arial, sans-serif" -> ['Open Sans', 'Arial', 'sans-serif']
export function parseFamilies(stack) {
	return (stack || '').split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);
}

const siteOf = (host) => host.replace(/^www\./, '').split('.').slice(-2).join('.');

// Where a font file or font stylesheet comes from.
export function providerOf(url, pageUrl = '') {
	let host;
	try { host = new URL(url).hostname; } catch { return 'Unknown'; }
	if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(host)) return 'Google Fonts';
	if (/(^|\.)typekit\.(net|com)$/.test(host)) return 'Adobe Fonts';
	if (/(^|\.)fonts\.bunny\.net$/.test(host)) return 'Bunny Fonts';
	if (/fontawesome/.test(host)) return 'Font Awesome';
	if (/(^|\.)cloud\.typography\.com$/.test(host)) return 'Cloud.typography (Hoefler&Co)';
	if (/(^|\.)(fast\.fonts\.net|fonts\.com)$/.test(host)) return 'Monotype Fonts';
	if (/(^|\.)use\.fontawesome\.com$|(^|\.)kit\.fontawesome\.com$/.test(host)) return 'Font Awesome';
	let pageHost = '';
	try { pageHost = new URL(pageUrl).hostname; } catch { /* no page */ }
	return pageHost && siteOf(host) === siteOf(pageHost) ? 'Self-hosted' : `Hosted on ${host}`;
}

// Google Fonts stylesheet links: css2?family=Inter:wght@400;700&family=Lora and css?family=Open+Sans:400,700|Roboto
export function googleFamilies(href) {
	let u;
	try { u = new URL(href); } catch { return []; }
	if (!/fonts\.googleapis\.com$/.test(u.hostname)) return [];
	const raw = u.pathname.includes('css2') ? u.searchParams.getAll('family') : (u.searchParams.get('family') || '').split('|');
	return raw.filter(Boolean).map((part) => {
		const [name, spec = ''] = part.split(':');
		const weights = (spec.match(/\d{3}/g) || []).map(Number);
		return { family: name.replace(/\+/g, ' ').trim(), weights: [...new Set(weights)].sort((a, b) => a - b) };
	});
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Font declarations and @font-face rules in a stylesheet. Relative font URLs resolve against baseUrl.
export function extractFontCss(css, baseUrl = '') {
	css = stripComments(css);
	const faces = [];
	for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
		const get = (prop) => body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))?.[1].trim();
		const family = parseFamilies(get('font-family'))[0];
		if (!family) continue;
		// src is read whole, url(...) included: an embedded font's data URL has its own semicolon (";base64").
		const srcValue = body.match(/(?:^|;)\s*src\s*:\s*((?:url\([^)]*\)|[^;])+)/i)?.[1] || '';
		const src = [...srcValue.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)].map(([, , u]) => {
			if (u.startsWith('data:')) return 'embedded (data URL)';
			try { return new URL(u, baseUrl || undefined).href; } catch { return u; }
		});
		faces.push({ family, weight: get('font-weight') || '400', style: get('font-style') || 'normal', src });
	}
	const declarations = [];
	const withoutFaces = css.replace(/@font-face\s*\{[^}]*\}/gi, '');
	for (const [, body] of withoutFaces.matchAll(/\{([^{}]*)\}/g)) {
		for (const decl of body.split(';')) {
			const i = decl.indexOf(':');
			if (i < 0) continue;
			const prop = decl.slice(0, i).trim().toLowerCase();
			const value = decl.slice(i + 1).replace(/!important/i, '').trim();
			if (!value) continue;
			if (prop === 'font-family') declarations.push({ prop, stack: value });
			else if (prop === 'font') {
				// font shorthand: the family list comes after the size (and optional /line-height).
				// The size has a unit or is a keyword, so a bare weight like 400 isn't mistaken for it.
				const m = value.match(/(?:^|\s)(?:[\d.]+(?:px|r?em|%|pt|vw|vh|ch)|(?:xx?-)?(?:small|large)|medium|smaller|larger)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+(.+)$/i);
				if (m) declarations.push({ prop, stack: m[1] });
			} else if (prop.startsWith('--') && /font|family|typeface/.test(prop) && /["']|sans-serif|serif|monospace/i.test(value)) {
				declarations.push({ prop, stack: value });
			}
		}
	}
	return { faces, declarations };
}

// What a piece of text is used for, from its tag and surroundings (worked out in the page).
export const ROLE_ORDER = ['Headings', 'Body text', 'Links', 'Buttons', 'Navigation', 'Forms', 'Small print', 'Footer'];

const mostCommon = (entries) => [...entries].sort((a, b) => b[1] - a[1])[0]?.[0];

// samples: one per text element, measured in the page:
//   { role, tag, stack, platform: [{ familyName, isCustomFont, glyphCount }], weight, style, size, lineHeight, letterSpacing, transform, chars, text }
// faces: document.fonts entries [{ family, weight, style, status, url }]
export function summarise(samples, faces, pageUrl) {
	const total = samples.reduce((s, x) => s + x.chars, 0) || 1;
	const norm = (f) => f.toLowerCase().replace(/[^a-z0-9]/g, '');
	const loaded = new Set(faces.filter((f) => f.status === 'loaded').map((f) => norm(f.family)));
	const groups = new Map();
	for (const s of samples) {
		// The font that drew most of this element's characters (others are fallbacks, e.g. for an emoji).
		const main = [...(s.platform || [])].sort((a, b) => b.glyphCount - a.glyphCount)[0];
		const declared = parseFamilies(s.stack);
		// Web fonts go by the name the site's CSS gives them; their internal name can be cryptic (even ".").
		const cssName = main?.isCustomFont ? declared.find((f) => loaded.has(norm(f))) : null;
		const usable = main?.familyName && /[a-z0-9]{2}/i.test(main.familyName) ? main.familyName : null;
		const name = cssName || usable || declared.find((f) => !isGeneric(f)) || declared[0] || 'Unknown';
		s.font = name; // reused by the type scale below
		const g = groups.get(name) ?? { family: name, rendersAs: usable, custom: false, chars: 0, roles: {}, weights: {}, styles: {}, sizes: {}, stacks: {}, samples: [] };
		g.custom ||= !!main?.isCustomFont;
		g.chars += s.chars;
		g.roles[s.role] = (g.roles[s.role] || 0) + s.chars;
		g.weights[s.weight] = (g.weights[s.weight] || 0) + s.chars;
		g.styles[s.style] = (g.styles[s.style] || 0) + s.chars;
		g.sizes[s.size] = (g.sizes[s.size] || 0) + s.chars;
		g.stacks[s.stack] = (g.stacks[s.stack] || 0) + s.chars;
		if (s.text && g.samples.length < 3 && !g.samples.includes(s.text)) g.samples.push(s.text);
		groups.set(name, g);
	}

	const typefaces = [...groups.values()].map((g) => {
		// Font files declared for this typeface: matched by CSS family name or by the font's own name.
		const names = new Set([norm(g.family), ...Object.keys(g.stacks).flatMap(parseFamilies).map(norm)]);
		const own = faces.filter((f) => names.has(norm(f.family)) && (g.custom || isIconFont(f.family)));
		const cssFamily = parseFamilies(mostCommon(Object.entries(g.stacks))).find((f) => own.some((o) => norm(o.family) === norm(f))) || g.family;
		const files = [...new Set(own.map((f) => f.url).filter(Boolean))];
		const sizes = Object.keys(g.sizes).map(Number).sort((a, b) => a - b);
		return {
			family: g.family,
			cssFamily,
			rendersAs: g.rendersAs && g.rendersAs !== g.family ? g.rendersAs : null,
			type: isIconFont(g.family) || isIconFont(cssFamily) ? 'icon font' : g.custom ? 'web font' : 'system font',
			provider: g.custom || own.length ? (files.length ? [...new Set(files.map((f) => providerOf(f, pageUrl)))].join(', ') : 'Web font (source not visible)') : 'Installed on the visitor\'s device',
			share: +(g.chars / total).toFixed(4),
			characters: g.chars,
			roles: ROLE_ORDER.filter((r) => g.roles[r]).sort((a, b) => g.roles[b] - g.roles[a]),
			weights: Object.keys(g.weights).map(Number).sort((a, b) => a - b),
			mainWeight: Number(mostCommon(Object.entries(g.weights))),
			styles: Object.keys(g.styles),
			sizes: { min: sizes[0], max: sizes[sizes.length - 1], common: Number(mostCommon(Object.entries(g.sizes))) },
			stack: mostCommon(Object.entries(g.stacks)),
			samples: g.samples,
			files,
		};
	}).sort((a, b) => b.share - a.share);

	// Type scale: the most common setting (by characters) for each heading level and role.
	const SCALE = [['H1', (s) => s.tag === 'h1'], ['H2', (s) => s.tag === 'h2'], ['H3', (s) => s.tag === 'h3'], ['H4', (s) => s.tag === 'h4'], ['H5', (s) => s.tag === 'h5'], ['H6', (s) => s.tag === 'h6'],
		['Body text', (s) => s.role === 'Body text'], ['Links', (s) => s.role === 'Links'], ['Buttons', (s) => s.role === 'Buttons'], ['Navigation', (s) => s.role === 'Navigation'], ['Forms', (s) => s.role === 'Forms'], ['Small print', (s) => s.role === 'Small print'], ['Footer', (s) => s.role === 'Footer']];
	const typeScale = SCALE.map(([role, test]) => {
		const combos = new Map();
		let count = 0;
		for (const s of samples.filter(test)) {
			const key = JSON.stringify([s.font, s.size, s.weight, s.lineHeight, s.letterSpacing, s.transform, s.style]);
			combos.set(key, (combos.get(key) || 0) + s.chars);
			count++;
		}
		if (!count) return null;
		const [family, size, weight, lineHeight, letterSpacing, transform, style] = JSON.parse(mostCommon([...combos]));
		return { role, family, size, weight, lineHeight, letterSpacing, transform, style, elements: count, variants: combos.size };
	}).filter(Boolean);

	// Declared fonts, one row per family + weight + style (language subsets merged), and whether the page used it.
	const fontFiles = [];
	for (const f of faces) {
		const same = fontFiles.find((x) => norm(x.family) === norm(f.family) && x.weight === f.weight && x.style === f.style);
		if (same) {
			if (f.status === 'loaded') same.status = 'loaded';
			same.url ??= f.url;
			same.subsets++;
		} else fontFiles.push({ family: f.family, weight: f.weight, style: f.style, status: f.status, url: f.url, subsets: 1 });
	}
	for (const f of fontFiles) Object.assign(f, { provider: f.url ? providerOf(f.url, pageUrl) : 'Unknown', icon: isIconFont(f.family) });
	fontFiles.sort((a, b) => (a.status === 'loaded' ? 0 : 1) - (b.status === 'loaded' ? 0 : 1) || a.family.localeCompare(b.family));

	const notes = [];
	const text = typefaces.filter((t) => t.type !== 'icon font');
	if (text.length > 3) notes.push(`${text.length} text typefaces are in use. Most sites look more consistent with two (one for headings, one for body text).`);
	const unusedFamilies = [...new Set(fontFiles.filter((f) => !f.icon).map((f) => f.family))].filter((fam) => !fontFiles.some((f) => f.family === fam && f.status === 'loaded'));
	if (unusedFamilies.length) notes.push(`${unusedFamilies.length} declared font famil${unusedFamilies.length === 1 ? 'y isn\'t' : 'ies aren\'t'} used on this page (${unusedFamilies.slice(0, 4).join(', ')}${unusedFamilies.length > 4 ? '…' : ''}). Browsers only download fonts a page uses, so they cost nothing here; other pages or languages may need them.`);
	const body = typeScale.find((r) => r.role === 'Body text');
	if (body && body.size < 16) notes.push(`Body text is ${body.size}px. 16px or more is easier to read, especially on phones.`);
	if (body && body.lineHeight && body.size && body.lineHeight / body.size < 1.4) notes.push(`Body text line height is ${(body.lineHeight / body.size).toFixed(2)}× the font size. Around 1.5× is easier to read.`);
	return { typefaces, typeScale, fontFiles, notes };
}
