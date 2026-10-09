// All I/O goes through the mods API. No process or network calls; the only
// model call is the impact analysis below, through the session's own client.
import { currentChange, findings, material, SYSTEM } from './impact';

const PANE = 'openspec-impact';
const MAX_DOCS = 200;
const MAX_FILE = 256 * 1024;
const MAX_TEXT = 4 * 1024 * 1024;
const MODEL = 'haiku';
// Haiku request status shown at the top of the pane.
let status = '未実行（ターン終了を待機中）';
// Keep in sync with .claude-plugin/plugin.json "version".
export const VERSION = '0.6.0';

type Doc = { path: string; text: string; capability?: string; change?: string; kind: string };
type Rule = { files: string[]; specs?: string[]; changes?: string[] };

export function normalize(path: string): string {
  const prefix = path.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return ''; parts.pop(); }
    else parts.push(part);
  }
  return prefix + parts.join('/');
}

export function relative(path: string, root: string, cwd = root): string | undefined {
  const absolute = normalize(path.startsWith('/') ? path : cwd + '/' + path);
  const base = normalize(root).replace(/\/$/, '');
  return absolute.startsWith(base + '/') ? absolute.slice(base.length + 1) : undefined;
}

function glob(pattern: string, path: string): boolean {
  if (!pattern || pattern.startsWith('/') || pattern.split('/').includes('..')) return false;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  return new RegExp('^' + escaped + '$').test(path);
}

export function rulesFrom(value: unknown): Rule[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('invalid map');
  const names = (xs: unknown) => xs === undefined || (Array.isArray(xs) &&
    xs.every(x => typeof x === 'string' && /^[a-zA-Z0-9_-]+$/.test(x)));
  if (!value.every(r => r && Array.isArray(r.files) && r.files.length > 0 &&
    r.files.every((p: unknown) => typeof p === 'string' && p.length <= 512 &&
      !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..')) &&
    names(r.specs) && names(r.changes))) throw new Error('invalid map');
  return value;
}

export function pathsFrom(e: any): string[] {
  const paths = [e.file_path, e.notebook_path];
  if (e.tool === 'Glob' || e.tool === 'Grep') paths.push(e.path);
  // Literal path operands only. Never run or attempt to interpret shell code.
  if (e.tool === 'Bash' && typeof e.command === 'string') {
    for (const token of e.command.match(/[^\s'"`;|&<>]+/g) ?? []) {
      if (/(^|\/)openspec(\/|$)/.test(token) && !/[${}*?()]/.test(token)) paths.push(token);
    }
  }
  return [...new Set(paths.filter(p => typeof p === 'string' && p.length > 0))] as string[];
}

function mentions(text: string, file: string): boolean {
  // Match a full path or a quoted directory, not common basenames or words.
  const paths = text.match(/`[^`\n]+`/g)?.map(p => p.slice(1, -1)) ?? [];
  return paths.some(p => p === file || (p.endsWith('/') && file.startsWith(p)) ||
    (p.includes('*') && glob(p, file))) ||
    new RegExp('(^|[\\s`"\'(])' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '(?=$|[\\s`"\'):,])', 'm').test(text);
}

export function related(docs: Doc[], files: string[], rules: Rule[]) {
  const reasons = new Map<string, Set<string>>();
  const add = (doc: Doc, reason: string) => {
    if (!reasons.has(doc.path)) reasons.set(doc.path, new Set());
    reasons.get(doc.path)!.add(reason);
  };
  for (const file of files) {
    const spec = /^openspec\/specs\/([^/]+)(?:\/|$)/.exec(file)?.[1];
    const change = /^openspec\/changes\/([^/]+)(?:\/|$)/.exec(file)?.[1];
    for (const doc of docs) {
      if (doc.path === file || (spec && doc.capability === spec) ||
        (change && change !== 'archive' && doc.change === change)) add(doc, '直接: ' + file);
      if (!file.startsWith('openspec/') && mentions(doc.text, file)) add(doc, 'パス記述による推定: ' + file);
      for (const rule of rules) {
        if (rule.files.some(p => glob(p, file)) &&
          ((doc.capability && rule.specs?.includes(doc.capability)) ||
           (doc.change && rule.changes?.includes(doc.change)))) add(doc, '対応表: ' + file);
      }
    }
  }
  // A matched change brings its delta specs and corresponding current specs.
  const changes = new Set(docs.filter(d => reasons.has(d.path) && d.change).map(d => d.change));
  const caps = new Set(docs.filter(d => changes.has(d.change) && d.capability).map(d => d.capability));
  for (const doc of docs) {
    if (doc.change && changes.has(doc.change) && !reasons.has(doc.path)) add(doc, '関連 change: ' + doc.change);
    if (!doc.change && doc.capability && caps.has(doc.capability) && !reasons.has(doc.path))
      add(doc, 'change の対象仕様: ' + doc.capability);
  }
  return docs.filter(d => reasons.has(d.path)).map(doc => ({ ...doc, reasons: [...reasons.get(doc.path)!] }));
}

// Lifetime is this loaded session only; no shared disk state between agents.
let root = '', cwd = '', interactive = false;
let files: string[] = [], docs: Doc[] = [], rules: Rule[] = [];
let warnings: string[] = [];
let enabled = true, opened = false, columns = 0, wanted = 0, revision = 0;
let queue = Promise.resolve();
// One analysis at a time; the latest material wins. Cache keyed by prompt.
type Analysis = { change: string; prompt: string; state: 'running' | 'done' | 'failed';
  text?: string; reason?: string; truncated: string[]; tokens?: string };
let analysis: Analysis | undefined;
const cache = new Map<string, string>();
const redraw = ($: any) => $.ui.invalidate('ui.render');
const warn = (text: string) => { if (!warnings.includes(text)) warnings.push(text); };
const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return undefined; } };

