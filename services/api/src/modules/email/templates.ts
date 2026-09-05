import type { UiLocale } from '@voxeli/domain';
import type { EmailMessage } from './provider.js';

/**
 * Transactional email copy in the seven UI locales. Plain functions rather
 * than a templating engine: two emails, no layout system needed yet. Links are
 * technical tokens and sit LTR on their own line in RTL locales.
 */
interface Copy {
  subject: string;
  body: (link: string) => string;
}

const VERIFY: Record<UiLocale, Copy> = {
  en: {
    subject: 'Confirm your Voxeli email',
    body: (l) =>
      `Welcome to Voxeli.\n\nConfirm your email address by opening this link (valid for 24 hours):\n${l}\n\nIf you did not create an account, you can ignore this message.`,
  },
  he: {
    subject: 'אישור כתובת האימייל שלך ב־Voxeli',
    body: (l) =>
      `ברוכים הבאים ל־Voxeli.\n\nלאישור כתובת האימייל פתחו את הקישור הבא (תקף ל־24 שעות):\n${l}\n\nאם לא יצרתם חשבון, אפשר להתעלם מהודעה זו.`,
  },
  ar: {
    subject: 'تأكيد بريدك الإلكتروني في Voxeli',
    body: (l) =>
      `مرحبًا بك في Voxeli.\n\nلتأكيد بريدك الإلكتروني افتح هذا الرابط (صالح لمدة 24 ساعة):\n${l}\n\nإذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.`,
  },
  de: {
    subject: 'Bestätige deine Voxeli-E-Mail-Adresse',
    body: (l) =>
      `Willkommen bei Voxeli.\n\nBestätige deine E-Mail-Adresse über diesen Link (24 Stunden gültig):\n${l}\n\nFalls du kein Konto erstellt hast, ignoriere diese Nachricht.`,
  },
  ru: {
    subject: 'Подтвердите адрес электронной почты в Voxeli',
    body: (l) =>
      `Добро пожаловать в Voxeli.\n\nПодтвердите адрес, открыв ссылку (действует 24 часа):\n${l}\n\nЕсли вы не создавали аккаунт, просто проигнорируйте это письмо.`,
  },
  fr: {
    subject: 'Confirmez votre e-mail Voxeli',
    body: (l) =>
      `Bienvenue sur Voxeli.\n\nConfirmez votre adresse e-mail en ouvrant ce lien (valable 24 heures) :\n${l}\n\nSi vous n’avez pas créé de compte, ignorez ce message.`,
  },
  es: {
    subject: 'Confirma tu correo de Voxeli',
    body: (l) =>
      `Bienvenido a Voxeli.\n\nConfirma tu correo abriendo este enlace (válido durante 24 horas):\n${l}\n\nSi no creaste una cuenta, ignora este mensaje.`,
  },
};

const RESET: Record<UiLocale, Copy> = {
  en: {
    subject: 'Reset your Voxeli password',
    body: (l) =>
      `Someone requested a password reset for this Voxeli account.\n\nOpen this link to choose a new password (valid for 1 hour):\n${l}\n\nIf this was not you, ignore this message; your password stays unchanged.`,
  },
  he: {
    subject: 'איפוס הסיסמה שלך ב־Voxeli',
    body: (l) =>
      `התקבלה בקשה לאיפוס הסיסמה של חשבון Voxeli זה.\n\nלבחירת סיסמה חדשה פתחו את הקישור (תקף לשעה):\n${l}\n\nאם לא אתם ביקשתם זאת, התעלמו מההודעה; הסיסמה לא תשתנה.`,
  },
  ar: {
    subject: 'إعادة تعيين كلمة مرور Voxeli',
    body: (l) =>
      `تم طلب إعادة تعيين كلمة المرور لهذا الحساب في Voxeli.\n\nافتح هذا الرابط لاختيار كلمة مرور جديدة (صالح لمدة ساعة):\n${l}\n\nإذا لم تكن أنت، تجاهل هذه الرسالة؛ كلمة مرورك لن تتغير.`,
  },
  de: {
    subject: 'Voxeli-Passwort zurücksetzen',
    body: (l) =>
      `Für dieses Voxeli-Konto wurde ein Passwort-Reset angefordert.\n\nÖffne diesen Link, um ein neues Passwort zu wählen (1 Stunde gültig):\n${l}\n\nFalls das nicht du warst, ignoriere diese Nachricht; dein Passwort bleibt unverändert.`,
  },
  ru: {
    subject: 'Сброс пароля Voxeli',
    body: (l) =>
      `Для этого аккаунта Voxeli запрошен сброс пароля.\n\nОткройте ссылку, чтобы задать новый пароль (действует 1 час):\n${l}\n\nЕсли это были не вы, проигнорируйте письмо; пароль останется прежним.`,
  },
  fr: {
    subject: 'Réinitialisez votre mot de passe Voxeli',
    body: (l) =>
      `Une réinitialisation du mot de passe a été demandée pour ce compte Voxeli.\n\nOuvrez ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n${l}\n\nSi ce n’était pas vous, ignorez ce message ; votre mot de passe reste inchangé.`,
  },
  es: {
    subject: 'Restablece tu contraseña de Voxeli',
    body: (l) =>
      `Se solicitó restablecer la contraseña de esta cuenta de Voxeli.\n\nAbre este enlace para elegir una nueva contraseña (válido durante 1 hora):\n${l}\n\nSi no fuiste tú, ignora este mensaje; tu contraseña no cambia.`,
  },
};

export function verificationEmail(to: string, locale: UiLocale, link: string): EmailMessage {
  const c = VERIFY[locale];
  return { to, subject: c.subject, text: c.body(link) };
}

export function passwordResetEmail(to: string, locale: UiLocale, link: string): EmailMessage {
  const c = RESET[locale];
  return { to, subject: c.subject, text: c.body(link) };
}
