import '../../core/network/api_client.dart';
import 'translate_models.dart';

abstract class TranslateRepository {
  Future<TranslateResponse> translate({
    required String text,
    required String sourceLanguage,
    required String targetLanguage,
    required String mode,
    required bool saveToHistory,
    required String idempotencyKey,
  });
  Future<List<HistoryItem>> history({int limit = 20});
  Future<void> setFavorite(String id, bool favorite);
  Future<void> delete(String id);
}

class ApiTranslateRepository implements TranslateRepository {
  ApiTranslateRepository(this._client);
  final ApiClient _client;

  @override
  Future<TranslateResponse> translate({
    required String text,
    required String sourceLanguage,
    required String targetLanguage,
    required String mode,
    required bool saveToHistory,
    required String idempotencyKey,
  }) async {
    final json = await _client.post('/v1/translate', body: {
      'text': text,
      'sourceLanguage': sourceLanguage,
      'targetLanguage': targetLanguage,
      'mode': mode,
      'saveToHistory': saveToHistory,
      'idempotencyKey': idempotencyKey,
    });
    return TranslateResponse.fromJson(json);
  }

  @override
  Future<List<HistoryItem>> history({int limit = 20}) async {
    final json = await _client.get('/v1/translations', query: {'limit': limit});
    return (json['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HistoryItem.fromJson)
        .toList();
  }

  @override
  Future<void> setFavorite(String id, bool favorite) async {
    await _client.patch('/v1/translations/$id', body: {'favorite': favorite});
  }

  @override
  Future<void> delete(String id) => _client.delete('/v1/translations/$id');
}
