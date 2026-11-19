// Демо-скринкаст админки Keitaro: Playwright + нарисованный курсор.
//   node record.mjs          — полная запись (создаёт кампанию test_kuznetsov_demo_*, публикует её потоки)
//   node record.mjs --dry    — пробный прогон: останавливается перед первой публикацией
// Пишет только в кампанию, которую создал сам; перед каждой правкой проверяет имя и ID.
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const RAW = join(OUT, "raw");
const BASE = process.env.DEMO_URL ?? "http://localhost:5173";
const DRY = process.argv.includes("--dry");
const HEADED = process.argv.includes("--headed");
// --id=N: пропустить главную и создание, открыть уже созданную скриптом кампанию (для отладки)
const REUSE = Number(process.argv.find((a) => a.startsWith("--id="))?.slice(5)) || null;
const W = 1440, H = 900;
const SAFE_PREFIX = "test_kuznetsov_demo_";
const ACCENT_OFFERS = { a: "13333", b: "12332" };

const now = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const SUFFIX = `demo_${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s]`, ...a);
let T0 = Date.now();

/* ---------------- курсор и движения ---------------- */

let page;
const cur = { x: W * 0.55, y: H * 0.45 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Плавный полёт по кривой Безье, ease-in-out, 500–900 мс в зависимости от расстояния. */
async function glide(tx, ty, ms) {
  const { x: sx, y: sy } = cur;
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d < 2) return;
  const dur = ms ?? Math.min(900, Math.max(500, 380 + d * 0.42));
  const bend = Math.min(0.22, 40 / Math.max(d, 1) + 0.08) * (Math.random() < 0.5 ? -1 : 1);
  const cx = sx + dx / 2 - dy * bend, cy = sy + dy / 2 + dx * bend;
  const steps = Math.max(12, Math.round(dur / 16));
  const start = Date.now();
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps), u = 1 - t;
    const x = u * u * sx + 2 * u * t * cx + t * t * tx;
    const y = u * u * sy + 2 * u * t * cy + t * t * ty;
    await page.mouse.move(x, y);
    const wait = start + (dur * i) / steps - Date.now();
    if (wait > 0) await sleep(wait);
  }
  cur.x = tx; cur.y = ty;
}

/** Плавно прокручивает окно, если элемент не в удобной зоне (над подписью и под верхом). */
// «удобная зона» кадра: сверху — липкая панель фильтров на главной, снизу — подпись шага
const zone = { top: 90, bottom: 150 };
async function reveal(loc, align = null) {
  await loc.waitFor({ state: "visible" });
  await loc.evaluate(async (el, [align, zTop, zBottom]) => {
    const r = el.getBoundingClientRect();
    const top = zTop, bottom = innerHeight - zBottom;
    if (align == null && r.top >= top && r.bottom <= bottom) return;
    if (el.closest('[role="dialog"]')) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); await new Promise((s) => setTimeout(s, 500)); return; }
    const from = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(max, align == null ? from + r.top + r.height / 2 - innerHeight * 0.45 : from + r.top - innerHeight * align));
    if (Math.abs(to - from) < 4) return;
    const dur = Math.min(1000, 450 + Math.abs(to - from) * 0.6);
    const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    await new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        scrollTo(0, from + (to - from) * e(t));
        t < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, [align, zone.top, zone.bottom]);
  await sleep(150);
}

/** Подлетает к центру элемента; click — реальный клик в этой точке. */
async function moveTo(loc, { click = false, dx = 0, dy = 0, fx = 0.5, after = 350, blur = false, scroll = true } = {}) {
  loc = loc.first();
  if (scroll) await reveal(loc);
  else await loc.waitFor({ state: "visible" });
  const b = await loc.boundingBox();
  if (!b) throw new Error("нет boundingBox у элемента");
  const tx = b.x + b.width * fx + dx, ty = b.y + b.height / 2 + dy;
  await glide(tx, ty);
  await page.mouse.move(tx, ty);
  if (click) {
    await sleep(rand(110, 180));
    await page.mouse.down();
    await sleep(rand(70, 110));
    await page.mouse.up();
    if (blur) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  }
  await sleep(after);
}
const clickOn = (loc, o = {}) => moveTo(loc, { ...o, click: true });

