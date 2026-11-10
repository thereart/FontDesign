// Typography audit for FontDesign v2: turns measured text into a score, a list of fixes, a pairing check,
// recommended CSS and suggested font pairings. Rules come from these skills:
//  - web-typography (wondelai, MIT): the 10-row Quick Diagnostic and score; measure, line height, sizes, pairing contrast
//  - Better Typography (jakubkrehel, MIT): exact findings, severity (HIGH / MEDIUM / LOW), before / after / why
//  - frontend-design (Anthropic, Apache 2.0): one or two clearly distinct families; template tells (all-caps eyebrows, mono labels)
//  - UI UX Pro Max (nextlevelbuilder, MIT): Google Fonts categories and font pairings (data/)
//  - taste-skill (Leonxlnx, MIT): curated pairings with tracking (data/)

import { readFileSync } from 'node:fs';
import { parseFamilies, isGeneric } from './font-utils.mjs';

const CATEGORIES = JSON.parse(readFileSync(new URL('./data/font-categories.json', import.meta.url), 'utf8')).fonts;
const PAIRINGS = JSON.parse(readFileSync(new URL('./data/pairings.json', import.meta.url), 'utf8')).pairings;
// Common fonts installed on devices, which Google Fonts doesn't list.
const SYSTEM = {
	arial: 'sans-serif', helvetica: 'sans-serif', 'helvetica neue': 'sans-serif', 'segoe ui': 'sans-serif', 'segoe ui semibold': 'sans-serif', verdana: 'sans-serif', tahoma: 'sans-serif',
	'trebuchet ms': 'sans-serif', 'san francisco': 'sans-serif', 'sf pro text': 'sans-serif', 'sf pro display': 'sans-serif', '-apple-system': 'sans-serif', 'system-ui': 'sans-serif', calibri: 'sans-serif',
	georgia: 'serif', 'times new roman': 'serif', times: 'serif', cambria: 'serif', garamond: 'serif', 'palatino linotype': 'serif', palatino: 'serif',
	'courier new': 'monospace', consolas: 'monospace', menlo: 'monospace', monaco: 'monospace',
};
const GENERIC_CATEGORY = { serif: 'serif', 'sans-serif': 'sans-serif', monospace: 'monospace', cursive: 'handwriting', 'system-ui': 'sans-serif', 'ui-serif': 'serif', 'ui-sans-serif': 'sans-serif', 'ui-monospace': 'monospace' };

// serif, sans-serif, display, handwriting or monospace; from Google Fonts, common system fonts, then the stack's generic family.
export function categoryOf(family, stack = '') {
	const exact = CATEGORIES[family] ?? CATEGORIES[family.replace(/\s+(Variable|VF|Pro|Text|Display)$/i, '')];
	if (exact) return exact[0];
	if (SYSTEM[family.toLowerCase()]) return SYSTEM[family.toLowerCase()];
	const generic = parseFamilies(stack).map((f) => f.toLowerCase()).find((f) => GENERIC_CATEGORY[f]);
	if (generic) return GENERIC_CATEGORY[generic];
	if (/serif/i.test(family) && !/sans/i.test(family)) return 'serif';
	if (/sans|grotesk|grotesque|gothic/i.test(family)) return 'sans-serif';
	if (/mono|code/i.test(family)) return 'monospace';
	return 'unknown';
}

const weighted = (items, value) => {
	const list = items.filter((x) => value(x) != null).map((x) => [value(x), x.chars]).sort((a, b) => a[0] - b[0]);
	const half = list.reduce((s, [, w]) => s + w, 0) / 2;
	let run = 0;
	for (const [v, w] of list) if ((run += w) >= half) return v;
	return null;
};
const ratioOf = (s) => (s.lineHeight ? s.lineHeight / s.size : 1.2); // "normal" is about 1.2 in most fonts
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const em = (px, size) => round(px / size, 3);
const places = (list) => [...new Set(list.map((s) => s.where))];

