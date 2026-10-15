# AI Grader — prototype

## Web UI (student submit + admin Tests)

New folder: [`web/`](web/). Admins **build a Test** (questions + expected answer points with marks). Students pick that Test and submit; each submission stores the Test id. CAD optional via `ENABLE_CAD`.

On a new Windows PC:

```bat
cd web
SETUP.cmd
REM edit web\server\.env → MONGODB_URI
START.cmd
```

Full notes (MongoDB Atlas, CAD flag, **how to share a custom Ollama model**): [`web/README.md`](web/README.md). Do not run `ollama pull` until you are on the grading PC.

---

Grades two kinds of submissions for your CO2-car competition using Claude:

1. **Text / structured answers** — graded against a rubric + example answers at different quality bands.
2. **CAD design reviews** — graded from orthographic view images (front/top/side/iso), optionally combined with an automatic, non-AI dimension/weight check against your competition rules.

MCQs aren't included here since you said that part's already sorted with a plain answer-key script — that's the right call, no AI needed for objective questions.

## Do you have to pay?

The Claude API is normally pay-as-you-go (prepaid credits, no ongoing free tier) — but Anthropic gives every new Console account a one-time free credit (currently ~$5, needs phone verification to claim, availability can vary by region) to start with. Check your exact balance/terms at console.anthropic.com/settings/billing.

For a rough sense of scale: grading text answers is cheap (well under a cent each), CAD image reviews cost more per call since images use more tokens, but for ~90 teams across a handful of activities each, a full grading run is very likely in the low tens of dollars total, not hundreds — and you can cut that further by using the cheaper `claude-haiku-4-5-20251001` model. **Don't guess — run `--dry-run` first, then grade one small activity for real and check the actual cost on your Console's usage page before committing to the full run.**

If you'd rather not spend anything at all, there's a genuinely free path below.

## 1. Setup

```bash
cd ai_grader
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...     # get one at console.anthropic.com
```

## 2. Try it without spending anything

```bash
python run_grading.py --dry-run
```

This walks `data/submissions/`, matches each team/activity folder to a rubric in `rubrics/`, and reports what it *would* grade — no API calls. Use this to confirm your folder structure and rubric IDs line up before spending real requests. A sample text submission is already in there so you'll see output immediately.

## 3. Run it for real

```bash
python run_grading.py
```

Writes `results.json` and `results.csv` — one row per team/activity, with per-criterion scores, total score, AI feedback text, and a `flag_for_review` column for anything that needs a human to look at it.

## How submissions are laid out

```
data/submissions/
  <team_id>/
    <activity_id>/
      answer.txt                          # for a "text" rubric
      front.png top.png side.png iso.png  # for a "cad_review" rubric
      model.stl                           # optional, enables geometry check
```

**This is a stand-in for your database.** `iter_submissions()` in `run_grading.py` just walks folders — replace that one function with a query against your LMS's DB (pull team_id, activity_id, and the submitted text/file paths or blobs) and everything else works unchanged.

## Writing rubrics

Each rubric is a JSON file in `rubrics/`, named `<activity_id>.json` to match your activity IDs. Two examples are included — `aero_report_q3.json` (text) and `chassis_design_review.json` (CAD).

The single biggest lever for grading quality is the `reference_answers` (text) / `reference_notes` (CAD) field. **Give 2–3 examples spanning excellent/average/poor, not one "ideal" answer** — that's what actually lets the model calibrate a score scale, rather than just checking for keyword overlap with one model answer. Pull these from real past submissions your team has already scored by hand if you have any from previous years.

## How CAD grading works

- The model looks at the images you provide (front/top/side/iso) and judges *design quality*: correct drafting convention, labeling, mount design, aerodynamic reasoning, manufacturability. It's told explicitly not to trust pixel measurements.
- If you also drop a `model.stl` export in the submission folder, `grader/geometry.py` computes exact length/width/height/estimated weight with `trimesh` and checks them against `geometry_constraints` in the rubric — this is deterministic, not AI, so it's exact and free. Any violation auto-flags the submission for review.
- **Native CAD files (STEP/SLDPRT/IGES) aren't parsed directly** — ask teams to export an STL alongside their view images (one click in any CAD tool). If you truly need to read native formats, `grader/geometry.py` is the place to add `cadquery` or `pythonocc-core`, but that's a heavier install and usually unnecessary if you standardize on STL exports.

## Free version — no API key, no bill

Run everything on your own computer with [Ollama](https://ollama.com) instead of the Claude API:

```bash
# 1. Install the Ollama app: https://ollama.com/download
# 2. Pull the models (one-time download, several GB each):
ollama pull llama3.1:8b        # for text answers
ollama pull llama3.2-vision    # for CAD image review

# 3. Install the local grading dependency
pip install -r requirements-local.txt

# 4. Run — no ANTHROPIC_API_KEY needed at all
python run_grading.py --provider local --dry-run
python run_grading.py --provider local
```

Be honest with yourself about the tradeoffs before you commit to this for the real competition:

- **Grading quality is noticeably weaker**, especially on the CAD image reviews — open vision models are well behind Claude at this kind of nuanced judgment call in 2026. Expect to lean more heavily on the human-review queue.
- **It's slower.** On a plain laptop CPU, grading dozens of CAD submissions could take hours. A GPU (even a modest gaming GPU) helps a lot; without one, budget real time for this.
- **RAM matters.** 16GB+ is a comfortable minimum for these model sizes. If your machine struggles, drop to a smaller model like `llama3.2:3b` for text (edit `DEFAULT_TEXT_MODEL` in `grader/local_client.py`, or pass `--text-model`).
- You can mix providers: use `--provider local` for a first cheap/free pass across everyone, then re-run just the `flag_for_review` ones through `--provider anthropic` for a stronger second opinion where it matters most.

## Choosing a model

`grader/client.py` defines three tiers — pass `--model` to `run_grading.py` or edit `MODEL_DEFAULT`:

- `claude-haiku-4-5-20251001` — cheapest, good for a fast first pass or MCQ-adjacent triage
- `claude-sonnet-5` — the default, solid balance of judgment quality and cost for most grading
- `claude-opus-5-5` — reserve for borderline scores, disputes, or final-round judging where you want the strongest reasoning

## Before you trust this on real scores

1. Run it on ~15–20 submissions your team has already graded by hand.
2. Compare AI scores to your human scores. Where they disagree, check whether the rubric was ambiguous, the reference examples were too thin, or the model genuinely got it wrong — then tighten the rubric text or add reference examples and rerun.
3. Keep `flag_for_review` items in a human queue always. This is a national competition with rankings at stake — use AI to do the first pass and draft feedback, not as the sole judge, especially near cutoff scores.

## Scaling to 90+ teams

Once your rubrics are calibrated, grading a few hundred to low-thousands of submissions one-by-one (as this script does) is fine but slow/serial. For a big batch, look at Anthropic's **Message Batches API** — you submit a whole activity's worth of submissions as one batch, it processes asynchronously at roughly half the per-request cost. The request/response shape is the same `messages.create` call, just submitted as a batch array instead of one at a time — worth wiring in once you're running this at full scale. Docs: https://docs.claude.com/en/docs/build-with-claude/batch-processing

## A security note

Submissions come from 90+ external teams you don't fully control. Every prompt in this project wraps submitted content clearly as data (`<submission>` tags, or as labeled images) and explicitly instructs the model to never treat submission content as instructions, flagging anything that looks like an injection attempt instead of complying with it. Keep that pattern if you extend the prompts — never let raw submission text get concatenated into the *instructions* part of a prompt.
