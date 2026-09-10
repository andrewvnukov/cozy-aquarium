// Playwright smoke-тест «Тёплый Аквариум».
// Запуск:  node test/smoke.mjs
// Настоящий SDK доступен только на площадке, поэтому подменяем его моком ДО
// загрузки скриптов игры (addInitScript) и считаем вызовы.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fail++; process.exitCode = 1; }
  else { console.log('ok  ', msg); pass++; } };

// В окружении может лежать заранее скачанный Chromium другой сборки.
const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch(launchOpts);

// ── мок Yandex SDK ───────────────────────────────────────────────────────────
const SDK_MOCK = () => {
  // Страница открыта не в iframe, поэтому каркас выставляет __noSDK=true.
  // Гасим это, чтобы прогнать именно ветку с SDK.
  Object.defineProperty(window, '__noSDK', { get: () => false, set: () => {}, configurable: true });
  window.__calls = { rewarded: 0, fullscreen: 0, ready: 0, langRead: 0, setData: [], score: [],
                     shortcut: 0, review: 0, readyHudVisible: null, mutedDuringAd: null };
  window.__rewardedMode = 'ok';        // 'ok' | 'doubleError' | 'errorOnly'
  window.YaGames = { init: () => Promise.resolve({
    environment: { i18n: { get lang(){ window.__calls.langRead++; return 'ru'; } } },
    getPlayer: () => Promise.resolve({
      isAuthorized: () => true,
      getData: () => Promise.resolve(window.__saveBlob || {}),
      setData: (d, flush) => { window.__calls.setData.push({ flush: !!flush }); return Promise.resolve(); },
    }),
    features: { LoadingAPI: { ready: () => {
      window.__calls.ready++;
      // Замер ВНУТРИ вызова: наблюдатель за DOM подключается позже и врёт.
      window.__calls.readyHudVisible = document.body.classList.contains('ready');
    } } },
    adv: {
      showRewardedVideo: ({ callbacks }) => {
        window.__calls.rewarded++;
        callbacks.onOpen && callbacks.onOpen();
        window.__calls.mutedDuringAd = typeof window.audioMuted === 'function' ? window.audioMuted() : null;
        if (window.__rewardedMode !== 'errorOnly') callbacks.onRewarded && callbacks.onRewarded();
        // onError МОЖЕТ прийти после onRewarded — награда обязана остаться одной
        if (window.__rewardedMode === 'doubleError') callbacks.onError && callbacks.onError();
        callbacks.onClose && callbacks.onClose();
      },
      showFullscreenAdv: ({ callbacks }) => {
        window.__calls.fullscreen++;
        callbacks.onOpen && callbacks.onOpen();
        callbacks.onClose && callbacks.onClose(true);
      },
    },
    leaderboards: { setScore: (n, v) => { window.__calls.score.push([n, v]); return Promise.resolve(); } },
    shortcut: { canShowPrompt: () => Promise.resolve({ canShow: true }),
                showPrompt: () => { window.__calls.shortcut++; return Promise.resolve({ outcome: 'accepted' }); } },
    feedback: { canReview: () => Promise.resolve({ value: true }),
                requestReview: () => { window.__calls.review++; return Promise.resolve({ feedbackSent: true }); } },
  })};
};

const errors = [];
async function open({ save = null, mock = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(from)) return;   // офлайн-песочница, не игра
    errors.push(m.text() + ' @ ' + from);
  });
  page.on('pageerror', e => errors.push(String(e)));
  if (mock) await page.addInitScript(SDK_MOCK);
  if (save !== null) await page.addInitScript(raw => {
    // только если ключа ещё нет: initScript выполняется и при reload,
    // иначе он затрёт то, что игра успела сохранить
    try { if (!localStorage.getItem('cozy_aquarium_v1')) localStorage.setItem('cozy_aquarium_v1', raw); } catch (e) {}
  }, save);
  await page.goto(url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
  page.state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  page.calls = async () => page.evaluate(() => window.__calls);
  return page;
}
const day = off => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

