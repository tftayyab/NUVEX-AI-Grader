import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createTest, getConfig, getGrader, listSubmissions, listTests } from "../api";
import AdminResults from "./AdminResults";
import AdminTestsLibrary from "./AdminTestsLibrary";

function emptyPoint() {
  return { text: "", marks: 1, fullMarks: "", partialMarks: "", zeroMarks: "", evidenceToInspect: "" };
}

function emptyQuestion() {
  return {
    type: "text",
    prompt: "",
    expectedPoints: [emptyPoint()],
    _key: crypto.randomUUID(),
  };
}

export default function AdminTests() {
  const [enableCad, setEnableCad] = useState(false);
  const [grader, setGrader] = useState(null);
  const [tab, setTab] = useState("results"); // tests | results | build
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [filterTestId, setFilterTestId] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [ts, subs] = await Promise.all([listTests(), listSubmissions()]);
    setTests(ts);
    setSubmissions(subs);
  }

  useEffect(() => {
    getConfig()
      .then((c) => setEnableCad(Boolean(c.enableCad)))
      .catch(() => setEnableCad(false));
    getGrader()
      .then(setGrader)
      .catch((err) => setGrader({ ok: false, error: err.message }));
  }, []);

  useEffect(() => {
    refresh().catch((err) => setStatus({ type: "err", message: err.message }));
  }, []);

  function onSubmissionUpdated(updated) {
    setSubmissions((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
  }

  function updateQuestion(index, patch) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updatePoint(qIndex, pIndex, patch) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const expectedPoints = q.expectedPoints.map((p, j) =>
          j === pIndex ? { ...p, ...patch } : p
        );
        return { ...q, expectedPoints };
      })
    );
  }

  function addPoint(qIndex) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, expectedPoints: [...q.expectedPoints, emptyPoint()] } : q
      )
    );
  }

  function removePoint(qIndex, pIndex) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.expectedPoints.length <= 1) return q;
        return {
          ...q,
          expectedPoints: q.expectedPoints.filter((_, j) => j !== pIndex),
        };
      })
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(index) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onCreateTest(e) {
    e.preventDefault();
    setStatus({ type: "", message: "" });
    setBusy(true);
    try {
      const payload = {
        name,
        description,
        questions: questions.map(({ type, prompt, expectedPoints }) => ({
          type,
          prompt,
          expectedPoints: expectedPoints.map((p) => ({
            text: p.text,
            marks: Number(p.marks),
            fullMarks: p.fullMarks || "",
            partialMarks: p.partialMarks || "",
            zeroMarks: p.zeroMarks || "",
            evidenceToInspect: String(p.evidenceToInspect || "")
              .split("\n").map((item) => item.trim()).filter(Boolean),
          })),
        })),
      };
      const created = await createTest(payload);
      setStatus({
        type: "ok",
        message: `Test "${created.name}" saved. Students can open it from the Student page.`,
      });
      setName("");
      setDescription("");
      setQuestions([emptyQuestion()]);
      await refresh();
      setTab("tests");
    } catch (err) {
      setStatus({ type: "err", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wide">
      <header className="topbar">
        <strong>NUVEX AI Grader</strong>
        <nav>
          <Link to="/">Student</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <div className="tabs">
        <button type="button" className={tab === "tests" ? "tab on" : "tab"} onClick={() => setTab("tests")}>
          Tests
        </button>
        <button
          type="button"
          className={tab === "results" ? "tab on" : "tab"}
          onClick={() => setTab("results")}
        >
          Results
        </button>
        <button type="button" className={tab === "build" ? "tab on" : "tab"} onClick={() => setTab("build")}>
          Build Test
        </button>
      </div>

      {tab === "tests" && (
        <AdminTestsLibrary
          tests={tests}
          submissions={submissions}
          onOpenResults={(id) => {
            setFilterTestId(id);
            setTab("results");
          }}
        />
      )}

      {tab === "results" && (
        <AdminResults
          tests={tests}
          submissions={submissions}
          grader={grader}
          filterTestId={filterTestId}
          onFilterTestId={setFilterTestId}
          onUpdated={onSubmissionUpdated}
        />
      )}

      {tab === "build" && (
        <main className="admin-grid">
          <section className="panel">
            <h1>New Test</h1>
            <p className="lead">
              Add questions (text, image{enableCad ? ", or CAD" : ""}). For each question, write
              expected answer points and marks. Use <strong>+</strong> to add more points under the
              same question (e.g. 3 different criteria with different marks).
            </p>
            {!enableCad && (
              <p className="muted small">CAD question type is hidden until ENABLE_CAD=true.</p>
            )}

            <form className="form" onSubmit={onCreateTest}>
              <label>
                Test name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Chassis design review"
                />
              </label>
              <label>
                Description (optional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Shown to students"
                />
              </label>

              {questions.map((q, qi) => (
                <div className="q-card" key={q._key}>
                  <div className="row-between">
                    <h3>Question {qi + 1}</h3>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => removeQuestion(qi)}
                      disabled={questions.length <= 1}
                    >
                      Remove
                    </button>
                  </div>

                  <label>
                    Type
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(qi, { type: e.target.value })}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      {enableCad && <option value="cad">CAD</option>}
                    </select>
                  </label>

                  <label>
                    Question prompt
                    <textarea
                      value={q.prompt}
                      onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                      required
                      rows={3}
                      placeholder="What should the student do / answer?"
                    />
                  </label>

                  <div className="points-block">
                    <div className="row-between">
                      <strong>Expected answer points</strong>
                      <button type="button" className="ghost" onClick={() => addPoint(qi)}>
                        + Add answer point
                      </button>
                    </div>
                    <p className="muted small">
                      Each row is one thing you expect to see, with its own marks.
                    </p>
                    {q.expectedPoints.map((p, pi) => (
                      <div className="point-row" key={pi}>
                        <input
                          className="grow"
                          value={p.text}
                          onChange={(e) => updatePoint(qi, pi, { text: e.target.value })}
                          required
                          placeholder="Expected answer / criterion"
                        />
                        <input
                          className="marks"
                          type="number"
                          min="0"
                          step="0.5"
                          value={p.marks}
                          onChange={(e) => updatePoint(qi, pi, { marks: e.target.value })}
                          required
                          title="Marks"
                          aria-label="Marks"
                        />
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => removePoint(qi, pi)}
                          disabled={q.expectedPoints.length <= 1}
                        >
                          −
                        </button>
                      </div>
                    ))}
                    <p className="muted small">Optional rubric guidance — these details help the AI distinguish full, partial and zero credit. Put one visual item per line in the evidence box.</p>
                    {q.expectedPoints.map((p, pi) => (
                      <div className="point-rubric" key={`rubric-${pi}`}>
                        <strong>{p.text || `Criterion ${pi + 1}`} — {p.marks} marks</strong>
                        <label>
                          Full-mark requirements
                          <textarea rows={2} value={p.fullMarks || ""} onChange={(e) => updatePoint(qi, pi, { fullMarks: e.target.value })} placeholder="What must be demonstrated to earn all marks?" />
                        </label>
                        <label>
                          Partial-mark requirements
                          <textarea rows={2} value={p.partialMarks || ""} onChange={(e) => updatePoint(qi, pi, { partialMarks: e.target.value })} placeholder="What incomplete but valid evidence earns partial marks?" />
                        </label>
                        <label>
                          Zero-mark conditions
                          <textarea rows={2} value={p.zeroMarks || ""} onChange={(e) => updatePoint(qi, pi, { zeroMarks: e.target.value })} placeholder="What clearly fails this criterion?" />
                        </label>
                        <label>
                          Evidence to inspect (one item per line)
                          <textarea rows={2} value={p.evidenceToInspect || ""} onChange={(e) => updatePoint(qi, pi, { evidenceToInspect: e.target.value })} placeholder={"e.g. wheel positions\nfront and side alignment\nwritten dimensions"} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button type="button" className="ghost" onClick={addQuestion}>
                + Add question
              </button>

              <button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save Test"}
              </button>
            </form>

            {status.message && (
              <p className={status.type === "ok" ? "msg ok" : "msg err"}>{status.message}</p>
            )}
          </section>

          <aside className="side">
            <section className="panel">
              <h2>Recently saved</h2>
              <p className="muted small">Full list lives under the Tests tab.</p>
              <ul className="test-list">
                {tests.length === 0 && <li className="muted">None yet — create one.</li>}
                {tests.slice(0, 6).map((t) => (
                  <li key={t._id}>
                    <strong>{t.name}</strong>
                    <span className="muted small">
                      {" "}
                      · {t.questions?.length || 0} Q · {t.totalMarks ?? "?"} marks
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </main>
      )}
    </div>
  );
}
