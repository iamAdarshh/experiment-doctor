// Turns a Flagsmith project snapshot + a code scan into flag-debt findings.
//
// project = { name, environments: [{ id, name }], flags: [{
//   id, name, type, createdAt, archived, tags: string[],
//   states: { [envName]: { enabled, value, updatedAt, segmentOverrides, identityOverrides } }
// }] }

import { closest } from './similar.mjs';

export const RULES = {
  experiment_unwired: {
    severity: 'error',
    title: 'Experiment running, flag not in code',
    why: 'An experiment is running on a flag no code reads, so no exposures are recorded and it can never reach a result.',
    fix: 'Read the flag with getExperimentFlag() where the variants render, or stop the experiment.',
  },
  experiment_done: {
    severity: 'warn',
    title: 'Experiment finished, losing variants still in code',
    why: 'Flagsmith has a decision for this experiment, but the code still branches on the variants that lost.',
    fix: 'Hard-code the winner, delete the losing branches, then delete the flag.',
  },
  missing: {
    severity: 'error',
    title: 'Missing in Flagsmith',
    why: 'Code asks for a flag that does not exist in this project, so it silently gets the SDK default.',
    fix: 'Create the flag in Flagsmith, or fix the typo in code.',
  },
  archived_in_use: {
    severity: 'error',
    title: 'Archived but still in code',
    why: 'The flag is archived in Flagsmith but code still reads it.',
    fix: 'Remove the code path, or unarchive the flag.',
  },
  stale_on: {
    severity: 'warn',
    title: 'Fully rolled out',
    why: 'On with the same value in every environment, with no overrides, for a long time. The flag no longer decides anything.',
    fix: 'Hard-code the "on" path, delete the "off" path, then delete the flag.',
  },
  stale_off: {
    severity: 'warn',
    title: 'Off everywhere',
    why: 'Off in every environment for a long time. The guarded code is dead.',
    fix: 'Delete the guarded code, then delete the flag.',
  },
  prod_only: {
    severity: 'warn',
    title: 'On in production only',
    why: 'Enabled in production but off in every other environment, so it was never exercised before release.',
    fix: 'Turn it on in staging/dev too, or check it was meant to be live.',
  },
  unused: {
    severity: 'info',
    title: 'Not referenced in code',
    why: 'No string in the scanned code matches this flag name.',
    fix: 'Archive the flag in Flagsmith if no other service uses it.',
  },
};

const DAY = 86_400_000;
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

function daysSince(iso, now) {
  if (!iso) return null;
  return Math.floor((now - Date.parse(iso)) / DAY);
}

// A completed experiment whose losing variant values still appear in code. Variant values are
// often short words ("steps"), so they only count in files that read the flag or that list
// at least two of its variant values (a variants map or switch).
function experimentDebt(flag, code, flagRefs, now, graceDays) {
  const finished = (flag.experiments ?? [])
    .filter((x) => x.status === 'completed' && x.decision)
    .sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)))
    .at(-1);
  if (!finished) return null;
  const ageDays = daysSince(finished.endedAt, now);
  if (ageDays !== null && ageDays < graceDays) return null;

  const control = flag.states[finished.environment]?.value;
  const values = [...new Set([control, ...(flag.options ?? []).map((o) => o.value)]
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String))];
  let winner = null;
  if (finished.decision === 'variant') {
    const w = (flag.options ?? []).find((o) => o.id === finished.winnerOptionId);
    winner = w ? String(w.value) : null;
  } else if (finished.decision === 'control') {
    winner = control == null ? null : String(control);
  }

  const relevantFiles = new Set(flagRefs.map((r) => r.file));
  const filesPerValue = new Map(values.map((v) => [v, new Set((code.literals.get(v) ?? []).map((r) => r.file))]));
  const counts = new Map();
  for (const files of filesPerValue.values()) for (const f of files) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts) if (n >= 2) relevantFiles.add(f);

  const losers = values.filter((v) => v !== winner);
  const loserRefs = [];
  const losingInCode = [];
  for (const v of losers) {
    const hits = (code.literals.get(v) ?? []).filter((r) => relevantFiles.has(r.file));
    if (hits.length) losingInCode.push(v);
    loserRefs.push(...hits);
  }
  if (!loserRefs.length) return null;

  const seen = new Set();
  const refs = [...flagRefs, ...loserRefs]
    .filter((r) => !seen.has(`${r.file}:${r.line}`) && seen.add(`${r.file}:${r.line}`))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    refs,
    ageDays,
    environment: finished.environment,
    experiment: finished.name,
    decision: finished.decision,
    winner,
    losers: losingInCode,
  };
}

