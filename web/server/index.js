import "dotenv/config";
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Submission from "./models/Submission.js";
import Test from "./models/Test.js";
import {
  checkOllama,
  gradeQuestion,
  graderConfig,
  summarizeSubmission,
  upsertGrade,
} from "./ollamaGrade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const ENABLE_CAD = String(process.env.ENABLE_CAD || "false").toLowerCase() === "true";
const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in web/server/.env — copy .env.example and paste your Atlas URI.");
  process.exit(1);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

function fileInfo(f) {
  return {
    originalName: f.originalname,
    filename: f.filename,
    path: `/uploads/${f.filename}`,
    mimeType: f.mimetype,
  };
}

function parseQuestions(raw) {
  let questions = raw;
  if (typeof questions === "string") {
    questions = JSON.parse(questions);
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Add at least one question.");
  }

  return questions.map((q, i) => {
    const type = String(q.type || "").toLowerCase();
    if (!["text", "image", "cad"].includes(type)) {
      throw new Error(`Question ${i + 1}: type must be text, image, or cad.`);
    }
    if (type === "cad" && !ENABLE_CAD) {
      throw new Error(`Question ${i + 1}: CAD is disabled (set ENABLE_CAD=true).`);
    }
    const prompt = String(q.prompt || "").trim();
    if (!prompt) throw new Error(`Question ${i + 1}: prompt is required.`);

    const expectedPoints = (q.expectedPoints || [])
      .map((p) => ({
        text: String(p.text || "").trim(),
        marks: Number(p.marks),
        fullMarks: String(p.fullMarks || "").trim(),
        partialMarks: String(p.partialMarks || "").trim(),
        zeroMarks: String(p.zeroMarks || "").trim(),
        evidenceToInspect: Array.isArray(p.evidenceToInspect)
          ? p.evidenceToInspect.map((item) => String(item || "").trim()).filter(Boolean)
          : String(p.evidenceToInspect || "").split("\n").map((item) => item.trim()).filter(Boolean),
      }))
      .filter((p) => p.text);

    if (expectedPoints.length === 0) {
      throw new Error(`Question ${i + 1}: add at least one expected answer + marks.`);
    }
    for (const p of expectedPoints) {
      if (!Number.isFinite(p.marks) || p.marks < 0) {
        throw new Error(`Question ${i + 1}: marks must be a number ≥ 0.`);
      }
    }

    return { type, prompt, expectedPoints };
  });
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, enableCad: ENABLE_CAD });
});

app.get("/api/config", (_req, res) => {
  res.json({ enableCad: ENABLE_CAD, grader: graderConfig() });
});

app.get("/api/grader", async (_req, res) => {
  res.json(await checkOllama());
});

// --- Tests (authored in admin; listed for students) ---

app.get("/api/tests", async (_req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    res.json(tests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load tests." });
  }
});

app.get("/api/tests/:id", async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: "Test not found." });
    res.json(test);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load test." });
  }
});

/** Student-safe view: prompts + types only (no expected answers / marks). */
app.get("/api/tests/:id/take", async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: "Test not found." });

    res.json({
      _id: test._id,
      name: test.name,
      description: test.description,
      questions: test.questions.map((q) => ({
        _id: q._id,
        type: q.type,
        prompt: q.prompt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load test." });
  }
});

app.post("/api/tests", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    if (!name) return res.status(400).json({ error: "Test name is required." });

    const questions = parseQuestions(req.body.questions);
    const test = await Test.create({ name, description, questions });
    res.status(201).json(test);
  } catch (err) {
    console.error(err);
    const msg = err.message || "Failed to create test.";
    res.status(400).json({ error: msg });
  }
});

// --- Submissions (always tied to a Test) ---

app.post("/api/submissions", upload.any(), async (req, res) => {
  try {
    const { studentName, studentId, testId } = req.body;
    if (!studentName?.trim()) {
      return res.status(400).json({ error: "studentName is required." });
    }
    if (!testId) {
      return res.status(400).json({ error: "testId is required." });
    }

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: "Test not found." });

    let answersPayload = req.body.answers;
    if (typeof answersPayload === "string") {
      try {
        answersPayload = JSON.parse(answersPayload);
      } catch {
        return res.status(400).json({ error: "Invalid answers payload." });
      }
    }
    if (!Array.isArray(answersPayload)) answersPayload = [];

    const files = req.files || [];
    const filesByField = {};
    for (const f of files) {
      if (!filesByField[f.fieldname]) filesByField[f.fieldname] = [];
      filesByField[f.fieldname].push(f);
    }

    const answers = test.questions.map((q, index) => {
      const fromClient = answersPayload.find(
        (a) => String(a.questionId) === String(q._id)
      ) || answersPayload[index] || {};

      const textAnswer = String(fromClient.textAnswer || "").trim();
      const imageFiles = filesByField[`images_${q._id}`] || filesByField[`images_${index}`] || [];
      const cadFiles = filesByField[`cadFile_${q._id}`] || filesByField[`cadFile_${index}`] || [];

      if (q.type === "text" && !textAnswer) {
        throw new Error(`Question ${index + 1}: text answer is required.`);
      }
      if (q.type === "image" && imageFiles.length === 0 && !textAnswer) {
        throw new Error(`Question ${index + 1}: upload at least one image (optional short note ok).`);
      }
      if (q.type === "cad") {
        if (!ENABLE_CAD) throw new Error("CAD submissions are disabled.");
        if (!cadFiles[0]) throw new Error(`Question ${index + 1}: CAD file is required.`);
      }

      return {
        questionId: q._id,
        textAnswer,
        images: imageFiles.map(fileInfo),
        cadFile: ENABLE_CAD && cadFiles[0] ? fileInfo(cadFiles[0]) : null,
      };
    });

    const submission = await Submission.create({
      testId: test._id,
      studentName: studentName.trim(),
      studentId: (studentId || "").trim(),
      answers,
    });

    res.status(201).json(submission);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to save submission." });
  }
});

