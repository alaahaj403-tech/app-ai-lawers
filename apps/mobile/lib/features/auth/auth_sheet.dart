import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import 'auth_controller.dart';

Future<void> showAuthSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _AuthSheet(),
    );

class _AuthSheet extends ConsumerStatefulWidget {
  const _AuthSheet();
  @override
  ConsumerState<_AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends ConsumerState<_AuthSheet> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final auth = ref.read(authControllerProvider.notifier);
    final locale = Localizations.localeOf(context).languageCode;
    final ok = _register
        ? await auth.register(_email.text.trim(), _password.text, locale)
        : await auth.login(_email.text.trim(), _password.text);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      final l10n = AppLocalizations.of(context);
      final failure = ref.read(authControllerProvider).failure;
      setState(() {
        _busy = false;
        _error = switch (failure?.code) {
          'NETWORK_FAILURE' || 'TIMEOUT' => l10n.errorNetwork,
          'CONFLICT' || 'AUTHENTICATION_FAILURE' || 'VALIDATION_FAILURE' => failure!.message,
          _ => l10n.errorGeneric,
        };
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text(l10n.login)),
                ButtonSegment(value: true, label: Text(l10n.register)),
              ],
              selected: {_register},
              onSelectionChanged: (s) => setState(() => _register = s.first),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: l10n.email, border: const OutlineInputBorder()),
              validator: (v) => (v == null || !v.contains('@')) ? l10n.email : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _password,
              obscureText: true,
              autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: l10n.password, border: const OutlineInputBorder()),
              validator: (v) => (v == null || v.length < 10) ? l10n.password : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_register ? l10n.register : l10n.login),
            ),
          ],
        ),
      ),
    );
  }
}
