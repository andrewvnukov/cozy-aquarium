// Playwright smoke-тест «Тёплый Аквариум».
// Запуск:  node test/smoke.mjs
// Проверяет: загрузку без ошибок консоли, тест-хуки, кормление (тап-доход),
// пассивный доход, покупку рыбки (доход+коллекция растут), апгрейды, награды,
// сейв/перезагрузку.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fail++; process.exitCode = 1; } else { console.log('ok  ', msg); pass++; } };
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

let s0 = await state();
assert(typeof s0.coins === 'number', 'render_game_to_text returns state');
assert(s0.lvl === 1 && s0.fish === 1, 'starts with 1 fish (guppy)');
assert(s0.seen === 1, 'collection seeded with starter');
assert(s0.ips >= 1, 'starter fish gives passive income');

// кормление добавляет жемчуг (тап-доход)
await page.click('#tapBtn');
let s1 = await state();
assert(s1.coins > s0.coins, 'feed (tap) increases pearls');

// тап по воде (canvas) тоже кормит
await page.mouse.click(240, 450);
let s1b = await state();
assert(s1b.coins > s1.coins, 'tap on water feeds too');

// пассивный доход через хук времени
await page.evaluate(() => window.advanceTime(10000));
let s2 = await state();
assert(s2.coins >= s1b.coins + s1b.ips * 9, 'passive income accrues over time');

// покупка новой рыбки -> растут виды, коллекция и доход
await page.evaluate(() => window.__grant(2000));
let before = await state();
let bought = await page.evaluate(() => window.__buyNextFish());
let after = await state();
assert(bought === true, 'can add a new fish when affordable');
assert(after.fish === before.fish + 1, 'fish count increases');
assert(after.lvl === before.lvl + 1, 'lvl (species) increases -> upgrade path works');
assert(after.seen === before.seen + 1, 'collection grows on new fish');
assert(after.ips > before.ips, 'new fish raises passive income');
assert(after.best >= after.fish, 'best (leaderboard) tracks species');

// апгрейд «корм» повышает тап-доход
await page.evaluate(() => window.__grant(100000));
let bF = await state();
let okF = await page.evaluate(() => window.__buyUp('feed'));
let aF = await state();
assert(okF && aF.feed === bF.feed + 1, 'feed upgrade applies');
assert(aF.tapGain > bF.tapGain, 'feed upgrade raises tap gain');

// апгрейд «аэратор» повышает пассивный доход
let bA = await state();
let okA = await page.evaluate(() => window.__buyUp('aer'));
let aA = await state();
assert(okA && aA.aer === bA.aer + 1, 'aerator upgrade applies');
assert(aA.ips > bA.ips, 'aerator upgrade raises income');

// апгрейд «водоросли» удешевляет рыбок (upCost падает)
let bP = await state();
let okP = await page.evaluate(() => window.__buyUp('plant'));
let aP = await state();
assert(okP && aP.plant === bP.plant + 1, 'plant upgrade applies');
assert(aP.upCost <= bP.upCost, 'plant upgrade lowers next fish price');

// награда ×2 удваивает доход
let bx = await state();
await page.evaluate(() => window.__grant(0));
await page.click('#x2Btn');
let ax = await state();
assert(ax.x2 === true, 'income ×2 reward activates');
assert(ax.ips >= bx.ips * 2, 'income doubled while ×2 active');

// подарок начисляет жемчуг
let bg = await state();
await page.click('#giftBtn');
let ag = await state();
assert(ag.coins > bg.coins, 'gift reward grants pearls');

// панели открываются без ошибок
await page.click('#fishBtn'); await page.waitForTimeout(120);
assert(await page.isVisible('#mBody .row'), 'fish shop renders rows');
await page.click('#mClose'); await page.waitForTimeout(80);
await page.click('#collBtn'); await page.waitForTimeout(120);
assert(await page.isVisible('#mBody .coll'), 'collection grid renders');
await page.click('#mClose');

// сейв переживает перезагрузку
let pre = await state();
await page.evaluate(() => window.__grant(0)); // форс-persist через действие
await page.click('#tapBtn');
await page.waitForTimeout(50);
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let post = await state();
assert(post.fish === pre.fish, 'fish roster survives reload');
assert(post.seen === pre.seen, 'collection survives reload');
assert(post.feed === pre.feed && post.aer === pre.aer, 'upgrades survive reload');

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
