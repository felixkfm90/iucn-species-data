import 'package:flutter/material.dart';

import '../app.dart';
import '../app_controller.dart';
import '../domain/catalog.dart';
import '../data/website_photo.dart';

class OfflinePage extends StatefulWidget {
  final ExplorerController controller;
  const OfflinePage({super.key, required this.controller});
  @override
  State<OfflinePage> createState() => _OfflinePageState();
}

class _OfflinePageState extends State<OfflinePage> {
  late OfflineSelection _selection;
  @override
  void initState() {
    super.initState();
    _selection =
        widget.controller.offline?.selection ?? const OfflineSelection();
  }

  void _change(String field, bool enabled) => setState(
    () => _selection = OfflineSelection(
      texts: field == 'texts' ? enabled : _selection.texts,
      portraits: field == 'portraits' ? enabled : _selection.portraits,
      maps: field == 'maps' ? enabled : _selection.maps,
      sounds: field == 'sounds' ? enabled : _selection.sounds,
      gallery: field == 'gallery' ? enabled : _selection.gallery,
    ),
  );
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) {
      final controller = widget.controller, catalog = controller.catalog;
      final media = catalog == null
          ? <MediaReference>[]
          : _selection.select(catalog);
      final missingHash = media
          .where((entry) => entry.media.sha256 == null && !WebsitePhotoPolicy.canObserve(entry))
          .length;
      final observedPhotos=media.where(WebsitePhotoPolicy.canObserve).length;
      final knownBytes = media
          .where((entry) => entry.media.bytes != null)
          .fold<int>(0, (sum, entry) => sum + entry.media.bytes!);
      final unknownSize = media
          .where((entry) => entry.media.bytes == null)
          .length;
      final progress = controller.progress;
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
        final size = entries.every((entry) => entry.media.bytes != null)
            ? formatBytes(
                entries.fold<int>(0, (sum, entry) => sum + entry.media.bytes!),
              )
            : 'Größe teilweise unbekannt';
        return CheckboxListTile(
          value: field == 'texts' && controller.viewingPublic ? true : value,
          onChanged:
              controller.downloading ||
                  controller.busy ||
                  field == 'texts' && controller.viewingPublic
              ? null
              : (value) => _change(field, value!),
          title: Text(title),
          subtitle: Text(subtitle ?? '${entries.length} Dateien · $size'),
          contentPadding: EdgeInsets.zero,
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
              Text(
                controller.viewingPublic
                    ? 'Arttexte und Taxonomie sind bereits mit der App verfügbar. Wähle zusätzliche Medien für die Verwendung ohne Verbindung.'
                    : 'Die Artenliste bleibt auf dem Gerät. Wähle die zusätzlichen Inhalte, die ohne Verbindung verfügbar sein sollen.',
              ),
              const SizedBox(height: 12),
              if (controller.offline != null)
                Notice(
                  controller.offline!.healthy
                      ? controller.packageIsCurrent
                            ? 'Offlinepaket geprüft · aktueller Katalog'
                            : 'Offlinepaket geprüft · älterer Katalog. Für neue Inhalte erneut laden.'
                      : '${controller.offline!.missingFiles.length} Offlinedateien fehlen oder sind beschädigt.',
                  error: !controller.offline!.healthy,
                ),
              OutlinedButton(
                onPressed: controller.downloading || catalog == null
                    ? null
                    : () => setState(
                        () => _selection =
                            const OfflineSelection.withoutWebsitePhotos(),
                      ),
                child: const Text('Alles ohne Websitefotos auswählen'),
              ),
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
                'Tonaufnahmen',
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
                'Zusätzliche Websitefotos',
                _selection.gallery,
                kind: MediaKind.gallery,
              ),
              const Divider(),
              Text(
                '${media.length} Mediendateien · ${formatBytes(knownBytes)}${unknownSize == 0 ? '' : ' + $unknownSize mit unbekannter Größe'}',
              ),
              Text(
                'Bereits auf dem Gerät: ${formatBytes(controller.occupiedBytes)}',
              ),
              const SizedBox(height: 8),
              const Text(
                'Beim Laden wird kurz zusätzlicher Speicher benötigt. Der vorherige Paketstand bleibt bis zum vollständigen Abschluss erhalten.',
              ),
              if(observedPhotos>0) Padding(padding:const EdgeInsets.only(top:12),child:Text(
                '$observedPhotos Websitefotos werden als öffentlich sichtbare Fassung vom Downloadzeitpunkt gespeichert. Sie können sich später auf der Website ändern.')),
              if((controller.offline?.observedPhotoCount ?? 0)>0)
                Padding(padding:const EdgeInsets.only(top:8),child:Text('${controller.offline!.observedPhotoCount} gespeicherte Websitefassungen · Dateien auf diesem Gerät geprüft')),
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
                  progress == null
                      ? 'Download wird vorbereitet …'
                      : '${progress.message} · ${progress.completeFiles}/${progress.totalFiles} Dateien · ${formatBytes(progress.receivedBytes)}',
                ),
                TextButton(
                  onPressed: controller.cancelDownload,
                  child: const Text('Download abbrechen'),
                ),
              ] else
                FilledButton.icon(
                  onPressed:
                      catalog == null || controller.busy || missingHash > 0
                      ? null
                      : () => controller.download(_selection),
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('Auswahl laden und prüfen'),
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
