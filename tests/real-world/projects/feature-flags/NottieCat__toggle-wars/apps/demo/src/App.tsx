import * as React from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { useFlags, useFlagsmith } from 'flagsmith/react';
import {
  ToggleDock,
  getActiveToggleDockBridge,
  useToggleDockRevision,
  type FlagValue,
  type ToggleDockAccent,
  type TraitValue,
} from 'toggledock';
import { AiCopilotPanel } from '@/components/AiCopilotPanel';
import { AmbientCursor } from '@/components/AmbientCursor';
import { Header } from '@/components/Header';
import { HeroTelemetry } from '@/components/HeroTelemetry';
import { OnboardingSection } from '@/components/OnboardingSection';
import { PricingSection } from '@/components/PricingSection';
import { PromoBanner } from '@/components/PromoBanner';
import { Separator } from '@/components/ui/separator';
import {
  parseValidAccent,
  readLastKnownAccent,
  readLocalAccentOverride,
  writeLastKnownAccent,
} from '@/lib/accent';
import { EASE_TECHNICAL, PRESENCE_TRANSITION } from '@/lib/motion';

const DEMO_FLAG_KEYS = [
  'promo_banner',
  'ai_copilot_widget',
  'pricing_experiment',
  'onboarding_flow',
  'theme_accent',
] as const;

type DemoFlagKey = (typeof DEMO_FLAG_KEYS)[number];

function normalizeTrait(raw: unknown): TraitValue {
  if (
    raw === null ||
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
  ) {
    return raw;
  }
  return String(raw);
}

