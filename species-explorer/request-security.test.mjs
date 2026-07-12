import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicHttpUrl,
  isPathInside,
  isPrivateNetworkAddress,
} from "./request-security.mjs";

test("erkennt lokale, private und öffentliche IP-Adressen", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "fe80::1",
    "fec0::1",
    "fd00::1",
  ]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress("93.184.216.34"), false);
  assert.equal(isPrivateNetworkAddress("2606:2800:220:1:248:1893:25c8:1946"), false);
});

test("URL-Prüfung blockiert private DNS-Ziele und erlaubt öffentliche Ziele", async () => {
  const privateLookup = async () => [{ address: "192.168.1.10", family: 4 }];
  await assert.rejects(
    assertPublicHttpUrl("https://example.test/map.jpg", { lookup: privateLookup }),
    /Private, lokale/,
  );
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const parsed = await assertPublicHttpUrl("https://example.test/map.jpg", { lookup: publicLookup });
  assert.equal(parsed.hostname, "example.test");
  await assert.rejects(assertPublicHttpUrl("http://[::ffff:7f00:1]/map.jpg"), /Private, lokale/);
});

test("Pfadprüfung respektiert echte Verzeichnisgrenzen", () => {
  const root = process.platform === "win32" ? "C:\\repo\\public" : "/repo/public";
  const inside = process.platform === "win32" ? "C:\\repo\\public\\index.html" : "/repo/public/index.html";
  const sibling = process.platform === "win32" ? "C:\\repo\\public-old\\secret" : "/repo/public-old/secret";
  assert.equal(isPathInside(root, inside), true);
  assert.equal(isPathInside(root, sibling), false);
  assert.equal(isPathInside(root, root), false);
});
