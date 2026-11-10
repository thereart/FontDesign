// Run: node test.mjs
import assert from 'node:assert/strict';
import { parseFamilies, isIconFont, isGeneric, providerOf, googleFamilies, extractFontCss, summarise } from './font-utils.mjs';

// Font lists.
assert.deepEqual(parseFamilies(`"Open Sans", 'Helvetica Neue', Arial, sans-serif`), ['Open Sans', 'Helvetica Neue', 'Arial', 'sans-serif']);
assert.deepEqual(parseFamilies(''), []);
assert.ok(isGeneric('sans-serif') && isGeneric('-apple-system') && !isGeneric('Inter'));
assert.ok(isIconFont('Font Awesome 6 Free') && isIconFont('dashicons') && isIconFont('Material Symbols Outlined') && isIconFont('eicons'));
assert.ok(!isIconFont('Inter') && !isIconFont('Playfair Display'));

// Providers.
assert.equal(providerOf('https://fonts.gstatic.com/s/inter/v13/abc.woff2'), 'Google Fonts');
assert.equal(providerOf('https://use.typekit.net/af/123/00000/l?primer=x'), 'Adobe Fonts');
assert.equal(providerOf('https://fonts.bunny.net/inter/files/x.woff2'), 'Bunny Fonts');
assert.equal(providerOf('https://www.example.com/wp-content/themes/t/fonts/a.woff2', 'https://example.com/'), 'Self-hosted');
assert.equal(providerOf('https://cdn.example.com/a.woff2', 'https://www.example.com/'), 'Self-hosted');
assert.equal(providerOf('https://static.files.bbci.co.uk/a.woff2', 'https://www.bbc.com/'), 'Hosted on static.files.bbci.co.uk');
assert.equal(providerOf('not a url'), 'Unknown');

// Google Fonts links, old and new style.
assert.deepEqual(googleFamilies('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap'),
	[{ family: 'Inter', weights: [400, 700] }, { family: 'Playfair Display', weights: [600] }]);
assert.deepEqual(googleFamilies('https://fonts.googleapis.com/css?family=Open+Sans:400,700|Roboto'), [{ family: 'Open Sans', weights: [400, 700] }, { family: 'Roboto', weights: [] }]);
assert.deepEqual(googleFamilies('https://example.com/style.css'), []);

// CSS: @font-face files resolve against the stylesheet; declarations come from font-family, font and font variables.
const css = `/* comment font-family: Nope; */
@font-face { font-family: "Brand Sans"; font-weight: 700; src: url('../fonts/brand-700.woff2') format('woff2'), url(data:font/woff2;base64,AAAA) format('woff2'); }
h1 { font-family: "Brand Sans", Georgia, serif !important; }
p { font: italic 400 16px/1.6 Inter, sans-serif; }
:root { --font-heading: 'Brand Sans', serif; --brand-blue: #00f; }
.x { font: inherit; }`;
const found = extractFontCss(css, 'https://site.com/css/main.css');
assert.deepEqual(found.faces, [{ family: 'Brand Sans', weight: '700', style: 'normal', src: ['https://site.com/fonts/brand-700.woff2', 'embedded (data URL)'] }]);
assert.deepEqual(found.declarations.map((d) => d.stack), ['"Brand Sans", Georgia, serif', 'Inter, sans-serif', "'Brand Sans', serif"]);

