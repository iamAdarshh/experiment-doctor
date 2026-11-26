// After the winner ships, removes the experiment from the code: the flag read, the losing branches and
// their copy, leaving the winner hard-coded. Works on a throwaway git worktree, commits to a branch and
// opens a pull request (gh), so the change itself is reviewed again before it merges.
// Deleting the flag in Flagsmith is a separate proposal, made only after this PR merges: deleting first
// would drop production traffic to the flag's default value.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadSource } from './source.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Pure transform of one file's lines. Returns { lines, removed, added } or null if untouched. */
export function rewrite(lines, flag, winner, losers) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const read = new RegExp(`^\\s*(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:await\\s+)?[\\w.]+\\.(?:getExperimentFlag|getFlag)\\(\\s*['"\`]${esc(flag)}['"\`][^;]*;\\s*$`);
  const out = [];
  let removed = 0, added = 0, flagVar = null;
  for (const line of lines) {
    const m = line.match(read);
    if (m) { flagVar = m[1]; removed++; continue; }
    if (flagVar && new RegExp(`\\b${flagVar}\\.value\\b`).test(line)) {
      const a = line.match(/^(\s*)(const|let|var)\s+(\w+)\s*=/);
      if (a) { out.push(`${a[1]}${a[2]} ${a[3]} = '${winner}';`); removed++; added++; continue; }
    }
    if (losers.some((l) => new RegExp(`^\\s*['"]?${esc(l)}['"]?\\s*:`).test(line))) { removed++; continue; }
    out.push(line);
  }
  return removed ? { lines: out, removed, added } : null;
}

export async function cleanup(change) {
  const { flag, src } = change.target;
  const winner = change.after.hardcode;
  const srcAbs = path.resolve(src);
  const root = git(srcAbs, 'rev-parse', '--show-toplevel');
  const rel = path.relative(root, srcAbs);
  const files = loadSource(srcAbs).filter((f) => f.lines.some((l) => l.includes(flag)));
  const losers = ['control', 'bold', ...(change.target.variants ?? [])].filter((v) => v !== winner);
  const branch = `flagmedic/cleanup-${flag}`;
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'flagmedic-'));
  fs.rmSync(wt, { recursive: true, force: true });
  git(root, 'worktree', 'add', '-B', branch, wt, 'HEAD');
  let removed = 0, added = 0;
  try {
    for (const f of files) {
      const r = rewrite(f.lines, flag, winner, losers);
      if (!r) continue;
      fs.writeFileSync(path.join(wt, rel, f.rel), r.lines.join('\n'));
      removed += r.removed; added += r.added;
    }
    if (!removed) throw new Error(`no references to ${flag} found under ${src}`);
    git(wt, 'add', '-A');
    git(wt, 'commit', '-m', `Remove ${flag} experiment: ship "${winner}"\n\nOpened by FlagMedic after a human approved proposal ${change.proposalId ?? ''}.`);
    const diffstat = git(wt, 'diff', '--stat', 'HEAD~1');
    let url = null;
    try {
      git(wt, 'push', '-f', '-u', 'origin', branch);
      url = execFileSync('gh', ['pr', 'create', '--head', branch, '--title', `FlagMedic: remove ${flag}, ship "${winner}"`, '--body', `Experiment finished and a human approved shipping **${winner}**.\n\nThis PR removes the flag read and the losing branches so the winner is hard-coded. Delete the \`${flag}\` flag in Flagsmith only after this merges (FlagMedic queues that as a separate proposal).\n\n\`\`\`\n${diffstat}\n\`\`\``], { cwd: wt, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
      url = `(no PR: ${String(e.stderr || e.message).split('\n')[0]}) branch ${branch} committed locally`;
    }
    return { branch, url, removed, added };
  } finally {
    try { git(root, 'worktree', 'remove', '--force', wt); } catch {}
  }
}
