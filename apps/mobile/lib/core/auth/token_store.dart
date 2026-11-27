import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tokens live only in platform secure storage (Keychain / Keystore).
abstract class TokenStore {
  Future<String?> readAccessToken();
  Future<String?> readRefreshToken();
  Future<void> write({required String accessToken, required String refreshToken});
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );

  static const _accessKey = 'voxeli.access_token';
  static const _refreshKey = 'voxeli.refresh_token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() => _storage.read(key: _accessKey);

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  @override
  Future<void> write({required String accessToken, required String refreshToken}) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// In-memory store for tests and previews.
class MemoryTokenStore implements TokenStore {
  String? _access;
  String? _refresh;

  @override
  Future<String?> readAccessToken() async => _access;
  @override
  Future<String?> readRefreshToken() async => _refresh;
  @override
  Future<void> write({required String accessToken, required String refreshToken}) async {
    _access = accessToken;
    _refresh = refreshToken;
  }

  @override
  Future<void> clear() async {
    _access = null;
    _refresh = null;
  }
}
