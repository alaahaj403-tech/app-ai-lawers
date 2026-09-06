import 'package:flutter/material.dart';

import 'features/talk/talk_screen.dart';
import 'features/translate/translate_screen.dart';
import 'l10n/app_localizations.dart';

/// Core navigation: Home (translate) · Talk. Camera, Learn and Calls join here
/// as they ship, per the product spec, rather than as separate apps.
class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: IndexedStack(index: _index, children: const [TranslateScreen(), TalkScreen()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.translate), label: l10n.navHome),
          NavigationDestination(key: const Key('nav_talk'), icon: const Icon(Icons.record_voice_over_outlined), selectedIcon: const Icon(Icons.record_voice_over), label: l10n.navTalk),
        ],
      ),
    );
  }
}
