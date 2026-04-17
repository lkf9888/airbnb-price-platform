#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium, firefox } = require('playwright');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'airbnb-market-research.json');
const DEFAULT_BROWSER = 'chromium';
const DEFAULT_STORAGE_STATE_PATH = path.join(PROJECT_ROOT, 'state', 'auth', 'airbnb-chrome-storage-state.json');
const DEFAULT_REPORT_DIR = path.resolve(PROJECT_ROOT, '..', 'output', 'reports');
const DEFAULT_SEARCH_BASE_URL = 'https://www.airbnb.com/s/homes';
const MAX_DATE_SPAN_DAYS = 60;
const MIN_COMPARABLES_PER_STRATEGY = 3;
const BROWSER_CONFIGS = {
  chromium: {
    engine: chromium,
    executablePath: process.env.AIRBNB_CHROME_EXECUTABLE_PATH || '',
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
    },
  },
  firefox: {
    engine: firefox,
    executablePath: '',
    launchOptions: {
      firefoxUserPrefs: {
        'media.hardware-video-decoding.enabled': false,
        'layers.acceleration.disabled': true,
      },
    },
  },
};
const ROOM_TYPE_ALIASES = [
  {
    key: 'entire_home',
    labels: ['整套房源', '整套', 'entire home', 'entire place', 'entire home/apt', 'entire apartment'],
    keywords: ['entire home', 'entire place', 'entire rental unit', 'entire condo', 'entire apartment', '整套', '整间', '整套房源'],
    display: '整套房源',
  },
  {
    key: 'private_room',
    labels: ['独立房间', 'private room', '单间'],
    keywords: ['private room', '独立房间', '单间'],
    display: '独立房间',
  },
  {
    key: 'shared_room',
    labels: ['合住房间', 'shared room'],
    keywords: ['shared room', '合住房间'],
    display: '合住房间',
  },
  {
    key: 'hotel_room',
    labels: ['酒店房间', 'hotel room'],
    keywords: ['hotel room', '酒店房间'],
    display: '酒店房间',
  },
];
const PROPERTY_TYPE_ALIASES = [
  {
    key: 'apartment',
    labels: ['公寓', 'apartment', 'condo', 'rental unit', 'condominium', 'loft'],
    keywords: ['apartment', 'condo', 'rental unit', 'condominium', 'loft', 'serviced apartment', '公寓'],
    display: '公寓',
  },
  {
    key: 'townhouse',
    labels: ['联排', 'townhouse', 'townhome'],
    keywords: ['townhouse', 'townhome', '联排'],
    display: '联排',
  },
  {
    key: 'house',
    labels: ['独立屋', 'house', 'villa'],
    keywords: [' house ', ' house in ', 'residential home', 'villa', 'cottage', 'bungalow', '独立屋'],
    display: '独立屋',
  },
  {
    key: 'suite',
    labels: ['套房', 'suite', 'guest suite'],
    keywords: ['guest suite', 'suite', '套房'],
    display: '套房',
  },
];

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function fail(message) {
  console.error(`[${timestamp()}] ERROR: ${message}`);
  process.exit(1);
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function slugify(input) {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    setup: false,
    headed: false,
    headless: false,
    browser: null,
    startDate: null,
    endDate: null,
    address: null,
    propertyType: null,
    roomType: null,
    bedrooms: null,
    bathrooms: null,
    adults: null,
    maxResultsPerDate: null,
    monthlyStayLength: null,
    reportDir: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--setup') {
      args.setup = true;
      continue;
    }

    if (arg === '--headed') {
      args.headed = true;
      continue;
    }

    if (arg === '--headless') {
      args.headless = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--browser') {
      args.browser = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--start-date') {
      args.startDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--end-date') {
      args.endDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--address') {
      args.address = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--property-type') {
      args.propertyType = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--room-type') {
      args.roomType = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--bedrooms') {
      args.bedrooms = Number.parseFloat(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--bathrooms') {
      args.bathrooms = Number.parseFloat(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--adults') {
      args.adults = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === '--max-results') {
      args.maxResultsPerDate = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === '--monthly-nights') {
      args.monthlyStayLength = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === '--report-dir') {
      args.reportDir = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Airbnb Market Research

Usage:
  npm run airbnb:research -- --start-date 2026-04-10 --end-date 2026-04-20 --address "123 Main St, Vancouver, BC" --room-type "整套房源" --bedrooms 2 --bathrooms 1

Options:
  --setup                 Open Airbnb and save login state
  --headed                Force headed browser mode
  --headless              Force headless browser mode
  --browser <name>        chromium | chrome | firefox
  --start-date <date>     YYYY-MM-DD
  --end-date <date>       YYYY-MM-DD
  --address <text>        Search address or neighborhood
  --property-type <text>  公寓 | 联排 | 独立屋 | 套房
  --room-type <text>      整套房源 | 独立房间 | 合住房间 | 酒店房间
  --bedrooms <number>     Bedroom count
  --bathrooms <number>    Bathroom count
  --adults <number>       Adults count for search
  --max-results <number>  Max comparable listings per date
  --monthly-nights <n>    Length of monthly stay, default 30
  --report-dir <path>     Output folder for html/json report
  --help, -h              Show this message
`);
}

function loadConfig() {
  if (!fileExists(CONFIG_PATH)) {
    return {
      browser: DEFAULT_BROWSER,
      searchBaseUrl: DEFAULT_SEARCH_BASE_URL,
      storageStatePath: DEFAULT_STORAGE_STATE_PATH,
      timezone: 'America/Vancouver',
      reportDir: DEFAULT_REPORT_DIR,
      maxResultsPerDate: 12,
      monthlyStayLength: 30,
      defaultAdults: 2,
    };
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const configuredStorageStatePath = parsed.storageStatePath
    ? path.resolve(PROJECT_ROOT, parsed.storageStatePath)
    : DEFAULT_STORAGE_STATE_PATH;
  const configuredReportDir = parsed.reportDir
    ? path.resolve(PROJECT_ROOT, parsed.reportDir)
    : DEFAULT_REPORT_DIR;

  return {
    browser: parsed.browser || DEFAULT_BROWSER,
    searchBaseUrl: parsed.searchBaseUrl || DEFAULT_SEARCH_BASE_URL,
    storageStatePath: configuredStorageStatePath,
    timezone: parsed.timezone || 'America/Vancouver',
    reportDir: configuredReportDir,
    maxResultsPerDate: Number.isInteger(parsed.maxResultsPerDate) ? parsed.maxResultsPerDate : 12,
    monthlyStayLength: Number.isInteger(parsed.monthlyStayLength) ? parsed.monthlyStayLength : 30,
    defaultAdults: Number.isInteger(parsed.defaultAdults) ? parsed.defaultAdults : 2,
  };
}

function promptText(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message}\n`, (answer) => {
      rl.close();
      resolve(normalizeText(answer));
    });
  });
}