async function open($: any, focus = false) {
  if (!interactive) return;
  const result = await $.ui.open({ id: PANE, title: 'OpenSpec',
    ...(wanted > 0 ? { columns: wanted } : {}), ...(focus ? { focus: true } : {}) });
  opened = true;
  columns = wanted;
  if (result?.isPlaced === false) warn('自動表示は端末幅待ちです。/openspec-pane で開けます。');
}

async function locate($: any) {
  cwd = normalize(await $.session.cwd());
  // Session root bounds ancestor discovery; do not cross to a neighbouring repo.
  const base = normalize(await $.session.root());
  let candidate = cwd;
  while (candidate === base || candidate.startsWith(base + '/')) {
    const stat = await safe(() => $.fs.stat(candidate + '/openspec'));
    if (stat?.kind === 'dir' && !stat.isLink) return candidate;
    if (candidate === base) break;
    candidate = candidate.slice(0, candidate.lastIndexOf('/'));
  }
  return base;
}

async function scan($: any) {
  const generation = revision, base = root;
  const found: Doc[] = [];
  const notes: string[] = [];
  let total = 0, listings = 0;
  const note = (s: string) => { if (!notes.includes(s)) notes.push(s); };
  const list = async (path: string) => {
    if (++listings > 600) {
      note('ディレクトリ取得の上限に達しました。一部の文書は未取得です。'); return [];
    }
    try { return (await $.fs.list(base + '/' + path)).filter((e: any) => !e.isLink); }
    catch { note('一部の OpenSpec ディレクトリを取得できません。'); return []; }
  };
  const read = async (path: string, entry: any, meta: Partial<Doc>) => {
    if (entry.kind !== 'file') return;
    if (found.length >= MAX_DOCS || entry.size > MAX_FILE || total + entry.size > MAX_TEXT) {
      note('表示対象の上限に達しました。一部の文書は未取得です。'); return;
    }
    try {
      const text = await $.fs.read(base + '/' + path);
      total += text.length;
      found.push({ path, text, kind: '文書', ...meta });
    } catch { note('一部の OpenSpec 文書を取得できません。'); }
  };
  // Check the OpenSpec root too; list() would otherwise follow a root symlink.
  const specRoot = await safe(() => $.fs.stat(base + '/openspec'));
  if (!specRoot || specRoot.kind !== 'dir' || specRoot.isLink) {
    if (generation === revision && base === root) {
      docs = []; rules = []; warnings = ['OpenSpec が未導入、取得不可、またはリンク先のため未取得です。'];
      redraw($);
    }
    return;
  }
  const top = await list('openspec');
  for (const area of ['specs', 'changes']) {
    if (!top.some((e: any) => e.name === area && e.kind === 'dir')) continue;
    const dirs = await list('openspec/' + area);
    if (dirs.length > MAX_DOCS) note('表示対象の上限に達しました。一部の文書は未取得です。');
    for (const dir of dirs.slice(0, MAX_DOCS)) {
      if (found.length >= MAX_DOCS || total >= MAX_TEXT) {
        note('表示対象の上限に達しました。一部の文書は未取得です。'); break;
      }
      if (dir.kind !== 'dir' || dir.name === 'archive') continue;
      const prefix = 'openspec/' + area + '/' + dir.name;
      const entries = await list(prefix);
      if (area === 'specs') {
        for (const entry of entries.filter((e: any) => e.name === 'spec.md'))
          await read(prefix + '/spec.md', entry, { capability: dir.name, kind: '現行 spec' });
      } else {
        for (const entry of entries.filter((e: any) => ['proposal.md', 'design.md', 'tasks.md'].includes(e.name)))
          await read(prefix + '/' + entry.name, entry, { change: dir.name, kind: 'change' });
        if (entries.some((e: any) => e.name === 'specs' && e.kind === 'dir')) {
          const caps = await list(prefix + '/specs');
          if (caps.length > MAX_DOCS) note('表示対象の上限に達しました。一部の文書は未取得です。');
          for (const cap of caps.slice(0, MAX_DOCS)) {
            if (found.length >= MAX_DOCS || total >= MAX_TEXT) {
              note('表示対象の上限に達しました。一部の文書は未取得です。'); break;
            }
            if (cap.kind !== 'dir') continue;
            for (const entry of (await list(prefix + '/specs/' + cap.name)).filter((e: any) => e.name === 'spec.md'))
              await read(prefix + '/specs/' + cap.name + '/spec.md', entry,
                { change: dir.name, capability: cap.name, kind: 'デルタ仕様' });
          }
        }
      }
    }
  }
  let mapping: Rule[] = [];
  const entry = top.find((e: any) => e.name === 'pane-map.json' && e.kind === 'file');
  if (entry) {
    try {
      if (entry.size > MAX_FILE) throw new Error('large map');
      mapping = rulesFrom(JSON.parse(await $.fs.read(base + '/openspec/pane-map.json')));
    } catch { note('pane-map.json を読み込めません。対応表の判定は未実施です。'); }
  }
  if (generation !== revision || base !== root) return;
  docs = found; rules = mapping; warnings = notes;
  redraw($);
}
function refresh($: any) {
  const generation = revision, base = root;
  queue = queue.then(() => generation === revision && base === root ? scan($) : undefined).catch(() => { warn('OpenSpec の更新を取得できません。'); redraw($); });
  return queue;
}

