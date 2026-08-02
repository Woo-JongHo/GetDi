import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function commandCheck(command, args = ['--version'], spawn = spawnSync) {
  const result = spawn(command, args, { encoding: 'utf8', timeout: 3_000 });
  if (result.error?.code === 'ENOENT') return { status: 'fail', evidence: `${command} command not found` };
  if (result.error) return { status: 'unknown', evidence: `${command} check unavailable` };
  const version = `${result.stdout || result.stderr}`.trim().split('\n')[0];
  return result.status === 0
    ? { status: 'pass', evidence: version || `${command} available` }
    : { status: 'unknown', evidence: `${command} returned exit ${result.status}` };
}

export function nodeRuntimeCheck(version = process.versions.node) {
  const major = Number(version.split('.')[0]);
  return major >= 20
    ? { status: 'pass', evidence: `Node v${version}` }
    : { status: 'fail', evidence: `Node v${version}; GetDi requires Node 20+` };
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function serverCheck(fetchImpl = fetch) {
  try {
    const response = await fetchImpl('http://127.0.0.1:5545/', { signal: AbortSignal.timeout(800) });
    return response.ok
      ? { status: 'pass', evidence: 'http://localhost:5545 is reachable' }
      : { status: 'unknown', evidence: `local server returned HTTP ${response.status}` };
  } catch {
    return { status: 'unknown', evidence: 'local server is not running or not reachable' };
  }
}

export async function buildReport({ root, spawn = spawnSync, fetchImpl = fetch } = {}) {
  const projectRoot = root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const hasDependencies = await exists(path.join(projectRoot, 'node_modules'));
  return {
    schema_version: 1,
    project_root: projectRoot,
    stages: [
      { id: 'runtime', ...nodeRuntimeCheck() },
      { id: 'npm', ...commandCheck('npm', ['--version'], spawn) },
      { id: 'dependencies', status: hasDependencies ? 'pass' : 'fail', evidence: hasDependencies ? 'node_modules exists' : 'node_modules is missing' },
      { id: 'claude_cli', ...commandCheck('claude', ['--version'], spawn) },
      { id: 'codex_cli', ...commandCheck('codex', ['--version'], spawn) },
      { id: 'local_server', ...(await serverCheck(fetchImpl)) },
      { id: 'authentication', status: 'unknown', evidence: 'confirm inside the selected CLI; credentials were not inspected' },
    ],
    privacy: 'No environment variables, tokens, API keys, or credential files were read.',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildReport(), null, 2));
}
