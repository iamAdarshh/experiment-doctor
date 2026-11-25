// React bindings: FlagsmithProvider options with enableEvents, useExperiment for the exposure.
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider, useExperiment, useFlagsmith } from '@flagsmith/flagsmith/react';
import { useEffect, type ReactNode } from 'react';

export function Providers({ children, visitorId }: { children: ReactNode; visitorId: string }) {
  return (
    <FlagsmithProvider
      flagsmith={flagsmith}
      options={{ environmentID: 'env_abc123', enableEvents: true, identity: visitorId }}
    >
      {children}
    </FlagsmithProvider>
  );
}

export function Checkout() {
  const client = useFlagsmith();
  const flag = useExperiment('checkout_button');
  useEffect(() => {
    const flush = () => {
      void client.flushEvents();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [client]);
  return <button onClick={() => client.trackEvent('purchase', { value: 1 })}>{String(flag?.value)}</button>;
}
