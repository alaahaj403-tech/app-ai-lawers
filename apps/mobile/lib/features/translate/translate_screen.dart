import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../shared/languages.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_sheet.dart';
import 'translate_controller.dart';
import 'translate_models.dart';

/// Journey A on mobile: open → type → translate. One primary action within
/// thumb reach; advanced options are progressively disclosed.
class TranslateScreen extends ConsumerStatefulWidget {
  const TranslateScreen({super.key});

  @override
  ConsumerState<TranslateScreen> createState() => _TranslateScreenState();
}

class _TranslateScreenState extends ConsumerState<TranslateScreen> {
  final _text = TextEditingController();
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(translateControllerProvider.notifier).loadHistory());
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  String _errorText(AppLocalizations l10n, String code) => switch (code) {
        'NETWORK_FAILURE' || 'TIMEOUT' => l10n.errorNetwork,
        'QUOTA_EXCEEDED' => l10n.errorQuota,
        'AUTHENTICATION_FAILURE' => l10n.errorAuth,
        'PROVIDER_UNAVAILABLE' || 'MODEL_UNSUPPORTED' => l10n.errorProvider,
        _ => l10n.errorGeneric,
      };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(translateControllerProvider);
    final controller = ref.read(translateControllerProvider.notifier);
    final auth = ref.watch(authControllerProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appName, textDirection: TextDirection.ltr),
        actions: [
          if (auth.status == AuthStatus.signedIn)
            IconButton(
              tooltip: l10n.logout,
              icon: const Icon(Icons.logout),
              onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            )
          else
            TextButton(
              onPressed: () => showAuthSheet(context),
              child: Text(l10n.login),
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            _LanguageBar(state: state, controller: controller, onSwapText: (t) => _text.text = t),
            const SizedBox(height: 12),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  TextField(
                    key: const Key('source_text'),
                    controller: _text,
                    minLines: 4,
                    maxLines: 8,
                    maxLength: 5000,
                    textDirection: state.sourceLanguage == kAutoDetect ? null : directionOf(state.sourceLanguage),
                    textInputAction: TextInputAction.newline,
                    style: theme.textTheme.titleMedium,
                    decoration: InputDecoration(
                      hintText: l10n.sourcePlaceholder,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.all(16),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Checkbox(
                                value: !state.saveToHistory,
                                onChanged: (v) => controller.setSaveToHistory(!(v ?? false)),
                              ),
                              Flexible(child: Text(l10n.noHistoryMode, style: theme.textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
                            ],
                          ),
                        ),
                        FilledButton(
                          key: const Key('translate_button'),
                          onPressed: state.status == TranslateStatus.loading ? null : () => controller.translate(_text.text),
                          child: Text(state.status == TranslateStatus.loading ? l10n.translating : l10n.translateAction),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (state.status == TranslateStatus.failure && state.failure != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _Banner(
                  key: const Key('error_banner'),
                  color: theme.colorScheme.errorContainer,
                  textColor: theme.colorScheme.onErrorContainer,
                  text: _errorText(l10n, state.failure!.code),
                ),
              ),
            if (state.result != null) ...[
              const SizedBox(height: 12),
              _ResultCard(
                response: state.result!,
                sourceIsAuto: state.sourceLanguage == kAutoDetect,
                copied: _copied,
                onCopy: () async {
                  await Clipboard.setData(ClipboardData(text: state.result!.result.translatedText));
                  if (!mounted) return;
                  setState(() => _copied = true);
                  Future<void>.delayed(const Duration(seconds: 2), () {
                    if (mounted) setState(() => _copied = false);
                  });
                },
              ),
            ],
            const SizedBox(height: 24),
            Text(l10n.historyTitle, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 8),
            if (state.history.isEmpty)
              Text(l10n.historyEmpty, style: theme.textTheme.bodySmall)
            else
              Card(
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    for (final item in state.history)
                      ListTile(
                        title: Text(item.translatedText, maxLines: 1, overflow: TextOverflow.ellipsis, textDirection: directionOf(item.targetLanguage)),
                        subtitle: Text(item.sourceText, maxLines: 1, overflow: TextOverflow.ellipsis, textDirection: directionOf(item.sourceLanguage)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: l10n.save,
                              icon: Icon(item.favorite ? Icons.star : Icons.star_border),
                              onPressed: () => controller.toggleFavorite(item),
                            ),
                            IconButton(
                              tooltip: l10n.delete,
                              icon: const Icon(Icons.close),
                              onPressed: () => controller.deleteItem(item),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            Text(l10n.transientNotice, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _LanguageBar extends StatelessWidget {
  const _LanguageBar({required this.state, required this.controller, required this.onSwapText});
  final TranslateState state;
  final TranslateController controller;
  final ValueChanged<String> onSwapText;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          child: _LanguageDropdown(
            key: const Key('source_language'),
            value: state.sourceLanguage,
            allowAuto: true,
            autoLabel: l10n.autoDetect,
            onChanged: controller.setSource,
          ),
        ),
        IconButton(
          tooltip: l10n.swapLanguages,
          icon: const Icon(Icons.swap_horiz),
          onPressed: () {
            final replacement = controller.swap('');
            if (replacement != null && replacement.isNotEmpty) onSwapText(replacement);
          },
        ),
        Expanded(
          child: _LanguageDropdown(
            key: const Key('target_language'),
            value: state.targetLanguage,
            allowAuto: false,
            autoLabel: '',
            onChanged: controller.setTarget,
          ),
        ),
      ],
    );
  }
}

class _LanguageDropdown extends StatelessWidget {
  const _LanguageDropdown({super.key, required this.value, required this.allowAuto, required this.autoLabel, required this.onChanged});
  final String value;
  final bool allowAuto;
  final String autoLabel;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
      items: [
        if (allowAuto) DropdownMenuItem(value: kAutoDetect, child: Text(autoLabel)),
        for (final l in kLanguages)
          DropdownMenuItem(
            value: l.code,
            child: Text(l.nativeName, textDirection: l.direction, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.response, required this.sourceIsAuto, required this.copied, required this.onCopy});
  final TranslateResponse response;
  final bool sourceIsAuto;
  final bool copied;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final r = response.result;
    final target = languageByCode(r.targetLanguage);
    final detected = languageByCode(r.detectedLanguage);
    final violations = r.integrityViolations.length;
    final left = response.quotaLeft;

    return Card(
      key: const Key('result_card'),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (sourceIsAuto && detected != null)
                  Expanded(child: Text(l10n.detected(detected.nativeName), style: theme.textTheme.bodySmall)),
                if (target != null) Text(target.nativeName, style: theme.textTheme.bodySmall, textDirection: target.direction),
              ],
            ),
            const SizedBox(height: 8),
            SelectableText(
              r.translatedText,
              key: const Key('translated_text'),
              textDirection: directionOf(r.targetLanguage),
              style: theme.textTheme.headlineSmall,
            ),
            if (violations > 0 || response.degraded) ...[
              const SizedBox(height: 12),
              _Banner(
                color: theme.colorScheme.tertiaryContainer,
                textColor: theme.colorScheme.onTertiaryContainer,
                text: [
                  if (violations > 0) l10n.integrityWarning(violations),
                  if (response.degraded) l10n.degraded,
                ].join('\n'),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: onCopy,
                  icon: Icon(copied ? Icons.check : Icons.copy),
                  label: Text(copied ? l10n.copied : l10n.copy),
                ),
                const Spacer(),
                if (left != null) Text(l10n.quotaLeft(left), style: theme.textTheme.bodySmall),
              ],
            ),
            if (r.alternatives.isNotEmpty)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(l10n.alternatives, style: theme.textTheme.bodyMedium),
                children: [
                  for (final a in r.alternatives)
                    ListTile(
                      dense: true,
                      title: Text(a.text, textDirection: directionOf(r.targetLanguage)),
                      subtitle: a.note == null ? null : Text(a.note!),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({super.key, required this.color, required this.textColor, required this.text});
  final Color color;
  final Color textColor;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: TextStyle(color: textColor)),
    );
  }
}
