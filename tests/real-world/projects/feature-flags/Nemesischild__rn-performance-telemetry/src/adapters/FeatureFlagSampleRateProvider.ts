/**
 * Feature Flag Sample Rate Provider
 *
 * Generic, system-agnostic sample rate provider that works with any feature flag client.
 * Supports Flagsmith, LaunchDarkly, Split, Statsig, PostHog, Unleash, and custom implementations.
 */

import type { SampleRateProvider } from '../core/types'

/**
 * Generic feature flag client interface
 *
 * Most feature flag SDKs implement a method to get a flag value by key.
 * This interface abstracts that pattern. All methods are optional since
 * different SDKs use different method names.
 */
export interface FeatureFlagClient {
    /**
     * Get a feature flag value by key
     * @param key - The flag key/name
     * @param defaultValue - Optional default value
     * @returns The flag value (string, number, boolean, or object)
     */
    getValue?(key: string, defaultValue?: unknown): unknown
    getVariation?(key: string, defaultValue?: unknown): unknown
    variation?(key: string, defaultValue?: unknown): unknown
    get?(key: string, defaultValue?: unknown): unknown
    getNumber?(key: string, defaultValue?: number): number
    getFeatureValue?(key: string, defaultValue?: unknown): unknown
    getFeatureFlag?(key: string, defaultValue?: unknown): unknown
    getFeatureFlagPayload?(key: string, defaultValue?: unknown): unknown
    getTreatment?(key: string, defaultValue?: unknown): unknown
    getVariant?(key: string, defaultValue?: unknown): unknown
    getConfig?(key: string, defaultValue?: unknown): unknown
}

/**
 * Configuration for extracting value from different client response formats
 */
export interface ValueExtractor {
    /**
     * Extract the numeric sample rate from the client response
     * @param response - Raw response from the feature flag client
     * @returns The sample rate as a number, or undefined if invalid
     */
    (response: unknown): number | undefined
}

export interface FeatureFlagSampleRateProviderOptions {
    /**
     * The method name to call on the client
     * Common values: 'getValue', 'getVariation', 'get', 'getNumber', 'getFeatureValue'
     * Default: auto-detect from client
     */
    methodName?: string

    /**
     * Default sample rate if flag is unavailable or invalid
     * Default: 0 (disabled)
     */
    defaultRate?: number

    /**
     * Custom value extractor for non-standard response formats
     * Use when the flag value is nested in an object or needs transformation
     *
     * @example
     * // For a response like { value: 0.5, enabled: true }
     * valueExtractor: (response) => response?.value
     */
    valueExtractor?: ValueExtractor
}

/**
 * Generic feature flag sample rate provider
 *
 * Works with any feature flag system by accepting a client and flag key.
 * Auto-detects common method names or allows explicit configuration.
 *
 * @example
 * // Flagsmith
 * import flagsmith from 'react-native-flagsmith'
 * new FeatureFlagSampleRateProvider(flagsmith, 'perf_sample_rate')
 *
 * @example
 * // LaunchDarkly
 * import { useLDClient } from '@launchdarkly/react-native-client-sdk'
 * const ldClient = useLDClient()
 * new FeatureFlagSampleRateProvider(ldClient, 'perf-sample-rate', {
 *     methodName: 'variation'
 * })
 *
 * @example
 * // Split
 * import { SplitFactory } from '@splitsoftware/splitio-react-native'
 * const client = SplitFactory.client()
 * new FeatureFlagSampleRateProvider(client, 'perf_sample_rate', {
 *     methodName: 'getTreatment',
 *     valueExtractor: (treatment) => {
 *         // Split returns string treatments, parse to number
 *         return treatment === 'on' ? 1.0 : parseFloat(treatment) || 0
 *     }
 * })
 *
 * @example
 * // Statsig
 * import Statsig from 'statsig-react-native'
 * new FeatureFlagSampleRateProvider(Statsig, 'perf_sample_rate', {
 *     methodName: 'getConfig',
 *     valueExtractor: (config) => config?.get('sample_rate', 0)
 * })
 *
 * @example
 * // PostHog
 * import PostHog from 'posthog-react-native'
 * new FeatureFlagSampleRateProvider(PostHog, 'perf-sample-rate', {
 *     methodName: 'getFeatureFlag',
 *     valueExtractor: (value) => typeof value === 'string' ? parseFloat(value) : value
 * })
 *
 * @example
 * // Unleash
 * import { UnleashClient } from 'unleash-proxy-client'
 * new FeatureFlagSampleRateProvider(unleashClient, 'perf.sample.rate', {
 *     methodName: 'getVariant',
 *     valueExtractor: (variant) => parseFloat(variant?.payload?.value) || 0
 * })
 *
 * @example
 * // GrowthBook
 * import { GrowthBook } from '@growthbook/growthbook-react'
 * new FeatureFlagSampleRateProvider(growthbook, 'perf_sample_rate', {
 *     methodName: 'getFeatureValue'
 * })
 *
 * @example
 * // Custom/Generic with async
 * new FeatureFlagSampleRateProvider(myClient, 'sample_rate', {
 *     methodName: 'fetchFlag',
 *     defaultRate: 0.1
 * })
 */
