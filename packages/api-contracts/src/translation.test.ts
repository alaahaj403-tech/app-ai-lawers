import { describe, expect, it } from 'vitest';
import { translateRequestSchema, MAX_TRANSLATION_CHARS } from './translation.js';
import { registerRequestSchema } from './auth.js';
import { createRealtimeSessionSchema } from './realtime.js';

describe('translateRequestSchema', () => {
  it('applies defaults', () => {
    const r = translateRequestSchema.parse({ text: 'שלום', targetLanguage: 'en' });
    expect(r.sourceLanguage).toBe('auto');
    expect(r.mode).toBe('natural');
    expect(r.saveToHistory).toBe(true);
  });
  it('rejects unsupported target languages and oversized text', () => {
    expect(() => translateRequestSchema.parse({ text: 'hi', targetLanguage: 'xx' })).toThrow();
    expect(() =>
      translateRequestSchema.parse({
        text: 'a'.repeat(MAX_TRANSLATION_CHARS + 1),
        targetLanguage: 'he',
      }),
    ).toThrow();
  });
  it('rejects whitespace-only input', () => {
    expect(() => translateRequestSchema.parse({ text: '   ', targetLanguage: 'he' })).toThrow();
  });
});

describe('registerRequestSchema', () => {
  it('normalizes email casing and enforces password length', () => {
    const r = registerRequestSchema.parse({ email: 'A@B.CO', password: 'correct-horse-battery' });
    expect(r.email).toBe('a@b.co');
    expect(() => registerRequestSchema.parse({ email: 'a@b.co', password: 'short' })).toThrow();
  });
});

describe('createRealtimeSessionSchema', () => {
  it('accepts an interpreter call config', () => {
    const r = createRealtimeSessionSchema.parse({
      kind: 'interpreter_call',
      myLanguage: 'he',
      targetLanguage: 'he',
      remoteLanguage: 'en',
    });
    expect(r.transport).toBe('webrtc');
    expect(r.recording).toBe(false);
  });
});