// ── 1. базовая петля ─────────────────────────────────────────────────────────
{
  const page = await open();
  let s0 = await page.state();
  assert(typeof s0.coins === 'number', 'render_game_to_text returns state');
  assert(s0.lvl === 1 && s0.fish === 1, 'starts with 1 fish (guppy)');
  assert(s0.seen === 1, 'collection seeded with starter');
  assert(s0.ips >= 1, 'starter fish gives passive income');

  await page.click('#tapBtn');
  let s1 = await page.state();
  assert(s1.coins > s0.coins, 'feed (tap) increases pearls');

  await page.mouse.click(240, 450);
  let s1b = await page.state();
  assert(s1b.coins > s1.coins, 'tap on water feeds too');

  await page.evaluate(() => window.advanceTime(10000));
  let s2 = await page.state();
  assert(s2.coins > s1b.coins, 'passive income accrues over time');

  await page.evaluate(() => window.__grant(100000));
  const bought = await page.evaluate(() => window.__buyNextFish());
  let s3 = await page.state();
  assert(bought && s3.fish === 2 && s3.seen === 2, 'buying a fish grows tank and collection');
  assert(s3.ips > s2.ips, 'new fish raises income');

  await page.evaluate(() => window.__buyUp('aer'));
  let s4 = await page.state();
  assert(s4.aer === 1 && s4.ips > s3.ips, 'aerator upgrade raises income');
  await page.close();
}

// ── 2. GameReady, i18n, лидерборд, реклама сама не стартует ─────────────────
{
  const page = await open();
  const c = await page.calls();
  assert(c.ready === 1, 'GameReady sent exactly once');
  assert(c.readyHudVisible === false, 'GameReady sent BEFORE the UI became available');
  assert(c.langRead > 0, 'platform i18n lang is actually read on boot');
  assert(c.fullscreen === 0, 'interstitial does not start on its own');
  assert(c.score.length === 1 && c.score[0][0] === 'species', 'leaderboard written via setScore');
  const stored = await page.evaluate(() => localStorage.getItem('lang'));
  assert(stored === null, 'auto-detected language is not persisted');
  await page.close();
}

// ── 3. rewarded: награда ровно один раз + звук заглушён ─────────────────────
{
  const page = await open();
  await page.evaluate(() => { window.__rewardedMode = 'doubleError'; });
  const before = await page.state();
  const expect = await page.evaluate(() => window.__giftAmt());
  await page.click('#giftBtn');
  const after = await page.state();
  const c = await page.calls();
  assert(c.rewarded === 1, 'gift shows exactly one rewarded video');
  assert(after.coins - before.coins === expect, 'reward paid exactly once despite onError after onRewarded');
  assert(c.mutedDuringAd === true, 'game audio is muted while the ad is open');
  assert(await page.evaluate(() => window.audioMuted()) === false, 'audio restored after the ad');
  assert(after.lifetime === before.lifetime, 'gifts do NOT move the progress metric (lifetime)');
  assert(after.giftLeft > 0, 'gift goes on cooldown');

  const c2before = (await page.calls()).rewarded;
  await page.click('#giftBtn');
  assert((await page.calls()).rewarded === c2before, 'gift on cooldown does not show another ad');

  const b2 = await page.state();
  await page.click('#x2Btn');
  const a2 = await page.state();
  assert(a2.x2 === true && a2.ips === b2.ips * 2, 'x2 doubles income');
  await page.close();
}

// ── 4. офлайн-доход: пропорционален времени и упирается в потолок ───────────
{
  const page = await open();
  const rate = await page.evaluate(() => window.__ipsCalm());
  const g1 = JSON.parse(await page.evaluate(() => window.__offline(3600)));
  const g2 = JSON.parse(await page.evaluate(() => window.__offline(7200)));
  assert(Math.abs(g2.amount - g1.amount * 2) <= 2, 'offline gain is proportional to time (no silent truncation)');
  assert(Math.abs(g1.amount - rate * 0.5 * 3600) <= 2, 'offline gain matches rate x mult x time');
  const g3 = JSON.parse(await page.evaluate(() => window.__offline(100 * 3600)));
  assert(g3.capped === true && g3.sec === 8 * 3600, 'offline is capped at 8h and the cap is reported');
  const s = await page.state();
  assert(s.lifetime > 0, 'offline production counts as real income (earn, not grant)');
  await page.close();
}

