# Routines API の注意

API で Routine を作成・更新するときだけ読む。以下は既存 workflow の運用で確認した制約であり、
利用環境の tool schema と応答で再確認する。最新の公開操作は https://code.claude.com/docs/en/routines を参照。

`RemoteTrigger list` は先頭 page しか返さないことがある。id が見つからなければ UI で確認し、呼び出し元指定の
記録先へ保存する。

# Claude Code Remote

UI では connector が保存されないことがある。`get` した現在の `mcp_connections` に、同じ account の既存 Routine
から取得した Claude Code Remote 要素を足し、配列全体を `update` する。更新時は `mcp_connections` だけを送り、
他 field を巻き込まない。`connector_uuid` は account ごとに異なる。

```json
{"mcp_connections": [
  {
    "clear_tool_policy_overrides": false,
    "connector_uuid": "<既存 Routine からコピー>",
    "name": "Claude_Code_Remote",
    "permitted_tools": [],
    "tool_policy_overrides": [],
    "transport_type": "http",
    "url": "https://api.anthropic.com/v1/code/mcp/meta"
  }
]}
```

# webhook trigger

```json
{
  "routine_trigger_id": "trig_…",
  "hook_type": "app",
  "source": "github",
  "scope_id": "owner/repo",
  "events": ["issues.labeled"],
  "filter": {"clauses": [
    {"field": "issue.labels", "op": "FILTER_OP_IN", "values": ["<起動条件のラベル>"]},
    {"field": "issue.labels", "op": "FILTER_OP_NOT_IN", "values": ["<作業中・待機中の除外ラベル>"]}
  ]}
}
```

- events: `issues.labeled`、`issues.closed`、`pull_request.opened`、`pull_request.closed`、`pull_request.labeled`
- fields: `issue.labels`、`pr.labels`、`pr.merged`
- ops: `FILTER_OP_IN`、`FILTER_OP_NOT_IN`、`FILTER_OP_EQ`。複数 clause は AND

API は event 名の typo を受理することがあるため、利用 schema と照合する。上の一覧は既存 workflow で使う範囲。
webhook trigger が list / get で読めない場合は、UI または `list_runs` で確認する。見えないまま追加を重ねない。

connector の JSON は追加要素の形を示す例。実際には取得した現在の全要素を保持し、同じ connector が無い場合だけ
追加する。`connector_uuid` を他 account から流用しない。