function target() {
  const change = currentChange(files, docs) ??
    related(docs, files, rules).find(d => d.change)?.change;
  return change ? { change, notes: findings(docs, change) } : undefined;
}

async function analyze($: any, force = false) {
  const t = target();
  if (!t) { status = '対象 change を特定できず、リクエストしていません'; redraw($); return; }
  const { prompt, truncated } = material(docs, t.change, t.notes);
  if (!force && analysis?.prompt === prompt && analysis.state !== 'failed') return;
  if (!force && cache.has(prompt)) {
    analysis = { change: t.change, prompt, state: 'done', text: cache.get(prompt), truncated };
    status = 'キャッシュ済みの結果を表示（リクエストなし）'; redraw($); return;
  }
  const mine: Analysis = analysis = { change: t.change, prompt, state: 'running', truncated };
  const started = Date.now();
  status = MODEL + ' にリクエスト中…';
  redraw($);
  const r = await safe(() => $.model.complete({ model: MODEL, system: SYSTEM, prompt,
    maxTokens: 4000, timeoutMs: 90000 }));
  if (analysis !== mine) return; // Superseded by newer material.
  if (r?.isAnswered) {
    cache.set(prompt, r.text);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    const u = r.usage ?? {};
    status = MODEL + ' 応答あり（' + (Date.now() - started) + ' ms）';
    analysis = { ...mine, state: 'done', text: r.text,
      tokens: `入力 ${(u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)} / 出力 ${u.output_tokens ?? 0} トークン` };
  } else {
    status = MODEL + ' 失敗（' + (Date.now() - started) + ' ms）: ' + (r ? r.reason + (r.status ? ' ' + r.status : '') : '呼び出し不可');
    analysis = { ...mine, state: 'failed', reason: r ? r.reason + (r.status ? ' ' + r.status : '') : '呼び出し不可' };
  }
  redraw($);
}

