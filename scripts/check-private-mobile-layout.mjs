import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 390, height: 844 };
const TOUCH_TARGET_MIN = 44;
const ROUTES = [
  "/app/modules",
  "/app/member",
  "/app/messages",
  "/app/absences",
  "/app/shop",
  "/app/admin",
  "/app/settings",
];

const USER = Object.freeze({
  id: "user-audit",
  email: "audit.mobile@guildops.test",
  displayName: "Audit Mobile",
  initials: "AM",
  role: "admin",
  roles: ["admin"],
  permissionKeys: [
    "admin_all",
    "approve_members",
    "manage_bank",
    "manage_diplomacy",
    "manage_events",
    "manage_members",
    "manage_roles",
    "manage_site",
    "moderate_forum",
    "send_sos",
  ],
  preferredLanguage: "fr",
});

const GUILD = Object.freeze({
  id: "guild-audit",
  name: "Audit Mobile",
  game: "Whiteout Survival",
  realm: "S999",
  slug: "audit-mobile",
  publicSlug: "audit-mobile",
  role: "owner",
  organizationRole: "owner",
});

const ORGANIZATION = Object.freeze({
  id: "org-audit",
  name: "Audit GuildOps",
});

const AUTH_PAYLOAD = Object.freeze({
  csrfToken: "audit-csrf",
  user: USER,
  context: {
    activeGuild: GUILD,
    activeGuildId: GUILD.id,
    activeOrganization: ORGANIZATION,
    activeOrganizationId: ORGANIZATION.id,
  },
  guilds: [GUILD],
  organizations: [ORGANIZATION],
});

const BOOTSTRAP_PAYLOAD = Object.freeze({
  authUser: USER,
  context: AUTH_PAYLOAD.context,
  guilds: [GUILD],
  organizations: [ORGANIZATION],
  enabledModules: [
    "site",
    "administration",
    "shop",
    "membership_requests",
    "member_space",
    "absences",
    "wars_events",
    "sos_attack",
    "bank",
    "diplomacy",
    "forum",
    "messages",
    "translation",
    "multi_guilds",
  ],
  members: [
    {
      id: "member-audit",
      userId: USER.id,
      name: "Audit Mobile",
      displayName: "Audit Mobile",
      email: USER.email,
      role: "admin",
      roles: ["admin"],
      permissionKeys: USER.permissionKeys,
      allianceWar: "Confirme",
      status: "active",
      power: 125000000,
    },
    {
      id: "member-rally",
      userId: "user-rally",
      name: "Capitaine Rallye",
      displayName: "Capitaine Rallye",
      email: "rallye@guildops.test",
      role: "officier",
      roles: ["officier"],
      allianceWar: "Confirme",
      status: "active",
      power: 98000000,
    },
  ],
  events: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "SvS preparation",
      type: "war",
      status: "scheduled",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      allianceWar: "Confirme",
    },
  ],
  eventSummary: {
    nextEvent: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "SvS preparation",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
    },
    attendanceRate: {
      activeMembers: 2,
      confirmed: 2,
      expected: 2,
      rate: 1,
    },
    expectedMembers: [
      { id: "member-audit", name: "Audit Mobile" },
      { id: "member-rally", name: "Capitaine Rallye" },
    ],
    weeklyObjectives: {
      total: 1,
      done: 0,
      objectives: [
        {
          id: "objective-audit",
          title: "Verifier mobile",
          status: "active",
        },
      ],
    },
  },
  diplomacyRows: [],
  napAgreements: [],
  coordinates: [],
  diplomacyAuditLog: [],
  bankResources: [],
  bankRequests: [],
  bankMovements: [],
  bankHistory: [],
  duplicateSuggestions: [],
  permissionRoles: [],
  forumThreads: [],
  publicChat: [],
  internalMessages: [
    {
      id: "message-audit",
      from: "GuildOps",
      channel: "general",
      text: "Controle mobile automatise pret.",
      createdAt: new Date().toISOString(),
      unread: 0,
    },
  ],
  sosAlerts: [],
  sosForm: {
    target: "",
    x: "",
    y: "",
    type: "Rallye",
    details: "",
  },
  site: {
    published: true,
    url: "https://audit-mobile.guildops.test",
    name: "Audit Mobile",
    guildName: "Audit Mobile",
    game: "Whiteout Survival",
    realm: "S999",
    tagline: "Controle mobile connecte",
    goal: "Verifier les routes privees sur mobile.",
    objective: "Verifier les routes privees sur mobile.",
    objectiveTag: "Audit",
    theme: "camp-nord",
    colors: {
      id: "cyan",
      accent: "#45d8f0",
      highlight: "#c8ff08",
      contrast: "#061015",
    },
    typography: {
      id: "inter",
      label: "Inter",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    },
    sections: {
      roster: true,
      membership: true,
      wars: true,
      bank: true,
      diplomacy: true,
      forum: true,
      publicChat: true,
    },
  },
});

