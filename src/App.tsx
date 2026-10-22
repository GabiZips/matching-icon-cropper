import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import appIcon from "../assets/app-icon.png";
import {
  ASPECTS,
  ASPECT_LABELS,
  ICON_IDS,
  fitCrop,
  outputSize,
  safeFilename,
  type Crop,
  type Dimensions,
  type IconId,
} from "./crop";

type Editor = {
  crops: Record<IconId, Crop>;
  names: Record<IconId, string>;
  colors: Record<IconId, string>;
  ratios: Record<IconId, number | null>;
};
type Drag = {
  icon: IconId;
  mode: "move" | "resize";
  x: number;
  y: number;
  crop: Crop;
};
type ExportFile = { name: string; bytes: Uint8Array };
const DEFAULT_NAMES = { icon1: "Ícone 1", icon2: "Ícone 2" };
const initialEditor: Editor = {
  crops: {
    icon1: { x: 0, y: 0, width: 360, height: 360 },
    icon2: { x: 0, y: 0, width: 360, height: 360 },
  },
  names: DEFAULT_NAMES,
  colors: { icon1: "#e35da7", icon2: "#45c7ba" },
  ratios: { icon1: 1, icon2: 1 },
};
declare global {
  interface Window {
    desktop?: {
      saveFiles(
        files: ExportFile[],
      ): Promise<{ canceled?: boolean; saved?: number; error?: string }>;
    };
  }
}
function textColor(hex: string) {
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#17152d"
    : "#ffffff";
}

