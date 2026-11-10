# FontDesign

Finds every font and typeface on a website: which fonts actually show, where they come from, what they're used for, and the type scale. v2 also scores the typography, lists the fixes with the CSS to make them, and suggests font pairings for the property. A companion to [ColourPalette](https://github.com/thereart/ColourPalette).

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer and Microsoft Edge or Google Chrome. On Windows, double-click `Start.bat` in a version's folder; it installs what it needs the first time and opens the app in your browser. Or from a terminal:

```bash
cd v2-typography-audit
npm install
node server.mjs
```

Run the tests with `node test.mjs` in a version's folder. From the command line without the web page: `node scrape-fonts.mjs example.com` writes `fonts-example.com.json`.

## Versions

| Folder | Port | What it does |
|---|---|---|
| `v1-font-finder` | 4340 | Every typeface ranked by how much of the page's text it shows (web, system or icon font; where it's served from; what it's used for; weights, sizes; a specimen in the site's own font), the type scale for H1-H6 and each kind of text, and every declared font file and whether it's used. |
| `v2-typography-audit` | 4342 | Everything in v1, plus a typography score, a list of fixes (high, medium, low) with before / after / why, a check that paired fonts contrast enough, recommended CSS that keeps the site's fonts, and suggested font pairings by property type with live previews. |

## How it works

It opens the page in Edge or Chrome (through `playwright-core`, which uses the browser already on the computer) and asks the browser which font actually drew each piece of visible text. That catches fallbacks, missing web fonts and system fonts, which reading the CSS alone can't. v2 also measures characters per line, links inside text, lone last words in headings, font file sizes, the page at 200% zoom (half the width), and form fields at phone width. Pages that fail to load, return an error, or show a bot check are reported as such rather than measured.

With "Measure as visitors see it" turned off, or if no browser is available, it reads the HTML and stylesheets instead. That lists the declared fonts but can't score or audit them.

## Credits (v2)

The audit rules and pairing data come from these skills:

- [web-typography](https://github.com/wondelai/skills/tree/main/web-typography) by wondelai (MIT): the ten-check Quick Diagnostic and score, measure, line height, sizes and pairing contrast.
- [Better Typography](https://github.com/jakubkrehel/skills/tree/main/skills/better-typography) by Jakub Krehel (MIT): the findings, high / medium / low severity, and before / after / why format.
- [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) by Anthropic (Apache 2.0): one or two clearly distinct families, and template habits such as all-caps labels above every heading.
- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) by nextlevelbuilder (MIT): Google Fonts categories and font pairings, bundled in `v2-typography-audit/data/`.
- [taste-skill](https://github.com/Leonxlnx/taste-skill) by Leonxlnx (MIT): curated pairings with letter spacing, bundled in `v2-typography-audit/data/`.

The bundled data's licences are in `v2-typography-audit/data/THIRD_PARTY_LICENSES.md`.
