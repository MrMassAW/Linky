// End-to-end smoke test of the Phase 1 demo milestone against the mock backend.
//   pnpm build && pnpm preview &   then   node scripts/e2e-demo.mjs
// Env: BASE_URL (default http://localhost:4173), CHROMIUM (executable path, optional),
//      SHOTS (directory for screenshots, optional).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  deviceScaleFactor: 2,
  permissions: ['geolocation', 'camera'],
  geolocation: { latitude: 45.5231, longitude: -73.5817 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror:', e.stack); });
let n = 0;
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` });
let lastStep = '';
const step = (s) => {
  lastStep = s;
  console.log(`• ${s}`);
};
const click = (name, opts = {}) => page.getByRole('button', { name, ...opts }).first().click();

// Synthetic 12 MP test photos rendered in the browser, so the test needs no fixtures.
async function makePhoto(hue) {
  const dataUrl = await page.evaluate((h) => {
    const c = document.createElement('canvas');
    c.width = 3024;
    c.height = 4032;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, `hsl(${h},70%,70%)`);
    grad.addColorStop(1, `hsl(${h + 60},50%,30%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `hsl(${(h + i * 7) % 360},60%,${30 + (i % 40)}%)`;
      g.beginPath();
      g.arc((i * 997) % c.width, (i * 1499) % c.height, 20 + (i % 90), 0, Math.PI * 2);
      g.fill();
    }
    return c.toDataURL('image/jpeg', 0.92);
  }, hue);
  return { name: `photo-${hue}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

try {
  step('welcome & sign in');
  await page.goto(`${BASE}/welcome`);
  await page.evaluate(() => indexedDB.deleteDatabase('linky-mock'));
  await page.reload();
  await shot('welcome');
  await page.getByText('I confirm I am 18 or older').click();
  await page.getByLabel('Email').fill('demo@example.com');
  await click('Continue with email');

  step('basics');
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name (optional)').fill('Tremblay');
  await page.getByLabel('Birth day').selectOption('14');
  await page.getByLabel('Birth month').selectOption('3');
  await page.getByLabel('Birth year').selectOption('1995');
  // Under-18 birthdays can't be picked at all.
  const years = await page.getByLabel('Birth year').locator('option').allTextContents();
  if (years.includes(String(new Date().getFullYear() - 17))) throw new Error('an under-18 birth year is selectable');
  if (await page.getByLabel(/Height/).count()) throw new Error('height is asked on the first step');
  await page.getByLabel('City or neighbourhood').fill('montre');
  await page.getByRole('option', { name: 'Montréal, Quebec, Canada' }).click();
  await page.getByText('Location set').waitFor();
  await shot('basics');
  await click('Continue');

  step('identity');
  await click('Non-binary', { exact: true });
  await click('they/them');
  await click('Pansexual');
  for (const s of ['Men', 'Women', 'Non-binary & gender-diverse people']) await click(s, { exact: true });
  await shot('identity');
  await click('Continue');

  step('photos (compress + on-device nudity check)');
  const photos = [await makePhoto(10), await makePhoto(140), await makePhoto(260)];
  // Tap the "+" tile like a person would; it must open the file picker.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    page.locator('label:has(input[type=file])').click(),
  ]);
  await chooser.setFiles(photos);
  await page.getByRole('img', { name: 'Photo 3' }).waitFor({ timeout: 120_000 });
  const uploadInfo = await page.getByText(/Last upload:/).textContent();
  console.log(`  ${uploadInfo}`);
  await shot('photos');
  await click('Continue');

  step('liveness (simulated in headless)');
  await shot('liveness');
  await page.getByText('Simulate a pass').click();
  await page.getByText('You’re verified').waitFor();
  await click('Continue');

  step('prompts');
  const answers = ['Croissants, a long walk, and a nap.', 'Competence and good playlists.', 'You like board games.'];
  for (let i = 0; i < 3; i++) {
    await click(`+ Choose prompt ${i + 1}`);
    await page.getByRole('dialog').getByRole('button').nth(i).click();
    await page.locator('textarea').nth(i).fill(answers[i]);
  }
  await shot('prompts');
  await click('Continue');

  step('personality quiz');
  await click(/Take the 16-type quiz/);
  for (let i = 0; i < 20; i++) await click(i % 3 === 0 ? 'Strongly agree' : i % 3 === 1 ? 'Disagree' : 'Agree', { exact: true });
  await page.getByText('Show my type on my profile').waitFor();
  await shot('personality-result');
  await click('Continue');

  step('love-language quiz');
  await click(/Start/);
  for (let i = 0; i < 25; i++) {
    await page.locator('h3 + div button').nth(i % 2).click();
  }
  await page.getByText('How I like to receive love').waitFor();
  await shot('love-result');
  await click('Continue');

  step('lifestyle');
  await page.getByLabel(/Height in cm/).fill('172');
  await click('Long-term relationship');
  await click('Sometimes');
  await shot('lifestyle');
  await click('Continue');

  step('messengers');
  await page.getByLabel('Telegram').fill('robin_demo');
  await page.getByLabel('WhatsApp').fill('+1 514 555 0199');
  await click('Continue');
  await click('Start discovering');

  step('discover space map: zoom, quick card, pass fades, open full card');
  const map = page.getByTestId('space-map');
  await map.waitFor();
  await page.locator('[data-face]').first().waitFor();
  await shot('discover-space');
  // Quick filters: one tap turns an answer into a dealbreaker, another turns it back.
  // Chips: FILTERS, distance, age, verified, 80%+, then one per lifestyle answer.
  const qf = page.getByRole('group', { name: 'Quick filters' }).locator('button').nth(5);
  const qfLabel = await qf.textContent();
  const facesBefore = await page.locator('[data-face]').count();
  await qf.click();
  await page.waitForFunction((l) => [...document.querySelectorAll('[aria-label="Quick filters"] button')].some((b) => b.getAttribute('aria-pressed') === 'true' && b.textContent.includes(l)), qfLabel);
  const facesFiltered = await page.locator('[data-face]').count();
  await shot('discover-quick-filter');
  await page.getByRole('group', { name: 'Quick filters' }).locator('button').nth(5).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-face]').length === n, facesBefore);
  console.log(`  quick filter "${qfLabel}": ${facesBefore} -> ${facesFiltered} faces, then back`);
  // The FILTERS panel: age, distance, who to show, map-only filters, must-match answers.
  await page.getByRole('button', { name: 'All filters' }).click();
  const panel = page.getByRole('dialog', { name: 'Filters' });
  await panel.getByRole('button', { name: /80%\+ matches/ }).click();
  await shot('discover-filter-panel');
  await panel.getByRole('button', { name: 'APPLY' }).click();
  await panel.waitFor({ state: 'detached' });
  const strong = await page.locator('[data-face]').count();
  for (const f of await page.locator('[data-face]').all()) {
    const pct = Number((await f.getAttribute('aria-label')).match(/(\d+)% match/)[1]);
    if (pct < 80) throw new Error(`80%+ filter let through a ${pct}% match`);
  }
  await page.getByRole('group', { name: 'Quick filters' }).getByRole('button', { name: /80%\+/ }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-face]').length === n, facesBefore);
  console.log(`  80%+ filter: ${facesBefore} -> ${strong} faces, then back`);
  const zoomBefore = await map.getAttribute('data-zoom');
  await map.hover();
  await page.mouse.wheel(0, -400);
  await page.waitForFunction((b) => {
    return document.querySelector('[data-testid=space-map]').getAttribute('data-zoom') !== b;
  }, zoomBefore);
  await click('RESET');

  // Real touch input: a two-finger pinch zooms in, a one-finger swipe pans.
  const zoomLabel = () => map.getAttribute('data-zoom');
  const cdp = await ctx.newCDPSession(page);
  const mb = await map.boundingBox();
  const mx = mb.x + mb.width / 2;
  const my = mb.y + mb.height / 2;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const fitLabel = await zoomLabel();
  await touch('touchStart', [[mx - 30, my], [mx + 30, my]]);
  for (let k = 1; k <= 8; k++) await touch('touchMove', [[mx - 30 - k * 12, my], [mx + 30 + k * 12, my]]);
  await touch('touchEnd', []);
  const pinched = await zoomLabel();
  if (parseFloat(pinched) <= parseFloat(fitLabel)) throw new Error(`pinch did not zoom in (${fitLabel} -> ${pinched})`);
  const face = page.locator('[data-face]').first();
  const before = await face.boundingBox();
  await touch('touchStart', [[mx, my + 150]]);
  for (let k = 1; k <= 6; k++) await touch('touchMove', [[mx + k * 15, my + 150]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const after = await face.boundingBox();
  if (after.x - before.x < 80) throw new Error(`swipe did not pan (${before.x} -> ${after.x})`);
  console.log(`  pinch ${fitLabel} -> ${pinched}, swipe moved ${Math.round(after.x - before.x)}px`);
  await click('RESET');
  // A long swipe is clamped: you (the center) stay on screen.
  await touch('touchStart', [[mb.x + 20, my + 150]]);
  for (let k = 1; k <= 20; k++) await page.waitForTimeout(16).then(() => touch('touchMove', [[mb.x + 20 + k * 60, my + 150]]));
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  const you = await map.getByText('YOU', { exact: true }).boundingBox();
  if (you.x < mb.x || you.x + you.width > mb.x + mb.width) throw new Error(`panned too far: YOU at x=${you.x}`);
  // Right after a pan, a real tap on a filter chip still works, and RESET clears it again.
  const strongChip = page.getByRole('group', { name: 'Quick filters' }).getByRole('button', { name: /80%\+/ });
  const sb = await strongChip.boundingBox();
  await touch('touchStart', [[sb.x + sb.width / 2, sb.y + sb.height / 2]]);
  await touch('touchEnd', []);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[aria-label="Quick filters"] button')].some((b) => b.textContent.includes('80%') && b.getAttribute('aria-pressed') === 'true'),
  );
  await click('RESET');
  await page.waitForFunction((n) => document.querySelectorAll('[data-face]').length === n, facesBefore);
  if ((await strongChip.getAttribute('aria-pressed')) !== 'false') throw new Error('RESET did not clear the 80%+ filter');
  // Stars are shared things: tapping one highlights who shares it.
  const hub = page.locator('[data-hub]').first();
  console.log(`  stars: ${(await page.locator('[data-hub]').allTextContents()).join(' | ')}`);
  const hub2 = page.locator('[data-hub]').nth(1);
  await hub.dispatchEvent('click');
  await hub2.dispatchEvent('click');
  if ((await hub.getAttribute('aria-pressed')) !== 'true' || (await hub2.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('stars did not multi-select');
  }
  console.log(`  ${await map.getByText(/share all of these/).textContent()}`);
  await shot('discover-star');
  await hub.dispatchEvent('click');
  await hub2.dispatchEvent('click');
  const openFirst = async () => {
    await page.locator('[data-face]:not([aria-label$="passed"])').first().dispatchEvent('click');
    await page.locator('section[aria-label$="quick look"]').waitFor();
  };
  await openFirst();
  await page.locator('ul[aria-label="What connects you"]').waitFor();
  await shot('quick-card');
  await page.getByRole('button', { name: /^Pass on / }).click();
  await page.locator('[data-face][aria-label$="passed"]').first().waitFor();
  await openFirst();
  await page.getByRole('button', { name: /^Open .*'s profile/ }).click();
  await page.getByText('compatible').first().waitFor();
  const firstScore = await page.locator('text=/^\\d+%$/').first().textContent();
  console.log(`  first profile compatibility: ${firstScore}`);
  await shot('discover');

  step('like a prompt with a comment until matched');
  let matched = false;
  for (let i = 0; i < 10 && !matched; i++) {
    if (i > 0) {
      await openFirst();
      await page.getByRole('button', { name: /^Open .*'s profile/ }).click();
    }
    await page.getByRole('button', { name: /Like .*'s prompt/ }).first().click();
    await page.getByLabel('Comment').fill('This made me smile!');
    if (i === 0) await shot('like-sheet');
    await click('Send like');
    matched = await page
      .getByText('It’s a match!')
      .waitFor({ timeout: 1500 })
      .then(() => true, () => false);
  }
  if (!matched) throw new Error('no match after 10 likes');
  await shot('match');
  await click('Send a note');

  step('async note + bot reply');
  await page.getByLabel('Note').fill('Hi! Your prompt about Sundays sold me.');
  await click('Send note');
  await page.locator('text=/Hi! Your prompt/').waitFor();
  // the demo bot replies a few seconds later; the page refreshes notes on an interval
  await page.locator('.whitespace-pre-wrap').nth(1).waitFor({ timeout: 20_000 });

  step('mutual Connect reveals handles + deep links');
  await click('🔗 Connect');
  await page.getByText('You’re connected').waitFor({ timeout: 10_000 });
  const links = await page.locator('a[href^="https://wa.me"], a[href^="https://t.me"]').count();
  if (links === 0) throw new Error('no WhatsApp/Telegram deep link');
  await shot('connected');

  step('likes you');
  await page.goto(`${BASE}/likes`);
  await page.getByText(/Liked your/).first().waitFor();
  await shot('likes-you');

  step('filters + opt-in kink section');
  await page.goto(`${BASE}/me/filters`);
  await page.getByRole('switch').first().click(); // opt in
  await click('curious');
  await click('Save kink preferences');
  await page.getByText('Saved ✓').waitFor();
  await shot('filters');

  step('report + block from discover');
  await page.goto(`${BASE}/discover`);
  await openFirst();
  await page.getByRole('button', { name: /^Open .*'s profile/ }).click();
  await page.getByText(/Report or block/).click();
  await page.getByText('Spam or scam').click();
  await click('Send report');
  await page.getByText('Our moderators will review').waitFor();
  await click('Close');

  step('admin queue');
  await page.goto(`${BASE}/me/settings`);
  await page.getByRole('switch', { name: /Admin mode/ }).click();
  await page.getByRole('link', { name: 'Open admin report queue' }).click(); // appears once admin mode is saved
  await page.getByText('reported by Robin').waitFor();
  await shot('admin');

  step('profile preview');
  await page.goto(`${BASE}/me`);
  await page.getByText('How others see you').waitFor();
  await shot('my-profile');

  step('pick a known type and known love languages');
  await page.goto(`${BASE}/me/quiz/personality`);
  await click('Retake');
  await click('I already know my type');
  await shot('known-type');
  await page.getByRole('button', { name: /INFJ\s*The Confidant/ }).click();
  await page.getByText('INFJ').first().waitFor();
  await page.goto(`${BASE}/me/quiz/love`);
  await click('Retake');
  await click('I already know my love languages');
  await click(/Quality Time/);
  await click(/Physical Touch/);
  await shot('known-love');
  await click('Save');
  await page.getByText('How I like to receive love').waitFor();

  step('reset demo (in-page confirmation)');
  await page.goto(`${BASE}/me/settings`);
  await click('Reset demo');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click();
  await page.getByText('I confirm I am 18 or older').waitFor();

  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('\nE2E demo flow passed ✔');
} catch (e) {
  await shot('failure');
  const detail = `${e.message.split('\n')[0]}${errors.length ? ` | page errors: ${errors.join(' | ')}` : ''}`;
  console.error('\nE2E failed:', e.message, errors.length ? `\npage errors: ${errors.join(' | ')}` : '');
  // GitHub annotation so the failure is visible without opening the raw log
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=E2E demo flow (step: ${lastStep})::${detail}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
