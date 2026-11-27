'use client';

// Starts Flagsmith once per page load: init with enableEvents, then identify the random visitor ID.
// The actual SDK calls are in lib/experiment.ts. Without NEXT_PUBLIC_FLAGSMITH_ENV_ID (local dev without
// keys) nothing starts, every visitor sees control and no events are sent.

import { createContext, useEffect, useState, type ReactNode } from 'react';
import { isDemoButtonEnabled, startFlagsmith } from '@/lib/experiment';
import { getVisitorId } from '@/lib/identity';

const environmentID = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID;
const defaultShowDemoButton = process.env.NEXT_PUBLIC_SHOW_DEMO_BUTTON_DEFAULT !== 'false';
export const ShowDemoButtonContext = createContext(defaultShowDemoButton);

export function FlagsmithProvider({ children }: { children: ReactNode }) {
  const [showDemoButton, setShowDemoButton] = useState(defaultShowDemoButton);

  useEffect(() => {
    if (!environmentID) return;
    void startFlagsmith(environmentID, getVisitorId()).then((loaded) => {
      if (loaded) setShowDemoButton(isDemoButtonEnabled(defaultShowDemoButton));
    });
  }, []);

  return <ShowDemoButtonContext.Provider value={showDemoButton}>{children}</ShowDemoButtonContext.Provider>;
}