app.get("/api/submissions", async (req, res) => {
  try {
    const filter = {};
    if (req.query.testId) filter.testId = req.query.testId;

    const submissions = await Submission.find(filter)
      .sort({ createdAt: -1 })
      .populate("testId");
    res.json(submissions.map(summarizeSubmission));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load submissions." });
  }
});

app.get("/api/submissions/:id", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id).populate("testId");
    if (!submission) return res.status(404).json({ error: "Not found." });
    res.json(summarizeSubmission(submission));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load submission." });
  }
});

// In-memory job state keeps the browser request short. The actual grading
// continues on the server and the UI polls this endpoint for progress.
const gradingJobs = new Map();

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function pruneGradingJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of gradingJobs) {
    const stamp = Date.parse(job.updatedAt || job.createdAt || 0);
    if (stamp < cutoff && job.status !== "running") gradingJobs.delete(id);
  }
}

async function gradeSubmissionQuestions(submission, questionIds, job) {
  const test = submission.testId;
  if (!test || !test.questions) throw new Error("Test is missing on this submission.");

  const ids = questionIds?.length
    ? questionIds.map(String)
    : test.questions.map((q) => String(q._id));
  const total = ids.length;
  let grades = submission.grades || [];
  const results = [];

  for (let index = 0; index < ids.length; index += 1) {
    const qid = ids[index];
    const question = test.questions.find((q) => String(q._id) === qid);
    if (!question) throw new Error(`Question ${qid} is not on this test.`);
    const answer = (submission.answers || []).find((a) => String(a.questionId) === qid);
    if (!answer) throw new Error(`No student answer for question ${qid}.`);

    const questionLabel = `Question ${index + 1} of ${total}`;
    updateJob(job, {
      current: index + 1,
      total,
      percent: Math.round((index / total) * 100),
      stage: `${questionLabel}: preparing`,
      currentQuestion: question.prompt,
    });

    try {
      const grade = await gradeQuestion({
        question,
        answer,
        uploadsDir,
        onProgress: ({ stage, stageProgress = 0 }) => {
          const fraction = Math.max(0, Math.min(1, Number(stageProgress) / 100));
          const percent = Math.min(99, Math.round(((index + fraction) / total) * 100));
          updateJob(job, {
            current: index + 1,
            total,
            percent,
            stage: `${questionLabel}: ${stage}`,
            currentQuestion: question.prompt,
          });
        },
      });
      grades = upsertGrade(grades, grade);
      results.push(grade);
    } catch (err) {
      const failed = {
        questionId: question._id,
        status: "error",
        score: 0,
        maxScore: (question.expectedPoints || []).reduce((s, p) => s + (Number(p.marks) || 0), 0),
        criterionScores: [],
        feedback: "",
        flagForReview: true,
        flagReason: "Grading failed.",
        model: "",
        error: err.message || "Grading failed.",
        gradedAt: new Date(),
      };
      grades = upsertGrade(grades, failed);
      results.push(failed);
    }

    // Save after each question so completed work is not lost if a later
    // question fails or the server is restarted.
    submission.grades = grades;
    submission.markModified("grades");
    await submission.save();
    updateJob(job, {
      current: index + 1,
      total,
      percent: Math.round(((index + 1) / total) * 100),
      stage: `${questionLabel}: saved`,
      currentQuestion: question.prompt,
    });
  }

  return results;
}

function startGradingJob(submissionId, questionIds = null) {
  pruneGradingJobs();
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job = {
    id: jobId,
    status: "running",
    percent: 0,
    current: 0,
    total: questionIds?.length || 0,
    stage: "Loading submission",
    currentQuestion: "",
    error: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
  };
  gradingJobs.set(jobId, job);

  // Deliberately do not await: the API returns immediately and the UI polls.
  (async () => {
    try {
      const submission = await Submission.findById(submissionId).populate("testId");
      if (!submission) throw new Error("Submission not found.");
      if (!questionIds?.length) {
        job.total = submission.testId?.questions?.length || 0;
      }
      await gradeSubmissionQuestions(submission, questionIds, job);
      const fresh = await Submission.findById(submission._id).populate("testId");
      updateJob(job, {
        status: "completed",
        percent: 100,
        stage: "Grading completed",
        result: summarizeSubmission(fresh),
      });
    } catch (err) {
      console.error("Background grading job failed:", err);
      updateJob(job, { status: "failed", error: err.message || "Grading failed." });
    }
  })();

  return job;
}

app.post("/api/submissions/:id/grade", async (req, res) => {
  try {
    const exists = await Submission.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ error: "Submission not found." });
    const job = startGradingJob(req.params.id);
    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to start grading." });
  }
});

app.post("/api/submissions/:id/questions/:questionId/grade", async (req, res) => {
  try {
    const exists = await Submission.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ error: "Submission not found." });
    const job = startGradingJob(req.params.id, [req.params.questionId]);
    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to start grading." });
  }
});

app.get("/api/grading-jobs/:jobId", (req, res) => {
  const job = gradingJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Grading job not found or expired." });
  const { id, status, percent, current, total, stage, currentQuestion, error, result } = job;
  res.json({ id, status, percent, current, total, stage, currentQuestion, error, result });
});

export { app, ENABLE_CAD, PORT, MONGODB_URI };

async function start() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB");

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    console.log(`CAD uploads: ${ENABLE_CAD ? "ENABLED" : "DISABLED (set ENABLE_CAD=true to turn on)"}`);
  });
}

// Only listen when run directly (smoke tests import { app } instead)
const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  start().catch((err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });
}
