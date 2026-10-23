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
  deviceScaleFactor: 2,
  permissions: ['geolocation', 'camera'],
  geolocation: { latitude: 45.5231, longitude: -73.5817 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` });
const step = (s) => console.log(`• ${s}`);
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
  await page.getByLabel('Birthday').fill('1995-03-14');
  await page.getByLabel('City or neighbourhood').fill('Montréal · Plateau');
  await click(/approximate location/);
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
  await page.locator('input[type=file]').setInputFiles(photos);
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
  await click('Long-term relationship');
  await click('Sometimes');
  await shot('lifestyle');
  await click('Continue');

  step('messengers');
  await page.getByLabel('Telegram').fill('robin_demo');
  await page.getByLabel('WhatsApp').fill('+1 514 555 0199');
  await click('Continue');
  await click('Start discovering');

  step('discover feed with compatibility');
  await page.getByText('compatible').first().waitFor();
  const firstScore = await page.locator('text=/^\\d+%$/').first().textContent();
  console.log(`  first profile compatibility: ${firstScore}`);
  await shot('discover');

  step('like a prompt with a comment until matched');
  let matched = false;
  for (let i = 0; i < 10 && !matched; i++) {
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
  await page.waitForTimeout(6000);
  const noteCount = await page.locator('.whitespace-pre-wrap').count();
  if (noteCount < 2) throw new Error('bot did not reply');

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
  await page.getByText(/Report or block/).click();
  await page.getByText('Spam or scam').click();
  await click('Send report');
  await page.getByText('Our moderators will review').waitFor();
  await click('Close');

  step('admin queue');
  await page.goto(`${BASE}/me/settings`);
  await page.getByRole('switch', { name: /Admin mode/ }).click();
  await page.goto(`${BASE}/admin`);
  await page.getByText('reported by Robin').waitFor();
  await shot('admin');

  step('profile preview');
  await page.goto(`${BASE}/me`);
  await page.getByText('How others see you').waitFor();
  await shot('my-profile');

  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('\nE2E demo flow passed ✔');
} catch (e) {
  await shot('failure');
  console.error('\nE2E failed:', e.message, errors.length ? `\npage errors: ${errors.join(' | ')}` : '');
  process.exitCode = 1;
} finally {
  await browser.close();
}
