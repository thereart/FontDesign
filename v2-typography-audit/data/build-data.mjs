// Builds FontDesign v2's font catalogue (Google Fonts, Fontshare, Fontsource open-source, system stacks)
// and its pairings: the curated ones from UI UX Pro Max and taste-skill, plus pairings generated with the
// skills' pairing rules (superfamilies, same designer, mood-matched contrast).
//
// Usage: node data/build-data.mjs <inputs folder>
// The inputs folder holds (download them first):
//   skills/nextlevelbuilder_ui-ux-pro-max-skill   git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
//   sources/fontshare.json                         https://api.fontshare.com/v2/fonts
//   sources/fontsource.json                        https://api.fontsource.org/v1/fonts
//   sources/mfs                                    git clone https://github.com/system-fonts/modern-font-stacks
// It reads the curated pairings already in data/pairings.json (basis "curated") and rewrites pairings.json
// and font-categories.json in this folder.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INPUTS = process.argv[2];
if (!INPUTS) {
	console.error('Usage: node data/build-data.mjs <inputs folder> (see the comment at the top of this file)');
	process.exit(1);
}
const SK = `${INPUTS}/skills`, SRC = `${INPUTS}/sources`;
const OUT = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');

function parseCsv(text) {
	const rows = [];
	let row = [], field = '', quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') { row.push(field); field = ''; }
		else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
		else field += ch;
	}
	if (field || row.length) { row.push(field); rows.push(row); }
	const [head, ...body] = rows.filter((r) => r.some(Boolean));
	return body.map((r) => Object.fromEntries(head.map((h, k) => [h.trim(), (r[k] ?? '').trim()])));
}

