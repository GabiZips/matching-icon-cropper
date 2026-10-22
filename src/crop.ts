export type Crop = { x: number; y: number; width: number; height: number };
export type Dimensions = { width: number; height: number };
export type IconId = "icon1" | "icon2";
export const ICON_IDS: IconId[] = ["icon1", "icon2"];
export const ASPECTS = [1, 3 / 4, 4 / 3, 9 / 16, 16 / 9];
export const ASPECT_LABELS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

export function fitCrop(crop: Crop, bounds: Dimensions, ratio?: number): Crop {
  if (!bounds.width || !bounds.height) return crop;
  let width = Math.max(1, crop.width);
  let height = Math.max(1, crop.height);
  if (ratio && Number.isFinite(ratio) && ratio > 0) {
    height = width / ratio;
    const scale = Math.min(1, bounds.width / width, bounds.height / height);
    width *= scale;
    height *= scale;
  }
  width = Math.max(1, Math.min(bounds.width, Math.round(width)));
  height = Math.max(1, Math.min(bounds.height, Math.round(height)));
  return {
    width,
    height,
    x: Math.max(0, Math.min(bounds.width - width, Math.round(crop.x))),
    y: Math.max(0, Math.min(bounds.height - height, Math.round(crop.y))),
  };
}

// Output size is the longest side; the selected rectangle never gets stretched.
export function outputSize(crop: Dimensions, longestSide: number): Dimensions {
  if (!longestSide) return { width: crop.width, height: crop.height };
  const scale = longestSide / Math.max(crop.width, crop.height);
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

export function safeFilename(name: string, fallback: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || fallback
  );
}