// Summarising measured text: grouped by the font that actually drew it, named by the CSS for web fonts.
const sample = (o) => ({ tag: 'p', role: 'Body text', weight: 400, style: 'normal', size: 16, lineHeight: 24, letterSpacing: 0, transform: 'none', chars: 100, text: 'Hello', ...o });
const samples = [
	sample({ tag: 'h1', role: 'Headings', stack: '"Brand Serif", serif', platform: [{ familyName: '.', isCustomFont: true, glyphCount: 20 }], size: 48, weight: 700, chars: 20, text: 'Welcome' }),
	sample({ stack: 'Inter, sans-serif', platform: [{ familyName: 'Inter', isCustomFont: true, glyphCount: 600 }], chars: 600 }),
	sample({ stack: 'Inter, sans-serif', platform: [{ familyName: 'Inter', isCustomFont: true, glyphCount: 250 }, { familyName: 'Segoe UI Emoji', isCustomFont: false, glyphCount: 2 }], chars: 252, size: 14 }),
	sample({ role: 'Buttons', tag: 'span', stack: 'Inter, sans-serif', platform: [{ familyName: 'Inter', isCustomFont: true, glyphCount: 8 }], weight: 600, chars: 8, text: 'Book now' }),
	sample({ role: 'Footer', stack: 'Arial, sans-serif', platform: [{ familyName: 'Arial', isCustomFont: false, glyphCount: 120 }], size: 12, chars: 120 }),
];
const faces = [
	{ family: 'Brand Serif', weight: '700', style: 'normal', status: 'loaded', url: 'https://site.com/fonts/brandserif-700.woff2' },
	{ family: 'Inter', weight: '400', style: 'normal', status: 'loaded', url: 'https://fonts.gstatic.com/s/inter/x.woff2' },
	{ family: 'Inter', weight: '400', style: 'normal', status: 'unloaded', url: null },
	{ family: 'Noto Sans JP', weight: '400', style: 'normal', status: 'unloaded', url: null },
];
const out = summarise(samples, faces, 'https://site.com/');
assert.deepEqual(out.typefaces.map((t) => t.family), ['Inter', 'Arial', 'Brand Serif']);
const inter = out.typefaces[0], brand = out.typefaces[2], arial = out.typefaces[1];
assert.equal(inter.type, 'web font');
assert.equal(inter.provider, 'Google Fonts');
assert.equal(inter.share, +(860 / 1000).toFixed(4));
assert.deepEqual(inter.roles, ['Body text', 'Buttons']);
assert.deepEqual(inter.weights, [400, 600]);
assert.deepEqual(inter.sizes, { min: 14, max: 16, common: 16 });
assert.equal(brand.rendersAs, null, 'a cryptic internal name is not shown');
assert.equal(brand.provider, 'Self-hosted');
assert.equal(arial.type, 'system font');
assert.equal(arial.provider, "Installed on the visitor's device");
// Type scale uses the same names.
assert.deepEqual(out.typeScale.map((s) => [s.role, s.family, s.size]), [['H1', 'Brand Serif', 48], ['Body text', 'Inter', 16], ['Buttons', 'Inter', 16], ['Footer', 'Arial', 12]]);
// Duplicate faces (language subsets) merge, keeping "used" if any loaded; unused families are noted.
const interFiles = out.fontFiles.filter((f) => f.family === 'Inter');
assert.equal(interFiles.length, 1);
assert.equal(interFiles[0].status, 'loaded');
assert.equal(interFiles[0].subsets, 2);
assert.match(out.notes.join(' '), /1 declared font family isn't used on this page \(Noto Sans JP\)/);
// Readability notes for small or tight body text.
const tight = summarise([sample({ stack: 'Arial', platform: [{ familyName: 'Arial', isCustomFont: false, glyphCount: 10 }], size: 13, lineHeight: 15 })], [], '');
assert.match(tight.notes.join(' '), /Body text is 13px/);
assert.match(tight.notes.join(' '), /line height is 1\.15×/);

// v2 audit.
{
	const { audit, recommendedCss, suggestPairings, categoryOf, matchedWeight } = await import('./audit.mjs');

	// Font categories: Google Fonts data, common system fonts, then the stack's generic family.
	assert.equal(categoryOf('Inter'), 'sans-serif');
	assert.equal(categoryOf('EB Garamond'), 'serif');
	assert.equal(categoryOf('Georgia'), 'serif');
	assert.equal(categoryOf('Segoe UI'), 'sans-serif');
	assert.equal(categoryOf('BBC Reith Serif'), 'serif');
	assert.equal(categoryOf('Brand Grotesk'), 'sans-serif');
	assert.equal(categoryOf('Unknown Face', '"Unknown Face", monospace'), 'monospace');

	// CSS font matching: heavier faces first above 500; bold is faked only when nothing 600+ exists.
	const faces7 = [{ weight: '300' }, { weight: '400' }, { weight: '700' }, { weight: '900' }];
	assert.equal(matchedWeight(faces7, 800), 900);
	assert.equal(matchedWeight(faces7, 600), 700);
	assert.equal(matchedWeight(faces7, 200), 300);
	assert.equal(matchedWeight([{ weight: '200 900' }], 650), 650);
	assert.equal(matchedWeight([{ weight: '400' }], 700), 400);

	// A synthetic page with known problems.
	const s = (o) => ({ tag: 'p', role: 'Body text', stack: 'Inter, sans-serif', font: 'Inter', weight: 400, style: 'normal', size: 14, lineHeight: 17, letterSpacing: 0, transform: 'none', chars: 200, text: 'x', where: 'p.intro', lines: 4, charsPerLine: 95, textAlign: 'start', numeric: 'normal', userSelect: 'auto', upper: false, eyebrow: false, linkInText: null, price: false, quotes: false, ...o });
	const samples = [
		s({}),
		s({ where: 'p.rates', chars: 12, lines: 1, charsPerLine: null, price: true, text: '$189 a night' }),
		s({ tag: 'a', role: 'Links', where: 'a.more', chars: 10, lines: 1, charsPerLine: null, linkInText: { underlined: false, contrast: 1.2 } }),
		s({ tag: 'h1', role: 'Headings', where: 'h1.hero', size: 24, lineHeight: 30, weight: 700, lines: 2, charsPerLine: null, straggler: true, letterSpacing: 1 }),
		s({ tag: 'h2', role: 'Headings', where: 'h2.section', size: 28, lineHeight: 34, weight: 700, lines: 1, charsPerLine: null }),
		s({ tag: 'span', role: 'Small print', where: 'span.eyebrow', size: 11, weight: 300, lines: 1, charsPerLine: null, upper: true, eyebrow: true, text: 'OUR ROOMS' }),
		s({ tag: 'span', role: 'Small print', where: 'span.eyebrow', size: 11, weight: 300, lines: 1, charsPerLine: null, upper: true, eyebrow: true, text: 'DINING' }),
		s({ tag: 'span', role: 'Small print', where: 'span.eyebrow', size: 11, weight: 300, lines: 1, charsPerLine: null, upper: true, eyebrow: true, text: 'EXPLORE' }),
	];
	const result = {
		typefaces: [{ family: 'Inter', cssFamily: 'Inter', type: 'web font', share: 0.9, stack: 'Inter', sizes: { common: 14 }, weights: [300, 400, 700] }, { family: 'Roboto', cssFamily: 'Roboto', type: 'web font', share: 0.1, stack: 'Roboto, sans-serif', sizes: { common: 16 }, weights: [400] }],
		typeScale: [{ role: 'H1', family: 'Inter', size: 24, weight: 700, lineHeight: 30 }, { role: 'H2', family: 'Inter', size: 28, weight: 700, lineHeight: 34 }, { role: 'Body text', family: 'Inter', size: 14, weight: 400, lineHeight: 17 }],
		checks: { samples, faces: [{ family: 'Inter', weight: '300', style: 'normal' }, { family: 'Inter', weight: '400', style: 'normal' }], fonts: { files: 4, bytes: 300 * 1024, sizesKnown: true }, zoom: { overflow: 120 }, inputs: [{ where: 'input[type=email]', size: 14 }] },
	};
	const a = audit(result);
	const row = (id) => a.score.rows.find((r) => r.id === id).pass;
	assert.equal(row('body-size'), false);
	assert.equal(row('measure'), false);
	assert.equal(row('line-height'), false);
	assert.equal(row('levels'), false, 'H2 bigger than H1');
	assert.equal(row('real-screens'), 'manual');
	assert.equal(row('payload'), false);
	assert.equal(row('fallbacks'), false, 'Inter has no fallback');
	assert.equal(row('zoom'), false);
	assert.equal(row('orphans'), false);
	assert.equal(row('links'), false);
	assert.equal(a.score.checked, 9);
	assert.equal(a.score.passed, 0);
	const rules = a.findings.map((f) => f.rule);
	for (const rule of ['Text must survive 200% zoom', 'Thin weights on small text', 'Faked bold in Inter', 'Headings get smaller level by level', 'Line height for text that wraps', 'Cap the line length', 'Form fields at 16px on phones', 'Links that look like text', 'Set fallback fonts', 'Font files over 200KB', 'Balance headings', 'Even-width numbers on prices', 'All-caps labels above every heading', 'Pair for contrast']) {
		assert.ok(rules.includes(rule), `missing finding: ${rule}`);
	}
	assert.equal(a.findings[0].severity, 'HIGH', 'high severity first');
	assert.ok(a.findings.every((f) => f.before && f.after && f.why && f.where.length));
	assert.match(a.pairing.verdict, /look alike/);

	// A healthy page passes everything it can measure and has nothing to fix.
	const good = {
		typefaces: [{ family: 'Lora', cssFamily: 'Lora', type: 'web font', share: 0.3, stack: 'Lora, Georgia, serif', sizes: { common: 36 } }, { family: 'Inter', cssFamily: 'Inter', type: 'web font', share: 0.7, stack: 'Inter, system-ui, sans-serif', sizes: { common: 17 } }],
		typeScale: [{ role: 'H1', family: 'Lora', size: 48, weight: 600, lineHeight: 53 }, { role: 'H2', family: 'Lora', size: 32, weight: 600, lineHeight: 38 }, { role: 'Body text', family: 'Inter', size: 17, weight: 400, lineHeight: 27 }],
		checks: {
			samples: [s({ size: 17, lineHeight: 27, charsPerLine: 64, linkInText: null }), s({ tag: 'a', role: 'Links', size: 17, lineHeight: 27, chars: 8, lines: 1, charsPerLine: null, linkInText: { underlined: true, contrast: 1 } })],
			faces: [{ family: 'Inter', weight: '100 900', style: 'normal' }, { family: 'Lora', weight: '400 700', style: 'normal' }],
			fonts: { files: 2, bytes: 120 * 1024, sizesKnown: true }, zoom: { overflow: 0 }, inputs: [{ where: 'input', size: 16 }],
		},
	};
	const g = audit(good);
	assert.equal(g.score.passed, g.score.checked, JSON.stringify(g.score.rows.filter((r) => r.pass === false)));
	assert.deepEqual(g.findings, []);
	assert.match(g.pairing.verdict, /Good contrast/);

	// Recommended CSS keeps the site's fonts and desktop heading sizes, with fallbacks and fixes.
	const css = recommendedCss(good);
	assert.match(css, /--font-heading: Lora, Georgia, serif;/);
	assert.match(css, /--font-body: Inter, system-ui, sans-serif;/);
	assert.match(css, /--text-base: 1\.063rem;/);
	assert.match(css, /--text-h1: clamp\([^)]*, 3rem\);/);
	assert.match(css, /max-width: var\(--measure\)/);
	assert.match(css, /text-wrap: balance/);
	assert.match(css, /@media \(max-width: 640px\) \{ input, select, textarea \{ font-size: 16px; \} \}/);
	const cssBad = recommendedCss(result);
	assert.match(cssBad, /--text-base: 1rem;/, 'body raised to 16px');
	assert.match(cssBad, /--font-body: Inter, system-ui, sans-serif;/, 'fallback added');
	assert.ok(!/NaN|undefined/.test(css + cssBad));

	// Pairings: keep one of the site's fonts; suit the property; never non-Latin script pairs.
	const pr = suggestPairings(good, 'luxury');
	assert.ok(pr.keeps.length && pr.keeps.every((p) => ['lora', 'inter'].includes(p.keeps.toLowerCase())));
	assert.ok(pr.forProperty.length >= 4 && pr.forProperty.every((p) => p.matched.length));
	assert.ok(!pr.forProperty.some((p) => pr.keeps.some((k) => k.name === p.name)), 'no duplicates between the two lists');
	assert.ok(![...pr.keeps, ...pr.forProperty].some((p) => /\bJP\b|\bKR\b/.test(`${p.heading} ${p.body}`)));
	assert.ok(suggestPairings(good, 'none').forProperty.every((p) => /hotel|hospitality|resort|travel|guesthouse|spa|restaurant|cafe|wine|wellness|bar|holiday|accommodation/i.test(p.bestFor)));
}

console.log('ok');