// Mood words line up with the property types in audit.mjs (luxury, boutique, resort, waterfront, business, eco, heritage).
// Assigned by FontDesign from each typeface's style; fonts not listed get defaults from their category.
const MOODS = {
	// Google Fonts serifs and display faces
	'Cormorant Garamond': 'luxury elegant refined classic timeless', Cormorant: 'luxury elegant refined sophisticated high-end',
	'Playfair Display': 'elegant luxury editorial sophisticated', 'DM Serif Display': 'elegant editorial stylish distinctive',
	Fraunces: 'warm playful distinctive soft artisan', 'Libre Baskerville': 'classic traditional literary trustworthy timeless',
	'Crimson Pro': 'classic literary calm traditional', Lora: 'warm calm literary friendly', Merriweather: 'trustworthy classic traditional calm',
	'Source Serif 4': 'calm professional literary trustworthy', Spectral: 'elegant refined calm literary', 'Bodoni Moda': 'luxury high-end elegant sophisticated',
	Cinzel: 'classic heritage luxury historic', Marcellus: 'classic elegant heritage calm', Prata: 'elegant luxury refined', 'Gilda Display': 'elegant refined luxury calm',
	Italiana: 'elegant luxury stylish airy light', 'Zilla Slab': 'sturdy friendly warm modern', 'Roboto Slab': 'sturdy professional trustworthy',
	Arvo: 'vintage sturdy warm', Bitter: 'sturdy trustworthy calm', Newsreader: 'calm editorial literary classic', Literata: 'calm literary warm',
	'Instrument Serif': 'elegant editorial modern stylish', 'Young Serif': 'warm vintage friendly', Gloock: 'bold editorial distinctive',
	'Abril Fatface': 'bold editorial vintage', 'Yeseva One': 'elegant warm distinctive', 'EB Garamond': 'classic literary timeless heritage traditional',
	Cardo: 'classic historic literary heritage', Alegreya: 'literary warm classic artisan', 'Noto Serif Display': 'elegant refined luxury',
	'Libre Caslon Text': 'classic traditional trustworthy heritage', 'Libre Caslon Display': 'classic elegant heritage', 'Cormorant Infant': 'elegant soft refined',
	'Playfair': 'elegant editorial luxury', 'PT Serif': 'trustworthy classic professional', 'IBM Plex Serif': 'professional precise modern', 'Noto Serif': 'neutral classic trustworthy',
	'Rozha One': 'bold luxury distinctive', 'Della Respira': 'elegant classic calm', 'Castoro': 'classic literary calm', 'Ovo': 'elegant soft calm',
	'Domine': 'trustworthy sturdy classic', 'Old Standard TT': 'vintage historic heritage traditional', 'Sorts Mill Goudy': 'classic heritage historic',
	'Belleza': 'elegant fresh light airy', 'Josefin Slab': 'vintage elegant stylish', 'Halant': 'calm classic', 'Vollkorn': 'warm classic literary traditional',
	// Google Fonts sans
	Inter: 'neutral clean professional modern precise', Manrope: 'modern clean friendly', 'DM Sans': 'modern clean friendly minimal', 'Work Sans': 'friendly clean approachable',
	Karla: 'friendly approachable warm', Lato: 'warm friendly professional calm', Montserrat: 'modern bold stylish', Raleway: 'elegant light stylish airy',
	'Nunito Sans': 'friendly soft clean', Nunito: 'friendly soft playful relaxed', Quicksand: 'friendly soft playful light relaxed', Poppins: 'modern friendly bold',
	'Open Sans': 'neutral friendly trustworthy clean', 'Source Sans 3': 'neutral professional calm', 'IBM Plex Sans': 'professional precise neutral', Jost: 'modern stylish clean',
	'Josefin Sans': 'elegant vintage stylish light', Outfit: 'modern clean friendly', 'Plus Jakarta Sans': 'modern friendly clean', Figtree: 'friendly clean approachable',
	'Hanken Grotesk': 'clean neutral calm', 'Albert Sans': 'clean friendly calm', Barlow: 'clean technical modern', Mulish: 'clean minimal calm light', Archivo: 'professional neutral',
	'Public Sans': 'neutral trustworthy professional', 'Red Hat Text': 'modern friendly', Lexend: 'friendly clean approachable', Urbanist: 'modern clean stylish', Sora: 'modern technical',
	'Space Grotesk': 'distinctive technical modern', Rubik: 'friendly soft relaxed', Cabin: 'warm friendly approachable', 'PT Sans': 'neutral professional trustworthy',
	'Libre Franklin': 'classic professional trustworthy', Questrial: 'clean friendly light', 'Didact Gothic': 'clean light airy', 'Tenor Sans': 'elegant calm refined',
	'Noto Sans': 'neutral trustworthy', Roboto: 'neutral clean professional', 'Fira Sans': 'professional clean', 'Alegreya Sans': 'warm literary friendly', 'Merriweather Sans': 'trustworthy friendly',
	'Be Vietnam Pro': 'modern clean friendly', 'Instrument Sans': 'modern clean stylish', Onest: 'clean modern', 'Schibsted Grotesk': 'editorial modern',
	// Fontshare
	Zodiak: 'elegant editorial refined distinctive', Sentient: 'calm editorial literary classic', Boska: 'elegant luxury sophisticated distinctive', 'Bespoke Serif': 'elegant editorial stylish modern',
	Gambetta: 'classic literary traditional calm', Gambarino: 'elegant classic refined heritage', Neco: 'warm friendly editorial', Erode: 'warm classic literary refined',
	Bonny: 'playful warm distinctive', Rowan: 'calm literary classic trustworthy', Recia: 'modern distinctive editorial', Satoshi: 'modern clean friendly minimal',
	'General Sans': 'modern clean neutral professional', Switzer: 'clean neutral professional precise', 'Cabinet Grotesk': 'distinctive stylish creative bold',
	'Clash Grotesk': 'modern editorial stylish', 'Clash Display': 'bold distinctive stylish creative', Chillax: 'friendly playful relaxed soft', Supreme: 'modern clean professional',
	Author: 'warm friendly approachable', Ranade: 'calm editorial distinctive', Excon: 'modern precise', Alpino: 'friendly approachable', Quilon: 'modern clean',
	Pally: 'playful friendly', 'Bespoke Sans': 'modern clean stylish', Plein: 'calm clean', Synonym: 'calm clean approachable', Amulya: 'warm soft friendly',
	Technor: 'technical modern', Panchang: 'bold distinctive', 'Pramukh Rounded': 'friendly soft approachable', Melodrama: 'elegant luxury distinctive',
	'Bespoke Slab': 'warm sturdy vintage', 'Trench Slab': 'vintage heritage sturdy', Hoover: 'vintage bold',
	// Fontsource open-source (not on Google Fonts)
	'Pitagon Serif': 'classic calm literary', 'Pitagon Sans': 'clean modern neutral', 'Pitagon Sans Text': 'clean neutral calm', Redaction: 'editorial distinctive vintage literary',
	Bagnard: 'vintage heritage distinctive elegant', 'Bagnard Sans': 'vintage distinctive', 'Cooper Hewitt': 'clean modern neutral professional', Metropolis: 'modern clean professional',
	'Uncut Sans': 'modern clean distinctive', 'Open Sauce Sans': 'friendly approachable warm modern', 'Hauora Sans': 'friendly calm clean', 'Argentum Sans': 'modern distinctive',
	Lextrall: 'modern stylish', Aileron: 'clean neutral professional', 'Clear Sans': 'clean neutral calm', 'Nebula Sans': 'clean modern', Junction: 'friendly approachable',
	Karmilla: 'warm friendly', 'iA Writer Quattro': 'calm literary', 'Open Runde': 'friendly soft playful', 'Adwaita Sans': 'clean neutral', FiraGO: 'clean professional',
};
const CATEGORY_MOODS = { serif: 'classic elegant literary timeless', 'sans-serif': 'clean modern neutral', slab: 'sturdy warm vintage', display: 'distinctive bold stylish' };
const moodsFor = (family, category) => (MOODS[family] ?? CATEGORY_MOODS[category] ?? '').split(' ').filter(Boolean);

