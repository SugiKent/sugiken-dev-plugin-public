# 任意の PR 自動評価

導入するなら label・`.claude/skills/assess-pr-risk/SKILL.md`・次の Routine を一式で作る。入れないなら 3 つとも作らない。

| Name | Trigger | Filter | autofix |
| --- | --- | --- | --- |
| `<project> assess` | PR labeled | `pr.labels IN [ai-assess:requested]` | false |

`PR opened` は使わない。worker は PR 作成後にラベルを付けるため発火せず、同時ラベル時は二重起動する。

assess は起動元の `CCR_TRIGGER_PR_NUMBER` / `CCR_TRIGGER_HEAD_SHA` だけを評価する。完了時は結果にかかわらず
`ai-assess:requested` を外す。`question` のある PR は merge しない。コメントは `<!-- routine -->` で始める。
導入する skill に `routine-common` の「終了前の最終チェック」を組み込み、評価失敗・保留時も人へ引き継ぐ。

PR branch に skill が無い場合があるため、Routine 本文には次を書く。

```text
git fetch origin main し、
git show origin/main:.claude/skills/assess-pr-risk/SKILL.md
を読んで実行する。Skill ツールで見つからなくても main から読む。

読めない場合は、その旨を <!-- routine --> 付きで PR にコメントし、
ai-assess:requested を外して終わる。
```

動作確認では、worker が `[phase]` と `[phase, ai-assess:requested]` を 2 回に分けて書き、assess が 1 本だけ
起動してラベルを外すことを確認する。
