import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'data/offline_store.dart';
import 'data/offline_estimate.dart';
import 'data/offline_jobs.dart';
import 'data/offline_settings.dart';
import 'data/project_api.dart';
import 'data/public_catalog.dart';
import 'data/token_vault.dart';
import 'domain/catalog.dart';
import 'domain/project_media.dart';

class ExplorerController extends ChangeNotifier {
  final TokenVault vault;
  final ProjectTransport transport;
  final Directory supportDirectory;
  final Catalog? publicCatalog;
  final PublicCatalogSource? publicCatalogSource;
  final Map<String, int> bundledPhotoSizes;
  final OfflineDownloads? downloads;
  OfflineSettings offlineSettings = const OfflineSettings();
  bool savingOfflineSettings = false;
  (String, Catalog)? _autoUpdateAttempt;
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
  OfflineTaskStatus? downloadTask;
  OfflineJob? _activeDownloadJob;
  OfflineJob? get activeDownloadJob => _activeDownloadJob;
  OfflineInventory? offlineInventory;
  Timer? _downloadPoll;
  bool _pollingDownload = false;
  bool _checkingStartupDownload = false;
  int _downloadStatusGeneration = 0;
  DateTime? _lastSuccessfulPublicCheck;
  bool publicCatalogRefreshing = false;
  ExplorerController({
    required this.vault,
    required this.transport,
    required this.supportDirectory,
    this.publicCatalog,
    this.publicCatalogSource,
    this.bundledPhotoSizes = const {},
    this.downloads,
  });
  bool get loggedIn => session != null;
  bool get canRefreshPublicCatalog => publicCatalogSource != null;
  bool get packageIsCurrent =>
      offline != null && offline!.catalog.revision == catalog?.revision;
  bool get _hasOfflineUpdate =>
      !initializing &&
      !_checkingStartupDownload &&
      !busy &&
      !downloading &&
      downloadTask?.active != true &&
      offline?.healthy == true &&
      catalog != null &&
      store != null &&
      !hasCurrentOfflineSelection(offline!.selection);
  bool get shouldOfferOfflineUpdate =>
      _hasOfflineUpdate &&
      (!offlineSettings.autoUpdate ||
          downloads == null ||
          _autoUpdateAttempt == (store!.root.path, catalog!));
  bool hasCurrentOfflineSelection(OfflineSelection selection) {
    final saved = offline, current = catalog;
    return current != null &&
        saved != null &&
        saved.healthy &&
        saved.catalog.revision == current.revision &&
        mapEquals(saved.selection.toJson(), selection.toJson()) &&
        jsonEncode(saved.catalog.toJson()['species']) ==
            jsonEncode(
              current.toJson(includeDetails: selection.texts)['species'],
            );
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  String _message(Object failure) {
    if (failure is FormatException) return failure.message;
    if (failure is PlatformException && failure.message != null) {
      return failure.message!;
    }
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
    _downloadStatusGeneration++;
    _downloadPoll?.cancel();
    _downloadPoll = null;
    downloadTask = null;
    _activeDownloadJob = null;
    progress = null;
    offlineInventory = null;
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
      projectId: value.projectId,
    );
    try {
      offline = await store!.readPackage();
      catalog = offline?.catalog ?? await store!.readIndex();
      detailsAvailable = offline?.selection.texts ?? false;
      occupiedBytes = await store!.occupiedBytes();
      await refreshOfflineInventory();
      if (offline != null && !offline!.healthy) {
        error =
            '${offline!.missingFiles.length} Offlinedateien fehlen oder sind beschädigt. Bitte das Paket neu laden.';
      }
    } catch (failure) {
      error = _message(failure);
    }
  }

