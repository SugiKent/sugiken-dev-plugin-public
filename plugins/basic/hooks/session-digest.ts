// session-digest: a right pane with a Haiku digest of the recent conversation,
// meant to lower what a person has to keep in mind during a long session.
// Haiku runs every N main-loop steps (turn.step, one model request of the
// turn) and at turn.complete, each time on the last MAX_INPUT characters of
// the main conversation, not on the latest answer alone.
const PANE = 'session-digest';
const COMMAND = 'session-digest';
const MODEL = 'haiku';
const MAX_INPUT = 20000;
const MAX_TOOL_INPUT = 200;
const DEFAULT_EVERY = 10;
export const VERSION = '1.0.0';

const SYSTEM = [
  'あなたは長い開発セッションを横で見ている人間のための要約者です。',
  '目的は、人間が会話を読み返さなくても、今の状況と押さえるべき変化を一目で掴めるようにし、認知負荷を下げることです。',
  '入力は直近の会話記録（ユーザーの依頼、エージェントの応答、呼んだツール）です。最後のやり取りだけでなく記録全体を読み、重要度の高いものを優先してください。',
  '出力は文章ではなく、テキストの図だけにしてください。コードブロック1つだけを出力し、その外には何も書かないでください。',
  '図に入れるもの（該当しないものは入れない）:',
  '* 目指しているゴールと、今どこまで進んだか（流れを矢印でつなぎ、現在地に ★ を付ける）',
  '* 意外な発見（! を付けた箱）',
  '* 仕様・方針の変更（「旧 → 新」の形）',
  '* 人間の判断待ち（? を付けた箱）',
  '箱や矢印に書く言葉は短い名詞句にし、文にしない。1行は全角20文字以内、全体で25行以内。',
  'ファイル単位の作業や細かい手順は図に入れない。推測は書かず、記録に無いことは書かない。',
].join('\n');

type Job = { label: string; fallback?: string };

let interactive = false, enabled = true, opened = false, columns = 0, wanted = 0;
const IDLE = '未実行（ステップの進行・ターン終了を待機中）';
let status = IDLE, summary = '', tokens = '';
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
  const body = (Array.isArray(messages) ? transcript(messages) : '') || (job.fallback ?? '').slice(-MAX_INPUT);
  if (!body) { if (gen === generation) { status = 'スキップ: 会話が空'; redraw($); } return; }
  status = MODEL + ' にリクエスト中…（' + job.label + '）';
  redraw($);
  const r = await safe(() => $.model.complete({ model: MODEL, system: SYSTEM,
    prompt: '【直近の会話記録（' + job.label + '）】\n\n' + body, maxTokens: 2000, timeoutMs: 90000 }));
  if (gen !== generation) return; // Dropped by /clear.
  const ms = Date.now() - started;
  if (r?.isAnswered) {
    const u = r.usage ?? {};
    summary = r.text;
    tokens = `入力 ${(u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)} / 出力 ${u.output_tokens ?? 0} トークン`;
    status = MODEL + ' 応答あり（' + job.label + '、' + ms + ' ms）';
  } else {
    status = MODEL + ' 失敗（' + job.label + '、' + ms + ' ms）: ' + (r ? r.reason + (r.status ? ' ' + r.status : '') : '呼び出し不可');
  }
  redraw($);
}

// The main conversation as plain text, tool results left out (they are long
// and the agent's own text says what it learned from them).
function transcript(messages: readonly any[]) {
  const parts: string[] = [];
  for (const m of messages) {
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    if (m.role === 'user') { if (text) parts.push('### ユーザー\n' + text); continue; }
    const lines = text ? ['### エージェント', text] : [];
    for (const t of m.toolUses ?? []) {
      let input = '';
      try { input = JSON.stringify(t.input) ?? ''; } catch { /* unserializable input */ }
      lines.push('ツール: ' + t.tool + ' ' + input.slice(0, MAX_TOOL_INPUT) + (t.isError ? '（エラー）' : ''));
    }
    if (lines.length) parts.push(lines.join('\n'));
  }
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
      generation++; pending = undefined; lastJob = undefined; summary = ''; tokens = '';
      stepsTotal = 0; stepsSinceCall = 0;
      status = IDLE; redraw($);
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
    const children: any[] = [text('Haiku: ' + status, true),
      Box({ flexDirection: 'row', columnGap: 1, children: [
        ...(lastJob ? [Button({ key: 'analyze', label: '再要約', onPress: async () => { request($, { label: '手動' }); } })] : []),
        Button({ key: 'close', label: '閉じる', onPress: async () => { enabled = false; opened = false; await $.ui.close({ id: PANE }); } }),
      ] }),
    ];
    if (summary) children.push(Markdown({ text: summary }), text(tokens, true));
    children.push(text('要約: ' + (every > 0 ? every + ' ステップごと＋ターン終了時' : 'ターン終了時のみ'), true),
      text('session-digest v' + VERSION, true));
    return Box({ flexDirection: 'column', children });
  });
}
