/// <reference lib="webworker" />
import { parseGIF, decompressFrame, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { outputSize, type Crop } from "./crop";

type Job = {
  file: File;
  crops: { crop: Crop; name: string }[];
  longestSide: number;
};

self.onmessage = async ({ data }: MessageEvent<Job>) => {
  try {
    const isGif =
      data.file.type === "image/gif" || /\.gif$/i.test(data.file.name);
    const files: { name: string; bytes: Uint8Array }[] = [];
    if (!isGif) {
      const image = await createImageBitmap(data.file);
      for (const [index, item] of data.crops.entries()) {
        const { width, height } = outputSize(item.crop, data.longestSide);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          image,
          item.crop.x,
          item.crop.y,
          item.crop.width,
          item.crop.height,
          0,
          0,
          width,
          height,
        );
        const blob = await canvas.convertToBlob({ type: "image/png" });
        files.push({
          name: `${item.name}.png`,
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
        self.postMessage({
          progress: Math.round(((index + 1) / data.crops.length) * 100),
        });
      }
      image.close();
    } else {
      const parsed = parseGIF(await data.file.arrayBuffer());
      const frames = parsed.frames.filter((f) => "image" in f);
      if (!frames.length || !parsed.lsd.width || !parsed.lsd.height)
        throw new Error("GIF sem frames válidos.");
      if (parsed.lsd.width * parsed.lsd.height > 40_000_000)
        throw new Error(
          "O GIF é grande demais. Use uma arte de até 40 megapixels.",
        );
      const full = new OffscreenCanvas(parsed.lsd.width, parsed.lsd.height);
      const ctx = full.getContext("2d", { willReadFrequently: true })!;
      const patchCanvas = new OffscreenCanvas(1, 1);
      const patchCtx = patchCanvas.getContext("2d")!;
      const targets = data.crops.map((item) => {
        const size = outputSize(item.crop, data.longestSide);
        const canvas = new OffscreenCanvas(size.width, size.height);
        return {
          ...item,
          canvas,
          ctx: canvas.getContext("2d", { willReadFrequently: true })!,
          encoder: GIFEncoder(),
        };
      });
      const loopExtension = parsed.frames.find(
        (f) => "application" in f && f.application.id.startsWith("NETSCAPE"),
      );
      const loopBytes =
        loopExtension && "application" in loopExtension
          ? loopExtension.application.blocks
          : null;
      const repeat =
        loopBytes?.[0] === 1 ? loopBytes[1] + (loopBytes[2] << 8) : -1;
      let previous: ParsedFrame | null = null;
      let restore: ImageData | null = null;
      for (let i = 0; i < frames.length; i++) {
        const frame = decompressFrame(frames[i], parsed.gct, true);
        if (previous?.disposalType === 2) {
          const d = previous.dims;
          ctx.clearRect(d.left, d.top, d.width, d.height);
          if (previous.transparentIndex === undefined) {
            const bg = parsed.gct?.[parsed.lsd.backgroundColorIndex];
            if (bg) {
              ctx.fillStyle = `rgb(${bg.join(",")})`;
              ctx.fillRect(d.left, d.top, d.width, d.height);
            }
          }
        } else if (previous?.disposalType === 3 && restore)
          ctx.putImageData(restore, 0, 0);
        if (i === 0 && frame.transparentIndex === undefined) {
          const bg = parsed.gct?.[parsed.lsd.backgroundColorIndex];
          if (bg) {
            ctx.fillStyle = `rgb(${bg.join(",")})`;
            ctx.fillRect(0, 0, full.width, full.height);
          }
        }
        restore =
          frame.disposalType === 3
            ? ctx.getImageData(0, 0, full.width, full.height)
            : null;
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        patchCtx.putImageData(
          new ImageData(
            new Uint8ClampedArray(frame.patch),
            frame.dims.width,
            frame.dims.height,
          ),
          0,
          0,
        );
        // Transparent pixels in a GIF patch must preserve the previous frame.
        ctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
        for (const target of targets) {
          const { canvas, crop } = target;
          target.ctx.clearRect(0, 0, canvas.width, canvas.height);
          target.ctx.imageSmoothingQuality = "high";
          target.ctx.drawImage(
            full,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const pixels = target.ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          const palette = quantize(pixels, 256, {
            format: "rgba4444",
            oneBitAlpha: true,
          });
          const transparentIndex = palette.findIndex(
            (color: number[]) => color[3] === 0,
          );
          target.encoder.writeFrame(
            applyPalette(pixels, palette, "rgba4444"),
            canvas.width,
            canvas.height,
            {
              palette,
              delay: frame.delay || 100,
              dispose: 2,
              repeat: i === 0 ? repeat : undefined,
              transparent: transparentIndex >= 0,
              transparentIndex: Math.max(0, transparentIndex),
            },
          );
        }
        previous = frame;
        self.postMessage({
          progress: Math.round(((i + 1) / frames.length) * 100),
        });
      }
      for (const target of targets) {
        target.encoder.finish();
        files.push({
          name: `${target.name}.gif`,
          bytes: new Uint8Array(target.encoder.bytes()),
        });
      }
    }
    self.postMessage({ files });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível exportar a imagem.",
    });
  }
};
