module.exports = async function demo() {
  const size = document.querySelector('[aria-label="Tamanho de saída"]');
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  ).set.call(size, "512");
  size.dispatchEvent(new Event("change", { bubbles: true }));
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 700;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1200, 700);
  gradient.addColorStop(0, "#f8b5dc");
  gradient.addColorStop(0.48, "#dad0fa");
  gradient.addColorStop(1, "#8ddbd1");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 700);
  ctx.fillStyle = "#ffffff60";
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(i * 190, i % 2 ? 100 : 610, 110, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, color] of [
    [380, "#9e4893"],
    [820, "#207e83"],
  ]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, 310, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, 650, 205, 210, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 35, 300, 10, 0, Math.PI * 2);
    ctx.arc(x + 35, 300, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, 330, 32, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  const blob = await new Promise((r) => canvas.toBlob(r));
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], "demo.png", { type: "image/png" }));
  const oldUrl = document.querySelector(".image-stage img")?.src;
  document
    .querySelector("main")
    .dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  for (let i = 0; i < 200; i++) {
    const image = document.querySelector(".image-stage img");
    if (image?.src !== oldUrl && image?.naturalWidth === 1200) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  if (document.querySelector(".image-stage img")?.naturalWidth !== 1200)
    throw new Error("Demo image did not load");
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent === "Perfil redondo")
    .click();
};
