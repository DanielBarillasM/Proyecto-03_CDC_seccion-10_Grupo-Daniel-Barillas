const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");

const APP_ID = "gt.edu.uvg.dlpantlr";

app.setAppUserModelId(APP_ID);

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Compiscript Studio · MIPS Compiler",
    backgroundColor: "#050d1a",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  // La aplicación es completamente local: no necesita ventanas emergentes,
  // navegación externa ni permisos del sistema desde el renderer.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.once("did-finish-load", () => {
    window.webContents.on("will-navigate", (event) => event.preventDefault());
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  Menu.setApplicationMenu(null);

  window.loadFile(
    path.join(__dirname, "..", "dist", "index.html")
  );
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
