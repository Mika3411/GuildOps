import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 390, height: 844 };

async function readCss(entryFile, seen = new Set()) {
  const absolutePath = path.resolve(ROOT_DIR, entryFile);
  if (seen.has(absolutePath)) return "";
  seen.add(absolutePath);

  const css = await readFile(absolutePath, "utf8");
  const directory = path.dirname(absolutePath);
  const importPattern = /@import\s+["'](.+?)["'];/g;
  let output = "";
  let cursor = 0;
  let match;

  while ((match = importPattern.exec(css))) {
    output += css.slice(cursor, match.index);
    const importPath = path.relative(ROOT_DIR, path.resolve(directory, match[1])).replace(/\\/g, "/");
    output += await readCss(importPath, seen);
    cursor = importPattern.lastIndex;
  }

  output += css.slice(cursor);
  return output;
}

function renderFixture(css) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Onboarding mobile fixture</title>
    <style>${css}</style>
  </head>
  <body>
    <main class="auth-shell guild-onboarding-shell">
      <section class="auth-panel guild-onboarding-panel">
        <div class="brand-lockup auth-brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <span>GuildOps</span>
        </div>
        <div class="onboarding-copy">
          <span class="status-pill live">Prêt à démarrer</span>
          <h1>Créer le profil de guilde</h1>
          <p>Audit Mobile Codex Ultra Long Pseudo De Commandant, commence par une guilde privée. Le site public reste optionnel et peut être préparé plus tard depuis les modules.</p>
          <div class="onboarding-steps" aria-label="Étapes de démarrage">
            <span>Profil</span>
            <span>Modules</span>
            <span>Site optionnel</span>
            <span>Opérations</span>
          </div>
        </div>
        <form class="auth-form guild-create-form">
          <label class="form-row">
            <span>Nom de guilde</span>
            <input value="Les Veilleurs Du Nord Avec Un Nom Beaucoup Trop Long" required />
          </label>
          <label class="form-row">
            <span>Tag</span>
            <input value="AEGIS-LONG" maxlength="12" />
          </label>
          <label class="form-row">
            <span>Jeu</span>
            <select><option selected>Whiteout Survival</option></select>
          </label>
          <label class="form-row">
            <span>Royaume</span>
            <input value="S999999999" />
          </label>
          <label class="form-row wide">
            <span>Brief</span>
            <textarea>Objectif KvK, NAP, consignes, rassemblements et longues instructions de coordination qui doivent revenir à la ligne sans pousser la page horizontalement.</textarea>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" checked />
            <span>
              Préparer aussi un site public brouillon
              <small>Laisse décoché pour créer seulement la guilde privée.</small>
            </span>
          </label>
          <p class="auth-error" aria-live="polite">Erreur de validation très longue : impossible de créer cette guilde parce que le serveur a renvoyé un message très détaillé avec un identifiant ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890.</p>
          <button class="primary-action" type="submit" disabled aria-busy="true">Création...</button>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

const css = await readCss("src/styles.css");
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.setContent(renderFixture(css), { waitUntil: "load" });

  const topMetrics = await page.evaluate(() => {
    const offenders = [...document.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: String(element.className || ""),
          right: rect.right,
          tag: element.tagName,
          text: (element.textContent || "").trim().slice(0, 80),
          x: rect.x
        };
      })
      .filter((item) => item.x < -0.5 || item.right > window.innerWidth + 0.5);

    return {
      offenders,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  assert.equal(topMetrics.overflowX, false, `Onboarding overflowX: ${JSON.stringify(topMetrics)}`);
  assert.deepEqual(topMetrics.offenders, [], `Elements outside viewport: ${JSON.stringify(topMetrics.offenders)}`);

  await page.locator(".guild-create-form .primary-action").scrollIntoViewIfNeeded();

  const bottomMetrics = await page.evaluate(() => {
    const cta = document.querySelector(".guild-create-form .primary-action")?.getBoundingClientRect();
    const error = document.querySelector(".guild-create-form .auth-error")?.getBoundingClientRect();

    return {
      cta: cta && {
        bottom: cta.bottom,
        height: cta.height,
        right: cta.right,
        width: cta.width,
        x: cta.x,
        y: cta.y
      },
      error: error && {
        bottom: error.bottom,
        right: error.right,
        width: error.width,
        x: error.x,
        y: error.y
      },
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });

  assert.equal(bottomMetrics.overflowX, false, `Onboarding overflowX after CTA scroll: ${JSON.stringify(bottomMetrics)}`);
  assert.ok(bottomMetrics.cta, "CTA not found");
  assert.ok(bottomMetrics.cta.width >= 44, `CTA too narrow: ${JSON.stringify(bottomMetrics.cta)}`);
  assert.ok(bottomMetrics.cta.height >= 44, `CTA too short: ${JSON.stringify(bottomMetrics.cta)}`);
  assert.ok(bottomMetrics.cta.x >= -0.5, `CTA shifted left: ${JSON.stringify(bottomMetrics.cta)}`);
  assert.ok(bottomMetrics.cta.right <= bottomMetrics.viewportWidth + 0.5, `CTA shifted right: ${JSON.stringify(bottomMetrics.cta)}`);
  assert.ok(bottomMetrics.cta.bottom <= bottomMetrics.viewportHeight + 0.5, `CTA not reachable in viewport: ${JSON.stringify(bottomMetrics.cta)}`);
  assert.ok(bottomMetrics.error.x >= -0.5, `Error shifted left: ${JSON.stringify(bottomMetrics.error)}`);
  assert.ok(bottomMetrics.error.right <= bottomMetrics.viewportWidth + 0.5, `Error shifted right: ${JSON.stringify(bottomMetrics.error)}`);

  console.log("Onboarding mobile layout check passed at 390x844.");
} finally {
  await browser.close();
}
