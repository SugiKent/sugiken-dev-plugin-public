# worker の共通手順

`routine-propose` / `routine-apply` / `routine-archive` が読む。`routine-sweep` は止まった PR を引き継ぐときだけ読む。

# プロジェクト固有の調整を読む

`git show origin/main:.claude/skills/issue-driven-sdd-custom/SKILL.md` で custom skill を読み、`## 共通` と自分の
段階の節に従う。無ければ既定どおり進む。`## routines` は setup 用なので読まない。

custom は検証方法、対象外領域、成果物、記録先、PR 項目などを追加できる。ただし `routine-common` の状態モデル・
コメント形式、1 セッション 1 issue 1 PR、ready PR、段階の時間 / 回数しきい値は変えない。

# 対象の特定

`env | grep ^CCR_TRIGGER_` を読み、`CCR_TRIGGER_ISSUE_NUMBER` と `CCR_TRIGGER_REPO` から対象を一意に決める。
決められなければ推測せず、読めなかった情報を報告して終える。

# 着手可否の判定

上から評価し、該当したら止める。

1. `blocked` または `wip` がある: 黙って終える。
2. 段階ラベルが複数ある: 組み合わせをコメントして終える。
3. issue の `depends on #m` が未解決: `routine-dispatch` の「依存が解けた条件」で評価し、
   `blocked-by: #m` を書き戻す。
4. open PR または進行中 change と同じ要求・画面・route・service / repository を触る: 相手の issue または
   `change <name>` を blocker にする。自分の issue に対応する PR / change は除く。
5. `tasks.md` の前提が `origin/main` で未達: `blocked-by: change <name>`。
6. custom や repo の方針で閉じた領域: `blocked-by: human`、`unblock-when: docs`。

3 以降は `routine-common` の「見送りの書き戻し」を使う。propose の MODIFIED / REMOVED / RENAMED は、
`origin/main` の main spec に要求が無く、別 change の delta にだけある場合も衝突とみなす。

# 着手の印

`mcp__Claude_Code_Remote__get_session` で session id を取得し、`set_session_title` で title を
`[<段階>] #<issue>` にする。
issue に次をコメントしてから `[stage:X, wip]` を書く。

```text
<!-- routine -->
started: <ISO 時刻>
session: <session id>
```

sweep は session が RUNNING または人の操作待ちなら生存、それ以外なら死亡と判定する。

# origin/main を正本にする

change と tasks は `git show` / `git ls-tree` で `origin/main` から読む。shallow clone では祖先判定が誤るため、
main へ入ったかどうかはファイル内容で判定する。

# PR の作り方

1. 作成直前に、issue 番号を title に持つ open PR を検索する。あれば後発として撤退する。
2. ready PR を 1 件作る。title は `[<段階>] #<issue> <要約>`、本文は `Refs #n`。
   `Closes #n` は archive と docs-only だけ。
3. 本文 1 行目を次のどちらかにする。

```text
未確定の判断: N 件 — このまま merge すると worker が推奨案で進めます
未確定の判断: 0 件 — レビューをお願いします
```

4. N > 0 は `[<段階>, question]` を 1 回で書く。N = 0 は `[<段階>]` を書き、assess があれば続けて
   `[<段階>, ai-assess:requested]` を書く。2 ラベルを同時に増やすと assess が二重起動する。
5. propose / apply は auto-fix を有効にし、CI・レビュー・会話コメントへ同じ session で対応する。archive は無効。
6. `mergeable_state=dirty` なら競合相手を示して自分の PR を close する。artifact URL は PR に残し、
   Claude Code session のリンクは description から消さない。

PR を作ったら merge を待たず終了し、`wip` は残す。propose の grill だけは同じ session で会話を続ける。

## assess があるかを確かめる

`origin/main:.claude/skills/assess-pr-risk/SKILL.md` の有無だけで判定する。無ければ
`ai-assess:requested` を付けず、外さず、言及しない。skill と Routine の対応確認は `routines-setup` が担う。

# 変更範囲

- `.claude/rules/` は編集しない。必要な変更は PR 本文か issue コメントへ書く。
- `.claude/`（rules を除く）、`docs/`、直下の `CLAUDE.md` / `README.md` だけの変更は `docs` PR にできる。
  実 diff に `openspec/` や製品ファイルが混ざれば通常の OpenSpec 経路を使う。docs-only issue は `Closes #n`。
- proposal の tasks に、同じ session で完了できない本番実測・デプロイ後確認を入れない。apply / archive で既存の
  その種の task に出会った場合は削除し、別 issue は作らない。
- E2E、スクリーンショット、artifact、記録先は custom、次に repo のルールへ従う。作業のついでに docs PR は作らない。
