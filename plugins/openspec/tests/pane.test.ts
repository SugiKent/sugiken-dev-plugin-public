import { expect, test } from 'claude-code/testing';
import { normalize, pathsFrom, related, relative, rulesFrom } from '../hooks/register';

const pane = {
  plugin: 'openspec', component: 'Pane', requestId: 'openspec-impact',
  viewport: { columns: 200, rows: 60 },
  props: { title: 'OpenSpec', isFocused: true, bodyColumns: 60,
    placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const;
const content = {
  'openspec/specs/auth/spec.md': '# Auth\n### Requirement: Login\n`src/auth.ts`',
  'openspec/changes/login/proposal.md': '# Login\n変更対象: `src/auth.ts`',
  'openspec/changes/login/tasks.md': '- [ ] Implement `src/auth.ts`',
  'openspec/changes/login/specs/auth/spec.md': '## MODIFIED Requirements\n### Requirement: Login\n新しい動作',
  'openspec/specs/billing/spec.md': '# Billing',
  'openspec/changes/archive/old/proposal.md': '# Archived `src/auth.ts`',
};

function setup(on, options: { openFails?: boolean; readFails?: boolean; map?: string; symlink?: boolean; rootSymlink?: boolean } = {}) {
  const events: string[] = [], opens: any[] = [], reads: string[] = [], listings: string[] = [];
  const data = { ...content, ...(options.map ? { 'openspec/pane-map.json': options.map } : {}) };
  on('session.start', () => ({ cwd: '/work' }));
  on('session.cwd', () => ({ value: '/work' }));
  on('session.root', () => ({ value: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.close', () => ({ value: undefined }));
  on('ui.open', ($, e) => {
    events.push('open'); opens.push(e);
    return options.openFails ? { deny: 'private error text' } : { value: { isPlaced: true } };
  });
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: !!options.rootSymlink } }));
  on('fs.list', ($, e) => {
    listings.push(e.path);
    if (options.symlink) {
      if (e.path.endsWith('/openspec')) return { value: [{ name: 'specs', kind: 'dir', size: 0, isLink: false }] };
      if (e.path.endsWith('/openspec/specs')) return { value: [{ name: 'external', kind: 'dir', size: 0, isLink: true }] };
      throw new Error('symlink directory must not be listed');
    }
    const path = e.path.replace('/work/', '') + '/';
    const entries = new Map();
    for (const [name, text] of Object.entries(data)) {
      if (!name.startsWith(path)) continue;
      const rest = name.slice(path.length), part = rest.split('/')[0];
      entries.set(part, { name: part, kind: rest.includes('/') ? 'dir' : 'file',
        size: rest.includes('/') ? 0 : text.length, isLink: false });
    }
    return { value: [...entries.values()] };
  });
  on('fs.read', ($, e) => {
    reads.push(e.path);
    if (options.symlink) throw new Error('symbolic link must not be read');
    return options.readFails ? { deny: 'private error text' } :
      { value: data[e.path.replace('/work/', '')] ?? '' };
  });
  on('tool.call', () => { events.push('tool'); return { result: 'unchanged' }; });
  on('turn.complete', () => ({ text: '' }));
  on('classic.SessionStart', () => ({}));
  return { events, opens, data, reads, listings };
}

test('first OpenSpec read opens BEFORE tool execution and preserves its answer', async ($, on) => {
  const { events } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  const answer = await $.tool.call({ tool: 'Read', file_path: 'openspec/changes/login/proposal.md' });
  expect(events).toEqual(['open', 'tool']);
  expect(answer).toEqual({ result: 'unchanged' });
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ key: 'doc:openspec/specs/auth/spec.md' })).toBeDefined();
  expect(await ui.find({ key: 'doc:openspec/changes/login/specs/auth/spec.md' })).toBeDefined();
  expect(await ui.find({ key: 'doc:openspec/changes/archive/old/proposal.md' })).toBeUndefined();
  await ui.press({ key: 'doc:openspec/changes/login/specs/auth/spec.md' });
  expect(await ui.find({ type: 'Text', text: /MODIFIED Requirements/ })).toBeDefined();
});

test('30 percent width follows viewport measurements without taking focus', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  await $.tool.call({ tool: 'Write', file_path: 'openspec/specs/auth/spec.md', content: '# new' });
  expect(opens[0].columns).toBe(60);
  expect(opens[0].focus).toBeUndefined();
  await ui.unmount();
  await $.ui.mount({ ...pane, viewport: { columns: 160, rows: 60 }, surface: 'terminal' });
  expect(opens.at(-1).columns).toBe(48);
});

