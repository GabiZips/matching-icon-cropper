// Collect the actual runtime licenses bundled into the application.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const seen = new Set();
const notices = [];
function visit(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = path.join(root, "node_modules", name);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  const license = fs
    .readdirSync(dir)
    .find((file) => /^licen[cs]e(?:\.(?:txt|md))?$/i.test(file));
  if (!license) throw new Error(`Missing license for ${name}`);
  notices.push(
    `${name} ${pkg.version}\n${fs.readFileSync(path.join(dir, license), "utf8")}`,
  );
  Object.keys(pkg.dependencies || {}).forEach(visit);
}
Object.keys(require("../package.json").dependencies).forEach(visit);
fs.writeFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  "Runtime dependency licenses\nElectron and Chromium licenses are also included with the Windows distribution.\n\n" +
    notices.join("\n\n---\n\n"),
);
