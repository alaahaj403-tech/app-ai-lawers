// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'Speak freely. Understand everyone.';

  @override
  String get navHome => 'Home';

  @override
  String get navTalk => 'Talk';

  @override
  String get navCamera => 'Camera';

  @override
  String get navLearn => 'Learn';

  @override
  String get navCalls => 'Calls';

  @override
  String get sourcePlaceholder => 'Type or paste text…';

  @override
  String get translateAction => 'Translate';

  @override
  String detected(String language) {
    return 'Detected: $language';
  }

  @override
  String get swapLanguages => 'Swap languages';

  @override
  String get autoDetect => 'Detect language';

  @override
  String get copy => 'Copy';

  @override
  String get copied => 'Copied';

  @override
  String get save => 'Save';

  @override
  String get alternatives => 'Alternatives';

  @override
  String integrityWarning(int count) {
    return 'Check numbers and names: $count could not be verified.';
  }

  @override
  String get degraded => 'Using a backup translation engine.';

  @override
  String get translating => 'Translating…';

  @override
  String get errorNetwork => 'No connection. Check your network and try again.';

  @override
  String get errorQuota => 'You have reached your plan limit.';

  @override
  String get errorProvider =>
      'Translation is temporarily unavailable. Please try again.';

  @override
  String get errorAuth => 'Please log in to translate.';

  @override
  String get errorGeneric => 'Something went wrong.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count translations left this month',
      one: '1 translation left this month',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'History';

  @override
  String get historyEmpty => 'No translations yet.';

  @override
  String get login => 'Log in';

  @override
  String get register => 'Create account';

  @override
  String get logout => 'Log out';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get noHistoryMode => 'No-history mode';

  @override
  String get transientNotice => 'Audio is processed live and not stored.';

  @override
  String get delete => 'Delete';

  @override
  String get settingsTitle => 'Server';

  @override
  String get serverUrl => 'Server address';

  @override
  String get serverUrlHelp =>
      'Where this app sends translations. Change only for testing against your own server.';

  @override
  String get serverUrlInvalid => 'Enter a full http(s) address.';

  @override
  String get resetDefault => 'Reset';

  @override
  String get cancel => 'Cancel';
}