// ── 5. окно возвращения показывается только после долгой отлучки ────────────
{
  const short = JSON.stringify({ v: 2, coins: 500, lifetime: 500, fish: ['guppy', 'gold'],
    seen: ['guppy', 'gold'], dailyDay: day(0), time: Date.now() - 5 * 60 * 1000 });
  let page = await open({ save: short });
  assert((await page.state()).modal === null, 'short absence shows no return window');
  await page.close();

  const long = JSON.stringify({ v: 2, coins: 500, lifetime: 500, fish: ['guppy', 'gold'],
    seen: ['guppy', 'gold'], dailyDay: day(0), time: Date.now() - 6 * 3600 * 1000 });
  page = await open({ save: long });
  assert((await page.state()).modal === 'offline', 'long absence shows the return window');
  const before = await page.state();
  await page.click('#mAct .mbtn.main');           // «Забрать x2» за ролик
  const after = await page.state();
  assert((await page.calls()).rewarded === 1, 'return window x2 button plays a rewarded video');
  assert(after.coins > before.coins, 'x2 in the return window pays out');
  assert(after.modal === null, 'return window closes after collecting');
  await page.close();
}

// ── 6. ежедневная серия ─────────────────────────────────────────────────────
{
  const save = JSON.stringify({ v: 2, coins: 1000, lifetime: 1000, fish: ['guppy', 'gold'],
    seen: ['guppy', 'gold'], dailyDay: day(-1), streak: 3, time: Date.now() });
  const page = await open({ save });
  assert((await page.state()).modal === 'daily', 'daily window shows when a day is pending');
  const b = await page.state();
  await page.evaluate(() => window.__claimDaily(false));
  const a = await page.state();
  assert(a.streak === 4, 'streak grows when yesterday was claimed');
  assert(a.dailyDay === day(0), 'claim is recorded for today');
  assert(a.coins > b.coins, 'daily pays out');
  assert(a.lifetime === b.lifetime, 'daily gift does NOT move the progress metric');
  assert(await page.evaluate(() => window.__dailyPending()) === false, 'one claim per day');
  const c = await page.state();
  await page.evaluate(() => window.__claimDaily(false));
  assert((await page.state()).coins === c.coins, 'second claim on the same day pays nothing');
  await page.close();

  const skipped = JSON.stringify({ v: 2, coins: 1000, lifetime: 1000, fish: ['guppy', 'gold'],
    seen: ['guppy', 'gold'], dailyDay: day(-3), streak: 5, time: Date.now() });
  const p2 = await open({ save: skipped });
  await p2.evaluate(() => window.__claimDaily(false));
  assert((await p2.state()).streak === 1, 'a skipped day resets the streak');
  await p2.close();

  const fresh = await open();
  assert((await fresh.state()).modal !== 'daily', 'brand-new player is not shown the daily window');
  await fresh.close();
}

// ── 7. престиж ──────────────────────────────────────────────────────────────
{
  const save = JSON.stringify({ v: 2, coins: 0, lifetime: 20000000, coralsGiven: 0,
    fish: ['guppy', 'gold', 'neon', 'clown', 'molly'], seen: ['guppy', 'gold', 'neon', 'clown', 'molly'],
    aer: 3, dailyDay: day(0), time: Date.now() });
  const page = await open({ save });
  const b = await page.state();
  assert(b.pending >= 1, 'prestige currency is owed for lifetime earnings');
  const ok = await page.evaluate(() => window.__prestige());
  const a = await page.state();
  assert(ok && a.corals === b.pending, 'prestige grants the pending corals');
  assert(a.fish === 1 && a.coins === 0 && a.aer === 0, 'prestige resets fish, pearls and upgrades');
  assert(a.seen === 5, 'collection survives prestige');
  assert(a.lifetime === b.lifetime, 'lifetime is NOT reset (otherwise corals are paid twice)');
  assert(a.pending === 0, 'prestige cannot be repeated immediately');
  await page.waitForFunction(() => window.__calls.review >= 1, { timeout: 3000 }).catch(() => {});
  assert((await page.calls()).review >= 1, 'first prestige asks for a store review');
  assert(await page.evaluate(() => window.__ipsCalm()) > 1, 'corals give a permanent income multiplier');
  await page.close();
}

