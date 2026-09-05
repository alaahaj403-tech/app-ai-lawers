// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'Voxeli';

  @override
  String get tagline => 'Говорите свободно. Понимайте всех.';

  @override
  String get navHome => 'Главная';

  @override
  String get navTalk => 'Разговор';

  @override
  String get navCamera => 'Камера';

  @override
  String get navLearn => 'Обучение';

  @override
  String get navCalls => 'Звонки';

  @override
  String get sourcePlaceholder => 'Введите или вставьте текст…';

  @override
  String get translateAction => 'Перевести';

  @override
  String detected(String language) {
    return 'Определён язык: $language';
  }

  @override
  String get swapLanguages => 'Поменять языки';

  @override
  String get autoDetect => 'Определить язык';

  @override
  String get copy => 'Копировать';

  @override
  String get copied => 'Скопировано';

  @override
  String get save => 'Сохранить';

  @override
  String get alternatives => 'Варианты';

  @override
  String integrityWarning(int count) {
    return 'Проверьте числа и имена: $count не удалось подтвердить.';
  }

  @override
  String get degraded => 'Используется резервный переводчик.';

  @override
  String get translating => 'Перевожу…';

  @override
  String get errorNetwork =>
      'Нет соединения. Проверьте сеть и попробуйте снова.';

  @override
  String get errorQuota => 'Вы достигли лимита тарифа.';

  @override
  String get errorProvider =>
      'Перевод временно недоступен. Попробуйте ещё раз.';

  @override
  String get errorAuth => 'Войдите, чтобы переводить.';

  @override
  String get errorGeneric => 'Что-то пошло не так.';

  @override
  String quotaLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Осталось $count перевода в этом месяце',
      many: 'Осталось $count переводов в этом месяце',
      few: 'Осталось $count перевода в этом месяце',
      one: 'Остался $count перевод в этом месяце',
    );
    return '$_temp0';
  }

  @override
  String get historyTitle => 'История';

  @override
  String get historyEmpty => 'Переводов пока нет.';

  @override
  String get login => 'Войти';

  @override
  String get register => 'Создать аккаунт';

  @override
  String get logout => 'Выйти';

  @override
  String get email => 'Эл. почта';

  @override
  String get password => 'Пароль';

  @override
  String get noHistoryMode => 'Режим без истории';

  @override
  String get transientNotice =>
      'Аудио обрабатывается в реальном времени и не сохраняется.';

  @override
  String get delete => 'Удалить';
}
