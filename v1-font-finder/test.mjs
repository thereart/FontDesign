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

console.log('ok');
