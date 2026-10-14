import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createTest, listSubmissions, listTests, uploadUrl } from "../api";

export default function AdminTests() {
  const [submissions, setSubmissions] = useState([]);
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [testName, setTestName] = useState("");
  const [description, setDescription] = useState("");
  const [answerKey, setAnswerKey] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [activeTestId, setActiveTestId] = useState(null);

  async function refresh() {
    const params = onlyUnassigned ? { unassigned: "true" } : {};
    const [subs, ts] = await Promise.all([listSubmissions(params), listTests()]);
    setSubmissions(subs);
    setTests(ts);
  }

  useEffect(() => {
    refresh().catch((err) => setStatus({ type: "err", message: err.message }));
  }, [onlyUnassigned]);

  const allSelected = useMemo(
    () => submissions.length > 0 && submissions.every((s) => selected.has(s._id)),
    [submissions, selected]
  );

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(submissions.map((s) => s._id)));
  }

  async function onCreateTest(e) {
    e.preventDefault();
    setStatus({ type: "", message: "" });

    if (selected.size === 0) {
      setStatus({ type: "err", message: "Select at least one submission." });
      return;
    }
    if (!answerKey) {
      setStatus({ type: "err", message: "Upload an Excel answer key." });
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", testName);
      fd.append("description", description);
      fd.append("submissionIds", JSON.stringify([...selected]));
      fd.append("answerKey", answerKey);

      const created = await createTest(fd);
      setStatus({
        type: "ok",
        message: `Test "${created.name}" created with ${created.submissionIds.length} submission(s).`,
      });
      setTestName("");
      setDescription("");
      setAnswerKey(null);
      setSelected(new Set());
      e.target.reset();
      await refresh();
      setActiveTestId(created._id);
    } catch (err) {
      setStatus({ type: "err", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const activeTest = tests.find((t) => t._id === activeTestId) || null;

  return (
    <div className="page">
      <header className="topbar">
        <strong>NUVEX AI Grader</strong>
        <nav>
          <Link to="/">Student</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="admin-grid">
        <section className="panel">
          <div className="row-between">
            <h1>Submissions</h1>
            <label className="inline">
              <input
                type="checkbox"
                checked={onlyUnassigned}
                onChange={(e) => {
                  setOnlyUnassigned(e.target.checked);
                  setSelected(new Set());
                }}
              />
              Unassigned only
            </label>
          </div>
          <p className="lead">
            Select submissions, then create a <strong>Test</strong> — one shared Excel answer key
            for the whole group. Different Tests can have different keys.
          </p>

          <div className="row-between">
            <button type="button" className="ghost" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <span className="muted">{selected.size} selected</span>
          </div>

          <ul className="sub-list">
            {submissions.length === 0 && <li className="muted">No submissions yet.</li>}
            {submissions.map((s) => (
              <li key={s._id} className={selected.has(s._id) ? "picked" : ""}>
                <label className="sub-row">
                  <input
                    type="checkbox"
                    checked={selected.has(s._id)}
                    onChange={() => toggleOne(s._id)}
                  />
                  <div>
                    <div className="sub-title">
                      {s.studentName}
                      {s.studentId ? ` · ${s.studentId}` : ""}
                    </div>
                    <div className="muted small">
                      {new Date(s.createdAt).toLocaleString()} · {s.images?.length || 0} image(s)
                      {s.cadFile ? " · CAD" : ""}
                      {s.testId ? " · already in a Test" : ""}
                    </div>
                    <p className="preview">{s.textAnswer}</p>
                    {s.images?.length > 0 && (
                      <div className="thumbs">
                        {s.images.map((img) => (
                          <a key={img.filename} href={uploadUrl(img.path)} target="_blank" rel="noreferrer">
                            <img src={uploadUrl(img.path)} alt={img.originalName} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <aside className="side">
          <section className="panel">
            <h2>Create a Test</h2>
            <p className="muted small">
              Excel columns: <code>question</code> and <code>answer</code> (or similar names).
              Row 1 = Q1, row 2 = Q2, …
            </p>
            <form className="form" onSubmit={onCreateTest}>
              <label>
                Test name
                <input
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  required
                  placeholder="e.g. Aero Q3 — Friday cohort"
                />
              </label>
              <label>
                Notes (optional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Anything graders should know"
                />
              </label>
              <label>
                Answer key Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  required
                  onChange={(e) => setAnswerKey(e.target.files?.[0] || null)}
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Creating..." : `Create Test (${selected.size})`}
              </button>
            </form>
            {status.message && (
              <p className={status.type === "ok" ? "msg ok" : "msg err"}>{status.message}</p>
            )}
          </section>

          <section className="panel">
            <h2>Existing Tests</h2>
            <ul className="test-list">
              {tests.length === 0 && <li className="muted">None yet.</li>}
              {tests.map((t) => (
                <li key={t._id}>
                  <button type="button" className="linkish" onClick={() => setActiveTestId(t._id)}>
                    {t.name}
                  </button>
                  <span className="muted small">
                    {" "}
                    · {Array.isArray(t.submissionIds) ? t.submissionIds.length : 0} submissions ·{" "}
                    {t.expectedAnswers?.length || 0} answer rows
                  </span>
                </li>
              ))}
            </ul>

            {activeTest && (
              <div className="test-detail">
                <h3>{activeTest.name}</h3>
                {activeTest.description && <p>{activeTest.description}</p>}
                <h4>Expected answers</h4>
                <ol>
                  {activeTest.expectedAnswers?.map((row) => (
                    <li key={row.questionNumber}>
                      <strong>Q{row.questionNumber}:</strong> {row.question || "(no question text)"}
                      <br />
                      <span className="muted">Expected: {row.expectedAnswer || "(empty)"}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