  Future<void> usePublicCatalog({bool notify = true}) async {
    if ((publicCatalog == null && publicCatalogSource == null) ||
        busy ||
        downloading) {
      return;
    }
    error = '';
    viewingPublic = true;
    _downloadStatusGeneration++;
    _downloadPoll?.cancel();
    _downloadPoll = null;
    downloadTask = null;
    _activeDownloadJob = null;
    progress = null;
    offlineInventory = null;
    catalog = publicCatalog;
    detailsAvailable = catalog != null;
    offline = null;
    occupiedBytes = 0;
    final publicStore = OfflineStore(
      Directory('${supportDirectory.path}/public-catalog'),
      transport,
    );
    store = publicStore;
    status = publicCatalog == null
        ? 'Öffentlicher Bestand wird geprüft'
        : 'Mitgelieferte öffentliche Daten · ${_date(publicCatalog!.generatedAt)}';
    lastRefreshSucceeded = false;
    try {
      PublicCatalogRelease? cached;
      try {
        cached = await publicStore.readPublicRelease();
      } on FormatException {
        // A damaged cached release cannot displace the bundled catalog.
      } on FileSystemException {
        // Keep the available bundled catalog if the cache cannot be read.
      }
      if (!identical(store, publicStore)) return;
      if (cached != null &&
          (catalog == null ||
              cached.catalog.generatedAt.isAfter(catalog!.generatedAt))) {
        catalog = cached.catalog;
        detailsAvailable = true;
        status = 'Öffentliche Daten · ${_date(cached.catalog.generatedAt)}';
      }
      final activeCatalog = catalog;
      var saved = await publicStore.readPackage();
      if (!identical(store, publicStore)) return;
      if (activeCatalog != null &&
          saved != null &&
          saved.healthy &&
          saved.catalog.encode() !=
              activeCatalog.encode(includeDetails: saved.selection.texts)) {
        final task = await downloads?.status();
        if (!identical(store, publicStore)) return;
        // A completed job must first be checked against its own snapshot.
        if (task?.active != true && task?.status != 'completed') {
          saved = await publicStore.updateCatalogWithoutDownload(activeCatalog);
        }
      }
      final bytes = await publicStore.occupiedBytes();
      if (!identical(store, publicStore)) return;
      offline = saved;
      occupiedBytes = bytes;
      await refreshOfflineInventory();
      if (!identical(store, publicStore)) return;
      if (offline != null && !offline!.healthy) {
        error =
            '${offline!.missingFiles.length} öffentliche Offlinedateien fehlen oder sind beschädigt.';
      }
    } catch (failure) {
      if (!identical(store, publicStore)) return;
      error = _message(failure);
    }
    if (notify) {
      await restoreDownload();
      await refreshPublicCatalog(automatic: true);
      await _startAutomaticOfflineUpdate();
      _changed();
    }
  }

  Future<void> useProjectCatalog() async {
    if (session == null || busy || downloading) return;
    error = '';
    await _bindStore(session!);
    status = 'Gespeicherter Projektbestand · Verbindung wird geprüft';
    _changed();
    await refresh();
    await restoreDownload();
  }

  Future<void> restore() async {
    _checkingStartupDownload = true;
    offlineSettings = await OfflineSettings.read(supportDirectory);
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
    try {
      if (session != null) {
        await refresh();
      }
      await restoreDownload();
      if (session == null) await refreshPublicCatalog(automatic: true);
    } finally {
      _checkingStartupDownload = false;
      await _startAutomaticOfflineUpdate();
      _changed();
    }
  }

  Future<bool> login(String server, String username, String password) =>
      _authenticate(
        () => ProjectApi(
          normalizeServer(server),
          transport,
        ).login(username, password),
      );

  Future<bool> redeemPairing(ProjectPairingInvitation invitation) =>
      _authenticate(
        () =>
            ProjectApi(invitation.server, transport).redeemPairing(invitation),
      );

