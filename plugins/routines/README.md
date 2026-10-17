# routines

Claude Code Routines の操作をまとめた plugin。`issue-label-driven` の setup からも使う。

```bash
claude plugin install routines@sugiken-dev-public
```

以前の名前 `claude-code-routines` は、`claude-` で始まる plugin 名が Anthropic 公式の名前と紛れるため予約されており、marketplace の検証で落ちる。旧名で入れていた環境は入れ直す。

```bash
claude plugin uninstall claude-code-routines@sugiken-dev-public
claude plugin install routines@sugiken-dev-public
```

記録先の既定 `docs/playbooks/claude-code-routines.md` は、利用先 repo に既にある記録を引き継ぐため名前を変えていない。

`/routines:manage-routines` で Routine の検索、作成・更新、停止・再開、実行状況の確認を依頼できる。
対象・望む設定・既存 ID の記録先を渡す。共通手順は `skills/manage-routines/SKILL.md`、API の詳細はその
`references/routines-api.md` にある。

ラベルの意味、worker の仕事、PR の評価方針、停止した issue / PR の回収は呼び出し元 workflow が定義する。
この plugin は Routine の設定と稼働を確認し、その結果を呼び出し元へ返す。
