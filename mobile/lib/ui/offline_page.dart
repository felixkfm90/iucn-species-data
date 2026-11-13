import 'package:flutter/material.dart';

import '../app.dart';
import '../app_controller.dart';
import '../domain/catalog.dart';
import '../data/website_photo.dart';
import '../data/offline_estimate.dart';

class OfflinePage extends StatefulWidget {
  final ExplorerController controller;
  final bool startUpdate;
  const OfflinePage({
    super.key,
    required this.controller,
    this.startUpdate = false,
  });
  @override
  State<OfflinePage> createState() => _OfflinePageState();
}

class _OfflinePageState extends State<OfflinePage> {
  OfflineSelection? _draft;
  OfflineSelection get _selection =>
      widget.controller.activeDownloadJob?.selection ??
      _draft ??
      widget.controller.offline?.selection ??
      const OfflineSelection();
  late final _photoSizes = Map<String, int>.of(
    widget.controller.bundledPhotoSizes,
  );
  int _estimateGeneration = 0;
  bool _estimating = false, _starting = false;
  @override
  void initState() {
    super.initState();
    if (widget.startUpdate) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.controller.shouldOfferOfflineUpdate) {
          _startDownload();
        }
      });
    }
    Future.microtask(_estimatePhotos);
  }

  Future<void> _estimatePhotos() async {
    final catalog = widget.controller.catalog;
    final generation = ++_estimateGeneration;
    final photos = widget.controller.offlineInventory?[MediaKind.gallery];
    if (catalog == null ||
        widget.controller.downloading ||
        !mounted ||
        (photos != null &&
            photos.verifiedFiles > 0 &&
            photos.missingFiles == 0)) {
      return;
    }
    final missing = catalog.species
        .expand((entry) => entry.media)
        .any(
          (entry) =>
              WebsitePhotoPolicy.canObserve(entry) &&
              !_photoSizes.containsKey(
                WebsitePhotoPolicy.offlineUrl(entry.media.url!).toString(),
              ),
        );
    if (!missing) return;
    final network = await widget.controller.downloadNetwork();
    if (!mounted || !network.connected || network.metered) return;
    setState(() => _estimating = true);
    await estimateWebsitePhotos(
      catalog,
      widget.controller.transport,
      _photoSizes,
      cancelled: () => !mounted || generation != _estimateGeneration,
      onProgress: (_, _) {},
    );
    if (mounted && generation == _estimateGeneration) {
      setState(() => _estimating = false);
    }
  }

  @override
  void dispose() {
    _estimateGeneration++;
    super.dispose();
  }

  Future<void> _startDownload() async {
    if (_starting) return;
    setState(() => _starting = true);
    final controller = widget.controller, catalog = widget.controller.catalog;
    final selection = _selection;
    try {
      if (catalog == null) return;
      if (controller.hasCurrentOfflineSelection(selection)) {
        await controller.download(selection);
        if (mounted && controller.error.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Offlineinhalte geprüft.')),
          );
        }
        return;
      }
      final wanted = selection
          .select(catalog)
          .map((entry) => entry.key)
          .toSet();
      final removed =
          controller.offline?.verifiedFiles.keys
              .where((key) => !wanted.contains(key))
              .length ??
          0;
      if (removed > 0) {
        final accepted = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Offlineauswahl ändern?'),
            content: Text(
              '$removed bisher gespeicherte Inhalte sind abgewählt. Sie werden erst nach dem erfolgreichen Abschluss dieser neuen Auswahl entfernt.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Zurück'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Auswahl anwenden'),
              ),
            ],
          ),
        );
        if (accepted != true || !mounted) return;
      }
      final network = await controller.downloadNetwork();
      if (!mounted) return;
      var allowMetered = controller.offlineSettings.allowMetered;
      final estimate = OfflineEstimate.selection(
        catalog,
        selection,
        _photoSizes,
        alreadyAvailable: {
          ...?controller.offlineInventory?.verifiedKeys,
          ...?controller.offlineInventory?.resumableKeys,
        },
      );
      if (network.connected && network.metered && !allowMetered) {
        final choice = await showDialog<String>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Mobile oder begrenzte Datenverbindung'),
            content: Text(
              'Noch zu laden: ${formatBytes(estimate.knownBytes)}${estimate.unknownFiles > 0 ? ' und ${estimate.unknownFiles} Dateien mit noch unbekannter Größe' : ''}. Für größere Downloads empfehlen wir WLAN.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Zurück'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, 'wifi'),
                child: const Text('Auf WLAN warten'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, 'metered'),
                child: const Text('Jetzt laden'),
              ),
            ],
          ),
        );
        if (choice == null || !mounted) return;
        allowMetered = choice == 'metered';
      }
      // A dialog result cannot authorize an accidentally changed catalog or selection.
      if (!identical(catalog, controller.catalog) ||
          !identical(selection, _selection)) {
        return;
      }
      await controller.download(
        selection,
        allowMetered: allowMetered,
        photoSizes: _photoSizes,
      );
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  void _change(String field, bool enabled) {
    setState(
      () => _draft = OfflineSelection(
        texts: field == 'texts' ? enabled : _selection.texts,
        portraits: field == 'portraits' ? enabled : _selection.portraits,
        maps: field == 'maps' ? enabled : _selection.maps,
        sounds: field == 'sounds' ? enabled : _selection.sounds,
        gallery: field == 'gallery' ? enabled : _selection.gallery,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) {
      final controller = widget.controller;
      final catalog =
          controller.activeDownloadJob?.catalog ?? controller.catalog;
      final paused = controller.downloadTask?.status == 'paused';
      final showResumable = !controller.downloading || paused;
      final canVerify =
          !controller.downloading &&
          controller.hasCurrentOfflineSelection(_selection);
      final media = catalog == null
          ? <MediaReference>[]
          : _selection.select(catalog);
      final missingHash = media
          .where(
            (entry) =>
                entry.media.sha256 == null &&
                !WebsitePhotoPolicy.canObserve(entry),
          )
          .length;
      final estimate = catalog == null
          ? const OfflineEstimate(0, 0)
          : OfflineEstimate.selection(catalog, _selection, _photoSizes);
      final inventory = controller.offlineInventory;
      final progress = controller.progress;
      final verifiedSelected = media
          .where((entry) => inventory?.verifiedKeys.contains(entry.key) == true)
          .length;
      final resumableSelected = media
          .where(
            (entry) => inventory?.resumableKeys.contains(entry.key) == true,
          )
          .length;
      final remaining = !paused && progress != null && progress.totalFiles > 0
          ? progress.totalFiles - progress.completeFiles
          : null;
      final prepared = remaining == null
          ? resumableSelected
          : (media.length - verifiedSelected - remaining).clamp(
              0,
              media.length,
            );
      final disableSettings =
          controller.savingOfflineSettings ||
          controller.downloading ||
          controller.busy ||
          _starting;
      Widget choice(
        String field,
        String title,
        bool value, {
        MediaKind? kind,
        String? subtitle,
      }) {
        final entries = kind == null || catalog == null
            ? <MediaReference>[]
            : catalog.species
                  .expand((entry) => entry.media)
                  .where((entry) => entry.kind == kind)
                  .toList();
        final category = kind == null ? null : inventory?.categories[kind];
        final photoLengths = entries
            .map(
              (entry) => WebsitePhotoPolicy.canObserve(entry)
                  ? _photoSizes[WebsitePhotoPolicy.offlineUrl(entry.media.url!)
                        .toString()]
                  : entry.media.bytes,
            )
            .toList();
        final size = photoLengths.every((length) => length != null)
            ? formatBytes(
                photoLengths.fold<int>(0, (sum, length) => sum + length!),
              )
            : null;
        final photos = kind == MediaKind.gallery;
        final spectrograms = kind == MediaKind.sound
            ? entries
                  .where((entry) => entry.media.mimeType == 'image/webp')
                  .toList()
            : <MediaReference>[];
        final recordings = entries.length - spectrograms.length;
        final soundFiles = kind == MediaKind.sound;
        final storedPhotoSize =
            photos &&
                category != null &&
                category.totalFiles == entries.length &&
                category.missingFiles == 0 &&
                category.verifiedFiles > 0
            ? formatBytes(category.storedBytes)
            : null;
        final description = [
          if (soundFiles)
            '$recordings ${recordings == 1 ? 'Aufnahme' : 'Aufnahmen'}'
          else
            '${entries.length} ${photos ? 'Fotos' : 'Dateien'}',
          if (spectrograms.isNotEmpty)
            '${spectrograms.length} ${spectrograms.length == 1 ? 'Spektrogramm' : 'Spektrogramme'}',
          if (storedPhotoSize != null)
            '$storedPhotoSize auf dem Gerät'
          else if (size != null)
            photos ? 'ca. $size' : size
          else if (photos && entries.isNotEmpty && _estimating)
            'Größe wird ermittelt …',
        ].join(' · ');
        final loading =
            !showResumable &&
            value &&
            (category == null || category.missingFiles > 0);
        final verifiedSpectrograms = spectrograms
            .where(
              (entry) => inventory?.verifiedKeys.contains(entry.key) == true,
            )
            .length;
        final soundState =
            category != null &&
                category.missingFiles > 0 &&
                spectrograms.isNotEmpty
            ? '${category.verifiedFiles - verifiedSpectrograms}/$recordings Aufnahmen · $verifiedSpectrograms/${spectrograms.length} Spektrogramme offline'
            : null;
        final available =
            soundState ??
            (loading
                ? 'Wird geladen'
                : category == null || category.verifiedFiles == 0
                ? 'Noch nicht heruntergeladen'
                : category.missingFiles == 0
                ? 'Vollständig verfügbar'
                : '${category.verifiedFiles}/${category.totalFiles} verfügbar');
        final resumable = showResumable ? category?.resumableFiles ?? 0 : 0;
        final state = category == null && !loading
            ? ''
            : '\n$available${resumable == 0 ? '' : ' · $resumable zum Fortsetzen'}';
        final tile = CheckboxListTile(
          value: field == 'texts' && controller.viewingPublic ? true : value,
          onChanged:
              controller.downloading ||
                  _starting ||
                  controller.busy ||
                  field == 'texts' && controller.viewingPublic
              ? null
              : (value) => _change(field, value!),
          title: Text(title),
          subtitle: Text(subtitle ?? '$description$state'),
          contentPadding: EdgeInsets.zero,
        );
        final saved = controller.offline;
        if (kind == null ||
            value ||
            saved == null ||
            !saved.selection.includes(kind) ||
            !saved.selection
                .select(saved.catalog)
                .any(
                  (entry) =>
                      entry.kind == kind &&
                      saved.verifiedFiles.containsKey(entry.key),
                )) {
          return tile;
        }
        return Row(
          children: [
            Expanded(child: tile),
            IconButton(
              color: Theme.of(context).colorScheme.error,
              icon: const Icon(Icons.delete_outline),
              tooltip: '$title von diesem Gerät entfernen',
              onPressed: controller.downloading || controller.busy || _starting
                  ? null
                  : () async {
                      if (!await controller.removeOfflineCategory(kind) ||
                          !context.mounted) {
                        return;
                      }
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('$title von diesem Gerät entfernt.'),
                        ),
                      );
                    },
            ),
          ],
        );
      }

      return Scaffold(
        appBar: AppBar(title: const Text('Offlineinhalte')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Unterwegs nachschlagen',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Download über mobile Daten erlauben'),
                value: controller.offlineSettings.allowMetered,
                onChanged: disableSettings
                    ? null
                    : (value) =>
                          controller.saveOfflineSettings(allowMetered: value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Daten automatisch aktualisieren'),
                subtitle: const Text(
                  'Lädt Änderungen für deine gespeicherte Offlineauswahl.',
                ),
                value: controller.offlineSettings.autoUpdate,
                onChanged: disableSettings
                    ? null
                    : (value) =>
                          controller.saveOfflineSettings(autoUpdate: value),
              ),
              const SizedBox(height: 12),
              Text(
                controller.viewingPublic
                    ? 'Arttexte und Taxonomie sind bereits mit der App verfügbar. Wähle zusätzliche Medien für die Verwendung ohne Verbindung.'
                    : 'Die Artenliste bleibt auf dem Gerät. Wähle die zusätzlichen Inhalte, die ohne Verbindung verfügbar sein sollen.',
              ),
              const SizedBox(height: 12),
              const Text(
                'Die Haken legen fest, was offline verfügbar sein soll. Beim Abwählen wird noch nichts gelöscht.',
              ),
              if (controller.offline != null) ...[
                const SizedBox(height: 12),
                Notice(
                  controller.offline!.healthy
                      ? controller.hasCurrentOfflineSelection(
                              controller.offline!.selection,
                            )
                            ? 'Offlinepaket geprüft · aktueller Katalog'
                            : 'Offlinepaket geprüft · neuer Katalog verfügbar.'
                      : '${controller.offline!.missingFiles.length} Offlinedateien fehlen oder sind beschädigt.',
                  error: !controller.offline!.healthy,
                ),
              ],
              choice(
                'texts',
                'Arttexte und Taxonomie',
                _selection.texts,
                subtitle: controller.viewingPublic
                    ? 'Bereits mitgeliefert · ${catalog?.species.length ?? 0} angelegte Arten'
                    : '${catalog?.species.length ?? 0} angelegte Arten · gegliederte Texte',
              ),
              choice(
                'maps',
                'Verbreitungskarten',
                _selection.maps,
                kind: MediaKind.map,
              ),
              choice(
                'sounds',
                'Tierstimmen',
                _selection.sounds,
                kind: MediaKind.sound,
              ),
              choice(
                'portraits',
                'Artbilder',
                _selection.portraits,
                kind: MediaKind.portrait,
              ),
              choice(
                'gallery',
                'Fotopaket',
                _selection.gallery,
                kind: MediaKind.gallery,
              ),
              const Divider(),
              Text(
                '${controller.downloading ? 'Downloadauswahl' : 'Ausgewählt'}: ${media.length} Dateien${estimate.unknownFiles == 0 && !controller.downloading ? ' · ca. ${formatBytes(estimate.knownBytes)}' : ''}',
              ),
              if (inventory != null)
                Text(
                  'Im nutzbaren Offlinepaket: $verifiedSelected von ${media.length} ausgewählten Dateien',
                ),
              if (prepared > 0)
                Text(
                  showResumable
                      ? 'Für die Fortsetzung gespeichert: $prepared Dateien'
                      : 'Zusätzlich für dieses Paket vorbereitet: $prepared Dateien',
                ),
              Text(
                '${controller.downloading ? 'Zuletzt gemessener Offline-Speicher' : 'Offline-Speicher belegt'}: ${formatBytes(inventory?.appDataBytes ?? controller.occupiedBytes)}',
              ),
              const SizedBox(height: 8),
              const Text(
                'Beim Laden wird kurz zusätzlicher Speicher benötigt. Der vorherige Paketstand bleibt bis zum vollständigen Abschluss erhalten.',
              ),
              if (missingHash > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Notice(
                    'Für $missingHash ausgewählte Dateien fehlt eine Katalogprüfsumme oder eine bekannte öffentliche Galeriequelle.',
                    error: true,
                  ),
                ),
              if (controller.error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Notice(controller.error, error: true),
                ),
              const SizedBox(height: 16),
              if (controller.downloading) ...[
                LinearProgressIndicator(
                  value: progress == null || progress.totalFiles == 0
                      ? null
                      : progress.completeFiles / progress.totalFiles,
                ),
                const SizedBox(height: 8),
                Text(
                  paused || controller.downloadTask?.status == 'queued'
                      ? controller.downloadTask!.message
                      : progress == null
                      ? 'Download wird vorbereitet …'
                      : progress.totalFiles == 0
                      ? progress.message
                      : 'Neu geladen: ${progress.completeFiles} · Noch zu laden: ${progress.totalFiles - progress.completeFiles} · ${formatBytes(progress.receivedBytes)}',
                ),
                TextButton(
                  onPressed: controller.cancelDownload,
                  child: const Text('Download abbrechen'),
                ),
                if (paused)
                  OutlinedButton(
                    onPressed: controller.busy
                        ? null
                        : () async {
                            final network = await controller.downloadNetwork();
                            if (!context.mounted) return;
                            // Resuming never silently broadens the original Wi-Fi permission.
                            if (network.metered) {
                              final allow = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text(
                                    'Mit mobilen Daten fortsetzen?',
                                  ),
                                  content: const Text(
                                    'Der noch offene Download kann größere Datenmengen übertragen.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.pop(context, false),
                                      child: const Text('Zurück'),
                                    ),
                                    FilledButton(
                                      onPressed: () =>
                                          Navigator.pop(context, true),
                                      child: const Text('Fortsetzen'),
                                    ),
                                  ],
                                ),
                              );
                              if (allow != true || !mounted) return;
                              await controller.resumeDownload(
                                allowMetered: true,
                              );
                            } else {
                              await controller.resumeDownload();
                            }
                          },
                    child: const Text('Download fortsetzen'),
                  ),
              ] else
                FilledButton.icon(
                  onPressed:
                      catalog == null ||
                          controller.busy ||
                          _starting ||
                          (!canVerify && missingHash > 0)
                      ? null
                      : _startDownload,
                  icon: Icon(
                    canVerify
                        ? Icons.check_circle_outline
                        : Icons.download_outlined,
                  ),
                  label: Text(
                    canVerify
                        ? _starting
                              ? 'Offlineinhalte werden geprüft …'
                              : 'Offlineinhalte prüfen'
                        : (inventory?.resumableFiles ?? 0) > 0
                        ? 'Auswahl fortsetzen'
                        : 'Auswahl laden und prüfen',
                  ),
                ),
              if (!controller.downloading && controller.offline != null)
                TextButton(
                  onPressed: () async {
                    final remove = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Offlineinhalte entfernen?'),
                        content: const Text(
                          'Die gespeicherten Zusatzinhalte werden von diesem Gerät entfernt. Der gemeinsame Projektbestand bleibt erhalten.',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Behalten'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Entfernen'),
                          ),
                        ],
                      ),
                    );
                    if (remove == true) await controller.removeOffline();
                  },
                  child: const Text('Offlineinhalte entfernen'),
                ),
            ],
          ),
        ),
      );
    },
  );
}
