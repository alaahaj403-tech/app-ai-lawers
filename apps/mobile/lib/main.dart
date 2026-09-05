import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/server_settings.dart';
import 'features/translate/translate_screen.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  await container.read(serverUrlProvider.notifier).restore();
  runApp(UncontrolledProviderScope(container: container, child: const VoxeliApp()));
}

class VoxeliApp extends StatelessWidget {
  const VoxeliApp({super.key, this.locale, this.fontFamily, this.fontFamilyFallback});

  /// Optional locale override (tests, previews). Null follows the device.
  final Locale? locale;

  /// Optional font family (brand fonts once bundled; system fonts in previews).
  final String? fontFamily;

  /// Per-script fallbacks (e.g. Hebrew/Arabic faces) applied to every text style.
  final List<String>? fontFamilyFallback;

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF2F5DD6);
    ThemeData themed(Brightness brightness) {
      final base = ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: brightness),
        useMaterial3: true,
        fontFamily: fontFamily,
      );
      if (fontFamilyFallback == null) return base;
      return base.copyWith(
        textTheme: base.textTheme.apply(fontFamilyFallback: fontFamilyFallback),
        primaryTextTheme: base.primaryTextTheme.apply(fontFamilyFallback: fontFamilyFallback),
      );
    }

    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      debugShowCheckedModeBanner: false,
      theme: themed(Brightness.light),
      darkTheme: themed(Brightness.dark),
      home: const TranslateScreen(),
    );
  }
}
