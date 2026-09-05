import { createTranslator } from '@voxeli/localization';
import { resolveLocale } from '@/lib/locale';
import { Translator } from '@/components/Translator';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { AuthPanel } from '@/components/AuthPanel';

export default async function HomePage() {
  const locale = await resolveLocale();
  const t = createTranslator(locale);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tracking-tight bidi-isolate">Voxeli</span>
          <span className="hidden text-sm text-ink-muted sm:inline">{t.t('app.tagline')}</span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher current={locale} />
          <AuthPanel locale={locale} />
        </div>
      </header>
      <Translator locale={locale} />
      <footer className="mt-auto text-xs text-ink-muted">{t.t('privacy.transient')}</footer>
    </main>
  );
}
