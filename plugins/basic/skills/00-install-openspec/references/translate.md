# OpenSpec の日本語化（毎回適用）

OpenSpec は英語で配布される。本プロジェクトでは日本語運用なので、user scope への再生成のたびに以下を実施する。

> ⚠️ この翻訳は `openspec init ~ --force` で英語ストックに丸ごと戻る。
> 翻訳を当てた後に `openspec init ~` を叩かないこと（SKILL.md の最重要注意を参照）。
> 対象は **user scope**（`~/.claude/skills/openspec-*` / `~/.codex/skills/openspec-*`）。

## 翻訳対象（1.5.0 実態・per-tool）

CLI が生成するファイルはツールごとに配置先が異なる。対象ツールに応じて以下を訳す:

- **claude**:
  - `~/.claude/skills/openspec-*/SKILL.md` — skills 運用の本体（必ず翻訳）
  - `~/.claude/commands/opsx/*.md` — スラッシュコマンド。delivery=both 構成だと生成されるが、
    **skills-only 運用なら翻訳せず削除対象**（SKILL.md Step 5）。commands も使う運用なら翻訳する。
- **codex**:
  - `~/.codex/skills/openspec-*/SKILL.md`

> 現行（1.5.0）はスラッシュコマンドが `~/.claude/commands/opsx/*.md`、skill が `~/.claude/skills/openspec-*/SKILL.md`。
> skill は 5 つ: `openspec-propose` / `openspec-apply-change` / `openspec-explore` / `openspec-archive-change` / `openspec-sync-specs`。

## claude と codex は同一ファイル

**claude と codex の skill ファイルは、内容・frontmatter とも同一（バイト単位で一致）。**
両ツール構成の場合は 1 回訳して両方の同名ファイルへ `cp` してよい:

```
cp ~/.codex/skills/openspec-<name>/SKILL.md ~/.claude/skills/openspec-<name>/SKILL.md
```

（5 skill の各同名ディレクトリについて実施）

## 翻訳ルール

1. 各対象ファイルの中身を、LLM（Claude Code）に依頼して **日本語に翻訳** する。
2. frontmatter は **`description` のみ和訳** する。
   - `name`（英語スラッグ）は **不訳**（実行互換性のため維持）。
   - コードブロック・コマンド例・パス・変数名は **不訳**。
3. 翻訳後、内容に大きな欠落・誤訳がないかを目視で確認する。
