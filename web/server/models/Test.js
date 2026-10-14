import mongoose from "mongoose";

/**
 * A "Test" is the grouping unit:
 * - many student Submissions
 * - one shared expected-answer sheet (from Excel)
 *
 * All submissions in the same Test are graded against the same expectedAnswers.
 * You can create many different Tests (different answer keys / different cohorts).
 */
const expectedAnswerSchema = new mongoose.Schema(
  {
    questionNumber: Number,
    question: String,
    expectedAnswer: String,
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    submissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Submission" }],
    expectedAnswers: { type: [expectedAnswerSchema], default: [] },
    answerKeyFile: {
      originalName: String,
      filename: String,
      path: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Test", testSchema);
