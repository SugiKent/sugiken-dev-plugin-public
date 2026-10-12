// session-digest: a right pane with a Haiku digest of the recent conversation,
// meant to lower what a person has to keep in mind during a long session.
// Haiku runs when a prompt is submitted (prompt.submit), every N main-loop
// steps (turn.step, one model request of the turn) and at turn.complete, each
// time on the last MAX_INPUT characters of the main conversation, not on the
// latest answer alone.
const PANE = 'session-digest';
const COMMAND = 'session-digest';
const MODEL = 'haiku';
const MAX_INPUT = 20000;
const MAX_TOOL_INPUT = 200;
const DEFAULT_EVERY = 10;
export const VERSION = '1.5.0';

const FENCE = '```';
// One few-shot: a short conversation and the diagram for it.
const shot = (title: string, input: string[], output: string[]) =>
  ['', '例: ' + title, '入力:', ...input, '出力:', FENCE, ...output, FENCE].join('\n');

const SYSTEM = [
  'あなたは、長い開発セッションを横で見ている人間のために、会話の状況を図にまとめる役です。',
  '人間はこの図を見て、会話を読み返さずに、何を目指しているか、今どこまで進んだか、何を頼まれているかを掴みます。毎回同じ場所を見れば同じ情報が分かるよう、出力は必ず次の4つの欄をこの順で並べます。欄を省いたり、順番や見出しを変えたりしません。',
  '■ セッションの目標',
  '  ユーザーがこのセッションで達成したいことを1〜2行で書く。記録から分からなければ「未確認」と書く。',
  '■ 現在のタスク進捗',
  '  目標までの段階を【済】【今】【未】の行に分けて並べる。1行目に ███░░ 3/5 のように量を書く。',
  '■ やっていることの概念図',
  '  今の作業が何をどう変えるのかを、次の型から1〜2個選んで描く。型ごとに、図の直下へその図が示す事実を1文で書く。',
  '  * 構造: 部品・システム・人の関係。[箱] と矢印、包含は字下げの木（├ └）',
  '  * 因果: なぜそうなったか。原因 ──▶ 結果、分岐は ┬ で枝分かれ',
  '  * 流れ: データや処理の通り道。縦の │ ▼ でつなぎ、件数や値を添える',
  '  * 変更: 仕様・方針の旧と新。[旧]【廃止】──▶ [新]【採用】',
  '■ ユーザーへの依頼',
  '  ユーザーの判断や作業を待っていることを書く。選択肢があれば【要判断】から ┬ で A / B を並べる。無ければ「なし」とだけ書く。',
  '入力は直近の会話記録（ユーザーの依頼、エージェントの応答、呼んだツール）です。記録全体を読んでから書いてください。',
  '状態は次の【】付きの短い言葉で示します。見ただけで意味が分かるよう、✓ ✗ ★ ○ ! ? のような記号では示しません。',
  '* 【済】完了 【今】作業中 【未】未着手',
  '* 【採用】選んだ案 【廃止】やめた案 【失敗】エラー・不具合',
  '* 【原因】問題の原因 【注目】意外な発見 【要判断】人間の判断待ち',
  '* 値の不一致は ≠ で書く。',
  '言葉の規則:',
  '* ラベルには対象を入れる。「修正」「調査」の一語で終えず、「aud修正」「JWT調査」のように何についての作業かを書く。全角12文字以内。',
  '* 文は「〜した」「〜で失敗」「〜が未定」のように事実をそのまま書く。記録にある固有名と数値を使い、「重要な」「大幅に」「〜と考えられる」のような評価やぼかしは書かない。',
  '* 記録で確定していないことは「未定」「未確認」と書き、断定しない。',
  '* 4つの見出し以外の見出し、凡例、箇条書きは書かない。欄の区切りは空行にする。ダッシュ（——）と中黒（・）は使わない。',
  '描き方の規則:',
  '* 日本語は表示幅が揃わないので、右側を閉じる枠線（┐ ┘ │）は描かない。箱は [ ] で書く。',
  '* 1行は全角20文字（半角40文字）以内、全体で30行以内。',
  '* コードブロック1つだけを出力し、その外には何も書かない。',
  'ファイル単位の作業や細かい手順は描かない。記録に無いことは描かない。',
  shot('構造＋因果、依頼あり', [
    'ユーザー: 認証を Cognito から Salesforce 直に変えたい',
    'エージェント: 401 の原因は JWT の aud が client_id と違うことでした。aud を合わせます。',
    'ツール: Edit {"file_path":"src/auth.ts"}',
    'エージェント: テストは通りました。本番の切替日は決まっていません。',
  ], [
    '■ セッションの目標',
    '認証を Cognito から',
    'Salesforce 直接に切り替える。',
    '',
    '■ 現在のタスク進捗',
    '███░ 3/4',
    '【済】原因調査 ─ aud修正 ─ テスト',
    '【未】本番切替',
    '',
    '■ やっていることの概念図',
    '[ブラウザ]──▶[API]',
    '              ├─[Cognito経由]【廃止】',
    '              └─▶[SF直接]【採用】',
    '認証を Salesforce 直接に切り替え中。',
    '',
    'JWT aud≠client_id【原因】',
    '    ──▶ 401【失敗】',
    'aud を client_id に合わせて解消した。',
    '',
    '■ ユーザーへの依頼',
    '本番切替日を決めてほしい。',
  ]),
  shot('因果、選択肢つきの依頼', [
    'ユーザー: ログインの E2E がたまに落ちる',
    'エージェント: Cookie の書き込みより先にリダイレクトが走り、未認証で画面を開いていました。',
    'エージェント: 書き込みを待つか、テスト側で再試行するかを決めてください。',
  ], [
    '■ セッションの目標',
    'ログイン E2E の不定期な失敗を直す。',
    '',
    '■ 現在のタスク進捗',
    '█░░ 1/3',
    '【済】原因調査',
    '【未】修正 ─ E2E再実行',
    '',
    '■ やっていることの概念図',
    '[ログイン]─┬▶[Cookie書込]',
    '           └▶[リダイレクト] 先着【原因】',
    '                  │',
    '                  ▼',
    '        [未認証で画面表示] ──▶ E2E【失敗】',
    'Cookie を書く前に遷移し、',
    '未認証のまま画面を開いていた。',
    '',
    '■ ユーザーへの依頼',
    '【要判断】┬ A [書込を待って遷移]',
    '          └ B [テスト側で再試行]',
    'どちらで直すかを決めてほしい。',
  ]),
  shot('変更、依頼なし', [
    'ユーザー: 通知はメールをやめて Slack だけにしよう',
    'エージェント: spec を Slack のみに更新しました。tasks は 7 件中 4 件が完了です。',
  ], [
    '■ セッションの目標',
    '通知を Slack のみに切り替える。',
    '',
    '■ 現在のタスク進捗',
    '████░░░ 4/7',
    '【済】提案 ─ 仕様',
    '【今】実装',
    '【未】E2E',
    '',
    '■ やっていることの概念図',
    '通知 [メール]【廃止】',
    '  ──▶ [Slackのみ]【採用】',
    'spec を Slack のみに更新した。',
    '',
    '■ ユーザーへの依頼',
    'なし',
  ]),
  shot('流れ（件数つき）、依頼なし', [
    'ユーザー: 応募から面接までの離脱を調べて',
    'エージェント: 応募ログ 120 万行を重複除外すると応募者 3.2 万人。面接に進んだのは 8 千人で、2.4 万人が連絡前に離脱していました。',
  ], [
    '■ セッションの目標',
    '応募から面接までの離脱を調べる。',
    '',
    '■ 現在のタスク進捗',
    '██ 2/2',
    '【済】集計 ─ 離脱箇所の特定',
    '',
    '■ やっていることの概念図',
    '[応募ログ] 120万行',
    '    │ 重複除外',
    '    ▼',
    '[応募者] 3.2万─┬▶[面接] 8千',
    '               └▶[連絡前離脱] 2.4万【注目】',
    '応募者 3.2 万人のうち 2.4 万人が、',
    '面接の連絡より前に離脱していた。',
    '',
    '■ ユーザーへの依頼',
    'なし',
  ]),
].join('\n');