export function register(on: any) {
  on('session.start', async ($: any, e: any, next: any) => {
    interactive = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop');
    cwd = e.cwd; root = normalize(e.cwd);
    await $.command.register({ name: 'openspec-pane', description: '関連する OpenSpec を表示 (off / on / refresh)', immediate: true });
    return next(e);
  });

  on('tool.call', async ($: any, e: any, next: any) => {
    const paths = pathsFrom(e);
    let touched: string[] = [];
    // UI or filesystem failures must never change a tool's execution/result.
    await safe(async () => {
      if (!enabled || paths.length === 0) return;
      const base = await locate($);
      if (root !== base) {
        root = base; revision++; files = []; docs = []; rules = []; warnings = [];
      }
      touched = paths.map(p => relative(p, root, cwd)).filter((p): p is string => !!p);
      files = [...new Set([...touched, ...files])].slice(0, 40);
      if (touched.some(p => p === 'openspec' || p.startsWith('openspec/'))) {
        if (!opened) await open($); // Before next(e): opens at the first access.
      }
      redraw($);
    });
    const result = await next(e);
    await safe(async () => {
      if (!enabled || touched.length === 0) return;
      if (!docs.length || touched.some(p => p === 'openspec' || p.startsWith('openspec/')) ||
        !['Read', 'Grep', 'Glob'].includes(e.tool)) await refresh($);
      if (!opened && related(docs, files, rules).length > 0) await open($);
      redraw($);
    });
    return result;
  });

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e);
    if (enabled && files.length) {
      await safe(() => refresh($));
      // Outside this dispatch so the turn never waits on the model.
      if (interactive && opened) await safe(() => $.clock.after(0, () => { void analyze($); }));
      else { status = 'スキップ: ' + (!interactive ? '非対話' : 'pane 未表示'); await safe(async () => redraw($)); }
    } else if (enabled) { status = 'スキップ: openspec 配下のファイル操作を未検出'; await safe(async () => redraw($)); }
    return result;
  });

  on('classic.SessionStart', async ($: any, e: any, next: any) => {
    if (e.source === 'clear') {
      revision++; files = []; docs = []; rules = []; warnings = [];
      analysis = undefined; status = '未実行（ターン終了を待機中）'; redraw($);
    }
    return next(e);
  });

  on('command.run', { command: 'openspec-pane' }, async ($: any, e: any) => {
    const arg = e.args.trim();
    if (arg === 'off') { enabled = false; opened = false; await $.ui.close({ id: PANE }); return {}; }
    if (arg && !['on', 'refresh'].includes(arg)) return { text: '/openspec-pane [on | off | refresh]' };
    enabled = true;
    const base = await locate($);
    if (base !== root) { root = base; revision++; files = []; }
    await refresh($);
    await open($, true);
    return interactive ? {} : { text: 'OpenSpec ペインは対話型 terminal / Desktop で表示できます。' };
  });

  on('ui.close', async ($: any, e: any, next: any) => {
    if (e.id === PANE && e.origin.kind === 'person') { enabled = false; opened = false; }
    return next(e);
  });

  // Keep the last measured window width even before the pane has opened.
  on('ui.render', async ($: any, e: any, next: any) => {
    if (e.viewport?.columns > 0) wanted = Math.max(1, Math.round(e.viewport.columns * 0.3));
    if (e.component !== 'Pane' || e.requestId !== PANE) return next(e);
    if (opened && wanted !== columns) await safe(() => open($));
    const { Box, Text, Button, Markdown } = $.ui.resolve(e);
    const text = (s: string, dim = false) => Text({ children: [s], ...(dim ? { dimColor: true } : {}) });
    const button = (key: string, label: string, fn: () => any) => Button({ key, label, onPress: fn });
    const t = target();
    const now = t && analysis?.change === t.change ? analysis : undefined;
    const children: any[] = [text('Haiku: ' + status, true),
      text(t ? 'OpenSpec: ' + t.change : 'OpenSpec: 対象 change 待ち'),
      ...warnings.map(w => text(w, true)),
      Box({ flexDirection: 'row', columnGap: 1, children: [
        ...(t ? [button('analyze', now ? '再分析' : '分析', async () => { await analyze($, true); })] : []),
        button('close', '閉じる', async () => { enabled = false; opened = false; await $.ui.close({ id: PANE }); }),
      ] }),
    ];
    if (now?.state === 'done') children.push(Markdown({ text: now.text! }),
      text((now.tokens ?? '') + (now.truncated.length ? ' 省略: ' + now.truncated.join(', ') : ''), true));
    children.push(text('openspec mod v' + VERSION, true));
    return Box({ flexDirection: 'column', children });
  });
}
