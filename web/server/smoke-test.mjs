/**
 * In-process smoke test (no child process).
 * Run: npm run smoke
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.ENABLE_CAD = "false";
process.env.PORT = "5055";

const mem = await MongoMemoryServer.create();
process.env.MONGODB_URI = mem.getUri("nuvex_smoke");

const { app } = await import("./index.js");

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

const server = await new Promise((resolve, reject) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
  s.on("error", reject);
});
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];

try {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert(health.ok === true, "health.ok");
  assert(health.enableCad === false, "CAD off");
  results.push("PASS health");

  const createRes = await fetch(`${BASE}/api/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Aero Test",
      description: "built in UI style",
      questions: [
        {
          type: "text",
          prompt: "Explain drag reduction.",
          expectedPoints: [
            { text: "Mentions airflow / streamlining", marks: 2 },
            { text: "Mentions frontal area", marks: 1 },
            { text: "Gives a concrete example", marks: 2 },
          ],
        },
        {
          type: "image",
          prompt: "Upload orthographic views.",
          expectedPoints: [{ text: "Clear front/top/side views", marks: 3 }],
        },
      ],
    }),
  });
  const test = await createRes.json();
  assert(createRes.status === 201, `create test ${createRes.status}: ${JSON.stringify(test)}`);
  assert(test.questions?.length === 2, "2 questions");
  assert(test.questions[0].expectedPoints?.length === 3, "3 answer points on Q1");
  assert(test.totalMarks === 8, `totalMarks=${test.totalMarks}`);
  results.push("PASS create Test with multi-point marks");

  const take = await (await fetch(`${BASE}/api/tests/${test._id}/take`)).json();
  assert(take.questions[0].prompt, "student sees prompt");
  assert(take.questions[0].expectedPoints === undefined, "student does NOT see answer key");
  results.push("PASS student take view hides keys");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  const fd = new FormData();
  fd.append("testId", test._id);
  fd.append("studentName", "Smoke Student");
  fd.append("studentId", "team_smoke");
  fd.append(
    "answers",
    JSON.stringify([
      { questionId: test.questions[0]._id, textAnswer: "Streamline the body to cut drag." },
      { questionId: test.questions[1]._id, textAnswer: "views attached" },
    ])
  );
  fd.append(`images_${test.questions[1]._id}`, new Blob([png], { type: "image/png" }), "dot.png");

  const subRes = await fetch(`${BASE}/api/submissions`, { method: "POST", body: fd });
  const sub = await subRes.json();
  assert(subRes.status === 201, `submit ${subRes.status}: ${JSON.stringify(sub)}`);
  assert(String(sub.testId) === String(test._id), "submission linked to test");
  assert(sub.answers?.length === 2, "2 answers");
  results.push("PASS submit against Test id");

  const listed = await (await fetch(`${BASE}/api/submissions?testId=${test._id}`)).json();
  assert(listed.length === 1, "filter by testId");
  results.push("PASS list submissions by test");

  console.log("\n=== SMOKE TEST RESULTS ===");
  for (const line of results) console.log(line);
  console.log("ALL BASIC CHECKS PASSED\n");
} catch (err) {
  console.error("\n=== SMOKE TEST FAILED ===");
  console.error(err);
  process.exitCode = 1;
} finally {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mem.stop();
}
