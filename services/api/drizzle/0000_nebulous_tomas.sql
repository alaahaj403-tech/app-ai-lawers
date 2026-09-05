CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."quota_dimension" AS ENUM('translations', 'characters', 'ai_tokens', 'audio_minutes', 'document_pages', 'realtime_minutes', 'call_transcription_minutes');--> statement-breakpoint
CREATE TYPE "public"."realtime_kind" AS ENUM('face_to_face', 'interpreter_call', 'live_recording', 'live_meeting', 'live_subtitles');--> statement-breakpoint
CREATE TYPE "public"."realtime_tier" AS ENUM('tier1_s2s', 'tier2_streaming', 'tier3_chunked');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."translation_mode" AS ENUM('natural', 'literal', 'professional', 'business', 'travel', 'casual', 'learning', 'legal', 'medical', 'slang');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"correlation_id" text NOT NULL,
	"feature" text NOT NULL,
	"slot" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"unit" text NOT NULL,
	"input_units" integer NOT NULL,
	"output_units" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"fallback_from" text,
	"error_code" text,
	"estimated_cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"correlation_id" text,
	"ip" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" realtime_kind NOT NULL,
	"tier" realtime_tier NOT NULL,
	"my_language" text NOT NULL,
	"target_language" text NOT NULL,
	"remote_language" text,
	"recording" boolean DEFAULT false NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"degraded_reason" text,
	"metrics" jsonb,
	"duration_seconds" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_name" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"source" text DEFAULT 'internal' NOT NULL,
	"external_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" uuid,
	"source_language" text NOT NULL,
	"detected_language" text NOT NULL,
	"target_language" text NOT NULL,
	"mode" "translation_mode" NOT NULL,
	"source_text" text NOT NULL,
	"translated_text" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_quotas" (
	"user_id" uuid NOT NULL,
	"dimension" "quota_dimension" NOT NULL,
	"period" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"history_mode" text DEFAULT 'cloud' NOT NULL,
	"default_source_language" text DEFAULT 'auto' NOT NULL,
	"default_target_language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_sessions" ADD CONSTRAINT "realtime_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "realtime_sessions_user_idx" ON "realtime_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_uq" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "translations_user_created_idx" ON "translations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_user_idem_uq" ON "translations" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_quotas_pk" ON "usage_quotas" USING btree ("user_id","dimension","period");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");