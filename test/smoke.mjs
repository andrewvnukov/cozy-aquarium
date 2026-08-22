// Playwright smoke-тест «Тёплый Аквариум».
// Запуск:  node test/smoke.mjs
// Проверяет: загрузку без ошибок, тап по рыбке (и что вода дохода не даёт),
// покупку малька, рост, слияние двух одинаковых рыб, кормление и сытость ×2,
// мульти-тап, апгрейды, обучение, сейв/перезагрузку.
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
const fishPos = async (i = 0) => page.evaluate(n => ({ x: Math.round(swimmers[n].x), y: Math.round(swimmers[n].y) }), i);

let s0 = await state();
assert(typeof s0.coins === 'number', 'render_game_to_text returns state');
assert(s0.fish === 1 && s0.tank[0].lvl === 0, 'starts with one level-1 fish');
assert(s0.tank[0].g === 1, 'starter fish is already grown');
assert(s0.tut === 0, 'tutorial starts at step 1 on a fresh save');
assert(s0.ips > 0, 'grown fish gives (slow) passive income');

assert(s0.levels === 30, 'roster has 30 species');
const behs = await page.evaluate(() => [...new Set(LEVELS.map(l => l.beh))]);
assert(behs.length >= 6, 'species have several distinct behaviours: ' + behs.join(','));

// тап по рыбке приносит жемчуг
let p = await fishPos();
await page.mouse.click(p.x, p.y);
let s1 = await state();
assert(s1.coins > s0.coins, 'tapping a fish gives pearls');

// тап по воде дохода не даёт (пассив может капнуть, поэтому сравниваем с тап-доходом)
const emptyWater = async () => page.evaluate(() => {
  for (let y = 300; y < sandY - 40; y += 20) for (let x = 20; x < W * 0.9; x += 20)
    if (!swimmers.some(s => Math.hypot(s.x - x, s.y - y) < 90)) return { x: Math.round(x), y: Math.round(y) };
  return { x: 20, y: 300 };
});
let w = await emptyWater();
let cw0 = (await state()).coins;
await page.mouse.click(w.x, w.y);
let cw1 = (await state()).coins;
assert(cw1 - cw0 < s1.tapGain, 'tapping empty water gives no pearls');

// обучение: 3 тапа по рыбке -> шаг 2
p = await fishPos();
await page.mouse.click(p.x, p.y);
p = await fishPos();
await page.mouse.click(p.x, p.y);
assert((await state()).tut === 1, 'tutorial advances after 3 fish taps');

// покупка малька: платно, малёк начинает расти, обучение -> шаг 3
await page.evaluate(() => window.__grant(1000));
let bb = await state();
assert(await page.evaluate(() => window.__buyFish()), 'can buy a fry when affordable');
let ab = await state();
assert(ab.coins === bb.coins - bb.fishCost, 'buying a fry costs pearls');
assert(ab.fish === bb.fish + 1, 'fry joins the tank');
assert(ab.tank.some(f => f.g < 1), 'new fry starts small and grows');
assert(ab.fishCost > bb.fishCost, 'each fry costs more than the last');
assert(ab.tut === 2, 'tutorial advances after buying a fry');

// малёк вырастает примерно за 5 секунд (уровень 1)
await page.waitForTimeout(5600);
let ag = await state();
assert(ag.grownCount === 2, 'a level-1 fry grows up in ~5 seconds');

// слияние двух выросших рыб одного уровня -> одна рыба следующего уровня
let bm = await state();
assert(await page.evaluate(() => window.__mergeFirstPair()), 'two grown fish of the same level can merge');
let am = await state();
assert(am.fish === bm.fish - 1, 'merging replaces two fish with one');
assert(am.tank.some(f => f.lvl === 1), 'merge produces the next level');
assert(am.lvl === 2, 'max level grows after a merge');
assert(am.seen === 2, 'new level is unlocked in the shop');
assert(am.tut === 3, 'tutorial completes after the first merge');

// растущего малька слить нельзя
await page.evaluate(() => { window.__grant(100000); window.__buyFish(); window.__buyFish(); });
assert(await page.evaluate(() => window.__mergeFirstPair()) === false, 'fry that is still growing cannot merge');
await page.evaluate(() => window.__growAll());
assert(await page.evaluate(() => window.__mergeFirstPair()) === true, 'the same pair merges once grown');

// кормление: платное, сытость растёт постепенно
await page.evaluate(() => { window.__grant(100000); window.__sate(0); });
let bf = await state();
await page.evaluate(() => window.__feed());
let af = await state();
assert(af.coins === bf.coins - bf.foodCost, 'feeding costs pearls');
await page.waitForTimeout(6000);
let mid = await state();
assert(mid.tank.some(f => f.sat > 0), 'fish start eating the food');
assert(mid.tank.every(f => f.sat < 0.75), 'one portion is far from filling a fish up');

