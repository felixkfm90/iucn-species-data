import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import 'data/offline_store.dart';
import 'data/project_api.dart';
import 'data/token_vault.dart';
import 'domain/catalog.dart';

class ExplorerController extends ChangeNotifier {
  final TokenVault vault;
  final ProjectTransport transport;
  final Directory supportDirectory;
  final Catalog? publicCatalog;
  ProjectSession? session;
  Catalog? catalog;
  OfflineStore? store;
  OfflineSnapshot? offline;
  bool initializing = true,
      busy = false,
      downloading = false,
      lastRefreshSucceeded = false;
  bool detailsAvailable = false, _cancelDownload = false, _disposed = false;
  bool viewingPublic = false;
  String status = '', error = '';
  int occupiedBytes = 0;
  OfflineProgress? progress;
  ExplorerController({
    required this.vault,
    required this.transport,
    required this.supportDirectory,
    this.publicCatalog,
  });
  bool get loggedIn => session != null;
  bool get packageIsCurrent =>
      offline != null && offline!.catalog.revision == catalog?.revision;
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  String _message(Object failure) {
    if (failure is FormatException) return failure.message;
    if (failure is ProjectApiException || failure is DownloadCancelled) {
      return failure.toString();
    }
    if (failure is SocketException ||
        failure is TimeoutException ||
        failure is HandshakeException) {
      return 'Keine sichere Verbindung. Der letzte geladene Bestand bleibt erhalten.';
    }
    if (failure is FileSystemException) {
      return 'Die Daten konnten auf diesem Gerät nicht vollständig gelesen oder gespeichert werden.';
    }
    return 'Der Vorgang wurde nicht abgeschlossen. Bitte erneut versuchen.';
  }

  Future<void> _bindStore(ProjectSession value) async {
    viewingPublic = false;
    catalog = null;
    offline = null;
    detailsAvailable = false;
    occupiedBytes = 0;
    final key = OfflineStore.projectKey(
      value.server,
      value.user.id,
      projectId: value.projectId,
    );
    store = OfflineStore(
      Directory('${supportDirectory.path}/projects/$key'),
      transport,
    );
    try {
      offline = await store!.readPackage();
      catalog = offline?.catalog ?? await store!.readIndex();
      detailsAvailable = offline?.selection.texts ?? false;
      occupiedBytes = await store!.occupiedBytes();
      if (offline != null && !offline!.healthy) {
        error =
            '${offline!.missingFiles.length} Offlinedateien fehlen oder sind beschädigt. Bitte das Paket neu laden.';
      }
    } catch (failure) {
      error = _message(failure);
    }
  }

  Future<void> usePublicCatalog({bool notify = true}) async {
    if (publicCatalog == null || busy || downloading) return;
    error = '';
    viewingPublic = true;
    catalog = publicCatalog;
    detailsAvailable = true;
    offline = null;
    occupiedBytes = 0;
    store = OfflineStore(
      Directory('${supportDirectory.path}/public-catalog'),
      transport,
    );
    status =
        'Mitgelieferte öffentliche Daten · ${_date(publicCatalog!.generatedAt)}';
    lastRefreshSucceeded = false;
    try {
      offline = await store!.readPackage();
      occupiedBytes = await store!.occupiedBytes();
      if (offline != null && !offline!.healthy) {
        error =
            '${offline!.missingFiles.length} öffentliche Offlinedateien fehlen oder sind beschädigt.';
      }
    } catch (failure) {
      error = _message(failure);
    }
    if (notify) _changed();
  }

  Future<void> useProjectCatalog() async {
    if (session == null || busy || downloading) return;
    error = '';
    await _bindStore(session!);
    status = 'Gespeicherter Projektbestand · Verbindung wird geprüft';
    _changed();
    await refresh();
  }

