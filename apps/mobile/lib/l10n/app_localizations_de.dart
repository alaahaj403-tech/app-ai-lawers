// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'Frei sprechen. Alle verstehen.';

  @override
  String get navHome => 'Start';

  @override
  String get navTalk => 'Sprechen';

  @override
  String get navCamera => 'Kamera';

  @override
  String get navLearn => 'Lernen';

  @override
  String get navCalls => 'Anrufe';

  @override
  String get sourcePlaceholder => 'Text eingeben oder einfügen…';

  @override
  String get translateAction => 'Übersetzen';

  @override
  String detected(String language) {
    return 'Erkannt: $language';
  }

  @override
  String get swapLanguages => 'Sprachen tauschen';

  @override
  String get autoDetect => 'Sprache erkennen';

  @override
  String get copy => 'Kopieren';

  @override
  String get copied => 'Kopiert';

  @override
  String get save => 'Speichern';

  @override
  String get alternatives => 'Alternativen';

  @override
  String integrityWarning(int count) {
    return 'Zahlen und Namen prüfen: $count konnten nicht verifiziert werden.';
  }

  @override
  String get degraded => 'Ersatz-Übersetzungsdienst wird verwendet.';

  @override
  String get translating => 'Übersetze…';

  @override
  String get errorNetwork =>
      'Keine Verbindung. Netzwerk prüfen und erneut versuchen.';

  @override
  String get errorQuota => 'Du hast das Limit deines Tarifs erreicht.';

  @override
  String get errorProvider =>
      'Übersetzung vorübergehend nicht verfügbar. Bitte erneut versuchen.';

  @override
  String get errorAuth => 'Bitte anmelden, um zu übersetzen.';

  @override
  String get errorGeneric => 'Etwas ist schiefgelaufen.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Noch $count Übersetzungen diesen Monat',
      one: 'Noch 1 Übersetzung diesen Monat',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'Verlauf';

  @override
  String get historyEmpty => 'Noch keine Übersetzungen.';

  @override
  String get login => 'Anmelden';

  @override
  String get register => 'Konto erstellen';

  @override
  String get logout => 'Abmelden';

  @override
  String get email => 'E-Mail';

  @override
  String get password => 'Passwort';

  @override
  String get noHistoryMode => 'Modus ohne Verlauf';

  @override
  String get transientNotice =>
      'Audio wird live verarbeitet und nicht gespeichert.';

  @override
  String get delete => 'Löschen';

  @override
  String get settingsTitle => 'Server';

  @override
  String get serverUrl => 'Serveradresse';

  @override
  String get serverUrlHelp =>
      'Wohin diese App Übersetzungen sendet. Nur zum Testen gegen einen eigenen Server ändern.';

  @override
  String get serverUrlInvalid => 'Gib eine vollständige http(s)-Adresse ein.';

  @override
  String get resetDefault => 'Zurücksetzen';

  @override
  String get cancel => 'Abbrechen';
}
