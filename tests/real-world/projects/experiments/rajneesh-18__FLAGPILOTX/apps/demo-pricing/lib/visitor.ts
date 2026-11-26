/**
 * A stable anonymous visitor id, stored in localStorage on first visit.
 * Flagsmith experiments need an IDENTITY: the same id must be used for the exposure
 * (getExperimentFlag) and the conversion (trackEvent), or they can't be joined.
 */
const KEY = 'shipyard_visitor_id';

export function getVisitorId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `visitor-${crypto.randomUUID()}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
