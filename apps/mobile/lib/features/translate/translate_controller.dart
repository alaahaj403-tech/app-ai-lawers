import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_failure.dart';
import '../../shared/languages.dart';
import 'translate_models.dart';
import 'translate_repository.dart';
import '../../app_providers.dart';

enum TranslateStatus { idle, loading, success, failure }

class TranslateState {
  const TranslateState({
    this.status = TranslateStatus.idle,
    this.sourceLanguage = kAutoDetect,
    this.targetLanguage = 'en',
    this.mode = 'natural',
    this.saveToHistory = true,
    this.result,
    this.failure,
    this.history = const [],
  });

  final TranslateStatus status;
  final String sourceLanguage;
  final String targetLanguage;
  final String mode;
  final bool saveToHistory;
  final TranslateResponse? result;
  final ApiFailure? failure;
  final List<HistoryItem> history;

  TranslateState copyWith({
    TranslateStatus? status,
    String? sourceLanguage,
    String? targetLanguage,
    String? mode,
    bool? saveToHistory,
    TranslateResponse? result,
    bool clearResult = false,
    ApiFailure? failure,
    bool clearFailure = false,
    List<HistoryItem>? history,
  }) =>
      TranslateState(
        status: status ?? this.status,
        sourceLanguage: sourceLanguage ?? this.sourceLanguage,
        targetLanguage: targetLanguage ?? this.targetLanguage,
        mode: mode ?? this.mode,
        saveToHistory: saveToHistory ?? this.saveToHistory,
        result: clearResult ? null : (result ?? this.result),
        failure: clearFailure ? null : (failure ?? this.failure),
        history: history ?? this.history,
      );
}

class TranslateController extends Notifier<TranslateState> {
  int _requestSeq = 0;

  @override
  TranslateState build() => const TranslateState();

  TranslateRepository get _repo => ref.read(translateRepositoryProvider);

  void setSource(String code) => state = state.copyWith(sourceLanguage: code, clearResult: true);
  void setTarget(String code) => state = state.copyWith(targetLanguage: code, clearResult: true);
  void setMode(String mode) => state = state.copyWith(mode: mode);
  void setSaveToHistory(bool value) => state = state.copyWith(saveToHistory: value);

  /// Swap direction. With auto-detect, the detected language becomes the target.
  String? swap(String currentText) {
    final detected = state.result?.result.detectedLanguage;
    final newSource = state.targetLanguage;
    final newTarget = state.sourceLanguage == kAutoDetect ? detected : state.sourceLanguage;
    if (newTarget == null) return null;
    final replacement = state.result?.result.translatedText ?? currentText;
    state = state.copyWith(sourceLanguage: newSource, targetLanguage: newTarget, clearResult: true);
    return replacement;
  }

  Future<void> translate(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.status == TranslateStatus.loading) return;
    final seq = ++_requestSeq;
    state = state.copyWith(status: TranslateStatus.loading, clearFailure: true);
    try {
      final res = await _repo.translate(
        text: trimmed,
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        mode: state.mode,
        saveToHistory: state.saveToHistory,
        idempotencyKey: ref.read(uuidProvider)(),
      );
      if (seq != _requestSeq) return; // superseded
      state = state.copyWith(status: TranslateStatus.success, result: res);
      if (state.saveToHistory) await loadHistory();
    } on ApiFailure catch (e) {
      if (seq != _requestSeq) return;
      state = state.copyWith(status: TranslateStatus.failure, failure: e);
    }
  }

  Future<void> loadHistory() async {
    try {
      final items = await _repo.history(limit: 10);
      state = state.copyWith(history: items);
    } on ApiFailure {
      // History is secondary; keep whatever we had.
    }
  }

  Future<void> toggleFavorite(HistoryItem item) async {
    try {
      await _repo.setFavorite(item.id, !item.favorite);
      await loadHistory();
    } on ApiFailure {
      // surfaced via history staying unchanged
    }
  }

  Future<void> deleteItem(HistoryItem item) async {
    try {
      await _repo.delete(item.id);
      state = state.copyWith(history: state.history.where((h) => h.id != item.id).toList());
    } on ApiFailure {
      // keep list
    }
  }
}

final translateControllerProvider =
    NotifierProvider<TranslateController, TranslateState>(TranslateController.new);
