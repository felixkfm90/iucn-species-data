import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_controller.dart';
import 'audio_playback.dart';
import 'domain/catalog.dart';
import 'ui/media_image.dart';
import 'ui/offline_page.dart';
import 'ui/species_page.dart';

class ExplorerApp extends StatefulWidget {
  final ExplorerController controller;
  final AudioPlayback audio;
  const ExplorerApp({super.key, required this.controller, required this.audio});
  @override
  State<ExplorerApp> createState() => _ExplorerAppState();
}

class _ExplorerAppState extends State<ExplorerApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late bool _wasLoggedIn;
  @override
  void initState() {
    super.initState();
    _wasLoggedIn = widget.controller.loggedIn;
    widget.controller.addListener(_authChanged);
  }

  void _authChanged() {
    final loggedIn = widget.controller.loggedIn;
    if (_wasLoggedIn && !loggedIn) {
      unawaited(widget.audio.stop());
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !widget.controller.loggedIn) {
          _navigator.currentState?.popUntil((route) => route.isFirst);
        }
      });
    }
    _wasLoggedIn = loggedIn;
  }

  @override
  void dispose() {
    widget.controller.removeListener(_authChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: _navigator,
    title: 'Arten-Explorer',
    debugShowCheckedModeBanner: false,
    locale: const Locale('de'),
    supportedLocales: const [Locale('de')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff245344)),
      useMaterial3: true,
    ),
    darkTheme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff83b9a0),
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
    ),
    home: AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        if (widget.controller.initializing) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return widget.controller.loggedIn || widget.controller.viewingPublic
            ? SpeciesHome(controller: widget.controller, audio: widget.audio)
            : LoginPage(controller: widget.controller);
      },
    ),
  );
}

Widget brand({double size = 40}) => Image.asset(
  'assets/arten-explorer.png',
  width: size,
  height: size,
  semanticLabel: 'Arten-Explorer',
);

