import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('a delayed login cannot restore a signed-out CV session or overtake the next login', async () => {
  const source = await readFile(new URL('../src/cv-studio.mjs', import.meta.url), 'utf8');
  const calls = [], messages = [];
  const context = vm.createContext({
    profiles: new Map(), sessionReady: false, editing: null, sessionPrompt: null, editorRequestId: 0,
    cancelCvConfirmation() {}, cvStudioClearReport() {}, closeEditor() {}, message: text => messages.push(text),
    api: (path, body) => new Promise(resolve => calls.push({ body, resolve }))
  });
  vm.runInContext(source.slice(source.indexOf('let sessionOperations'), source.indexOf('const byId'))
    + source.slice(source.indexOf('async function signIn('), source.indexOf('async function load(')), context);
  const first = context.signIn('100', 'test');
  await new Promise(resolve => setImmediate(resolve));
  const logout = context.signOut();
  const second = context.signIn('200', 'test');
  assert.equal(calls.length, 1);
  calls[0].resolve({ ok: true });
  assert.equal(await first, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1].body.action, 'logout');
  assert.equal(context.sessionReady, false);
  calls[1].resolve({ ok: true }); await logout;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[2].body.employeeId, '200');
  calls[2].resolve({ ok: true });
  assert.equal(await second, true);
  assert.equal(context.sessionReady, true);
  assert.equal(messages.length, 1, 'superseded operations never replace the current session status');
});