// `prompt` is a just-submitted prompt, added when the conversation does not
// hold it yet.
type Job = { label: string; fallback?: string; prompt?: string };

let interactive = false, enabled = true, opened = false, columns = 0, wanted = 0;
// Empty until the first call; the status line is hidden while empty.
let status = '', summary = '';
let every = DEFAULT_EVERY;
// Haiku calls never overlap: one runs at a time and only the newest waiting
// job is kept. `generation` drops results from before a /clear.
let busy = false, pending: Job | undefined, generation = 0;
// Main-loop steps since the last call; reset at each call and at turn end.
let stepsTotal = 0, stepsSinceCall = 0;
let lastJob: Job | undefined;
const redraw = ($: any) => $.ui.invalidate('ui.render');
const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return undefined; } };

async function open($: any, focus = false) {
  if (!interactive) return;
  const result = await $.ui.open({ id: PANE, title: 'Session Digest',
    ...(wanted > 0 ? { columns: wanted } : {}), ...(focus ? { focus: true } : {}) });
  opened = true;
  columns = wanted;
  if (result?.isPlaced === false) status = '端末幅待ち。/' + COMMAND + ' で開けます';
}

function request($: any, job: Job) {
  lastJob = job;
  if (busy) { pending = job; status = MODEL + ' 応答待ち（次: ' + job.label + '）'; redraw($); return; }
  void run($, job);
}

