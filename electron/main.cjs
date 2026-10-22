const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { validateFiles, atomicWrite } = require("./files.cjs");

app.setAppUserModelId("com.gabizips.matchingiconcropper");
let saving = false;

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#fbf8ff",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../assets/app-icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);

  const trustedUrl = app.isPackaged
    ? pathToFileURL(path.join(__dirname, "../dist/index.html")).href
    : "http://127.0.0.1:5173/";
  ipcMain.removeHandler("save-crops");
  ipcMain.handle("save-crops", async (event, payload) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== trustedUrl ||
      saving
    )
      return { error: "Solicitação inválida." };
    saving = true;
    try {
      const files = validateFiles(payload);
      if (files.length === 1) {
        const result = await dialog.showSaveDialog(window, {
          title: "Salvar recorte",
          defaultPath: files[0].name,
          filters: [
            {
              name: "Imagem",
              extensions: [path.extname(files[0].name).slice(1)],
            },
          ],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        const extension = path.extname(files[0].name);
        const filename = result.filePath.toLowerCase().endsWith(extension)
          ? result.filePath
          : result.filePath + extension;
        if (filename !== result.filePath) {
          let exists = false;
          try { await fs.access(filename); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
          if (exists) {
            const answer = await dialog.showMessageBox(window, { type: "question", message: "Substituir este recorte?", detail: path.basename(filename), buttons: ["Cancelar", "Substituir"], defaultId: 0, cancelId: 0 });
            if (answer.response !== 1) return { canceled: true };
          }
        }
        await atomicWrite(filename, files[0].bytes);
      } else {
        const result = await dialog.showOpenDialog(window, {
          title: "Escolha a pasta da dupla",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || !result.filePaths[0]) return { canceled: true };
        const targets = files.map((file) =>
          path.join(result.filePaths[0], file.name),
        );
        const existing = [];
        for (const filename of targets) {
          try {
            await fs.access(filename);
            existing.push(path.basename(filename));
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
        if (existing.length) {
          const answer = await dialog.showMessageBox(window, {
            type: "question",
            title: "Substituir arquivos?",
            message: "Estes recortes já existem:",
            detail: existing.join("\n"),
            buttons: ["Cancelar", "Substituir"],
            defaultId: 0,
            cancelId: 0,
          });
          if (answer.response !== 1) return { canceled: true };
        }
        for (let i = 0; i < files.length; i++)
          await atomicWrite(targets[i], files[i].bytes);
      }
      return { saved: files.length };
    } catch {
      return {
        error:
          "Não foi possível salvar. Confira a permissão de escrita e o espaço na pasta.",
      };
    } finally {
      saving = false;
    }
  });

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    window.loadURL(trustedUrl);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
