/** Subscription plans. Pricing is NOT hardcoded here — only entitlement shape. */
export const PLANS = ['free', 'pro', 'business'] as const;
export type Plan = (typeof PLANS)[number];

export type QuotaDimension =
  | 'translations'
  | 'characters'
  | 'ai_tokens'
  | 'audio_minutes'
  | 'document_pages'
  | 'realtime_minutes'
  | 'call_transcription_minutes';

export interface PlanEntitlements {
  readonly plan: Plan;
  /** Monthly quotas per dimension. `null` = unlimited within abuse limits. */
  readonly quotas: Readonly<Record<QuotaDimension, number | null>>;
  readonly features: Readonly<{
    highQualityTranslation: boolean;
    realtimeTier1: boolean;
    documentTranslation: boolean;
    callIntelligence: boolean;
    cloudHistory: boolean;
  }>;
}

/** Default entitlements. Server config may override; clients never decide. */
export const DEFAULT_ENTITLEMENTS: Readonly<Record<Plan, PlanEntitlements>> = {
  free: {
    plan: 'free',
    quotas: {
      translations: 300,
      characters: 60_000,
      ai_tokens: 400_000,
      audio_minutes: 20,
      document_pages: 3,
      realtime_minutes: 10,
      call_transcription_minutes: 0,
    },
    features: {
      highQualityTranslation: false,
      realtimeTier1: false,
      documentTranslation: false,
      callIntelligence: false,
      cloudHistory: true,
    },
  },
  pro: {
    plan: 'pro',
    quotas: {
      translations: null,
      characters: 2_000_000,
      ai_tokens: 10_000_000,
      audio_minutes: 600,
      document_pages: 200,
      realtime_minutes: 300,
      call_transcription_minutes: 120,
    },
    features: {
      highQualityTranslation: true,
      realtimeTier1: true,
      documentTranslation: true,
      callIntelligence: true,
      cloudHistory: true,
    },
  },
  business: {
    plan: 'business',
    quotas: {
      translations: null,
      characters: 10_000_000,
      ai_tokens: 50_000_000,
      audio_minutes: 3_000,
      document_pages: 2_000,
      realtime_minutes: 1_500,
      call_transcription_minutes: 1_000,
    },
    features: {
      highQualityTranslation: true,
      realtimeTier1: true,
      documentTranslation: true,
      callIntelligence: true,
      cloudHistory: true,
    },
  },
};