/** Печатает с человеческой задержкой 60–90 мс на символ. */
async function typeText(text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(60, 90));
  }
}

/** Протягивает ползунок input[type=range] до значения `to`. */
async function dragRange(loc, to) {
  await reveal(loc);
  const b = await loc.boundingBox();
  const from = Number(await loc.inputValue());
  const thumb = 9;
  const xAt = (v) => b.x + thumb + ((b.width - 2 * thumb) * v) / 100;
  const y = b.y + b.height / 2;
  await glide(xAt(from), y);
  await sleep(250);
  await page.mouse.down();
  const steps = 40, sx = xAt(from), ex = xAt(to);
  for (let i = 1; i <= steps; i++) {
    const x = sx + (ex - sx) * ease(i / steps);
    await page.mouse.move(x, y);
    cur.x = x; cur.y = y;
    await sleep(28);
  }
  await sleep(200);
  await page.mouse.up();
}

async function caption(num, title, sub = "") {
  log(`— ${num ? num + ". " : ""}${title}`);
  await page.evaluate(([n, t, s]) => window.__demo.caption(n, t, s), [num, title, sub]);
  await sleep(900);
}
const hideCaption = () => page.evaluate(() => window.__demo.hideCaption());

/* ---------------- безопасность ---------------- */

let ownId = null;
/** Любая правка — только в кампании, которую создал этот скрипт. */
async function assertOwn() {
  const path = new URL(page.url()).pathname;
  const h1 = (await page.locator("h1").first().innerText()).trim();
  if (!ownId || path !== `/campaigns/${ownId}` || !h1.startsWith(SAFE_PREFIX))
    throw new Error(`Стоп: правка вне своей кампании (path=${path}, name=${h1})`);
}
/** Ждёт ответ на изменяющий запрос к своей кампании. */
function waitWrite() {
  return page.waitForResponse(
    (r) => r.request().method() !== "GET" && r.url().includes(`/api/campaigns/${ownId}`),
    { timeout: 60_000 },
  ).then(async (r) => {
    if (!r.ok()) throw new Error(`Запрос ${r.request().method()} ${r.url()} → ${r.status()}: ${(await r.text()).slice(0, 300)}`);
    await sleep(500);
  });
}
async function write(loc, o) {
  await assertOwn();
  const done = waitWrite();
  done.catch(() => {});
  await clickOn(loc, o);
  await done;
}

/* ---------------- сценарий ---------------- */

async function scenarioHome() {
  await page.goto(BASE + "/");
  await page.locator("article h3 a").first().waitFor({ timeout: 60_000 });
  await page.evaluate(([x, y]) => window.__demo.place(x, y), [cur.x, cur.y]);
  await page.mouse.move(cur.x, cur.y);
  await sleep(600);
  T0 = Date.now(); // отсюда начинается видео после обрезки
  markStart();

  await caption(1, "Все кампании и фильтры", "Сводка за сегодня и карточки кампаний прямо из Keitaro");
  await moveTo(page.getByText("Клики", { exact: true }).first(), { after: 600 });
  await moveTo(page.getByText("Боты", { exact: true }).first(), { after: 700 });

  const card = page.locator("article").first();
  await moveTo(card.locator("h3"), { after: 700 });
  await caption(1, "Статус ссылки", "Домен кампании не резолвится — иконка предупреждает, «Открыть» ведёт через рабочий хост");
  await moveTo(card.locator('[role="img"]'), { after: 2200 });
  await moveTo(card.locator('a[aria-label^="Открыть кампанию"]'), { after: 2000 });

  await caption(1, "Поиск и фильтры", "Название, ID или алиас — фильтр срабатывает на лету");
  await clickOn(page.getByRole("searchbox", { name: /Поиск по названию/ }), { after: 200 });
  await typeText("kuznetsov");
  await sleep(1600);
  await clickOn(page.getByRole("button", { name: "Очистить поиск" }), { after: 900 });

  await clickOn(page.locator('button[aria-label^="Гео:"]'), { after: 500 });
  await typeText("MX");
  await sleep(500);
  await clickOn(page.getByRole("option").filter({ hasText: "MX" }), { after: 600 });
  await page.keyboard.press("Escape");
  await sleep(1500);
  await clickOn(page.getByRole("button", { name: "Сбросить", exact: true }), { after: 1100 });

  await clickOn(page.locator("label").filter({ hasText: "Только созданные здесь" }), { after: 1800 });
  await clickOn(page.locator("label").filter({ hasText: "Только созданные здесь" }), { after: 700 });

  await clickOn(page.getByRole("link", { name: "Новая кампания" }).first(), { after: 300 });
}

