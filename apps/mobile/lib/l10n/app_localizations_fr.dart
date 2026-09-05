// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'Parlez librement. Comprenez tout le monde.';

  @override
  String get navHome => 'Accueil';

  @override
  String get navTalk => 'Parler';

  @override
  String get navCamera => 'Caméra';

  @override
  String get navLearn => 'Apprendre';

  @override
  String get navCalls => 'Appels';

  @override
  String get sourcePlaceholder => 'Saisissez ou collez du texte…';

  @override
  String get translateAction => 'Traduire';

  @override
  String detected(String language) {
    return 'Langue détectée : $language';
  }

  @override
  String get swapLanguages => 'Inverser les langues';

  @override
  String get autoDetect => 'Détecter la langue';

  @override
  String get copy => 'Copier';

  @override
  String get copied => 'Copié';

  @override
  String get save => 'Enregistrer';

  @override
  String get alternatives => 'Alternatives';

  @override
  String integrityWarning(int count) {
    return 'Vérifiez les nombres et les noms : $count n’ont pas pu être vérifiés.';
  }

  @override
  String get degraded => 'Moteur de traduction de secours utilisé.';

  @override
  String get translating => 'Traduction…';

  @override
  String get errorNetwork =>
      'Pas de connexion. Vérifiez le réseau et réessayez.';

  @override
  String get errorQuota => 'Vous avez atteint la limite de votre forfait.';

  @override
  String get errorProvider =>
      'Traduction temporairement indisponible. Réessayez.';

  @override
  String get errorAuth => 'Connectez-vous pour traduire.';

  @override
  String get errorGeneric => 'Une erreur est survenue.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count traductions restantes ce mois-ci',
      one: '1 traduction restante ce mois-ci',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'Historique';

  @override
  String get historyEmpty => 'Aucune traduction pour le moment.';

  @override
  String get login => 'Se connecter';

  @override
  String get register => 'Créer un compte';

  @override
  String get logout => 'Se déconnecter';

  @override
  String get email => 'E-mail';

  @override
  String get password => 'Mot de passe';

  @override
  String get noHistoryMode => 'Mode sans historique';

  @override
  String get transientNotice =>
      'L’audio est traité en direct et n’est pas conservé.';

  @override
  String get delete => 'Supprimer';
}
