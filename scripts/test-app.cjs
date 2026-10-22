// Runs the real built renderer and export worker in an isolated, hidden Electron.
const path = require("node:path");
if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(require("electron"), [__filename], {
    stdio: "inherit",
    env,
    timeout: 90000,
  });
  if (run.error) console.error(run.error.message);
  process.exit(run.status ?? 1);
} else {
  const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
  const { GIFEncoder } = require("gifenc");
  const { parseGIF, decompressFrames } = require("gifuct-js");
  const { validateFiles } = require("../electron/files.cjs");
  const fs = require("node:fs/promises");
  const assert = require("node:assert/strict");
  const saved = [];
  const timeout = setTimeout(() => {
    console.error("App test timed out");
    app.exit(1);
  }, 75000);
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      show: false,
      width: 1350,
      height: 1050,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, "../electron/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const errors = [];
    window.webContents.on("console-message", (event) => {
      if (event.level === "error") errors.push(event.message);
    });
    ipcMain.handle("save-crops", (_event, files) => {
      validateFiles(files);
      saved.push(files);
      return { saved: files.length };
    });
    try {
      await window.loadFile(path.join(__dirname, "../dist/index.html"));
      const encoder = GIFEncoder();
      const palette = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 0],
      ];
      encoder.writeFrame(new Uint8Array([0, 0, 0, 0]), 2, 2, {
        palette,
        delay: 70,
        repeat: 2,
        dispose: 1,
      });
      encoder.writeFrame(new Uint8Array([2, 1, 2, 2]), 2, 2, {
        palette,
        delay: 120,
        dispose: 1,
        transparent: true,
        transparentIndex: 2,
      });
      encoder.finish();
      const fixture = Buffer.from(encoder.bytes()).toString("base64");
      const disposeEncoder = GIFEncoder();
      const colors = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [0, 0, 0],
      ];
      disposeEncoder.writeFrame(new Uint8Array([0, 0, 0, 0]), 2, 2, {
        palette: colors,
        delay: 80,
        dispose: 1,
        repeat: 0,
        transparent: true,
        transparentIndex: 3,
      });
      disposeEncoder.writeFrame(new Uint8Array([1, 3, 3, 3]), 2, 2, {
        palette: colors,
        delay: 80,
        dispose: 3,
        transparent: true,
        transparentIndex: 3,
      });
      disposeEncoder.writeFrame(new Uint8Array([3, 3, 2, 3]), 2, 2, {
        palette: colors,
        delay: 80,
        dispose: 2,
        transparent: true,
        transparentIndex: 3,
      });
      disposeEncoder.writeFrame(new Uint8Array([3, 3, 3, 1]), 2, 2, {
        palette: colors,
        delay: 80,
        dispose: 1,
        transparent: true,
        transparentIndex: 3,
      });
      disposeEncoder.finish();
      const fixture2 = Buffer.from(disposeEncoder.bytes()).toString("base64");
      const result = await window.webContents.executeJavaScript(
        `(${require("../tests/renderer.cjs").toString()})(${JSON.stringify(fixture)}, ${JSON.stringify(fixture2)})`,
      );
      assert.equal(result, "UI and worker checks passed");
      assert.equal(saved.length, 3);
      assert.equal(saved[0].length, 2);
      for (const [i, file] of saved[0].entries()) {
        const image = nativeImage.createFromBuffer(Buffer.from(file.bytes));
        assert.deepEqual(image.getSize(), { width: 512, height: 512 });
        const offset = (256 * 512 + 256) * 4;
        const pixel = [...image.toBitmap().subarray(offset, offset + 4)];
        assert.deepEqual(pixel, i === 0 ? [0, 0, 255, 255] : [0, 255, 0, 255]);
      }
      const gif = parseGIF(new Uint8Array(saved[1][0].bytes).buffer);
      const frames = decompressFrames(gif, true);
      assert.equal(frames.length, 2);
      assert.deepEqual(
        frames.map((f) => f.delay),
        [70, 120],
      );
      // Transparent patch must retain red from previous frame, not turn it clear.
      assert.deepEqual(
        [...frames[1].patch.subarray(0, 8)],
        [255, 0, 0, 255, 0, 255, 0, 255],
      );
      const loop = gif.frames.find((f) =>
        f.application?.id.startsWith("NETSCAPE"),
      );
      assert.equal(loop.application.blocks[1], 2);
      const disposal = decompressFrames(
        parseGIF(new Uint8Array(saved[2][0].bytes).buffer),
        true,
      );
      assert.deepEqual(
        [...disposal[2].patch.subarray(0, 4)],
        [255, 0, 0, 255],
        "Disposal 3 restores previous canvas",
      );
      assert.equal(
        disposal[3].patch[3],
        0,
        "Disposal 2 clears transparent background",
      );
      assert.deepEqual(
        [...disposal[3].patch.subarray(12, 16)],
        [0, 255, 0, 255],
      );
      assert.equal(errors.length, 0, errors.join("\n"));
      await window.webContents.executeJavaScript(
        `(${require("../tests/demo.cjs").toString()})()`,
      );
      await new Promise((r) => setTimeout(r, 300));
      await fs.mkdir(path.join(__dirname, "../docs"), { recursive: true });
      await fs.writeFile(
        path.join(__dirname, "../docs/demo.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      console.log(
        "PASS: invalid input, drag/drop, ratio, zoom, undo/redo, keyboard, live preview, PNG pixels/sizes, paired save, GIF transparency/timing/loop and cancellation.",
      );
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    } finally {
      clearTimeout(timeout);
    }
  });
}
