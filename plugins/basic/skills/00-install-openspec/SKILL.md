---
name: 00-install-openspec
description: "OpenSpec (Fission-AI/OpenSpec) を user scope（`~/.claude/skills` / `~/.codex/skills`）に install し、そこで日本語化と個人開発向けカスタマイズ（proposal / apply / archive スキルの書き換え）を適用するスキル。user scope に一度訳せば全プロジェクトで共有され、プロジェクト側は `openspec init . --tools none` で `openspec/` データディレクトリだけを scaffold する。初回だけでなく OpenSpec のバージョンアップ後の再 install でも毎回呼び出し、翻訳とカスタマイズを再適用する。「OpenSpec を入れて」「openspec install」「openspec を更新」「proposal / apply の書き換え」等の発話・タスク要求時に使用。"
---

# このスキルの位置付け

OpenSpec は英語で配布され、かつ素の状態では個人開発の運用方針と合わない。
このスキルは **OpenSpec の skill 本体（instruction files）を user scope に install し、そこで日本語化 + カスタマイズを行う** 。

user scope に一度訳せば、その内容は **全プロジェクトで共有** される。個々のプロジェクトは
`openspec/` データディレクトリ（specs / changes の保管場所）だけを持てばよく、翻訳済みの skill は
user scope のものを使う。

OpenSpec を user scope に再生成すると翻訳・カスタマイズは英語ストックに上書きで消えるため、
バージョンアップ後の再 install では「前回適用したから今回はスキップ」という判断を **絶対にしない** 。毎回すべて再適用する。

---

## なぜ user scope か（旧 per-project 方式との違い）

旧方式は各プロジェクトの `.claude/skills/openspec-*` に install していたため、
プロジェクトごとに `openspec init` が skill を英語で再生成し、**翻訳を毎回上書きで消していた** 。

user scope 方式では翻訳は `~/.claude/skills/` に **一度だけ** 当てる。プロジェクト側は後述の
`openspec init . --tools none` で skill を生成しないため、**per-project の init は翻訳を一切壊さない** 。

user scope の翻訳が消えるのは `openspec init ~ --force`（＝バージョンアップ時の再 install）のときだけ。
その場合はこのスキルを再実行して全再適用する。

---

## ⚠️ 最重要注意: `openspec init ~ --force` は user scope の翻訳を全消しする

`openspec init ~ --tools <csv> --force` は、user scope の
`~/.claude/skills/openspec-*/SKILL.md` / `~/.claude/commands/opsx/*.md`、
codex の `~/.codex/skills/openspec-*/SKILL.md` を **英語ストックに再生成・上書き** する。

- **翻訳・カスタマイズを当てた後に `openspec init ~` / `openspec update ~` を実行してはならない。** 健全性確認のつもりでも叩かない。全訳が消える。
- 一方、プロジェクト側の `openspec init . --tools none --force` は skill を生成しないため **何度実行しても安全** 。
- 検証は後述の **`openspec list`（project 内）と `ls ~/.claude/skills`** で行う（読み取り専用。ファイルを再生成しない）。

`openspec/config.yaml` の `context` / `rules` は再生成で上書きされない（プロジェクトごとのカスタマイズ置き場）。

---

# Step 1: 対象ツールの確定

1. どのツール向けに install するかを `AskUserQuestion` で確定する。選択肢は最低限
   **「claude」「codex」「両方」** を提示する。
   - 既存の `~/.claude/skills/openspec-*` / `~/.codex/skills/openspec-*` の有無を確認して現状を裏取りする。
2. 確定したツールを CSV（例: `claude`、`codex`、`claude,codex`）として控える。次の Step で `--tools` に渡す。

# Step 2: `openspec init ~ --tools <csv> --force`（＝唯一の user scope 再生成）

- Step 1 で確定した CSV を使って `openspec init ~ --tools <csv> --force` を実行する。
- **これが user scope の skill を再生成する唯一のタイミング。以降の Step では `openspec init ~` を触らない。**
- 生成物（1.5.0 実態）:
  - claude: `~/.claude/skills/openspec-*/SKILL.md`（skills 運用の本体）
    - delivery=both 構成だと `~/.claude/commands/opsx/*.md`（スラッシュコマンド）も生成される
  - codex: `~/.codex/skills/openspec-*/SKILL.md`
  - 共通: `~/openspec/config.yaml`（user scope の config。害はないので残してよい）
- 現行の skill は 5 つ: `openspec-propose` / `openspec-apply-change` / `openspec-explore` / `openspec-archive-change` / `openspec-sync-specs`。

# Step 3: 再 install 時の手動編集の確認（初回はスキップ）

