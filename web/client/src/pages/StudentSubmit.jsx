import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createSubmission, getConfig } from "../api";

export default function StudentSubmit() {
  const [enableCad, setEnableCad] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [images, setImages] = useState(null);
  const [cadFile, setCadFile] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getConfig()
      .then((c) => setEnableCad(Boolean(c.enableCad)))
      .catch(() => setEnableCad(false));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ type: "", message: "" });
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("studentName", studentName);
      fd.append("studentId", studentId);
      fd.append("textAnswer", textAnswer);

      if (images) {
        Array.from(images).forEach((file) => fd.append("images", file));
      }
      if (enableCad && cadFile) {
        fd.append("cadFile", cadFile);
      }

      await createSubmission(fd);
      setStatus({ type: "ok", message: "Submitted. Your work was saved." });
      setStudentName("");
      setStudentId("");
      setTextAnswer("");
      setImages(null);
      setCadFile(null);
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
        <p className="lead">
          Enter your answers below. Add pictures if the question asks for them.
          {enableCad
            ? " You can also attach a CAD file."
            : " CAD upload is turned off for now (text + pictures only)."}
        </p>

        <form className="form" onSubmit={onSubmit}>
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

          <label>
            Text answer
            <textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              required
              rows={8}
              placeholder="Type your answer here..."
            />
          </label>

          <label>
            Image(s)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImages(e.target.files)}
            />
          </label>

          {enableCad && (
            <label>
              CAD file (optional)
              <input
                type="file"
                accept=".stl,.step,.stp,.iges,.igs,.sldprt,.obj"
                onChange={(e) => setCadFile(e.target.files?.[0] || null)}
              />
            </label>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Submit"}
          </button>
        </form>

        {status.message && (
          <p className={status.type === "ok" ? "msg ok" : "msg err"}>{status.message}</p>
        )}
      </main>
    </div>
  );
}