export function analyse(project, code, options = {}) {
  const now = options.now ?? Date.now();
  const staleDays = options.staleDays ?? 30;
  const prodPattern = new RegExp(options.productionPattern ?? 'prod', 'i');
  const exemptTags = new Set((options.permanentTags ?? ['permanent']).map((t) => t.toLowerCase()));
  const envNames = project.environments.map((e) => e.name);
  const prodEnvs = envNames.filter((n) => prodPattern.test(n));
  const findings = [];
  const add = (rule, flag, extra = {}) =>
    findings.push({ rule, ...RULES[rule], flag: flag.name ?? flag, ...extra });

  const byName = new Map(project.flags.map((f) => [f.name, f]));

  for (const flag of project.flags) {
    const refs = code.literals.get(flag.name) ?? [];
    const permanent = flag.tags.some((t) => exemptTags.has(t.toLowerCase()));
    const states = envNames.map((n) => flag.states[n]).filter(Boolean);

    if (flag.archived) {
      if (refs.length) add('archived_in_use', flag, { refs });
      continue;
    }

    const experiments = flag.experiments ?? [];
    const running = experiments.filter((x) => x.status === 'running');
    if (running.length && !refs.length) {
      add('experiment_unwired', flag, { refs, environments: running.map((x) => x.environment) });
      continue;
    }
    const done = experimentDebt(flag, code, refs, now, options.experimentGraceDays ?? 7);
    if (done) add('experiment_done', flag, done);

    if (!refs.length) add('unused', flag, { refs, ageDays: daysSince(flag.createdAt, now) });
    if (permanent || !states.length) continue;

    const lastChange = states.map((s) => s.updatedAt).filter(Boolean).sort().at(-1) ?? flag.createdAt;
    const age = daysSince(lastChange, now);
    const hasOverrides = states.some((s) => s.segmentOverrides > 0 || s.identityOverrides > 0);
    const allOn = states.every((s) => s.enabled);
    const allOff = states.every((s) => !s.enabled);
    const sameValue = new Set(states.map((s) => JSON.stringify(s.value ?? null))).size === 1;
    const isExperimentish = flag.type === 'MULTIVARIATE';

    if (age !== null && age >= staleDays && !hasOverrides) {
      if (allOn && sameValue && !isExperimentish) add('stale_on', flag, { refs, ageDays: age });
      else if (allOff) add('stale_off', flag, { refs, ageDays: age });
    }
    if (prodEnvs.length && prodEnvs.length < states.length) {
      const prodOn = prodEnvs.every((n) => flag.states[n]?.enabled);
      const othersOff = envNames
        .filter((n) => !prodEnvs.includes(n) && flag.states[n])
        .every((n) => !flag.states[n].enabled);
      if (prodOn && othersOff) add('prod_only', flag, { refs });
    }
  }

  const liveNames = project.flags.filter((f) => !f.archived).map((f) => f.name);
  for (const [key, refs] of code.sdkKeys) {
    if (!byName.has(key)) add('missing', key, { refs, didYouMean: closest(key, liveNames) });
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.rule.localeCompare(b.rule) ||
      a.flag.localeCompare(b.flag),
  );

  const removableRefs = findings
    .filter((f) => ['stale_on', 'stale_off', 'experiment_done'].includes(f.rule))
    .reduce((n, f) => n + f.refs.length, 0);

  // Per-flag table for the HTML dashboard: state in each environment + what was found.
  const rulesByFlag = new Map();
  for (const f of findings) (rulesByFlag.get(f.flag) ?? rulesByFlag.set(f.flag, []).get(f.flag)).push(f.rule);
  const flagTable = project.flags.map((flag) => ({
    id: flag.id,
    name: flag.name,
    type: flag.type,
    archived: flag.archived,
    tags: flag.tags,
    experiment: (flag.experiments ?? []).map((x) => x.status).sort().at(-1) ?? null,
    states: Object.fromEntries(envNames.map((n) => [n, flag.states[n]?.enabled ?? null])),
    refs: (code.literals.get(flag.name) ?? []).length,
    rules: rulesByFlag.get(flag.name) ?? [],
  }));
  for (const [key] of code.sdkKeys) {
    if (!byName.has(key)) {
      flagTable.push({ name: key, type: null, archived: false, tags: [], experiment: null,
        states: {}, refs: code.sdkKeys.get(key).length, rules: rulesByFlag.get(key) ?? [] });
    }
  }

  return {
    findings,
    flags: flagTable,
    summary: {
      project: project.name,
      environments: envNames,
      flags: project.flags.filter((f) => !f.archived).length,
      filesScanned: code.files,
      staleDays,
      counts: Object.fromEntries(
        Object.keys(RULES).map((r) => [r, findings.filter((f) => f.rule === r).length]),
      ),
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warn').length,
      removableRefs,
    },
  };
}
