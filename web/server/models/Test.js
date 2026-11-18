import mongoose from "mongoose";

/**
 * A Test is authored in the admin UI:
 * - name + questions (text | image | cad)
 * - each question has a prompt and one or more expected answer "points"
 *   (text the grader looks for + marks for that point)
 *
 * Students pick a Test and submit against it (submission.testId).
 */
const expectedPointSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    marks: { type: Number, required: true, min: 0 },
    fullMarks: { type: String, default: "" },
    partialMarks: { type: String, default: "" },
    zeroMarks: { type: String, default: "" },
    evidenceToInspect: { type: [String], default: [] },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["text", "image", "cad"],
      required: true,
    },
    prompt: { type: String, required: true },
    expectedPoints: {
      type: [expectedPointSchema],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Each question needs at least one expected answer point.",
      },
    },
  },
  { _id: true }
);

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    questions: {
      type: [questionSchema],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A test needs at least one question.",
      },
    },
  },
  { timestamps: true }
);

testSchema.virtual("totalMarks").get(function totalMarks() {
  return (this.questions || []).reduce(
    (sum, q) =>
      sum + (q.expectedPoints || []).reduce((s, p) => s + (Number(p.marks) || 0), 0),
    0
  );
});

testSchema.set("toJSON", { virtuals: true });
testSchema.set("toObject", { virtuals: true });

export default mongoose.model("Test", testSchema);
