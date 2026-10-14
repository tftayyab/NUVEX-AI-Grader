/**
 * Local smoke test — spins in-memory Mongo, starts the API, hits core routes.
 * Run: node smoke-test.mjs
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      // not up yet
    }
    await sleep(400);
  }
  throw new Error("API did not become healthy in time");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const mem = await MongoMemoryServer.create();
const uri = mem.getUri("nuvex_smoke");

const envPath = path.join(__dirname, ".env.smoke");
fs.writeFileSync(
  envPath,
  [
    `MONGODB_URI=${uri}`,
    `PORT=${PORT}`,
    `CLIENT_ORIGIN=http://localhost:5173`,
    `ENABLE_CAD=false`,
  ].join("\n")
);

const child = spawn(process.execPath, ["index.js"], {
  cwd: __dirname,
  env: { ...process.env, DOTENV_CONFIG_PATH: envPath, MONGODB_URI: uri, PORT: String(PORT), ENABLE_CAD: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
child.stdout.on("data", (d) => {
  serverLog += d.toString();
});
child.stderr.on("data", (d) => {
  serverLog += d.toString();
});

const results = [];

try {
  const health = await waitForHealth();
  assert(health.ok === true, "health.ok");
  assert(health.enableCad === false, "CAD should be off");
  results.push("PASS health + CAD off");

  const config = await (await fetch(`${BASE}/api/config`)).json();
  assert(config.enableCad === false, "config.enableCad");
  results.push("PASS /api/config");

  // text-only submission
  const fd1 = new FormData();
  fd1.append("studentName", "Smoke Student");
  fd1.append("studentId", "team_smoke");
  fd1.append("textAnswer", "This is a smoke-test answer about aerodynamics.");

  const subRes = await fetch(`${BASE}/api/submissions`, { method: "POST", body: fd1 });
  const sub = await subRes.json();
  assert(subRes.status === 201, `submit status ${subRes.status}: ${JSON.stringify(sub)}`);
  assert(sub._id, "submission id");
  assert(sub.cadFile === null || sub.cadFile === undefined, "no CAD when disabled");
  results.push("PASS create text submission");

  // submission with a tiny PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const imgPath = path.join(__dirname, "uploads", "_smoke.png");
  fs.mkdirSync(path.dirname(imgPath), { recursive: true });
  fs.writeFileSync(imgPath, png);

  const fd2 = new FormData();
  fd2.append("studentName", "Pic Student");
  fd2.append("textAnswer", "Answer with a picture.");
  fd2.append("images", new Blob([png], { type: "image/png" }), "dot.png");

  const sub2Res = await fetch(`${BASE}/api/submissions`, { method: "POST", body: fd2 });
  const sub2 = await sub2Res.json();
  assert(sub2Res.status === 201, `image submit ${sub2Res.status}`);
  assert(sub2.images?.length === 1, "one image saved");
  results.push("PASS create submission with image");

  const list = await (await fetch(`${BASE}/api/submissions?unassigned=true`)).json();
  assert(Array.isArray(list) && list.length >= 2, "list unassigned");
  results.push(`PASS list submissions (${list.length})`);

  // Create a Test with CSV answer key
  const csv = "question,answer\nQ1,A1\nQ2,A2\n";
  const fd3 = new FormData();
  fd3.append("name", "Smoke Test Batch");
  fd3.append("description", "created by smoke-test");
  fd3.append("submissionIds", JSON.stringify([sub._id, sub2._id]));
  fd3.append("answerKey", new Blob([csv], { type: "text/csv" }), "key.csv");

  const testRes = await fetch(`${BASE}/api/tests`, { method: "POST", body: fd3 });
  const test = await testRes.json();
  assert(testRes.status === 201, `create test ${testRes.status}: ${JSON.stringify(test)}`);
  assert(test.expectedAnswers?.length === 2, "parsed 2 answer rows");
  assert(test.submissionIds?.length === 2, "2 submissions linked");
  results.push("PASS create Test + Excel/CSV answer key");

  const tests = await (await fetch(`${BASE}/api/tests`)).json();
  assert(tests.length >= 1, "list tests");
  results.push("PASS list tests");

  const stillUnassigned = await (await fetch(`${BASE}/api/submissions?unassigned=true`)).json();
  assert(stillUnassigned.length === 0, "submissions now assigned");
  results.push("PASS submissions marked assigned");

  console.log("\n=== SMOKE TEST RESULTS ===");
  for (const line of results) console.log(line);
  console.log("ALL BASIC CHECKS PASSED\n");
} catch (err) {
  console.error("\n=== SMOKE TEST FAILED ===");
  console.error(err.message);
  console.error("\n--- server log ---");
  console.error(serverLog);
  process.exitCode = 1;
} finally {
  child.kill();
  try {
    fs.unlinkSync(envPath);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(path.join(__dirname, "uploads", "_smoke.png"));
  } catch {
    /* ignore */
  }
  await mem.stop();
}