async function promptNumber(message, parser = Number.parseFloat) {
  while (true) {
    const answer = await promptText(message);
    const parsed = parser(answer);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    log('输入格式不正确，请重新输入。');
  }
}

async function promptDate(message) {
  while (true) {
    const answer = await promptText(message);
    if (parseIsoDate(answer)) {
      return answer;
    }
    log('日期格式需要是 YYYY-MM-DD，请重新输入。');
  }
}

function parseIsoDate(value) {
  const matched = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function formatIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  let cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  while (cursor && end && cursor.getTime() <= end.getTime()) {
    dates.push(formatIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function normalizeBrowserName(browserName) {
  const normalized = String(browserName || DEFAULT_BROWSER).toLowerCase();
  return normalized === 'chrome' ? 'chromium' : normalized;
}

function getBrowserConfig(browserName) {
  const normalized = normalizeBrowserName(browserName);
  const browserConfig = BROWSER_CONFIGS[normalized];

  if (!browserConfig) {
    fail(`Unsupported browser "${browserName}". Use "firefox" or "chromium".`);
  }

  return { normalized, ...browserConfig };
}

async function launchBrowser(browserName, headless) {
  const browserConfig = getBrowserConfig(browserName);
  const configuredExecutablePath = browserConfig.executablePath;
  const bundledExecutablePath = browserConfig.engine.executablePath();
  const executablePath = configuredExecutablePath && fileExists(configuredExecutablePath)
    ? configuredExecutablePath
    : bundledExecutablePath;

  log(`Launching ${browserConfig.normalized} browser`);
  return browserConfig.engine.launch({
    executablePath,
    headless,
    timeout: 45000,
    ...browserConfig.launchOptions,
  });
}

async function openContext(browser, config, useStorageState) {
  const contextOptions = {
    viewport: null,
    locale: 'en-CA',
    timezoneId: config.timezone,
  };

  if (useStorageState && fileExists(config.storageStatePath)) {
    contextOptions.storageState = config.storageStatePath;
    log(`Using storage state ${config.storageStatePath}`);
  }

  return browser.newContext(contextOptions);
}

async function getPage(context) {
  const existingPage = context.pages()[0];
  return existingPage || context.newPage();
}

async function saveStorageState(context, storageStatePath) {
  ensureDir(path.dirname(storageStatePath));
  await context.storageState({ path: storageStatePath });
  log(`Saved storage state: ${storageStatePath}`);
}

function findRoomType(input) {
  const normalized = normalizeText(input).toLowerCase();
  const matched = ROOM_TYPE_ALIASES.find((option) => option.labels.some((label) => normalized === label.toLowerCase()));
  if (matched) {
    return matched;
  }

  const fuzzyMatched = ROOM_TYPE_ALIASES.find((option) => option.labels.some((label) => normalized.includes(label.toLowerCase())));
  if (fuzzyMatched) {
    return fuzzyMatched;
  }

  return null;
}

function normalizeRoomType(input) {
  const matched = findRoomType(input);
  if (matched) {
    return matched;
  }

  fail(`Unsupported room type "${input}". Use one of: ${ROOM_TYPE_ALIASES.map((option) => option.display).join(' / ')}`);
}

function findPropertyType(input) {
  const normalized = normalizeText(input).toLowerCase();
  if (!normalized) {
    return null;
  }

  const matched = PROPERTY_TYPE_ALIASES.find((option) => option.labels.some((label) => normalized === label.toLowerCase()));
  if (matched) {
    return matched;
  }

  const fuzzyMatched = PROPERTY_TYPE_ALIASES.find((option) => option.labels.some((label) => normalized.includes(label.toLowerCase())));
  if (fuzzyMatched) {
    return fuzzyMatched;
  }

  return null;
}

function normalizePropertyType(input) {
  const matched = findPropertyType(input);
  if (matched) {
    return matched;
  }

  fail(`Unsupported property type "${input}". Use one of: ${PROPERTY_TYPE_ALIASES.map((option) => option.display).join(' / ')}`);
}

function resolveRequestedTypes(roomTypeInput, explicitPropertyType) {
  const tokens = []
    .concat(explicitPropertyType ? [explicitPropertyType] : [])
    .concat(String(roomTypeInput || '').split(/[,\uff0c/]/).map((value) => normalizeText(value)).filter(Boolean));

  let roomType = null;
  let propertyType = null;

  for (const token of tokens) {
    if (!roomType) {
      roomType = findRoomType(token);
      if (roomType) {
        continue;
      }
    }

    if (!propertyType) {
      propertyType = findPropertyType(token);
      if (propertyType) {
        continue;
      }
    }
  }

  if (!roomType) {
    roomType = normalizeRoomType(roomTypeInput);
  }

  return {
    roomType,
    propertyType,
  };
}

async function collectResearchInput(args, config) {
  const startDate = args.startDate || await promptDate('请输入调研开始日期（YYYY-MM-DD）:');
  const endDate = args.endDate || await promptDate('请输入调研结束日期（YYYY-MM-DD）:');
  const address = args.address || await promptText('请输入房源地址或社区地址:');
  const roomTypeInput = args.roomType || await promptText('请输入房型（可填“公寓,整套房源”或“整套房源”）:');
  const bedrooms = Number.isFinite(args.bedrooms) ? args.bedrooms : await promptNumber('请输入卧室数量:');
  const bathrooms = Number.isFinite(args.bathrooms) ? args.bathrooms : await promptNumber('请输入卫生间数量:');
  const adults = Number.isInteger(args.adults) ? args.adults : config.defaultAdults;
  const maxResultsPerDate = Number.isInteger(args.maxResultsPerDate) ? args.maxResultsPerDate : config.maxResultsPerDate;
  const monthlyStayLength = Number.isInteger(args.monthlyStayLength) ? args.monthlyStayLength : config.monthlyStayLength;
  const requestedTypes = resolveRequestedTypes(roomTypeInput, args.propertyType);

  return {
    startDate,
    endDate,
    address,
    propertyType: requestedTypes.propertyType,
    roomType: requestedTypes.roomType,
    bedrooms,
    bathrooms,
    adults,
    maxResultsPerDate,
    monthlyStayLength,
    reportDir: args.reportDir ? path.resolve(args.reportDir) : config.reportDir,
  };
}

function validateResearchInput(input) {
  const start = parseIsoDate(input.startDate);
  const end = parseIsoDate(input.endDate);

  if (!start || !end) {
    fail('Start date and end date must use YYYY-MM-DD.');
  }

  if (end.getTime() < start.getTime()) {
    fail('End date must be on or after start date.');
  }

  const spanDays = enumerateDates(input.startDate, input.endDate).length;
  if (spanDays > MAX_DATE_SPAN_DAYS) {
    fail(`Date range is too large (${spanDays} days). Keep it within ${MAX_DATE_SPAN_DAYS} days per run.`);
  }

  if (!normalizeText(input.address)) {
    fail('Address is required.');
  }

  if (!Number.isFinite(input.bedrooms) || input.bedrooms < 0) {
    fail('Bedrooms must be a number >= 0.');
  }

  if (!Number.isFinite(input.bathrooms) || input.bathrooms < 0) {
    fail('Bathrooms must be a number >= 0.');
  }

  if (!Number.isInteger(input.adults) || input.adults <= 0) {
    fail('Adults must be an integer > 0.');
  }

  if (!Number.isInteger(input.maxResultsPerDate) || input.maxResultsPerDate <= 0) {
    fail('Max results per date must be a positive integer.');
  }

  if (!Number.isInteger(input.monthlyStayLength) || input.monthlyStayLength < 28) {
    fail('Monthly stay length must be an integer >= 28.');
  }
}

async function promptEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise((resolve) => {
    rl.question(`${message}\n`, () => {
      rl.close();
      resolve();
    });
  });
}

async function firstVisible(locators, timeout = 4000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    for (const locator of locators) {
      try {
        if (await locator.count()) {
          const first = locator.first();
          if (await first.isVisible()) {
            return first;
          }
        }
      } catch {
        // Ignore transient selector failures.
      }
    }

    await pause(150);
  }

  return null;
}

async function dismissPopups(page) {
  const buttons = [
    page.getByRole('button', { name: /close|dismiss|not now|skip|以后再说|关闭/i }),
    page.locator('[aria-label="Close"]').first(),
    page.locator('button').filter({ hasText: /close|dismiss|not now|skip|以后再说|关闭/i }).first(),
  ];

  const target = await firstVisible(buttons, 2000);
  if (!target) {
    return false;
  }

  await target.click().catch(() => target.click({ force: true }).catch(() => {}));
  await pause(600);
  return true;
}

async function takeScreenshot(page, name) {
  const dir = path.join(PROJECT_ROOT, 'runtime', 'logs');
  ensureDir(dir);
  const filePath = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(`Saved screenshot: ${filePath}`);
}

async function dumpPageDiagnostics(page, name) {
  const dir = path.join(PROJECT_ROOT, 'runtime', 'logs');
  ensureDir(dir);

  const diagnostics = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    return {
      title: document.title,
      url: location.href,
      visibleButtons: Array.from(document.querySelectorAll('button, [role="button"], a'))
        .filter(isVisible)
        .slice(0, 120)
        .map((element) => normalize(element.innerText || element.textContent || ''))
        .filter(Boolean),
      textSample: normalize(document.body ? document.body.innerText : '').slice(0, 4000),
    };
  });

  const filePath = path.join(dir, `${name}-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(diagnostics, null, 2));
  log(`Saved diagnostics: ${filePath}`);
}

async function ensureSearchPageReady(page) {
  await dismissPopups(page).catch(() => {});
  await pause(1500);

  const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
  if (/captcha|verify you are human|just a moment|unusual traffic/i.test(bodyText)) {
    await dumpPageDiagnostics(page, 'airbnb-market-research-blocked');
    await takeScreenshot(page, 'airbnb-market-research-blocked');
    fail('Airbnb appears to be blocking automated access right now. Open the page headed, complete any human check, then rerun.');
  }
}

function buildSearchUrl(config, params) {
  const searchUrl = new URL(config.searchBaseUrl);
  searchUrl.searchParams.set('query', params.address);
  searchUrl.searchParams.set('checkin', params.checkIn);
  searchUrl.searchParams.set('checkout', params.checkOut);
  searchUrl.searchParams.set('adults', String(params.adults));
  searchUrl.searchParams.set('source', 'structured_search_input_header');
  searchUrl.searchParams.set('search_type', 'user_map_move');
  return searchUrl.toString();
}

async function recordGotoFailure(page, label) {
  const reportDir = path.resolve(PROJECT_ROOT, '..', 'output', 'reports');
  ensureDir(reportDir);
  const stamp = Date.now();
  const safeLabel = String(label || 'goto').replace(/[^A-Za-z0-9._-]+/g, '-');
  const screenshotName = `diagnostic-${safeLabel}-${stamp}.png`;
  const htmlName = `diagnostic-${safeLabel}-${stamp}.html`;

  try {
    const currentUrl = page.url();
    log(`Diagnostic captured URL: ${currentUrl}`);
  } catch {}

  try {
    await page.screenshot({ path: path.join(reportDir, screenshotName), fullPage: true });
    log(`Saved diagnostic screenshot: ${screenshotName}`);
  } catch (error) {
    log(`Failed to capture diagnostic screenshot: ${error.message}`);
  }

  try {
    const html = await page.content();
    fs.writeFileSync(path.join(reportDir, htmlName), html, 'utf8');
    log(`Saved diagnostic HTML: ${htmlName}`);
  } catch (error) {
    log(`Failed to capture diagnostic HTML: ${error.message}`);
  }
}

async function navigateToSearch(page, config, params) {
  const url = buildSearchUrl(config, params);
  log(`Opening Airbnb search for ${params.checkIn} -> ${params.checkOut}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch (error) {
    await recordGotoFailure(page, `${params.checkIn}-${params.checkOut}`);
    throw error;
  }

  await ensureSearchPageReady(page);
  await page.mouse.wheel(0, 900);
  await pause(1000);
}

