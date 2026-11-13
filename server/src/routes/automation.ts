/**
 * Signed-in scans: the stored test-account session. Runs that use it still go through
 * startAutomatedScan / assertAutomatedRunAllowed in security.ts, so they obey the same scope,
 * allowlist and review rules as any other scan.
 */
import { Router } from "express";
import { z } from "zod";
import { AUTH_SCAN_ACTIVITY, hasActivity } from "@/features/scanPermissions";
import { prisma } from "../db.ts";
import { requireAuth, requirePermission } from "../auth.ts";
import { log } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import { seal as sealSecret } from "../secretBox.ts";
import { authorizedTarget } from "./security.ts";

export const router = Router();
router.use(requireAuth);

/* ------------------------- Signed-in scan credential ------------------------ */
// A test-account session, for example the Cookie header after signing in with a TEST account.
// The value is encrypted at rest and write-only: no route ever returns it.
const credentialView = (c: { headerName: string; label: string; updatedAt: Date } | null) =>
  c ? { configured: true, headerName: c.headerName, label: c.label, updatedAt: c.updatedAt.toISOString() } : { configured: false };

router.get("/targets/:id/scan-credential", requirePermission("run_demo_scans"), async (req, res) => {
  res.json(credentialView(await prisma.scanCredential.findUnique({ where: { targetId: param(req) } })));
});

router.put("/targets/:id/scan-credential", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(z.object({
    headerName: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/, "Use a plain header name such as Cookie or Authorization."),
    value: z.string().trim().min(8, "The session value looks too short.").max(4000).refine((v) => !/[\r\n]/.test(v), "The value must be one line."),
    label: z.string().trim().max(80).default(""),
  }), req.body);
  const target = await authorizedTarget(param(req));
  if (!hasActivity(AUTH_SCAN_ACTIVITY, target.scope.allowedActivities)) fail(403, `Allow "${AUTH_SCAN_ACTIVITY}" in this website's scope first.`);
  const data = { headerName: b.headerName, valueEnc: sealSecret(b.value), label: b.label, createdBy: me(req).id };
  const saved = await prisma.scanCredential.upsert({ where: { targetId: target.id }, create: { targetId: target.id, ...data }, update: data });
  await log(me(req).id, "scan_credential_updated", "target", target.id, target.name, `Saved a test-account session (${b.headerName} header) for signed-in scans. The value is encrypted and not shown.`);
  res.json(credentialView(saved));
});

router.delete("/targets/:id/scan-credential", requirePermission("manage_targets"), async (req, res) => {
  const target = (await prisma.target.findUnique({ where: { id: param(req) } })) ?? fail(404, "Target not found");
  const { count } = await prisma.scanCredential.deleteMany({ where: { targetId: target.id } });
  if (count) await log(me(req).id, "scan_credential_updated", "target", target.id, target.name, "Removed the saved test-account session.");
  res.json({ configured: false });
});