const MOCK_CONVERSATIONS = Object.freeze([
  {
    id: "internal:general",
    type: "internal",
    channel: "general",
    title: "Guilde",
    preview: "Controle mobile automatise pret.",
    author: "GuildOps",
    unreadCount: 0,
    lastMessageAt: new Date().toISOString(),
  },
]);

const MOCK_MESSAGES = Object.freeze([
  {
    id: "private-message-audit",
    author: "GuildOps",
    text: "Controle mobile automatise pret.",
    original: { text: "Controle mobile automatise pret.", language: "fr" },
    translated: { text: "Controle mobile automatise pret.", language: "fr", status: "original" },
    createdAt: new Date().toISOString(),
    conversationType: "internal",
    channel: "general",
    isOwn: false,
    read: true,
  },
]);

async function main() {
  const apiServer = await createMockApiServer();
  process.env.VITE_API_URL = apiServer.url;
  process.env.VITE_REALTIME_MODE = "polling";

  const viteServer = await createViteServer({
    root: ROOT_DIR,
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "error",
  });

  await viteServer.listen();
  const appUrl = getViteLocalUrl(viteServer);
  const browser = await chromium.launch();
  const failures = [];
  const summaries = [];

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage({ viewport: VIEWPORT });
      try {
        const result = await checkRoute(page, `${appUrl}${route}`, route);
        summaries.push(result);
      } catch (error) {
        failures.push(`${route}: ${error?.message || String(error)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await viteServer.close();
    await apiServer.close();
  }

  if (failures.length) {
    console.error(`Private mobile layout check failed (${failures.length} route(s)).`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  summaries.forEach((summary) => {
    console.log(
      `${summary.route}: ok | targets=${summary.touchTargets} | scrollWidth=${summary.scrollWidth}/${summary.viewportWidth} | headings=${summary.headingCount}`,
    );
  });
  console.log("Private mobile layout check passed at 390x844.");
}

async function checkRoute(page, url, route) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error?.message || String(error)));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell .workspace").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(350);

  const topMetrics = await page.evaluate(collectMobileMetrics, { minTarget: TOUCH_TARGET_MIN });
  assertNoFailures("initial viewport", topMetrics, { allowBottomOverlap: true });

  await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    workspace?.scrollTo({ top: workspace.scrollHeight, left: 0, behavior: "instant" });
    window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "instant" });
  });
  await page.waitForTimeout(150);

  const bottomMetrics = await page.evaluate(collectMobileMetrics, { minTarget: TOUCH_TARGET_MIN });
  assertNoFailures("bottom viewport", bottomMetrics, { allowBottomOverlap: false });

  const relevantErrors = pageErrors.filter((message) => !/ResizeObserver loop|EventSource/i.test(message));
  assert.deepEqual(relevantErrors, [], `page errors: ${JSON.stringify(relevantErrors)}`);

  return {
    route,
    headingCount: topMetrics.visibleHeadings.length,
    scrollWidth: Math.max(topMetrics.documentScrollWidth, bottomMetrics.documentScrollWidth),
    touchTargets: topMetrics.touchTargetCount,
    viewportWidth: topMetrics.viewportWidth,
  };
}

function assertNoFailures(label, metrics, { allowBottomOverlap }) {
  assert.equal(metrics.hasHorizontalOverflow, false, `${label}: horizontal overflow ${JSON.stringify(metrics.overflow)}`);
  assert.deepEqual(metrics.overflow.offenders, [], `${label}: elements outside viewport ${JSON.stringify(metrics.overflow.offenders)}`);
  assert.deepEqual(metrics.smallTouchTargets, [], `${label}: touch targets below ${TOUCH_TARGET_MIN}px ${JSON.stringify(metrics.smallTouchTargets)}`);
  assert.deepEqual(metrics.duplicateHeadings, [], `${label}: duplicate visible titles ${JSON.stringify(metrics.duplicateHeadings)}`);

  if (!allowBottomOverlap) {
    assert.deepEqual(
      metrics.bottomNavOverlap,
      [],
      `${label}: content hidden by bottom nav ${JSON.stringify(metrics.bottomNavOverlap)}`,
    );
  }
}

function collectMobileMetrics({ minTarget }) {
  const viewportWidth = window.innerWidth;
  const documentScrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
  const workspace = document.querySelector(".workspace");
  const workspaceScrollWidth = workspace ? workspace.scrollWidth : 0;
  const bottomNav = document.querySelector(".mobile-bottom-nav");
  const bottomNavRect = bottomNav?.getBoundingClientRect();
  const bottomNavTop = bottomNavRect?.top ?? window.innerHeight;
  const interactiveElements = getVisibleInteractiveElements();
  const seenHeadings = new Map();
  const visibleHeadings = getVisibleHeadings();

  visibleHeadings.forEach((heading) => {
    const key = normalizeText(heading.text);
    if (!key) return;
    const items = seenHeadings.get(key) || [];
    items.push(heading);
    seenHeadings.set(key, items);
  });

  const overflowOffenders = [...document.querySelectorAll("body *")]
    .filter((element) => isVisible(element) && !isIgnoredForViewportAudit(element))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const outsideViewport = rect.left < -0.5 || rect.right > viewportWidth + 0.5;
      return outsideViewport && !isInsideHorizontalScroller(element, viewportWidth);
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: getSelectorLabel(element),
        text: getElementText(element),
        left: round(rect.left),
        right: round(rect.right),
        width: round(rect.width),
      };
    })
    .slice(0, 12);

  const smallTouchTargets = interactiveElements
    .map((element) => {
      const rect = getEffectiveTouchRect(element);
      return {
        selector: getSelectorLabel(element),
        text: getElementText(element),
        width: round(rect.width),
        height: round(rect.height),
      };
    })
    .filter((item) => item.width < minTarget || item.height < minTarget)
    .slice(0, 16);

  const bottomNavOverlapElements = [...new Set([...interactiveElements, ...getVisibleContentLeafElements()])];
  const bottomNavOverlap = bottomNavOverlapElements
    .filter((element) => workspace?.contains(element) && !bottomNav?.contains(element))
    .map((element) => {
      const rect = getEffectiveTouchRect(element);
      return {
        selector: getSelectorLabel(element),
        text: getElementText(element),
        top: round(rect.top),
        bottom: round(rect.bottom),
      };
    })
    .filter((item) => item.bottom > bottomNavTop - 4 && item.top < window.innerHeight)
    .slice(0, 12);

  const duplicateHeadings = [...seenHeadings.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([text, items]) => ({
      text,
      matches: items.map((item) => ({
        selector: item.selector,
        top: item.top,
      })),
    }));

  return {
    bottomNavOverlap,
    documentScrollWidth,
    duplicateHeadings,
    hasHorizontalOverflow: documentScrollWidth > viewportWidth + 1 || workspaceScrollWidth > viewportWidth + 1,
    overflow: {
      offenders: overflowOffenders,
      documentScrollWidth,
      viewportWidth,
      workspaceScrollWidth,
    },
    smallTouchTargets,
    touchTargetCount: interactiveElements.length,
    viewportWidth,
    visibleHeadings,
  };

  function getVisibleInteractiveElements() {
    return [
      ...document.querySelectorAll(
        [
          "a[href]",
          "button",
          "input:not([type='hidden'])",
          "select",
          "textarea",
          "summary",
          "[role='button']",
          "[role='tab']",
          "[role='switch']",
          "[role='menuitem']",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      ),
    ].filter((element) => {
      if (!isVisible(element) || isDisabled(element) || isIgnoredForViewportAudit(element)) return false;
      const rect = getEffectiveTouchRect(element);
      return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    });
  }

  function getVisibleHeadings() {
    const candidates = [...document.querySelectorAll("h1, .module-hero-title")]
      .filter((element, index, list) => list.indexOf(element) === index)
      .filter((element) => isVisible(element) && !isIgnoredForViewportAudit(element));

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: getSelectorLabel(element),
          text: normalizeText(element.textContent || ""),
          top: round(rect.top),
        };
      })
      .filter((item) => item.text);
  }

  function getVisibleContentLeafElements() {
    return [...document.querySelectorAll(".workspace :is(h1, h2, h3, p, small, strong, span, em, img)")]
      .filter((element) => isVisible(element) && !isIgnoredForViewportAudit(element))
      .filter((element) => {
        if (bottomNav?.contains(element)) return false;
        if (!normalizeText(element.textContent || "") && !element.matches("img")) return false;
        const visibleChildren = [...element.children].filter((child) => isVisible(child));
        return visibleChildren.length === 0;
      });
  }

  function getEffectiveTouchRect(element) {
    const ownRect = element.getBoundingClientRect();
    if (element.matches("input[type='checkbox'], input[type='radio']")) {
      const label = element.closest("label");
      if (label && isVisible(label)) {
        return label.getBoundingClientRect();
      }
    }
    return ownRect;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      element.hidden ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return Boolean(element.disabled || element.getAttribute("aria-disabled") === "true");
  }

  function isIgnoredForViewportAudit(element) {
    return Boolean(
      element.closest("[hidden], [inert], [aria-hidden='true'], .mobile-more-scrim:not(.is-open), .mobile-more-drawer:not(.is-open)"),
    );
  }

  function isInsideHorizontalScroller(element, viewportWidthValue) {
    if (!element) return false;
    let current = element.parentElement;

    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const scrollable = ["auto", "scroll"].includes(style.overflowX) && current.scrollWidth > current.clientWidth + 1;
      const rect = current.getBoundingClientRect();

      if (scrollable && rect.left >= -0.5 && rect.right <= viewportWidthValue + 0.5) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function getSelectorLabel(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = String(element.className || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((name) => `.${name}`)
      .join("");
    return `${tag}${id}${classes}`;
  }

  function getElementText(element) {
    const label =
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.textContent ||
      "";
    return normalizeText(label).slice(0, 80);
  }

  function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function round(value) {
    return Math.round(Number(value) * 10) / 10;
  }
}

function createMockApiServer() {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin || "*";
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "content-type, x-csrf-token, authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = url.pathname.replace(/^\/api\/v1/, "");

    if (pathname.endsWith("/stream")) {
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write("event: connected\n");
      response.write('data: {"unreadCount":0}\n\n');
      return;
    }

    sendJson(response, getMockPayload(pathname, request.method || "GET"));
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

function getMockPayload(pathname, method) {
  if (method === "GET" && pathname === "/me") return AUTH_PAYLOAD;
  if (method === "GET" && pathname === "/mvp/bootstrap") return BOOTSTRAP_PAYLOAD;
  if (method === "GET" && /^\/guilds\/[^/]+\/notifications$/.test(pathname)) return { notifications: [], unreadCount: 0 };
  if (method === "GET" && pathname === "/notifications/push-public-key") return { configured: false, publicKey: null };
  if (method === "GET" && /^\/guilds\/[^/]+\/events\/summary\/quick$/.test(pathname)) {
    return { summary: BOOTSTRAP_PAYLOAD.eventSummary };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/conversations$/.test(pathname)) {
    return { conversations: MOCK_CONVERSATIONS };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/message-recipients$/.test(pathname)) {
    return { recipients: BOOTSTRAP_PAYLOAD.members };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/messages\/unread-count$/.test(pathname)) {
    return { unreadCount: 0 };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/messages$/.test(pathname)) {
    return { messages: MOCK_MESSAGES, nextCursor: null };
  }
  if (method === "POST" && /^\/guilds\/[^/]+\/messages\/read$/.test(pathname)) {
    return { unreadCount: 0 };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/forum$/.test(pathname)) {
    return { categories: [], threads: [], posts: [] };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/bank$/.test(pathname)) {
    return { resources: [], requests: [], movements: [], history: [] };
  }
  if (method === "GET" && /^\/guilds\/[^/]+\/diplomacy$/.test(pathname)) {
    return { relations: [], napAgreements: [], coordinates: [], auditLog: [] };
  }
  return {};
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function getViteLocalUrl(viteServer) {
  const url = viteServer.resolvedUrls?.local?.[0];
  if (!url) throw new Error("Vite did not expose a local URL.");
  return url.replace(/\/$/, "");
}

await main();
