import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const worker = read("worker.js");
const testConfig = read("wrangler.test.jsonc");
const devConfig = read("wrangler.dev.jsonc");
const runtime = read("src/runtimeConfig.ts");
const index = read("index.html");

assert(index.includes('src="./runtime-config.js"'), "runtime config must load before the Admin app");
assert(runtime.includes("Cloudflare Admin must use same-origin /api"), "Admin must require same-origin Cloudflare /api");
assert(worker.includes('url.pathname === "/runtime-config.js"'), "Worker must provide runtime config");
assert(worker.includes('"x-fastlink-api-proxy"'), "Worker must expose its proxy identity");
assert(worker.includes('headers.delete("x-forwarded-host")'), "Worker must remove spoofed forwarding headers");
assert(worker.includes("FASTLINK_BACKEND_ORIGIN"), "Worker must require an explicit Backend origin");
assert(!worker.includes("production-309d") && !worker.includes("fastlink-backend-dev-development-a"), "Worker must not embed Backend hosts");
assert(testConfig.includes('"name": "fastlink-admin-test"'), "Test Worker name must be isolated");
assert(testConfig.includes('"FASTLINK_ENVIRONMENT": "TEST"'), "Test Worker must declare TEST");
assert(testConfig.includes('"FASTLINK_PROXY_ID": "admin-test"'), "Test proxy identity must be admin-test");
assert(devConfig.includes('"name": "fastlink-admin-dev"'), "Dev Worker name must be isolated");
assert(devConfig.includes('"FASTLINK_ENVIRONMENT": "SANDBOX"'), "Dev Worker must declare SANDBOX");
assert(devConfig.includes('"FASTLINK_PROXY_ID": "admin-dev"'), "Dev proxy identity must be admin-dev");

const dist = join(root, "dist");
if (statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
  const files = [];
  const collect = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) collect(path);
      else files.push(path);
    }
  };
  collect(dist);
  const artifact = files
    .filter((path) => /\.(?:html|js|css)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert(!artifact.includes("production-309d"), "Cloudflare artifact must not contain the Production Backend marker");
  assert(!artifact.includes("fastlink-backend-dev"), "Cloudflare artifact must not contain the Dev Backend marker");
}

console.log("Admin Cloudflare runtime, proxy identity, and isolation contract PASS");