async function run($: any, job: Job) {
  busy = true;
  const gen = generation;
  await summarize($, job, gen);
  busy = false;
  const next = pending;
  pending = undefined;
  if (next) await run($, next);
}

async function summarize($: any, job: Job, gen: number) {
  const started = Date.now();
  // Read the conversation now, so a job that waited sees the newest rows.
  const messages = await safe(() => $.session.messages());
  const body = (Array.isArray(messages) ? transcript(messages, job.prompt) : '') || (job.fallback ?? '').slice(-MAX_INPUT);
  if (!body) { if (gen === generation) { status = 'スキップ: 会話が空'; redraw($); } return; }
  status = MODEL + ' にリクエスト中…（' + job.label + '）';
  redraw($);
  const r = await safe(() => $.model.complete({ model: MODEL, system: SYSTEM,
    prompt: '【直近の会話記録（' + job.label + '）】\n\n' + body, maxTokens: 2000, timeoutMs: 90000 }));
  if (gen !== generation) return; // Dropped by /clear.
  const ms = Date.now() - started;
  if (r?.isAnswered) {
    summary = diagramOnly(r.text);
    status = MODEL + ' 応答あり（' + job.label + '、' + ms + ' ms）';
  } else {
    status = MODEL + ' 失敗（' + job.label + '、' + ms + ' ms）: ' + (r ? r.reason + (r.status ? ' ' + r.status : '') : '呼び出し不可');
  }
  redraw($);
}

// Only the first code block, so any prose Haiku adds around it is not shown.
function diagramOnly(text: string) {
  const m = /```[^\n]*\n[\s\S]*?```/.exec(text);
  return m ? m[0] : text;
}

// The main conversation as plain text, tool results left out (they are long
// and the agent's own text says what it learned from them).
function transcript(messages: readonly any[], prompt?: string) {
  const parts: string[] = [];
  let lastUser = '';
  for (const m of messages) {
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    if (m.role === 'user') { if (text) { parts.push('### ユーザー\n' + text); lastUser = text; } continue; }
    const lines = text ? ['### エージェント', text] : [];
    for (const t of m.toolUses ?? []) {
      let input = '';
      try { input = JSON.stringify(t.input) ?? ''; } catch { /* unserializable input */ }
      lines.push('ツール: ' + t.tool + ' ' + input.slice(0, MAX_TOOL_INPUT) + (t.isError ? '（エラー）' : ''));
    }
    if (lines.length) parts.push(lines.join('\n'));
  }
  if (prompt && prompt !== lastUser) parts.push('### ユーザー\n' + prompt);
  return parts.join('\n\n').slice(-MAX_INPUT);
}

