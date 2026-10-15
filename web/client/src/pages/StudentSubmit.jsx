import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createSubmission, getConfig, getTestForTake, listTests } from "../api";

export default function StudentSubmit() {
  const [enableCad, setEnableCad] = useState(false);
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [test, setTest] = useState(null);

  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [textAnswers, setTextAnswers] = useState({});
  const [imageFiles, setImageFiles] = useState({});
  const [cadFiles, setCadFiles] = useState({});

  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);

  useEffect(() => {
    getConfig()
      .then((c) => setEnableCad(Boolean(c.enableCad)))
      .catch(() => setEnableCad(false));
    listTests()
      .then(setTests)
      .catch((err) => setStatus({ type: "err", message: err.message }));
  }, []);

  useEffect(() => {
    if (!selectedTestId) {
      setTest(null);
      return;
    }
    setLoadingTest(true);
    setStatus({ type: "", message: "" });
    getTestForTake(selectedTestId)
      .then((t) => {
        setTest(t);
        setTextAnswers({});
        setImageFiles({});
        setCadFiles({});
      })
      .catch((err) => {
        setTest(null);
        setStatus({ type: "err", message: err.message });
      })
      .finally(() => setLoadingTest(false));
  }, [selectedTestId]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!test) return;
    setStatus({ type: "", message: "" });
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("testId", test._id);
      fd.append("studentName", studentName);
      fd.append("studentId", studentId);

      const answers = test.questions.map((q) => ({
        questionId: q._id,
        textAnswer: textAnswers[q._id] || "",
      }));
      fd.append("answers", JSON.stringify(answers));

      for (const q of test.questions) {
        const imgs = imageFiles[q._id];
        if (imgs) {
          Array.from(imgs).forEach((file) => fd.append(`images_${q._id}`, file));
        }
        const cad = cadFiles[q._id];
        if (cad) fd.append(`cadFile_${q._id}`, cad);
      }

      await createSubmission(fd);
      setStatus({ type: "ok", message: "Submitted. Linked to this test for grading." });
      setStudentName("");
      setStudentId("");
      setTextAnswers({});
      setImageFiles({});
      setCadFiles({});
      e.target.reset();
    } catch (err) {
      setStatus({ type: "err", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <strong>NUVEX AI Grader</strong>
        <nav>
          <Link to="/">Student</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="panel">
        <h1>Start</h1>
        <p className="lead">Pick a test, then answer each question. Your submission keeps that test’s id.</p>

        <label>
          Available tests
          <select
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
            required
          >
            <option value="">Select a test…</option>
            {tests.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.questions?.length || 0} questions)
              </option>
            ))}
          </select>
        </label>

        {tests.length === 0 && (
          <p className="muted">No tests yet. An admin must create one under Admin → Build Test.</p>
        )}

        {loadingTest && <p className="muted">Loading test…</p>}

        {test && (
          <form className="form" onSubmit={onSubmit}>
            <div className="test-banner">
              <h2>{test.name}</h2>
              {test.description && <p className="muted">{test.description}</p>}
              <p className="muted small mono">test id: {test._id}</p>
            </div>

            <label>
              Your name
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
                placeholder="e.g. Alex Rivera"
              />
            </label>

            <label>
              Student / team ID (optional)
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. team_014"
              />
            </label>

            {test.questions.map((q, i) => (
              <div className="q-card" key={q._id}>
                <h3>
                  Q{i + 1} · {q.type}
                </h3>
                <p>{q.prompt}</p>

                {(q.type === "text" || q.type === "image") && (
                  <label>
                    {q.type === "text" ? "Your answer" : "Notes (optional)"}
                    <textarea
                      value={textAnswers[q._id] || ""}
                      onChange={(e) =>
                        setTextAnswers((prev) => ({ ...prev, [q._id]: e.target.value }))
                      }
                      required={q.type === "text"}
                      rows={q.type === "text" ? 6 : 3}
                      placeholder={q.type === "text" ? "Type your answer…" : "Optional note"}
                    />
                  </label>
                )}

                {q.type === "image" && (
                  <label>
                    Image(s)
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      required
                      onChange={(e) =>
                        setImageFiles((prev) => ({ ...prev, [q._id]: e.target.files }))
                      }
                    />
                  </label>
                )}

                {q.type === "cad" && (
                  enableCad ? (
                    <label>
                      CAD file
                      <input
                        type="file"
                        accept=".stl,.step,.stp,.iges,.igs,.sldprt,.obj"
                        required
                        onChange={(e) =>
                          setCadFiles((prev) => ({
                            ...prev,
                            [q._id]: e.target.files?.[0] || null,
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <p className="msg err">CAD is disabled on this server (ENABLE_CAD=false).</p>
                  )
                )}
              </div>
            ))}

            <button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Submit"}
            </button>
          </form>
        )}

        {status.message && (
          <p className={status.type === "ok" ? "msg ok" : "msg err"}>{status.message}</p>
        )}
      </main>
    </div>
  );
}
