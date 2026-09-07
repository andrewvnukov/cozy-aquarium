// Headless-генерация магазинных ассетов (без внешних image-API).
// Делает: скриншоты геймплея с реального билда + обложки RU/EN + иконку из card.html.
// Запуск из папки игры:  node test/make-assets.mjs
// Правь CONFIG под конкретную игру (title/heroSvg/палитра/кадры).
// heroSvg — ВЕКТОРНАЯ SVG-разметка героя обложки (viewBox 0 0 100 100), НЕ эмодзи.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'store-assets');
mkdirSync(out, { recursive: true });
const gameUrl = 'file://' + resolve(root, 'index.html');
const cardUrl = 'file://' + resolve(root, 'store', 'card.html');

// ---- CONFIG (заполняет недельный прогон) ----
const HERO = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
  + '<g stroke="#233A4E" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">'
  + '<path d="M34 50 L10 32 Q22 50 10 68 Z" fill="#FF8C42"/>'                       // хвост
  + '<path d="M52 30 Q62 15 72 27 Q64 35 57 39 Z" fill="#FFC38A"/>'                 // спинной плавник
  + '<ellipse cx="56" cy="51" rx="31" ry="23" fill="#FF9E5A"/>'                     // тело
  + '<path d="M52 54 Q62 70 45 72 Q42 62 49 55 Z" fill="#FFC38A"/>'                 // грудной плавник
  + '<circle cx="73" cy="45" r="6.5" fill="#FFFFFF"/>'                              // глаз
  + '</g>'
  + '<circle cx="74.5" cy="45" r="3.2" fill="#233A4E"/>'                            // зрачок
  + '<path d="M84 52 q3 2.5 0 5" fill="none" stroke="#233A4E" stroke-width="3.4" stroke-linecap="round"/>' // ротик
  + '<circle cx="90" cy="34" r="3.5" fill="#EAF6FF" stroke="#233A4E" stroke-width="2"/>'   // пузырьки
  + '<circle cx="84" cy="24" r="2.3" fill="#EAF6FF" stroke="#233A4E" stroke-width="1.8"/>'
  + '</svg>';
const CONFIG = {
  titleRu: 'Тёплый Аквариум', titleEn: 'Cozy Aquarium',
  subRu: '30 видов · расти · объединяй', subEn: '30 species · grow · merge',
  heroSvg: HERO,
  accent: '#FF9E5A', bg: '#2C7FA6', ink: '#233A4E',
  // характерные экраны: [имя файла, скрипт подготовки состояния через хуки]
  shots: [
    // d1 — начало: обучение и тап по стартовой рыбке
    ['d1-start',      async p => { await p.evaluate(()=>{ const s=swimmers[0]; if(s) tapFish(s); refreshHud(); });
                                   await p.waitForTimeout(250); }],
    // краб с табличкой «Доход ×2» — вход в rewarded вместо кнопки
    ['d7-crab',       async p => { await p.evaluate(()=>{ window.__skipTut(); window.__grant(5e5);
                                     for(let i=0;i<3;i++) window.__buyFish(0); window.__growAll(); window.__crabSign(); });
                                   await p.waitForTimeout(1200); }],
    // d2 — сытый аквариум: золотые шкалы, ×2 и двойные награды
    ['d2-feeding',    async p => { await p.evaluate(()=>{ window.__skipTut(); window.__grant(2e6);
                                     for(let i=0;i<5;i++) window.__buyFish(0); window.__growAll(); });
                                   await p.waitForTimeout(4000);
                                   await p.evaluate(()=>{ window.__sate(1); window.__tap(); });
                                   await p.waitForTimeout(200); }],
    // d3 — панель аквариума: сводка по уровням и покупка малька
    ['d3-shop',       async p => { await p.evaluate(()=>{ window.__skipTut(); window.__grant(2e6);
                                     for(let i=0;i<3;i++) window.__buyFish(); window.__growAll();
                                     window.__mergeFirstPair(); });
                                   await p.click('#fishBtn'); }],
    ['d4-upgrades',   async p => { await p.evaluate(()=>{ window.__skipTut(); window.__grant(5e6); }); await p.click('#upBtn'); }],
    ['d6-settings',   async p => { await p.evaluate(()=>window.__skipTut()); await p.click('#setBtn'); }],
    // d5 — коллекция: несколько уровней уже открыто мержами
    // d5 — разнообразие видов и характеров: стайки, донные, зависающие
    ['d5-collection', async p => { await p.evaluate(()=>{ window.__skipTut(); window.__grant(1e9);
                                     [0,2,3,8,9,12,13,14,15,18,22,25,28].forEach(lvl=>{
                                       if(!S.seen.includes(lvl)) S.seen.push(lvl);
                                       S.tank.push({lvl, g:1, sat:0});
                                     });
                                     rebuildSwimmers(); refreshHud(); });
                                   await p.waitForTimeout(6000); }],
  ],
};

const browser = await chromium.launch();

async function shot(url, w, h, file, prep, locale) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale });
  await page.goto(url);
  await page.waitForTimeout(500);
  if (prep) await prep(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('saved', file);
}

// Скриншоты геймплея (десктоп 1920x1080) — RU и EN локали (авто-язык через navigator.language)
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '.png',    prep, 'ru-RU');
  await shot(gameUrl, 1920, 1080, name + '-en.png', prep, 'en-US');
}

// Обложки 800x470 и иконка 512x512 из card.html
const card = (o) => cardUrl + '?' + new URLSearchParams(o).toString();
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleRu,sub:CONFIG.subRu,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover.png');
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleEn,sub:CONFIG.subEn,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover-en.png');
await shot(card({ w:512,h:512,mode:'icon',heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 512, 512, 'icon.png');

await browser.close();
console.log('\nАссеты готовы в', out);