const fonts = {}; // family -> catalogue entry
const add = (f) => { if (!fonts[f.family]) fonts[f.family] = { ...f, moods: moodsFor(f.family, f.category) }; };

// Google Fonts (from UI UX Pro Max's Google Fonts metadata).
const google = parseCsv(readFileSync(`${SK}/nextlevelbuilder_ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max/data/google-fonts.csv`, 'utf8'));
for (const g of google) {
	if (!g.Family || !/latin/.test(g.Subsets) || g['Is Noto'] === 'Yes' && !/^Noto (Sans|Serif)( Display)?$/.test(g.Family)) continue;
	const cat = g.Category.toLowerCase().replace(/\s+/g, '-');
	// Monospace and handwriting stay in (curated pairs use them); generation filters by category.
	if (!['serif', 'sans-serif', 'display', 'monospace', 'handwriting'].includes(cat)) continue;
	const category = /slab/i.test(g.Family) || /Slab/.test(g.Classifications) ? 'slab' : cat;
	const weights = [...new Set(g.Styles.split('|').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number))].sort((a, b) => a - b);
	// cjk: made mainly for Japanese, Korean or Chinese, with Latin as a supplement; not offered in generated pairs.
	add({ family: g.Family, source: 'google', category, weights, designers: g.Designers.split('|').map((d) => d.trim()).filter(Boolean), rank: Number(g['Popularity Rank']) || 9999, licence: 'Open source (Google Fonts)', cjk: /japanese|korean|chinese/.test(g.Subsets) });
}

