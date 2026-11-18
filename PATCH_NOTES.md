# NUVEX AI Grader - image assessment improvements

This update improves the image-analysis and grading pipeline while keeping existing tests and submissions compatible.

## Changes
- Replaced the generic visual-inspection prompt with criterion-focused visual evidence extraction.
- The vision model now receives the actual question and every criterion, plus optional visual evidence requirements.
- Added optional per-criterion rubric guidance: full marks, partial marks, zero marks, and evidence to inspect.
- Added rubric fields to the Admin Build Test form, API validation, and MongoDB schema. Existing saved tests remain valid because all new fields are optional.
- Strengthened grading instructions to avoid guessing hidden geometry, estimating dimensions from pixels, or treating cropped/unclear evidence as definitely absent.
- Image grading still sends the original image to the grading model; the visual analysis is supporting evidence, not the source of truth.
- Poor image quality, unreadable text, failed image analysis, and incomplete model output trigger human review.
- Added CPU-oriented Ollama settings (`OLLAMA_NUM_THREADS`, `OLLAMA_NUM_CTX`) and increased the inference timeout for slower CPU-only systems.

## Recommended local model for the supplied hardware
For an Intel i5 6th generation CPU, 16 GB RAM, and integrated graphics, use `qwen3-vl:4b` as the recommended CPU-first vision model. It will be slower than a model running on a dedicated GPU. The 4B model is a compromise between visual capability and memory use; CPU-only inference will still be slow. Use `qwen2.5vl:3b` if Qwen3-VL is too slow or your Ollama version is too old.

In `web/server/.env`, set:

```env
OLLAMA_TEXT_MODEL=llama3.2:3b
OLLAMA_VISION_MODEL=qwen3-vl:4b
OLLAMA_NUM_THREADS=4
OLLAMA_NUM_CTX=6144
```

Pull it once with:

```bash
ollama pull qwen3-vl:4b
```

Qwen3-VL requires Ollama 0.12.7 or newer. See the official [Ollama model page](https://ollama.com/library/qwen3-vl).

## Validation
- Node syntax checks passed for the changed server files.
- Frontend build could not be completed in this packaging environment because the pre-existing `node_modules` directory is missing the platform-specific Rolldown native binding. On the user's Windows machine, run `npm install` in `web/client`, then `npm run build`.
- The smoke test could not complete here because `mongodb-memory-server` needed to download a MongoDB binary and network DNS was unavailable in this environment. This is an environment limitation, not a reported passing test.


## Grading progress and timeout improvements

- Grading now runs as a background server job; the browser polls job progress instead of waiting for one long HTTP request.
- The Results page displays a 0–100% progress bar, active question/stage, and elapsed time.
- Each completed question is saved immediately, so a later question failure does not discard earlier grades.
- The default image model is now `qwen3-vl:2b-instruct`, a smaller CPU-friendlier choice for 16GB RAM systems without a dedicated GPU.
- Default Ollama inference timeout is 30 minutes and can be changed with `OLLAMA_TIMEOUT_MS`.
- Image questions use one multimodal grading call by default rather than two sequential vision calls. Set `OLLAMA_TWO_PASS_VISION=true` only if you specifically want the slower separate visual-analysis pass.
