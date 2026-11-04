import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * Serve the built viewer and one repo's JSON on 127.0.0.1 only.
 * The data stays in memory: nothing is written to disk or sent anywhere.
 */
export async function serve(viewerDir: string, fileName: string, json: string, port: number): Promise<string> {
  if (!existsSync(join(viewerDir, "index.html"))) {
    throw new Error(`viewer not found in ${viewerDir}. Run "npm run build:pkg" in cli/ first.`);
  }
  const index = JSON.stringify([fileName]);
  const root = normalize(viewerDir + sep);

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path === "/data/index.json") return send(res, 200, ".json", index);
    if (path === `/data/${fileName}`) return send(res, 200, ".json", json);

    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) return send(res, 403, ".txt", "forbidden");
    try {
      send(res, 200, extname(file), await readFile(file));
    } catch {
      send(res, 404, ".txt", "not found");
    }
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  const { port: actual } = server.address() as AddressInfo;
  return `http://127.0.0.1:${actual}/?repo=${encodeURIComponent(fileName)}`;
}

function send(res: import("node:http").ServerResponse, status: number, ext: string, body: string | Buffer) {
  res.writeHead(status, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}

/** Open a URL in the default browser. Failure is fine: the URL is printed too. */
export function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
