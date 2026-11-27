/// Build-time configuration. Pass with `--dart-define=API_URL=https://api.voxeli.app`.
/// No secrets live here: the mobile app only ever talks to our own API.
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_URL',
    // Android emulator loopback to the host machine; iOS simulator uses localhost.
    defaultValue: 'http://10.0.2.2:4000',
  );
}
