import assert from 'node:assert/strict';
import test from 'node:test';
import { commandCheck, nodeRuntimeCheck } from './diagnose.mjs';

test('Node 20 이상만 통과한다', () => {
  assert.equal(nodeRuntimeCheck('20.0.0').status, 'pass');
  assert.equal(nodeRuntimeCheck('18.20.0').status, 'fail');
});

test('없는 명령은 비밀값 없이 fail로 보고한다', () => {
  const result = commandCheck('missing', ['--version'], () => ({ error: { code: 'ENOENT' } }));
  assert.deepEqual(result, { status: 'fail', evidence: 'missing command not found' });
});

test('명령 버전 첫 줄만 증거로 사용한다', () => {
  const result = commandCheck('tool', ['--version'], () => ({ status: 0, stdout: 'tool 1.2.3\nextra\n', stderr: '' }));
  assert.deepEqual(result, { status: 'pass', evidence: 'tool 1.2.3' });
});