async function scrapeRawCards(page, maxResults) {
  const uniqueCards = new Map();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cards = await page.evaluate(() => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const seen = new Set();
      const results = [];

      for (const anchor of Array.from(document.querySelectorAll('a[href*="/rooms/"]'))) {
        if (!isVisible(anchor)) {
          continue;
        }

        const href = (anchor.href || '').split('?')[0];
        if (!href || seen.has(href)) {
          continue;
        }

        let container = anchor.closest('[itemprop="itemListElement"]') || anchor.closest('article');
        if (!container) {
          let current = anchor;
          for (let depth = 0; depth < 6 && current; depth += 1) {
            current = current.parentElement;
            if (!current) {
              break;
            }
            const text = normalize(current.innerText || current.textContent || '');
            if (text.length >= 40 && /(?:CA|C)?\$\s?\d|night|month|每晚|月/.test(text)) {
              container = current;
              break;
            }
          }
        }

        const text = normalize((container || anchor).innerText || anchor.textContent || '');
        if (!text || text.length < 20) {
          continue;
        }

        seen.add(href);
        results.push({
          href,
          ariaLabel: normalize(anchor.getAttribute('aria-label') || ''),
          text,
        });
      }

      return results;
    });

    for (const card of cards) {
      if (!uniqueCards.has(card.href)) {
        uniqueCards.set(card.href, card);
      }
    }

    if (uniqueCards.size >= maxResults * 2) {
      break;
    }

    await page.mouse.wheel(0, 1600);
    await pause(1200);
  }

  return Array.from(uniqueCards.values()).slice(0, maxResults * 2);
}

