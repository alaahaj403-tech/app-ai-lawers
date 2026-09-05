/// Wire models for `POST /v1/translate`. Parsing is defensive: the server is
/// trusted more than the network, but never blindly.
class TranslationResult {
  const TranslationResult({
    required this.detectedLanguage,
    required this.targetLanguage,
    required this.translatedText,
    required this.alternatives,
    required this.notes,
    required this.integrityViolations,
  });

  final String detectedLanguage;
  final String targetLanguage;
  final String translatedText;
  final List<TranslationAlternative> alternatives;
  final List<String> notes;
  final List<String> integrityViolations;

  static TranslationResult fromJson(Map<String, dynamic> json) {
    final integrity = json['integrity'] as Map<String, dynamic>? ?? const {};
    return TranslationResult(
      detectedLanguage: json['detectedLanguage'] as String? ?? '',
      targetLanguage: json['targetLanguage'] as String? ?? '',
      translatedText: json['translatedText'] as String? ?? '',
      alternatives: (json['alternatives'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TranslationAlternative.fromJson)
          .toList(),
      notes: (json['notes'] as List<dynamic>? ?? const []).whereType<String>().toList(),
      integrityViolations: (integrity['violations'] as List<dynamic>? ?? const []).whereType<String>().toList(),
    );
  }
}

class TranslationAlternative {
  const TranslationAlternative({required this.text, this.note});
  final String text;
  final String? note;
  static TranslationAlternative fromJson(Map<String, dynamic> json) =>
      TranslationAlternative(text: json['text'] as String? ?? '', note: json['note'] as String?);
}

class TranslateResponse {
  const TranslateResponse({
    required this.id,
    required this.result,
    required this.degraded,
    required this.quotaUsed,
    required this.quotaLimit,
  });

  final String? id;
  final TranslationResult result;
  final bool degraded;
  final int quotaUsed;
  final int? quotaLimit;

  int? get quotaLeft => quotaLimit == null ? null : (quotaLimit! - quotaUsed).clamp(0, quotaLimit!);

  static TranslateResponse fromJson(Map<String, dynamic> json) {
    final routing = json['routing'] as Map<String, dynamic>? ?? const {};
    final quota = json['quota'] as Map<String, dynamic>? ?? const {};
    return TranslateResponse(
      id: json['id'] as String?,
      result: TranslationResult.fromJson(json['result'] as Map<String, dynamic>? ?? const {}),
      degraded: routing['degraded'] as bool? ?? false,
      quotaUsed: quota['used'] as int? ?? 0,
      quotaLimit: quota['limit'] as int?,
    );
  }
}

class HistoryItem {
  const HistoryItem({
    required this.id,
    required this.sourceLanguage,
    required this.targetLanguage,
    required this.sourceText,
    required this.translatedText,
    required this.favorite,
  });

  final String id;
  final String sourceLanguage;
  final String targetLanguage;
  final String sourceText;
  final String translatedText;
  final bool favorite;

  static HistoryItem fromJson(Map<String, dynamic> json) => HistoryItem(
        id: json['id'] as String,
        sourceLanguage: json['sourceLanguage'] as String? ?? '',
        targetLanguage: json['targetLanguage'] as String? ?? '',
        sourceText: json['sourceText'] as String? ?? '',
        translatedText: json['translatedText'] as String? ?? '',
        favorite: json['favorite'] as bool? ?? false,
      );
}
