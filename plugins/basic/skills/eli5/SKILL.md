---
name: eli5
description: Explain a topic at a 15-year-old level with a visual HTML artifact. Use when the user types /eli5 or asks for an accessible but substantive explainer with diagrams. 「/eli5」「ELI5」「15歳向けに説明して」「図解でわかりやすく説明して」「高校生向けに図解」「仕組みを図解で説明して」等のリクエスト時にも使う。
metadata:
  author: Anthropic
  adaptedBy: SugiKent
  source: https://github.com/anthropics/claude-plugins-community/tree/main/eli5
---

# eli5

Explain the topic as if the reader is **15 years old** — curious, literate, and able to follow cause-and-effect, but **not** a domain expert. Produce a **HTML artifact** that combines clear visuals with enough text to actually teach the idea.

Topic: $ARGUMENTS

## Audience level (15 years old)

Assume the reader:

- Understands everyday logic, basic science/math from school, and common tech terms
- Can follow multi-step explanations and simple abstractions (e.g. "layer", "protocol", "cache")
- Does **not** know jargon, edge cases, or professional workflows in this topic

Do **not** write for a 5-year-old. Avoid baby talk, overly cute metaphors, or dumbing down to single-word captions.

## What to include

- **Core concept** — what it is and why it matters (1–2 short paragraphs)
- **How it works** — 3–5 steps or components, with relationships shown visually
- **Key terms** — introduce necessary vocabulary with one-line definitions inline
- **One concrete example** — a realistic scenario the reader can picture
- **Common misconception** (optional) — one short "people often think X, but actually Y"

## HTML artifact guidelines

- Use a **single self-contained HTML file** with embedded CSS (no external deps required)
- **Visuals**: diagrams, flow arrows, labeled boxes, simple icons or CSS shapes — not stock-photo fluff
- **Text density**: enough prose to explain; aim for **short paragraphs + bullet lists**, not walls of text and not caption-only slides
- **Structure**: clear sections with headings; one main diagram per major step when helpful
- **Tone**: friendly and direct, like a good explainer video or textbook sidebar — not childish, not academic-paper dry

## What to avoid

- Treating the reader like a preschooler (no "imagine cookies" unless the metaphor genuinely clarifies)
- Skipping the mechanism and only giving analogies
- Overwhelming with implementation detail meant for practitioners
- Artifacts that are mostly empty space with one giant emoji per slide
