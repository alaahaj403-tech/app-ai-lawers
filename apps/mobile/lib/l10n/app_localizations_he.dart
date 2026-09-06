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

  @override
  String get settingsTitle => 'שרת';

  @override
  String get serverUrl => 'כתובת השרת';

  @override
  String get serverUrlHelp =>
      'לאן האפליקציה שולחת תרגומים. לשינוי רק לצורך בדיקות מול שרת משלך.';

  @override
  String get serverUrlInvalid => 'הזינו כתובת http(s) מלאה.';

  @override
  String get resetDefault => 'איפוס';

  @override
  String get cancel => 'ביטול';

  @override
  String get talkTitle => 'שיחה';

  @override
  String get talkStart => 'התחלת שיחה';

  @override
  String get talkStop => 'סיום';

  @override
  String get talkIdleHint => 'דברו בשפה שלכם. הצד השני שומע בשפה שלו.';

  @override
  String get talkMyLanguage => 'אני מדבר/ת';

  @override
  String get talkTargetLanguage => 'הם מדברים';

  @override
  String get stateListening => 'מקשיב';

  @override
  String get stateTranslating => 'מתרגם';

  @override
  String get stateSpeaking => 'מדבר';

  @override
  String get stateConnecting => 'מתחבר';

  @override
  String get stateReconnecting => 'מתחבר מחדש…';

  @override
  String get stateEnded => 'הסתיים';

  @override
  String get micOn => 'המיקרופון פועל';

  @override
  String get micOff => 'המיקרופון כבוי';

  @override
  String get speakerOn => 'קול פועל';

  @override
  String get speakerOff => 'קול כבוי';

  @override
  String minutesUsed(int used, int limit) {
    return 'נוצלו $used מתוך $limit דקות החודש';
  }

  @override
  String minutesUsedUnlimited(int used) {
    return 'נוצלו $used דקות החודש';
  }

  @override
  String get permissionDenied =>
      'הגישה למיקרופון נדחתה. אפשרו אותה בהגדרות המערכת כדי להשתמש בשיחה.';

  @override
  String get connectionLost => 'החיבור אבד.';

  @override
  String sessionEndedAfter(String duration) {
    return 'השיחה הסתיימה אחרי $duration.';
  }

  @override
  String get listen => 'השמעה';

  @override
  String get mockNotice =>
      'שרת פיתוח: התמלולים והתרגומים הם ממלאי מקום, לא זיהוי דיבור.';
}
