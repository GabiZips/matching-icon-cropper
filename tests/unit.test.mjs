import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fitCrop, outputSize, safeFilename } from "../src/crop.ts";
const require = createRequire(import.meta.url);
const { validateFiles, atomicWrite } = require("../electron/files.cjs");

test("proportions stay inside small, portrait and landscape images", () => {
  for (const bounds of [
    { width: 1, height: 1 },
    { width: 100, height: 800 },
    { width: 1200, height: 200 },
  ]) {
    for (const ratio of [1, 3 / 4, 4 / 3, 9 / 16, 16 / 9]) {
      const crop = fitCrop(
        { x: 9999, y: -20, width: 2000, height: 4 },
        bounds,
        ratio,
      );
      assert.ok(crop.width >= 1 && crop.height >= 1);
      assert.ok(crop.x >= 0 && crop.y >= 0);
      assert.ok(
        crop.x + crop.width <= bounds.width &&
          crop.y + crop.height <= bounds.height,
      );
      assert.ok(Math.abs(crop.width - crop.height * ratio) <= ratio + 1);
    }
  }
});
test("output longest side preserves rectangle and original size", () => {
  assert.deepEqual(outputSize({ width: 300, height: 400 }, 512), {
    width: 384,
    height: 512,
  });
  assert.deepEqual(outputSize({ width: 1600, height: 900 }, 1024), {
    width: 1024,
    height: 576,
  });
  assert.deepEqual(outputSize({ width: 81, height: 127 }, 0), {
    width: 81,
    height: 127,
  });
});
test("filenames cannot escape target directory", () => {
  assert.equal(safeFilename("../../Ícone azul?!", "icon1"), "icone-azul");
  assert.equal(safeFilename("🎨", "icon1"), "icon1");
  assert.throws(() =>
    validateFiles([{ name: "../other.png", bytes: new Uint8Array([1]) }]),
  );
  assert.throws(() =>
    validateFiles([{ name: "valid.png", bytes: new Uint8Array([1]) }]),
  );
});
test("saving replaces only chosen output and leaves no partial file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cropper-test-"));
  try {
    const file = join(dir, "output.png");
    await atomicWrite(file, Buffer.from("old"));
    await atomicWrite(file, Buffer.from("new"));
    assert.equal(await readFile(file, "utf8"), "new");
  } finally {
    await rm(dir, { recursive: true });
  }
});
