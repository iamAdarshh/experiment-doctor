// A random visitor ID that stays the same across visits in this browser. Flagsmith buckets on the identity
// key, so the same visitor always lands in the same arm. The ID is random: it says nothing about the person.

const STORAGE_KEY = 'experiment-doctor:visitor-id';

export function getVisitorId(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage can be blocked (private mode, strict settings). A per-page-load ID still works for one visit.
    return crypto.randomUUID();
  }
}
