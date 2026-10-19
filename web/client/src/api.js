const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

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

export async function gradeSubmission(id) {
  return handle(
    await fetch(`${API_BASE}/api/submissions/${id}/grade`, {
      method: "POST",
    })
  );
}

export async function gradeQuestion(submissionId, questionId) {
  return handle(
    await fetch(`${API_BASE}/api/submissions/${submissionId}/questions/${questionId}/grade`, {
      method: "POST",
    })
  );
}

export function uploadUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}