async function scenarioCreate() {
  await page.locator("#c-name").waitFor();
  await caption(2, "Создание кампании", "Префикс test_kuznetsov_ подставляется сам — вводим только окончание");
  await clickOn(page.locator("#c-name"), { after: 200 });
  await typeText(SUFFIX);
  await sleep(700);

  await clickOn(page.locator("#c-geo"), { after: 200 });
  await typeText("AU");
  await sleep(500);
  await clickOn(page.getByRole("option").filter({ hasText: "AU" }), { after: 700 });

  await clickOn(page.locator("#c-offer"), { after: 200 });
  await typeText("Flex");
  const opt = page.getByRole("option").filter({ hasText: /flex/i }).first();
  await opt.waitFor({ timeout: 30_000 });
  await sleep(500);
  await clickOn(opt, { after: 900 });

  await caption(2, "Превью справа", "Сразу видно, какие потоки и ссылка будут созданы");
  await moveTo(page.locator('[aria-label="Что будет создано"]').getByText("Flow 1"), { after: 1100 });
  await moveTo(page.locator('[aria-label="Что будет создано"]').getByText("Flow 2"), { after: 1100 });

  await clickOn(page.getByRole("button", { name: /Дополнительно/ }), { after: 1700 });
  await clickOn(page.getByRole("button", { name: /Дополнительно/ }), { after: 500 });

  // проверка имени до создания
  const full = await page.locator('[aria-label="Что будет создано"] p[title]').first().getAttribute("title");
  if (!full?.startsWith(SAFE_PREFIX)) throw new Error(`Неожиданное имя кампании: ${full}`);

  await caption(2, "Создаём в Keitaro", "Кампания и два потока появляются одним запросом");
  await clickOn(page.getByRole("button", { name: "Создать кампанию" }), { after: 300 });
  await page.getByRole("heading", { name: "Кампания создана" }).waitFor({ timeout: 90_000 });
  await sleep(900);

  const okName = (await page.locator('[role="status"]').filter({ hasText: "Кампания создана" }).locator("span.font-medium").first().innerText()).trim();
  const link = page.getByRole("link", { name: "Открыть кампанию", exact: true });
  ownId = Number((await link.getAttribute("href")).split("/").pop());
  if (okName !== full || !ownId) throw new Error(`Создана не та кампания: ${okName} #${ownId}`);
  log(`создана ${okName} #${ownId}`);

  await moveTo(page.locator("code").first(), { after: 1300 });
  await clickOn(link, { after: 300 });
}

