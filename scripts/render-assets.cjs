const { app, BrowserWindow } = require("electron");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const jobs = [
  {
    source: "docs/assets/compiscript-project3-pipeline.svg",
    width: 1500,
    height: 430,
    outputs: ["docs/assets/compiscript-project3-pipeline.png"]
  },
  {
    source: "docs/assets/compiscript-project3-stack.svg",
    width: 1200,
    height: 500,
    outputs: ["docs/assets/compiscript-project3-stack.png"]
  },
  {
    source: "docs/assets/compiscript-project2-pipeline.svg",
    width: 1672,
    height: 941,
    outputs: [
      "docs/assets/compiscript-project2-pipeline.png"
    ]
  },
  {
    source: "docs/assets/compiscript-project2-storage-frames.svg",
    width: 1672,
    height: 941,
    outputs: [
      "docs/assets/compiscript-project2-storage-frames.png"
    ]
  }
];

app.commandLine.appendSwitch("disable-gpu");

async function render(job, window) {
  window.setContentSize(job.width, job.height);
  await window.loadFile(path.join(root, job.source));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: job.width, height: job.height });
  const png = image.toPNG();

  for (const output of job.outputs) {
    const destination = path.join(root, output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
    process.stdout.write(`rendered ${output}\n`);
  }
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1672,
    height: 941,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: "#060811",
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
      backgroundThrottling: false
    }
  });
  for (const job of jobs) await render(job, window);
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
