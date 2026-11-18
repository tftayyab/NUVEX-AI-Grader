import { useMemo, useState } from "react";
import { gradeQuestion, gradeSubmission, uploadUrl } from "../api";

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

function scoreTone(score, max) {
  if (max == null || max <= 0 || score == null) return "none";
  const r = Number(score) / Number(max);
  if (r >= 0.75) return "ok";
  if (r >= 0.4) return "mid";
  return "low";
}

function gradeFor(sub, qid) {
  return (sub?.grades || []).find((g) => String(g.questionId) === String(qid));
}

function answerFor(sub, qid) {
  return (sub?.answers || []).find((a) => String(a.questionId) === String(qid));
}

function ScorePill({ score, max, label }) {
  const graded = score != null && max != null && max > 0;
  return (
    <span className={`score-pill ${graded ? scoreTone(score, max) : "none"}`}>
      {label ? `${label}: ` : ""}
      {graded ? `${fmt(score)} / ${fmt(max)}` : "Not graded"}
    </span>
  );
}

export default function AdminResults({ tests, submissions, onUpdated, grader, filterTestId, onFilterTestId }) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [gradingProgress, setGradingProgress] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((s) => {
      const matchesTest = !filterTestId || String(s.testId?._id || s.testId) === filterTestId;
      const matchesSearch = !query || [s.studentName, s.studentId, s.testId?.name]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesTest && matchesSearch;
    });
  }, [submissions, filterTestId, search]);

  const selected = useMemo(
    () => filtered.find((s) => s._id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const test = selected?.testId && typeof selected.testId === "object" ? selected.testId : null;
  const questions = test?.questions || [];

  async function run(label, fn) {
    setStatus({ type: "", message: "" });
    setGradingProgress({ percent: 0, stage: "Starting grading", current: 0, total: 0 });
    setBusy(label);
    try {
      const updated = await fn((progress) => setGradingProgress(progress));
      onUpdated(updated);
      setSelectedId(updated._id);
      const failed = (updated.grades || []).filter((g) => g.status === "error");
      if (failed.length) {
        setStatus({
          type: "err",
          message: failed[0].error || "Grading finished with errors.",
        });
      } else {
        setStatus({ type: "ok", message: "Grading finished." });
      }
    } catch (err) {
      setStatus({ type: "err", message: err.message });
    } finally {
      setBusy("");
      setGradingProgress(null);
    }
  }

  return (
    <div className="results-wrap">
      <div className="row-between results-toolbar">
        <div>
          <h1>Results</h1>
          <p className="lead">
            Open a submission to see each question’s score, then run grading on one question or the
            whole paper.
          </p>
        </div>
        <label className="inline">
          Test
          <select value={filterTestId} onChange={(e) => onFilterTestId(e.target.value)}>
            <option value="">All tests</option>
            {tests.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {grader && (
        <p className={grader.ok ? "grader-banner ok" : "grader-banner err"}>
          {grader.ok
            ? `Ollama ready · text ${grader.textModel} · vision ${grader.visionModel}`
            : `Ollama not reachable (${grader.error || "offline"}). Start Ollama, then grade.`}
        </p>
      )}

      {busy && gradingProgress && (
        <section className="grading-progress" aria-live="polite" aria-label="Grading progress">
          <div className="grading-progress-top">
            <div>
              <strong>Grading in progress</strong>
              <p>{gradingProgress.stage || "Working…"}</p>
            </div>
            <strong className="grading-percent">{Math.max(0, Math.min(100, Number(gradingProgress.percent) || 0))}%</strong>
          </div>
          <div className="grading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, Number(gradingProgress.percent) || 0))}>
            <div className="grading-fill" style={{ width: `${Math.max(0, Math.min(100, Number(gradingProgress.percent) || 0))}%` }} />
          </div>
          {gradingProgress.total > 0 && (
            <small>Question {Math.min(gradingProgress.current || 1, gradingProgress.total)} of {gradingProgress.total} · Progress advances as each question is assessed and saved.</small>
          )}
          <small>Elapsed time: {Math.floor((gradingProgress.elapsedSeconds || 0) / 60)}m {(gradingProgress.elapsedSeconds || 0) % 60}s</small>
          <small className="grading-tip">Image analysis can take several minutes on a CPU-only computer. The percentage advances at completed processing stages; keep this page and the server running.</small>
        </section>
      )}

      <div className="results-stats">
        <div className="stat-card"><span>Total submissions</span><strong>{submissions.length}</strong><small>Across all tests</small></div>
        <div className="stat-card"><span>Graded papers</span><strong>{submissions.filter((s) => s.questionCount > 0 && s.gradedCount >= s.questionCount).length}</strong><small>All questions graded</small></div>
        <div className="stat-card"><span>Need grading</span><strong>{submissions.filter((s) => (s.gradedCount || 0) < (s.questionCount || 0)).length}</strong><small>Questions remaining</small></div>
        <div className="stat-card"><span>Flagged for review</span><strong>{submissions.filter((s) => s.flagged).length}</strong><small>Check grading feedback</small></div>
      </div>

      <div className="review-layout">
        <aside className="panel sub-pane">
          <h2>Submissions</h2>
          <p className="muted small">{filtered.length} matching paper{filtered.length === 1 ? "" : "s"}</p>
          <input aria-label="Search submissions" placeholder="Search student, ID, or test…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="sub-list">
            {filtered.length === 0 && <li className="muted">No submissions yet.</li>}
            {filtered.map((s) => {
              const on = selected && s._id === selected._id;
              return (
                <li key={s._id} className={on ? "picked" : ""}>
                  <button type="button" className="sub-pick" onClick={() => setSelectedId(s._id)}>
                    <div className="sub-title">
                      {s.studentName}
                      {s.studentId ? ` · ${s.studentId}` : ""}
                    </div>
                    <div className="muted small">
                      {s.testId?.name || "Unknown test"} ·{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                    <div className="pill-row">
                      <ScorePill score={s.gradedCount ? s.totalScore : null} max={s.totalMax} />
                      <span className="muted small">
                        {s.gradedCount || 0}/{s.questionCount || 0} graded
                      </span>
                      {s.flagged && <span className="flag">Review</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="panel">
          {!selected && <p className="muted">Select a submission to inspect scores.</p>}
          {selected && (
            <>
              <div className="row-between">
                <div>
                  <h2>{selected.studentName}</h2>
                  <p className="muted">
                    {selected.testId?.name || "Test"}
                    {selected.studentId ? ` · ${selected.studentId}` : ""}
                  </p>
                </div>
                <div className="actions">
                  <ScorePill score={selected.gradedCount ? selected.totalScore : null} max={selected.totalMax} />
                  <button
                    type="button"
                    disabled={Boolean(busy) || !questions.length}
                    onClick={() => run("all", (onProgress) => gradeSubmission(selected._id, onProgress))}
                  >
                    {busy === "all" ? "Grading all…" : "Grade all questions"}
                  </button>
                </div>
              </div>

              {questions.length === 0 && (
                <p className="msg err">This submission’s test is missing, so questions cannot be shown.</p>
              )}

              {questions.map((q, i) => {
                const ans = answerFor(selected, q._id);
                const g = gradeFor(selected, q._id);
                const qMax = (q.expectedPoints || []).reduce((s, p) => s + (Number(p.marks) || 0), 0);
                const key = String(q._id);
                return (
                  <article className="q-grade" key={q._id || i}>
                    <div className="row-between">
                      <h3>
                        Q{i + 1} · {q.type}
                      </h3>
                      <div className="actions">
                        <ScorePill score={g?.status === "graded" ? g.score : null} max={g?.maxScore || qMax} />
                        <button
                          type="button"
                          className="ghost"
                          disabled={Boolean(busy)}
                          onClick={() => run(key, (onProgress) => gradeQuestion(selected._id, q._id, onProgress))}
                        >
                          {busy === key ? "Grading…" : g ? "Re-grade this question" : "Grade this question"}
                        </button>
                      </div>
                    </div>

                    <p className="prompt">{q.prompt}</p>

                    <div className="grade-grid">
                      <div>
                        <h4>Student answer</h4>
                        {ans?.textAnswer ? (
                          <p className="preview tall">{ans.textAnswer}</p>
                        ) : (
                          <p className="muted">No text.</p>
                        )}
                        {ans?.images?.length > 0 && (
                          <div className="thumbs">
                            {ans.images.map((img) => (
                              <a
                                key={img.filename}
                                href={uploadUrl(img.path)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img src={uploadUrl(img.path)} alt={img.originalName} />
                              </a>
                            ))}
                          </div>
                        )}
                        {ans?.cadFile && (
                          <a href={uploadUrl(ans.cadFile.path)} target="_blank" rel="noreferrer">
                            CAD: {ans.cadFile.originalName}
                          </a>
                        )}
                      </div>

                      <div>
                        <h4>Mark scheme</h4>
                        <ul className="scheme">
                          {(q.expectedPoints || []).map((p, j) => (
                            <li key={j}>
                              <span>{p.text}</span>
                              <em>{fmt(p.marks)} marks</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {g?.status === "error" && (
                      <p className="msg err">{g.error || "Grading failed."}</p>
                    )}

                    {g?.status === "graded" && (
                      <div className="grade-out">
                        <table className="crit-table">
                          <thead>
                            <tr>
                              <th>Criterion</th>
                              <th>Score</th>
                              <th>Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(g.criterionScores || []).map((c, j) => (
                              <tr key={j}>
                                <td>{c.name}</td>
                                <td>
                                  {fmt(c.score)} / {fmt(c.max)}
                                </td>
                                <td className="muted">{c.justification}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {g.feedback && (
                          <p className="feedback">
                            <strong>Feedback:</strong> {g.feedback}
                          </p>
                        )}
                        {g.flagForReview && (
                          <p className="flag-note">Flagged for review{g.flagReason ? `: ${g.flagReason}` : "."}</p>
                        )}
                        {g.model && <p className="muted small">Model: {g.model}</p>}
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {status.message && (
            <p className={status.type === "ok" ? "msg ok" : "msg err"}>{status.message}</p>
          )}
        </section>
      </div>
    </div>
  );
}