// Fontshare (Indian Type Foundry): free for personal and commercial use.
const fontshare = JSON.parse(readFileSync(`${SRC}/fontshare.json`, 'utf8')).fonts;
const byViews = [...fontshare].sort((a, b) => (b.views || 0) - (a.views || 0));
for (const f of fontshare) {
	const c = f.category.toLowerCase();
	const category = c.startsWith('serif') ? (c.includes('slab') ? 'slab' : 'serif') : c.startsWith('slab') ? 'slab' : c.startsWith('sans') ? (c.includes('display') ? 'display' : 'sans-serif') : c.startsWith('display') ? 'display' : null;
	if (!category || /blackletter/.test(c)) continue;
	const weights = [...new Set(f.styles.map((s) => s.weight.weight).filter((w) => w >= 100))].sort((a, b) => a - b);
	add({ family: f.name, source: 'fontshare', slug: f.slug, category, weights, designers: (f.designers || []).map((d) => d.name), rank: byViews.indexOf(f) + 1, licence: f.license_type === 'sil_ofl' ? 'Open source (SIL OFL)' : 'Free for commercial use (ITF Free Font License)' });
}

// Fontsource: open-source fonts that aren't on Google Fonts (a curated set suited to websites).
const FONTSOURCE_PICK = ['pitagon-serif', 'pitagon-sans', 'pitagon-sans-text', 'redaction', 'bagnard', 'bagnard-sans', 'cooper-hewitt', 'metropolis', 'uncut-sans', 'open-sauce-sans', 'hauora-sans', 'argentum-sans', 'lextrall', 'aileron', 'clear-sans', 'nebula-sans', 'junction', 'karmilla', 'ia-writer-quattro', 'open-runde', 'adwaita-sans', 'firago'];
const fontsource = JSON.parse(readFileSync(`${SRC}/fontsource.json`, 'utf8'));
for (const id of FONTSOURCE_PICK) {
	const f = fontsource.find((x) => x.id === id);
	if (!f) throw new Error(`missing fontsource ${id}`);
	add({ family: f.family, source: 'fontsource', id: f.id, category: f.category, weights: f.weights, designers: [], rank: 500, licence: f.license === 'OFL-1.1' ? 'Open source (SIL OFL)' : `Open source (${f.license})` });
}

