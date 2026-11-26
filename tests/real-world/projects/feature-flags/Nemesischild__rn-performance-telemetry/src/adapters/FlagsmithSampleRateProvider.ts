/**
 * Flagsmith Sample Rate Provider
 *
 * Sample rate provider that reads from Flagsmith feature flags.
 * Works with react-native-flagsmith.
 *
 * This is a convenience wrapper around FeatureFlagSampleRateProvider
 * that pre-configures it for Flagsmith's API.
 */

import type { SampleRateProvider } from '../core/types'
import { FeatureFlagSampleRateProvider } from './FeatureFlagSampleRateProvider'

/**
 * Flagsmith client interface
 * This matches the react-native-flagsmith API
 */
export interface FlagsmithClient {
    getValue(key: string): string | number | boolean | null | undefined
}

export interface FlagsmithSampleRateProviderOptions {
    /**
     * Default sample rate if flag is not available
     * Default: 0 (disabled)
     */
    defaultRate?: number
}

/**
 * Flagsmith-based sample rate provider
 *
 * This is a convenience wrapper around {@link FeatureFlagSampleRateProvider}
 * pre-configured for Flagsmith. You can also use FeatureFlagSampleRateProvider
 * directly with any feature flag system.
 *
 * @example
 * // Using this convenience wrapper:
 * import flagsmith from 'react-native-flagsmith'
 * new FlagsmithSampleRateProvider(flagsmith, 'perf_sample_rate')
 *
 * @example
 * // Equivalent using the base adapter directly:
 * import { FeatureFlagSampleRateProvider } from 'rn-performance-telemetry'
 * new FeatureFlagSampleRateProvider(flagsmith, 'perf_sample_rate', {
 *     methodName: 'getValue'
 * })
 *
 * @example
 * // With default rate
 * sampleRateProvider: new FlagsmithSampleRateProvider(
 *     flagsmith,
 *     'perf_sample_rate',
 *     { defaultRate: 0.1 } // 10% if flag unavailable
 * )
 */
export class FlagsmithSampleRateProvider implements SampleRateProvider {
    private provider: FeatureFlagSampleRateProvider

    constructor(
        client: FlagsmithClient,
        flagKey: string,
        options: FlagsmithSampleRateProviderOptions = {}
    ) {
        // Wrap the generic FeatureFlagSampleRateProvider with Flagsmith-specific config
        this.provider = new FeatureFlagSampleRateProvider(client, flagKey, {
            methodName: 'getValue',
            defaultRate: options.defaultRate
        })
    }

    getSampleRate(): number | Promise<number> {
        return this.provider.getSampleRate()
    }
}