export class FeatureFlagSampleRateProvider implements SampleRateProvider {
    private client: FeatureFlagClient
    private flagKey: string
    private methodName: string
    private defaultRate: number
    private valueExtractor: ValueExtractor

    constructor(
        client: FeatureFlagClient,
        flagKey: string,
        options: FeatureFlagSampleRateProviderOptions = {}
    ) {
        this.client = client
        this.flagKey = flagKey
        this.defaultRate = options.defaultRate ?? 0
        this.methodName = options.methodName ?? this.detectMethodName(client)
        this.valueExtractor = options.valueExtractor ?? this.defaultValueExtractor
    }

    /**
     * Auto-detect the method name from common feature flag client patterns
     */
    private detectMethodName(client: FeatureFlagClient): string {
        const commonMethods = [
            'getValue',
            'getVariation',
            'variation',
            'get',
            'getNumber',
            'getFeatureValue',
            'getFeatureFlag',
            'getFeatureFlagPayload',
            'getTreatment',
            'getVariant',
            'getConfig'
        ]

        // Cast to record to allow dynamic property access
        const clientRecord = client as Record<string, unknown>

        for (const method of commonMethods) {
            if (typeof clientRecord[method] === 'function') {
                return method
            }
        }

        throw new Error(
            `FeatureFlagSampleRateProvider: Could not detect method on client. ` +
            `Please specify 'methodName' in options. Looked for: ${commonMethods.join(', ')}`
        )
    }

    /**
     * Default value extractor - handles common response formats
     */
    private defaultValueExtractor = (response: unknown): number | undefined => {
        if (response == null) {
            return undefined
        }

        // Direct number
        if (typeof response === 'number') {
            return response
        }

        // String that can be parsed as number
        if (typeof response === 'string') {
            const parsed = parseFloat(response)
            if (!isNaN(parsed)) {
                return parsed
            }
            return undefined
        }

        // Boolean (true = 1.0, false = 0)
        if (typeof response === 'boolean') {
            return response ? 1.0 : 0
        }

        // Object with common value properties
        if (typeof response === 'object') {
            const obj = response as Record<string, unknown>

            // Try common property names
            const valueProps = ['value', 'payload', 'data', 'rate', 'sampleRate']
            for (const prop of valueProps) {
                if (prop in obj) {
                    const nested = obj[prop]
                    if (typeof nested === 'number') {
                        return nested
                    }
                    if (typeof nested === 'string') {
                        const parsed = parseFloat(nested)
                        if (!isNaN(parsed)) {
                            return parsed
                        }
                    }
                }
            }
        }

        return undefined
    }

    getSampleRate(): number | Promise<number> {
        try {
            // Cast to record to allow dynamic property access
            const clientRecord = this.client as Record<string, unknown>
            const method = clientRecord[this.methodName]

            if (typeof method !== 'function') {
                return this.defaultRate
            }

            const result = (method as (...args: unknown[]) => unknown).call(this.client, this.flagKey, this.defaultRate)

            // Handle promise
            if (result instanceof Promise) {
                return result
                    .then((response) => this.extractAndValidate(response))
                    .catch(() => this.defaultRate)
            }

            return this.extractAndValidate(result)
        } catch {
            return this.defaultRate
        }
    }

    /**
     * Extract value and validate it's a valid sample rate
     */
    private extractAndValidate(response: unknown): number {
        const rate = this.valueExtractor(response)

        if (rate !== undefined && !isNaN(rate) && rate >= 0 && rate <= 1) {
            return rate
        }

        return this.defaultRate
    }
}