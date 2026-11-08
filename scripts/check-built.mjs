// Checks the built site (build/) the way a visitor gets it: served with the same security headers as
// static/.htaccess (including the Content-Security-Policy), then crawled and driven with a real browser.
// Usage: node scripts/check-built.mjs [--shots dir] [--report file] [--base-dir build]
// Needs Playwright with Chromium installed (not a dependency of this project).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const BUILD = path.resolve(arg('--base-dir', path.join(root, 'build')));
const SHOTS = arg('--shots', null);
const REPORT = arg('--report', null);
const ONLY_SHOTS = process.argv.includes('--shots-only');
const {chromium} = require('playwright');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const htaccess = fs.readFileSync(path.join(root, 'static', '.htaccess'), 'utf8');
const HEADERS = Object.fromEntries([...htaccess.matchAll(/Header always set ([\w-]+) "([^"]+)"/g)].map((m) => [m[1], m[2]]));
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.zip': 'application/zip', '.ico': 'image/x-icon'};

function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(BUILD, decodeURIComponent(u.pathname));
    if (!p.startsWith(BUILD)) { res.writeHead(400); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      if (!u.pathname.endsWith('/')) { res.writeHead(301, {Location: u.pathname + '/' + u.search}); return res.end(); }
      p = path.join(p, 'index.html');
    }
    const ok = fs.existsSync(p) && fs.statSync(p).isFile();
    const file = ok ? p : path.join(BUILD, '404.html');
    res.writeHead(ok ? 200 : 404, {...HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const results = {checks: [], failures: [], a11y: [], shots: [], try: null, validator: null};
const check = (name, ok, detail = '') => { results.checks.push({name, ok, detail}); if (!ok) results.failures.push(`${name}: ${detail}`); };

const srv = await serve();
const BASE = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch();

try {
  if (!ONLY_SHOTS) {
    // 1. Every sitemap page and every internal link, asset and download returns 200.
    const sitemap = fs.readFileSync(path.join(BUILD, 'sitemap.xml'), 'utf8');
    const pages = [...sitemap.matchAll(/<loc>https:\/\/olip\.ai([^<]*)<\/loc>/g)].map((m) => m[1]);
    const links = new Set(pages);
    for (const pg of pages) {
      const html = fs.readFileSync(path.join(BUILD, pg, 'index.html'), 'utf8');
      check(`canonical ${pg}`, html.includes(`<link data-rh="true" rel="canonical" href="https://olip.ai${pg}"`), 'canonical tag');
      for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) if (!m[1].startsWith('//')) links.add(m[1]);
    }
    let bad = 0;
    for (const l of links) {
      const r = await fetch(BASE + l, {method: 'HEAD', redirect: 'manual'});
      if (r.status !== 200) { bad++; check(`link ${l}`, false, `HTTP ${r.status}`); }
    }
    check('sitemap pages and internal links return 200', bad === 0, `${links.size} URLs, ${bad} not 200`);
    results.pages = pages.length; results.links = links.size;
    const nf = await fetch(BASE + '/no-such-page/');
    check('unknown page returns 404 with the 404 page', nf.status === 404 && (await nf.text()).includes('Page not found'), `HTTP ${nf.status}`);
    const rd = await fetch(BASE + '/docs/quickstart', {redirect: 'manual'});
    check('folder URL without slash redirects to the slash version', rd.status === 301 && rd.headers.get('location') === '/docs/quickstart/', `${rd.status} ${rd.headers.get('location')}`);

    // 2. Downloads: SHA256SUMS matches the files, and the downloads page shows the same hashes.
    const sums = fs.readFileSync(path.join(BUILD, 'downloads', 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/));
    let sumBad = 0;
    for (const [h, f] of sums) {
      const buf = Buffer.from(await (await fetch(BASE + f)).arrayBuffer());
      if (crypto.createHash('sha256').update(buf).digest('hex') !== h) { sumBad++; check(`sha256 ${f}`, false, 'mismatch'); }
    }
    check('every SHA256SUMS entry matches the served file', sumBad === 0, `${sums.length} files`);
    const dl = fs.readFileSync(path.join(BUILD, 'spec', 'downloads', 'index.html'), 'utf8');
    for (const [h, f] of sums.filter(([, f]) => f.startsWith('/downloads/'))) check(`downloads page shows hash of ${f}`, dl.includes(h.slice(0, 16)), h.slice(0, 16));
    const kit = sums.find(([, f]) => f.endsWith('draft-kit.zip'));
    check('kit zip is listed', !!kit);

    // 3. /try/: drive the whole simulation in a browser and watch every request.
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await ctx.newPage();
    const reqs = []; const consoleErrors = []; let loaded = false;
    page.on('request', (r) => reqs.push({url: r.url(), method: r.method(), afterLoad: loaded}));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.goto(BASE + '/try/', {waitUntil: 'networkidle'});
    loaded = true;
    const t0 = Date.now();
    const click = (name) => page.getByRole('button', {name, exact: true}).click();
    const next = () => click('Next');
    const alertText = async () => (await page.getByRole('alert').last().textContent()) || '';
    await page.selectOption('#jur', 'US-WY'); await click('Search');
    check('try: no-match shows legal-help alternatives', (await page.textContent('main')).includes('Free legal help') || (await page.textContent('main')).includes('No match'));
    await page.selectOption('#jur', ''); await click('Search');
    await next(); await next(); await next();
    await click('Agent tries to send to two recipients');
    check('try: two recipients refused', (await alertText()).includes('OLIP_ONE_RECIPIENT_ONLY'));
    await page.getByLabel(/Dana Alvarez/).check(); await next();
    await click('Build the preview'); await next();
    await click('AI agent approves for itself');
    check('try: agent self-approval refused', (await alertText()).includes('OLIP_EVENT_SOURCE_FORBIDDEN'));
    await click('I approve (as the person)'); await next();
    await click('Submit with a wrong digest');
    check('try: wrong digest refused', (await alertText()).includes('OLIP_CONSENT_MISMATCH'));
    await click('Add fields the person did not approve');
    check('try: unapproved fields refused', (await alertText()).includes('OLIP_FIELD_NOT_ACCEPTED'));
    await click('Submit the approved handoff'); await next();
    for (let i = 0; i < 2; i++) await click('Next status event');
    await click('Verify the receipt');
    check('try: receipt verifies with the TEST key', (await page.textContent('main')).includes('Valid: the signature checks'));
    await click('Try three forged receipts');
    const main = await page.textContent('main');
    check('try: three forged receipts rejected', (main.match(/rejected \(/g) || []).length === 3, String((main.match(/rejected \(/g) || []).length));
    await click('AI agent claims "delivered" itself');
    check('try: agent outcome claim refused', (await alertText()).includes('OLIP_EVENT_SOURCE_FORBIDDEN'));
    for (let i = 0; i < 2; i++) await click('Next status event');
    check('try: responded is explained as not acceptance', (await page.textContent('main')).includes('None of these states means the firm took the case'));
    if (SHOTS) { await page.screenshot({path: path.join(SHOTS, 'after-try-status-desktop.png'), fullPage: false}); results.shots.push('after-try-status-desktop.png'); }
    await next();
    await click('Withdraw this handoff');
    check('try: withdrawal says the recipient may retain a copy', (await page.textContent('main')).includes('withdrawal_notice_sent_recipient_may_retain_copy'));
    const scriptedMs = Date.now() - t0;
    // Stale approval and offline firm, after a reset.
    await click('Reset');
    await page.selectOption('#jur', ''); await click('Search'); await next(); await next(); await next();
    await page.getByLabel(/Jordan Okafor/).check(); await next(); await click('Build the preview'); await next();
    await click('I approve (as the person)'); await next();
    await click('Edit the CaseBrief after approval, then submit');
    check('try: edit after approval makes the approval stale', (await alertText()).includes('OLIP_AUTHORIZATION_STALE'));
    await page.getByRole('button', {name: 'Back to choose fields'}).click();
    await click('Build the preview'); await next(); await click('I approve (as the person)'); await next();
    await click('Submit the approved handoff'); await next(); await click('Next status event');
    check('try: offline firm ends in failed with no receipt', (await page.textContent('main')).includes('There is no receipt'));
    // Real-looking data is refused.
    await click('Reset'); await page.selectOption('#jur', ''); await click('Search'); await next(); await next();
    await page.fill('#summary', 'Contact me at someone@gmail.com or 415 555 1234'); // scan-publication: allow (input that must be refused)
    await click('Save CaseBrief');
    check('try: real-looking personal data refused', (await alertText()).includes('fictional text only'));
    // Keyboard: Next is reachable and the step heading takes focus.
    await click('Next');
    check('try: step heading receives focus after Next', await page.evaluate(() => document.activeElement?.id === 'stepTitle'));
    // While the simulation is used, the only allowed requests are the site's own code files (Docusaurus loads
    // page chunks lazily, for example when a link is hovered). No data request of any kind is allowed.
    const after = reqs.filter((r) => r.afterLoad && !(r.method === 'GET' && r.url.startsWith(BASE + '/assets/')));
    const nonGet = reqs.filter((r) => r.method !== 'GET');
    const offsite = reqs.filter((r) => !r.url.startsWith(BASE));
    const storage = await page.evaluate(() => ({ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie}));
    const cookies = await ctx.cookies();
    check('try: no request other than GET', nonGet.length === 0, JSON.stringify(nonGet.slice(0, 3)));
    check('try: no request to another site', offsite.length === 0, JSON.stringify(offsite.slice(0, 3)));
    check('try: no data requests while using the simulation (only the site\'s own code files)', after.length === 0, JSON.stringify(after.slice(0, 5)));
    check('try: no cookies', cookies.length === 0 && storage.cookie === '', JSON.stringify(cookies));
    // Docusaurus itself keeps the theme choice and two status-banner settings; the simulation adds nothing.
    check('try: the simulation stores nothing (only site-wide theme and banner settings exist)', storage.ls.every((k) => k === 'theme' || k.startsWith('docusaurus.announcement.')) && storage.ss.length === 0, JSON.stringify(storage));
    check('try: no console errors (including CSP violations)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    results.try = {requestsBeforeUse: reqs.filter((r) => !r.afterLoad).length, codeFileRequestsDuringUse: reqs.filter((r) => r.afterLoad).length, dataRequestsDuringUse: after.length, scriptedHappyPathMs: scriptedMs, storage};
    await ctx.close();

    // 4. The existing validator page under the live Content-Security-Policy.
    const vctx = await browser.newContext(); const vp = await vctx.newPage(); const verr = [];
    vp.on('console', (m) => { if (m.type() === 'error') verr.push(m.text()); });
    await vp.goto(BASE + '/validator/', {waitUntil: 'networkidle'});
    await vp.waitForTimeout(800);
    await vp.selectOption('#exampleSel', '07-casebrief.json');
    await vp.getByRole('button', {name: 'Validate', exact: true}).click();
    const vtext = (await vp.textContent('main')) || '';
    check('validator works under the site CSP (fictional CaseBrief validates)', vtext.includes('Valid against casebrief.json') && verr.length === 0, verr.slice(0, 1).join('').slice(0, 200));
    await vp.fill('#payload', '{"olip_version": "0.1"}');
    await vp.getByRole('button', {name: 'Validate', exact: true}).click();
    check('validator reports errors for a broken payload', ((await vp.textContent('main')) || '').includes('Not valid against casebrief.json'));
    results.validator = {consoleErrors: verr.slice(0, 3).map((e) => e.slice(0, 200))};
    await vctx.close();

    // 5. Accessibility (axe-core, WCAG 2.x A and AA rules) on key pages, light and dark.
    for (const scheme of ['light', 'dark']) {
      const actx = await browser.newContext({colorScheme: scheme}); const ap = await actx.newPage();
      for (const pg of ['/', '/try/', '/docs/paths/', '/spec/status/', '/conformance/', '/community/', '/spec/versions/', '/docs/quickstart/']) {
        await ap.goto(BASE + pg, {waitUntil: 'networkidle'});
        await ap.addScriptTag({content: axeSource});
        const r = await ap.evaluate(async () => (await window.axe.run(document, {runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']})).violations.map((v) => ({id: v.id, impact: v.impact, n: v.nodes.length})));
        results.a11y.push({page: pg, scheme, violations: r});
        check(`axe ${scheme} ${pg}`, r.length === 0, JSON.stringify(r));
      }
      await actx.close();
    }
  }

  // 6. Screenshots.
  if (SHOTS) {
    fs.mkdirSync(SHOTS, {recursive: true});
    const views = [['desktop', {width: 1280, height: 900}], ['tablet', {width: 768, height: 1024}], ['phone', {width: 360, height: 780}]];
    for (const [name, viewport] of views) {
      const c = await browser.newContext({viewport, deviceScaleFactor: 1}); const p = await c.newPage();
      for (const [pg, label] of [['/', 'home'], ['/try/', 'try'], ['/community/', 'community'], ['/spec/status/', 'status'], ['/conformance/', 'conformance'], ['/docs/paths/', 'paths']]) {
        const r = await p.goto(BASE + pg, {waitUntil: 'networkidle'});
        if (r.status() !== 200) continue;
        const f = `${label}-${name}.png`;
        await p.screenshot({path: path.join(SHOTS, f), fullPage: label === 'home'});
        results.shots.push(f);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (!ONLY_SHOTS) check(`no horizontal page scroll ${name} ${pg}`, !overflow);
      }
      await c.close();
    }
  }
} finally {
  await browser.close();
  srv.close();
}
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
for (const c of results.checks.filter((x) => !x.ok)) console.log('FAIL', c.name, c.detail);
console.log(`check-built: ${results.checks.filter((c) => c.ok).length} passed, ${results.failures.length} failed${results.pages ? `, ${results.pages} pages, ${results.links} URLs` : ''}`);
if (results.try) console.log('try:', JSON.stringify(results.try));
if (results.validator) console.log('validator:', JSON.stringify(results.validator));
process.exit(results.failures.length ? 1 : 0);
