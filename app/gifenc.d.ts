declare module "gifenc" {
  type Palette = number[][];
  type GifEncoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options: {
      palette: Palette;
      delay?: number;
      dispose?: number;
      repeat?: number;
      transparent?: boolean;
      transparentIndex?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function GIFEncoder(): GifEncoder;
  export function quantize(rgba: Uint8ClampedArray, maxColors: number, options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean }): Palette;
  export function applyPalette(rgba: Uint8ClampedArray, palette: Palette, format?: "rgb565" | "rgb444" | "rgba4444"): Uint8Array;
}
