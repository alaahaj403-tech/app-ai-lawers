import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:voxeli/app_providers.dart';
import 'package:voxeli/core/auth/token_store.dart';
import 'package:voxeli/core/network/api_failure.dart';
import 'package:voxeli/features/translate/translate_models.dart';
import 'package:voxeli/features/translate/translate_repository.dart';
import 'package:voxeli/main.dart';

class FakeRepo implements TranslateRepository {
  FakeRepo({this.failWith});
  final ApiFailure? failWith;
  final calls = <Map<String, Object?>>[];

  @override
  Future<TranslateResponse> translate({
    required String text,
    required String sourceLanguage,
    required String targetLanguage,
    required String mode,
    required bool saveToHistory,
    required String idempotencyKey,
  }) async {
    calls.add({'text': text, 'source': sourceLanguage, 'target': targetLanguage, 'key': idempotencyKey});
    if (failWith != null) throw failWith!;
    return TranslateResponse(
      id: 't1',
      result: TranslationResult(
        detectedLanguage: 'en',
        targetLanguage: targetLanguage,
        translatedText: 'שלום 2043',
        alternatives: const [],
        notes: const [],
        integrityViolations: const ['number:2043'],
      ),
      degraded: false,
      quotaUsed: 1,
      quotaLimit: 300,
    );
  }

  @override
  Future<List<HistoryItem>> history({int limit = 20}) async => const [];
  @override
  Future<void> setFavorite(String id, bool favorite) async {}
  @override
  Future<void> delete(String id) async {}
}

Widget harness(FakeRepo repo, Locale locale) => ProviderScope(
      overrides: [
        translateRepositoryProvider.overrideWithValue(repo),
        tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      ],
      child: VoxeliApp(locale: locale),
    );

void main() {
  testWidgets('Hebrew UI renders RTL and translating shows the result with an integrity warning', (tester) async {
    final repo = FakeRepo();
    await tester.pumpWidget(harness(repo, const Locale('he')));
    await tester.pumpAndSettle();

    expect(Directionality.of(tester.element(find.byKey(const Key('translate_button')))), TextDirection.rtl);
    expect(find.text('תרגום'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('source_text')), 'Invoice 2043');
    await tester.tap(find.byKey(const Key('translate_button')));
    await tester.pumpAndSettle();

    expect(repo.calls.single['text'], 'Invoice 2043');
    expect((repo.calls.single['key'] as String).length, 36);
    expect(find.byKey(const Key('result_card')), findsOneWidget);
    expect(find.text('שלום 2043'), findsOneWidget);
    expect(find.textContaining('בדקו מספרים ושמות'), findsOneWidget);
  });

  testWidgets('quota failure shows a localized error banner (English)', (tester) async {
    final repo = FakeRepo(failWith: const ApiFailure(code: 'QUOTA_EXCEEDED', message: 'x', retryable: false));
    await tester.pumpWidget(harness(repo, const Locale('en')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('source_text')), 'hello');
    await tester.tap(find.byKey(const Key('translate_button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('error_banner')), findsOneWidget);
    expect(find.text('You have reached your plan limit.'), findsOneWidget);
    expect(find.byKey(const Key('result_card')), findsNothing);
  });

  testWidgets('empty input does not call the API', (tester) async {
    final repo = FakeRepo();
    await tester.pumpWidget(harness(repo, const Locale('ar')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('translate_button')));
    await tester.pumpAndSettle();
    expect(repo.calls, isEmpty);
  });
}
