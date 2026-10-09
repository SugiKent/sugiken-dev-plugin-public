import { expect, mock, test } from 'claude-code/testing';
import { deltaOps, findings, material, similar } from '../hooks/impact';

const content: Record<string, string> = {
  'openspec/specs/auth/spec.md': [
    '# Auth', '### Requirement: Login', '#### Scenario: 正しいパスワード', '#### Scenario: ロック',
    '### Requirement: Logout', '#### Scenario: 明示的なログアウト',
    '### Requirement: Session Expiry', '#### Scenario: 30分で失効',
  ].join('\n'),
  'openspec/specs/audit/spec.md': '# Audit\n### Requirement: Log events\nLogin の成功と失敗を記録する。',
  'openspec/changes/login/proposal.md': '# Login を変える',
  'openspec/changes/login/specs/auth/spec.md': [
    '## MODIFIED Requirements', '### Requirement: Login', '#### Scenario: 正しいパスワード',
    '## REMOVED Requirements', '### Requirement: Logout',
    '## ADDED Requirements', '### Requirement: Session expiry',
  ].join('\n'),
  'openspec/changes/sso/proposal.md': '# SSO',
  'openspec/changes/sso/specs/auth/spec.md': '## MODIFIED Requirements\n### Requirement: Login\n#### Scenario: SSO',
};

const docs = Object.entries(content).map(([path, text]) => {
  const spec = /^openspec\/specs\/([^/]+)\//.exec(path)?.[1];
  const m = /^openspec\/changes\/([^/]+)\/(?:specs\/([^/]+)\/)?/.exec(path);
  return spec ? { path, text, capability: spec, kind: '現行 spec' }
    : m?.[2] ? { path, text, change: m[1], capability: m[2], kind: 'デルタ仕様' }
    : { path, text, change: m![1], kind: 'change' };
});

test('mechanical checks surface lost scenarios, overlapping changes, look-alikes and mentions', () => {
  const texts = findings(docs, 'login').map(f => f.text);
  expect(texts).toContain('MODIFIED「Login」の delta に無い scenario は消える: ロック');
  expect(texts).toContain('REMOVED「Logout」で scenario 1 件が消える: 明示的なログアウト');
  expect(texts).toContain('進行中の change sso も auth の「Login」を変更している');
  expect(texts).toContain('名前が似た要件: 「Session expiry」(auth) と「Session Expiry」(auth)');
  expect(texts).toContain('spec audit が変更対象の要件名「Login」に言及している');
});

test('delta parsing handles RENAMED and missing requirements', () => {
  expect(deltaOps('## RENAMED Requirements\n- FROM: `### Requirement: A`\n- TO: `### Requirement: B`'))
    .toEqual([{ op: 'RENAMED', name: 'B', from: 'A', scenarios: [] }]);
  const texts = findings([...docs, { path: 'openspec/changes/x/specs/auth/spec.md', change: 'x', capability: 'auth',
    kind: 'デルタ仕様', text: '## MODIFIED Requirements\n### Requirement: Nope' }], 'x').map(f => f.text);
  expect(texts[0]).toMatch(/現行 spec auth に無い/);
  expect(similar('Login', 'Logout')).toBe(false);
});

test('material reports what it had to cut', () => {
  const { prompt, truncated } = material(docs, 'login', findings(docs, 'login'), 200);
  expect(prompt).toMatch(/対象の change: login/);
  expect(truncated.length).toBeGreaterThan(0);
});

const pane = {
  plugin: 'openspec', component: 'Pane', requestId: 'openspec-impact', surface: 'terminal',
  viewport: { columns: 200, rows: 60 },
  props: { title: 'OpenSpec', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const;

function setup(on: any, answer: (e: any) => any) {
  const calls: any[] = [];
  on('session.start', () => ({ cwd: '/work' }));
  on('session.cwd', () => ({ value: '/work' }));
  on('session.root', () => ({ value: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }));
  on('fs.list', ($: any, e: any) => {
    const path = e.path.replace('/work/', '') + '/';
    const entries = new Map();
    for (const [name, text] of Object.entries(content)) {
      if (!name.startsWith(path)) continue;
      const rest = name.slice(path.length), part = rest.split('/')[0];
      entries.set(part, { name: part, kind: rest.includes('/') ? 'dir' : 'file', size: rest.includes('/') ? 0 : text.length, isLink: false });
    }
    return { value: [...entries.values()] };
  });
  on('fs.read', ($: any, e: any) => ({ value: content[e.path.replace('/work/', '')] ?? '' }));
  on('tool.call', () => ({ result: 'unchanged' }));
  on('turn.complete', () => ({ text: '' }));
  on('model.complete', ($: any, e: any) => { calls.push(e); return { value: answer(e) }; });
  return calls;
}
const turn = { turnId: 't', answer: '', durationMs: 0, isAborted: false, usage: null };

test('turn completion asks haiku once per material and shows the answer above the list', async ($, on) => {
  const clock = mock.clock(on);
  const calls = setup(on, () => ({ isAnswered: true, text: '## 意外な発見\n- audit が Login に依存',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }));
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/changes/login/specs/auth/spec.md' });
  await $.turn.complete(turn);
  await clock.settle();
  expect(calls.length).toBe(1);
  expect(calls[0].model).toBe('haiku');
  expect(calls[0].prompt).toMatch(/delta に無い scenario は消える/);
  await $.turn.complete(turn);
  await clock.settle();
  expect(calls.length).toBe(1);
  const ui = await $.ui.mount(pane);
  expect(await ui.find({ type: 'Markdown', text: /audit が Login に依存/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /! MODIFIED「Login」/ })).toBeDefined();
  await ui.press({ key: 'analyze' });
  expect(calls.length).toBe(2);
});

test('a failed model call keeps the mechanical findings and says why', async ($, on) => {
  const clock = mock.clock(on);
  setup(on, () => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded_error',
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }));
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/changes/login/proposal.md' });
  await $.turn.complete(turn);
  await clock.settle();
  const ui = await $.ui.mount(pane);
  expect(await ui.find({ type: 'Text', text: /AI の分析に失敗: api-error 529/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /! REMOVED「Logout」/ })).toBeDefined();
});

test('headless sessions never call the model', async ($, on) => {
  const clock = mock.clock(on);
  const calls = setup(on, () => ({ isAnswered: true, text: 'x', usage: {} }));
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/changes/login/proposal.md' });
  await $.turn.complete(turn);
  await clock.settle();
  expect(calls.length).toBe(0);
});
