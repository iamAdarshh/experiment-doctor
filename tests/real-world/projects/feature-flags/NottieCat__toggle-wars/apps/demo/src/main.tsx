import React from 'react';
import ReactDOM from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import flagsmith from 'flagsmith';
import { FlagsmithProvider } from 'flagsmith/react';
import type { ToggleDockAccent } from 'toggledock';
import './styles/globals.css';
import App from './App';
import { BootScreen } from '@/components/BootScreen';
import {
  parseValidAccent,
  readCachedFlagsmithAccent,
  readLastKnownAccent,
  readLocalAccentOverride,
} from '@/lib/accent';
import { EASE_TECHNICAL } from '@/lib/motion';

const flagsmithApiUrl =
  import.meta.env.VITE_FLAGSMITH_API_URL || 'http://localhost:8000/api/v1/';
const flagsmithEnvironmentId = import.meta.env.VITE_FLAGSMITH_DEV_KEY || '';
const BOOT_TIMEOUT_MS = 15000;
const LOADER_DELAY_MS = 120;

let bootInitPromise: Promise<void> | null = null;
let bootInitSettled = false;

function initFlagsmithOnce(): Promise<void> {
  if (!bootInitPromise) {
    const initAttempt = Promise.resolve()
      .then(() =>
        flagsmith.init({
          environmentID: flagsmithEnvironmentId,
          api: flagsmithApiUrl,
          cacheFlags: true,
        }),
      )
      .then(
        () => undefined,
        () => undefined,
      );

    bootInitPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        bootInitSettled = true;
        window.clearTimeout(timerId);
        resolve();
      };

      const timerId = window.setTimeout(finish, BOOT_TIMEOUT_MS);
      void initAttempt.finally(finish);
    });
  }

  return bootInitPromise;
}

function resolveBootAccent(): ToggleDockAccent {
  const localOverride = readLocalAccentOverride();
  if (localOverride) {
    return localOverride;
  }
  try {
    const liveValue = flagsmith.getValue('theme_accent', { skipAnalytics: true });
    const liveAccent = parseValidAccent(liveValue);
    if (liveAccent) {
      return liveAccent;
    }
  } catch {
    // Fall through to cached or default accent if SDK has not initialized flags.
  }
  return readLastKnownAccent() ?? readCachedFlagsmithAccent() ?? 'emerald';
}

function BootGate() {
  const [ready, setReady] = React.useState<boolean>(() => bootInitSettled);
  const [showLoader, setShowLoader] = React.useState<boolean>(false);
  const prefersReduced = useReducedMotion();

  React.useEffect(() => {
    let active = true;

    const loaderTimerId = window.setTimeout(() => {
      if (active && !bootInitSettled) {
        setShowLoader(true);
      }
    }, LOADER_DELAY_MS);

    void initFlagsmithOnce().then(() => {
      if (!active) {
        return;
      }
      window.clearTimeout(loaderTimerId);
      document.documentElement.dataset.accent = resolveBootAccent();
      setReady(true);
    });

    return () => {
      active = false;
      window.clearTimeout(loaderTimerId);
    };
  }, []);

  const transitionDuration = prefersReduced ? 0.01 : 0.32;

  return (
    <>
      {ready && (
        <FlagsmithProvider flagsmith={flagsmith}>
          <App />
        </FlagsmithProvider>
      )}

      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <AnimatePresence>
          {!ready && showLoader && (
            <motion.div
              key="meridian-boot-screen"
              className="h-full w-full will-change-transform"
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 1.015 }}
              transition={{ duration: transitionDuration, ease: EASE_TECHNICAL }}
            >
              <BootScreen />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document.');
}

void initFlagsmithOnce();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <BootGate />
    </MotionConfig>
  </React.StrictMode>,
);
