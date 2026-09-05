import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth/token_store.dart';
import 'core/config/app_config.dart';
import 'core/network/api_client.dart';
import 'features/translate/translate_repository.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(baseUrl: AppConfig.apiBaseUrl, tokens: ref.watch(tokenStoreProvider)),
);

final translateRepositoryProvider =
    Provider<TranslateRepository>((ref) => ApiTranslateRepository(ref.watch(apiClientProvider)));

/// RFC 4122 v4 UUID without an extra dependency.
String _uuidV4() {
  final rnd = Random.secure();
  final b = List<int>.generate(16, (_) => rnd.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
  final s = List.generate(16, h).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

final uuidProvider = Provider<String Function()>((ref) => _uuidV4);
