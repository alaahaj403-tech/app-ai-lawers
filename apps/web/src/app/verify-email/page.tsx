import { createTranslator } from '@voxeli/localization';
import { resolveLocale } from '@/lib/locale';
import { VerifyEmail } from '@/components/VerifyEmail';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const locale = await resolveLocale();
  const t = createTranslator(locale);
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">{t.t('account.verifyTitle')}</h1>
      <VerifyEmail locale={locale} token={token ?? ''} />
    </main>
  );
}
