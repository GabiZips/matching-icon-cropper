import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import appIcon from "../assets/app-icon.png";

type Crop = { x: number; y: number; size: number };
type IconId = "icon1" | "icon2";
type Drag = {
  icon: IconId;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  crop: Crop;
} | null;

const ICON_IDS: IconId[] = ["icon1", "icon2"];

const INITIAL_CROPS: Record<IconId, Crop> = {
  icon1: { x: 70, y: 70, size: 360 },
  icon2: { x: 390, y: 70, size: 360 },
};

const INITIAL_NAMES: Record<IconId, string> = { icon1: "Ícone 1", icon2: "Ícone 2" };
const INITIAL_COLORS: Record<IconId, string> = { icon1: "#e35da7", icon2: "#45c7ba" };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function App() {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [crops, setCrops] = useState<Record<IconId, Crop>>(INITIAL_CROPS);
  const [names, setNames] = useState<Record<IconId, string>>(INITIAL_NAMES);
  const [colors, setColors] = useState<Record<IconId, string>>(INITIAL_COLORS);
  const [active, setActive] = useState<IconId>("icon1");
  const [drag, setDrag] = useState<Drag>(null);
  const [exporting, setExporting] = useState<IconId | "both" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const keepInBounds = (crop: Crop): Crop => {
    const maxSize = Math.min(dimensions.width, dimensions.height);
    const size = clamp(Math.round(crop.size), 80, maxSize);
    return {
      size,
      x: clamp(Math.round(crop.x), 0, dimensions.width - size),
      y: clamp(Math.round(crop.y), 0, dimensions.height - size),
    };
  };

  const resetCrops = (width: number, height: number) => {
    const size = Math.floor(Math.min(width, height) * 0.58);
    const y = Math.floor((height - size) / 2);
    setCrops({
      icon1: { x: Math.floor(width * 0.08), y, size },
      icon2: { x: Math.floor(width - size - width * 0.08), y, size },
    });
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setSourceFile(file);
    setImageUrl(URL.createObjectURL(file));
    setDimensions({ width: 0, height: 0 });
    setMessage("");
  };

  const startDrag = (event: PointerEvent<HTMLElement>, icon: IconId, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    setActive(icon);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ icon, mode, startX: event.clientX, startY: event.clientY, crop: crops[icon] });
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || !stageRef.current || !dimensions.width) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * dimensions.width;
    const dy = ((event.clientY - drag.startY) / rect.height) * dimensions.height;
    const next = drag.mode === "move"
      ? { ...drag.crop, x: drag.crop.x + dx, y: drag.crop.y + dy }
      : { ...drag.crop, size: drag.crop.size + Math.max(dx, dy) };
    setCrops((current) => ({ ...current, [drag.icon]: keepInBounds(next) }));
  };

  const updateActiveCrop = (field: keyof Crop, value: number) => {
    setCrops((current) => ({ ...current, [active]: keepInBounds({ ...current[active], [field]: value }) }));
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filenameFor = (icon: IconId, extension: "png" | "gif") => {
    const safeName = names[icon]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `${safeName || icon}-matching-icon.${extension}`;
  };

  const downloadPng = async (icon: IconId) => {
    const image = imageRef.current;
    if (!image) return;
    const crop = crops[icon];
    const canvas = document.createElement("canvas");
    canvas.width = crop.size;
    canvas.height = crop.size;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    saveBlob(blob, filenameFor(icon, "png"));
  };

  const writeGifFrame = (encoder: ReturnType<typeof GIFEncoder>, canvas: HTMLCanvasElement, frame: ParsedFrame, frameNumber: number) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const palette = quantize(pixels, 256, { format: "rgba4444", oneBitAlpha: true });
    const indexed = applyPalette(pixels, palette, "rgba4444");
    const transparentIndex = palette.findIndex((color: number[]) => color[3] === 0);
    encoder.writeFrame(indexed, canvas.width, canvas.height, {
      palette,
      delay: Math.max(frame.delay, 20),
      dispose: 1,
      repeat: frameNumber === 0 ? 0 : undefined,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(transparentIndex, 0),
    });
  };

  const downloadGif = async (icon: IconId) => {
    if (!sourceFile) return;
    const crop = crops[icon];
    const parsed = parseGIF(await sourceFile.arrayBuffer());
    const frames = decompressFrames(parsed, true);
    if (!frames.length) throw new Error("O GIF não possui frames para exportar.");

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = parsed.lsd.width;
    fullCanvas.height = parsed.lsd.height;
    const fullContext = fullCanvas.getContext("2d", { willReadFrequently: true });
    if (!fullContext) throw new Error("Não foi possível ler os frames do GIF.");

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = crop.size;
    cropCanvas.height = crop.size;
    const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
    if (!cropContext) throw new Error("Não foi possível criar o recorte animado.");

    const encoder = GIFEncoder();
    let previous: ParsedFrame | null = null;
    let restoreFrame: ImageData | null = null;

    frames.forEach((frame, frameNumber) => {
      if (previous?.disposalType === 2) {
        fullContext.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
      } else if (previous?.disposalType === 3 && restoreFrame) {
        fullContext.putImageData(restoreFrame, 0, 0);
      }

      restoreFrame = frame.disposalType === 3
        ? fullContext.getImageData(0, 0, fullCanvas.width, fullCanvas.height)
        : null;
      const framePixels = new Uint8ClampedArray(frame.patch);
      fullContext.putImageData(new ImageData(framePixels, frame.dims.width, frame.dims.height), frame.dims.left, frame.dims.top);
      cropContext.clearRect(0, 0, crop.size, crop.size);
      cropContext.drawImage(fullCanvas, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
      writeGifFrame(encoder, cropCanvas, frame, frameNumber);
      previous = frame;
    });

    encoder.finish();
    saveBlob(new Blob([new Uint8Array(encoder.bytes())], { type: "image/gif" }), filenameFor(icon, "gif"));
  };

  const download = async (icon: IconId) => {
    const isGif = sourceFile?.type === "image/gif" || sourceFile?.name.toLowerCase().endsWith(".gif");
    setExporting(icon);
    setMessage("");
    try {
      if (isGif) await downloadGif(icon);
      else await downloadPng(icon);
    } catch {
      setMessage("Não foi possível exportar esse GIF. Tente um arquivo menor ou outro GIF.");
    } finally {
      setExporting(null);
    }
  };

  const downloadBoth = async () => {
    setExporting("both");
    setMessage("");
    try {
      const isGif = sourceFile?.type === "image/gif" || sourceFile?.name.toLowerCase().endsWith(".gif");
      if (isGif) {
        await downloadGif("icon1");
        await downloadGif("icon2");
      } else {
        await downloadPng("icon1");
        await downloadPng("icon2");
      }
    } catch {
      setMessage("Não foi possível exportar esse GIF. Tente um arquivo menor ou outro GIF.");
    } finally {
      setExporting(null);
    }
  };

  const activeCrop = crops[active];
  const maxSize = Math.min(dimensions.width, dimensions.height);
  const isGif = sourceFile?.type === "image/gif" || sourceFile?.name.toLowerCase().endsWith(".gif");

  return (
    <main>
      <section className="hero">
        <img className="app-logo" src={appIcon} alt="" />
        <div>
          <p className="eyebrow">MATCHING ICONS</p>
          <h1>Corte seus matching icons do seu jeito.</h1>
          <p className="intro">Envie uma imagem de qualquer dupla, ajuste os dois quadrados e baixe cada recorte no tamanho original. GIFs continuam animados.</p>
        </div>
      </section>

      <section className="workspace" aria-label="Editor de recortes">
        <div className="left-panel">
          <label className="upload" htmlFor="image-upload">
            <span>Escolher imagem</span>
            <small>JPG, PNG, WebP ou GIF animado</small>
          </label>
          <input id="image-upload" type="file" accept="image/*" onChange={handleFile} />

          {!imageUrl ? (
            <div className="empty-state">A imagem aparece aqui. Depois é só arrastar os quadrados para onde quiser.</div>
          ) : (
            <div
              className="image-stage"
              ref={stageRef}
              onPointerMove={moveDrag}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Imagem escolhida para recorte"
                onLoad={(event) => {
                  const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                  setDimensions({ width, height });
                  resetCrops(width, height);
                }}
              />
              {dimensions.width > 0 && ICON_IDS.map((icon) => {
                const crop = crops[icon];
                const selected = icon === active;
                return (
                  <div
                    key={icon}
                    className={`crop-box ${icon} ${selected ? "selected" : ""}`}
                    style={{
                      color: colors[icon],
                      borderColor: colors[icon],
                      left: `${(crop.x / dimensions.width) * 100}%`,
                      top: `${(crop.y / dimensions.height) * 100}%`,
                      width: `${(crop.size / dimensions.width) * 100}%`,
                      height: `${(crop.size / dimensions.height) * 100}%`,
                    }}
                    onPointerDown={(event) => startDrag(event, icon, "move")}
                    role="button"
                    tabIndex={0}
                    aria-label={`Mover recorte de ${names[icon] || INITIAL_NAMES[icon]}`}
                  >
                    <span>{names[icon] || INITIAL_NAMES[icon]}</span>
                    <i aria-label={`Redimensionar recorte de ${names[icon] || INITIAL_NAMES[icon]}`} onPointerDown={(event) => startDrag(event, icon, "resize")} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="controls">
          <div className="tabs" role="tablist" aria-label="Ícone selecionado">
            {ICON_IDS.map((icon) => (
              <button key={icon} style={{ color: colors[icon] }} className={active === icon ? "active" : ""} onClick={() => setActive(icon)} role="tab" aria-selected={active === icon}>
                {names[icon] || INITIAL_NAMES[icon]}
              </button>
            ))}
          </div>

          <div className="control-copy">
            <h2 style={{ color: colors[active] }}>Recorte de {names[active] || INITIAL_NAMES[active]}</h2>
            <p>Arraste o quadrado ou ajuste os controles abaixo.</p>
          </div>

          <label className="name-label">Nome do ícone
            <input
              type="text"
              maxLength={40}
              value={names[active]}
              placeholder={INITIAL_NAMES[active]}
              onChange={(event) => setNames((current) => ({ ...current, [active]: event.target.value }))}
            />
          </label>

          <label className="color-label">Cor do nome e do quadrado
            <span className="color-control">
              <input
                type="color"
                value={colors[active]}
                aria-label={`Cor de ${names[active] || INITIAL_NAMES[active]}`}
                onChange={(event) => setColors((current) => ({ ...current, [active]: event.target.value }))}
              />
              <output>{colors[active].toUpperCase()}</output>
            </span>
          </label>

          <label className="range-label">Horizontal <output>{activeCrop.x}px</output>
            <input type="range" min="0" max={Math.max(0, dimensions.width - activeCrop.size)} value={activeCrop.x} disabled={!imageUrl} onChange={(event) => updateActiveCrop("x", Number(event.target.value))} />
          </label>
          <label className="range-label">Vertical <output>{activeCrop.y}px</output>
            <input type="range" min="0" max={Math.max(0, dimensions.height - activeCrop.size)} value={activeCrop.y} disabled={!imageUrl} onChange={(event) => updateActiveCrop("y", Number(event.target.value))} />
          </label>
          <label className="range-label">Tamanho <output>{activeCrop.size}px</output>
            <input type="range" min="80" max={maxSize || 80} value={activeCrop.size} disabled={!imageUrl} onChange={(event) => updateActiveCrop("size", Number(event.target.value))} />
          </label>

          <div className="downloads">
            <button className="primary" disabled={!imageUrl || exporting !== null} onClick={() => download(active)}>{exporting === active ? "Preparando..." : `Baixar ${names[active] || INITIAL_NAMES[active]}${isGif ? " em GIF" : ""}`}</button>
            <button className="secondary" disabled={!imageUrl || exporting !== null} onClick={downloadBoth}>{exporting === "both" ? "Preparando..." : "Baixar os dois"}</button>
          </div>
          <p className="hint">Os dois quadrados podem se sobrepor — isso mantém o detalhe em comum que faz os ícones combinarem. Em GIF, todos os frames são recortados.</p>
          {message && <p className="error-message" role="alert">{message}</p>}
        </aside>
      </section>
    </main>
  );
}
