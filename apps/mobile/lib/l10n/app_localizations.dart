import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_es.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_he.dart';
import 'app_localizations_ru.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('de'),
    Locale('en'),
    Locale('es'),
    Locale('fr'),
    Locale('he'),
    Locale('ru'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'Voxeli'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In en, this message translates to:
  /// **'Speak freely. Understand everyone.'**
  String get tagline;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navTalk.
  ///
  /// In en, this message translates to:
  /// **'Talk'**
  String get navTalk;

  /// No description provided for @navCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get navCamera;

  /// No description provided for @navLearn.
  ///
  /// In en, this message translates to:
  /// **'Learn'**
  String get navLearn;

  /// No description provided for @navCalls.
  ///
  /// In en, this message translates to:
  /// **'Calls'**
  String get navCalls;

  /// No description provided for @sourcePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Type or paste text…'**
  String get sourcePlaceholder;

  /// No description provided for @translateAction.
  ///
  /// In en, this message translates to:
  /// **'Translate'**
  String get translateAction;

  /// No description provided for @detected.
  ///
  /// In en, this message translates to:
  /// **'Detected: {language}'**
  String detected(String language);

  /// No description provided for @swapLanguages.
  ///
  /// In en, this message translates to:
  /// **'Swap languages'**
  String get swapLanguages;

  /// No description provided for @autoDetect.
  ///
  /// In en, this message translates to:
  /// **'Detect language'**
  String get autoDetect;

  /// No description provided for @copy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get copy;

  /// No description provided for @copied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get copied;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @alternatives.
  ///
  /// In en, this message translates to:
  /// **'Alternatives'**
  String get alternatives;

  /// No description provided for @integrityWarning.
  ///
  /// In en, this message translates to:
  /// **'Check numbers and names: {count} could not be verified.'**
  String integrityWarning(int count);

  /// No description provided for @degraded.
  ///
  /// In en, this message translates to:
  /// **'Using a backup translation engine.'**
  String get degraded;

  /// No description provided for @translating.
  ///
  /// In en, this message translates to:
  /// **'Translating…'**
  String get translating;

  /// No description provided for @errorNetwork.
  ///
  /// In en, this message translates to:
  /// **'No connection. Check your network and try again.'**
  String get errorNetwork;

  /// No description provided for @errorQuota.
  ///
  /// In en, this message translates to:
  /// **'You have reached your plan limit.'**
  String get errorQuota;

  /// No description provided for @errorProvider.
  ///
  /// In en, this message translates to:
  /// **'Translation is temporarily unavailable. Please try again.'**
  String get errorProvider;

  /// No description provided for @errorAuth.
  ///
  /// In en, this message translates to:
  /// **'Please log in to translate.'**
  String get errorAuth;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong.'**
  String get errorGeneric;

  /// No description provided for @quotaLeft.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 translation left this month} other{{count} translations left this month}}'**
  String quotaLeft(int count);

  /// No description provided for @historyTitle.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get historyTitle;

  /// No description provided for @historyEmpty.
  ///
  /// In en, this message translates to:
  /// **'No translations yet.'**
  String get historyEmpty;

  /// No description provided for @login.
  ///
  /// In en, this message translates to:
  /// **'Log in'**
  String get login;

  /// No description provided for @register.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get register;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get logout;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @noHistoryMode.
  ///
  /// In en, this message translates to:
  /// **'No-history mode'**
  String get noHistoryMode;

  /// No description provided for @transientNotice.
  ///
  /// In en, this message translates to:
  /// **'Audio is processed live and not stored.'**
  String get transientNotice;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get settingsTitle;

  /// No description provided for @serverUrl.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get serverUrl;

  /// No description provided for @serverUrlHelp.
  ///
  /// In en, this message translates to:
  /// **'Where this app sends translations. Change only for testing against your own server.'**
  String get serverUrlHelp;

  /// No description provided for @serverUrlInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a full http(s) address.'**
  String get serverUrlInvalid;

  /// No description provided for @resetDefault.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get resetDefault;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @talkTitle.
  ///
  /// In en, this message translates to:
  /// **'Talk'**
  String get talkTitle;

  /// No description provided for @talkStart.
  ///
  /// In en, this message translates to:
  /// **'Start conversation'**
  String get talkStart;

  /// No description provided for @talkStop.
  ///
  /// In en, this message translates to:
  /// **'End'**
  String get talkStop;

  /// No description provided for @talkIdleHint.
  ///
  /// In en, this message translates to:
  /// **'Speak in your language. The other side hears theirs.'**
  String get talkIdleHint;

  /// No description provided for @talkMyLanguage.
  ///
  /// In en, this message translates to:
  /// **'I speak'**
  String get talkMyLanguage;

  /// No description provided for @talkTargetLanguage.
  ///
  /// In en, this message translates to:
  /// **'They speak'**
  String get talkTargetLanguage;

  /// No description provided for @stateListening.
  ///
  /// In en, this message translates to:
  /// **'Listening'**
  String get stateListening;

  /// No description provided for @stateTranslating.
  ///
  /// In en, this message translates to:
  /// **'Translating'**
  String get stateTranslating;

  /// No description provided for @stateSpeaking.
  ///
  /// In en, this message translates to:
  /// **'Speaking'**
  String get stateSpeaking;

  /// No description provided for @stateConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting'**
  String get stateConnecting;

  /// No description provided for @stateReconnecting.
  ///
  /// In en, this message translates to:
  /// **'Reconnecting…'**
  String get stateReconnecting;

  /// No description provided for @stateEnded.
  ///
  /// In en, this message translates to:
  /// **'Ended'**
  String get stateEnded;

  /// No description provided for @micOn.
  ///
  /// In en, this message translates to:
  /// **'Microphone on'**
  String get micOn;

  /// No description provided for @micOff.
  ///
  /// In en, this message translates to:
  /// **'Microphone off'**
  String get micOff;

  /// No description provided for @speakerOn.
  ///
  /// In en, this message translates to:
  /// **'Voice on'**
  String get speakerOn;

  /// No description provided for @speakerOff.
  ///
  /// In en, this message translates to:
  /// **'Voice off'**
  String get speakerOff;

  /// No description provided for @minutesUsed.
  ///
  /// In en, this message translates to:
  /// **'{used} of {limit} minutes used this month'**
  String minutesUsed(int used, int limit);

  /// No description provided for @minutesUsedUnlimited.
  ///
  /// In en, this message translates to:
  /// **'{used} minutes used this month'**
  String minutesUsedUnlimited(int used);

  /// No description provided for @permissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Microphone access was denied. Allow it in system settings to use Talk.'**
  String get permissionDenied;

  /// No description provided for @connectionLost.
  ///
  /// In en, this message translates to:
  /// **'Connection lost.'**
  String get connectionLost;

  /// No description provided for @sessionEndedAfter.
  ///
  /// In en, this message translates to:
  /// **'Session ended after {duration}.'**
  String sessionEndedAfter(String duration);

  /// No description provided for @listen.
  ///
  /// In en, this message translates to:
  /// **'Listen'**
  String get listen;

  /// No description provided for @mockNotice.
  ///
  /// In en, this message translates to:
  /// **'Development server: transcripts and translations are placeholders, not recognized speech.'**
  String get mockNotice;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'he',
    'ru',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'es':
      return AppLocalizationsEs();
    case 'fr':
      return AppLocalizationsFr();
    case 'he':
      return AppLocalizationsHe();
    case 'ru':
      return AppLocalizationsRu();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