// System font stacks (Modern Font Stacks, CC0): nothing to download; the look varies a little by device.
const SYSTEM_MOODS = {
	'System UI': 'neutral clean modern', Transitional: 'classic trustworthy timeless traditional', 'Old Style': 'classic literary warm heritage traditional',
	Humanist: 'warm friendly approachable', 'Geometric Humanist': 'modern clean friendly', 'Classical Humanist': 'elegant calm refined', 'Neo-Grotesque': 'neutral clean professional',
	Industrial: 'bold technical', 'Rounded Sans': 'friendly soft playful relaxed', 'Slab Serif': 'sturdy vintage warm', Antique: 'vintage heritage warm historic', Didone: 'elegant luxury sophisticated high-end',
};
const readme = readFileSync(`${SRC}/mfs/README.md`, 'utf8');
for (const [, name, stack] of readme.matchAll(/^## (.+?)\r?\n[\s\S]*?font-family: ([^;]+);/gm)) {
	if (!SYSTEM_MOODS[name]) continue;
	const generic = stack.trim().split(',').pop().trim();
	const category = /Slab|Antique/.test(name) ? 'slab' : generic === 'serif' ? 'serif' : 'sans-serif';
	fonts[`${name} (system)`] = { family: `${name} (system)`, source: 'system', stack: stack.trim(), category, weights: [400, 700], designers: [], rank: 300, licence: 'Fonts already on the visitor\'s device', moods: SYSTEM_MOODS[name].split(' ') };
}

// Pairings.
const pair = (h, b, extra) => {
	const [H, B] = [fonts[h], fonts[b]];
	if (!H || !B) return null;
	const moods = [...new Set([...H.moods, ...B.moods])];
	const font = (f) => ({ family: f.family, source: f.source, slug: f.slug, id: f.id, stack: f.stack, weights: f.weights, category: f.category, licence: f.licence });
	return { heading: h, body: b, headingWeights: H.weights, bodyWeights: B.weights, moods, fonts: { heading: font(H), body: font(B) }, ...extra };
};
const all = [];
const seen = new Set();
const push = (p) => { if (!p) return; const key = `${p.heading}|${p.body}`; if (seen.has(key)) return; seen.add(key); all.push(p); };

// 1. Curated pairings (UI UX Pro Max, taste-skill): kept from the earlier build, with their fonts looked up.
const curated = JSON.parse(readFileSync(`${OUT}/pairings.json`, 'utf8')).pairings.filter((p) => p.basis === undefined || p.basis === 'curated');
let unresolved = 0;
for (const p of curated) {
	const built = pair(p.heading, p.body, { name: p.name, bestFor: p.bestFor, note: p.note, tracking: p.tracking, source: p.source, basis: 'curated' });
	if (built) { built.moods = p.moods; built.headingWeights = p.headingWeights; built.bodyWeights = p.bodyWeights; push(built); } else unresolved++;
}

// Body text only from faces made for paragraphs. Fontshare doesn't label its text faces, so those are listed;
// Google ones must be popular (or have moods assigned) and not display, condensed or small-caps cuts.
const FONTSHARE_BODY = new Set(['Satoshi', 'General Sans', 'Switzer', 'Supreme', 'Synonym', 'Plein', 'Author', 'Clash Grotesk', 'Quilon', 'Bespoke Sans', 'Amulya', 'Alpino', 'Excon']);
const NOT_TEXT = /Stencil|Display|Mono|\bSC\b|Condensed|Narrow|Hairline|Pixel|Outline|Inline|Shadow|Decorative|One$/i;
const textBody = (f) => f.category === 'sans-serif' && f.weights.includes(400) && f.weights.some((w) => w >= 600) && !NOT_TEXT.test(f.family) && !f.cjk
	&& (f.source === 'fontshare' ? FONTSHARE_BODY.has(f.family) : f.source === 'google' ? f.rank <= 200 || !!MOODS[f.family] : true);
// Headings: serif and slab faces, or display faces with moods assigned (so novelty display fonts, like stencils
// and marker scripts, aren't offered to hotels).
const headingFace = (f) => (['serif', 'slab'].includes(f.category) || (f.category === 'display' && !!MOODS[f.family])) && !/\bSC\b|Mono|Stencil/.test(f.family) && !f.cjk;
const popular = (f, limit) => f.source !== 'google' || f.rank <= limit;

// 2. Superfamilies: a serif (or slab) and a sans designed as one family (web-typography: superfamilies).
const base = (name) => name.replace(/\b(Serif|Sans|Slab|Text|Display|Pro|Variable|[0-9]+)\b/g, '').replace(/\s+/g, ' ').trim();
const list = Object.values(fonts);
for (const h of list.filter((f) => headingFace(f) && f.source !== 'system' && popular(f, 800))) {
	for (const b of list.filter((f) => textBody(f) && f.source === h.source && base(f.family) === base(h.family) && f.family !== h.family)) {
		push(pair(h.family, b.family, { name: `${base(h.family)} superfamily`, bestFor: `${h.family} with ${b.family}: one family designed to work together, so they share proportions and details.`, basis: 'superfamily', source: 'FontDesign (superfamily rule)' }));
	}
}

// 3. Same designer: a serif and a sans by the same designer often share DNA (web-typography: same-designer strategy).
// Popular faces only, one pairing per heading, and not designers with a whole library of families.
const familiesBy = {};
for (const f of list) for (const d of f.designers) familiesBy[d] = (familiesBy[d] || 0) + 1;
for (const h of list.filter((f) => headingFace(f) && f.source !== 'system' && popular(f, 250))) {
	for (const b of list.filter((f) => textBody(f) && popular(f, 250) && f.designers.some((d) => h.designers.includes(d) && familiesBy[d] <= 12) && base(f.family) !== base(h.family)).slice(0, 1)) {
		push(pair(h.family, b.family, { name: `${h.family} + ${b.family}`, bestFor: `Same designer (${h.designers.find((d) => b.designers.includes(d))}): related shapes, clearly different styles.`, basis: 'same designer', source: 'FontDesign (same-designer rule)' }));
	}
}

// 4. Mood-matched contrast: a serif, slab or display heading with a sans body sharing its mood. Same source first,
//    so one service serves both; system stacks pair only with system stacks (no download at all).
const moodPool = list.filter((f) => f.moods.length && (MOODS[f.family] || SYSTEM_MOODS[f.family.replace(' (system)', '')]));
for (const h of moodPool.filter(headingFace)) {
	// Fontshare, Fontsource and system headings get four partners, from their own source first; system stacks
	// (few, and free to use) pair with any contrasting system stack.
	const google = h.source === 'google';
	const bodies = moodPool.filter((b) => textBody(b) && b.family !== h.family && (h.source === 'system') === (b.source === 'system'))
		.map((b) => ({ b, overlap: b.moods.filter((m) => h.moods.includes(m)).length, same: b.source === h.source }))
		.filter((x) => x.overlap >= (h.source === 'system' ? 0 : 1))
		.sort((x, y) => (google ? 0 : y.same - x.same) || y.overlap - x.overlap || y.same - x.same || x.b.rank - y.b.rank)
		.slice(0, google ? 3 : 4);
	for (const { b, overlap } of bodies) {
		const shared = b.moods.filter((m) => h.moods.includes(m));
		const why = shared.length ? `Shares a ${shared.slice(0, 2).join(', ')} mood, with a clear ${h.category} / sans contrast.` : `A clear ${h.category} / sans contrast, using fonts already on the visitor's device.`;
		push(pair(h.family, b.family, { name: `${h.family.replace(' (system)', '')} + ${b.family.replace(' (system)', '')}`, bestFor: why, basis: 'mood match', source: 'FontDesign (mood-matched contrast)' }));
	}
}

// Font categories for spotting fonts on a site: Google, plus Fontshare and Fontsource.
const categories = JSON.parse(readFileSync(`${OUT}/font-categories.json`, 'utf8'));
for (const f of list) if (f.source === 'fontshare' || f.source === 'fontsource') categories.fonts[f.family] ??= [f.category === 'slab' ? 'serif' : f.category];
categories.source = 'Google Fonts metadata (via UI UX Pro Max, MIT), Fontshare and Fontsource catalogues';
writeFileSync(`${OUT}/font-categories.json`, JSON.stringify(categories));

writeFileSync(`${OUT}/pairings.json`, JSON.stringify({
	sources: ['UI UX Pro Max (nextlevelbuilder/ui-ux-pro-max-skill, MIT)', 'taste-skill (Leonxlnx/taste-skill, MIT)', 'Generated by FontDesign from web-typography\'s pairing rules', 'Fonts: Google Fonts, Fontshare (fontshare.com), Fontsource (fontsource.org), Modern Font Stacks (CC0)'],
	pairings: all,
}, null, '\t'));

const count = (k, v) => all.filter((p) => p[k] === v).length;
const bySource = {};
for (const p of all) { const s = [...new Set([p.fonts.heading.source, p.fonts.body.source])].join('+'); bySource[s] = (bySource[s] || 0) + 1; }
console.log(`catalogue: ${list.length} fonts (${['google', 'fontshare', 'fontsource', 'system'].map((s) => `${s} ${list.filter((f) => f.source === s).length}`).join(', ')})`);
console.log(`pairings: ${all.length} = curated ${count('basis', 'curated')} (${unresolved} unresolved), superfamily ${count('basis', 'superfamily')}, same designer ${count('basis', 'same designer')}, mood ${count('basis', 'mood match')}`);
console.log('by font source:', bySource);
console.log(all.filter((p) => p.basis === 'superfamily').slice(0, 12).map((p) => `${p.heading}+${p.body}`).join(' | '));
console.log(all.filter((p) => p.fonts.heading.source === 'fontshare').slice(0, 8).map((p) => `${p.heading}+${p.body} [${p.basis}]`).join(' | '));
