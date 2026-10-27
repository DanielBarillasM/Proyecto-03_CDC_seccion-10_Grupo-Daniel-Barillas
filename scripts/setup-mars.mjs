import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = "https://github.com/dpetersanderson/MARS/releases/download/v.4.5.1/Mars4_5.jar";
const expectedHash = "ac340b676ba2b62246b9df77e62f81ad4447bcfd329ab539716bcd09950b7096";
const directory = resolve("tools");
const destination = resolve(directory, "Mars4_5.jar");

try {
  let artifact;
  if (existsSync(destination)) artifact = await readFile(destination);
  else {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`MARS download failed: HTTP ${response.status}`);
    artifact = Buffer.from(await response.arrayBuffer());
  }
  const hash = createHash("sha256").update(artifact).digest("hex");
  if (hash !== expectedHash) throw new Error(`MARS checksum mismatch: ${hash}`);
  if (!existsSync(destination)) {
    await mkdir(directory, { recursive: true });
    await writeFile(destination, artifact);
  }
  console.log(`MARS 4.5 verified: ${destination}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
