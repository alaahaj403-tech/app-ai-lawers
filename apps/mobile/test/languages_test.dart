import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voxeli/shared/languages.dart';

void main() {
  test('registry has unique codes and marks RTL scripts', () {
    final codes = kLanguages.map((l) => l.code).toList();
    expect(codes.toSet().length, codes.length);
    for (final c in ['he', 'ar', 'fa', 'ur', 'yi']) {
      expect(directionOf(c), TextDirection.rtl, reason: c);
    }
    expect(directionOf('en'), TextDirection.ltr);
    expect(directionOf('unknown'), TextDirection.ltr);
    expect(languageByCode('he-IL')?.code, 'he');
  });
}