test('display failures never suppress a tool or leak exceptions into the pane', async ($, on) => {
  const { events } = setup(on, { openFails: true, readFails: true });
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  expect(await $.tool.call({ tool: 'Edit', file_path: 'openspec/specs/auth/spec.md', old_string: 'a', new_string: 'b' }))
    .toEqual({ result: 'unchanged' });
  expect(events).toContain('tool');
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /private error text/ })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: /取得できません/ })).toBeDefined();
});

test('close pauses auto-opening until explicitly enabled', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  await $.command.run({ command: 'openspec-pane', args: 'off' });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/billing/spec.md' });
  expect(opens.length).toBe(1);
  await $.command.run({ command: 'openspec-pane', args: 'on' });
  expect(opens.length).toBe(2);
});

test('a source path inferred from change docs opens the related pane', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'src/auth.ts' });
  expect(opens.length).toBe(1);
  const ui = await $.ui.mount({ ...pane, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /パス記述による推定/ })).toBeDefined();
});

test('an unrelated file does not open a pane; explicit map adds otherwise unknown specs', async ($, on) => {
  const { opens } = setup(on, { map: JSON.stringify([{ files: ['src/payments/**'], specs: ['billing'] }]) });
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'src/other.ts' });
  expect(opens.length).toBe(0);
  await $.tool.call({ tool: 'Read', file_path: 'src/payments/charge.ts' });
  expect(opens.length).toBe(1);
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ key: 'doc:openspec/specs/billing/spec.md' })).toBeDefined();
});

test('headless sessions observe files without attempting to open UI', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  expect(opens.length).toBe(0);
});

test('clear forgets the previous task rather than carrying its impact list', async ($, on) => {
  setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  await $.classic.SessionStart({ source: 'clear' });
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: 'ファイルの操作待ち' })).toBeDefined();
  expect(await ui.find({ key: 'doc:openspec/specs/auth/spec.md' })).toBeUndefined();
});

test('path boundaries exclude neighbouring projects and normalize dot segments', () => {
  expect(relative('/work-other/openspec/specs/auth/spec.md', '/work')).toBeUndefined();
  expect(relative('../other.ts', '/work', '/work')).toBeUndefined();
  expect(relative('./openspec/specs/../specs/auth/spec.md', '/work')).toBe('openspec/specs/auth/spec.md');
  expect(normalize('../../outside')).toBe('');
  expect(pathsFrom({ tool: 'Bash', command: 'cat "openspec/changes/login/proposal.md"' }))
    .toEqual(['openspec/changes/login/proposal.md']);
});

test('mapping rejects traversal and matches full paths without basename guesses', () => {
  expect(() => rulesFrom([{ files: ['../secret'], specs: ['auth'] }])).toThrow();
  const docs = [{ path: 'openspec/specs/auth/spec.md', capability: 'auth', kind: '現行 spec', text: '`auth.ts`' }];
  expect(related(docs, ['src/auth.ts'], []).length).toBe(0);
  expect(related(docs, ['src/auth.ts'], rulesFrom([{ files: ['src/*.ts'], specs: ['auth'] }])).length).toBe(1);
});

test('literal Bash OpenSpec access also opens before execution', async ($, on) => {
  const { events } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Bash', command: 'cat openspec/changes/login/proposal.md' });
  expect(events).toEqual(['open', 'tool']);
});

test('a reread updates the visible spec and turn completion catches disk changes', async ($, on) => {
  const { data } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  data['openspec/specs/auth/spec.md'] = '# Changed on disk';
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  let ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: '# Changed on disk' })).toBeDefined();
  await ui.unmount();
  data['openspec/specs/auth/spec.md'] = '# Changed during turn';
  await $.turn.complete({ turnId: 't', answer: '', durationMs: 0, isAborted: false, usage: null });
  ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: '# Changed during turn' })).toBeDefined();
});

test('invalid maps show incomplete matching rather than a confident no-impact claim', async ($, on) => {
  setup(on, { map: '{malformed' });
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /対応表の判定は未実施/ })).toBeDefined();
});

test('documents reached through symbolic links are never indexed', async ($, on) => {
  const { reads, listings } = setup(on, { symlink: true });
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/external/spec.md' });
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ key: 'doc:openspec/specs/external/spec.md' })).toBeUndefined();
  expect(reads).toEqual([]);
  expect(listings).toEqual(['/work/openspec', '/work/openspec/specs']);
});

test('a symlink at the OpenSpec root does not expose another directory', async ($, on) => {
  const { reads, listings } = setup(on, { rootSymlink: true });
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.tool.call({ tool: 'Read', file_path: 'openspec/specs/auth/spec.md' });
  expect(reads).toEqual([]);
  expect(listings).toEqual([]);
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /リンク先のため未取得/ })).toBeDefined();
});
