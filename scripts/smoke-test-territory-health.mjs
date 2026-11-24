import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPackage = "@workspace/ems-territory-intelligence";
const apiPackage = "@workspace/api-server";
const webBasePath = process.env.ATLAS_SMOKE_PREBUILT === "1" ? "/" : "/ems-territory-intelligence/";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-12_000);
    });
    child.stderr.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-12_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`));
    });
  });
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function startProcess(command, args, env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-12_000);
  });
  child.stderr.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-12_000);
  });
  child.smokeOutput = () => output;
  return child;
}

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function waitForHttp(url, child, label) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready.\n${child.smokeOutput()}`);
    }
    try {
      return await fetch(url, { signal: AbortSignal.timeout(2_000) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`${label} did not become ready: ${lastError}\n${child.smokeOutput()}`);
}

async function main() {
  const buildEnv = {
    BASE_PATH: webBasePath,
    PORT: "4178",
    NODE_ENV: "production",
  };
  if (process.env.ATLAS_SMOKE_PREBUILT !== "1") {
    await Promise.all([
      run("pnpm", ["--filter", webPackage, "run", "build"], { env: { ...process.env, ...buildEnv } }),
      run("pnpm", ["--filter", apiPackage, "run", "build"]),
    ]);
  }

  const assetDir = path.join(
    rootDir,
    "artifacts/ems-territory-intelligence/dist/public/assets",
  );
  const countyAssets = (await readdir(assetDir)).filter((name) =>
    /^all-counties-database.*\.gz$/.test(name),
  );
  assert.equal(countyAssets.length, 1, "expected exactly one emitted county gzip asset");

  const countyAssetUrl = `${webBasePath}assets/${countyAssets[0]}`;
  const assetReferencedByBuild = (await Promise.all(
    (await readdir(assetDir))
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(path.join(assetDir, name), "utf8")),
  )).some((source) => source.includes(countyAssetUrl));
  assert.ok(assetReferencedByBuild, `built JavaScript must reference ${countyAssetUrl}`);

  const webPort = await reservePort();
  const apiPort = await reservePort();
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const web = startProcess(
    "pnpm",
    ["--filter", webPackage, "run", "serve"],
    { PORT: String(webPort), BASE_PATH: webBasePath, NODE_ENV: "production" },
  );
  const api = startProcess(
    process.execPath,
    [path.join(rootDir, "artifacts/api-server/dist/index.mjs")],
    { PORT: String(apiPort), NODE_ENV: "production", ATLAS_SAM_DISCOVERY_ENABLED: "false", ATLAS_SAM_API_KEY: "", ATLAS_SAM_GATEWAY_TOKEN: "" },
  );

  try {
    const [webResponse, apiRootResponse] = await Promise.all([
      waitForHttp(`${webOrigin}${webBasePath}`, web, "territory web preview"),
      waitForHttp(`${apiOrigin}/`, api, "API server"),
    ]);
    assert.equal(webResponse.status, 200, "territory web preview should return HTTP 200");
    assert.equal(apiRootResponse.status, 200, "API root health route should return HTTP 200");

    const countyResponse = await fetch(new URL(countyAssetUrl, webOrigin));
    assert.equal(countyResponse.status, 200, "emitted county dataset should return HTTP 200");
    const countyBytes = new Uint8Array(await countyResponse.arrayBuffer());
    const countyJsonBytes =
      countyBytes[0] === 0x1f && countyBytes[1] === 0x8b
        ? gunzipSync(countyBytes)
        : countyBytes;
    const counties = JSON.parse(new TextDecoder().decode(countyJsonBytes));
    assert.ok(Array.isArray(counties) && counties.length > 0, "county asset should parse to a non-empty array");
    const countyFips = counties.map((county) => county.countyFips);
    assert.ok(countyFips.every((fips) => typeof fips === "string" && /^\d{5}$/.test(fips)),
      "every county record should have a five-digit countyFips");
    assert.equal(new Set(countyFips).size, countyFips.length, "county FIPS values should be unique");
    console.log(`PASS county asset: loaded ${counties.length} records with unique FIPS values`);

    for (const url of [`${apiOrigin}/`, `${apiOrigin}/api/healthz`]) {
      const response = url.endsWith("/api/healthz")
        ? await fetch(url)
        : apiRootResponse;
      assert.equal(response.status, 200, `${new URL(url).pathname} should return HTTP 200`);
      assert.deepEqual(await response.json(), { status: "ok" },
        `${new URL(url).pathname} should return the expected status payload`);
      console.log(`PASS API health: ${new URL(url).pathname} returned { status: "ok" }`);
    }
    for (const route of ["fema","federal","municipal","chicago"]) {
      const response = await fetch(apiOrigin + "/api/discovery/" + route + "?invalid=1", {signal:AbortSignal.timeout(3000),redirect:"error"});
      assert.equal(response.status,400,route+" rejects invalid query");
      assert.match(response.headers.get("cache-control")??"",/no-store/);
      assert.equal(typeof (await response.json()).error,"string");
      console.log("PASS invalid discovery query: "+route);
    }
    const sam = await fetch(apiOrigin+"/api/discovery/sam",{signal:AbortSignal.timeout(3000),redirect:"error"});
    assert.equal(sam.status,503,"SAM must fail closed without operator activation");
    assert.match(sam.headers.get("cache-control")??"",/no-store/);
    assert.equal(typeof (await sam.json()).error,"string");
    console.log("PASS disabled credentialed discovery");
  } finally {
    stopProcess(web);
    stopProcess(api);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
