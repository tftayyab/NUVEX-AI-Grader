#!/usr/bin/env python3
"""
Grades every submission under data/submissions/ against the matching rubric
in rubrics/, and writes results.json + results.csv.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python run_grading.py --dry-run          # check folders/rubrics line up, no calls, no cost
    python run_grading.py                    # real grading run, paid Claude API (default, best quality)
    python run_grading.py --provider local   # real grading run, FREE, runs locally via Ollama

Folder structure expected under data/submissions/:
    <team_id>/<activity_id>/answer.txt                       (type: "text")
    <team_id>/<activity_id>/front.png, top.png, side.png...  (type: "cad_review")
    <team_id>/<activity_id>/model.stl                         (optional, enables geometry check)

When you wire this into your real LMS, replace iter_submissions() with a
query against your database -- everything downstream (grading calls, results
output) stays exactly the same.
"""
import argparse
import csv
import json
from pathlib import Path

from grader.text_grader import grade_text_submission
from grader.cad_grader import grade_cad_submission
from grader.geometry import check_geometry


def load_rubric(rubrics_dir: Path, activity_id: str) -> dict:
    return json.loads((rubrics_dir / f"{activity_id}.json").read_text())


def iter_submissions(submissions_dir: Path):
    """Yields (team_id, activity_id, submission_path). Swap this for a DB query in production."""
    for team_dir in sorted(p for p in submissions_dir.iterdir() if p.is_dir()):
        for activity_dir in sorted(p for p in team_dir.iterdir() if p.is_dir()):
            yield team_dir.name, activity_dir.name, activity_dir


def grade_one(client, rubric: dict, submission_path: Path, dry_run: bool) -> dict:
    if rubric["type"] == "text":
        answer_file = submission_path / "answer.txt"
        text = answer_file.read_text() if answer_file.exists() else ""
        if dry_run:
            return {"dry_run": True, "would_grade_chars": len(text)}
        return grade_text_submission(client, rubric, text)

    if rubric["type"] == "cad_review":
        view_images = {
            v: str(submission_path / f"{v}.png")
            for v in rubric.get("required_views", [])
            if (submission_path / f"{v}.png").exists()
        }
        verified_geometry = None
        stl_path = submission_path / "model.stl"
        if stl_path.exists() and "geometry_constraints" in rubric:
            verified_geometry = check_geometry(str(stl_path), rubric["geometry_constraints"])
        if dry_run:
            return {"dry_run": True, "views_found": list(view_images), "geometry": verified_geometry}

        result = grade_cad_submission(client, rubric, view_images, verified_geometry)
        if verified_geometry:
            result["geometry_check"] = verified_geometry
            if verified_geometry["violations"]:
                result["flag_for_review"] = True
                reason = "; ".join(verified_geometry["violations"])
                result["flag_reason"] = (result.get("flag_reason") or "") + f" | Geometry violations: {reason}"
        return result

    raise ValueError(f"Unknown rubric type: {rubric['type']}")


def write_results(results: list):
    Path("results.json").write_text(json.dumps(results, indent=2))
    if not results:
        return
    scalar_keys = sorted({
        k for r in results for k, v in r.items()
        if not isinstance(v, (list, dict))
    })
    fieldnames = ["team_id", "activity_id"] + [k for k in scalar_keys if k not in ("team_id", "activity_id")]
    with open("results.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow({k: r.get(k, "") for k in fieldnames})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submissions-dir", default="data/submissions")
    ap.add_argument("--rubrics-dir", default="rubrics")
    ap.add_argument("--provider", choices=["anthropic", "local"], default="anthropic",
                     help="'anthropic' = paid Claude API (best quality). 'local' = free, runs on your machine via Ollama.")
    ap.add_argument("--model", default=None, help="Anthropic model override (provider=anthropic only)")
    ap.add_argument("--text-model", default=None, help="Ollama text model override (provider=local only)")
    ap.add_argument("--vision-model", default=None, help="Ollama vision model override (provider=local only)")
    ap.add_argument("--dry-run", action="store_true", help="Check plumbing/files without calling any model")
    args = ap.parse_args()

    submissions_dir = Path(args.submissions_dir)
    rubrics_dir = Path(args.rubrics_dir)

    client = None
    if not args.dry_run:
        if args.provider == "anthropic":
            from grader.client import GraderClient, MODEL_DEFAULT
            client = GraderClient(model=args.model or MODEL_DEFAULT)
        else:
            from grader.local_client import LocalGraderClient, DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL
            client = LocalGraderClient(
                text_model=args.text_model or DEFAULT_TEXT_MODEL,
                vision_model=args.vision_model or DEFAULT_VISION_MODEL,
            )

    results = []
    for team_id, activity_id, path in iter_submissions(submissions_dir):
        rubric_file = rubrics_dir / f"{activity_id}.json"
        if not rubric_file.exists():
            print(f"[skip] no rubric for activity '{activity_id}' (team {team_id})")
            continue
        rubric = load_rubric(rubrics_dir, activity_id)
        print(f"Grading team={team_id} activity={activity_id} ...")
        try:
            result = grade_one(client, rubric, path, args.dry_run)
        except Exception as e:
            result = {"error": str(e), "flag_for_review": True, "flag_reason": f"Grading failed: {e}"}
        result["team_id"] = team_id
        result["activity_id"] = activity_id
        results.append(result)

    write_results(results)
    print(f"\nDone. {len(results)} submissions processed. See results.json / results.csv")

    flagged = [r for r in results if r.get("flag_for_review")]
    if flagged:
        names = ", ".join(f"{r['team_id']}/{r['activity_id']}" for r in flagged)
        print(f"{len(flagged)} flagged for human review: {names}")


if __name__ == "__main__":
    main()
