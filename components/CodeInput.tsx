'use client';

// The four input boxes. Only code is required; the others unlock more checks.

export type CodeInputValue = { code: string; dependencies: string; metricNames: string; flagJson: string };

type Props = {
  value: CodeInputValue;
  onChange: (value: CodeInputValue) => void;
  onScan: () => void;
  onLoadExample: () => void;
};

const boxClass =
  'w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none';

export function CodeInput({ value, onChange, onScan, onLoadExample }: Props) {
  const set = (field: keyof CodeInputValue) => (event: React.ChangeEvent<HTMLTextAreaElement>) =>
    onChange({ ...value, [field]: event.target.value });

  return (
    <section className="space-y-4">
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Your code never leaves your browser. All checks run locally; nothing you paste is sent anywhere.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Flagsmith code (JS/TS). Several files? Start each with <code>{'// @file path'}</code></span>
        <textarea className={boxClass} rows={14} value={value.code} onChange={set('code')} spellCheck={false} />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Dependency file (optional)</span>
          <textarea className={boxClass} rows={5} value={value.dependencies} onChange={set('dependencies')} placeholder="package.json, requirements.txt, go.mod..." spellCheck={false} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Metric names, one per line (optional)</span>
          <textarea className={boxClass} rows={5} value={value.metricNames} onChange={set('metricNames')} placeholder="purchase" spellCheck={false} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">flagsmith feature get &lt;flag&gt; --json (optional)</span>
          <textarea className={boxClass} rows={5} value={value.flagJson} onChange={set('flagJson')} spellCheck={false} />
        </label>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onScan} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
          Scan
        </button>
        <button type="button" onClick={onLoadExample} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100">
          Load a broken example
        </button>
      </div>
    </section>
  );
}
