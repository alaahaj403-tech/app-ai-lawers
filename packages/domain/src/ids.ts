declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type TranslationId = Brand<string, 'TranslationId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type RealtimeSessionId = Brand<string, 'RealtimeSessionId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

export const asUserId = (v: string): UserId => v as UserId;
export const asTranslationId = (v: string): TranslationId => v as TranslationId;
export const asCorrelationId = (v: string): CorrelationId => v as CorrelationId;