function parseCurrencyCandidates(text) {
  const source = String(text || '');
  const regex = /((?:CA|C)?\$\s?[\d,]+(?:\.\d{1,2})?)/gi;
  const candidates = [];
  let matched;

  while ((matched = regex.exec(source)) !== null) {
    const raw = matched[1];
    const amount = Number.parseFloat(raw.replace(/[^0-9.]/g, '').replace(/,/g, ''));
    if (!Number.isFinite(amount)) {
      continue;
    }

    const contextStart = Math.max(0, matched.index - 24);
    const contextEnd = Math.min(source.length, matched.index + raw.length + 24);
    candidates.push({
      raw,
      amount,
      context: source.slice(contextStart, contextEnd).toLowerCase(),
      index: matched.index,
    });
  }

  return candidates;
}

function parseBedrooms(text) {
  const normalized = String(text || '').toLowerCase();
  if (/\bstudio\b|单间公寓/.test(normalized)) {
    return 0;
  }

  const matches = [
    normalized.match(/(\d+(?:\.\d+)?)\s+bedroom/),
    normalized.match(/(\d+(?:\.\d+)?)\s*卧室/),
  ];

  for (const match of matches) {
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }

  return null;
}

function parseBathrooms(text) {
  const normalized = String(text || '').toLowerCase();
  const matches = [
    normalized.match(/(\d+(?:\.\d+)?)\s+bath/),
    normalized.match(/(\d+(?:\.\d+)?)\s*卫(?:浴|生间)/),
    normalized.match(/(\d+(?:\.\d+)?)\s+bathroom/),
  ];

  for (const match of matches) {
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }

  return null;
}

function inferRoomType(text) {
  const normalized = String(text || '').toLowerCase();
  return ROOM_TYPE_ALIASES.find((option) => option.keywords.some((keyword) => normalized.includes(keyword))) || null;
}

function inferPropertyType(text) {
  const normalized = ` ${String(text || '').toLowerCase()} `;
  return PROPERTY_TYPE_ALIASES.find((option) => option.keywords.some((keyword) => normalized.includes(keyword))) || null;
}

function parseCard(rawCard, stayType, monthlyStayLength) {
  const text = normalizeText(`${rawCard.ariaLabel} ${rawCard.text}`);
  const prices = parseCurrencyCandidates(text);
  const roomType = inferRoomType(text);
  const propertyType = inferPropertyType(text);
  const nightlyCandidate = prices.find((candidate) => /night|每晚/.test(candidate.context));
  const monthlyCandidate = prices.find((candidate) => /month|monthly|每月|月租/.test(candidate.context));
  const totalCandidate = prices.find((candidate) => /total|before taxes|总价|总共/.test(candidate.context));
  const fallbackCandidate = prices[0] || null;

  let selectedPrice = null;
  let selectedBasis = 'unknown';

  if (stayType === 'daily') {
    if (nightlyCandidate) {
      selectedPrice = nightlyCandidate;
      selectedBasis = 'nightly';
    } else {
      selectedPrice = null;
      selectedBasis = 'unknown';
    }
  } else {
    if (monthlyCandidate) {
      selectedPrice = monthlyCandidate;
      selectedBasis = 'monthly';
    } else if (totalCandidate) {
      selectedPrice = totalCandidate;
      selectedBasis = 'total';
    } else if (fallbackCandidate) {
      selectedPrice = fallbackCandidate;
      selectedBasis = 'fallback';
    }
  }

  const monthlyTotal = stayType === 'monthly'
    ? (selectedPrice ? selectedPrice.amount : null)
    : null;

  return {
    href: rawCard.href,
    text,
    roomType,
    propertyType,
    bedrooms: parseBedrooms(text),
    bathrooms: parseBathrooms(text),
    price: selectedPrice ? selectedPrice.amount : null,
    priceBasis: selectedBasis,
    monthlyNightlyEquivalent: monthlyTotal ? monthlyTotal / monthlyStayLength : null,
  };
}

function hasComparablePrice(card) {
  return Number.isFinite(card.price) && card.price > 0;
}

function matchesExactRoomType(card, roomType) {
  return Boolean(card.roomType && card.roomType.key === roomType.key);
}

function matchesExactPropertyType(card, propertyType) {
  return Boolean(propertyType && card.propertyType && card.propertyType.key === propertyType.key);
}

function bathroomCloseEnough(cardBathrooms, wantedBathrooms, tolerance = 0.25) {
  return Number.isFinite(cardBathrooms) && Math.abs(cardBathrooms - wantedBathrooms) <= tolerance;
}