export default function App() {
  const prefersReduced = useReducedMotion();
  const flagsmith = useFlagsmith();
  // Standard flagsmith/react hook handles initial SDK load.
  const sdkFlags = useFlags(DEMO_FLAG_KEYS);
  // Reactive revision hook keeps UI live across unlimited ToggleDock toggles
  // and identity switches despite flagsmith@10.0.0's events.once listener drop.
  const revision = useToggleDockRevision(flagsmith);

  const effectiveFlags = React.useMemo(() => {
    const snapshot = {} as Record<DemoFlagKey, { enabled: boolean; value: FlagValue }>;
    for (const key of DEMO_FLAG_KEYS) {
      const enabled = Boolean(flagsmith.hasFeature(key, { skipAnalytics: true }));
      const rawValue = flagsmith.getValue(key, { skipAnalytics: true });
      snapshot[key] = {
        enabled,
        value: rawValue === undefined ? null : (rawValue as FlagValue),
      };
    }
    return snapshot;
  }, [flagsmith, sdkFlags, revision]);

  const overriddenKeys = React.useMemo(() => {
    const bridge = getActiveToggleDockBridge(flagsmith);
    const keys = new Set<string>();
    if (!bridge) {
      return keys;
    }
    const overrides = bridge.store.getOverrides();
    for (const [key, entry] of Object.entries(overrides)) {
      if (entry && (entry.enabled !== undefined || entry.value !== undefined)) {
        keys.add(key);
      }
    }
    return keys;
  }, [flagsmith, revision]);

  const liveIdentity = React.useMemo<string | null>(() => {
    const direct = flagsmith.identity;
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
    const fromContext = flagsmith.getContext?.()?.identity?.identifier;
    if (typeof fromContext === 'string' && fromContext.length > 0) {
      return fromContext;
    }
    const fromState = flagsmith.getState?.()?.identity;
    if (typeof fromState === 'string' && fromState.length > 0) {
      return fromState;
    }
    return null;
  }, [flagsmith, sdkFlags, revision]);

  const liveTraits = React.useMemo<Record<string, TraitValue>>(() => {
    const out: Record<string, TraitValue> = {};
    const allTraits = flagsmith.getAllTraits?.();
    if (allTraits && typeof allTraits === 'object') {
      for (const [key, value] of Object.entries(allTraits)) {
        if (value !== undefined) {
          out[key] = normalizeTrait(value);
        }
      }
      return out;
    }
    const ctxTraits = flagsmith.getContext?.()?.identity?.traits;
    if (ctxTraits && typeof ctxTraits === 'object') {
      for (const [key, entry] of Object.entries(ctxTraits)) {
        if (entry && typeof entry === 'object' && 'value' in entry) {
          out[key] = normalizeTrait((entry as { value?: unknown }).value);
        } else if (entry !== undefined) {
          out[key] = normalizeTrait(entry);
        }
      }
    }
    return out;
  }, [flagsmith, sdkFlags, revision]);

  const promoEnabled = effectiveFlags.promo_banner.enabled;
  const aiCopilotEnabled = effectiveFlags.ai_copilot_widget.enabled;
  const pricingVariant = String(effectiveFlags.pricing_experiment.value ?? 'control');
  const onboardingVariant = String(effectiveFlags.onboarding_flow.value ?? 'wizard');
  const activeAccent = React.useMemo<ToggleDockAccent>(() => {
    const bridge = getActiveToggleDockBridge(flagsmith);
    if (!bridge) {
      const localOverride = readLocalAccentOverride();
      if (localOverride) {
        return localOverride;
      }
    }
    const resolvedLive = parseValidAccent(effectiveFlags.theme_accent.value);
    if (resolvedLive) {
      return resolvedLive;
    }
    return readLastKnownAccent() ?? 'emerald';
  }, [flagsmith, revision, effectiveFlags.theme_accent.value]);

  // Sync root document accent attribute synchronously before paint whenever theme_accent updates.
  React.useLayoutEffect(() => {
    document.documentElement.dataset.accent = activeAccent;
  }, [activeAccent]);

  // Persist last confirmed live accent so offline boot fallbacks preserve the user's real accent.
  React.useEffect(() => {
    if (
      flagsmith.initialised &&
      parseValidAccent(effectiveFlags.theme_accent.value) !== null
    ) {
      writeLastKnownAccent(activeAccent);
    }
  }, [flagsmith, flagsmith.initialised, effectiveFlags.theme_accent.value, activeAccent]);

  const adminProxyUrl =
    import.meta.env.VITE_FLAGSMITH_ADMIN_PROXY_URL || '/api/flagsmith-admin';
  const devEnvKey =
    import.meta.env.VITE_FLAGSMITH_DEV_ENV_KEY || import.meta.env.VITE_FLAGSMITH_DEV_KEY;
  const prodEnvKey =
    import.meta.env.VITE_FLAGSMITH_PROD_ENV_KEY ||
    import.meta.env.VITE_FLAGSMITH_PROD_KEY;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-canvas text-ink-primary">
        <AmbientCursor />

        <AnimatePresence initial={false}>
          {promoEnabled && (
            <motion.div
              key="promo-banner-presence"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={PRESENCE_TRANSITION}
              className="relative z-10 overflow-hidden"
            >
              <PromoBanner
                enabled={promoEnabled}
                isOverridden={overriddenKeys.has('promo_banner')}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10">
          <Header
            adminProxyUrl={adminProxyUrl}
            flagsmithDashboardUrl="http://localhost:8000"
          />
        </div>

        <div className="relative overflow-x-clip">
          <motion.div
            aria-hidden="true"
            className="ambient-hero-wash z-0 origin-top will-change-transform"
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: prefersReduced ? 0.01 : 0.9,
              ease: EASE_TECHNICAL,
            }}
          />
          <main className="relative z-10 mx-auto max-w-[1200px] px-6 pb-24 md:px-8">
          <HeroTelemetry
            identity={liveIdentity}
            traits={liveTraits}
            flags={{
              promo_banner: promoEnabled,
              ai_copilot_widget: aiCopilotEnabled,
              pricing_experiment: pricingVariant,
              onboarding_flow: onboardingVariant,
              theme_accent: activeAccent,
            }}
            overriddenKeys={overriddenKeys}
          />

          <Separator />

          <OnboardingSection
            variant={onboardingVariant}
            isOverridden={overriddenKeys.has('onboarding_flow')}
          />

          <Separator />

          <PricingSection
            variant={pricingVariant}
            isOverridden={overriddenKeys.has('pricing_experiment')}
          />

          <AnimatePresence initial={false}>
            {aiCopilotEnabled && (
              <motion.div
                key="ai-copilot-presence"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={PRESENCE_TRANSITION}
                className="overflow-hidden"
              >
                <Separator />
                <AiCopilotPanel
                  enabled={aiCopilotEnabled}
                  isOverridden={overriddenKeys.has('ai_copilot_widget')}
                  context={{
                    identity: liveIdentity,
                    accent: activeAccent,
                    pricingVariant,
                    onboardingVariant,
                    promoEnabled,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <footer className="mt-8 border-t border-rule-subtle pt-8">
            <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-micro uppercase text-ink-muted tabular-nums">
              <span>Meridian Cloud · Cluster iad-edge-04 · Release v4.18.2-rc3</span>
              <span>Press ⌘⇧F to open ToggleDock · Self-hosted Flagsmith OSS</span>
            </div>
          </footer>
          </main>
        </div>

        <ToggleDock
          flagsmith={flagsmith}
          adminProxyUrl={adminProxyUrl}
          projectId={import.meta.env.VITE_FLAGSMITH_PROJECT_ID}
          devEnvKey={devEnvKey}
          devEnvId={import.meta.env.VITE_FLAGSMITH_DEV_ENV_ID}
          prodEnvKey={prodEnvKey}
          prodEnvId={import.meta.env.VITE_FLAGSMITH_PROD_ENV_ID}
          environmentLabel="Development"
          valuePresets={{
            theme_accent: ['emerald', 'amber', 'indigo'],
          }}
        />
      </div>
    </MotionConfig>
  );
}
