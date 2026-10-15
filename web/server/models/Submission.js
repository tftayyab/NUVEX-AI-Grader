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

const submissionSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
    studentName: { type: String, required: true },
    studentId: { type: String, default: "" },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Submission", submissionSchema);
