#!/usr/bin/env node
/**
 * Start Expo against a CLIMS backend running on this computer, addressed by its LAN IP so a
 * phone on the same network can reach both the API and Metro. The IP is detected on every run,
 * because it changes when the computer moves between networks.
 *
 *   npm run start:local                 # API on port 8080 (go run ./cmd/server)
 *   API_PORT=8000 npm run start:local   # another backend port
 *   LAN_IP=192.168.1.12 npm run start:local -- --android   # force an IP; extra args go to Expo
 *
 * It also writes the address into mobile/.env.local (gitignored), which Expo reads first.
 */
/* global __dirname */
const { execFileSync, spawn } = require("node:child_process");
const os = require("node:os");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

/** IPv4 of the interface that carries the default route, i.e. the Wi-Fi or Ethernet address. */
function defaultRouteIp() {
  try {
    // Linux: `ip route get` names the source address used to reach the internet.
    const out = execFileSync("ip", ["-4", "route", "get", "1.1.1.1"], { encoding: "utf8" });
    const m = out.match(/\bsrc (\d+\.\d+\.\d+\.\d+)/);
    if (m) return m[1];
  } catch {
    // Not Linux, or no route: fall back to scanning interfaces.
  }
  const virtual = /^(lo|docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|utun|zt|tailscale)/;
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (virtual.test(name)) continue;
    const a = (addrs || []).find((x) => x.family === "IPv4" && !x.internal);
    if (a) return a.address;
  }
  return null;
}

const ip = process.env.LAN_IP || defaultRouteIp();
if (!ip) {
  console.error("Couldn't find this computer's LAN IP. Set LAN_IP=x.x.x.x and try again.");
  process.exit(1);
}
const port = process.env.API_PORT || "8080";
const apiUrl = `http://${ip}:${port}/api/v1`;

// Warn early if the backend isn't reachable on that address, rather than failing on the phone.
http
  .get(`http://${ip}:${port}/health/ready`, { timeout: 3000 }, (res) => {
    console.log(
      res.statusCode === 200
        ? `✓ Backend is up at http://${ip}:${port}`
        : `! Backend at http://${ip}:${port} answered ${res.statusCode}`,
    );
    res.resume();
  })
  .on("timeout", function () {
    this.destroy(new Error("timed out"));
  })
  .on("error", (e) =>
    console.warn(
      `! Backend not reachable at http://${ip}:${port} (${e.message}). Start it with \`make run-backend\` or \`go run ./cmd/server\`.`,
    ),
  );

console.log(`API:   ${apiUrl}`);
const args = process.argv.slice(2);
const portArg = args.findIndex((a) => a === "--port" || a === "-p");
const metroPort = portArg >= 0 ? args[portArg + 1] : "8081";
console.log(`Metro: http://${ip}:${metroPort} (phone must be on the same network)\n`);

// Expo bundles EXPO_PUBLIC_* from mobile/.env.local ahead of this process's environment, so
// write the detected address there too; otherwise a stale IP from another network would win.
const envFile = path.join(__dirname, "..", ".env.local");
let envText = "";
try {
  envText = fs.readFileSync(envFile, "utf8");
} catch {
  // No .env.local yet; it is created below.
}
const line = `EXPO_PUBLIC_API_URL=${apiUrl}`;
const updated = /^EXPO_PUBLIC_API_URL=.*$/m.test(envText)
  ? envText.replace(/^EXPO_PUBLIC_API_URL=.*$/m, line)
  : `${envText}${envText && !envText.endsWith("\n") ? "\n" : ""}${line}\n`;
if (updated !== envText) {
  fs.writeFileSync(envFile, updated);
  console.log(`Updated mobile/.env.local → ${apiUrl}`);
}

const child = spawn("npx", ["expo", "start", "--lan", "--clear", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_API_URL: apiUrl,
    // Makes Metro advertise the LAN IP (in the QR code and dev menu) instead of localhost.
    REACT_NATIVE_PACKAGER_HOSTNAME: ip,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
