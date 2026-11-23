const API_BASE = import.meta.env.VITE_API_URL || "";

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function getConfig() {
  return handle(await fetch(`${API_BASE}/api/config`));
}

export async function getGrader() {
  return handle(await fetch(`${API_BASE}/api/grader`));
}

export async function listTests() {
  return handle(await fetch(`${API_BASE}/api/tests`));
}

export async function getTest(id) {
  return handle(await fetch(`${API_BASE}/api/tests/${id}`));
}

/** Prompts only — no expected answers (for students). */
export async function getTestForTake(id) {
  return handle(await fetch(`${API_BASE}/api/tests/${id}/take`));
}

export async function createTest(payload) {
  return handle(
    await fetch(`${API_BASE}/api/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function createSubmission(formData) {
  return handle(
    await fetch(`${API_BASE}/api/submissions`, {
      method: "POST",
      body: formData,
    })
  );
}

export async function listSubmissions(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return handle(await fetch(`${API_BASE}/api/submissions${qs ? `?${qs}` : ""}`));
}

export async function getSubmission(id) {
  return handle(await fetch(`${API_BASE}/api/submissions/${id}`));
}

async function waitForGradingJob(jobId, onProgress = () => {}) {
  const startedAt = Date.now();
  while (true) {
    const job = await handle(await fetch(`${API_BASE}/api/grading-jobs/${jobId}`, {
      cache: "no-store",
    }));
    onProgress({ ...job, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
    if (job.status === "completed") return job.result;
    if (job.status === "failed") throw new Error(job.error || "Grading failed.");
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

async function startGrading(url, onProgress) {
  const started = await handle(await fetch(url, { method: "POST" }));
  if (!started.jobId) throw new Error("The server did not return a grading job ID.");
  return waitForGradingJob(started.jobId, onProgress);
}

export async function gradeSubmission(id, onProgress = () => {}) {
  return startGrading(`${API_BASE}/api/submissions/${id}/grade`, onProgress);
}

export async function gradeQuestion(submissionId, questionId, onProgress = () => {}) {
  return startGrading(
    `${API_BASE}/api/submissions/${submissionId}/questions/${questionId}/grade`,
    onProgress
  );
}

export function uploadUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}