バージョンアップ後の再 install では、Step 2 で user scope の skill が英語ストックに戻る。
本 skill が毎回再適用する翻訳・標準カスタマイズ（Step 4）とは別に、過去に user scope の skill へ
**手動で加えた汎用的な調整** が存在し得る。あれば控えておき、Step 4 適用後に復元する。

- `~/.claude` が git 管理下なら `git -C ~/.claude show HEAD:<path>` / `git -C ~/.claude diff` で前回内容を確認する。
- 標準カスタマイズ（proposal / apply / archive）は Step 4 で必ず再生成されるため退避不要。

# Step 4: user scope 生成ファイルの日本語化 + カスタマイズ（＝最後のファイル変更）

以下の references を **すべて読み込み、各指示をその都度適用する** 。**これがワークフロー中で最後のファイル変更**であり、
この後に `openspec init ~` を挟んではならない。対象は user scope（`~/.claude/skills/openspec-*` / `~/.codex/skills/openspec-*`）。

1. `references/translate.md` — 全生成ファイル（claude / codex の skill、必要なら commands）を日本語化する手順
2. `references/proposal.md` — `openspec-propose` skill への書き換え指示
3. `references/apply.md` — `openspec-apply-change` skill への書き換え指示
4. `references/archive.md` — `openspec-archive-change` skill への書き換え指示（archive 時に固定で sync now）

## カスタマイズ対応表

| 生成物                          | 適用                          |
|---------------------------------|-------------------------------|
| `openspec-propose` skill        | 翻訳 ＋ `references/proposal.md` |
| `openspec-apply-change` skill   | 翻訳 ＋ `references/apply.md`    |
| `openspec-explore` skill        | 翻訳のみ                      |
| `openspec-archive-change` skill | 翻訳 ＋ `references/archive.md`  |
| `openspec-sync-specs` skill     | 翻訳のみ                      |

claude と codex の skill ファイルは内容・frontmatter とも同一なので、1 回訳して両方の同名ファイルへ `cp` してよい（詳細は translate.md）。

Step 3 で控えた手動編集があれば、この Step の適用後に対応箇所へ復元する。

# Step 5: commands の削除（skills-only 運用の場合のみ）

skills のみで運用する場合、user scope に生成された commands を削除する。

- 実行: `rm -rf ~/.claude/commands/opsx`
- commands も使う運用（skills-only でない）なら、この Step はスキップし、commands も Step 4 で翻訳対象に含める。

# Step 6: 検証

- user scope の配置確認: `ls ~/.claude/skills`（および対象なら `ls ~/.codex/skills`）で翻訳済み skill が並んでいるか目視する。
- `openspec list` は **project 内** で実行して読み取り専用で確認する（`openspec init ~` を検証目的で再実行しない）。
- 翻訳内容に大きな欠落・誤訳がないかを目視で確認する。

# Step 7: プロジェクトでの利用方法（案内）

各プロジェクトでは skill を再生成せず、`openspec/` データディレクトリだけを scaffold する:

```
openspec init . --tools none --force
```

- `--tools none` なので `.claude/skills` は生成されず、user scope の翻訳済み skill がそのまま使われる。
- これは何度実行しても user scope の翻訳を壊さない。
- プロジェクト固有のカスタマイズは `openspec/config.yaml` の `context` / `rules` に書く。

# 完了報告（必須）

以下を含むサマリーをユーザーに報告する:

- OpenSpec の install / 再 install の実施有無とバージョン、および対象ツール（claude / codex / 両方）
- user scope（`~/.claude/skills` / `~/.codex/skills`）へ install したこと
- 日本語化の実施範囲（どの skill / commands を訳したか）
- proposal / apply / archive への書き換えの適用内容
- commands を削除したか（skills-only 運用か）
- 復元した手動編集があればその一覧
- `AskUserQuestion` で確認した内容と、その決定
- 失敗・スキップしたものがあれば、その理由
- プロジェクトでの利用は `openspec init . --tools none --force` である旨の案内

---

# 復旧手順（誤って再生成して翻訳が消えた場合）

翻訳後に誤って `openspec init ~ --force` を実行し、user scope の
`~/.claude/skills/openspec-*` / `~/.claude/commands/opsx/*` が英語ストックに戻ってしまった場合:

- **両ツール構成（claude + codex）の場合**: claude skill と codex skill はバイト単位で同一なので、
  無事な codex 側から復元できる:
  `cp ~/.codex/skills/openspec-<name>/SKILL.md ~/.claude/skills/openspec-<name>/SKILL.md`
  （5 skill の各同名ディレクトリについて実施）
- commands を削除する運用なら、再生成で復活した `~/.claude/commands/opsx` を再度 `rm -rf` する。
- codex 側も消えてしまった等で復元元がない場合は、Step 2 からやり直す（＝もう一度英語再生成 → 全訳）。
