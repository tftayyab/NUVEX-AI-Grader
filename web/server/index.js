import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import Submission from "./models/Submission.js";
import Test from "./models/Test.js";

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

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, enableCad: ENABLE_CAD });
});

app.get("/api/config", (_req, res) => {
  res.json({ enableCad: ENABLE_CAD });
});

// Student: create a submission (text + images; CAD only if ENABLE_CAD)
app.post(
  "/api/submissions",
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "cadFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { studentName, studentId, textAnswer } = req.body;
      if (!studentName?.trim() || !textAnswer?.trim()) {
        return res.status(400).json({ error: "studentName and textAnswer are required." });
      }

      const images = (req.files?.images || []).map((f) => ({
        originalName: f.originalname,
        filename: f.filename,
        path: `/uploads/${f.filename}`,
        mimeType: f.mimetype,
      }));

      let cadFile = null;
      if (ENABLE_CAD && req.files?.cadFile?.[0]) {
        const f = req.files.cadFile[0];
        cadFile = {
          originalName: f.originalname,
          filename: f.filename,
          path: `/uploads/${f.filename}`,
          mimeType: f.mimetype,
        };
      }

      const submission = await Submission.create({
        studentName: studentName.trim(),
        studentId: (studentId || "").trim(),
        textAnswer: textAnswer.trim(),
        images,
        cadFile,
      });

      res.status(201).json(submission);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save submission." });
    }
  }
);

// Admin: list submissions (optionally unassigned only)
app.get("/api/submissions", async (req, res) => {
  try {
    const filter = {};
    if (req.query.unassigned === "true") filter.testId = null;
    if (req.query.testId) filter.testId = req.query.testId;

    const submissions = await Submission.find(filter).sort({ createdAt: -1 });
    res.json(submissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load submissions." });
  }
});

app.get("/api/submissions/:id", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found." });
    res.json(submission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load submission." });
  }
});

// Admin: create a Test from selected submissions + Excel answer key
// A "Test" = one shared expected-answer sheet applied to many student submissions.
app.post(
  "/api/tests",
  upload.single("answerKey"),
  async (req, res) => {
    try {
      const { name, description } = req.body;
      let submissionIds = req.body.submissionIds;

      if (typeof submissionIds === "string") {
        try {
          submissionIds = JSON.parse(submissionIds);
        } catch {
          submissionIds = submissionIds.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      if (!name?.trim()) {
        return res.status(400).json({ error: "Test name is required." });
      }
      if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
        return res.status(400).json({ error: "Select at least one submission." });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Upload an Excel answer-key file (.xlsx / .xls / .csv)." });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

      // Expect columns like: question | answer  (case-insensitive) OR Question 1 / Answer 1 style rows
      const expectedAnswers = rows.map((row, i) => {
        const keys = Object.keys(row);
        const qKey = keys.find((k) => /question/i.test(k)) || keys[0];
        const aKey = keys.find((k) => /answer|expected|key/i.test(k)) || keys[1];
        return {
          questionNumber: i + 1,
          question: String(row[qKey] ?? "").trim(),
          expectedAnswer: String(row[aKey] ?? "").trim(),
        };
      }).filter((r) => r.question || r.expectedAnswer);

      const test = await Test.create({
        name: name.trim(),
        description: (description || "").trim(),
        submissionIds,
        expectedAnswers,
        answerKeyFile: {
          originalName: req.file.originalname,
          filename: req.file.filename,
          path: `/uploads/${req.file.filename}`,
        },
      });

      await Submission.updateMany(
        { _id: { $in: submissionIds } },
        { $set: { testId: test._id } }
      );

      const populated = await Test.findById(test._id).populate("submissionIds");
      res.status(201).json(populated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create test." });
    }
  }
);

app.get("/api/tests", async (_req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 }).populate("submissionIds");
    res.json(tests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load tests." });
  }
});

app.get("/api/tests/:id", async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate("submissionIds");
    if (!test) return res.status(404).json({ error: "Not found." });
    res.json(test);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load test." });
  }
});

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`CAD uploads: ${ENABLE_CAD ? "ENABLED" : "DISABLED (set ENABLE_CAD=true to turn on)"}`);
});
