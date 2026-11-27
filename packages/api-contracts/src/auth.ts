import { z } from 'zod';
import { UI_LOCALES } from '@voxeli/domain';

export const emailSchema = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());
export const passwordSchema = z.string().min(10).max(256);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  locale: z.enum(UI_LOCALES).default('en'),
  deviceName: z.string().trim().max(80).optional(),
});
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: z.string().trim().max(80).optional(),
});
export const refreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  locale: z.enum(UI_LOCALES),
  plan: z.enum(['free', 'pro', 'business']),
  role: z.enum(['user', 'admin']),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export const authResponseSchema = z.object({ user: userProfileSchema, tokens: authTokensSchema });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;

// ---- account lifecycle ------------------------------------------------------
const tokenSchema = z.string().min(20).max(200);

export const confirmEmailSchema = z.object({ token: tokenSchema });
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetConfirmSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export const deleteAccountSchema = z.object({ password: passwordSchema });