function selectComparables(parsedCards, wanted) {
  const pricedCards = parsedCards.filter(hasComparablePrice);
  if (!pricedCards.length) {
    return { cards: [], matchLabel: '没有抓到可用价格' };
  }

  const matchLevels = [];

  if (wanted.propertyType) {
    matchLevels.push(
      {
        label: '物业类型 + 房型 + 卧室 + 卫生间精确匹配',
        filter: (card) => matchesExactPropertyType(card, wanted.propertyType)
          && matchesExactRoomType(card, wanted.roomType)
          && Number.isFinite(card.bedrooms)
          && Number.isFinite(card.bathrooms)
          && card.bedrooms === wanted.bedrooms
          && bathroomCloseEnough(card.bathrooms, wanted.bathrooms),
      },
      {
        label: '物业类型 + 房型 + 卧室匹配',
        filter: (card) => matchesExactPropertyType(card, wanted.propertyType)
          && matchesExactRoomType(card, wanted.roomType)
          && Number.isFinite(card.bedrooms)
          && card.bedrooms === wanted.bedrooms,
      },
      {
        label: '物业类型 + 房型匹配',
        filter: (card) => matchesExactPropertyType(card, wanted.propertyType)
          && matchesExactRoomType(card, wanted.roomType),
      },
      {
        label: '物业类型 + 卧室/卫生间接近',
        filter: (card) => matchesExactPropertyType(card, wanted.propertyType)
          && (
            (!Number.isFinite(card.bedrooms) || Math.abs(card.bedrooms - wanted.bedrooms) <= 1)
            && (!Number.isFinite(card.bathrooms) || bathroomCloseEnough(card.bathrooms, wanted.bathrooms, 0.5))
          ),
      },
    );
  }

  matchLevels.push(
    {
      label: '房型 + 卧室 + 卫生间精确匹配',
      filter: (card) => matchesExactRoomType(card, wanted.roomType)
        && Number.isFinite(card.bedrooms)
        && Number.isFinite(card.bathrooms)
        && card.bedrooms === wanted.bedrooms
        && bathroomCloseEnough(card.bathrooms, wanted.bathrooms),
    },
    {
      label: '房型 + 卧室匹配，卫生间允许轻微浮动',
      filter: (card) => matchesExactRoomType(card, wanted.roomType)
        && Number.isFinite(card.bedrooms)
        && card.bedrooms === wanted.bedrooms
        && (bathroomCloseEnough(card.bathrooms, wanted.bathrooms, 0.5) || !Number.isFinite(card.bathrooms)),
    },
    {
      label: '房型 + 卧室匹配',
      filter: (card) => matchesExactRoomType(card, wanted.roomType)
        && Number.isFinite(card.bedrooms)
        && card.bedrooms === wanted.bedrooms,
    },
    {
      label: '仅房型匹配',
      filter: (card) => matchesExactRoomType(card, wanted.roomType),
    },
    {
      label: '仅卧室/卫生间接近',
      filter: (card) => (
        (!Number.isFinite(card.bedrooms) || Math.abs(card.bedrooms - wanted.bedrooms) <= 1)
        && (!Number.isFinite(card.bathrooms) || bathroomCloseEnough(card.bathrooms, wanted.bathrooms, 0.5))
      ),
    },
    {
      label: '使用当前页全部可用价格',
      filter: () => true,
    },
  );

  let bestNonEmpty = null;

  for (const level of matchLevels) {
    const cards = pricedCards.filter(level.filter);
    if (cards.length && !bestNonEmpty) {
      bestNonEmpty = { cards, matchLabel: level.label };
    }
    if (cards.length >= MIN_COMPARABLES_PER_STRATEGY) {
      return { cards, matchLabel: level.label };
    }
  }

  return bestNonEmpty || {
    cards: pricedCards,
    matchLabel: '使用当前页全部可用价格',
  };
}

function calcSeriesStats(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!filtered.length) {
    return null;
  }

  const sum = filtered.reduce((total, value) => total + value, 0);
  const middle = Math.floor(filtered.length / 2);
  const median = filtered.length % 2 === 0
    ? (filtered[middle - 1] + filtered[middle]) / 2
    : filtered[middle];

  return {
    count: filtered.length,
    min: filtered[0],
    max: filtered[filtered.length - 1],
    avg: sum / filtered.length,
    median,
  };
}

function roundCurrency(value) {
  return Math.round(value);
}

function summarizeDateResult(date, stayType, comparableCards, matchLabel) {
  const prices = comparableCards.map((card) => card.price);
  const stats = calcSeriesStats(prices);

  return {
    date,
    stayType,
    comparableCount: comparableCards.length,
    matchLabel,
    priceStats: stats,
    sampleListings: comparableCards.slice(0, 5).map((card) => ({
      href: card.href,
      price: card.price,
      priceBasis: card.priceBasis,
      bedrooms: card.bedrooms,
      bathrooms: card.bathrooms,
      roomType: card.roomType ? card.roomType.display : null,
      propertyType: card.propertyType ? card.propertyType.display : null,
      textSnippet: card.text ? String(card.text).slice(0, 800) : '',
    })),
  };
}

function flattenComparableStats(rows, stayType) {
  return rows
    .map((row) => row[stayType])
    .filter((section) => section && section.priceStats);
}

function buildOverallStats(rows, stayType, selector = 'median') {
  const values = flattenComparableStats(rows, stayType)
    .map((section) => section.priceStats[selector])
    .filter((value) => Number.isFinite(value));
  return calcSeriesStats(values);
}

function avgComparableCount(rows, stayType) {
  const counts = rows
    .map((row) => row[stayType] && row[stayType].comparableCount)
    .filter((value) => Number.isFinite(value));
  if (!counts.length) {
    return 0;
  }
  return counts.reduce((total, value) => total + value, 0) / counts.length;
}

