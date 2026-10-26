# Anthropic のコードレビューの記事を propose・apply のレビューへ取り入れた記録

2026-10-26 に [Solving code review at Anthropic](https://claude.dev/blog/solving-code-review-at-anthropic/) を読み、propose・apply のレビューを直した。

## 前提の訂正

依頼時の見立ては「必ず動いているのは doubt-driven」だった。実際に必ず動いているレビューは次の 2 つで、apply 側は doubt-driven ではない。

* propose: 「レビュー」節が doubt-driven を最低限として必須にしている。
* apply: 手順 10 が `35-architect-interrogate`（2 モデルの敵対的レビュー）を必ず回す。doubt-driven は orchestration の apply-review で条件付きで呼ばれるだけ。

そのため、コードのレビューの仕組みの正本を interrogate に置き、propose の doubt-driven はその検証の手順を参照する形にした。doubt-driven の skill 自体は「必須性や起動の仕方は規定しない判断枠組み」として書かれているので、変えていない。

## 取り入れたもの

| 記事の内容 | 入れた場所 |
|---|---|
| 差分をリポジトリ全体と変更の意図に照らし、問題を解決しているか・システムに合うか・他を壊していないかを見る。バグ修正は根本原因を探す | interrogate 手順 1・2、`references/reviewer-prompt.md`。propose「レビュー」の依頼文の項目 |
| 完了の宣言ではなく、テスト・ビルド・スクリーンショットの出力を示させる | reviewer-prompt の「実行の証拠」。apply 手順 10 で手順 9 とゲートの出力をそのまま貼る。propose では試作・計測のコマンドと出力を渡す |
| 新しいコンテキストのサブエージェントが差分をレビューする | interrogate 手順 3 に明記。propose は探す役を新しいコンテキストで 2 つ起動する |
| ノイズを測り、誤った指摘を減らす | interrogate 手順 4 に検証役を新設。探す役と別の検証役 3 つが指摘ごとに成立 / 不成立 / 判断できないを返し、2 つ以上が成立とした指摘だけを Act on・Consider の候補にする。新しい agent `architect-interrogate-verifier` と `references/verifier-prompt.md` |

## 自分で決めた数値と理由

記事は、探す役・検証役の数と合意の閾値を書いていない。

* 探す役は既存の 2 つ（Claude と Codex）のまま。モデルの系統を分けるのが interrogate の前提で、増やす根拠が無い。
* 検証役は 3 つ、2 つ以上の `成立` で合意とした。過半数が取れる最小の奇数で、1 回のレビューの起動数を 5 に抑えるため。
* `Nit` は検証に回さない。重大度の低い指摘に 3 つ起動する費用に見合わないため。
* 根拠が `file:line` に届かない `成立` は数えない。筋の通った文章だけの指摘を合意に混ぜないため。
* 合意に届かなかったセキュリティ・データ損失の指摘は、直さずに報告の先頭へ残す。合意の規則を例外なく保ちつつ、見落としの危険が大きい指摘を利用者が見られるようにするため。

## 取り入れなかったもの

* `REVIEW.md`（ディレクトリごとの「失敗」の定義）: 中身はリポジトリごとに違うので、各リポジトリが書く。plugin には入れず、プロジェクト側の skill に任せる。
* リスク階層に応じた人間の承認、CODEOWNERS、ブランチ保護、マージキュー、feature flag と段階リリース、オンコール: 個人開発の SDD フローの外にある運用で、propose・apply のレビューの範囲ではない。
* インシデントと revert を評価セットにしてレビュアーを毎日採点する: 採点の土台（収集した PR とその判定）がまだ無い。土台ができたら llm-eval plugin 側で扱う。
* レビューの収束の規則（3 ラウンドの上限、新しい差分だけの再レビュー、バグのクラスで直させる）: apply-review には 3 周の上限が既にある。apply 手順 10 への追加は、往復が問題になってから入れる。
* 差分の解説を書かせて文脈を共有する: チームの理解を揃えるための仕組みで、不具合を見つける今回の依頼とは目的が違うので外した。

## 取り入れ以外の変更

* interrogate のレビュアー B と apply の表が指していた Codex MCP は、Codex CLI 0.154.0 で `codex mcp-server` が削除されて動かない。合意の仕組みは 2 系統目が実際に動くことに依存するので、触った行だけ Codex プラグインの `codex:codex-rescue` に替えた。`35-architect-sketch`、apply の `references/task-feature.md`・`references/decision-trail.md` にも Codex MCP の記述が残っている。今回の範囲外なので直していない。
* openspec plugin の version を 0.11.0 から 0.12.0 に上げた。
* `35-architect-interrogate/references/lead-judgment.md` と orchestration の `apply-review.md` には「セキュリティ・正確性は 1 モデルの指摘でも退ける前に吟味する」が残っている。今は検証役が先に走り、合意に届かなかったセキュリティ指摘は報告の先頭に残すので、矛盾はしない。二重に読めるので、次に触るときに interrogate 手順 4 へ寄せる。
