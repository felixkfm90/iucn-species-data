import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_controller.dart';
import 'audio_playback.dart';
import 'data/project_api.dart';
import 'domain/catalog.dart';
import 'ui/offline_page.dart';
import 'ui/species_list.dart';
import 'ui/species_page.dart';
import 'ui/species_regions.dart';

class ExplorerApp extends StatefulWidget {
  final ExplorerController controller;
  final AudioPlayback audio;
  const ExplorerApp({super.key, required this.controller, required this.audio});
  @override
  State<ExplorerApp> createState() => _ExplorerAppState();
}

class _ExplorerAppState extends State<ExplorerApp> with WidgetsBindingObserver {
  final _navigator = GlobalKey<NavigatorState>();
  late bool _wasLoggedIn;
  bool _checkingMobilePause = false;
  String? _askedForMobile;
  @override
  void initState() {
    super.initState();
    _wasLoggedIn = widget.controller.loggedIn;
    widget.controller.addListener(_authChanged);
    WidgetsBinding.instance.addObserver(this);
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
    unawaited(_offerMobileContinuation());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_offerMobileContinuation());
      unawaited(widget.controller.refreshPublicCatalog(automatic: true));
    }
  }

  Future<void> _offerMobileContinuation() async {
    final controller = widget.controller;
    final task = controller.downloadTask;
    if (task?.status == 'running' && _askedForMobile == task?.jobId) {
      _askedForMobile = null;
    }
    if (_checkingMobilePause ||
        controller.busy ||
        task == null ||
        task.status != 'paused' ||
        task.automatic ||
        task.allowMetered ||
        _askedForMobile == task.jobId ||
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      return;
    }
    _checkingMobilePause = true;
    try {
      final network = await controller.downloadNetwork();
      final navigator = _navigator.currentState;
      final current = controller.downloadTask;
      if (!mounted ||
          navigator == null ||
          !network.connected ||
          !network.metered ||
          current?.jobId != task.jobId ||
          current?.status != 'paused' ||
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      _askedForMobile = task.jobId;
      final allow = await showDialog<bool>(
        context: navigator.overlay!.context,
        builder: (dialog) => AlertDialog(
          title: const Text('Mit mobilen Daten fortsetzen?'),
          content: const Text(
            'Das WLAN ist getrennt. Sobald WLAN wieder verfügbar ist, '
            'geht der Download automatisch weiter.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Auf WLAN warten'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Mobil fortsetzen'),
            ),
          ],
        ),
      );
      if (allow == true && mounted) {
        await controller.resumeDownload(
          allowMetered: true,
          expectedJobId: task.jobId,
        );
      }
    } on PlatformException {
      // The background job retains its original network policy.
    } finally {
      _checkingMobilePause = false;
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_authChanged);
    WidgetsBinding.instance.removeObserver(this);
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
  static const _scanner = MethodChannel(
    'de.fnwildlifetravel.arten_explorer/pairing',
  );
  final _form = GlobalKey<FormState>();
  final _server = TextEditingController(),
      _username = TextEditingController(),
      _password = TextEditingController();
  bool _obscure = true;
  bool _scanning = false;
  String _scanError = '';

  bool get _busy => _scanning || widget.controller.busy;

  Future<void> _scanPairing() async {
    if (_busy) return;
    setState(() {
      _scanning = true;
      _scanError = '';
    });
    try {
      final raw = await _scanner.invokeMethod<String>('scan');
      if (!mounted || raw == null) return;
      final invitation = ProjectPairingInvitation.parse(raw);
      final accepted = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Mit Projekt verbinden?'),
          content: Text(
            '${invitation.server.origin}\n\nDieses Handy erhält Lesezugriff.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Verbinden'),
            ),
          ],
        ),
      );
      if (!mounted || accepted != true) return;
      _password.clear();
      final signedIn = await widget.controller.redeemPairing(invitation);
      if (signedIn && mounted && Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
    } on FormatException catch (error) {
      if (mounted) setState(() => _scanError = error.message);
    } on PlatformException {
      if (mounted) {
        setState(
          () => _scanError = 'Der QR-Scanner ist gerade nicht verfügbar. Du kannst dich auch mit der Projektadresse anmelden.',
        );
      }
    } on MissingPluginException {
      if (mounted) {
        setState(
          () => _scanError = 'Auf diesem Gerät kannst du dich mit der Projektadresse anmelden.',
        );
      }
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    if (!_form.currentState!.validate()) return;
    setState(() => _scanError = '');
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
                    FilledButton.icon(
                      onPressed: _busy ? null : _scanPairing,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: Text(
                        _scanning
                            ? 'QR-Code wird geprüft …'
                            : 'QR-Code scannen',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _server,
                      enabled: !_busy,
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
                      enabled: !_busy,
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
                      enabled: !_busy,
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
                    if (_scanError.isNotEmpty ||
                        widget.controller.error.isNotEmpty)
                      Notice(
                        _scanError.isNotEmpty
                            ? _scanError
                            : widget.controller.error,
                        error: true,
                      ),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
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
  static const _allRegions = '';
  final _search = TextEditingController();
  String _query = '';
  String? _region;
  String? _group;
  (String, String, String)? _offeredOfflineUpdate;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _chooseRegion(String? region) {
    FocusScope.of(context).unfocus();
    _search.clear();
    setState(() {
      _region = region;
      _group = null;
      _query = '';
    });
  }

  void _offerOfflineUpdate(ExplorerController controller) {
    if (!controller.shouldOfferOfflineUpdate) return;
    final catalog = controller.catalog!, store = controller.store!;
    final key = (
      store.root.path,
      controller.offline!.catalog.revision,
      catalog.revision,
    );
    if (_offeredOfflineUpdate == key) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted ||
          _offeredOfflineUpdate == key ||
          !controller.shouldOfferOfflineUpdate ||
          !identical(controller.catalog, catalog) ||
          !identical(controller.store, store) ||
          ModalRoute.of(context)?.isCurrent != true) {
        return;
      }
      _offeredOfflineUpdate = key;
      final accepted = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Offlineinhalte aktualisieren?'),
          content: const Text(
            'Ein neuer Katalogstand ist verfügbar. Passende Dateien bleiben erhalten.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Später'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Aktualisieren'),
            ),
          ],
        ),
      );
      if (!mounted ||
          accepted != true ||
          !identical(controller.catalog, catalog) ||
          !identical(controller.store, store)) {
        return;
      }
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) =>
              OfflinePage(controller: controller, startUpdate: true),
        ),
      );
    });
  }

  void _information() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: AnimatedBuilder(
            animation: widget.controller,
            builder: (sheet, _) {
              final controller = widget.controller,
                  catalog = controller.catalog;
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Informationen',
                    style: Theme.of(sheet).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    controller.viewingPublic
                        ? 'Öffentliche FN-Artinformationen'
                        : 'Gemeinsamer FN-Bestand',
                  ),
                  if (catalog != null)
                    Text(
                      'Datenstand: ${MaterialLocalizations.of(sheet).formatMediumDate(catalog.generatedAt)}',
                    ),
                  if (controller.status.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(controller.status),
                    ),
                  if (controller.viewingPublic && controller.error.isNotEmpty)
                    Notice(controller.error, error: true),
                  const SizedBox(height: 16),
                  if (!controller.viewingPublic ||
                      controller.canRefreshPublicCatalog)
                    OutlinedButton.icon(
                      onPressed:
                          controller.busy ||
                              controller.downloading ||
                              controller.publicCatalogRefreshing
                          ? null
                          : controller.refresh,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Inhalte aktualisieren'),
                    ),
                  TextButton(
                    onPressed: () => showLicensePage(
                      context: sheet,
                      applicationName: 'Arten-Explorer',
                      applicationVersion: androidAppVersion,
                    ),
                    child: const Text('Software-Lizenzen'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  void _account() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.controller.viewingPublic
                    ? 'Öffentlicher Artenbestand'
                    : widget.controller.session!.user.displayName,
                style: Theme.of(sheet).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                widget.controller.viewingPublic
                    ? 'Öffentliche Artinformationen von FN Wildlife & Travel. Dafür ist keine Projektanmeldung erforderlich.'
                    : 'Lesender Zugriff auf den gemeinsamen Artenbestand',
              ),
              const SizedBox(height: 8),
              if (widget.controller.session != null)
                SelectableText(widget.controller.session!.server.origin),
              const SizedBox(height: 20),
              AnimatedBuilder(
                animation: widget.controller,
                builder: (_, _) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.offline_pin_outlined),
                  title: const Text('Offlineinhalte'),
                  subtitle: Text(
                    widget.controller.downloading
                        ? 'Download läuft · Fortschritt ansehen'
                        : '${formatBytes(widget.controller.occupiedBytes)} auf diesem Gerät',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.pop(sheet);
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            OfflinePage(controller: widget.controller),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              if (widget.controller.viewingPublic &&
                  widget.controller.session == null)
                FilledButton(
                  onPressed:
                      widget.controller.busy || widget.controller.downloading
                      ? null
                      : () {
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
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    _offerOfflineUpdate(controller);
    final catalog = controller.catalog;
    final regions = catalog?.regions ?? const <SpeciesGroup>[];
    final selectedRegion = regions
        .where((region) => region.id == _region)
        .firstOrNull;
    final regionId = selectedRegion?.id;
    final regionSelected = _region == _allRegions || selectedRegion != null;
    final searching = _query.trim().isNotEmpty;
    final showRegions = regions.isNotEmpty && !regionSelected && !searching;
    final groups = showRegions
        ? const <SpeciesGroup>[]
        : catalog?.groupsForRegion(regionId) ?? const <SpeciesGroup>[];
    final group = groups.any((group) => group.id == _group) ? _group : null;
    final species = showRegions
        ? const <Species>[]
        : catalog?.search(_query, groupId: group, regionId: regionId) ??
              const <Species>[];
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
            tooltip: 'Informationen',
            onPressed: _information,
            icon: const Icon(Icons.info_outline),
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
                  if (controller.error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Notice(controller.error, error: true),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _search,
                    onChanged: (value) => setState(() {
                      _query = value;
                      if (!regionSelected && value.trim().isEmpty) {
                        _group = null;
                      }
                    }),
                    decoration: const InputDecoration(
                      hintText: 'Arten suchen',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (regions.isNotEmpty && regionSelected)
                    Tooltip(
                      message: 'Region wechseln',
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.public),
                        title: Text(selectedRegion?.label ?? 'Alle Regionen'),
                        trailing: const Icon(Icons.swap_horiz),
                        onTap: () => _chooseRegion(null),
                      ),
                    ),
                  if (groups.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: DropdownButton<String>(
                        isExpanded: true,
                        value: group ?? '',
                        onChanged: (value) => setState(() => _group = value),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('Alle Tiergruppen'),
                          ),
                          for (final item in groups)
                            DropdownMenuItem(
                              value: item.id,
                              child: Text('${item.label} · ${item.count}'),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: showRegions
                  ? SpeciesRegions(
                      regions: regions,
                      speciesCount: catalog!.species.length,
                      onSelect: (id) => _chooseRegion(id ?? _allRegions),
                    )
                  : species.isEmpty
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
                  : SpeciesList(
                      key: ValueKey((regionId, group)),
                      controller: controller,
                      species: species,
                      byFamily: group != null,
                      searching: searching,
                      onOpen: (entry) => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => SpeciesPage(
                            species: entry,
                            controller: controller,
                            audio: widget.audio,
                          ),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: controller.downloading
          ? SafeArea(
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
            )
          : null,
    );
  }
}
