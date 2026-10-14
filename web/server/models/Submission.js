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

const submissionSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true },
    studentId: { type: String, default: "" },
    textAnswer: { type: String, required: true },
    images: { type: [fileSchema], default: [] },
    cadFile: { type: fileSchema, default: null },
    // Linked when an admin assigns this submission into a Test
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Submission", submissionSchema);
