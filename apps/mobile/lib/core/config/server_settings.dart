import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_config.dart';

/// Where the app talks to. Defaults to the build-time [AppConfig.apiBaseUrl];
/// testers can point a build at their own server without rebuilding.
class ServerUrlController extends Notifier<String> {
  static const _key = 'voxeli.server_url';

  @override
  String build() => AppConfig.apiBaseUrl;

  /// Load the persisted override, if any. Called once at startup.
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved != null && _isValid(saved)) state = saved;
  }

  /// Returns false (and leaves state unchanged) when the URL is not usable.
  Future<bool> set(String url) async {
    final trimmed = url.trim().replaceAll(RegExp(r'/+$'), '');
    if (!_isValid(trimmed)) return false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, trimmed);
    state = trimmed;
    return true;
  }

  Future<void> reset() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    state = AppConfig.apiBaseUrl;
  }

  static bool _isValid(String url) {
    final uri = Uri.tryParse(url);
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
  }
}

final serverUrlProvider = NotifierProvider<ServerUrlController, String>(ServerUrlController.new);
