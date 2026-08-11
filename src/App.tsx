import { ChangeEvent, DragEvent as ReactDragEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import appIcon from "../assets/app-icon.png";

type Crop = { x: number; y: number; width: number; height: number };
type IconId = "icon1" | "icon2";
type Drag = {
  icon: IconId;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  crop: Crop;
} | null;

const ICON_IDS: IconId[] = ["icon1", "icon2"];
const ASPECT_OPTIONS = [
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
];

const INITIAL_CROPS: Record<IconId, Crop> = {
  icon1: { x: 70, y: 70, width: 360, height: 360 },
  icon2: { x: 390, y: 70, width: 360, height: 360 },
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
  const [aspectLocked, setAspectLocked] = useState<Record<IconId, boolean>>({ icon1: true, icon2: true });
  const [aspectRatios, setAspectRatios] = useState<Record<IconId, number>>({ icon1: 1, icon2: 1 });
  const [active, setActive] = useState<IconId>("icon1");
  const [drag, setDrag] = useState<Drag>(null);
  const [exporting, setExporting] = useState<IconId | "both" | null>(null);
  const [message, setMessage] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const keepInBounds = (crop: Crop, ratio?: number): Crop => {
    if (!dimensions.width || !dimensions.height) {
      return {
        x: Math.round(crop.x),
        y: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      };
    }
    const minimumSide = Math.min(80, dimensions.width, dimensions.height);
    let width = Math.max(1, crop.width);
    let height = Math.max(1, crop.height);

    if (ratio) {
      height = width / ratio;
      const scaleUp = Math.max(1, minimumSide / width, minimumSide / height);
      width *= scaleUp;
      height *= scaleUp;
      const scaleDown = Math.min(1, dimensions.width / width, dimensions.height / height);
      width *= scaleDown;
      height *= scaleDown;
    } else {
      width = clamp(width, minimumSide, dimensions.width);
      height = clamp(height, minimumSide, dimensions.height);
    }

    width = Math.round(width);
    height = Math.round(height);
    return {
      width,
      height,
      x: clamp(Math.round(crop.x), 0, dimensions.width - width),
      y: clamp(Math.round(crop.y), 0, dimensions.height - height),
    };
  };

  const resetCrops = (width: number, height: number) => {
    const makeCrop = (ratio: number, alignRight: boolean): Crop => {
      const cropWidth = Math.floor(Math.min(width * 0.58, height * 0.58 * ratio));
      const cropHeight = Math.floor(cropWidth / ratio);
      const margin = Math.floor(width * 0.08);
      return {
        x: alignRight ? Math.max(0, width - cropWidth - margin) : Math.min(margin, width - cropWidth),
        y: Math.floor((height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      };
    };
    setCrops({
      icon1: makeCrop(aspectRatios.icon1, false),
      icon2: makeCrop(aspectRatios.icon2, true),
    });
  };

  const loadFile = (file: File) => {
    const supportedExtension = /\.(jpe?g|png|webp|gif)$/i.test(file.name);
    if (!file.type.startsWith("image/") && !supportedExtension) {
      setMessage("Solte um arquivo de imagem: JPG, PNG, WebP ou GIF.");
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setSourceFile(file);
    setImageUrl(URL.createObjectURL(file));
    setDimensions({ width: 0, height: 0 });
    setMessage("");
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
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
    let next: Crop;
    if (drag.mode === "move") {
      next = { ...drag.crop, x: drag.crop.x + dx, y: drag.crop.y + dy };
    } else if (aspectLocked[drag.icon]) {
      const ratio = aspectRatios[drag.icon];
      const width = Math.abs(dx) >= Math.abs(dy * ratio)
        ? drag.crop.width + dx
        : (drag.crop.height + dy) * ratio;
      next = { ...drag.crop, width, height: width / ratio };
    } else {
      next = { ...drag.crop, width: drag.crop.width + dx, height: drag.crop.height + dy };
    }
    setCrops((current) => ({
      ...current,
      [drag.icon]: keepInBounds(next, aspectLocked[drag.icon] ? aspectRatios[drag.icon] : undefined),
    }));
  };

  const updateActiveCrop = (field: keyof Crop, value: number) => {
    setCrops((current) => {
      const next = { ...current[active], [field]: value };
      if (aspectLocked[active] && field === "width") next.height = value / aspectRatios[active];
      if (aspectLocked[active] && field === "height") next.width = value * aspectRatios[active];
      return {
        ...current,
        [active]: keepInBounds(next, aspectLocked[active] ? aspectRatios[active] : undefined),
      };
    });
  };

  const toggleAspectLock = () => {
    if (aspectLocked[active]) {
      setAspectLocked((current) => ({ ...current, [active]: false }));
      return;
    }
    const currentRatio = crops[active].width / crops[active].height;
    setAspectRatios((current) => ({ ...current, [active]: currentRatio }));
    setAspectLocked((current) => ({ ...current, [active]: true }));
  };

  const applyAspectRatio = (ratio: number) => {
    setAspectRatios((current) => ({ ...current, [active]: ratio }));
    setAspectLocked((current) => ({ ...current, [active]: true }));
    setCrops((current) => {
      const crop = current[active];
      const area = crop.width * crop.height;
      const width = Math.sqrt(area * ratio);
      const next = keepInBounds({ ...crop, width, height: width / ratio }, ratio);
      return { ...current, [active]: next };
    });
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
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
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
    cropCanvas.width = crop.width;
    cropCanvas.height = crop.height;
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
      cropContext.clearRect(0, 0, crop.width, crop.height);
      cropContext.drawImage(fullCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
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
  const minimumCropSize = Math.min(80, dimensions.width, dimensions.height) || 1;
  const displayedRatio = aspectLocked[active]
    ? aspectRatios[active]
    : activeCrop.width / activeCrop.height;
  const selectedAspect = ASPECT_OPTIONS.find((option) => Math.abs(option.value - displayedRatio) < 0.001);
  const isGif = sourceFile?.type === "image/gif" || sourceFile?.name.toLowerCase().endsWith(".gif");

  return (
    <main
      className={isDraggingFile ? "dragging-file" : ""}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) setIsDraggingFile(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDraggingFile(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFile(false);
      }}
      onDrop={handleDrop}
    >
      {isDraggingFile && <div className="drop-overlay"><strong>Solte a arte aqui</strong><span>JPG, PNG, WebP ou GIF</span></div>}
      <section className="hero">
        <img className="app-logo" src={appIcon} alt="" />
        <div>
          <p className="eyebrow">MATCHING ICONS</p>
          <h1>Corte seus matching icons do seu jeito.</h1>
          <p className="intro">Envie uma imagem de qualquer dupla, ajuste as duas áreas e baixe cada recorte no formato escolhido. GIFs continuam animados.</p>
        </div>
      </section>

      <section className="workspace" aria-label="Editor de recortes">
        <div className="left-panel">
          <label className="upload" htmlFor="image-upload">
            <span>Escolher imagem</span>
            <small>ou arraste a arte para a janela</small>
          </label>
          <input id="image-upload" type="file" accept="image/*" onChange={handleFile} />

          {!imageUrl ? (
            <div className="empty-state">Clique em “Escolher imagem” ou arraste a arte para dentro do app.</div>
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
                      width: `${(crop.width / dimensions.width) * 100}%`,
                      height: `${(crop.height / dimensions.height) * 100}%`,
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
            <p>Arraste a área ou ajuste os controles abaixo.</p>
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

          <div className="aspect-control">
            <div className="aspect-heading">
              <span>Proporção da área</span>
              <button type="button" className={aspectLocked[active] ? "locked" : ""} onClick={toggleAspectLock}>
                {aspectLocked[active] ? "Destravar" : "Travar atual"}
              </button>
            </div>
            <select
              aria-label="Proporção da área de recorte"
              value={selectedAspect?.value.toString() ?? "custom"}
              onChange={(event) => {
                if (event.target.value !== "custom") applyAspectRatio(Number(event.target.value));
              }}
            >
              {!selectedAspect && <option value="custom">Atual ({displayedRatio.toFixed(2)}:1)</option>}
              {ASPECT_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
            </select>
            <small>{aspectLocked[active] ? "A largura e a altura mudam juntas." : "Modo livre: ajuste largura e altura separadamente."}</small>
          </div>

          <label className="range-label">Horizontal <output>{activeCrop.x}px</output>
            <input type="range" min="0" max={Math.max(0, dimensions.width - activeCrop.width)} value={activeCrop.x} disabled={!imageUrl} onChange={(event) => updateActiveCrop("x", Number(event.target.value))} />
          </label>
          <label className="range-label">Vertical <output>{activeCrop.y}px</output>
            <input type="range" min="0" max={Math.max(0, dimensions.height - activeCrop.height)} value={activeCrop.y} disabled={!imageUrl} onChange={(event) => updateActiveCrop("y", Number(event.target.value))} />
          </label>
          <label className="range-label">Largura <output>{activeCrop.width}px</output>
            <input type="range" min={minimumCropSize} max={dimensions.width || minimumCropSize} value={activeCrop.width} disabled={!imageUrl} onChange={(event) => updateActiveCrop("width", Number(event.target.value))} />
          </label>
          <label className="range-label">Altura <output>{activeCrop.height}px</output>
            <input type="range" min={minimumCropSize} max={dimensions.height || minimumCropSize} value={activeCrop.height} disabled={!imageUrl} onChange={(event) => updateActiveCrop("height", Number(event.target.value))} />
          </label>

          <div className="downloads">
            <button className="primary" disabled={!imageUrl || exporting !== null} onClick={() => download(active)}>{exporting === active ? "Preparando..." : `Baixar ${names[active] || INITIAL_NAMES[active]}${isGif ? " em GIF" : ""}`}</button>
            <button className="secondary" disabled={!imageUrl || exporting !== null} onClick={downloadBoth}>{exporting === "both" ? "Preparando..." : "Baixar os dois"}</button>
          </div>
          <p className="hint">As duas áreas podem se sobrepor e ter proporções diferentes. Em GIF, todos os frames são recortados.</p>
          {message && <p className="error-message" role="alert">{message}</p>}
        </aside>
      </section>
    </main>
  );
}
