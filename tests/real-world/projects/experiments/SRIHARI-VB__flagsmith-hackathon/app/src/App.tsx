import { useEffect, useRef, useState } from 'react';
import { useExperiment, useFlagsmith, useFlagsmithLoading } from '@flagsmith/flagsmith/react';
import { EVENTS, FLAG, VARIANTS, toVariant, type Variant } from './experiment';
import './App.css';

type Column = 'todo' | 'doing' | 'done';
type Card = { id: string; title: string; column: Column; sample?: boolean };

const COLUMNS: { key: Column; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

const EXAMPLE_CARD: Card = { id: 'ex1', title: "Example: plan this week's priorities", column: 'todo', sample: true };

const firstCardKey = (visitorId: string) => `ft_first_card_sent:${visitorId}`;

export default function App({ visitorId, offline }: { visitorId: string; offline: boolean }) {
  const flagsmith = useFlagsmith();
  const loading = useFlagsmithLoading();

  // Evaluates the flag AND records the exposure (only when this identity is
  // enrolled in a running experiment). Returns null until flags load.
  const flag = useExperiment(FLAG);

  // Offline preview only: ?variant=one_example lets you look at both versions
  // before Flagsmith is configured. Ignored when connected.
  const preview = new URLSearchParams(location.search).get('variant');
  const variant: Variant = offline ? toVariant(preview) : toVariant(flag?.value);
  // Render only once the real assignment arrives from the server. The default
  // flags exist from the first render, so rendering on them would flash the
  // control board before swapping to the assigned variant. If Flagsmith fails
  // or is slow (> 3 s), fall back to control.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const fromServer = String(loading?.source) === 'SERVER';
  const failed = !!loading?.error && !loading.isFetching;
  const ready = offline || fromServer || failed || timedOut;

  return (
    <div className="page" data-variant={ready ? variant : 'loading'}>
      <header className="topbar">
        <span className="logo">▦ Taskboard</span>
        <HelpButton onOpen={() => flagsmith.trackEvent(EVENTS.helpOpened)} />
      </header>

      {offline && (
        <p className="banner">
          Offline preview: set <code>VITE_FLAGSMITH_ENVIRONMENT_ID</code> in <code>.env.local</code> to
          connect. Showing <b>{variant}</b> (switch with <code>?variant=one_example</code>).
        </p>
      )}

      {ready ? (
        <Board key={variant} variant={variant} visitorId={visitorId} />
      ) : (
        <p className="muted">Loading…</p>
      )}

      <footer className="muted small">
        visitor <code>{visitorId}</code> · variant <code>{ready ? variant : '…'}</code>
        {flag?.experiment && <> · experiment <code>{flag.experiment.name}</code> {flag.experiment.inExperiment ? '(enrolled)' : '(not enrolled)'}</>}
      </footer>
    </div>
  );
}

function Board({ variant, visitorId }: { variant: Variant; visitorId: string }) {
  const flagsmith = useFlagsmith();
  const [cards, setCards] = useState<Card[]>(() =>
    variant === VARIANTS.oneExample ? [EXAMPLE_CARD] : [],
  );
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const userCards = cards.filter((c) => !c.sample);

  function addCard(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setCards((cs) => [...cs, { id: crypto.randomUUID(), title: t, column: 'todo' }]);
    setTitle('');

    flagsmith.trackEvent(EVENTS.cardCreated);
    if (!localStorage.getItem(firstCardKey(visitorId))) {
      localStorage.setItem(firstCardKey(visitorId), '1');
      flagsmith.trackEvent(EVENTS.firstCardCreated);
      void flagsmith.flushEvents(); // the primary metric: send it right away
    }
  }

  const move = (id: string, column: Column) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, column } : c)));
  const remove = (id: string) => setCards((cs) => cs.filter((c) => c.id !== id));

  const isEmpty = cards.length === 0;
  const hasExample = cards.some((c) => c.sample);

  return (
    <main>
      {isEmpty && (
        <section className="hero" data-testid="empty-state">
          <h1>Your board is empty</h1>
          <p>Create your first task to get started.</p>
        </section>
      )}

      {variant === VARIANTS.oneExample && hasExample && userCards.length === 0 && (
        <section className="hint" data-testid="example-hint">
          Add your own task below. Delete the example whenever you like.
        </section>
      )}

      <form className="add" onSubmit={addCard}>
        <input
          ref={inputRef}
          data-testid="new-card-input"
          placeholder={isEmpty ? 'Create your first task…' : 'Add a task…'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <button type="submit" data-testid="add-card" disabled={!title.trim()}>
          Add
        </button>
      </form>

      <div className="columns">
        {COLUMNS.map((col) => (
          <section key={col.key} className="column" data-testid={`column-${col.key}`}>
            <h2>
              {col.label} <span className="count">{cards.filter((c) => c.column === col.key).length}</span>
            </h2>
            {cards
              .filter((c) => c.column === col.key)
              .map((c) => (
                <article key={c.id} className={`card${c.sample ? ' sample' : ''}`} data-testid="card">
                  <span>{c.title}</span>
                  {c.sample && <em className="tag">example</em>}
                  <div className="actions">
                    {COLUMNS.filter((o) => o.key !== c.column).map((o) => (
                      <button key={o.key} onClick={() => move(c.id, o.key)} title={`Move to ${o.label}`}>
                        → {o.label}
                      </button>
                    ))}
                    <button onClick={() => remove(c.id)} title="Delete">
                      ✕
                    </button>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </main>
  );
}

function HelpButton({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) onOpen();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="help">
      <button className="link" data-testid="help" onClick={() => setOpen((o) => !o)}>
        How does this work?
      </button>
      {open && (
        <div className="popover" role="dialog">
          Type a task in the box and press <b>Add</b>. Move cards between columns with the arrow
          buttons.
        </div>
      )}
    </div>
  );
}
