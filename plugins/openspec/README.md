# OpenSpec plugin

日本語化した OpenSpec ワークフロースキルに、作業中のターンを Haiku でまとめて右ペインに表示する Claude Code mod を同梱しています。

## インストールと確認

```sh
claude plugin install openspec@sugiken-dev-public
# インストール済みの場合
claude plugin update openspec@sugiken-dev-public
```

ローカルのソースを試す場合は、開発対象のプロジェクトルートから起動します。

```sh
claude --plugin-dir /absolute/path/to/sugiken-dev-plugins-public/plugins/openspec
```

Claude Code CLI v2.1.287 以降が必要です。起動後、`/plugin` の mod 一覧で `openspec` が読み込まれていることを確認してください。インストール済みのセッションでは `/reload-plugins` または再起動で更新を読み込みます。

## ペイン

対話型の terminal / Desktop でセッション開始時に自動で開きます（キーボードフォーカスは奪いません）。次の 2 つのタイミングで Haiku（`haiku` エイリアス）を呼び、要約と簡単な図をペインに表示します。呼び出しはエージェントの作業とは別に行い、作業も次のプロンプトも待たせません。

* ステップが 10 回進むごと：ステップは、1 ターンの中で Claude Code がモデルへ送るリクエスト 1 回です（mod API の `turn.step`）。モデルは 1 回のリクエストで考え、文章を書き、ツール呼び出しを決めます。ツールを並列で複数呼んでも 1 ステップです。そのターンのここまでのステップの記録（各ステップの応答文と、ツール名と引数の先頭200文字）を渡します。
* ターン終了時：そのターンの最終応答を渡します。

ステップの数はメインの会話だけで数え、サブエージェントのステップとターンは数えません。数はターン終了時と Haiku を呼んだときに 0 に戻ります。ターンの途中でもターン終了時でも「直前の要約から何ステップ進んだか」で次の呼び出しが決まり、同じ記録を短い間隔で二重に要約しないためです。

Haiku の呼び出しは重なりません。前の要約が終わる前に次の呼び出し時期が来た場合は待たせ、待っている間に新しいものが来たら古いほうは捨てて最新だけを呼びます。

間隔は `/config` の plugin 設定 `summaryEverySteps`（既定値 10）で変えられます。`0` にするとターン終了時だけになります。

表示内容は上から次のとおりです。

* `Haiku: <状態>`：未実行・リクエスト中・応答待ち・応答あり（何ステップ時点かターン終了か、ms）・失敗（理由と HTTP ステータス）・スキップ理由
* 「再要約」「閉じる」ボタン
* Haiku のまとめと使用トークン数
* 要約の間隔（`要約: 10 ステップごと＋ターン終了時`）
* 最下部に mod の version（`openspec mod vX.Y.Z`）

`openspec/` 配下のファイルは読みません。Haiku に送るのは上記のステップの記録（末尾2万文字まで）と各ターンの最終応答（先頭2万文字まで）だけです。1 回の入力は最大で2万文字なので、呼び出し回数が増えても 1 回あたりの費用と待ち時間は変わりません。50 ステップのターンでは、ターン終了時だけの 1 回が 6 回になります。認証は Claude Code セッションのものを使うため API キーは不要です。

右ペインの希望幅は画面幅の約30%です。Claude の最低幅・配置ルール、ドラッグ等で調整した幅が優先されます。

* `/openspec-pane`：開く。ペインへフォーカスを移します。
* `/openspec-pane refresh`：直近に要約した記録か応答を再要約します。
* `/openspec-pane off`：閉じて、このセッションの自動表示を止めます。
* `/openspec-pane on`：自動表示を再開します。

terminal と Desktop の Code タブで描画します。VS Code のチャットパネルや `claude -p` は表示対象ではありません。

## 検証

```sh
claude plugin validate plugins/openspec --strict
claude plugin test plugins/openspec
```

mod のテストは実セッション・ログイン・通信・モデル呼び出しを使わずに、イベントと描画ツリーを検証します。モデルの応答はテスト内で差し替えます。実画面のレイアウト確認は別途必要です。

API の参照先: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)、[Draw in the interface](https://code.claude.com/docs/en/plugins/mods/interface)、[Test a mod](https://code.claude.com/docs/en/plugins/mods/test)。翻訳済みスキルの出典は [NOTICE.md](NOTICE.md) を参照してください。
