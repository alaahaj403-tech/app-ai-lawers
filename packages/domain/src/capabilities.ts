/**
 * Capability registry. The UI and routing consult this registry — never a
 * hardcoded assumption — before advertising offline or realtime features.
 */
export type CapabilityState =
  | 'SUPPORTED'
  | 'DEGRADED'
  | 'UNSUPPORTED'
  | 'UNSUPPORTED_PLATFORM_CAPABILITY'
  | 'BLOCKED_EXTERNAL_DEPENDENCY'
  | 'UNKNOWN';

export interface LanguageCapability {
  readonly language: string;
  readonly textOnline: CapabilityState;
  readonly textOffline: CapabilityState;
  readonly sttOnline: CapabilityState;
  readonly sttOffline: CapabilityState;
  readonly ttsOnline: CapabilityState;
  readonly ttsOffline: CapabilityState;
  readonly ocr: CapabilityState;
  /** Tier-1 direct speech-to-speech translation available as a target. */
  readonly realtimeTranslation: CapabilityState;
}

export type Platform = 'android' | 'ios' | 'web';

export type PlatformFeature =
  | 'caller_id'
  | 'cellular_call_live_translation'
  | 'cellular_call_recording'
  | 'voip_call_recording'
  | 'in_app_voip'
  | 'background_live_translation';

/**
 * Platform capability matrix for OS-gated features. Values here are policy
 * defaults; runtime probes on device may downgrade (never upgrade) them.
 * Sources of truth are the current official Android/iOS docs — verify before
 * enabling any feature flagged UNKNOWN.
 */
export const PLATFORM_FEATURES: Readonly<
  Record<PlatformFeature, Readonly<Record<Platform, CapabilityState>>>
> = {
  caller_id: { android: 'UNKNOWN', ios: 'UNKNOWN', web: 'UNSUPPORTED_PLATFORM_CAPABILITY' },
  // Third-party apps do not receive both audio legs of a cellular call on either OS.
  cellular_call_live_translation: {
    android: 'UNSUPPORTED_PLATFORM_CAPABILITY',
    ios: 'UNSUPPORTED_PLATFORM_CAPABILITY',
    web: 'UNSUPPORTED_PLATFORM_CAPABILITY',
  },
  cellular_call_recording: {
    android: 'UNSUPPORTED_PLATFORM_CAPABILITY',
    ios: 'UNSUPPORTED_PLATFORM_CAPABILITY',
    web: 'UNSUPPORTED_PLATFORM_CAPABILITY',
  },
  voip_call_recording: { android: 'SUPPORTED', ios: 'SUPPORTED', web: 'SUPPORTED' },
  in_app_voip: { android: 'SUPPORTED', ios: 'SUPPORTED', web: 'SUPPORTED' },
  background_live_translation: { android: 'UNKNOWN', ios: 'UNKNOWN', web: 'UNSUPPORTED' },
};

export function platformFeatureState(
  feature: PlatformFeature,
  platform: Platform,
): CapabilityState {
  return PLATFORM_FEATURES[feature][platform];
}