async function scenarioEditor() {
  await page.getByRole("heading", { name: "Маршрут трафика" }).waitFor({ timeout: 60_000 });
  await assertOwn();
  const flow1 = page.locator('section[aria-label^="Поток"]').first();
  // редактируемый поток — тот, где есть «Изменить доли»; дальше держимся за его aria-label
  const label2 = await page.locator('section[aria-label^="Поток"]').filter({ has: page.getByRole("button", { name: /Изменить доли/ }) }).first().getAttribute("aria-label");
  const flow2 = page.locator(`section[aria-label="${label2}"]`);
  // в редакторе под схемой есть свободное место: держим Flow 2 в верхней части кадра, подпись — под ним
  zone.top = 16; zone.bottom = 120;
  const anchor = () => reveal(flow2, 0.03);

  await caption(3, "Маршрут трафика", "Потоки проверяются сверху вниз: страны из гео → безопасный редирект, остальные → оффер");
  await reveal(page.getByRole("heading", { name: "Маршрут трафика" }), 0.06);
  await moveTo(page.getByRole("heading", { name: "Маршрут трафика" }), { after: 600 });
  await moveTo(flow1.locator("h3"), { after: 600 });
  await moveTo(flow1.locator("span.cursor-help").first(), { after: 1800 });
  await moveTo(flow2.locator("h3"), { after: 900 });

  /* --- черновик: добавляем офферы --- */
  await caption(4, "Черновик: добавляем оффер", "Оффер 13333 — по ID: ключ API не читает его данные, поэтому «Оффер #ID»");
  await anchor();
  await addOffer(flow2, ACCENT_OFFERS.a);
  await caption(4, "Не опубликовано", "Поток подсвечен, доли пересчитаны поровну — 50 / 50. В Keitaro пока ничего не ушло");
  await moveTo(flow2.getByText("Не опубликовано"), { after: 1300 });
  await moveTo(flow2.locator("li").filter({ hasText: `#${ACCENT_OFFERS.a}` }).getByText("нет доступа"), { after: 1800 });

  await caption(5, "Закрепление доли", "Замок фиксирует долю первого оффера — новые офферы делят только остаток");
  await anchor();
  await write(flow2.locator('button[aria-label^="Закрепить долю оффера"]').first(), { blur: true, after: 600 });
  await addOffer(flow2, ACCENT_OFFERS.b);
  await caption(5, "50% остались на месте", "Закреплённый оффер не изменился, двое других получили по 25%");
  await moveTo(flow2.locator("li").first().locator("span.w-12"), { after: 1100 });
  await moveTo(flow2.locator("li").filter({ hasText: `#${ACCENT_OFFERS.b}` }).locator("span.w-12"), { after: 1200 });

  /* --- доли --- */
  await caption(6, "Изменить доли", "Двигаем слайдер — свободные офферы пересчитываются пропорционально");
  await clickOn(flow2.getByRole("button", { name: /Изменить доли/ }), { after: 900 });
  const dlg = page.getByRole("dialog");
  const sliders = dlg.locator('input[type="range"]');
  await dragRange(sliders.nth(1), 38);
  await sleep(1200);
  await moveTo(dlg.locator('[role="img"]').first(), { after: 1000 });
  await write(dlg.getByRole("button", { name: "Сохранить" }), { after: 900 });

  if (DRY) {
    await caption(0, "Пробный прогон", "Остановка перед публикацией — в Keitaro ничего не отправлено");
    await sleep(2500);
    return;
  }

  /* --- публикация --- */
  await caption(7, "Публикация в Keitaro", "Перед отправкой — список всех изменений потока");
  await anchor();
  await publish(flow2);

  /* --- удаление и архив --- */
  await caption(8, "Удаление оффера", "Удалённый оффер виден зачёркнутым, пока изменение не опубликовано");
  await anchor();
  await write(flow2.locator("li").filter({ hasText: `#${ACCENT_OFFERS.b}` }).locator('button[aria-label^="Удалить оффер"]'), { blur: true, after: 1400 });
  await publish(flow2, true);
  await caption(8, "Архив", "Опубликованное удаление уходит в архив — оттуда оффер можно вернуть");
  await anchor();
  await clickOn(flow2.getByRole("button", { name: /Архив/ }), { after: 1000 });
  await write(flow2.locator("li").filter({ hasText: `#${ACCENT_OFFERS.b}` }).getByRole("button", { name: "Вернуть" }), { after: 1200 });
  await publish(flow2, true);

  /* --- журнал --- */
  await caption(9, "Журнал изменений", "Каждая правка и публикация — с долями до и после");
  const journal = page.locator('[aria-label="Журнал изменений"]');
  // журнал выше колонки потоков: ставим его верх в кадр — низ Flow 2 при этом остаётся над подписью
  await reveal(journal, 0.02);
  await moveTo(journal.locator("h2"), { after: 700, scroll: false });
  const items = journal.locator("ol > li");
  await moveTo(items.nth(0), { after: 1000, scroll: false });
  await moveTo(items.nth(1), { after: 900, scroll: false });
  await page.mouse.wheel(0, 260);
  await sleep(1200);
  await page.mouse.wheel(0, 260);
  await sleep(1400);
  await caption(0, "Готово", "Кампания создана, потоки опубликованы, история сохранена");
  await sleep(2600);
}

