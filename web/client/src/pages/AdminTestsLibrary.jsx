import { useMemo, useState } from "react";

function marksFor(q) {
  return (q.expectedPoints || []).reduce((s, p) => s + (Number(p.marks) || 0), 0);
}

export default function AdminTestsLibrary({ tests, submissions, onOpenResults }) {
  const [openId, setOpenId] = useState(null);

  const counts = useMemo(() => {
    const m = {};
    for (const s of submissions) {
      const id = String(s.testId?._id || s.testId || "");
      if (!id) continue;
      m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [submissions]);

  return (
    <main>
      <h1>Tests</h1>
      <p className="lead">Every test you have built, with questions, marks, and how many papers came in.</p>

      {tests.length === 0 && (
        <section className="panel">
          <p className="muted">None yet — switch to Build Test to create one.</p>
        </section>
      )}

      <div className="test-cards">
        {tests.map((t) => {
          const open = openId === t._id;
          const n = counts[t._id] || 0;
          return (
            <section className="panel test-card" key={t._id}>
              <div className="row-between">
                <div>
                  <h2>{t.name}</h2>
                  {t.description && <p className="muted">{t.description}</p>}
                </div>
                <div className="pill-row">
                  <span className="score-pill none">{t.questions?.length || 0} questions</span>
                  <span className="score-pill none">{t.totalMarks ?? "?"} marks</span>
                  <span className="score-pill none">
                    {n} paper{n === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="actions left">
                <button type="button" className="ghost" onClick={() => setOpenId(open ? null : t._id)}>
                  {open ? "Hide questions" : "Show questions"}
                </button>
                <button type="button" className="ghost" onClick={() => onOpenResults(t._id)}>
                  View papers
                </button>
              </div>

              {open && (
                <ol className="q-preview">
                  {t.questions?.map((q, i) => (
                    <li key={q._id || i}>
                      <strong>
                        Q{i + 1} [{q.type}] {q.prompt}
                      </strong>
                      <span className="muted small"> · {marksFor(q)} marks</span>
                      <ul className="scheme">
                        {q.expectedPoints?.map((p, j) => (
                          <li key={j}>
                            <span>{p.text}</span>
                            <em>{p.marks} marks</em>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