// The weight the browser actually uses for a requested weight, following CSS font matching:
// above 500 it tries heavier faces first, below 400 lighter ones. Faces declare "700" or a range like "200 900".
export function matchedWeight(faces, desired) {
	const ranges = faces.map((f) => { const [lo, hi = lo] = String(f.weight).split(/\s+/).map(Number); return [lo, hi]; }).filter(([lo]) => !Number.isNaN(lo));
	if (!ranges.length) return null;
	if (ranges.some(([lo, hi]) => desired >= lo && desired <= hi)) return desired;
	const above = ranges.filter(([lo]) => lo > desired).map(([lo]) => lo).sort((a, b) => a - b);
	const below = ranges.filter(([, hi]) => hi < desired).map(([, hi]) => hi).sort((a, b) => b - a);
	return desired > 500 ? (above[0] ?? below[0]) : desired < 400 ? (below[0] ?? above[0]) : (above.find((w) => w <= 500) ?? below[0] ?? above[0]);
}
// Browsers fake bold when a weight of 600+ is asked for but the closest real face is lighter than 600.
const fakesBold = (faces, desired) => desired >= 600 && (matchedWeight(faces, desired) ?? 400) < 600;

export function audit(result) {
	const { checks, typeScale, typefaces } = result;
	const { samples, faces, fonts, zoom, inputs } = checks;
	const text = typefaces.filter((t) => t.type !== 'icon font');
	const body = typeScale.find((r) => r.role === 'Body text') ?? (text[0] && { size: text[0].sizes.common, lineHeight: null, family: text[0].family });
	const bodySamples = samples.filter((s) => s.role === 'Body text');
	const longText = bodySamples.filter((s) => s.charsPerLine && s.lines >= 2);
	const measure = weighted(longText, (s) => s.charsPerLine);
	const headings = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].map((h) => typeScale.find((r) => r.role === h)).filter(Boolean);
	const linkSamples = samples.filter((s) => s.linkInText);
	const distinctLinks = linkSamples.filter((s) => s.linkInText.underlined || s.linkInText.contrast >= 3);
	const stragglers = samples.filter((s) => s.straggler);
	const noFallback = text.filter((t) => t.type === 'web font' && !parseFamilies(t.stack).some((f) => isGeneric(f) || SYSTEM[f.toLowerCase()]));

	// Adjacent levels (H1 > H2 > ... > body) need a visible step: 10% in size or a clear weight change.
	const ladder = [...headings, body && { role: 'Body text', ...body, weight: body.weight ?? 400 }].filter(Boolean);
	const flatSteps = [], inversions = [];
	for (let i = 1; i < ladder.length; i++) {
		const [up, down] = [ladder[i - 1], ladder[i]];
		if (down.size > up.size) inversions.push([up, down]);
		else if (up.size / down.size < 1.1 && Math.abs((up.weight ?? 400) - (down.weight ?? 400)) < 200) flatSteps.push([up, down]);
	}

	// web-typography's Quick Diagnostic. null = couldn't be measured on this page; 'manual' = needs a person.
	const rows = [
		{ id: 'body-size', label: 'Body text is 16px or larger', pass: body ? body.size >= 16 : null, detail: body ? `Body text is ${body.size}px.` : 'No body text found.' },
		{ id: 'measure', label: 'Lines are under 75 characters', pass: measure == null ? null : measure <= 75, detail: measure == null ? 'Not enough long paragraphs to measure.' : `Paragraphs run about ${measure} characters per line.` },
		{ id: 'line-height', label: 'Body line height is 1.4 or more', pass: body ? ratioOf(body) >= 1.4 : null, detail: body ? `Body line height is ${round(ratioOf(body))}× the font size${body.lineHeight ? '' : ' ("normal")'}.` : '' },
		{ id: 'levels', label: 'Clear steps between heading levels', pass: ladder.length < 2 ? null : !flatSteps.length && !inversions.length, detail: ladder.length < 2 ? 'Too few heading levels to compare.' : inversions.length ? `${inversions.map(([u, d]) => `${d.role} (${d.size}px) is bigger than ${u.role} (${u.size}px)`).join('; ')}.` : flatSteps.length ? `${flatSteps.map(([u, d]) => `${u.role} and ${d.role} look alike (${u.size}px vs ${d.size}px)`).join('; ')}.` : `${ladder.map((l) => `${l.role} ${l.size}px`).join(' > ')}.` },
		{ id: 'real-screens', label: 'Tested at actual sizes on real screens', pass: 'manual', detail: 'Check on a real phone and laptop: this tool can\'t hold the device.' },
		{ id: 'payload', label: 'Font files are under 200KB in total', pass: !fonts.files ? true : fonts.sizesKnown && fonts.bytes ? fonts.bytes <= 200 * 1024 : null, detail: !fonts.files ? 'No web font files.' : fonts.sizesKnown && fonts.bytes ? `${fonts.files} font file${fonts.files === 1 ? '' : 's'}, ${Math.round(fonts.bytes / 1024)}KB.` : `${fonts.files} font files; the server hides their sizes.` },
		{ id: 'fallbacks', label: 'Fallback fonts are set', pass: !noFallback.length, detail: noFallback.length ? `${noFallback.map((t) => t.family).join(', ')} ha${noFallback.length === 1 ? 's' : 've'} no fallback.` : 'Every web font has a fallback.' },
		{ id: 'zoom', label: 'Works at 200% zoom', pass: zoom.overflow <= 2, detail: zoom.overflow <= 2 ? 'No sideways scrolling at 200% zoom.' : `At 200% zoom the page is ${zoom.overflow}px too wide and scrolls sideways.` },
		{ id: 'orphans', label: 'Headings have no lone last word', pass: !stragglers.length, detail: stragglers.length ? `${stragglers.length} heading${stragglers.length === 1 ? '' : 's'} end${stragglers.length === 1 ? 's' : ''} with one word on its own line.` : 'No lone last words in headings.' },
		{ id: 'links', label: 'Links stand out from text', pass: !linkSamples.length ? null : distinctLinks.length / linkSamples.length >= 0.8, detail: !linkSamples.length ? 'No links inside paragraphs.' : `${distinctLinks.length} of ${linkSamples.length} links in text are underlined or clearly coloured.` },
	];
	const checked = rows.filter((r) => typeof r.pass === 'boolean');
	const passed = checked.filter((r) => r.pass).length;
	const score = { passed, checked: checked.length, rows, band: passed / (checked.length || 1) >= 0.9 ? 'Strong' : passed / (checked.length || 1) >= 0.6 ? 'Readable, with gaps' : 'Needs work' };

	// Findings: one per root cause, every place it shows up.
	const findings = [];
	const add = (severity, rule, list, before, after, why, source) => { if (list.length) findings.push({ severity, rule, where: places(list).slice(0, 6), count: list.length, before, after, why, source }); };

	if (zoom.overflow > 2) findings.push({ severity: 'HIGH', rule: 'Text must survive 200% zoom', where: ['page'], count: 1, before: `Page is ${zoom.overflow}px wider than the screen at 200% zoom`, after: 'Let wide elements shrink or wrap (max-width: 100%; overflow-wrap: break-word)', why: 'People who zoom in to read have to scroll sideways on every line.', source: 'Better Typography, web-typography' });
	const tiny = bodySamples.filter((s) => s.size < 12);
	add('HIGH', 'Text under 12px', tiny, `${Math.min(...tiny.map((s) => s.size))}px text`, 'font-size: 0.875rem (14px) or more; 1rem for paragraphs', 'Text this small is hard to read for most people, especially on phones.', 'Better Typography');
	const smallBody = bodySamples.filter((s) => s.size >= 12 && s.size < 16 && s.lines >= 2);
	add('MEDIUM', 'Paragraph text under 16px', smallBody, `${weighted(smallBody, (s) => s.size)}px paragraphs`, 'font-size: 1rem (16px), 1.125rem on reading-heavy pages', 'Phones are held further away than designers assume; 16px is the comfortable minimum.', 'web-typography, Better Typography');
	const thin = samples.filter((s) => s.weight <= 300 && s.size < 18);
	add(thin.some((s) => s.size < 14) ? 'HIGH' : 'MEDIUM', 'Thin weights on small text', thin, `font-weight: ${Math.min(...thin.map((s) => s.weight))} at ${Math.min(...thin.map((s) => s.size))}px`, 'font-weight: 400 or heavier below 18px; keep 100-300 for 28px and up', 'Thin strokes break up at small sizes and lose contrast.', 'Better Typography');

	// Faked weights and italics: used, but no declared face covers them, so the browser smears or slants the regular.
	for (const t of text.filter((t) => t.type === 'web font')) {
		const own = faces.filter((f) => f.family.toLowerCase() === t.cssFamily.toLowerCase());
		if (!own.length) continue;
		const users = samples.filter((s) => s.font === t.family);
		const fakeBold = users.filter((s) => fakesBold(own, s.weight));
		add('MEDIUM', `Faked bold in ${t.family}`, fakeBold, `font-weight: ${[...new Set(fakeBold.map((s) => s.weight))].join(', ')}, but the heaviest loaded weight is ${Math.max(...own.map((f) => Number(String(f.weight).split(/\s+/).pop()) || 400))}`, `Load a bold weight of ${t.family} (600 or 700), or use a weight the site loads (${[...new Set(own.map((f) => f.weight))].join(', ')})`, 'With no real bold to use, the browser thickens the regular weight itself, which distorts the letters.', 'Better Typography');
		const fakeItalic = users.filter((s) => s.style !== 'normal' && !own.some((f) => f.style !== 'normal'));
		add('MEDIUM', `Faked italic in ${t.family}`, fakeItalic, 'font-style: italic (no italic loaded)', `Load ${t.family} Italic, or avoid italics in this face`, 'The browser slants the upright letters, which looks cheap next to a real italic.', 'Better Typography');
	}

	for (const [up, down] of inversions) findings.push({ severity: 'MEDIUM', rule: 'Headings get smaller level by level', where: [`${up.role}, ${down.role}`], count: 1, before: `${down.role} ${down.size}px is bigger than ${up.role} ${up.size}px`, after: `${down.role} smaller than ${up.role}, on one scale (for example 1.25× per level)`, why: 'A lower-level heading that outranks its parent confuses the page structure.', source: 'Better Typography' });
	for (const [up, down] of flatSteps) findings.push({ severity: 'MEDIUM', rule: 'Clear steps between levels', where: [`${up.role}, ${down.role}`], count: 1, before: `${up.role} ${up.size}px/${up.weight ?? 400} vs ${down.role} ${down.size}px/${down.weight ?? 400}`, after: `${up.role} about ${round(down.size * 1.25, 0)}px, or two weight steps heavier`, why: 'Levels that look the same can\'t show which content matters more.', source: 'web-typography' });

	const tight = samples.filter((s) => s.lines >= 3 && s.role !== 'Headings' && ratioOf(s) < 1.4);
	add('MEDIUM', 'Line height for text that wraps', tight, `line-height ${round(weighted(tight, ratioOf))}× on text that wraps to 3+ lines`, 'line-height: 1.5 (unitless) for body text', 'Lines packed too closely make the eye lose its place on the way back to the start of the next line.', 'Better Typography, web-typography');
	const wide = longText.filter((s) => s.charsPerLine > 75);
	add('MEDIUM', 'Cap the line length', wide, `about ${weighted(wide, (s) => s.charsPerLine)} characters per line`, 'max-width: 65ch on text blocks (45-75 characters)', 'Very long lines make the return sweep to the next line easy to miss.', 'web-typography, Better Typography');
	const smallInputs = inputs.filter((i) => i.size < 16).map((i) => ({ ...i, chars: 1 }));
	add('MEDIUM', 'Form fields at 16px on phones', smallInputs, `${Math.min(...smallInputs.map((i) => i.size))}px form text on a phone`, 'font-size: 16px on inputs, selects and text areas at phone widths', 'iPhones zoom the whole page when someone taps a field under 16px, which is jarring on booking forms.', 'Better Typography');
	const plainLinks = linkSamples.filter((s) => !s.linkInText.underlined && s.linkInText.contrast < 3);
	add('MEDIUM', 'Links that look like text', plainLinks, `no underline, ${weighted(plainLinks, (s) => s.linkInText.contrast)}:1 against the surrounding text`, 'text-decoration: underline; text-underline-offset: 0.15em', 'If colour is the only difference, many people can\'t find the link (WCAG 1.4.1).', 'web-typography, Better Typography');
	if (noFallback.length) findings.push({ severity: 'MEDIUM', rule: 'Set fallback fonts', where: noFallback.map((t) => t.family), count: noFallback.length, before: `font-family: ${noFallback[0].stack}`, after: `font-family: ${noFallback[0].stack}, ${categoryOf(noFallback[0].family) === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}`, why: 'If the font file is slow or fails, the browser shows its default instead of a close match.', source: 'web-typography' });
	if (score.rows.find((r) => r.id === 'payload').pass === false) findings.push({ severity: 'MEDIUM', rule: 'Font files over 200KB', where: ['page'], count: fonts.files, before: `${Math.round(fonts.bytes / 1024)}KB of fonts`, after: 'WOFF2 files, Latin subset, a variable font in place of several weights, and only the weights in use', why: 'Large font downloads delay the text on slow connections.', source: 'web-typography' });

	add('LOW', 'Balance headings', stragglers, 'one word alone on the last line', 'text-wrap: balance on headings', 'A lone last word makes a heading look unfinished.', 'web-typography, Better Typography');
	// Standalone prices and rates only: figures inside sentences and headlines stay proportional.
	const prices = samples.filter((s) => s.price && s.chars <= 30 && !/^h[1-6]$/.test(s.tag) && !/tabular-nums/.test(s.numeric));
	add('LOW', 'Even-width numbers on prices', prices, 'proportional figures on prices', 'font-variant-numeric: tabular-nums', 'Prices and rates line up and don\'t shift when they change.', 'Better Typography');
	const looseHeads = samples.filter((s) => s.role === 'Headings' && s.size >= 24 && em(s.letterSpacing, s.size) > 0.005 && !s.upper);
	add('LOW', 'Tighten large headings', looseHeads, `letter-spacing: ${em(Math.max(...looseHeads.map((s) => s.letterSpacing)), Math.max(...looseHeads.map((s) => s.size)))}em`, 'letter-spacing: -0.01em to -0.02em at 24px and up', 'Big type looks gappy at its default spacing.', 'Better Typography');
	const tightCaps = samples.filter((s) => s.upper && s.size <= 14 && em(s.letterSpacing, s.size) < 0.03 && s.chars > 2);
	add('LOW', 'Space out small capitals', tightCaps, `all-caps at ${Math.max(...tightCaps.map((s) => s.size))}px with ${em(Math.min(...tightCaps.map((s) => s.letterSpacing)), Math.max(...tightCaps.map((s) => s.size)))}em spacing`, 'letter-spacing: 0.05em on small all-caps labels', 'Capitals set tight at small sizes run together.', 'Better Typography');
	const spacedBody = bodySamples.filter((s) => Math.abs(em(s.letterSpacing, s.size)) > 0.02);
	add('LOW', 'Leave body text spacing alone', spacedBody, `letter-spacing: ${em(spacedBody[0]?.letterSpacing ?? 0, spacedBody[0]?.size ?? 16)}em on paragraphs`, 'letter-spacing: 0 on body text', 'The font\'s own spacing is tuned for reading.', 'Better Typography');
	const justified = bodySamples.filter((s) => s.textAlign === 'justify' && s.lines >= 2);
	add('LOW', 'Avoid justified text', justified, 'text-align: justify', 'text-align: start', 'Justified text on the web leaves uneven gaps between words.', 'Better Typography');
	const quotes = samples.filter((s) => s.quotes);
	add('LOW', 'Typographic punctuation', quotes, 'straight quotes, -- or ...', 'curly quotes (“ ” ‘ ’), dashes (– —) and the ellipsis (…)', 'Keyboard stand-ins look unfinished in display text.', 'Better Typography');
	const unselectable = samples.filter((s) => s.userSelect === 'none' && s.role !== 'Buttons' && s.role !== 'Navigation');
	add('LOW', 'Keep text selectable', unselectable, 'user-select: none on text', 'remove user-select: none', 'People copy addresses, names and prices.', 'Better Typography');

	// frontend-design: one or two families, clearly distinct; template habits.
	const families = text.filter((t) => t.share >= 0.02);
	if (families.length > 3) findings.push({ severity: 'MEDIUM', rule: 'One or two typefaces', where: families.map((t) => t.family), count: families.length, before: `${families.length} text typefaces`, after: 'One family for headings and one for text (or one family in several weights)', why: 'Each extra typeface dilutes the hierarchy and the brand voice.', source: 'frontend-design, web-typography' });
	const cats = families.map((t) => ({ family: t.family, category: categoryOf(t.family, t.stack) }));
	const twins = families.length === 2 && cats[0].category === cats[1].category && cats[0].category !== 'unknown' && cats[0].family.split(' ')[0] !== cats[1].family.split(' ')[0];
	if (twins) findings.push({ severity: 'MEDIUM', rule: 'Pair for contrast', where: cats.map((c) => c.family), count: 2, before: `two ${cats[0].category} faces (${cats[0].family} and ${cats[1].family})`, after: `one ${cats[0].category} family in two weights, or a ${cats[0].category === 'serif' ? 'sans-serif' : 'serif'} for headings`, why: 'Two similar faces look like a mistake rather than a choice.', source: 'Better Typography, frontend-design' });
	const eyebrows = samples.filter((s) => s.eyebrow);
	if (eyebrows.length >= 3) add('LOW', 'All-caps labels above every heading', eyebrows, `${eyebrows.length} small all-caps labels above headings`, 'Keep labels only where they add information', 'Labels on every section are one of the commonest template habits and add noise.', 'frontend-design');
	const monoLabels = samples.filter((s) => categoryOf(s.font ?? '', s.stack) === 'monospace' && s.size <= 13 && s.role !== 'Body text');
	if (monoLabels.length >= 3) add('LOW', 'Monospace for small labels', monoLabels, 'monospace small labels', 'The text face, or a deliberate label style', 'Monospace labels are a common template habit unless the content is code or data.', 'frontend-design');

	const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
	findings.sort((a, b) => order[a.severity] - order[b.severity]);

	const pairing = {
		faces: cats,
		verdict: families.length === 1 ? 'One typeface: consistent and safe. Weight and size carry the hierarchy.'
			: families.length === 2 ? (twins ? `Two ${cats[0].category} faces that look alike: pair for contrast, or use one.` : `Good contrast: ${cats.map((c) => `${c.family} (${c.category})`).join(' with ')}.`)
			: `${families.length} typefaces: more than most sites need.`,
	};
	const notVerified = [
		'Tested at actual sizes on real phones and screens (needs a person).',
		'Line heights without units and font sizes in rem (needs the site\'s CSS source; the browser reports both in pixels).',
	];
	return { score, findings, pairing, notVerified, verdict: findings.some((f) => f.severity === 'HIGH') ? 'Fix the high-severity items first' : findings.length ? 'Readable, with improvements to make' : 'No typography fixes found' };
}

