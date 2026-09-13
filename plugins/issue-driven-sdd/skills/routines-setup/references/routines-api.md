# Routines API の注意

API で Routine を作成・更新するときだけ読む。

`RemoteTrigger list` は先頭 page しか返さないことがある。id が見つからなければ UI で確認し、custom skill の
`## routines` へ保存する。

# Claude Code Remote

UI では connector が保存されないことがある。`get` した現在の `mcp_connections` に、同じ account の既存 Routine
から取得した Claude Code Remote 要素を足し、配列全体を `update` する。更新時は `mcp_connections` だけを送り、
他 field を巻き込まない。`connector_uuid` は account ごとに異なる。

```json
{"mcp_connections": [
  "<現在の全要素>",
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
    {"field": "issue.labels", "op": "FILTER_OP_IN", "values": ["stage:propose"]},
    {"field": "issue.labels", "op": "FILTER_OP_NOT_IN", "values": ["wip", "blocked", "question"]}
  ]}
}
```

- events: `issues.labeled`、`issues.closed`、`pull_request.opened`、`pull_request.closed`、`pull_request.labeled`
- fields: `issue.labels`、`pr.labels`、`pr.merged`
- ops: `FILTER_OP_IN`、`FILTER_OP_NOT_IN`、`FILTER_OP_EQ`。複数 clause は AND

API は event 名の typo を受理するため、この一覧と照合する。webhook trigger は list / get で読めないので、
UI または `list_runs` で確認する。
