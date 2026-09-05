// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'تحدّث بحرية. افهم الجميع.';

  @override
  String get navHome => 'الرئيسية';

  @override
  String get navTalk => 'محادثة';

  @override
  String get navCamera => 'الكاميرا';

  @override
  String get navLearn => 'تعلّم';

  @override
  String get navCalls => 'المكالمات';

  @override
  String get sourcePlaceholder => 'اكتب أو الصق النص…';

  @override
  String get translateAction => 'ترجمة';

  @override
  String detected(String language) {
    return 'اللغة المكتشفة: $language';
  }

  @override
  String get swapLanguages => 'تبديل اللغات';

  @override
  String get autoDetect => 'اكتشاف اللغة';

  @override
  String get copy => 'نسخ';

  @override
  String get copied => 'تم النسخ';

  @override
  String get save => 'حفظ';

  @override
  String get alternatives => 'بدائل';

  @override
  String integrityWarning(int count) {
    return 'تحقّق من الأرقام والأسماء: $count لم يتم التحقق منها.';
  }

  @override
  String get degraded => 'يتم استخدام محرك ترجمة احتياطي.';

  @override
  String get translating => 'جارٍ الترجمة…';

  @override
  String get errorNetwork => 'لا يوجد اتصال. تحقّق من الشبكة وحاول مرة أخرى.';

  @override
  String get errorQuota => 'لقد وصلت إلى حدّ خطتك.';

  @override
  String get errorProvider => 'الترجمة غير متاحة مؤقتًا. حاول مرة أخرى.';

  @override
  String get errorAuth => 'يرجى تسجيل الدخول للترجمة.';

  @override
  String get errorGeneric => 'حدث خطأ ما.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'تبقّت $count ترجمة هذا الشهر',
      many: 'تبقّت $count ترجمة هذا الشهر',
      few: 'تبقّت $count ترجمات هذا الشهر',
      two: 'تبقّت ترجمتان هذا الشهر',
      one: 'تبقّت ترجمة واحدة هذا الشهر',
      zero: 'لم تتبقَّ ترجمات هذا الشهر',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'السجل';

  @override
  String get historyEmpty => 'لا توجد ترجمات بعد.';

  @override
  String get login => 'تسجيل الدخول';

  @override
  String get register => 'إنشاء حساب';

  @override
  String get logout => 'تسجيل الخروج';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get password => 'كلمة المرور';

  @override
  String get noHistoryMode => 'وضع بدون سجل';

  @override
  String get transientNotice => 'تتم معالجة الصوت مباشرةً ولا يتم تخزينه.';

  @override
  String get delete => 'حذف';

  @override
  String get settingsTitle => 'الخادم';

  @override
  String get serverUrl => 'عنوان الخادم';

  @override
  String get serverUrlHelp =>
      'إلى أين يرسل التطبيق الترجمات. غيّره فقط للاختبار مقابل خادمك الخاص.';

  @override
  String get serverUrlInvalid => 'أدخل عنوان http(s) كاملًا.';

  @override
  String get resetDefault => 'إعادة الضبط';

  @override
  String get cancel => 'إلغاء';
}
