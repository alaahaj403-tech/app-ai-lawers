import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../auth/token_store.dart';
import 'api_failure.dart';

/// Thin HTTP layer: bearer injection, single-flight refresh on 401,
/// timeouts, and mapping of every failure to [ApiFailure].
class ApiClient {
  ApiClient({required String baseUrl, required TokenStore tokens, Dio? dio})
      : _tokens = tokens, // ignore: prefer_initializing_formals
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: baseUrl,
                connectTimeout: const Duration(seconds: 8),
                receiveTimeout: const Duration(seconds: 30),
                headers: {'accept': 'application/json'},
              ),
            ) {
    _dio.interceptors.add(_AuthInterceptor(this));
  }

  final Dio _dio;
  final TokenStore _tokens;
  Future<bool>? _refreshing;

  /// The configured server, e.g. `https://api.voxeli.app`.
  String get baseUrl => _dio.options.baseUrl;

  /// The WebSocket origin for the same server (`wss://` for https).
  Uri websocketUri(String path, Map<String, String> query) {
    final base = Uri.parse(baseUrl);
    return base.replace(scheme: base.scheme == 'https' ? 'wss' : 'ws', path: path, queryParameters: query);
  }

  /// POST that returns raw bytes (speech synthesis).
  Future<({Uint8List bytes, String mimeType})> postBytes(String path, {Object? body}) async {
    try {
      final res = await _dio.post<List<int>>(
        path,
        data: body,
        options: Options(responseType: ResponseType.bytes, extra: {'auth': true}),
      );
      final data = res.data;
      final mime = res.headers.value('content-type') ?? 'application/octet-stream';
      return (bytes: Uint8List.fromList(data ?? const []), mimeType: mime.split(';').first.trim());
    } on DioException catch (e) {
      throw _map(e);
    }
  }

  Future<Map<String, dynamic>> post(String path, {Object? body, bool auth = true}) =>
      _send('POST', path, body: body, auth: auth);

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query, bool auth = true}) =>
      _send('GET', path, query: query, auth: auth);

  Future<Map<String, dynamic>> patch(String path, {Object? body}) => _send('PATCH', path, body: body);

  Future<void> delete(String path) async {
    await _send('DELETE', path);
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    try {
      final res = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, extra: {'auth': auth}),
      );
      final data = res.data;
      if (data is Map<String, dynamic>) return data;
      return const {};
    } on DioException catch (e) {
      throw _map(e);
    }
  }

  ApiFailure _map(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiFailure.timeout;
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return ApiFailure.network;
      case DioExceptionType.badResponse:
        final data = e.response?.data;
        return ApiFailure.fromJson(data is Map<String, dynamic> ? data : null, e.response?.statusCode);
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.transformTimeout:
        return ApiFailure(code: 'NETWORK_FAILURE', message: e.message ?? 'Request failed', retryable: false);
    }
  }

  /// Rotating refresh; concurrent 401s share one refresh call.
  Future<bool> refreshTokens() {
    final inFlight = _refreshing;
    if (inFlight != null) return inFlight;
    final future = _doRefresh();
    _refreshing = future;
    future.whenComplete(() => _refreshing = null);
    return future;
  }

  Future<bool> _doRefresh() async {
    final refresh = await _tokens.readRefreshToken();
    if (refresh == null) return false;
    try {
      final res = await _dio.post<dynamic>(
        '/v1/auth/refresh',
        data: {'refreshToken': refresh},
        options: Options(extra: {'auth': false, 'noRetry': true}),
      );
      final data = res.data;
      if (data is Map<String, dynamic>) {
        await storeTokensFrom(data);
        return true;
      }
      return false;
    } on DioException {
      await _tokens.clear();
      return false;
    }
  }

  Future<void> storeTokensFrom(Map<String, dynamic> authResponse) async {
    final tokens = authResponse['tokens'];
    if (tokens is Map<String, dynamic>) {
      await _tokens.write(
        accessToken: tokens['accessToken'] as String,
        refreshToken: tokens['refreshToken'] as String,
      );
    }
  }

  Future<void> clearTokens() => _tokens.clear();
  Future<bool> hasSession() async => (await _tokens.readRefreshToken()) != null;
}

class _AuthInterceptor extends QueuedInterceptor {
  _AuthInterceptor(this._client);
  final ApiClient _client;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra['auth'] == true) {
      final token = await _client._tokens.readAccessToken();
      if (token != null) options.headers['authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final opts = err.requestOptions;
    if (err.response?.statusCode == 401 && opts.extra['auth'] == true && opts.extra['noRetry'] != true) {
      final ok = await _client.refreshTokens();
      if (ok) {
        try {
          final token = await _client._tokens.readAccessToken();
          opts.headers['authorization'] = 'Bearer $token';
          opts.extra['noRetry'] = true;
          final res = await _client._dio.fetch<dynamic>(opts);
          return handler.resolve(res);
        } on DioException catch (e) {
          return handler.next(e);
        }
      }
    }
    handler.next(err);
  }
}
