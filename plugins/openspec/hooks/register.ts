// Shows a Haiku summary of the current turn in a right pane. It reads no
// OpenSpec files. Haiku runs every N steps (turn.step, one model request of
// the turn) on the turn's log so far, and once more at turn.complete on the
// final answer.
const PANE = 'openspec-impact';
const MODEL = 'haiku';
const MAX_ANSWER = 20000;
const MAX_TOOL_INPUT = 200;
const DEFAULT_EVERY = 10;
// Keep in sync with .claude-plugin/plugin.json "version".
export const VERSION = '0.8.0';

const SYSTEM = [
  'あなたは開発セッションの要約者です。渡されたエージェントの作業記録または最終応答を日本語で要約し、可視化してください。',
  '入力が「作業途中」の記録なら、ここまでに何をしたかと今何をしているかを書いてください。',
  '* 先頭に「何をしたか」を1〜2行',
  '* 次に、変更・決定・未解決事項を短い箇条書き（OpenSpec の spec / change に触れていればそれを明記）',
  '* 流れや関係が分かる場合のみ、テキストの簡単な図（矢印）を1つ',
  '推測は書かず、入力に無いことは書かない。全体で20行以内。',
].join('\n');

type Job = { prompt: string; label: string };

let interactive = false, enabled = true, opened = false, columns = 0, wanted = 0;
let status = '未実行（ステップの進行・ターン終了を待機中）', summary = '', tokens = '';
let every = DEFAULT_EVERY;
// Haiku calls never overlap: one runs at a time and only the newest waiting
// job is kept. `generation` drops results from before a /clear.
let busy = false, pending: Job | undefined, generation = 0;
// Main-loop steps of the current turn, and how many ran since the last call.
let stepLog: string[] = [], stepsTotal = 0, stepsSinceCall = 0;
let lastJob: Job | undefined;
const redraw = ($: any) => $.ui.invalidate('ui.render');
const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return undefined; } };

async function open($: any, focus = false) {
  if (!interactive) return;
  const result = await $.ui.open({ id: PANE, title: 'OpenSpec',
    ...(wanted > 0 ? { columns: wanted } : {}), ...(focus ? { focus: true } : {}) });
  opened = true;
  columns = wanted;
  if (result?.isPlaced === false) status = '端末幅待ち。/openspec-pane で開けます';
}

function request($: any, job: Job) {
  lastJob = job;
  if (busy) { pending = job; status = MODEL + ' 応答待ち（次: ' + job.label + '）'; redraw($); return; }
  void run($, job);
}

async function run($: any, job: Job) {
  busy = true;
  const gen = generation;
  const started = Date.now();
  status = MODEL + ' にリクエスト中…（' + job.label + '）';
  redraw($);
  const r = await safe(() => $.model.complete({ model: MODEL, system: SYSTEM,
    prompt: job.prompt, maxTokens: 2000, timeoutMs: 90000 }));
  busy = false;
  if (gen === generation) {
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
  const next = pending;
  pending = undefined;
  if (next) await run($, next);
}

function describeStep(index: number, answer: string, toolUses: readonly any[]) {
  const lines = ['## ステップ ' + (index + 1)];
  if (answer.trim()) lines.push(answer.trim());
  for (const t of toolUses) {
    let input = '';
    try { input = JSON.stringify(t.input) ?? ''; } catch { /* unserializable input */ }
    lines.push('ツール: ' + t.name + ' ' + input.slice(0, MAX_TOOL_INPUT));
  }
  return lines.join('\n');
}

function resetTurn() { stepLog = []; stepsTotal = 0; stepsSinceCall = 0; }

export function register(on: any, options: any = {}) {
  const n = Number(options.summaryEverySteps);
  every = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_EVERY;

  on('session.start', async ($: any, e: any, next: any) => {
    interactive = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop');
    await $.command.register({ name: 'openspec-pane', description: 'Haiku のまとめを表示 (off / on / refresh)', immediate: true });
    await safe(() => open($));
    return next(e);
  });

  on('turn.step', async function* ($: any, e: any, next: any) {
    const result = yield* next(e);
    if (e.agentId || !enabled || !interactive || !result) return result;
    stepLog.push(describeStep(stepsTotal, result.answer ?? '', result.toolUses ?? []));
    stepsTotal++;
    stepsSinceCall++;
    if (every > 0 && stepsSinceCall >= every) {
      stepsSinceCall = 0;
      const prompt = '【作業途中: ここまで ' + stepsTotal + ' ステップ】\n\n' + stepLog.join('\n\n').slice(-MAX_ANSWER);
      const label = stepsTotal + ' ステップ時点';
      if (!opened) await safe(() => open($));
      // Outside this dispatch so the step never waits on the model.
      await safe(() => $.clock.after(0, () => { request($, { prompt, label }); }));
    }
    return result;
  });

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e);
    if (e.agentId) return result;
    const answer = typeof e.answer === 'string' ? e.answer.trim() : '';
    resetTurn();
    if (!enabled) return result;
    if (!interactive) { status = 'スキップ: 非対話'; return result; }
    if (!answer) { status = 'スキップ: 応答が空'; await safe(async () => redraw($)); return result; }
    if (!opened) await safe(() => open($));
    // Outside this dispatch so the turn never waits on the model.
    await safe(() => $.clock.after(0, () => { request($, { prompt: answer.slice(0, MAX_ANSWER), label: 'ターン終了' }); }));
    return result;
  });

  on('classic.SessionStart', async ($: any, e: any, next: any) => {
    if (e.source === 'clear') {
      generation++; pending = undefined; lastJob = undefined; summary = ''; tokens = '';
      resetTurn();
      status = '未実行（ステップの進行・ターン終了を待機中）'; redraw($);
    }
    return next(e);
  });

  on('command.run', { command: 'openspec-pane' }, async ($: any, e: any) => {
    const arg = e.args.trim();
    if (arg === 'off') { enabled = false; opened = false; await $.ui.close({ id: PANE }); return {}; }
    if (arg && !['on', 'refresh'].includes(arg)) return { text: '/openspec-pane [on | off | refresh]' };
    enabled = true;
    await open($, true);
    if (arg === 'refresh' && lastJob) request($, lastJob);
    return interactive ? {} : { text: 'OpenSpec ペインは対話型 terminal / Desktop で表示できます。' };
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
        ...(lastJob ? [Button({ key: 'analyze', label: '再要約', onPress: async () => { if (lastJob) request($, lastJob); } })] : []),
        Button({ key: 'close', label: '閉じる', onPress: async () => { enabled = false; opened = false; await $.ui.close({ id: PANE }); } }),
      ] }),
    ];
    if (summary) children.push(Markdown({ text: summary }), text(tokens, true));
    children.push(text('要約: ' + (every > 0 ? every + ' ステップごと＋ターン終了時' : 'ターン終了時のみ'), true),
      text('openspec mod v' + VERSION, true));
    return Box({ flexDirection: 'column', children });
  });
}