function topDates(rows, stayType, metric, direction = 'desc', limit = 3) {
  const sorted = rows
    .map((row) => ({
      date: row.date,
      value: row[stayType] && row[stayType].priceStats ? row[stayType].priceStats[metric] : null,
    }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => direction === 'desc' ? right.value - left.value : left.value - right.value);

  return sorted.slice(0, limit);
}

function dayOfWeek(dateString) {
  const date = parseIsoDate(dateString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return date ? days[date.getUTCDay()] : '';
}

function buildRecommendations(rows, input) {
  const dailyOverall = buildOverallStats(rows, 'daily', 'median');
  const monthlyOverall = buildOverallStats(rows, 'monthly', 'median');
  const hotDates = topDates(rows, 'daily', 'median', 'desc');
  const softDates = topDates(rows, 'daily', 'median', 'asc');
  const monthlyHotDates = topDates(rows, 'monthly', 'median', 'desc', 2);
  const weekendRows = rows.filter((row) => ['Fri', 'Sat'].includes(dayOfWeek(row.date)));
  const weekdayRows = rows.filter((row) => !['Fri', 'Sat'].includes(dayOfWeek(row.date)));
  const weekendMedian = buildOverallStats(weekendRows, 'daily', 'median');
  const weekdayMedian = buildOverallStats(weekdayRows, 'daily', 'median');
  const weekendPremium = weekendMedian && weekdayMedian
    ? ((weekendMedian.avg - weekdayMedian.avg) / weekdayMedian.avg) * 100
    : null;
  const suggestions = [];

  if (dailyOverall) {
    suggestions.push(`日租基准价可以先围绕 C$${roundCurrency(dailyOverall.median)} 设置，属于当前可比房源的中位数水平。`);
  }

  if (weekendPremium && weekendPremium > 5) {
    suggestions.push(`周五到周六的日租中位数比工作日高约 ${weekendPremium.toFixed(0)}%，周末可以考虑加价 5% 到 12%。`);
  }

  if (hotDates.length) {
    suggestions.push(`高价日期集中在 ${hotDates.map((item) => `${item.date} (C$${roundCurrency(item.value)})`).join('、')}，这些日期更适合采用偏进攻的挂牌价。`);
  }

  if (softDates.length) {
    suggestions.push(`低价日期集中在 ${softDates.map((item) => `${item.date} (C$${roundCurrency(item.value)})`).join('、')}，这些日期更适合做折扣或最短入住限制放宽。`);
  }

  if (monthlyOverall) {
    suggestions.push(`月租的市场中位数大约在 C$${roundCurrency(monthlyOverall.median)} / ${input.monthlyStayLength} 晚，可以把月租打包价先定在这个区间附近，再按装修和位置微调。`);
  }

  if (monthlyHotDates.length) {
    suggestions.push(`月租强势起租日主要出现在 ${monthlyHotDates.map((item) => item.date).join('、')}，如果你支持长住，这些起租日值得优先开放。`);
  }

  const averageDailySamples = avgComparableCount(rows, 'daily');
  if (averageDailySamples < 4) {
    suggestions.push('当前每个日期抓到的可比样本偏少，建议在报告基础上再人工补看 1 到 2 页搜索结果，避免被个别异常价格带偏。');
  }

  return suggestions;
}

function roundToNearestFive(value) {
  return Math.round(value / 5) * 5;
}

function buildDailyPricingPlan(rows, input) {
  const dailyBaseline = buildOverallStats(rows, 'daily', 'median');
  if (!dailyBaseline) {
    return [];
  }

  return rows.map((row) => {
    const section = row.daily;
    const marketMedian = section && section.priceStats ? section.priceStats.median : null;
    const marketAvg = section && section.priceStats ? section.priceStats.avg : null;

    if (!Number.isFinite(marketMedian)) {
      return {
        date: row.date,
        marketMedian: null,
        marketAvg: null,
        suggestedListPrice: null,
        suggestedMinimumPrice: null,
        comparableCount: section ? section.comparableCount : 0,
        confidence: '低',
        note: '没有足够的日租样本',
      };
    }

    const ratio = marketMedian / dailyBaseline.median;
    let premium = 0.01;
    let note = '建议贴近市场中位数挂牌';

    if (ratio >= 1.08) {
      premium = 0.05;
      note = '高需求日期，建议积极挂牌';
    } else if (ratio >= 1.03) {
      premium = 0.03;
      note = '需求偏强，可小幅上调';
    } else if (ratio <= 0.92) {
      premium = -0.02;
      note = '偏弱日期，建议保守定价';
    } else if (ratio <= 0.97) {
      premium = 0;
      note = '略弱于均值，建议平价吸单';
    }

    const suggestedListPrice = roundToNearestFive(marketMedian * (1 + premium));
    const suggestedMinimumPrice = roundToNearestFive(Math.max(suggestedListPrice * 0.9, marketMedian * 0.88));
    let confidence = '中';

    if (section.comparableCount >= 8 && /物业类型/.test(section.matchLabel)) {
      confidence = '高';
    } else if (section.comparableCount < 5 || /使用当前页全部/.test(section.matchLabel)) {
      confidence = '低';
    }

    return {
      date: row.date,
      marketMedian,
      marketAvg,
      suggestedListPrice,
      suggestedMinimumPrice,
      comparableCount: section.comparableCount,
      confidence,
      note,
    };
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return `C$${roundCurrency(value).toLocaleString('en-CA')}`;
}

function renderStatCard(label, value) {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderChartSvg(rows, stayType, title, color) {
  const series = rows
    .map((row) => ({
      date: row.date,
      value: row[stayType] && row[stayType].priceStats ? row[stayType].priceStats.avg : null,
    }))
    .filter((item) => Number.isFinite(item.value));

  if (!series.length) {
    return `<div class="empty-chart">${escapeHtml(title)} 暂无可用数据</div>`;
  }

  const overallStats = calcSeriesStats(series.map((item) => item.value));
  const maxPoint = series.reduce((best, item) => (item.value > best.value ? item : best), series[0]);
  const minPoint = series.reduce((best, item) => (item.value < best.value ? item : best), series[0]);
  const width = 980;
  const height = 340;
  const padding = { top: 24, right: 24, bottom: 54, left: 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(minPoint.value, overallStats.avg, overallStats.median);
  const maxValue = Math.max(maxPoint.value, overallStats.avg, overallStats.median);
  const valueRange = Math.max(1, maxValue - minValue);
  const xStep = series.length === 1 ? 0 : chartWidth / (series.length - 1);
  const yForValue = (value) => padding.top + chartHeight - (((value - minValue) / valueRange) * chartHeight);
  const xForIndex = (index) => padding.left + (index * xStep);
  const points = series.map((item, index) => `${xForIndex(index)},${yForValue(item.value)}`).join(' ');
  const avgY = yForValue(overallStats.avg);
  const medianY = yForValue(overallStats.median);
  const pointCircles = series.map((item, index) => `
      <circle cx="${xForIndex(index)}" cy="${yForValue(item.value)}" r="4" fill="${color}" />
    `).join('');
  const labels = series.map((item, index) => {
    if (series.length > 12 && index % Math.ceil(series.length / 6) !== 0 && index !== series.length - 1) {
      return '';
    }
    return `
      <text x="${xForIndex(index)}" y="${height - 18}" text-anchor="middle" class="axis-label">${escapeHtml(item.date.slice(5))}</text>
    `;
  }).join('');

  return `
    <div class="chart-block">
      <div class="chart-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="chart-legend">
          <span><i style="background:${color}"></i> 日期均价</span>
          <span><i style="background:#ffb020"></i> 平均价</span>
          <span><i style="background:#7c3aed"></i> 中位数</span>
        </div>
      </div>
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="${escapeHtml(title)}">
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" class="axis" />
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="axis" />
        <line x1="${padding.left}" y1="${avgY}" x2="${width - padding.right}" y2="${avgY}" class="guide avg-line" />
        <line x1="${padding.left}" y1="${medianY}" x2="${width - padding.right}" y2="${medianY}" class="guide median-line" />
        <polyline fill="none" stroke="${color}" stroke-width="3" points="${points}" />
        ${pointCircles}
        ${labels}
        <text x="${padding.left + 8}" y="${avgY - 8}" class="guide-label">平均价 ${escapeHtml(formatMoney(overallStats.avg))}</text>
        <text x="${padding.left + 8}" y="${medianY - 8}" class="guide-label">中位数 ${escapeHtml(formatMoney(overallStats.median))}</text>
        <text x="${padding.left + 8}" y="${yForValue(maxPoint.value) - 10}" class="point-label">最高 ${escapeHtml(maxPoint.date)} ${escapeHtml(formatMoney(maxPoint.value))}</text>
        <text x="${padding.left + 8}" y="${yForValue(minPoint.value) + 18}" class="point-label">最低 ${escapeHtml(minPoint.date)} ${escapeHtml(formatMoney(minPoint.value))}</text>
      </svg>
    </div>
  `;
}

function renderTableRows(rows) {
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(formatMoney(row.daily && row.daily.priceStats ? row.daily.priceStats.avg : null))}</td>
      <td>${escapeHtml(formatMoney(row.daily && row.daily.priceStats ? row.daily.priceStats.median : null))}</td>
      <td>${escapeHtml(formatMoney(row.monthly && row.monthly.priceStats ? row.monthly.priceStats.avg : null))}</td>
      <td>${escapeHtml(formatMoney(row.monthly && row.monthly.priceStats ? row.monthly.priceStats.median : null))}</td>
      <td>${escapeHtml(String(row.daily ? row.daily.comparableCount : 0))}</td>
      <td>${escapeHtml(String(row.monthly ? row.monthly.comparableCount : 0))}</td>
    </tr>
  `).join('');
}

function renderPricingPlanRows(rows) {
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(formatMoney(row.marketMedian))}</td>
      <td>${escapeHtml(formatMoney(row.suggestedListPrice))}</td>
      <td>${escapeHtml(formatMoney(row.suggestedMinimumPrice))}</td>
      <td>${escapeHtml(String(row.comparableCount))}</td>
      <td>${escapeHtml(row.confidence)}</td>
      <td>${escapeHtml(row.note)}</td>
    </tr>
  `).join('');
}

function buildHtmlReport(report) {
  const dailyOverall = buildOverallStats(report.rows, 'daily', 'median');
  const monthlyOverall = buildOverallStats(report.rows, 'monthly', 'median');
  const generatedAt = new Date().toLocaleString('zh-CN', { timeZone: report.config.timezone });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Airbnb 市场调研报告</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fc;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --line: #dbe2f0;
      --accent: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 32px 20px 56px;
    }
    .hero, .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
    }
    h1, h2, h3 { margin: 0 0 12px; }
    .meta, .input-grid, .stats-grid {
      display: grid;
      gap: 12px;
    }
    .input-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .meta {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      margin-top: 16px;
    }
    .label, .stat-label, .subtle {
      color: var(--muted);
      font-size: 13px;
    }
    .value, .stat-value {
      font-size: 20px;
      font-weight: 700;
    }
    .stat-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px 16px;
      background: #fbfdff;
    }
    .recommendations li {
      margin-bottom: 8px;
    }
    .chart-block {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: #fcfdff;
      margin-top: 16px;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .chart-legend {
      display: flex;
      gap: 14px;
      color: var(--muted);
      font-size: 13px;
      flex-wrap: wrap;
    }
    .chart-legend i {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      margin-right: 6px;
      vertical-align: -1px;
    }
    .chart-svg {
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .axis {
      stroke: #94a3b8;
      stroke-width: 1;
    }
    .guide {
      stroke-width: 1.5;
      stroke-dasharray: 6 6;
    }
    .avg-line { stroke: #ffb020; }
    .median-line { stroke: #7c3aed; }
    .axis-label, .guide-label, .point-label {
      font-size: 12px;
      fill: #475569;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
    }
    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
    }
    th {
      background: #f8fafc;
    }
    .empty-chart {
      border: 1px dashed var(--line);
      border-radius: 16px;
      padding: 24px;
      color: var(--muted);
      margin-top: 16px;
    }
    code {
      background: #eff6ff;
      border-radius: 8px;
      padding: 2px 6px;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Airbnb 周边房价调研报告</h1>
      <p class="subtle">生成时间：${escapeHtml(generatedAt)}</p>
      <div class="input-grid">
        <div><div class="label">调研日期范围</div><div class="value">${escapeHtml(report.input.startDate)} 到 ${escapeHtml(report.input.endDate)}</div></div>
        <div><div class="label">房源地址</div><div class="value">${escapeHtml(report.input.address)}</div></div>
        <div><div class="label">物业类型 / 房型</div><div class="value">${escapeHtml(report.input.propertyType ? `${report.input.propertyType.display} / ${report.input.roomType.display}` : report.input.roomType.display)}</div></div>
        <div><div class="label">卧室 / 卫生间</div><div class="value">${escapeHtml(String(report.input.bedrooms))} / ${escapeHtml(String(report.input.bathrooms))}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>关键统计</h2>
      <div class="stats-grid">
        ${renderStatCard('日租最高中位数', dailyOverall ? formatMoney(dailyOverall.max) : 'N/A')}
        ${renderStatCard('日租最低中位数', dailyOverall ? formatMoney(dailyOverall.min) : 'N/A')}
        ${renderStatCard('日租平均中位数', dailyOverall ? formatMoney(dailyOverall.avg) : 'N/A')}
        ${renderStatCard('日租总体中位数', dailyOverall ? formatMoney(dailyOverall.median) : 'N/A')}
        ${renderStatCard('月租最高中位数', monthlyOverall ? formatMoney(monthlyOverall.max) : 'N/A')}
        ${renderStatCard('月租最低中位数', monthlyOverall ? formatMoney(monthlyOverall.min) : 'N/A')}
        ${renderStatCard('月租平均中位数', monthlyOverall ? formatMoney(monthlyOverall.avg) : 'N/A')}
        ${renderStatCard('月租总体中位数', monthlyOverall ? formatMoney(monthlyOverall.median) : 'N/A')}
      </div>
      <div class="meta" style="margin-top:16px;">
        <div><div class="label">日租平均样本数</div><div class="value">${escapeHtml(avgComparableCount(report.rows, 'daily').toFixed(1))}</div></div>
        <div><div class="label">月租平均样本数</div><div class="value">${escapeHtml(avgComparableCount(report.rows, 'monthly').toFixed(1))}</div></div>
        <div><div class="label">长租统计窗口</div><div class="value">${escapeHtml(String(report.input.monthlyStayLength))} 晚</div></div>
        <div><div class="label">每日期最多抓取</div><div class="value">${escapeHtml(String(report.input.maxResultsPerDate))} 个房源</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>价格图</h2>
      ${renderChartSvg(report.rows, 'daily', '日租日期均价图', '#2563eb')}
      ${renderChartSvg(report.rows, 'monthly', '月租日期均价图', '#059669')}
    </section>

    <section class="panel">
      <h2>建议</h2>
      <ul class="recommendations">
        ${report.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>每天建议挂牌价表</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>市场中位数</th>
            <th>建议挂牌价</th>
            <th>建议底价</th>
            <th>样本数</th>
            <th>置信度</th>
            <th>策略说明</th>
          </tr>
        </thead>
        <tbody>
          ${renderPricingPlanRows(report.dailyPricingPlan)}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>每日明细</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>日租均价</th>
            <th>日租中位数</th>
            <th>月租均价</th>
            <th>月租中位数</th>
            <th>日租样本数</th>
            <th>月租样本数</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(report.rows)}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>说明</h2>
      <ul>
        <li>报告基于 Airbnb 当前搜索结果页的公开展示价格抓取，日租优先采用每晚价格，月租优先采用月租或总价。</li>
        <li>如果搜索结果里没有足够的精确匹配房源，系统会逐级放宽匹配条件，并在 JSON 明细里保留匹配策略。</li>
        <li>当你提供了物业类型时，系统会优先尝试用公寓/联排/独立屋等类型做匹配，再回退到更宽松的同类房源比较。</li>
        <li>原始明细 JSON 会和本 HTML 报告一起保存，方便后续继续分析或接入别的系统。</li>
      </ul>
      <p class="subtle">原始 JSON：<code>${escapeHtml(report.output.jsonPath)}</code></p>
    </section>
  </main>
</body>
</html>`;
}

function buildOutputPaths(input) {
  const timestampLabel = new Date().toISOString().replace(/[:]/g, '-');
  const slug = slugify(`${input.address}-${input.roomType.display}-${input.bedrooms}bed-${input.bathrooms}bath`);
  const baseName = `${timestampLabel}-${slug}`;
  ensureDir(input.reportDir);
  return {
    htmlPath: path.join(input.reportDir, `${baseName}.html`),
    jsonPath: path.join(input.reportDir, `${baseName}.json`),
  };
}

async function runSingleSearch(page, config, input, date, stayType) {
  const checkIn = date;
  const checkOut = formatIsoDate(addDays(parseIsoDate(date), stayType === 'daily' ? 1 : input.monthlyStayLength));

  await navigateToSearch(page, config, {
    address: input.address,
    checkIn,
    checkOut,
    adults: input.adults,
  });

  const rawCards = await scrapeRawCards(page, input.maxResultsPerDate);
  if (!rawCards.length) {
    await dumpPageDiagnostics(page, `airbnb-market-research-no-cards-${stayType}`);
    await takeScreenshot(page, `airbnb-market-research-no-cards-${stayType}`);
  }

  const parsedCards = rawCards.map((card) => parseCard(card, stayType, input.monthlyStayLength));
  const selected = selectComparables(parsedCards, input);
  return summarizeDateResult(date, stayType, selected.cards.slice(0, input.maxResultsPerDate), selected.matchLabel);
}

async function runResearch(page, config, input) {
  const dates = enumerateDates(input.startDate, input.endDate);
  const rows = [];

  for (const date of dates) {
    log(`Researching ${date}`);
    const daily = await runSingleSearch(page, config, input, date, 'daily');
    await pause(1200);
    const monthly = await runSingleSearch(page, config, input, date, 'monthly');
    rows.push({ date, daily, monthly });
    await pause(1200);
  }

  return rows;
}

async function runSetup(page, context, storageStatePath) {
  await page.goto('https://www.airbnb.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  log('If Airbnb asks you to sign in, complete it in the opened browser window.');
  await promptEnter('登录完成后，按回车保存 Airbnb 登录态。');
  await saveStorageState(context, storageStatePath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const rawConfig = loadConfig();
  const config = {
    ...rawConfig,
    browser: args.browser ?? rawConfig.browser,
    reportDir: args.reportDir ? path.resolve(args.reportDir) : rawConfig.reportDir,
    storageStatePath: rawConfig.storageStatePath || DEFAULT_STORAGE_STATE_PATH,
  };
  const shouldRunHeadless = args.headless && !args.headed && !args.setup;
  const browser = await launchBrowser(config.browser, shouldRunHeadless);
  const context = await openContext(browser, config, !args.setup);
  const page = await getPage(context);

  try {
    if (args.setup) {
      await runSetup(page, context, config.storageStatePath);
      return;
    }

    const input = await collectResearchInput(args, config);
    validateResearchInput(input);
    const rows = await runResearch(page, config, input);
    const output = buildOutputPaths(input);
    const report = {
      generatedAt: new Date().toISOString(),
      config,
      input,
      rows,
      recommendations: buildRecommendations(rows, input),
      dailyPricingPlan: buildDailyPricingPlan(rows, input),
      output,
    };
    const html = buildHtmlReport(report);

    fs.writeFileSync(output.jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(output.htmlPath, html, 'utf8');

    log(`Saved JSON report: ${output.jsonPath}`);
    log(`Saved HTML report: ${output.htmlPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  fail(error.stack || error.message);
});
