---
name: eli5
description: Explain a topic at a 10-year-old level with a visual HTML artifact. Use when the user types /eli5 or asks for a simple, picture-first explainer with diagrams. 「/eli5」「ELI5」「10歳向けに説明して」「子どもにもわかるように説明して」「小学生向けに図解」「図解でわかりやすく説明して」「仕組みを図解で説明して」等のリクエスト時にも使う。
metadata:
  author: Anthropic
  adaptedBy: SugiKent
  source: https://github.com/anthropics/claude-plugins-community/tree/main/eli5
---

# eli5

Explain the topic as if the reader is **10 years old** — curious and eager to learn, but with only elementary-school knowledge. Produce a **HTML artifact** where pictures carry the idea and short, plain sentences back them up.

Topic: $ARGUMENTS

## Audience level (10 years old)

Assume the reader:

- Knows everyday life, basic arithmetic, and things they see at home, school, or in games
- Can follow a short chain of "this happens, so that happens" (about 3 steps at a time)
- Does **not** know technical words or abstract concepts like "protocol", "abstraction", or "variable"

The goal is still to explain the real mechanism, just with simpler words — a 10-year-old can understand how things work when each step is concrete.

## What to include

- **Core concept** — what it is and why it matters, in 2–3 short sentences
- **How it works** — 3–4 steps, each with a picture and 1–3 sentences
- **Key words** — only the few words the reader really needs, each explained with a familiar comparison
- **One concrete example** — a scene from daily life (school, home, shopping, games) the reader can picture
- **Common misconception** (optional) — one short "you might think X, but actually Y"

## HTML artifact guidelines

- Use a **single self-contained HTML file** with embedded CSS (no external deps required)
- **Visuals first**: each step gets a diagram, flow arrows, labeled boxes, or simple icons, so the picture alone gives the gist
- **Text**: short sentences, one idea per sentence; replace jargon with everyday words, or explain it the first time it appears
- **Structure**: clear sections with question-style headings (e.g. "What happens next?")
- **Tone**: warm and encouraging, like a good teacher or a kids' science show — friendly, but never talking down

## What to avoid

- Using technical terms without explaining them
- Skipping the mechanism and only giving analogies — use the analogy to lead into how it actually works
- Long paragraphs or dense bullet lists
- Metaphors that are cute but wrong about how the thing works