export default function App() {
  const [editor, setEditor] = useState<Editor>(initialEditor);
  const editorRef = useRef(editor);
  const past = useRef<Editor[]>([]);
  const future = useRef<Editor[]>([]);
  const [, refreshHistory] = useState(0);
  const [source, setSource] = useState<{ file: File; url: string } | null>(
    null,
  );
  const loadRequest = useRef(0);
  const [loading, setLoading] = useState(false);
  const [dimensions, setDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });
  const [active, setActive] = useState<IconId>("icon1");
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [previewShape, setPreviewShape] = useState<"rectangle" | "circle">(
    "rectangle",
  );
  const [longestSide, setLongestSide] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const busy = loading || saving || progress !== null;
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(() => () => workerRef.current?.terminate(), []);

  function remember() {
    past.current = [...past.current.slice(-99), editorRef.current];
    future.current = [];
    refreshHistory((n) => n + 1);
  }
  function change(next: Editor, saveHistory = true) {
    if (JSON.stringify(next) === JSON.stringify(editorRef.current)) return;
    if (saveHistory) remember();
    editorRef.current = next;
    setEditor(next);
  }
  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(editorRef.current);
    change(previous, false);
    refreshHistory((n) => n + 1);
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(editorRef.current);
    change(next, false);
    refreshHistory((n) => n + 1);
  }
  async function loadFile(file: File) {
    if (busy) return;
    setError("");
    setMessage("");
    if (
      !/^image\/(png|jpeg|webp|gif)$/i.test(file.type) &&
      !/\.(png|jpe?g|webp|gif)$/i.test(file.name)
    ) {
      setError("Escolha uma imagem PNG, JPG, WebP ou GIF.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Use uma imagem de até 100 MB.");
      return;
    }
    const request = ++loadRequest.current;
    const url = URL.createObjectURL(file);
    setLoading(true);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (request !== loadRequest.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const bounds = { width: image.naturalWidth, height: image.naturalHeight };
      if (
        !bounds.width ||
        !bounds.height ||
        bounds.width * bounds.height > 40_000_000
      )
        throw new Error("Use uma imagem de até 40 megapixels.");
      const current = editorRef.current;
      const makeCrop = (icon: IconId, right: boolean) => {
        const ratio = current.ratios[icon] || 1;
        const width = Math.max(
          1,
          Math.round(
            Math.min(bounds.width * 0.58, bounds.height * 0.58 * ratio),
          ),
        );
        const crop = fitCrop(
          { x: 0, y: 0, width, height: width / ratio },
          bounds,
          ratio,
        );
        return fitCrop(
          {
            ...crop,
            x: Math.round(
              right
                ? bounds.width - crop.width - bounds.width * 0.08
                : bounds.width * 0.08,
            ),
            y: Math.round((bounds.height - crop.height) / 2),
          },
          bounds,
        );
      };
      change(
        {
          ...current,
          crops: {
            icon1: makeCrop("icon1", false),
            icon2: makeCrop("icon2", true),
          },
        },
        false,
      );
      past.current = [];
      future.current = [];
      refreshHistory((n) => n + 1);
      setDimensions(bounds);
      setSource({ file, url });
      setZoom(100);
    } catch (reason) {
      URL.revokeObjectURL(url);
      setError(
        reason instanceof Error && reason.message.includes("megapixels")
          ? reason.message
          : "Não foi possível abrir essa imagem. O arquivo pode estar corrompido.",
      );
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }
  function updateCrop(field: keyof Crop, value: number) {
    const current = editorRef.current;
    const ratio = current.ratios[active];
    const crop = { ...current.crops[active], [field]: value };
    if (ratio && field === "height") crop.width = value * ratio;
    change({
      ...current,
      crops: {
        ...current.crops,
        [active]: fitCrop(crop, dimensions, ratio || undefined),
      },
    });
  }
  function startDrag(
    event: PointerEvent<HTMLElement>,
    icon: IconId,
    mode: Drag["mode"],
  ) {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(icon);
    remember();
    dragRef.current = {
      icon,
      mode,
      x: event.clientX,
      y: event.clientY,
      crop: editorRef.current.crops[icon],
    };
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) * dimensions.width) / rect.width;
    const dy = ((event.clientY - drag.y) * dimensions.height) / rect.height;
    const current = editorRef.current;
    const ratio = current.ratios[drag.icon];
    let crop = { ...drag.crop };
    if (drag.mode === "move") {
      crop.x += dx;
      crop.y += dy;
    } else if (ratio)
      crop.width += Math.abs(dx) >= Math.abs(dy * ratio) ? dx : dy * ratio;
    else {
      crop.width += dx;
      crop.height += dy;
    }
    crop = fitCrop(crop, dimensions, ratio || undefined);
    change(
      { ...current, crops: { ...current.crops, [drag.icon]: crop } },
      false,
    );
  }
  function setRatio(value: string) {
    if (value === "custom") return;
    const current = editorRef.current;
    const ratio = value === "free" ? null : Number(value);
    const crop = current.crops[active];
    const width = ratio
      ? Math.sqrt(crop.width * crop.height * ratio)
      : crop.width;
    change({
      ...current,
      ratios: { ...current.ratios, [active]: ratio },
      crops: {
        ...current.crops,
        [active]: fitCrop({ ...crop, width }, dimensions, ratio || undefined),
      },
    });
  }
  async function exportIcons(ids: IconId[]) {
    if (!source || busy) return;
    setError("");
    setMessage("");
    setProgress(0);
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const finish = () => {
      worker.terminate();
      workerRef.current = null;
      setProgress(null);
    };
    worker.onerror = () => {
      finish();
      setError("Não foi possível processar a imagem. Tente um arquivo menor.");
    };
    worker.onmessage = async ({ data }) => {
      if (typeof data.progress === "number") setProgress(data.progress);
      if (data.error) {
        finish();
        setError(data.error);
      }
      if (data.files) {
        finish();
        setSaving(true);
        try {
          const files = data.files as ExportFile[];
          if (window.desktop) {
            const result = await window.desktop.saveFiles(files);
            if (result.error) throw new Error(result.error);
            setMessage(
              result.canceled
                ? "Salvamento cancelado."
                : `${result.saved} arquivo(s) salvo(s).`,
            );
          } else {
            for (const file of files) {
              const url = URL.createObjectURL(
                new Blob([new Uint8Array(file.bytes)], {
                  type: file.name.endsWith(".gif") ? "image/gif" : "image/png",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = file.name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
            setMessage("Recortes exportados.");
          }
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível salvar os arquivos.",
          );
        } finally {
          setSaving(false);
        }
      }
    };
    worker.postMessage({
      file: source.file,
      longestSide,
      crops: ids.map((id, i) => ({
        crop: editor.crops[id],
        name: `${safeFilename(editor.names[id], id)}-${i + 1}-matching-icon`,
      })),
    });
  }
  const crop = editor.crops[active];
  const ratio = editor.ratios[active];
  const displayName = (id: IconId) =>
    editor.names[id].trim() || DEFAULT_NAMES[id];
  const upscaling = ICON_IDS.some(
    (id) =>
      longestSide > Math.max(editor.crops[id].width, editor.crops[id].height),
  );
  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files") && !busy) {
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) void loadFile(e.dataTransfer.files[0]);
      }}
      onKeyDown={(e) => {
        if (
          busy ||
          (e.target as HTMLElement).closest(
            "input, select, textarea, [contenteditable=true]",
          )
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
          return;
        }
        if (
          !source ||
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight")
          updateCrop("x", crop.x + (e.key === "ArrowLeft" ? -step : step));
        else updateCrop("y", crop.y + (e.key === "ArrowUp" ? -step : step));
      }}
    >
      {dragOver && (
        <div className="drop-overlay">
          <strong>Solte a arte aqui</strong>
          <span>PNG, JPG, WebP ou GIF</span>
        </div>
      )}
      <header className="hero">
        <img className="app-logo" src={appIcon} alt="" />
        <div>
          <p className="eyebrow">MATCHING ICON CROPPER</p>
          <h1>Dois recortes. Uma conexão.</h1>
          <p className="intro">
            Ajuste sua dupla e veja o resultado enquanto edita. Suas imagens
            ficam no computador.
          </p>
        </div>
      </header>
      <div className="editor-layout">
        <section className="editor-panel" aria-label="Editor de recortes">
          <label
            className={`upload ${busy ? "disabled" : ""}`}
            htmlFor="image-upload"
          >
            <strong>{loading ? "Abrindo imagem…" : "Escolher imagem"}</strong>
            <small>ou arraste uma arte para o app</small>
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) void loadFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <div className="toolbar" aria-label="Ferramentas de edição">
            <button
              disabled={!source || busy || !past.current.length}
              onClick={undo}
              title="Ctrl+Z"
            >
              Desfazer
            </button>
            <button
              disabled={!source || busy || !future.current.length}
              onClick={redo}
              title="Ctrl+Shift+Z"
            >
              Refazer
            </button>
            <label>
              Zoom{" "}
              <select
                aria-label="Zoom da arte"
                disabled={!source}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[50, 75, 100, 150, 200, 300].map((n) => (
                  <option key={n} value={n}>
                    {n === 100 ? "Ajustar" : `${n}%`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!source ? (
            <div className="empty-state">
              Sua arte aparece aqui.
              <br />
              PNG, JPG, WebP e GIF animado.
            </div>
          ) : (
            <>
              <div className="stage-scroll">
                <div
                  className="image-stage"
                  ref={stageRef}
                  style={{ width: `${zoom}%` }}
                  onPointerMove={moveDrag}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                >
                  <img src={source.url} alt="Arte original" draggable={false} />
                  {ICON_IDS.map((id) => {
                    const c = editor.crops[id];
                    return (
                      <div
                        key={id}
                        className={`crop-box ${active === id ? "selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Mover recorte de ${displayName(id)}`}
                        onFocus={() => setActive(id)}
                        onPointerDown={(e) => startDrag(e, id, "move")}
                        style={
                          {
                            "--crop-color": editor.colors[id],
                            "--label-ink": textColor(editor.colors[id]),
                            left: `${(c.x / dimensions.width) * 100}%`,
                            top: `${(c.y / dimensions.height) * 100}%`,
                            width: `${(c.width / dimensions.width) * 100}%`,
                            height: `${(c.height / dimensions.height) * 100}%`,
                          } as CSSProperties
                        }
                      >
                        <span>{displayName(id)}</span>
                        <i
                          aria-label={`Redimensionar ${displayName(id)}`}
                          onPointerDown={(e) => startDrag(e, id, "resize")}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="hint">
                Selecione uma área e use as setas para mover 1 px. Shift + seta
                move 10 px. No zoom, role para ver o restante da arte.
              </p>
            </>
          )}
          <fieldset disabled={!source || busy} className="crop-settings">
            <legend>Ajustar seleção</legend>
            <div className="tabs" aria-label="Recorte selecionado">
              {ICON_IDS.map((id) => (
                <button
                  key={id}
                  aria-pressed={active === id}
                  style={{ borderColor: editor.colors[id] }}
                  onClick={() => setActive(id)}
                >
                  {displayName(id)}
                </button>
              ))}
            </div>
            <div className="settings-grid">
              <label>
                Nome
                <input
                  maxLength={40}
                  value={editor.names[active]}
                  onChange={(e) =>
                    change({
                      ...editor,
                      names: { ...editor.names, [active]: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Cor
                <input
                  aria-label="Cor da seleção"
                  type="color"
                  value={editor.colors[active]}
                  onChange={(e) =>
                    change({
                      ...editor,
                      colors: { ...editor.colors, [active]: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Proporção
                <select
                  aria-label="Proporção"
                  value={
                    ratio === null
                      ? "free"
                      : ASPECTS.includes(ratio)
                        ? String(ratio)
                        : "custom"
                  }
                  onChange={(e) => setRatio(e.target.value)}
                >
                  <option value="free">Livre</option>
                  {ratio !== null && !ASPECTS.includes(ratio) && (
                    <option value="custom">Atual travada</option>
                  )}
                  {ASPECTS.map((n, i) => (
                    <option key={n} value={n}>
                      {ASPECT_LABELS[i]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="lock-button"
                onClick={() => {
                  const current = editorRef.current;
                  change({
                    ...current,
                    ratios: {
                      ...current.ratios,
                      [active]:
                        ratio === null ? crop.width / crop.height : null,
                    },
                  });
                }}
              >
                {ratio === null ? "Travar atual" : "Destravar"}
              </button>
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field}>
                  {
                    {
                      x: "Horizontal",
                      y: "Vertical",
                      width: "Largura",
                      height: "Altura",
                    }[field]
                  }
                  <input
                    aria-label={field}
                    type="number"
                    min={field === "x" || field === "y" ? 0 : 1}
                    max={
                      field === "x"
                        ? dimensions.width - crop.width
                        : field === "y"
                          ? dimensions.height - crop.height
                          : field === "width"
                            ? dimensions.width
                            : dimensions.height
                    }
                    value={crop[field]}
                    onChange={(e) => {
                      if (e.target.value !== "")
                        updateCrop(field, Number(e.target.value));
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <aside className="result-panel" aria-label="Preview e exportação">
          <section className="preview-panel" aria-labelledby="preview-title">
            <p className="eyebrow">PREVIEW AO VIVO</p>
            <h2 id="preview-title">Sua dupla, lado a lado</h2>
            <div className="shape-controls" aria-label="Formato do preview">
              <button
                aria-pressed={previewShape === "rectangle"}
                onClick={() => setPreviewShape("rectangle")}
              >
                Recorte completo
              </button>
              <button
                aria-pressed={previewShape === "circle"}
                onClick={() => setPreviewShape("circle")}
              >
                Perfil redondo
              </button>
            </div>
            <div className="preview-grid">
              {ICON_IDS.map((id) => {
                const c = editor.crops[id];
                const side = Math.min(c.width, c.height);
                const view =
                  previewShape === "circle"
                    ? {
                        x: c.x + (c.width - side) / 2,
                        y: c.y + (c.height - side) / 2,
                        width: side,
                        height: side,
                      }
                    : c;
                const output = outputSize(c, longestSide);
                return (
                  <article className="preview-card" key={id}>
                    <div
                      className={`preview-frame ${previewShape}`}
                      style={{
                        aspectRatio: `${view.width}/${view.height}`,
                        outlineColor: editor.colors[id],
                      }}
                    >
                      {source ? (
                        <img
                          src={source.url}
                          draggable={false}
                          alt={`Preview de ${displayName(id)}`}
                          style={{
                            left: `${(-view.x / view.width) * 100}%`,
                            top: `${(-view.y / view.height) * 100}%`,
                            width: `${(dimensions.width / view.width) * 100}%`,
                            height: `${(dimensions.height / view.height) * 100}%`,
                          }}
                        />
                      ) : (
                        <span>Escolha uma arte</span>
                      )}
                    </div>
                    <h3>{displayName(id)}</h3>
                    <p>
                      {source
                        ? `${output.width} × ${output.height} px`
                        : "Aguardando imagem"}
                    </p>
                  </article>
                );
              })}
            </div>
            <p className="hint">
              {previewShape === "circle"
                ? "Simula o centro da imagem em um perfil redondo. O arquivo salvo mantém o recorte completo."
                : "O preview mostra a mesma área que será salva. Selecione 1:1 para um ícone quadrado."}
            </p>
          </section>
          <section className="export-panel">
            <h2>Salvar recortes</h2>
            <label>
              Tamanho de saída
              <select
                aria-label="Tamanho de saída"
                disabled={busy}
                value={longestSide}
                onChange={(e) => setLongestSide(Number(e.target.value))}
              >
                <option value={0}>Original</option>
                {[256, 512, 1024, 2048].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              Tamanho do lado maior. A proporção é preservada.
              {upscaling && source
                ? " A imagem será ampliada e pode perder nitidez."
                : ""}
            </p>
            <div className="downloads">
              <button
                className="primary"
                disabled={!source || busy}
                onClick={() => void exportIcons(ICON_IDS)}
              >
                Salvar a dupla em uma pasta
              </button>
              <button
                disabled={!source || busy}
                onClick={() => void exportIcons([active])}
              >
                Salvar {displayName(active)}
              </button>
            </div>
            {progress !== null && (
              <div className="export-progress" role="status">
                <label>
                  Preparando arquivos: {progress}%
                  <progress max={100} value={progress} />
                </label>
                <button
                  onClick={() => {
                    workerRef.current?.terminate();
                    workerRef.current = null;
                    setProgress(null);
                    setMessage("Exportação cancelada.");
                  }}
                >
                  Cancelar exportação
                </button>
              </div>
            )}
            {saving && <p role="status">Escolha onde salvar os arquivos…</p>}
            {message && (
              <p className="success-message" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </section>
        </aside>
      </div>
      <footer>
        Matching Icon Cropper · 0.5.0 · Feito para duplas de qualquer universo
      </footer>
    </main>
  );
}