export function register(on: any, options: any = {}) {
  const n = Number(options.digestEverySteps);
  every = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_EVERY;

  on('session.start', async ($: any, e: any, next: any) => {
    interactive = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop');
    await $.command.register({ name: COMMAND, description: 'Haiku のセッション要約を表示 (off / on / refresh)', immediate: true });
    await safe(() => open($));
    return next(e);
  });

  on('turn.step', async function* ($: any, e: any, next: any) {
    const result = yield* next(e);
    if (e.agentId || !enabled || !interactive || !result) return result;
    stepsTotal++;
    stepsSinceCall++;
    if (every > 0 && stepsSinceCall >= every) {
      stepsSinceCall = 0;
      const label = 'ターン途中、' + stepsTotal + ' ステップ時点';
      if (!opened) await safe(() => open($));
      // Outside this dispatch so the step never waits on the model.
      await safe(() => $.clock.after(0, () => { request($, { label }); }));
    }
    return result;
  });

  on('prompt.submit', async ($: any, e: any, next: any) => {
    const result = await next(e);
    const prompt = typeof e.text === 'string' ? e.text.trim() : '';
    if (!enabled || !interactive || !prompt || result?.drop) return result;
    if (!opened) await safe(() => open($));
    // Outside this dispatch so the prompt is never held up by the model.
    await safe(() => $.clock.after(0, () => { request($, { label: 'ユーザー入力時', prompt }); }));
    return result;
  });

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e);
    if (e.agentId) return result;
    const answer = typeof e.answer === 'string' ? e.answer.trim() : '';
    stepsTotal = 0; stepsSinceCall = 0;
    if (!enabled) return result;
    if (!interactive) { status = 'スキップ: 非対話'; return result; }
    if (!opened) await safe(() => open($));
    // Outside this dispatch so the turn never waits on the model.
    await safe(() => $.clock.after(0, () => { request($, { label: 'ターン終了時', fallback: answer }); }));
    return result;
  });

  on('classic.SessionStart', async ($: any, e: any, next: any) => {
    if (e.source === 'clear') {
      generation++; pending = undefined; lastJob = undefined; summary = '';
      stepsTotal = 0; stepsSinceCall = 0;
      status = ''; redraw($);
    }
    return next(e);
  });

  on('command.run', { command: COMMAND }, async ($: any, e: any) => {
    const arg = e.args.trim();
    if (arg === 'off') { enabled = false; opened = false; await $.ui.close({ id: PANE }); return {}; }
    if (arg && !['on', 'refresh'].includes(arg)) return { text: '/' + COMMAND + ' [on | off | refresh]' };
    enabled = true;
    await open($, true);
    if (arg === 'refresh') request($, { label: '手動' });
    return interactive ? {} : { text: 'Session Digest ペインは対話型 terminal / Desktop で表示できます。' };
  });

  on('ui.close', async ($: any, e: any, next: any) => {
    if (e.id === PANE && e.origin.kind === 'person') { enabled = false; opened = false; }
    return next(e);
  });

  on('ui.render', async ($: any, e: any, next: any) => {
    if (e.viewport?.columns > 0) wanted = Math.max(1, Math.round(e.viewport.columns * 0.3));
    if (e.component !== 'Pane' || e.requestId !== PANE) return next(e);
    if (opened && wanted !== columns) await safe(() => open($));
    const { Box, Text, Button, Markdown } = $.ui.resolve(e);
    const text = (s: string, dim = false) => Text({ children: [s], ...(dim ? { dimColor: true } : {}) });
    const children: any[] = [...(status ? [text('Haiku: ' + status, true)] : []),
      Box({ flexDirection: 'row', columnGap: 1, children: [
        ...(lastJob ? [Button({ key: 'analyze', label: '再要約', onPress: async () => { request($, { label: '手動' }); } })] : []),
        Button({ key: 'close', label: '閉じる', onPress: async () => { enabled = false; opened = false; await $.ui.close({ id: PANE }); } }),
      ] }),
    ];
    if (summary) children.push(Markdown({ text: summary }));
    children.push(text('session-digest v' + VERSION, true));
    return Box({ flexDirection: 'column', children });
  });
}
