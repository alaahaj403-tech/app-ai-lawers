import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_providers.dart';
import '../../core/network/api_failure.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class AuthState {
  const AuthState({this.status = AuthStatus.unknown, this.email, this.plan, this.failure});
  final AuthStatus status;
  final String? email;
  final String? plan;
  final ApiFailure? failure;

  AuthState copyWith({AuthStatus? status, String? email, String? plan, ApiFailure? failure, bool clearFailure = false}) =>
      AuthState(
        status: status ?? this.status,
        email: email ?? this.email,
        plan: plan ?? this.plan,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(restore);
    return const AuthState();
  }

  Future<void> restore() async {
    final client = ref.read(apiClientProvider);
    if (!await client.hasSession()) {
      state = const AuthState(status: AuthStatus.signedOut);
      return;
    }
    try {
      final me = await client.get('/v1/auth/me');
      state = AuthState(status: AuthStatus.signedIn, email: me['email'] as String?, plan: me['plan'] as String?);
    } on ApiFailure {
      state = const AuthState(status: AuthStatus.signedOut);
    }
  }

  Future<bool> login(String email, String password) => _auth('/v1/auth/login', {'email': email, 'password': password});

  Future<bool> register(String email, String password, String locale) =>
      _auth('/v1/auth/register', {'email': email, 'password': password, 'locale': locale});

  Future<bool> _auth(String path, Map<String, dynamic> body) async {
    final client = ref.read(apiClientProvider);
    try {
      final res = await client.post(path, body: body, auth: false);
      await client.storeTokensFrom(res);
      final user = res['user'] as Map<String, dynamic>? ?? const {};
      state = AuthState(status: AuthStatus.signedIn, email: user['email'] as String?, plan: user['plan'] as String?);
      return true;
    } on ApiFailure catch (e) {
      state = state.copyWith(failure: e);
      return false;
    }
  }

  Future<void> logout() async {
    final client = ref.read(apiClientProvider);
    try {
      await client.post('/v1/auth/logout', body: const {});
    } on ApiFailure {
      // Local sign-out proceeds regardless.
    }
    await client.clearTokens();
    state = const AuthState(status: AuthStatus.signedOut);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);
