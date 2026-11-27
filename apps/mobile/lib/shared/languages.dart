import 'package:flutter/widgets.dart';

/// Mirror of the server registry (`@voxeli/domain` LANGUAGES). Kept in sync by
/// the `languages_test.dart` fixture check; see docs/TECH_DEBT.md (generate
/// from a single JSON source).
class Language {
  const Language(this.code, this.englishName, this.nativeName, this.rtl);
  final String code;
  final String englishName;
  final String nativeName;
  final bool rtl;
  TextDirection get direction => rtl ? TextDirection.rtl : TextDirection.ltr;
}

const kAutoDetect = 'auto';

const List<Language> kLanguages = [
  Language('en', 'English', 'English', false),
  Language('he', 'Hebrew', 'עברית', true),
  Language('ar', 'Arabic', 'العربية', true),
  Language('de', 'German', 'Deutsch', false),
  Language('ru', 'Russian', 'Русский', false),
  Language('fr', 'French', 'Français', false),
  Language('es', 'Spanish', 'Español', false),
  Language('pt', 'Portuguese', 'Português', false),
  Language('it', 'Italian', 'Italiano', false),
  Language('tr', 'Turkish', 'Türkçe', false),
  Language('uk', 'Ukrainian', 'Українська', false),
  Language('pl', 'Polish', 'Polski', false),
  Language('nl', 'Dutch', 'Nederlands', false),
  Language('el', 'Greek', 'Ελληνικά', false),
  Language('ro', 'Romanian', 'Română', false),
  Language('hu', 'Hungarian', 'Magyar', false),
  Language('cs', 'Czech', 'Čeština', false),
  Language('sv', 'Swedish', 'Svenska', false),
  Language('da', 'Danish', 'Dansk', false),
  Language('fi', 'Finnish', 'Suomi', false),
  Language('no', 'Norwegian', 'Norsk', false),
  Language('fa', 'Persian', 'فارسی', true),
  Language('ur', 'Urdu', 'اردو', true),
  Language('hi', 'Hindi', 'हिन्दी', false),
  Language('bn', 'Bengali', 'বাংলা', false),
  Language('th', 'Thai', 'ไทย', false),
  Language('vi', 'Vietnamese', 'Tiếng Việt', false),
  Language('id', 'Indonesian', 'Bahasa Indonesia', false),
  Language('ms', 'Malay', 'Bahasa Melayu', false),
  Language('tl', 'Filipino', 'Filipino', false),
  Language('zh', 'Chinese (Simplified)', '简体中文', false),
  Language('zh-Hant', 'Chinese (Traditional)', '繁體中文', false),
  Language('ja', 'Japanese', '日本語', false),
  Language('ko', 'Korean', '한국어', false),
  Language('am', 'Amharic', 'አማርኛ', false),
  Language('sw', 'Swahili', 'Kiswahili', false),
  Language('yi', 'Yiddish', 'ייִדיש', true),
];

Language? languageByCode(String code) {
  for (final l in kLanguages) {
    if (l.code == code) return l;
  }
  final primary = code.split('-').first;
  for (final l in kLanguages) {
    if (l.code == primary) return l;
  }
  return null;
}

TextDirection directionOf(String code) => languageByCode(code)?.direction ?? TextDirection.ltr;
