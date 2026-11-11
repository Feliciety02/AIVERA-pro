import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { detectScope } from "./scopeDiscovery.ts";

test("scope discovery never follows a redirect to another port", async () => {
  let outsideRequests = 0;
  const outside = createServer((_req, res) => { outsideRequests++; res.end("outside"); });
  await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
  const outsidePort = (outside.address() as { port: number }).port;
  const inside = createServer((_req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${outsidePort}/outside` });
    res.end();
  });
  await new Promise<void>((resolve) => inside.listen(0, "127.0.0.1", resolve));
  try {
    const port = (inside.address() as { port: number }).port;
    const result = await detectScope(`http://127.0.0.1:${port}`);
    assert.equal(result.robots?.status, "not_found");
    assert.equal(result.sitemap?.status, "not_found");
    assert.equal(outsideRequests, 0);
  } finally {
    inside.close();
    outside.close();
  }
});
