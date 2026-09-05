// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hebrew (`he`).
class AppLocalizationsHe extends AppLocalizations {
  AppLocalizationsHe([String locale = 'he']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'דברו חופשי. הבינו את כולם.';

  @override
  String get navHome => 'בית';

  @override
  String get navTalk => 'שיחה';

  @override
  String get navCamera => 'מצלמה';

  @override
  String get navLearn => 'לימוד';

  @override
  String get navCalls => 'שיחות טלפון';

  @override
  String get sourcePlaceholder => 'הקלידו או הדביקו טקסט…';

  @override
  String get translateAction => 'תרגום';

  @override
  String detected(String language) {
    return 'זוהתה שפה: $language';
  }

  @override
  String get swapLanguages => 'החלפת שפות';

  @override
  String get autoDetect => 'זיהוי שפה';

  @override
  String get copy => 'העתקה';

  @override
  String get copied => 'הועתק';

  @override
  String get save => 'שמירה';

  @override
  String get alternatives => 'חלופות';

  @override
  String integrityWarning(int count) {
    return 'בדקו מספרים ושמות: $count לא אומתו.';
  }

  @override
  String get degraded => 'נעשה שימוש במנוע תרגום גיבוי.';

  @override
  String get translating => 'מתרגם…';

  @override
  String get errorNetwork => 'אין חיבור. בדקו את הרשת ונסו שוב.';

  @override
  String get errorQuota => 'הגעתם למכסת התוכנית שלכם.';

  @override
  String get errorProvider => 'התרגום אינו זמין כרגע. נסו שוב.';

  @override
  String get errorAuth => 'כדי לתרגם יש להתחבר.';

  @override
  String get errorGeneric => 'משהו השתבש.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'נותרו $count תרגומים החודש',
      two: 'נותרו $count תרגומים החודש',
      one: 'נותר תרגום אחד החודש',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'היסטוריה';

  @override
  String get historyEmpty => 'עדיין אין תרגומים.';

  @override
  String get login => 'התחברות';

  @override
  String get register => 'יצירת חשבון';

  @override
  String get logout => 'התנתקות';

  @override
  String get email => 'אימייל';

  @override
  String get password => 'סיסמה';

  @override
  String get noHistoryMode => 'מצב ללא היסטוריה';

  @override
  String get transientNotice => 'השמע מעובד בזמן אמת ואינו נשמר.';

  @override
  String get delete => 'מחיקה';
}
