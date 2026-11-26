/**
 * winnow-kit: A/B test your own LLM prompts through Flagsmith Experimentation.
 *
 * Put each prompt version behind a multivariate flag (every variation needs a key), then:
 *   const winnow = createWinnow({ flagsmith, flag: "support_prompt", prompts: { control: "...", friendly: "..." } });
 *   const { variant, prompt } = await winnow.pick(userId);   // records the exposure
 *   winnow.track(userId, "thumbs_up");                        // records the conversion
 *   await winnow.flush();                                     // before a serverless function returns
 *
 * It takes the Flagsmith client you already have (@flagsmith/nodejs 9.1+ with enableEvents: true), so it adds no
 * dependency. Unknown variants fall back to `fallback`, so a misconfigured flag never breaks your app.
 */

/** The small part of the Flagsmith Node client this kit uses. */
export interface FlagsmithLike {
  getExperimentFlag(feature: string, identifier: string): Promise<{ value?: unknown; variant?: string }>;
  trackEvent(event: string, opts?: { identifier?: string }): void;
  flushEvents(): Promise<void>;
}

export interface WinnowOptions<P extends Record<string, string>> {
  flagsmith: FlagsmithLike;
  /** Name of the multivariate flag. */
  flag: string;
  /** Prompt text per variant key. Include the control value's key. */
  prompts: P;
  /** Variant used if the flag is unreachable or returns an unknown key. Defaults to the first prompt. */
  fallback?: keyof P & string;
}

export function createWinnow<P extends Record<string, string>>({ flagsmith, flag, prompts, fallback }: WinnowOptions<P>) {
  const keys = Object.keys(prompts) as (keyof P & string)[];
  if (keys.length === 0) throw new Error("winnow-kit: provide at least one prompt.");
  const safe = fallback ?? keys[0];

  return {
    /** Pick the prompt for this user. Call only when the prompt is actually used: it records the exposure. */
    async pick(identifier: string): Promise<{ variant: keyof P & string; prompt: string }> {
      let key: string | undefined;
      try {
        const f = await flagsmith.getExperimentFlag(flag, identifier);
        key = f.variant ?? (typeof f.value === "string" ? f.value : undefined);
      } catch {
        key = undefined;
      }
      const variant = (keys as string[]).includes(key ?? "") ? (key as keyof P & string) : safe;
      return { variant, prompt: prompts[variant] };
    },
    /** Record an outcome (for example "thumbs_up") for the SAME identifier you passed to pick(). */
    track(identifier: string, event: string): void {
      flagsmith.trackEvent(event, { identifier });
    },
    /** Send buffered events. Await this before a serverless function returns. */
    flush(): Promise<void> {
      return flagsmith.flushEvents();
    },
  };
}
