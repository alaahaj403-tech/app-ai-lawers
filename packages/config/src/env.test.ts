import { describe, expect, it } from 'vitest';
import { validateServerEnv } from './env.js';
import { DEFAULT_MODEL_CONFIG, resolveModelConfig } from './models.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
};

describe('validateServerEnv', () => {
  it('accepts a minimal development env', () => {
    const r = validateServerEnv({ ...base });
    expect(r.ok).toBe(true);
  });
  it('reports every missing variable by name without values', () => {
    const r = validateServerEnv({ JWT_SECRET: 'short' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join('\n')).toMatch(/DATABASE_URL/);
      expect(r.problems.join('\n')).toMatch(/JWT_SECRET/);
      expect(r.problems.join('\n')).not.toMatch(/short/);
    }
  });
  it('refuses production without an AI credential', () => {
    const r = validateServerEnv({ ...base, NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
  });
  it('refuses mock provider in production', () => {
    const r = validateServerEnv({
      ...base,
      NODE_ENV: 'production',
      AI_PROVIDER: 'mock',
      OPENAI_API_KEY: 'k',
    });
    expect(r.ok).toBe(false);
  });
});

describe('resolveModelConfig', () => {
  it('overrides a slot from env', () => {
    const cfg = resolveModelConfig({ VOXELI_MODEL_TRANSLATION_DEFAULT: 'openai:some-new-model' });
    expect(cfg['translation.default'].model).toBe('some-new-model');
    expect(cfg['translation.fast']).toEqual(DEFAULT_MODEL_CONFIG['translation.fast']);
  });
  it('keeps provider when only a model is given', () => {
    const cfg = resolveModelConfig({ VOXELI_MODEL_SPEECH_SYNTHESIS: 'tts-next' });
    expect(cfg['speech.synthesis']).toMatchObject({ provider: 'openai', model: 'tts-next' });
  });
});
