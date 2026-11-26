// The browser side of the Demo Shop, using Flagsmith's React SDK.
// The official Code References pattern doesn't see useFlags([...]); FlagLens's default extra pattern does.

import { useFlags } from 'flagsmith/react';

export function Banner() {
  const { banner_text, checkout_button_color } = useFlags(['banner_text', 'checkout_button_color']);
  if (!banner_text.enabled) return null;
  return <div style={{ borderColor: String(checkout_button_color.value) }}>{banner_text.value}</div>;
}
