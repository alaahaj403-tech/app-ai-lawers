import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:voxeli/app_providers.dart';
import 'package:voxeli/core/auth/token_store.dart';
import 'package:voxeli/core/config/server_settings.dart';
import 'package:voxeli/features/translate/translate_models.dart';
import 'package:voxeli/features/translate/translate_repository.dart';
import 'package:voxeli/main.dart';

class NoopRepo implements TranslateRepository {
  @override
  Future<TranslateResponse> translate({required String text, required String sourceLanguage, required String targetLanguage, required String mode, required bool saveToHistory, required String idempotencyKey}) => throw UnimplementedError();
  @override
  Future<List<HistoryItem>> history({int limit = 20}) async => const [];
  @override
  Future<void> setFavorite(String id, bool favorite) async {}
  @override
  Future<void> delete(String id) async {}
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('server dialog rejects a bad address and persists a good one', (tester) async {
    final container = ProviderContainer(overrides: [
      translateRepositoryProvider.overrideWithValue(NoopRepo()),
      tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const VoxeliApp(locale: Locale('en'))));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server_settings')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('server_url_field')), 'not a url');
    await tester.tap(find.byKey(const Key('server_url_save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter a full http(s) address.'), findsOneWidget);
    expect(container.read(serverUrlProvider), 'http://10.0.2.2:4000');

    await tester.enterText(find.byKey(const Key('server_url_field')), 'https://api.voxeli.app/');
    await tester.tap(find.byKey(const Key('server_url_save')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('server_url_field')), findsNothing);
    expect(container.read(serverUrlProvider), 'https://api.voxeli.app');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('voxeli.server_url'), 'https://api.voxeli.app');

    // A fresh controller restores the persisted value.
    final fresh = ProviderContainer();
    addTearDown(fresh.dispose);
    await fresh.read(serverUrlProvider.notifier).restore();
    expect(fresh.read(serverUrlProvider), 'https://api.voxeli.app');
  });
}