// Recommended CSS: keeps the site's fonts and fixes sizes, spacing, measure and wrapping (web-typography, Better Typography).
export function recommendedCss(result) {
	const { typeScale, typefaces } = result;
	const text = typefaces.filter((t) => t.type !== 'icon font');
	const head = typeScale.find((r) => /^H[12]$/.test(r.role)) ?? typeScale[0];
	const bodyRow = typeScale.find((r) => r.role === 'Body text');
	const stackFor = (family) => {
		const t = text.find((x) => x.family === family) ?? text[0];
		if (!t) return 'system-ui, sans-serif';
		const fams = parseFamilies(t.stack);
		const hasGeneric = fams.some((f) => isGeneric(f));
		const quoted = fams.map((f) => (/\s/.test(f) && !isGeneric(f) ? `"${f}"` : f)).join(', ');
		return hasGeneric ? quoted : `${quoted}, ${categoryOf(t.family, t.stack) === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
	};
	const bodyFamily = bodyRow?.family ?? text[0]?.family;
	const headFamily = head?.family ?? bodyFamily;
	const serifBody = categoryOf(bodyFamily ?? '', '') === 'serif';
	const base = Math.max(16, bodyRow?.size ?? 16);
	// Headings keep the site's own desktop sizes when they already step down level by level; missing or
	// out-of-order levels fall on a Major Third (1.25) scale from the body size.
	const ratio = 1.25;
	const site = ['H4', 'H3', 'H2', 'H1'].map((h) => typeScale.find((r) => r.role === h)?.size ?? null);
	const ordered = site.filter(Boolean).every((v, i, arr) => !i || v >= arr[i - 1]);
	const rem = (px) => `${round(px / 16, 3)}rem`;
	// Fluid size between a 320px and a 1200px screen (web-typography's clamp formula); phones get a gentler 1.2 ratio.
	const fluid = (steps) => {
		const max = (ordered && site[steps - 1] > base ? site[steps - 1] : null) ?? base * ratio ** steps;
		const min = Math.min(max, base * 1.2 ** steps);
		if (max - min < 1) return rem(max);
		const slope = (max - min) / (1200 - 320);
		const intercept = min - slope * 320;
		return `clamp(${rem(min)}, ${rem(intercept)} + ${round(slope * 100, 3)}vw, ${rem(max)})`;
	};
	return [
		`/* Recommended typography: keeps ${[...new Set([headFamily, bodyFamily])].filter(Boolean).join(' and ')}${ordered && site.some(Boolean) ? ' and the site\'s heading sizes on desktop' : `, on a ${ratio} scale`}; headings shrink smoothly on phones. */`,
		':root {',
		`  --font-heading: ${stackFor(headFamily)};`,
		`  --font-body: ${stackFor(bodyFamily)};`,
		`  --text-base: ${rem(base)};`,
		`  --text-sm: ${rem(Math.max(14, base / ratio))};`,
		`  --text-h4: ${fluid(1)};`,
		`  --text-h3: ${fluid(2)};`,
		`  --text-h2: ${fluid(3)};`,
		`  --text-h1: ${fluid(4)};`,
		'  --measure: 65ch;',
		'}',
		'',
		`body { font-family: var(--font-body); font-size: var(--text-base); line-height: ${serifBody ? 1.65 : 1.55}; }`,
		'p, li, blockquote { max-width: var(--measure); text-wrap: pretty; }',
		'h1, h2, h3, h4 { font-family: var(--font-heading); text-wrap: balance; }',
		'h1 { font-size: var(--text-h1); line-height: 1.1; letter-spacing: -0.02em; }',
		'h2 { font-size: var(--text-h2); line-height: 1.2; letter-spacing: -0.01em; }',
		'h3 { font-size: var(--text-h3); line-height: 1.25; }',
		'h4 { font-size: var(--text-h4); line-height: 1.3; }',
		'small, figcaption { font-size: var(--text-sm); }',
		'a { text-decoration: underline; text-underline-offset: 0.15em; text-decoration-thickness: from-font; }',
		'.price, td, .rate { font-variant-numeric: tabular-nums; }',
		'.label { text-transform: uppercase; font-size: var(--text-sm); letter-spacing: 0.05em; }',
		'@media (max-width: 640px) { input, select, textarea { font-size: 16px; } }',
		'/* In each @font-face: font-display: swap; and preload the one or two files used above the fold. */',
	].join('\n');
}

// Suggested pairings: by property type (hotel moods), plus pairings that keep one of the site's own fonts.
const PROPERTY_MOODS = {
	none: [],
	luxury: ['luxury', 'elegant', 'premium', 'sophisticated', 'refined', 'high-end', 'timeless'],
	boutique: ['boutique', 'editorial', 'distinctive', 'artisan', 'modern', 'stylish', 'creative'],
	resort: ['relaxed', 'friendly', 'warm', 'travel', 'vacation', 'beach', 'playful', 'approachable'],
	waterfront: ['calm', 'clean', 'fresh', 'coastal', 'airy', 'travel', 'light', 'elegant'],
	business: ['professional', 'corporate', 'clean', 'modern', 'trustworthy', 'neutral', 'precise'],
	eco: ['natural', 'organic', 'earthy', 'warm', 'nature', 'wellness', 'calm', 'soft'],
	heritage: ['classic', 'traditional', 'heritage', 'vintage', 'historic', 'timeless', 'literary', 'elegant'],
};
const HOSPITALITY = /hotel|hospitality|resort|travel|guesthouse|spa|restaurant|cafe|wine|wellness|bar|holiday|accommodation/i;

export function suggestPairings(result, property = 'none') {
	const families = result.typefaces.filter((t) => t.type !== 'icon font').map((t) => t.family.toLowerCase());
	const moods = PROPERTY_MOODS[property] ?? [];
	// Pairings built for non-Latin scripts (Japanese, Korean, Arabic…) don't suit an English hotel site.
	const scored = PAIRINGS.filter((p) => !/\b(JP|KR|SC|TC|HK|Arabic|Hebrew|Thai|Devanagari|Bengali|Tamil)\b/.test(`${p.heading} ${p.body}`)).map((p) => {
		const words = `${p.moods.join(' ')} ${p.bestFor}`.toLowerCase();
		const hits = moods.filter((m) => words.includes(m));
		const score = hits.length * 2 + (HOSPITALITY.test(p.bestFor) ? 1.5 : 0) + (p.heading !== p.body ? 0.5 : 0);
		return { ...p, score, matched: hits };
	});
	const keeps = scored.filter((p) => families.includes(p.heading.toLowerCase()) || families.includes(p.body.toLowerCase()))
		.sort((a, b) => b.score - a.score).slice(0, 3)
		.map((p) => ({ ...p, keeps: families.includes(p.heading.toLowerCase()) ? p.heading : p.body }));
	const kept = new Set(keeps.map((p) => p.name));
	const forProperty = scored.filter((p) => !kept.has(p.name) && (moods.length ? p.matched.length : HOSPITALITY.test(p.bestFor)))
		.sort((a, b) => b.score - a.score).slice(0, 6);
	const strip = ({ score, ...p }) => p;
	return { keeps: keeps.map(strip), forProperty: forProperty.map(strip) };
}

export const PROPERTY_LABELS = { none: 'Not set', luxury: 'Luxury hotel', boutique: 'Boutique hotel', resort: 'Beach / holiday resort', waterfront: 'Waterfront / coastal', business: 'Business / city hotel', eco: 'Eco-lodge / nature retreat', heritage: 'Heritage / historic' };