  Future<void> restore() async {
    await usePublicCatalog(notify: false);
    try {
      final saved = await vault.read();
      if (saved != null && saved.mayReadOffline) {
        session = saved;
        await _bindStore(saved);
        if (catalog != null) {
          status = 'Gespeicherter Bestand · ${_date(catalog!.generatedAt)}';
        }
      } else if (saved != null) {
        await vault.clear();
        error = 'Die Gerätezulassung ist abgelaufen. Bitte erneut anmelden.';
      }
    } catch (_) {
      error = 'Die geschützte Anmeldung konnte nicht gelesen werden. Bitte erneut anmelden.';
    } finally {
      initializing = false;
      _changed();
    }
    if (session != null) await refresh();
  }

  Future<bool> login(String server, String username, String password) async {
    if (busy) return false;
    busy = true;
    error = '';
    _changed();
    try {
      final api = ProjectApi(normalizeServer(server), transport);
      final next = await api.login(username, password);
      if (!next.mayReadOffline) {
        throw const FormatException(
          'Die Anmeldung liefert keine gültige Sitzungsdauer.',
        );
      }
      await vault.write(next);
      session = next;
      await _bindStore(next);
      status = 'Angemeldet. Inhalte werden geladen.';
    } catch (failure) {
      error = _message(failure);
      return false;
    } finally {
      busy = false;
      _changed();
    }
    await refresh();
    return true;
  }

  Future<void> refresh() async {
    if (viewingPublic) {
      status =
          'Mitgelieferte öffentliche Daten · ${_date(publicCatalog!.generatedAt)} · neue Anfangsdaten kommen mit einer App-Aktualisierung';
      _changed();
      return;
    }
    if (session == null || busy || downloading) return;
    busy = true;
    error = '';
    lastRefreshSucceeded = false;
    _changed();
    try {
      final api = ProjectApi(session!.server, transport);
      if (session!.expiresAt.isBefore(
        DateTime.now().add(const Duration(minutes: 1)),
      )) {
        session = await api.refresh(session!);
        await vault.write(session!);
      }
      Catalog updated;
      try {
        updated = await api.catalog(session!);
      } on ProjectApiException catch (failure) {
        if (failure.status != 401 || session!.deviceToken == null) rethrow;
        session = await api.refresh(session!);
        await vault.write(session!);
        updated = await api.catalog(session!);
      }
      await store!.saveIndex(updated);
      catalog = updated;
      detailsAvailable = true;
      lastRefreshSucceeded = true;
      status = 'Inhalte aktualisiert · ${_date(updated.generatedAt)}';
    } catch (failure) {
      if (failure is ProjectApiException && failure.requiresLogin) {
        await vault.clear();
        session = null;
        catalog = null;
        offline = null;
        store = null;
        // Only explicitly public packaged content may be shown after authorization is withdrawn.
        if (publicCatalog != null) {
          busy = false;
          await usePublicCatalog(notify: false);
          busy = true;
        }
      }
      error = _message(failure);
      if (!viewingPublic) {
        status = catalog == null
            ? 'Noch keine Inhalte geladen.'
            : 'Gespeicherter Bestand · Aktualisierung nicht bestätigt';
      }
    } finally {
      busy = false;
      _changed();
    }
  }

  Future<void> download(OfflineSelection selection) async {
    if (catalog == null || store == null || downloading || busy) return;
    if (selection.texts && !detailsAvailable) {
      error = 'Die Arttexte müssen zuerst über „Inhalte aktualisieren“ geladen werden.';
      _changed();
      return;
    }
    downloading = true;
    _cancelDownload = false;
    progress = null;
    error = '';
    _changed();
    try {
      offline = await store!.download(
        catalog!,
        selection,
        onProgress: (value) {
          progress = value;
          _changed();
        },
        cancelled: () => _cancelDownload,
      );
      occupiedBytes = await store!.occupiedBytes();
      status = offline!.observedPhotoCount==0 ? 'Offlineauswahl vollständig geladen und geprüft.'
        : 'Offlineauswahl geprüft · ${offline!.observedPhotoCount} öffentliche Websitefassungen gespeichert.';
    } catch (failure) {
      error = _message(failure);
    } finally {
      try {
        occupiedBytes = await store!.occupiedBytes();
      } catch (_) {
        /* Keep the last confirmed size. */
      }
      downloading = false;
      progress = null;
      _changed();
    }
  }

