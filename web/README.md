# NUVEX web app (student + admin)

React frontend + Express/MongoDB API for collecting student work and grouping it into **Tests**.

## Word we use: **Test**

A **Test** is the unit that ties things together:

- You select many student **Submissions**
- You attach **one Excel/CSV answer key** (same expected answers for everyone in that group)
- You can create **many different Tests** (different cohorts / different keys)

Later, grading will run per Test: student answers vs that Test’s expected answers.

## What students see (`/`)

1. Short “Start” intro  
2. Text answer  
3. Image upload(s)  
4. CAD upload — **only if** `ENABLE_CAD=true` in `server/.env` (default **off** so you can test text + pics first)

## What admins see (`/admin`)

- List submissions (filter unassigned)
- Multi-select
- Create a **Test** + upload Excel answer key (`question` / `answer` columns — see `sample-answer-key.csv`)
- Browse existing Tests and their expected-answer rows

## New PC setup (Windows CMD)

```bat
cd web
SETUP.cmd
```

Then edit `web\server\.env` and set `MONGODB_URI` from [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free M0 cluster).

Start both servers:

```bat
cd web
START.cmd
```

Or manually:

```bat
cd web\server
npm run dev

cd web\client
npm run dev
```

- Student UI: http://localhost:5173  
- Admin UI: http://localhost:5173/admin  

### Turn CAD on later

In `web\server\.env`:

```env
ENABLE_CAD=true
```

Restart the API.

## MongoDB Atlas (free)

1. Sign up → create **M0 free** cluster  
2. **Database Access** → create user  
3. **Network Access** → `0.0.0.0/0` (ok for early testing)  
4. **Connect → Drivers** → copy URI into `MONGODB_URI`  
5. Replace `<password>` and optionally set DB name to `nuvex_grader`

## Env files

| File | Purpose |
|------|---------|
| `server/.env.example` | Copy → `server/.env` |
| `client/.env.example` | Copy → `client/.env` (optional) |

Never commit real `.env` files.

---

## Ollama on another PC (read before you pull models)

You asked not to run Ollama here — good. On the home/grading PC:

1. Install [Ollama](https://ollama.com/download)  
2. Pull base models once (several GB):

```bat
ollama pull llama3.1:8b
ollama pull llama3.2-vision
```

3. Install Python local deps from repo root:

```bat
pip install -r requirements-local.txt
```

4. Run grader with local provider when ready:

```bat
python run_grading.py --provider local --dry-run
```

### “Trained” model vs base model — important

Ollama’s normal `ollama pull` models are **not** your private trained weights. If everyone only does `ollama pull llama3.1:8b`, they all get the **same public base model**, not your custom grading brain.

If you customize a model (fine-tune, or more commonly an **Ollama Modelfile** with your system prompt / adapters), others will **not** get that automatically. You must **ship your model artifact** to them.

### How to give someone else your custom Ollama model

**Option A — easiest for a small team: copy the model files (USB / drive / zip)**

On the machine that has the trained/custom model:

```bat
ollama list
```

Find your model name (e.g. `nuvex-grader`). Then either:

1. **Modelfile + base model** (if you only customized with a Modelfile): share your `Modelfile` and tell them to `ollama pull` the `FROM` base model, then `ollama create nuvex-grader -f Modelfile`.

2. **Full local model export** (when you need the actual weights you built):
   - Models live under `%USERPROFILE%\.ollama\models` on Windows.
   - Sharing that folder raw is brittle. Prefer:

```bat
ollama create nuvex-grader -f Modelfile
```

   Or use Ollama’s export/import style workflow for your version:

```bat
:: On source PC — create a portable archive of the model
ollama show nuvex-grader --modelfile > Modelfile.nuvex
```

   Then on the other PC: install Ollama, pull the same `FROM` base (if needed), run `ollama create nuvex-grader -f Modelfile.nuvex`.

If you fine-tuned with LoRA/GGUF offline, convert/import into Ollama once on your machine, then distribute via **Option B**.

**Option B — private registry / Hugging Face / shared drive GGUF**

1. Export or keep your GGUF (or Modelfile + blobs)  
2. Put it on a private Drive / HF private repo / NAS  
3. Other PCs download the file and:

```bat
ollama create nuvex-grader -f Modelfile
```

where `Modelfile` points at the local GGUF (`FROM ./nuvex-grader.gguf`).

**Option C — one grading machine (recommended for competitions)**

Don’t give every teacher a copy of the model. Run grading on **one** trusted PC (or one server) that has:

- Ollama + your custom model  
- MongoDB Atlas connection  
- Admin UI / `run_grading.py`

Everyone else only uses the **student web form**. That avoids “everyone starts with a fresh empty model.”

### What “new model” means when someone starts fresh

| They install | They get |
|--------------|----------|
| Ollama + `ollama pull llama3.1:8b` | Generic public model — **not** your trained grader |
| Your Modelfile / GGUF / shared model name | Your custom behavior |
| Only the web app | No local model at all (submissions go to MongoDB; grade later on the grading PC) |

**Practical plan for you:** pull/train on home PC → keep that as the grading machine → others pull this git repo and only run `web\SETUP.cmd` + Atlas URI. Share the custom Ollama model only with people who will actually run grading.

---

## Folder layout

```
web/
  SETUP.cmd / START.cmd
  sample-answer-key.csv
  server/          Express + MongoDB + uploads
  client/          React (Vite)
```
