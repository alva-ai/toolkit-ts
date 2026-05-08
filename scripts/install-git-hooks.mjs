#!/usr/bin/env node
// Install the tracked git hooks under scripts/git-hooks/ into .git/hooks/.
// Runs from `npm prepare` so it picks up automatically after `npm install`
// in a fresh checkout. No-op outside the repo (e.g. when this package is
// installed as a dependency by a downstream consumer — `prepare` runs on
// publish but the consumer side will not have a `.git` dir at the package
// root).
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const hooksSrc = join(__dirname, 'git-hooks');

if (!existsSync(hooksSrc)) {
  process.exit(0);
}

// Resolve the right hooks directory. `git rev-parse --git-common-dir`
// returns the shared gitdir for both regular checkouts and `git worktree`
// auxiliaries, where `.git` is a file rather than a directory. Outside a
// git checkout the command fails — treat that as a silent no-op so this
// script is harmless when the package is consumed as a dependency.
let gitCommonDir;
try {
  gitCommonDir = execSync('git rev-parse --git-common-dir', {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  process.exit(0);
}

if (!gitCommonDir) {
  process.exit(0);
}

const resolvedGitDir = isAbsolute(gitCommonDir)
  ? gitCommonDir
  : resolve(repoRoot, gitCommonDir);

const hooksDst = join(resolvedGitDir, 'hooks');
if (!existsSync(hooksDst)) {
  mkdirSync(hooksDst, { recursive: true });
}

let installed = 0;
for (const name of readdirSync(hooksSrc)) {
  const src = join(hooksSrc, name);
  const dst = join(hooksDst, name);
  writeFileSync(dst, readFileSync(src));
  chmodSync(dst, 0o755);
  installed += 1;
}

if (installed > 0) {
  console.log(
    `[install-git-hooks] installed ${installed} hook(s) into .git/hooks/`
  );
}