  void cancelDownload() {
    _cancelDownload = true;
    if (progress != null) {
      progress = OfflineProgress(
        progress!.completeFiles,
        progress!.totalFiles,
        progress!.receivedBytes,
        progress!.totalBytes,
        'Download wird beendet …',
      );
    }
    _changed();
  }

  Future<void> removeOffline() async {
    if (downloading || store == null) return;
    try {
      await store!.removePackage();
      offline = null;
      occupiedBytes = await store!.occupiedBytes();
      status = viewingPublic
          ? 'Zusätzliche Mediendownloads entfernt. Der mitgelieferte öffentliche Bestand bleibt verfügbar.'
          : 'Zusätzliche Offlineinhalte entfernt. Die Artenliste bleibt gespeichert.';
    } catch (failure) {
      error = _message(failure);
    }
    _changed();
  }

  File? offlineFile(Species species, ArtMedia media, MediaKind kind) {
    final key = MediaReference(species.id, kind, media).key;
    final file = offline?.verifiedFiles[key];
    final binding=offline?.bindings[key];
    // Observed photos belong to their download's catalog and URL, never an invented expected source hash.
    if (file == null || binding==null ||
        !binding.matches(MediaReference(species.id,kind,media)) ||
        binding.observedWebsite && !packageIsCurrent) {
      return null;
    }
    return file;
  }

  String? offlinePhotoNote(Species species,ArtMedia media) {
    final reference=MediaReference(species.id,MediaKind.gallery,media),binding=offline?.bindings[reference.key];
    if(binding==null || !binding.observedWebsite || offlineFile(species,media,MediaKind.gallery)==null) return null;
    return 'Gespeicherte Websitefassung · ${_date(binding.observedAt!)}';
  }

  Future<Uint8List> imageBytes(
    Species species,
    ArtMedia media,
    MediaKind kind,
  ) async {
    final file = offlineFile(species, media, kind);
    if (file != null && store!=null && offline!=null) {
      return store!.verifiedImage(offline!,MediaReference(species.id,kind,media));
    }
    final bytes = BytesBuilder(copy: false);
    await for (final chunk in transport.media(media.url)) {
      if (bytes.length + chunk.length > 32 * 1024 * 1024) {
        throw const FormatException('Das Bild ist zu groß für diese Ansicht.');
      }
      bytes.add(chunk);
    }
    return bytes.takeBytes();
  }

  Future<void> logout() async {
    if (downloading || busy || session == null) return;
    busy = true;
    _changed();
    final current = session!;
    var revoked = false;
    try {
      await ProjectApi(current.server, transport).logout(current);
      revoked = true;
    } catch (_) {
      /* Local token removal remains available when the service is unreachable. */
    }
    try {
      await vault.clear();
      session = null;
      catalog = null;
      offline = null;
      store = null;
      detailsAvailable = false;
      if (publicCatalog != null) {
        busy = false;
        await usePublicCatalog(notify: false);
        busy = true;
      } else {
        status = '';
      }
      error = revoked ? '' : 'Lokal abgemeldet. Die Gerätezulassung konnte beim Projektdienst noch nicht widerrufen werden.';
    } catch (_) {
      error = 'Die geschützte Anmeldung konnte nicht entfernt werden. Bitte erneut versuchen.';
    } finally {
      busy = false;
      _changed();
    }
  }

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';
  @override
  void dispose() {
    _disposed = true;
    _cancelDownload = true;
    transport.close();
    super.dispose();
  }
}
