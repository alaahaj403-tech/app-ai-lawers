import 'package:flutter_test/flutter_test.dart';
import 'package:voxeli/features/translate/translate_models.dart';

void main() {
  test('TranslateResponse parses the API envelope and computes quota left', () {
    final res = TranslateResponse.fromJson({
      'id': 'abc',
      'result': {
        'detectedLanguage': 'he',
        'targetLanguage': 'en',
        'translatedText': 'Hello 2043',
        'alternatives': [
          {'text': 'Hi 2043', 'note': 'casual'}
        ],
        'ambiguities': [],
        'register': 'neutral',
        'notes': [],
        'integrity': {'protectedEntities': 1, 'preservedEntities': 1, 'violations': []},
      },
      'routing': {'slot': 'translation.default', 'degraded': true, 'latencyMs': 12},
      'quota': {'dimension': 'translations', 'used': 5, 'limit': 300},
    });
    expect(res.id, 'abc');
    expect(res.result.translatedText, 'Hello 2043');
    expect(res.result.alternatives.single.note, 'casual');
    expect(res.degraded, isTrue);
    expect(res.quotaLeft, 295);
  });

  test('tolerates missing optional fields and unlimited quota', () {
    final res = TranslateResponse.fromJson({
      'id': null,
      'result': {'translatedText': 'x'},
      'quota': {'used': 1, 'limit': null},
    });
    expect(res.id, isNull);
    expect(res.result.integrityViolations, isEmpty);
    expect(res.quotaLeft, isNull);
  });
}
