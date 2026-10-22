module.exports = async function run(fixture, fixture2) {
  const wait = async (predicate, label = "condition") => {
    for (let i = 0; i < 300; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Timeout: " + label);
  };
  const tick = () => new Promise((r) => setTimeout(r, 40));
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
  const assert = (condition, text) => {
    if (!condition) throw new Error(text);
  };
  const set = async (selector, value) => {
    const input = document.querySelector(selector);
    const proto =
      input.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(
      input,
      String(value),
    );
    input.dispatchEvent(
      new Event(input.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
    await tick();
  };
  const drop = async (file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document
      .querySelector("main")
      .dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
      );
    await tick();
  };
  await wait(() => document.querySelector("main"), "mounted");
  await drop(new File(["broken"], "broken.png", { type: "image/png" }));
  await wait(
    () => document.querySelector("[role=alert]"),
    "invalid image message",
  );
  assert(
    !document.querySelector(".image-stage"),
    "Invalid image must not replace source",
  );
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(100, 0, 100, 100);
  const blob = await new Promise((r) => canvas.toBlob(r));
  await drop(new File([blob], "pair.png", { type: "image/png" }));
  await wait(() => document.querySelector(".image-stage"), "valid image");
  await set('[aria-label="Proporção"]', "free");
  await set("[aria-label=width]", 100);
  await set("[aria-label=height]", 100);
  await set("[aria-label=x]", 0);
  await set("[aria-label=y]", 0);
  button("Ícone 2").click();
  await tick();
  await set('[aria-label="Proporção"]', "free");
  await set("[aria-label=width]", 100);
  await set("[aria-label=height]", 100);
  await set("[aria-label=x]", 100);
  await set("[aria-label=y]", 0);
  const previews = document.querySelectorAll(".preview-frame img");
  assert(
    previews[0].style.width === "200%" && previews[1].style.left === "-100%",
    "Preview must map exact export crop",
  );
  button("Perfil redondo").click();
  await tick();
  assert(
    document.querySelectorAll(".preview-frame.circle").length === 2,
    "Circle preview",
  );
  button("Recorte completo").click();
  await tick();
  await set('[aria-label="Zoom da arte"]', 200);
  assert(
    document.querySelector(".image-stage").style.width === "200%",
    "Zoom updates stage",
  );
  await set('[aria-label="Zoom da arte"]', 100);
  button("Ícone 1").click();
  await tick();
  document.querySelector(".crop-box").focus();
  document
    .querySelector(".crop-box")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  await tick();
  assert(
    document.querySelector("[aria-label=x]").value === "1",
    "Arrow moves one pixel",
  );
  button("Desfazer").click();
  await tick();
  assert(document.querySelector("[aria-label=x]").value === "0", "Undo");
  button("Refazer").click();
  await tick();
  assert(document.querySelector("[aria-label=x]").value === "1", "Redo");
  button("Desfazer").click();
  await tick();
  await set('[aria-label="Tamanho de saída"]', 512);
  button("Salvar a dupla em uma pasta").click();
  await wait(
    () =>
      document
        .querySelector(".success-message")
        ?.textContent.includes("2 arquivo"),
    "paired PNG worker export",
  );
  const bytes = Uint8Array.from(atob(fixture), (c) => c.charCodeAt(0));
  await drop(new File([bytes], "transparent.gif", { type: "image/gif" }));
  await wait(
    () => document.querySelector(".image-stage img")?.complete,
    "gif load",
  );
  await set('[aria-label="Proporção"]', "free");
  await set("[aria-label=width]", 2);
  await set("[aria-label=height]", 2);
  await set("[aria-label=x]", 0);
  await set("[aria-label=y]", 0);
  await set('[aria-label="Tamanho de saída"]', 0);
  button("Salvar Ícone 1").click();
  await wait(
    () =>
      document
        .querySelector(".success-message")
        ?.textContent.includes("1 arquivo"),
    "GIF worker export",
  );
  await drop(
    new File(
      [Uint8Array.from(atob(fixture2), (c) => c.charCodeAt(0))],
      "disposal.gif",
      { type: "image/gif" },
    ),
  );
  await set("[aria-label=width]", 2);
  await set("[aria-label=height]", 2);
  await set("[aria-label=x]", 0);
  await set("[aria-label=y]", 0);
  button("Salvar Ícone 1").click();
  await wait(
    () =>
      document
        .querySelector(".success-message")
        ?.textContent.includes("1 arquivo"),
    "GIF disposal worker export",
  );
  await set('[aria-label="Tamanho de saída"]', 2048);
  button("Salvar Ícone 1").click();
  await wait(() => button("Cancelar exportação"), "cancel button");
  button("Cancelar exportação").click();
  await tick();
  assert(
    document
      .querySelector(".success-message")
      .textContent.includes("cancelada"),
    "Cancellation message",
  );
  return "UI and worker checks passed";
};
