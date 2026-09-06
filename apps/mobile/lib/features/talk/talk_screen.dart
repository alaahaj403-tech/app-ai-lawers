import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_failure.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/languages.dart';
import 'talk_controller.dart';

/// Live face-to-face translation. Designed around voice: one big control, the
/// current state always readable, captions in both languages.
class TalkScreen extends ConsumerWidget {
  const TalkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final state = ref.watch(talkControllerProvider);
    final controller = ref.read(talkControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.talkTitle),
        actions: [
          IconButton(
            key: const Key('talk_speaker_toggle'),
            tooltip: state.speakTranslations ? l10n.speakerOn : l10n.speakerOff,
            icon: Icon(state.speakTranslations ? Icons.volume_up : Icons.volume_off),
            onPressed: controller.toggleSpeak,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: _LanguageField(
                      key: const Key('talk_my_language'),
                      label: l10n.talkMyLanguage,
                      value: state.myLanguage,
                      enabled: !state.isActive,
                      onChanged: controller.setMyLanguage,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _LanguageField(
                      key: const Key('talk_target_language'),
                      label: l10n.talkTargetLanguage,
                      value: state.targetLanguage,
                      enabled: !state.isActive,
                      onChanged: controller.setTargetLanguage,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _StateBar(state: state),
            Expanded(child: _Captions(state: state)),
            if (state.failure != null) _FailureLine(failure: state.failure!),
            if (state.status == TalkStatus.ended && state.closeReason != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  l10n.sessionEndedAfter(_format(state.durationSeconds)),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            if (state.usedMinutes != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                child: Text(
                  state.limitMinutes == null
                      ? l10n.minutesUsedUnlimited(state.usedMinutes!)
                      : l10n.minutesUsed(state.usedMinutes!, state.limitMinutes!),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: _MicButton(state: state, onStart: controller.start, onStop: controller.stop),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Text(
                l10n.transientNotice,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _format(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _LanguageField extends StatelessWidget {
  const _LanguageField({super.key, required this.label, required this.value, required this.enabled, required this.onChanged});
  final String label;
  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      // Fill the field instead of sizing to the longest item: two fields must
      // share a phone-width row without overflowing.
      isExpanded: true,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
      items: [
        for (final l in kLanguages)
          DropdownMenuItem(
            value: l.code,
            child: Text(l.nativeName, textDirection: l.direction, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: enabled ? (v) => v == null ? null : onChanged(v) : null,
    );
  }
}

class _StateBar extends StatelessWidget {
  const _StateBar({required this.state});
  final TalkState state;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (state.status) {
      TalkStatus.idle => (null, scheme.onSurfaceVariant),
      TalkStatus.connecting => (l10n.stateConnecting, scheme.onSurfaceVariant),
      TalkStatus.listening => (l10n.stateListening, scheme.primary),
      TalkStatus.translating => (l10n.stateTranslating, scheme.tertiary),
      TalkStatus.speaking => (l10n.stateSpeaking, scheme.secondary),
      TalkStatus.reconnecting => (l10n.stateReconnecting, scheme.error),
      TalkStatus.ended => (l10n.stateEnded, scheme.onSurfaceVariant),
      TalkStatus.failed => (null, scheme.error),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Icon(state.micOn ? Icons.mic : Icons.mic_off, size: 18, color: state.micOn ? scheme.primary : scheme.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(state.micOn ? l10n.micOn : l10n.micOff, style: Theme.of(context).textTheme.labelMedium),
          const Spacer(),
          if (label != null)
            Chip(
              key: const Key('talk_state_chip'),
              label: Text(label),
              avatar: state.status == TalkStatus.connecting || state.status == TalkStatus.reconnecting
                  ? const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
              side: BorderSide(color: color),
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    );
  }
}

class _Captions extends StatelessWidget {
  const _Captions({required this.state});
  final TalkState state;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    if (state.captions.isEmpty && state.partial.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(l10n.talkIdleHint, textAlign: TextAlign.center, style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ),
      );
    }
    final sourceDir = directionOf(state.myLanguage);
    final targetDir = directionOf(state.targetLanguage);
    return ListView(
      key: const Key('talk_captions'),
      reverse: true,
      padding: const EdgeInsets.all(16),
      children: [
        if (state.partial.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(state.partial, textDirection: sourceDir, style: theme.textTheme.bodyLarge?.copyWith(fontStyle: FontStyle.italic, color: theme.colorScheme.onSurfaceVariant)),
          ),
        for (final c in state.captions.reversed)
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(c.original, textDirection: sourceDir, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 6),
                  if (c.translated != null)
                    SelectableText(c.translated!, textDirection: targetDir, style: theme.textTheme.titleMedium)
                  else
                    const SizedBox(height: 18, child: Align(alignment: AlignmentDirectional.centerStart, child: SizedBox(width: 60, child: LinearProgressIndicator()))),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _MicButton extends StatelessWidget {
  const _MicButton({required this.state, required this.onStart, required this.onStop});
  final TalkState state;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final active = state.isActive;
    // The ring grows with microphone level: a real signal, not decoration.
    final ring = 72.0 + (state.level.clamp(0, 1) * 28.0);
    return Column(
      children: [
        SizedBox(
          height: 108,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 80),
              width: ring,
              height: ring,
              decoration: BoxDecoration(shape: BoxShape.circle, color: (active ? scheme.primary : scheme.outline).withValues(alpha: 0.18)),
              child: Center(
                child: FilledButton(
                  key: const Key('talk_mic_button'),
                  style: FilledButton.styleFrom(
                    shape: const CircleBorder(),
                    padding: const EdgeInsets.all(20),
                    backgroundColor: active ? scheme.error : scheme.primary,
                  ),
                  onPressed: state.status == TalkStatus.connecting ? null : (active ? onStop : onStart),
                  child: Icon(active ? Icons.stop : Icons.mic, size: 28),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(active ? l10n.talkStop : l10n.talkStart, style: Theme.of(context).textTheme.labelLarge),
      ],
    );
  }
}

class _FailureLine extends StatelessWidget {
  const _FailureLine({required this.failure});
  final ApiFailure failure;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final text = switch (failure.code) {
      'PERMISSION_DENIED' => l10n.permissionDenied,
      'QUOTA_EXCEEDED' => l10n.errorQuota,
      'NETWORK_FAILURE' || 'REALTIME_DISCONNECTED' || 'TIMEOUT' => l10n.connectionLost,
      'PROVIDER_UNAVAILABLE' => l10n.errorProvider,
      _ => l10n.errorGeneric,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(text, key: const Key('talk_failure'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
    );
  }
}
