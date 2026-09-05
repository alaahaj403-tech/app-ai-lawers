/// Typed failure mirroring the API's error envelope. UI maps `code` to
/// localized copy; `message` is only a fallback and never a stack trace.
class ApiFailure implements Exception {
  const ApiFailure({required this.code, required this.message, required this.retryable, this.status});

  final String code;
  final String message;
  final bool retryable;
  final int? status;

  static ApiFailure fromJson(Map<String, dynamic>? json, int? status) {
    final error = json?['error'];
    if (error is Map<String, dynamic>) {
      return ApiFailure(
        code: error['code'] as String? ?? 'INTERNAL',
        message: error['message'] as String? ?? 'Request failed',
        retryable: error['retryable'] as bool? ?? false,
        status: status,
      );
    }
    return ApiFailure(code: 'INTERNAL', message: 'Request failed', retryable: false, status: status);
  }

  static const network = ApiFailure(code: 'NETWORK_FAILURE', message: 'No connection', retryable: true);
  static const timeout = ApiFailure(code: 'TIMEOUT', message: 'Timed out', retryable: true);

  @override
  String toString() => 'ApiFailure($code)';
}
