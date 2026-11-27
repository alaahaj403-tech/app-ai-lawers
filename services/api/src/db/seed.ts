import { FEATURE_FLAGS } from '@voxeli/api-contracts';
import { createDb } from './client.js';
import { featureFlags } from './schema.js';

/** Idempotent seed: feature flags exist with safe defaults (risky features OFF). */
export async function seed(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl, { max: 1 });
  try {
    const defaults: Record<(typeof FEATURE_FLAGS)[number], boolean> = {
      caller_id_android: false,
      caller_id_ios: false,
      call_recording: false,
      voip: false,
      live_translation: true,
      web_context: false,
      accessibility_translation: false,
      experimental_ai_tutor: false,
      document_translation: false,
    };
    for (const key of FEATURE_FLAGS) {
      await db
        .insert(featureFlags)
        .values({ key, enabled: defaults[key], description: `Remote kill-switch for ${key}` })
        .onConflictDoNothing();
    }
  } finally {
    await close();
  }
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  seed(url)
    .then(() => {
      console.log('seed complete');
      process.exit(0);
    })
    .catch((e: unknown) => {
      console.error('seed failed', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
