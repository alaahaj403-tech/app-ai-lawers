import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/translate/translate_screen.dart';
import 'l10n/app_localizations.dart';

void main() {
  runApp(const ProviderScope(child: VoxeliApp()));
}

class VoxeliApp extends StatelessWidget {
  const VoxeliApp({super.key, this.locale});

  /// Optional locale override (tests, previews). Null follows the device.
  final Locale? locale;

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF2F5DD6);
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
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: seed), useMaterial3: true),
      darkTheme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark), useMaterial3: true),
      home: const TranslateScreen(),
    );
  }
}
