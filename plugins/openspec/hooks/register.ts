// Shows a Haiku summary of the latest turn in a right pane. It reads no
// OpenSpec files; the only input is the assistant's answer from turn.complete.
const PANE = 'openspec-impact';
const MODEL = 'haiku';
const MAX_ANSWER = 20000;
// Keep in sync with .claude-plugin/plugin.json "version".
export const VERSION = '0.7.0';

const SYSTEM = [
  'あなたは開発セッションの要約者です。渡されたエージェントの応答を日本語で要約し、可視化してください。',
  '* 先頭に「何をしたか」を1〜2行',
  '* 次に、変更・決定・未解決事項を短い箇条書き（OpenSpec の spec / change に触れていればそれを明記）',
  '* 流れや関係が分かる場合のみ、テキストの簡単な図（矢印）を1つ',
  '推測は書かず、応答に無いことは書かない。全体で20行以内。',
].join('\n');

let interactive = false, enabled = true, opened = false, columns = 0, wanted = 0;
let status = '未実行（ターン終了を待機中）', summary = '', tokens = '';
let running = 0;
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

async function summarize($: any, answer: string) {
  const mine = ++running;
  const started = Date.now();
  status = MODEL + ' にリクエスト中…';
  redraw($);
  const r = await safe(() => $.model.complete({ model: MODEL, system: SYSTEM,
    prompt: answer.slice(0, MAX_ANSWER), maxTokens: 2000, timeoutMs: 90000 }));
  if (mine !== running) return; // Superseded by a newer turn.
  const ms = Date.now() - started;
  if (r?.isAnswered) {
    const u = r.usage ?? {};
    summary = r.text;
    tokens = `入力 ${(u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)} / 出力 ${u.output_tokens ?? 0} トークン`;
    status = MODEL + ' 応答あり（' + ms + ' ms）';
  } else {
    status = MODEL + ' 失敗（' + ms + ' ms）: ' + (r ? r.reason + (r.status ? ' ' + r.status : '') : '呼び出し不可');
  }
  redraw($);
}

let lastAnswer = '';

export function register(on: any) {
  on('session.start', async ($: any, e: any, next: any) => {
    interactive = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop');
    await $.command.register({ name: 'openspec-pane', description: 'Haiku のまとめを表示 (off / on / refresh)', immediate: true });
    await safe(() => open($));
    return next(e);
  });

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e);
    const answer = typeof e.answer === 'string' ? e.answer.trim() : '';
    if (!enabled) return result;
    if (!interactive) { status = 'スキップ: 非対話'; return result; }
    if (!answer) { status = 'スキップ: 応答が空'; await safe(async () => redraw($)); return result; }
    lastAnswer = answer;
    if (!opened) await safe(() => open($));
    // Outside this dispatch so the turn never waits on the model.
    await safe(() => $.clock.after(0, () => { void summarize($, answer); }));
    return result;
  });

  on('classic.SessionStart', async ($: any, e: any, next: any) => {
    if (e.source === 'clear') {
      running++; summary = ''; tokens = ''; lastAnswer = '';
      status = '未実行（ターン終了を待機中）'; redraw($);
    }
    return next(e);
  });

  on('command.run', { command: 'openspec-pane' }, async ($: any, e: any) => {
    const arg = e.args.trim();
    if (arg === 'off') { enabled = false; opened = false; await $.ui.close({ id: PANE }); return {}; }
    if (arg && !['on', 'refresh'].includes(arg)) return { text: '/openspec-pane [on | off | refresh]' };
    enabled = true;
    await open($, true);
    if (arg === 'refresh' && lastAnswer) void summarize($, lastAnswer);
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
        ...(lastAnswer ? [Button({ key: 'analyze', label: '再要約', onPress: async () => { await summarize($, lastAnswer); } })] : []),
        Button({ key: 'close', label: '閉じる', onPress: async () => { enabled = false; opened = false; await $.ui.close({ id: PANE }); } }),
      ] }),
    ];
    if (summary) children.push(Markdown({ text: summary }), text(tokens, true));
    children.push(text('openspec mod v' + VERSION, true));
    return Box({ flexDirection: 'column', children });
  });
}
