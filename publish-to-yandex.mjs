#!/usr/bin/env node
// ============================================================
// publish-to-yandex.mjs — полуавтоматическая публикация игры в консоль Яндекс Игр.
//
// У консоли Яндекс Игр НЕТ публичного API, поэтому скрипт автоматизирует браузер
// (Playwright) с твоим залогиненным профилем. Запускать НА СВОЕЙ МАШИНЕ, не на
// сервере: логин, капча и 2FA проходятся человеком один раз в режиме --login.
//
// Использование:
//   node publish-to-yandex.mjs --login
//       Первый запуск: откроется окно браузера — залогинься в консоль вручную.
//       Сессия сохранится в профиле (--profile, по умолчанию ~/.ya-games-profile)
//       и переживёт перезапуски.
//
//   node publish-to-yandex.mjs
//       Полный цикл: открыть/создать черновик → загрузить zip → заполнить поля →
//       загрузить иконку/обложки/скриншоты → сохранить → нажать «Отправить на модерацию».
//
//   Флаги:
//     --no-submit          всё то же, но БЕЗ нажатия «Отправить на модерацию»
//     --draft-url <url>    открыть конкретный черновик по прямой ссылке (надёжнее поиска по названию)
//     --profile <dir>      папка персистентного профиля браузера
//     --slow               замедлить действия (удобно смотреть глазами, что происходит)
//
// Данные игры берутся из ./store/publish.json (название, описания, ключевые слова,
// пути к билду и ассетам). Логи и скриншот каждого шага — в ./publish-logs/.
//
// ВАЖНО про хрупкость: вёрстка консоли меняется без предупреждения. Все точки
// сцепления с интерфейсом собраны ниже в SELECTORS и FIELDS — при поломке чинить
// только там. Каждый некритичный шаг при неудаче не роняет скрипт, а пишет WARN
// в лог и идёт дальше: в конце печатается список того, что нужно доделать руками.
// ============================================================
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------- Точки сцепления с интерфейсом консоли (чинить здесь) ----------
const CONSOLE_URL = 'https://yandex.ru/games/console';
const SELECTORS = {
  loggedInMarker: /Добавить игру/i,          // видно только после логина
  addGameButton:  /Добавить игру/i,
  archiveStatusOk:/Файл проверен|Проверен/i, // статус после проверки архива
  saveButton:     /^Сохранить$/i,
  submitButton:   /Отправить на модерацию/i,
  confirmButton:  /^(Отправить|Подтвердить|Да)$/i, // кнопка в диалоге подтверждения, если появится
};
// Текстовые поля черновика: подпись поля в интерфейсе → значение из publish.json.
// Локали RU/EN в консоли заполняются в разных вкладках/секциях локализации —
// скрипт пробует найти поле по подписи в текущей видимой области.
const FIELDS = cfg => [
  { label: /Название/i,             value: cfg.title.ru },
  { label: /Короткое описание/i,    value: cfg.shortDescription.ru },
  { label: /Полное описание|^Описание/i, value: cfg.fullDescription.ru },
  { label: /Ключевые слова|Теги/i,  value: cfg.keywords.ru.join(', ') },
];

// ---------- Аргументы ----------
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt  = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LOGIN_ONLY = flag('--login');
const NO_SUBMIT  = flag('--no-submit');
const DRAFT_URL  = opt('--draft-url');
const PROFILE    = resolve(opt('--profile') || resolve(homedir(), '.ya-games-profile'));
const SLOW       = flag('--slow') ? 350 : 0;

// ---------- Конфиг игры ----------
const cfg = JSON.parse(readFileSync(resolve(ROOT, 'store', 'publish.json'), 'utf8'));
const asset = p => {
  const full = resolve(ROOT, p);
  if (!existsSync(full)) throw new Error('Нет файла: ' + p + ' — пересобери билд/ассеты');
  return full;
};

// ---------- Журнал шагов ----------
const LOGS = resolve(ROOT, 'publish-logs');
mkdirSync(LOGS, { recursive: true });
let stepNo = 0;
const todo = []; // что не удалось автоматизировать — доделать руками
const log = m => console.log(new Date().toISOString().slice(11, 19), m);

async function step(page, name, fn, { critical = false } = {}) {
  stepNo++;
  const tag = String(stepNo).padStart(2, '0') + '-' + name.replace(/[^a-zа-яё0-9]+/gi, '-');
  try {
    await fn();
    await page.screenshot({ path: resolve(LOGS, tag + '.png'), fullPage: false }).catch(() => {});
    log('ok   ' + name);
  } catch (e) {
    await page.screenshot({ path: resolve(LOGS, tag + '-FAIL.png'), fullPage: false }).catch(() => {});
    if (critical) { log('FAIL ' + name + ' — ' + e.message); throw e; }
    todo.push(name);
    log('WARN ' + name + ' — не получилось автоматически (' + e.message.split('\n')[0] + '), доделай руками');
  }
}

