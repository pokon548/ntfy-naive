import { app, BrowserWindow, Tray, Menu, Notification } from "electron";
import path from "node:path";
import { setup } from "electron-push-receiver";
import { join } from "path";

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │

let win: BrowserWindow;
let isQuiting: boolean;

const gotTheLock = app.requestSingleInstanceLock();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 1080,
    show: true,
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join("build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      autoplayPolicy: "user-gesture-required",
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Allow press F12 to open dev panel if not packed
  if (!app.isPackaged)
    win.webContents.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        win.webContents.toggleDevTools();

        win.webContents.on("devtools-opened", () => {
          // Can't use mainWindow.webContents.devToolsWebContents.on("before-input-event") - it just doesn't intercept any events.
          if (win.webContents.devToolsWebContents) {
            win.webContents.devToolsWebContents
              .executeJavaScript(
                `
            new Promise((resolve)=> {
              addEventListener("keydown", (event) => {
                if (event.key === "F12") {
                  resolve();
                }
              }, { once: true });
            })
          `
              )
              .then(() => {
                win.webContents.toggleDevTools();
              });
          }
        });
      }
    });

  win.loadURL("https://ntfy.sh/app");

  setup(win.webContents);

  win.webContents.on("console-message", (_event, _level, message) => {
    if (message.includes("Message received from server")) {
      const msgJson = JSON.parse(message.slice(message.indexOf("{")));
      const title = msgJson.title;
      const topic = msgJson.topic;
      const event = msgJson.event;
      const msg = msgJson.message;

      if (event == "message") {
        if (title) {
          new Notification({
            title: title,
            body: msg,
            icon: app.isPackaged
              ? join(process.resourcesPath, "icon.png")
              : join("build", "icon.png"),
          }).show();
        } else if (topic) {
          new Notification({
            title: topic,
            body: msg,
            icon: app.isPackaged
              ? join(process.resourcesPath, "icon.png")
              : join("build", "icon.png"),
          }).show();
        } else {
          new Notification({
            body: msg,
            icon: app.isPackaged
              ? join(process.resourcesPath, "icon.png")
              : join("build", "icon.png"),
          }).show();
        }
      }

      console.log(msgJson);
    }
  });

  win.on("close", function (event) {
    if (!isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });

  const tray = new Tray(
    app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join("build", "icon.png")
  );
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: function () {
        win.show();
      },
    },
    {
      label: "Quit",
      click: function () {
        isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("This is my application.");
  tray.setContextMenu(contextMenu);
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuiting) {
      app.quit();
    }
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(); // test
  }
});

// Allow only one instance to run
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);
}
