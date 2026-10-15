import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createTest, getConfig, listSubmissions, listTests, uploadUrl } from "../api";

function emptyPoint() {
  return { text: "", marks: 1 };
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
  const [tab, setTab] = useState("build"); // build | submissions
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [filterTestId, setFilterTestId] = useState("");
  const [activeTestId, setActiveTestId] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [ts, subs] = await Promise.all([
      listTests(),
      listSubmissions(filterTestId ? { testId: filterTestId } : {}),
    ]);
    setTests(ts);
    setSubmissions(subs);
  }

  useEffect(() => {
    getConfig()
      .then((c) => setEnableCad(Boolean(c.enableCad)))
      .catch(() => setEnableCad(false));
  }, []);

  useEffect(() => {
    refresh().catch((err) => setStatus({ type: "err", message: err.message }));
  }, [filterTestId]);

  const activeTest = useMemo(
    () => tests.find((t) => t._id === activeTestId) || null,
    [tests, activeTestId]
  );

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
      setActiveTestId(created._id);
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
        <button
          type="button"
          className={tab === "build" ? "tab on" : "tab"}
          onClick={() => setTab("build")}
        >
          Build Test
        </button>
        <button
          type="button"
          className={tab === "submissions" ? "tab on" : "tab"}
          onClick={() => setTab("submissions")}
        >
          Submissions
        </button>
      </div>

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
              <h2>Existing Tests</h2>
              <ul className="test-list">
                {tests.length === 0 && <li className="muted">None yet — create one.</li>}
                {tests.map((t) => (
                  <li key={t._id}>
                    <button type="button" className="linkish" onClick={() => setActiveTestId(t._id)}>
                      {t.name}
                    </button>
                    <span className="muted small">
                      {" "}
                      · {t.questions?.length || 0} Q · {t.totalMarks ?? "?"} marks
                    </span>
                    <div className="muted small mono">id: {t._id}</div>
                  </li>
                ))}
              </ul>

              {activeTest && (
                <div className="test-detail">
                  <h3>{activeTest.name}</h3>
                  {activeTest.description && <p>{activeTest.description}</p>}
                  <ol className="q-preview">
                    {activeTest.questions?.map((q, i) => (
                      <li key={q._id || i}>
                        <strong>
                          [{q.type}] {q.prompt}
                        </strong>
                        <ul>
                          {q.expectedPoints?.map((p, j) => (
                            <li key={j} className="muted">
                              {p.text} — <em>{p.marks} marks</em>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          </aside>
        </main>
      )}

      {tab === "submissions" && (
        <main className="panel">
          <div className="row-between">
            <h1>Submissions</h1>
            <label className="inline">
              Filter by test
              <select value={filterTestId} onChange={(e) => setFilterTestId(e.target.value)}>
                <option value="">All tests</option>
                {tests.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="lead">Each submission is linked to a Test id for grading against that key.</p>

          <ul className="sub-list">
            {submissions.length === 0 && <li className="muted">No submissions yet.</li>}
            {submissions.map((s) => (
              <li key={s._id}>
                <div className="sub-title">
                  {s.studentName}
                  {s.studentId ? ` · ${s.studentId}` : ""}
                </div>
                <div className="muted small">
                  {new Date(s.createdAt).toLocaleString()} · Test:{" "}
                  {s.testId?.name || s.testId || "?"} · {s.answers?.length || 0} answer(s)
                </div>
                {(s.answers || []).map((a, i) => (
                  <div key={i} className="answer-block">
                    {a.textAnswer && <p className="preview">{a.textAnswer}</p>}
                    {a.images?.length > 0 && (
                      <div className="thumbs">
                        {a.images.map((img) => (
                          <a key={img.filename} href={uploadUrl(img.path)} target="_blank" rel="noreferrer">
                            <img src={uploadUrl(img.path)} alt={img.originalName} />
                          </a>
                        ))}
                      </div>
                    )}
                    {a.cadFile && (
                      <a href={uploadUrl(a.cadFile.path)} target="_blank" rel="noreferrer">
                        CAD: {a.cadFile.originalName}
                      </a>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </main>
      )}
    </div>
  );
}