// Загрузка файлов: ищем input[type=file] рядом с подписью секции, иначе через file chooser
async function uploadFiles(page, sectionLabel, files) {
  const section = page.locator('section, fieldset, div', { hasText: sectionLabel }).last();
  const input = section.locator('input[type="file"]').first();
  if (await input.count()) { await input.setInputFiles(files); return; }
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    section.getByRole('button').first().click(),
  ]);
  await chooser.setFiles(files);
}

// ---------- Основной сценарий ----------
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1440, height: 900 },
  slowMo: SLOW, args: ['--lang=ru'],
});
const page = context.pages()[0] || await context.newPage();

log('Открываю консоль: ' + CONSOLE_URL);
await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded' });

// Логин: ждём маркер авторизованной консоли; если его нет — логинишься руками
const loggedIn = page.getByText(SELECTORS.loggedInMarker).first();
if (!(await loggedIn.isVisible().catch(() => false))) {
  log('Требуется вход. Залогинься в открывшемся окне (Яндекс ID, капча, 2FA) — жду до 5 минут…');
  await loggedIn.waitFor({ timeout: 300000 });
}
log('В консоли, сессия активна.');
if (LOGIN_ONLY) { log('Профиль сохранён: ' + PROFILE + '. Дальше запускай без --login.'); await context.close(); process.exit(0); }

// Черновик: по прямой ссылке, по названию в списке, либо создаём новый
if (DRAFT_URL) {
  await step(page, 'открыть черновик по ссылке', async () => {
    await page.goto(DRAFT_URL, { waitUntil: 'domcontentloaded' });
  }, { critical: true });
} else {
  const existing = page.getByText(cfg.title.ru, { exact: true }).first();
  if (await existing.isVisible().catch(() => false)) {
    await step(page, 'открыть существующий черновик «' + cfg.title.ru + '»', async () => {
      await existing.click();
      await page.waitForLoadState('domcontentloaded');
    }, { critical: true });
  } else {
    await step(page, 'создать новый черновик', async () => {
      await page.getByText(SELECTORS.addGameButton).first().click();
      // если мастер создания просит название — заполним
      const titleInput = page.locator('input[type="text"]').first();
      if (await titleInput.isVisible().catch(() => false)) await titleInput.fill(cfg.title.ru);
    }, { critical: true });
  }
}

// Билд
await step(page, 'загрузить архив ' + cfg.zip, async () => {
  await uploadFiles(page, /архив|билд|файл игры/i, [asset(cfg.zip)]);
}, { critical: true });

await step(page, 'дождаться проверки архива', async () => {
  await page.getByText(SELECTORS.archiveStatusOk).first().waitFor({ timeout: 600000 });
});

// Текстовые поля (RU-локаль; EN-локаль консоль ведёт отдельной вкладкой — см. todo в конце)
for (const f of FIELDS(cfg)) {
  await step(page, 'поле ' + f.label.source, async () => {
    const el = page.getByLabel(f.label).first();
    if (await el.count()) { await el.fill(f.value); return; }
    const near = page.locator('label, legend, span', { hasText: f.label }).first();
    const input = near.locator('xpath=following::input[1] | following::textarea[1]').first();
    await input.fill(f.value);
  });
}

// Медиа
await step(page, 'иконка', () => uploadFiles(page, /Иконка/i, [asset(cfg.assets.icon)]));
await step(page, 'обложка RU', () => uploadFiles(page, /Обложка/i, [asset(cfg.assets.cover.ru)]));
await step(page, 'скриншоты RU', () => uploadFiles(page, /Скриншоты/i, cfg.assets.screenshots.ru.map(asset)));
todo.push('EN-локаль: название «' + cfg.title.en + '», описания, обложка ' + cfg.assets.cover.en +
  ' и скриншоты -en — проверь вкладку английской локализации (авто-заполнение локалей зависит от вёрстки консоли)');

// Сохранить и отправить
await step(page, 'сохранить черновик', async () => {
  await page.getByRole('button', { name: SELECTORS.saveButton }).first().click();
});

if (NO_SUBMIT) {
  log('Флаг --no-submit: «Отправить на модерацию» НЕ нажимаю.');
} else {
  await step(page, 'отправить на модерацию', async () => {
    await page.getByRole('button', { name: SELECTORS.submitButton }).first().click();
    const confirm = page.getByRole('button', { name: SELECTORS.confirmButton }).first();
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) await confirm.click();
    await page.getByText(/Ожидает модерации|отправлена на модерацию/i).first()
      .waitFor({ timeout: 30000 }).catch(() => {});
  });
}

// Итог
log('');
log('Готово. Скриншоты шагов: publish-logs/');
if (todo.length) {
  log('Проверь/доделай руками:');
  todo.forEach(t => log('  • ' + t));
}
log('Окно браузера оставляю открытым 60 секунд для проверки глазами…');
await page.waitForTimeout(60000);
await context.close();
