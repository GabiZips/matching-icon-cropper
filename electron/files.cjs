const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

function validateFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 2)
    throw new Error("Quantidade inválida de recortes.");
  const names = new Set();
  for (const file of files) {
    if (
      !/^[a-z0-9-]{1,100}\.(png|gif)$/.test(file.name) ||
      names.has(file.name)
    )
      throw new Error("Nome de arquivo inválido.");
    names.add(file.name);
    if (
      !(file.bytes instanceof Uint8Array) ||
      !file.bytes.length ||
      file.bytes.length > 512 * 1024 * 1024
    )
      throw new Error("Arquivo inválido ou grande demais.");
    const bytes = file.bytes;
    const png =
      bytes.length >= 8 &&
      Buffer.from(bytes.subarray(0, 8)).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    const gif = /^(GIF87a|GIF89a)$/.test(
      Buffer.from(bytes.subarray(0, 6)).toString("ascii"),
    );
    if (file.name.endsWith(".png") ? !png : !gif)
      throw new Error("Formato do arquivo inválido.");
  }
  return files;
}

async function atomicWrite(filename, bytes) {
  const temp = path.join(path.dirname(filename), `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, bytes, { flag: "wx" });
    await fs.rename(temp, filename);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

module.exports = { validateFiles, atomicWrite };
