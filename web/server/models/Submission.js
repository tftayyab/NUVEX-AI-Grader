import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    originalName: String,
    filename: String,
    path: String,
    mimeType: String,
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    textAnswer: { type: String, default: "" },
    images: { type: [fileSchema], default: [] },
    cadFile: { type: fileSchema, default: null },
  },
  { _id: false }
);

const criterionScoreSchema = new mongoose.Schema(
  {
    name: String,
    score: Number,
    max: Number,
    justification: String,
  },
  { _id: false }
);

const gradeSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ["pending", "graded", "error"], default: "graded" },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    criterionScores: { type: [criterionScoreSchema], default: [] },
    feedback: { type: String, default: "" },
    flagForReview: { type: Boolean, default: false },
    flagReason: { type: String, default: "" },
    model: { type: String, default: "" },
    error: { type: String, default: "" },
    gradedAt: Date,
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
    studentName: { type: String, required: true },
    studentId: { type: String, default: "" },
    answers: { type: [answerSchema], default: [] },
    grades: { type: [gradeSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Submission", submissionSchema);