class LoginPage extends StatefulWidget {
  final ExplorerController controller;
  const LoginPage({super.key, required this.controller});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _server = TextEditingController(),
      _username = TextEditingController(),
      _password = TextEditingController();
  bool _obscure = true;
  Future<void> _submit() async {
    if (widget.controller.busy) return;
    if (!_form.currentState!.validate()) return;
    final password = _password.text;
    _password.clear();
    final signedIn = await widget.controller.login(
      _server.text,
      _username.text,
      password,
    );
    if (signedIn && mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  void dispose() {
    _server.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Form(
              key: _form,
              child: AutofillGroup(
                onDisposeAction: AutofillContextAction.cancel,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(child: brand(size: 88)),
                    const SizedBox(height: 20),
                    Text(
                      'Arten-Explorer',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Am gemeinsamen Projekt anmelden',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _server,
                      enabled: !widget.controller.busy,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Projektadresse',
                        hintText: 'https://…',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          value?.trim().startsWith('https://') == true
                          ? null
                          : 'Die sichere Projektadresse eingeben.',
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _username,
                      enabled: !widget.controller.busy,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(
                        labelText: 'Benutzername',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) => value?.trim().isNotEmpty == true
                          ? null
                          : 'Benutzername eingeben.',
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      enabled: !widget.controller.busy,
                      obscureText: _obscure,
                      autocorrect: false,
                      enableSuggestions: false,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => unawaited(_submit()),
                      decoration: InputDecoration(
                        labelText: 'Passwort',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          tooltip: _obscure
                              ? 'Passwort anzeigen'
                              : 'Passwort verbergen',
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (value) => value?.isNotEmpty == true
                          ? null
                          : 'Passwort eingeben.',
                    ),
                    const SizedBox(height: 20),
                    if (widget.controller.error.isNotEmpty)
                      Notice(widget.controller.error, error: true),
                    FilledButton(
                      onPressed: widget.controller.busy ? null : _submit,
                      child: Text(
                        widget.controller.busy ? 'Anmelden …' : 'Anmelden',
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Das Passwort wird nicht gespeichert. Die persönliche Anmeldung wird geschützt auf diesem Gerät hinterlegt.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Arten nachschlagen · Bearbeiten am PC',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class Notice extends StatelessWidget {
  final String text;
  final bool error;
  const Notice(this.text, {super.key, this.error = false});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error
          ? Theme.of(context).colorScheme.errorContainer
          : Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Semantics(liveRegion: true, child: Text(text)),
  );
}

class SpeciesHome extends StatefulWidget {
  final ExplorerController controller;
  final AudioPlayback audio;
  const SpeciesHome({super.key, required this.controller, required this.audio});
  @override
  State<SpeciesHome> createState() => _SpeciesHomeState();
}

class _SpeciesHomeState extends State<SpeciesHome> {
  String _query = '';
  void _account() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.controller.viewingPublic
                    ? 'Öffentlicher Anfangsbestand'
                    : widget.controller.session!.user.displayName,
                style: Theme.of(sheet).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                widget.controller.viewingPublic
                    ? 'Mit der App gelieferte öffentliche Artinformationen. Dafür ist keine Projektanmeldung erforderlich.'
                    : 'Lesender Zugriff auf den gemeinsamen Artenbestand',
              ),
              const SizedBox(height: 8),
              if (widget.controller.session != null)
                SelectableText(widget.controller.session!.server.origin),
              const SizedBox(height: 20),
              if (widget.controller.viewingPublic &&
                  widget.controller.session == null)
                FilledButton(
                  onPressed: () {
                    Navigator.pop(sheet);
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            LoginPage(controller: widget.controller),
                      ),
                    );
                  },
                  child: const Text('Mit gemeinsamem Projekt verbinden'),
                ),
              if (widget.controller.viewingPublic &&
                  widget.controller.session != null)
                FilledButton(
                  onPressed:
                      widget.controller.busy || widget.controller.downloading
                      ? null
                      : () async {
                          Navigator.pop(sheet);
                          await widget.controller.useProjectCatalog();
                        },
                  child: const Text('Gespeicherten Projektzugang verwenden'),
                ),
              if (!widget.controller.viewingPublic &&
                  widget.controller.publicCatalog != null)
                OutlinedButton(
                  onPressed:
                      widget.controller.busy || widget.controller.downloading
                      ? null
                      : () async {
                          Navigator.pop(sheet);
                          await widget.audio.stop();
                          await widget.controller.usePublicCatalog();
                        },
                  child: const Text('Öffentlichen Anfangsbestand ansehen'),
                ),
              if (widget.controller.session != null)
                OutlinedButton(
                  onPressed:
                      widget.controller.busy || widget.controller.downloading
                      ? null
                      : () async {
                          Navigator.pop(sheet);
                          await widget.audio.stop();
                          await widget.controller.logout();
                        },
                  child: const Text('Abmelden'),
                ),
              TextButton(
                onPressed: () => showLicensePage(
                  context: sheet,
                  applicationName: 'Arten-Explorer',
                  applicationVersion: '0.1.2',
                ),
                child: const Text('Lizenzen'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final species = controller.catalog?.search(_query) ?? <Species>[];
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            brand(size: 36),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Arten-Explorer',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: controller.viewingPublic
                ? 'Hinweis zum öffentlichen Anfangsbestand'
                : 'Inhalte aktualisieren',
            onPressed: controller.busy || controller.downloading
                ? null
                : controller.refresh,
            icon: Icon(
              controller.viewingPublic ? Icons.info_outline : Icons.refresh,
            ),
          ),
          IconButton(
            tooltip: controller.viewingPublic
                ? 'Mit Projekt verbinden'
                : 'Anmeldung',
            onPressed: _account,
            icon: const Icon(Icons.person_outline),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (controller.busy) const LinearProgressIndicator(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (controller.status.isNotEmpty)
                    Text(
                      controller.status,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  if (controller.error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Notice(controller.error, error: true),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    onChanged: (value) => setState(() => _query = value),
                    decoration: const InputDecoration(
                      hintText: 'Arten suchen',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      '${species.length} ${species.length == 1 ? 'Art' : 'Arten'}',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: species.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          controller.catalog == null
                              ? 'Noch kein Artenbestand geladen. Mit dem Projektdienst verbinden und Inhalte aktualisieren.'
                              : controller.catalog!.species.isEmpty
                              ? 'Im gemeinsamen Projekt sind noch keine Arten für die App freigegeben.'
                              : 'Keine passende Art gefunden.',
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: species.length,
                      itemBuilder: (context, index) {
                        final entry = species[index];
                        return Card(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 4,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => SpeciesPage(
                                  species: entry,
                                  controller: controller,
                                  audio: widget.audio,
                                ),
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  if (entry.portrait != null)
                                    SizedBox(
                                      width: 68,
                                      height: 68,
                                      child: MediaImage(
                                        controller: controller,
                                        species: entry,
                                        media: entry.portrait!,
                                        kind: MediaKind.portrait,
                                        compact: true,
                                      ),
                                    )
                                  else
                                    const SizedBox(
                                      width: 68,
                                      height: 68,
                                      child: Icon(Icons.eco_outlined, size: 32),
                                    ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          entry.displayName,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium,
                                        ),
                                        if (entry.commonName.isNotEmpty)
                                          Text(
                                            entry.scientificName,
                                            style: const TextStyle(
                                              fontStyle: FontStyle.italic,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.chevron_right),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (controller.downloading) const LinearProgressIndicator(),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.offline_pin_outlined),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => OfflinePage(controller: controller),
                    ),
                  ),
                  label: Text(
                    controller.downloading
                        ? 'Offlinepaket wird geladen …'
                        : 'Offlineinhalte · ${formatBytes(controller.occupiedBytes)}',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
