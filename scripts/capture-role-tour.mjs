/** Capture the public pages and every visible full-menu screen for each demo role.
 * Run `npm run dev:demo -- --host 127.0.0.1`, then `npm run screenshots:roles`.
 * Uses the installed Microsoft Edge; no API, credentials, or target contact needed.
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const baseUrl = process.env.AIVERA_SCREENSHOT_URL ?? "http://127.0.0.1:5173";
const edgePath = process.env.AIVERA_EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const output = resolve("docs/screenshots/role-tour-2026-11-16");
const roles = [
  ["administrator", "Administrator", "admin@aivera.local"],
  ["assessor", "Security Tester", "assessor@aivera.local"],
  ["website-owner", "Website Owner", "developer@aivera.local"],
];
const publicPages = [
  ["Landing page", "/", "public-01-landing-page.png"],
  ["Sign in", "/login", "public-02-sign-in.png"],
  ["Create account", "/signup", "public-03-create-account.png"],
];

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function capture(page, item) {
  await page.goto(new URL(item.route, baseUrl).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (item.role !== "Public") {
    await page.locator("#main h1").first().waitFor({ timeout: 15000 });
    const body = await page.locator("#main").innerText();
    if (/something went wrong|unexpected error|page not found/i.test(body)) {
      throw new Error(`${item.role} ${item.route} rendered an error page`);
    }
  }
  const file = join(output, item.file);
  await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
  return { ...item, sha256: await sha256(file) };
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const manifest = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("aegis-ui", JSON.stringify({
      state: { sidebarCollapsed: false, tutorialsEnabled: false, seenTours: [], showDemoNotices: true, simpleMode: false },
      version: 3,
    }));
  });
  const page = await context.newPage();
  for (const [label, route, file] of publicPages) {
    const item = await capture(page, { role: "Public", label, route, file });
    manifest.push(item);
    process.stdout.write(`${item.file}\n`);
  }
  for (const [id, role, email] of roles) {
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(email.replace(".", "\\.")) }).click();
    await page.locator('nav[aria-label="Main navigation"] a').first().waitFor();
    const links = await page.locator('nav[aria-label="Main navigation"] a').evaluateAll((anchors) => anchors.map((a) => ({
      label: a.textContent?.trim().replace(/\s+/g, " ") ?? "",
      route: new URL(a.href).pathname,
    })));
    if (links.length < 10) throw new Error(`${role} has only ${links.length} menu links`);
    for (const [index, link] of links.entries()) {
      const item = await capture(page, {
        role,
        label: link.label,
        route: link.route,
        file: `${id}-${String(index + 1).padStart(2, "0")}-${slug(link.label)}.png`,
      });
      manifest.push(item);
      process.stdout.write(`${item.file}\n`);
    }
    // Switching roles through the account chooser records the actual demo persona.
  }
  await writeFile(join(output, "manifest.json"), JSON.stringify({
    capturedOn: "2026-11-16",
    mode: "browser demo, synthetic data",
    viewport: "1440x900",
    images: manifest,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}