// полная сытость даёт ×2 за тап
await page.evaluate(() => { window.__growAll(); window.__sate(0); });
let hungry = await state();
await page.evaluate(() => window.__sate(1));
let sated = await state();
assert(sated.tapGain === hungry.tapGain * 2, 'fully fed fish pays x2 per tap');

// сытость ускоряет рост малька
const growth = await page.evaluate(async () => {
  const mk = sat => { const f = { lvl: 0, g: 0, sat }; S.tank.push(f); spawnSwimmer(f); return f; };
  const hungryF = mk(0), fedF = mk(1);
  await new Promise(r => setTimeout(r, 1500));
  const res = { hungry: hungryF.g, fed: fedF.g };
  [hungryF, fedF].forEach(f => {
    S.tank.splice(S.tank.indexOf(f), 1);
    const i = swimmers.findIndex(s => s.f === f); if (i >= 0) swimmers.splice(i, 1);
  });
  return res;
});
assert(growth.fed > growth.hungry, 'well-fed fry grows faster');

// пассивный доход капает
let sp0 = await state();
await page.evaluate(() => window.advanceTime(60000));
assert((await state()).coins > sp0.coins, 'passive income accrues over time');

// мульти-тап: после награды тап по воде собирает со всех рыбок
let bmt = await state();
await page.click('#multiBtn');
await page.waitForTimeout(150);
let amt = await state();
assert(amt.multi === true, 'multi-tap reward activates');
w = await emptyWater();
await page.mouse.click(w.x, w.y);
let water = await state();
assert(water.coins >= amt.coins + amt.tapGain, 'during multi-tap even water taps collect from every fish');

// награда ×2 теперь приходит от краба с табличкой, кнопки внизу нет
assert(await page.evaluate(() => !document.getElementById('x2Btn')), 'the income ×2 button is gone');
assert(await page.evaluate(() => document.querySelectorAll('.bottom .abtn').length) === 3, 'bottom row has three buttons');
let bx = await state();
const crab = await page.evaluate(() => window.__crabSign());
assert(await page.evaluate(() => window.__crabHasSign()), 'crab can bring an income ×2 sign');
await page.mouse.click(crab.x + 200 < 460 ? crab.x + 200 : crab.x - 200, crab.y);
assert((await state()).x2 === false, 'tapping away from the crab does not grant ×2');
await page.mouse.click(crab.x, crab.y);
await page.waitForTimeout(150);
let ax = await state();
assert(ax.x2 === true, 'tapping the crab with the sign activates income ×2');
assert(!(await page.evaluate(() => window.__crabHasSign())), 'the sign is taken away after use');
assert(ax.ips >= bx.ips * 2 - 1e-9, 'income doubled while ×2 active');

// апгрейды
await page.evaluate(() => window.__grant(1e7));
let bF = await state();
assert(await page.evaluate(() => window.__buyUp('feed')), 'feed upgrade applies');
let aF = await state();
assert(aF.feedFill > bF.feedFill, 'feed upgrade makes food more filling');
let bA = await state();
assert(await page.evaluate(() => window.__buyUp('aer')), 'aerator upgrade applies');
assert((await state()).ips > bA.ips, 'aerator upgrade raises income');
let bP = await state();
assert(await page.evaluate(() => window.__buyUp('plant')), 'plant upgrade applies');
assert((await state()).fishCost < bP.fishCost, 'plant upgrade lowers fry price');

// панели открываются без ошибок
await page.click('#fishBtn'); await page.waitForTimeout(120);
assert(await page.isVisible('#mBody .row'), 'aquarium panel renders fish rows');
await page.click('#mClose'); await page.waitForTimeout(80);
await page.click('#setBtn'); await page.waitForTimeout(150);
assert(await page.isVisible('#settings .srow'), 'settings panel renders');
await page.evaluate(() => { const e = document.getElementById('musVol'); e.value = 15; e.dispatchEvent(new Event('input')); });
assert(Math.round((await state()).musVol * 100) === 15, 'music volume slider changes the setting');
await page.click('#langEn'); await page.waitForTimeout(120);
assert(await page.evaluate(() => document.documentElement.lang) === 'en', 'language switch in settings works');
await page.click('#langRu'); await page.waitForTimeout(120);
await page.click('#sClose'); await page.waitForTimeout(100);

// сейв переживает перезагрузку
let pre = await state();
await page.evaluate(() => window.__grant(0));
p = await fishPos();
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(60);
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
let post = await state();
assert(post.fish === pre.fish, 'tank survives reload');
assert(post.lvl === pre.lvl, 'fish levels survive reload');
assert(post.seen === pre.seen, 'unlocked species survive reload');
assert(Math.abs(post.musVol - pre.musVol) < 1e-6, 'volume settings survive reload');
assert(post.feed === pre.feed && post.aer === pre.aer, 'upgrades survive reload');

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
