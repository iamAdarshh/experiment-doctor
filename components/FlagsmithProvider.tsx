'use client';

// Starts Flagsmith once per page load: init with enableEvents, then identify the random visitor ID.
// The actual SDK calls are in lib/experiment.ts. Without NEXT_PUBLIC_FLAGSMITH_ENV_ID (local dev without
// keys) nothing starts, every visitor sees control and no events are sent.

import { useEffect, type ReactNode } from 'react';
import { startFlagsmith } from '@/lib/experiment';
import { getVisitorId } from '@/lib/identity';

export function FlagsmithProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const environmentID = process.env.NEXT_PUBLIC_FLAGSMITH_ENV_ID;
    if (environmentID) void startFlagsmith(environmentID, getVisitorId());
  }, []);
  return <>{children}</>;
}