// ── 8. миграция старого сейва: кораллы за прошлое не выдаются ───────────────
{
  const old = JSON.stringify({ v: 1, coins: 900000, fish: ['guppy', 'gold', 'neon', 'clown', 'molly'],
    seen: ['guppy', 'gold', 'neon', 'clown', 'molly'], feed: 2, aer: 4, plant: 1,
    best: 5, x2Until: 0, lastGift: 0, lastDaily: '2024-01-01', time: Date.now() });
  const page = await open({ save: old });
  const s = await page.state();
  assert(s.fish === 5 && s.coins === 900000, 'old save loads with its progress');
  assert(s.lifetime > 0, 'lifetime is reconstructed for old saves');
  assert(s.pending === 0, 'no free premium currency for pre-update players');
  assert(s.corals === 0, 'old save starts with zero corals');
  await page.close();
}

// ── 9. повреждённый и чужой сейв ────────────────────────────────────────────
{
  for (const [raw, name] of [
    ['{{{not json', 'garbage instead of JSON'],
    ['{}', 'empty object'],
    [JSON.stringify({ coins: null, fish: null, seen: null, feed: 'x', tips: 5 }), 'nulls in required fields'],
  ]) {
    const page = await open({ save: raw });
    const s = await page.state();
    assert(s.lvl >= 1 && s.coins >= 0, 'game boots on ' + name);
    await page.close();
  }
  // индекс вида из будущей версии — это «ничего», а не «самая дорогая рыбка»
  const alien = JSON.stringify({ v: 2, coins: 0, lifetime: 0, fish: ['guppy', 'zzz_from_future'],
    seen: ['guppy', 'zzz_from_future'], time: Date.now() });
  const page = await open({ save: alien });
  const s = await page.state();
  assert(s.fish === 1 && s.ips === 1, 'unknown species id is dropped, not clamped to the most expensive');
  await page.close();
}

// ── 10. подсказки ───────────────────────────────────────────────────────────
{
  const save = JSON.stringify({ v: 2, coins: 100, lifetime: 100, fish: ['guppy', 'gold'],
    seen: ['guppy', 'gold'], dailyDay: day(0), time: Date.now() });
  const page = await open({ save });
  await page.evaluate(() => window.__openModal('fish'));
  assert(await page.evaluate(() => window.__tipTick()) === null, 'no tip appears over an open sheet');
  await page.evaluate(() => window.__closeModal());
  const id = await page.evaluate(() => window.__tipTick());
  assert(id !== null, 'a tip appears once its condition holds');
  assert(await page.evaluate(() => document.querySelectorAll('.tipTarget').length) === 1,
    'the tip highlights exactly one target element');
  const box = await page.evaluate(() => { const r = document.getElementById('tip').getBoundingClientRect();
    return { l: r.left, r: r.right, w: r.width }; });
  assert(box.l >= 0 && box.r <= 480 && box.w > 180, 'tip bubble stays on screen and does not collapse');
  await page.mouse.click(240, 700);
  assert((await page.state()).tip === null, 'any tap dismisses the tip');
  const tips = (await page.state()).tips;
  assert(tips.includes(id), 'the tip is marked as shown in the save');
  await page.reload();
  await page.waitForFunction(() => typeof window.__tipTick === 'function');
  assert(await page.evaluate(() => window.__tipTick()) !== id, 'a shown tip does not come back after reload');
  await page.close();
}

// ── 11. сейв: дожим при уходе со страницы ───────────────────────────────────
{
  const page = await open();
  await page.evaluate(() => { window.__calls.setData.length = 0; });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
                              document.dispatchEvent(new Event('visibilitychange')); });
  const c = await page.calls();
  assert(c.setData.some(x => x.flush === true), 'save is flushed when the page goes away');
  await page.close();
}

// ── 12. сохранение и перезагрузка ───────────────────────────────────────────
{
  const page = await open();
  await page.evaluate(() => { window.__grant(50000); window.__buyNextFish(); });
  const before = await page.state();
  await page.reload();
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  const after = await page.state();
  assert(after.fish === before.fish && after.seen === before.seen, 'progress survives a reload');
  await page.close();
}

assert(errors.length === 0, 'no console/page errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
