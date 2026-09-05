// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Spanish Castilian (`es`).
class AppLocalizationsEs extends AppLocalizations {
  AppLocalizationsEs([String locale = 'es']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'Habla libremente. Entiende a todos.';

  @override
  String get navHome => 'Inicio';

  @override
  String get navTalk => 'Hablar';

  @override
  String get navCamera => 'Cámara';

  @override
  String get navLearn => 'Aprender';

  @override
  String get navCalls => 'Llamadas';

  @override
  String get sourcePlaceholder => 'Escribe o pega texto…';

  @override
  String get translateAction => 'Traducir';

  @override
  String detected(String language) {
    return 'Detectado: $language';
  }

  @override
  String get swapLanguages => 'Intercambiar idiomas';

  @override
  String get autoDetect => 'Detectar idioma';

  @override
  String get copy => 'Copiar';

  @override
  String get copied => 'Copiado';

  @override
  String get save => 'Guardar';

  @override
  String get alternatives => 'Alternativas';

  @override
  String integrityWarning(int count) {
    return 'Revisa números y nombres: $count no se pudieron verificar.';
  }

  @override
  String get degraded => 'Se está usando un motor de traducción de respaldo.';

  @override
  String get translating => 'Traduciendo…';

  @override
  String get errorNetwork =>
      'Sin conexión. Revisa tu red e inténtalo de nuevo.';

  @override
  String get errorQuota => 'Has alcanzado el límite de tu plan.';

  @override
  String get errorProvider =>
      'La traducción no está disponible temporalmente. Inténtalo de nuevo.';

  @override
  String get errorAuth => 'Inicia sesión para traducir.';

  @override
  String get errorGeneric => 'Algo salió mal.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Quedan $count traducciones este mes',
      one: 'Queda 1 traducción este mes',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'Historial';

  @override
  String get historyEmpty => 'Aún no hay traducciones.';

  @override
  String get login => 'Iniciar sesión';

  @override
  String get register => 'Crear cuenta';

  @override
  String get logout => 'Cerrar sesión';

  @override
  String get email => 'Correo electrónico';

  @override
  String get password => 'Contraseña';

  @override
  String get noHistoryMode => 'Modo sin historial';

  @override
  String get transientNotice => 'El audio se procesa en vivo y no se almacena.';

  @override
  String get delete => 'Eliminar';

  @override
  String get settingsTitle => 'Servidor';

  @override
  String get serverUrl => 'Dirección del servidor';

  @override
  String get serverUrlHelp =>
      'Adónde envía traducciones esta app. Cámbiala solo para probar con tu propio servidor.';

  @override
  String get serverUrlInvalid => 'Introduce una dirección http(s) completa.';

  @override
  String get resetDefault => 'Restablecer';

  @override
  String get cancel => 'Cancelar';
}
