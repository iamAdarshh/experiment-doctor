export type CarbonLevel = 'low' | 'moderate' | 'high';
export type Variant = 'full' | 'eco' | 'off';
export type DecisionSource = 'flagsmith' | 'override' | 'local';
export type CarbonSource = 'electricity-maps' | 'simulated' | 'stale-cache' | 'default';

export interface CarbonReading {
  level: CarbonLevel;
  zone: string;
  datetime: string | null;
  simulated: boolean;
  source: CarbonSource;
}

export interface FlagSnapshot {
  greengate_enabled: boolean;
  heavy_feature_mode: string | null;
  greengate_suggested_variant: Variant;
}

export interface Evaluation {
  variant: Variant;
  carbonLevel: CarbonLevel;
  zone: string;
  simulated: boolean;
  /** Who chose the variant. */
  source: DecisionSource;
  /** Where the carbon level came from. */
  carbonSource: CarbonSource;
  flags: FlagSnapshot;
}

export interface FlagsmithFlags {
  isFeatureEnabled(name: string): boolean;
  getFeatureValue(name: string): string | number | boolean | null;
}

export interface FlagsmithLike {
  getIdentityFlags(
    identifier: string,
    traits?: Record<string, string | number | boolean>,
  ): Promise<FlagsmithFlags>;
  getExperimentFlag?(
    featureName: string,
    identifier: string,
  ): Promise<{ enabled: boolean; value: string | number | boolean | null }>;
}

export function isCarbonLevel(value: unknown): value is CarbonLevel {
  return value === 'low' || value === 'moderate' || value === 'high';
}

export function isVariant(value: unknown): value is Variant {
  return value === 'full' || value === 'eco' || value === 'off';
}