/** Отладка: открыть свою кампанию и сбросить её черновик. */
async function openReused() {
  ownId = REUSE;
  await page.goto(`${BASE}/campaigns/${ownId}`);
  await page.getByRole("heading", { name: "Маршрут трафика" }).waitFor({ timeout: 60_000 });
  await assertOwn();
  const discard = page.getByRole("button", { name: "Отменить изменения" });
  while (await discard.count()) await write(discard, { after: 300 });
  await page.evaluate(([x, y]) => window.__demo.place(x, y), [cur.x, cur.y]);
  T0 = Date.now();
  markStart();
}

async function addOffer(flow, id) {
  await clickOn(flow.getByRole("button", { name: /Добавить оффер/ }), { after: 300 });
  await typeText(id);
  const opt = page.getByRole("option").filter({ hasText: `#${id}` });
  await opt.waitFor({ timeout: 30_000 });
  await sleep(400);
  await clickOn(opt, { after: 500 });
  await write(flow.getByRole("button", { name: "Добавить", exact: true }), { after: 1000 });
}

async function publish(flow, quick = false) {
  await clickOn(flow.getByRole("button", { name: "Опубликовать в Keitaro" }), { after: quick ? 1300 : 2600 });
  const dlg = page.getByRole("dialog");
  if (!quick) await moveTo(dlg.locator("ul"), { after: 1600 });
  await write(dlg.getByRole("button", { name: "Опубликовать", exact: true }), { after: 1500 });
}

/* ---------------- запуск, запись, обрезка ---------------- */

let startMs = 0, ctxBorn = 0;
const markStart = () => { startMs = Date.now() - ctxBorn; };

async function preflight() {
  for (const p of ["/api/health", "/api/status"]) {
    const r = await fetch(BASE + p).catch((e) => ({ ok: false, statusText: e.message }));
    if (!r.ok) throw new Error(`${p} не отвечает (${r.status ?? ""} ${r.statusText}). Запустите бэкенд и фронт.`);
  }
}

function ffmpegOk() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

async function main() {
  await preflight();
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: RAW, size: { width: W, height: H } },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  await context.addInitScript({ content: readFileSync(join(HERE, "overlay.js"), "utf8") });
  ctxBorn = Date.now();
  page = await context.newPage();
  page.setDefaultTimeout(30_000);

  let failed = null;
  try {
    if (REUSE) await openReused();
    else {
      await scenarioHome();
      await scenarioCreate();
    }
    await scenarioEditor();
    await hideCaption();
    await sleep(800);
  } catch (e) {
    failed = e;
    console.error("ОШИБКА:", e.message);
    await page.screenshot({ path: join(OUT, "error.png") }).catch(() => {});
  }
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();

  const name = DRY ? "demo-dry" : "demo";
  const webm = join(OUT, `${name}.webm`);
  const mp4 = join(OUT, `${name}.mp4`);
  const ss = (Math.max(0, startMs - 200) / 1000).toFixed(2);
  if (ffmpegOk()) {
    log("ffmpeg: обрезка и кодирование…");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", ss, "-i", raw, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", webm]);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", ss, "-i", raw, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
    rmSync(RAW, { recursive: true, force: true });
  } else {
    if (existsSync(webm)) rmSync(webm);
    renameSync(raw, webm);
  }
  log(`видео: ${webm}${ffmpegOk() ? ` и ${mp4}` : ""}${ownId ? ` · кампания #${ownId}` : ""}`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