  Future<bool> _authenticate(
    Future<ProjectSession> Function() obtainSession,
  ) async {
    if (busy || downloading) return false;
    busy = true;
    error = '';
    _changed();
    try {
      final next = await obtainSession();
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
      await refreshPublicCatalog();
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
      final allowLegacy =
          catalog?.projectId == null && offline?.catalog.projectId == null;
      Catalog updated;
      try {
        updated = await api.loadCatalog(session!, allowLegacy: allowLegacy);
      } on ProjectApiException catch (failure) {
        if (failure.status != 401 || session!.deviceToken == null) rethrow;
        session = await api.refresh(session!);
        await vault.write(session!);
        updated = await api.loadCatalog(session!, allowLegacy: allowLegacy);
      }
      await store!.saveIndex(updated);
      catalog = updated;
      detailsAvailable = true;
      final task = await downloads?.status();
      if (task?.active != true && task?.status != 'completed') {
        offline = await store!.updateCatalogWithoutDownload(updated);
        await refreshOfflineInventory();
      }
      lastRefreshSucceeded = true;
      status = 'Inhalte aktualisiert · ${_date(updated.generatedAt)}';
    } catch (failure) {
      if (failure is ProjectApiException && failure.requiresLogin) {
        await vault.clear();
        session = null;
        catalog = null;
        offline = null;
        offlineInventory = null;
        store = null;
        // Only explicitly public packaged content may be shown after authorization is withdrawn.
        if (publicCatalog != null || publicCatalogSource != null) {
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
    await _startAutomaticOfflineUpdate();
  }

  Future<void> refreshPublicCatalog({bool automatic = false}) async {
    final source = publicCatalogSource, publicStore = store;
    if (!viewingPublic ||
        source == null ||
        publicStore == null ||
        initializing ||
        busy ||
        downloading ||
        publicCatalogRefreshing ||
        _disposed) {
      return;
    }
    final last = _lastSuccessfulPublicCheck;
    if (automatic &&
        last != null &&
        DateTime.now().difference(last) < const Duration(minutes: 15)) {
      return;
    }
    _lastSuccessfulPublicCheck = null;
    publicCatalogRefreshing = true;
    lastRefreshSucceeded = false;
    if (!automatic) error = '';
    _changed();
    try {
      final release = await source.loadNewer(catalog);
      if (_disposed || !viewingPublic || !identical(store, publicStore)) return;
      _lastSuccessfulPublicCheck = DateTime.now();
      if (release == null) {
        if (catalog == null) {
          error = 'Keine öffentliche Katalogfassung verfügbar.';
        }
        return;
      }
      await publicStore.savePublicRelease(release);
      if (_disposed || !viewingPublic || !identical(store, publicStore)) return;
      catalog = release.catalog;
      detailsAvailable = true;
      status = 'Öffentliche Daten · ${_date(release.catalog.generatedAt)}';
      lastRefreshSucceeded = true;
      final task = await downloads?.status();
      if (!_disposed &&
          viewingPublic &&
          identical(store, publicStore) &&
          !downloading &&
          task?.active != true &&
          task?.status != 'completed') {
        offline = await publicStore.updateCatalogWithoutDownload(
          release.catalog,
        );
        await refreshOfflineInventory();
      }
    } catch (_) {
      if ((!automatic || catalog == null) &&
          !_disposed &&
          viewingPublic &&
          identical(store, publicStore)) {
        error = lastRefreshSucceeded
            ? 'Die öffentlichen Arttexte sind aktuell. Das Offlinepaket konnte noch nicht geprüft werden.'
            : 'Die öffentliche Aktualisierung konnte nicht geprüft werden.';
      }
    } finally {
      publicCatalogRefreshing = false;
      _changed();
    }
    await _startAutomaticOfflineUpdate();
  }

  Future<void> saveOfflineSettings({
    bool? allowMetered,
    bool? autoUpdate,
  }) async {
    if (savingOfflineSettings || busy || downloading) return;
    final next = OfflineSettings(
      allowMetered: allowMetered ?? offlineSettings.allowMetered,
      autoUpdate: autoUpdate ?? offlineSettings.autoUpdate,
    );
    savingOfflineSettings = true;
    _changed();
    try {
      await next.save(supportDirectory);
      offlineSettings = next;
      _autoUpdateAttempt = null;
      error = '';
    } catch (failure) {
      error = _message(failure);
    } finally {
      savingOfflineSettings = false;
      _changed();
    }
    await _startAutomaticOfflineUpdate();
  }

  Future<void> _startAutomaticOfflineUpdate() async {
    if (_disposed ||
        !offlineSettings.autoUpdate ||
        downloads == null ||
        !_hasOfflineUpdate) {
      return;
    }
    final key = (store!.root.path, catalog!);
    if (_autoUpdateAttempt == key) return;
    _autoUpdateAttempt = key;
    await download(
      offline!.selection,
      allowMetered: offlineSettings.allowMetered,
      automatic: true,
    );
  }

  Future<DownloadNetwork> downloadNetwork() async => downloads == null
      ? const DownloadNetwork(connected: true, metered: false)
      : downloads!.network();

  Future<void> refreshOfflineInventory() async {
    final sourceStore = store, sourceCatalog = catalog;
    if (sourceStore == null || sourceCatalog == null) {
      offlineInventory = null;
      return;
    }
    final result = await sourceStore.inventory(sourceCatalog);
    if (identical(store, sourceStore) && identical(catalog, sourceCatalog)) {
      offlineInventory = result;
    }
  }

  Future<void> restoreDownload() async {
    if (downloads == null || _disposed) return;
    final generation = ++_downloadStatusGeneration;
    final boundStore = store,
        boundCatalog = catalog,
        boundSession = session,
        boundPublic = viewingPublic;
    bool current() =>
        !_disposed &&
        generation == _downloadStatusGeneration &&
        identical(store, boundStore) &&
        identical(catalog, boundCatalog) &&
        identical(session, boundSession) &&
        viewingPublic == boundPublic;
    OfflineTaskStatus? observedTask;
    try {
      final task = await downloads!.status();
      if (task == null || !current()) return;
      final job = await OfflineJob.read(supportDirectory, task.jobId);
      if (!current()) return;
      if (!job.belongsTo(session, viewingPublic: viewingPublic)) {
        // A private job cannot supply progress or files to a different identity.
        if (task.active) {
          error = 'Ein Download eines anderen Projektzugangs ist noch aktiv. Bitte zuerst zum passenden Bestand wechseln.';
          _changed();
        }
        return;
      }
      observedTask = task;
      if (!task.active) {
        OfflineSnapshot? package;
        if (boundStore != null) {
          package = await boundStore.readPackage();
          final bytes = await boundStore.occupiedBytes();
          if (!current()) return;
          offline = package;
          occupiedBytes = bytes;
          await refreshOfflineInventory();
          if (!current()) return;
        }
        if (task.status == 'completed') {
          if (package != null &&
              package.healthy &&
              package.catalog.encode() ==
                  job.catalog.encode(includeDetails: job.selection.texts) &&
              package.selection.toJson().toString() ==
                  job.selection.toJson().toString()) {
            status = task.message;
            error = '';
            if (boundCatalog != null &&
                boundStore != null &&
                package.catalog.encode() !=
                    boundCatalog.encode(
                      includeDetails: package.selection.texts,
                    )) {
              await downloads!.acknowledge(task.jobId);
              if (!current()) return;
              package = await boundStore.updateCatalogWithoutDownload(
                boundCatalog,
              );
              if (!current()) return;
              offline = package;
              occupiedBytes = await boundStore.occupiedBytes();
              await refreshOfflineInventory();
            }
          } else {
            error = 'Der frühere Download ist beendet; sein Offlinepaket fehlt, ist unvollständig oder passt nicht mehr zum Auftrag. Bitte die Auswahl erneut laden.';
          }
        } else {
          error = task.message;
        }
        _downloadPoll?.cancel();
        _downloadPoll = null;
      } else {
        _downloadPoll ??= Timer.periodic(
          const Duration(seconds: 1),
          (_) => _pollDownload(),
        );
      }
      if (!current()) return;
      downloadTask = task;
      _activeDownloadJob = task.active ? job : null;
      downloading = task.active;
      progress = task.active
          ? OfflineProgress(
              task.completeFiles,
              task.totalFiles,
              task.receivedBytes,
              null,
              task.message,
            )
          : null;
      _changed();
    } catch (failure) {
      if (current()) {
        if (observedTask != null && !observedTask.active) {
          downloadTask = observedTask;
          _activeDownloadJob = null;
          downloading = false;
          progress = null;
          offline = null;
          offlineInventory = null;
          _downloadPoll?.cancel();
          _downloadPoll = null;
        }
        error = _message(failure);
        _changed();
      }
    }
  }

  Future<void> resumeDownload({
    bool allowMetered = false,
    String? expectedJobId,
  }) async {
    if (downloads == null || downloadTask?.canResume != true || busy) return;
    final task = downloadTask!;
    if (expectedJobId != null && task.jobId != expectedJobId) return;
    final boundStore = store,
        boundSession = session,
        boundPublic = viewingPublic;
    final generation = ++_downloadStatusGeneration;
    busy = true;
    _changed();
    try {
      final job = await OfflineJob.read(supportDirectory, task.jobId);
      if (_disposed ||
          generation != _downloadStatusGeneration ||
          !identical(store, boundStore) ||
          !identical(session, boundSession) ||
          boundPublic != viewingPublic ||
          !job.belongsTo(session, viewingPublic: viewingPublic)) {
        return;
      }
      await downloads!.start(
        task.jobId,
        allowMetered: allowMetered || task.allowMetered,
      );
      await restoreDownload();
    } catch (failure) {
      error = _message(failure);
    } finally {
      busy = false;
      _changed();
    }
  }

  Future<void> _pollDownload() async {
    if (_pollingDownload || _disposed || busy) return;
    _pollingDownload = true;
    try {
      await restoreDownload();
      await _startAutomaticOfflineUpdate();
    } finally {
      _pollingDownload = false;
    }
  }

  Future<void> download(
    OfflineSelection selection, {
    bool allowMetered = false,
    bool automatic = false,
    Map<String, int>? photoSizes,
  }) async {
    if (catalog == null || store == null || downloading || busy) return;
    if (hasCurrentOfflineSelection(selection)) {
      await _verifyOfflinePackage();
      return;
    }
    if (selection.texts && !detailsAvailable) {
      error = 'Die Arttexte müssen zuerst über „Inhalte aktualisieren“ geladen werden.';
      _changed();
      return;
    }
    if (downloads != null) {
      // The native job owns the transfer. Closing this controller never cancels it.
      final currentCatalog = catalog!,
          currentStore = store,
          currentSession = session,
          currentPublic = viewingPublic;
      busy = true;
      final generation = ++_downloadStatusGeneration;
      bool current() =>
          !_disposed &&
          generation == _downloadStatusGeneration &&
          identical(catalog, currentCatalog) &&
          identical(store, currentStore) &&
          identical(session, currentSession) &&
          viewingPublic == currentPublic;
      error = '';
      _changed();
      try {
        final old = await downloads!.status();
        if (!current()) return;
        if (old != null && old.active) {
          throw const FormatException(
            'Ein Offline-Download ist bereits aktiv. Bitte fortsetzen oder zuerst abbrechen.',
          );
        }
        if (old != null) await downloads!.acknowledge(old.jobId);
        if (!current()) return;
        final job = OfflineJob(
          id: OfflineJob.newId(),
          catalog: currentCatalog,
          selection: selection,
          origin: viewingPublic ? null : session?.server.origin,
          projectId: viewingPublic ? null : session?.projectId,
          userId: viewingPublic ? null : session?.user.id,
        );
        if (!viewingPublic && (session == null || !session!.mayReadOffline)) {
          throw const FormatException(
            'Bitte zuerst erneut am gemeinsamen Projekt anmelden.',
          );
        }
        await job.save(supportDirectory);
        if (!current()) return;
        final estimate = OfflineEstimate.selection(
          currentCatalog,
          selection,
          photoSizes ?? bundledPhotoSizes,
          alreadyAvailable: {
            ...?offlineInventory?.verifiedKeys,
            ...?offlineInventory?.resumableKeys,
          },
        );
        await downloads!.start(
          job.id,
          allowMetered: allowMetered,
          automatic: automatic,
          estimatedBytes: estimate.unknownFiles == 0
              ? estimate.knownBytes
              : null,
        );
        await restoreDownload();
      } catch (failure) {
        if (current()) error = _message(failure);
      } finally {
        busy = false;
        _changed();
      }
      return;
    }
    downloading = true;
    _cancelDownload = false;
    progress = null;
    error = '';
    _changed();
    try {
      final downloadScope = readerScope;
      offline = await store!.download(
        catalog!,
        selection,
        onProgress: (value) {
          progress = value;
          _changed();
        },
        cancelled: () => _cancelDownload,
        projectMedia: viewingPublic
            ? null
            : (file) => _protectedMediaStream(file),
        beforeCommit: viewingPublic || catalog?.projectId == null
            ? null
            : () async {
                if (downloadScope == null || readerScope != downloadScope) {
                  throw const FormatException(
                    'Die Projektanmeldung ist nicht mehr verfügbar.',
                  );
                }
              },
      );
      occupiedBytes = await store!.occupiedBytes();
      await refreshOfflineInventory();
      status = offline!.observedPhotoCount == 0
          ? 'Offlineauswahl vollständig geladen und geprüft.'
          : 'Offlineauswahl geprüft · ${offline!.observedPhotoCount} öffentliche Websitefassungen gespeichert.';
    } catch (failure) {
      error = _message(failure);
    } finally {
      try {
        occupiedBytes = await store!.occupiedBytes();
        await refreshOfflineInventory();
      } catch (_) {
        /* Keep the last confirmed size. */
      }
      downloading = false;
      progress = null;
      _changed();
    }
  }

  Future<void> _verifyOfflinePackage() async {
    final source = store!;
    busy = true;
    error = '';
    status = '';
    _changed();
    try {
      offline = await source.readPackage();
      occupiedBytes = await source.occupiedBytes();
      await refreshOfflineInventory();
      if (offline?.healthy == true) {
        status = 'Offlineinhalte geprüft.';
      } else {
        error = 'Offlineinhalte fehlen oder sind beschädigt. Bitte die Auswahl erneut laden.';
      }
    } catch (failure) {
      offline = null;
      offlineInventory = null;
      error = _message(failure);
    } finally {
      busy = false;
      _changed();
    }
  }

  void cancelDownload() {
    if (downloads != null && downloadTask != null) {
      _downloadStatusGeneration++;
      unawaited(
        downloads!
            .cancel(downloadTask!.jobId)
            .then((_) => restoreDownload())
            .catchError((Object failure) {
              error = _message(failure);
              _changed();
            }),
      );
      return;
    }
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
    if (downloading || busy || store == null) return;
    busy = true;
    _changed();
    try {
      await store!.removePackage();
      offline = null;
      offlineInventory = null;
      if (downloads != null && downloadTask != null && !downloadTask!.active) {
        await downloads!.acknowledge(downloadTask!.jobId);
        downloadTask = null;
      }
      offline = null;
      occupiedBytes = await store!.occupiedBytes();
      await refreshOfflineInventory();
      status = viewingPublic
          ? 'Zusätzliche Mediendownloads entfernt. Der mitgelieferte öffentliche Bestand bleibt verfügbar.'
          : 'Zusätzliche Offlineinhalte entfernt. Die Artenliste bleibt gespeichert.';
    } catch (failure) {
      error = _message(failure);
    } finally {
      busy = false;
    }
    _changed();
  }

  Future<bool> removeOfflineCategory(MediaKind kind) async {
    final source = store, expected = offline, currentCatalog = catalog;
    if (downloading ||
        busy ||
        source == null ||
        expected == null ||
        currentCatalog == null) {
      return false;
    }
    busy = true;
    error = '';
    _changed();
    try {
      offline = await source.removeCategory(
        kind,
        expected: expected,
        currentCatalog: currentCatalog,
      );
      occupiedBytes = await source.occupiedBytes();
      await refreshOfflineInventory();
      status = 'Abgewählte Offlineinhalte von diesem Gerät entfernt.';
      return true;
    } catch (failure) {
      try {
        offline = await source.readPackage();
        await refreshOfflineInventory();
      } catch (_) {
        offlineInventory = null;
      }
      error = _message(failure);
      return false;
    } finally {
      busy = false;
      _changed();
    }
  }

  File? offlineFile(Species species, ArtMedia media, MediaKind kind) {
    final snapshot = offline;
    if (snapshot == null || !mayUseMedia(species, media, kind)) return null;
    final reference = MediaReference(species.id, kind, media);
    final file = snapshot.verifiedFiles[reference.key];
    final binding = snapshot.bindings[reference.key];
    if (file == null || binding == null || !binding.matches(reference)) {
      return null;
    }
    if (binding.observedWebsite && !packageIsCurrent) {
      // An unchanged public photo can use its previously verified local copy
      // while the new catalog's media package is still pending.
      final current = catalog;
      if (!viewingPublic ||
          snapshot.catalog.projectId != null ||
          current == null ||
          current.projectId != null ||
          binding.downloadUrl == null) {
        return null;
      }
      final currentSpecies = current.species
          .where((entry) => entry.id == species.id)
          .firstOrNull;
      if (currentSpecies?.media.any(binding.matches) != true) return null;
    }
    return file;
  }

  (Uri, String, String)? get readerScope {
    final active = session;
    return _disposed ||
            viewingPublic ||
            active == null ||
            !active.mayReadOffline ||
            catalog?.projectId != active.projectId
        ? null
        : (active.server, active.projectId, active.user.id);
  }

  bool mayUseMedia(Species species, ArtMedia media, MediaKind kind) {
    final file = media.projectFile;
    if (file == null) return true;
    if (readerScope?.$2 != file.projectId) return false;
    final current = catalog?.species
        .where((entry) => entry.id == species.id)
        .firstOrNull;
    return current?.media.any(
          (reference) =>
              reference.kind == kind &&
              reference.media.id == media.id &&
              reference.media.sourceIdentity == media.sourceIdentity &&
              reference.media.sha256 == media.sha256,
        ) ==
        true;
  }

  Stream<List<int>> _protectedMediaStream(ProjectMediaFile file) async* {
    final scope = readerScope;
    final active = session;
    if (scope == null || scope.$2 != file.projectId || active == null) {
      throw const FormatException(
        'Die Projektdatei gehört nicht zur aktuellen Anmeldung.',
      );
    }
    final api = ProjectApi(active.server, transport);
    final current = active.expiresAt.isAfter(DateTime.now())
        ? active
        : await api.refresh(active);
    if (readerScope != scope) {
      throw const FormatException('Die Projektanmeldung wurde gewechselt.');
    }
    yield* api.projectMedia(current, file);
    if (readerScope != scope) {
      throw const FormatException('Die Projektanmeldung wurde gewechselt.');
    }
  }

  Future<Uint8List> imageBytes(
    Species species,
    ArtMedia media,
    MediaKind kind,
  ) async {
    final scope = readerScope;
    void checkCurrent() {
      if (media.projectFile != null &&
          (readerScope != scope || !mayUseMedia(species, media, kind))) {
        throw const FormatException(
          'Die Projektdatei gehört nicht mehr zur aktuellen Lesefassung.',
        );
      }
    }

    checkCurrent();
    final file = offlineFile(species, media, kind);
    if (file != null && store != null && offline != null) {
      final bytes = await store!.verifiedImage(
        offline!,
        MediaReference(species.id, kind, media),
      );
      checkCurrent();
      return bytes;
    }
    final bytes = BytesBuilder(copy: false);
    final project = media.projectFile;
    final stream = project == null
        ? transport.media(media.url!)
        : _protectedMediaStream(project);
    await for (final chunk in stream) {
      if (bytes.length + chunk.length > 32 * 1024 * 1024) {
        throw const FormatException('Das Bild ist zu groß für diese Ansicht.');
      }
      bytes.add(chunk);
    }
    checkCurrent();
    return bytes.takeBytes();
  }

  Future<File> prepareProjectAudio(Species species, ArtMedia media) async {
    final file = media.projectFile, scope = readerScope;
    bool current() =>
        readerScope == scope && mayUseMedia(species, media, MediaKind.sound);
    if (file == null ||
        file.mimeType != 'audio/mpeg' ||
        scope == null ||
        !current()) {
      throw const FormatException(
        'Die Tierstimme gehört nicht zur aktuellen Lesefassung.',
      );
    }
    final cache = Directory('${supportDirectory.path}/playback');
    await cache.create(recursive: true);
    final temporary = await cache.createTemp('playback-');
    final audio = File('${temporary.path}/recording.mp3');
    final sink = audio.openWrite();
    try {
      try {
        await sink.addStream(_protectedMediaStream(file));
      } finally {
        await sink.close();
      }
      if (!current()) {
        throw const FormatException(
          'Die Lesefassung wurde während des Abrufs gewechselt.',
        );
      }
      return audio;
    } catch (_) {
      if (await audio.exists()) await audio.delete();
      await temporary.delete();
      rethrow;
    }
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
      if (publicCatalog != null || publicCatalogSource != null) {
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
    _downloadStatusGeneration++;
    _downloadPoll?.cancel();
    _cancelDownload = true;
    transport.close();
    super.dispose();
  }
}
