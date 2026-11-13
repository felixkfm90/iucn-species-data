import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/data/offline_jobs.dart';
import 'package:arten_explorer/data/offline_settings.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/reader_catalog.dart';
import 'package:arten_explorer/domain/catalog.dart';

import 'support.dart';

class _Downloads implements OfflineDownloads {
  OfflineTaskStatus? current;
  final starts = <String>[], cancellations = <String>[];
  final policies = <(bool, bool)>[];
  Future<OfflineTaskStatus?> Function()? onStatus;
  @override
  Future<DownloadNetwork> network() async =>
      const DownloadNetwork(connected: true, metered: false);
  @override
  Future<void> start(
    String id, {
    required bool allowMetered,
    bool automatic = false,
    int? estimatedBytes,
  }) async {
    starts.add(id);
    policies.add((allowMetered, automatic));
    current = OfflineTaskStatus(jobId: id, status: 'queued');
  }

  @override
  Future<OfflineTaskStatus?> status() async =>
      onStatus == null ? current : onStatus!();
  @override
  Future<void> cancel(String id) async {
    cancellations.add(id);
    current = OfflineTaskStatus(jobId: id, status: 'cancelled');
  }

  @override
  Future<void> acknowledge(String id) async {
    if (current?.jobId == id) current = null;
  }
}

void main() {
  late Directory support;
  final catalog = Catalog.fromJson(catalogFixture());
  const selection = OfflineSelection.withoutWebsitePhotos();
  const jobId = '0123456789abcdef0123456789abcdef';
  setUp(() async {
    support = await testDirectory();
  });
  tearDown(() => removeTestDirectory(support));

  test('Dauerhafter Auftrag enthält keine Anmeldung und bindet Katalog und Auswahl', () async {
    final session = sessionFixture();
    final job = OfflineJob(
      id: jobId,
      catalog: catalog,
      selection: selection,
      origin: session.server.origin,
      projectId: session.projectId,
      userId: session.user.id,
    );
    await job.save(support);
    final encoded = await OfflineJob.file(support, jobId).readAsString();
    expect(encoded, isNot(contains(session.token)));
    expect(encoded, isNot(contains(session.deviceToken!)));
    final reopened = await OfflineJob.read(support, jobId);
    expect(reopened.catalog.encode(), catalog.encode());
    expect(reopened.selection.toJson(), selection.toJson());
    expect(reopened.belongsTo(session, viewingPublic: false), true);
    expect(
      reopened.belongsTo(sessionFixture(userId: 'other'), viewingPublic: false),
      false,
    );
    expect(reopened.belongsTo(session, viewingPublic: true), false);
  });
  test(
    'Veränderte oder fremde Plankennung stoppt vor dem Dateizugriff',
    () async {
      await expectLater(
        OfflineJob.read(support, '../outside'),
        throwsFormatException,
      );
      final job = OfflineJob(id: jobId, catalog: catalog, selection: selection);
      await job.save(support);
      final file = OfflineJob.file(support, jobId);
      final json =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      json['id'] = '2b' * 16;
      await file.writeAsString(jsonEncode(json));
      await expectLater(OfflineJob.read(support, jobId), throwsFormatException);
    },
  );
  test('Öffentlicher Hintergrundauftrag schließt reales geprüftes Paket ohne Anmeldung ab', () async {
    final job = OfflineJob(id: jobId, catalog: catalog, selection: selection);
    final transport = FakeTransport();
    await runOfflineJob(
      job,
      support,
      vault: MemoryVault(),
      transport: transport,
      cancelled: () => false,
      onProgress: (_) {},
    );
    final snapshot = await OfflineStore(
      job.storeDirectory(support),
      transport,
    ).readPackage();
    expect(snapshot!.healthy, true);
    expect(snapshot.verifiedFiles.length, 3);
    expect(transport.requests, isEmpty);
  });
  test('Ein geschütztes Hintergrundpaket wird nur für das unveränderte Konto abgeschlossen', () async {
    final owner = sessionFixture();
    final snapshot = await ReaderCatalogSnapshot.read(
      projectId: owner.projectId,
      get: (query) async => protectedReaderFixture(
        owner.server.replace(queryParameters: query),
        owner.projectId,
      ),
    );
    final job = OfflineJob(
      id: jobId,
      catalog: snapshot.toCatalog(),
      selection: const OfflineSelection(sounds: true, gallery: true),
      origin: owner.server.origin,
      projectId: owner.projectId,
      userId: owner.user.id,
    );
    final vault = MemoryVault(owner), transport = FakeTransport();
    final store = OfflineStore(
      job.storeDirectory(support),
      transport,
      projectId: owner.projectId,
    );
    transport.onProtected = (_, file) async* {
      yield file.mimeType == 'audio/mpeg' ? [1, 2, 3] : pngBytes;
      vault.value = sessionFixture(userId: 'changed-user');
    };
    await expectLater(
      runOfflineJob(
        job,
        support,
        vault: vault,
        transport: transport,
        cancelled: () => false,
        onProgress: (_) {},
      ),
      throwsFormatException,
    );
    expect(await store.readPackage(), isNull);
    vault.value = owner;
    transport.onProtected = (_, file) =>
        Stream.value(file.mimeType == 'audio/mpeg' ? [1, 2, 3] : pngBytes);
    await runOfflineJob(
      job,
      support,
      vault: vault,
      transport: transport,
      cancelled: () => false,
      onProgress: (_) {},
    );
    expect((await store.readPackage())?.verifiedFiles.length, 2);
    expect(transport.mediaRequests, isEmpty);
    expect(
      transport.protectedRequests.every(
        (entry) => entry.$1.user.id == owner.user.id,
      ),
      isTrue,
    );
  });
  test('Ein beendeter älterer Download übernimmt danach die neuen mitgelieferten Texte ohne Dateitransfer', () async {
    final job = OfflineJob(id: jobId, catalog: catalog, selection: selection);
    final transport = FakeTransport(), platform = _Downloads();
    await job.save(support);
    await runOfflineJob(
      job,
      support,
      vault: MemoryVault(),
      transport: transport,
      cancelled: () => false,
      onProgress: (_) {},
    );
    platform.current = const OfflineTaskStatus(
      jobId: jobId,
      status: 'completed',
    );
    final downloaded = transport.mediaRequests.length;
    final current = Catalog.fromJson(catalogFixture(revision: 'new-catalog'));
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: transport,
      supportDirectory: support,
      publicCatalog: current,
      downloads: platform,
    );
    try {
      await controller.restore();
      expect(controller.error, isEmpty);
      expect(controller.packageIsCurrent, true);
      expect(controller.offline!.catalog.revision, current.revision);
      expect(controller.offline!.selection.toJson(), selection.toJson());
      expect(platform.current, isNull);
      expect(platform.starts, isEmpty);
      expect(transport.mediaRequests, hasLength(downloaded));
    } finally {
      controller.dispose();
    }
  });
  for (final allowMetered in [false, true]) {
    test(
      'Automatische Aktualisierung erhält die Auswahl und Netzregel ($allowMetered)',
      () async {
        final transport = FakeTransport(), platform = _Downloads();
        await runOfflineJob(
          OfflineJob(id: jobId, catalog: catalog, selection: selection),
          support,
          vault: MemoryVault(),
          transport: transport,
          cancelled: () => false,
          onProgress: (_) {},
        );
        await OfflineSettings(
          autoUpdate: true,
          allowMetered: allowMetered,
        ).save(support);
        final updated = catalogFixture(revision: 'updated-media');
        final species = (updated['species'] as List).first as Map;
        final media = species['media'] as Map;
        final map = media['map'] as Map;
        map['sha256'] = 'ab' * 32;
        final controller = ExplorerController(
          vault: MemoryVault(),
          transport: transport,
          supportDirectory: support,
          publicCatalog: Catalog.fromJson(updated),
          downloads: platform,
        );
        try {
          await controller.restore();
          expect(platform.policies, [(allowMetered, true)]);
          final job = await OfflineJob.read(support, platform.starts.single);
          expect(job.selection.toJson(), selection.toJson());
          expect(controller.shouldOfferOfflineUpdate, isFalse);
        } finally {
          controller.dispose();
        }
      },
    );
  }
  test('Dieselbe vollständige Auswahl wird lokal geprüft und startet keinen neuen Auftrag', () async {
    final job = OfflineJob(id: jobId, catalog: catalog, selection: selection);
    final transport = FakeTransport();
    final platform = _Downloads();
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: transport,
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await runOfflineJob(
        job,
        support,
        vault: MemoryVault(),
        transport: transport,
        cancelled: () => false,
        onProgress: (_) {},
      );
      await controller.usePublicCatalog();
      transport.mediaRequests.clear();
      expect(controller.hasCurrentOfflineSelection(selection), isTrue);
      await controller.download(selection);
      expect(controller.status, 'Offlineinhalte geprüft.');
      expect(controller.error, isEmpty);
      expect(platform.starts, isEmpty);
      expect(transport.mediaRequests, isEmpty);

      final refreshed = catalogFixture()
        ..['generatedAt'] = '2026-11-03T12:00:00.000Z';
      controller.catalog = Catalog.fromJson(refreshed);
      expect(controller.hasCurrentOfflineSelection(selection), isTrue);

      final newerMedia = catalogFixture();
      newerMedia['species'][0]['media']['map'] = mediaFixture('new-map');
      controller.catalog = Catalog.fromJson(newerMedia);
      expect(controller.hasCurrentOfflineSelection(selection), isFalse);
      controller.catalog = catalog;

      final file = controller.offline!.verifiedFiles.values.first;
      await file.writeAsString('synthetic corruption');
      await controller.download(selection);
      expect(controller.error, contains('beschädigt'));
      expect(controller.hasCurrentOfflineSelection(selection), isFalse);
      expect(platform.starts, isEmpty);
      await controller.download(selection);
      expect(platform.starts, hasLength(1));
    } finally {
      controller.dispose();
    }
  });
  test('Privater Hintergrundauftrag verhindert Medienabrufe bei fremder oder abgelaufener Identität', () async {
    final owner = sessionFixture();
    final job = OfflineJob(
      id: jobId,
      catalog: catalog,
      selection: selection,
      origin: owner.server.origin,
      projectId: owner.projectId,
      userId: owner.user.id,
    );
    for (final session in [
      null,
      sessionFixture(userId: 'foreign'),
      sessionFixture(
        deviceExpiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
      ),
    ]) {
      final transport = FakeTransport();
      await expectLater(
        runOfflineJob(
          job,
          support,
          vault: MemoryVault(session),
          transport: transport,
          cancelled: () => false,
          onProgress: (_) {},
        ),
        throwsFormatException,
      );
      expect(transport.mediaRequests, isEmpty);
      expect(await job.storeDirectory(support).exists(), false);
    }
  });
  test(
    'Schließen und Wiederöffnen des UI hält dieselbe native Plan-ID aktiv',
    () async {
      final platform = _Downloads();
      ExplorerController controller() => ExplorerController(
        vault: MemoryVault(),
        transport: FakeTransport(),
        supportDirectory: support,
        publicCatalog: catalog,
        downloads: platform,
      );
      final first = controller();
      await first.usePublicCatalog();
      await first.download(selection);
      final id = platform.starts.single;
      expect(first.downloading, true);
      first.dispose();
      expect(platform.cancellations, isEmpty);
      final second = controller();
      try {
        await second.restore();
        expect(second.downloading, true);
        expect(second.downloadTask!.jobId, id);
        expect(platform.starts, [id]);
        platform.current = OfflineTaskStatus(jobId: id, status: 'paused');
        await second.restoreDownload();
        await second.resumeDownload();
        expect(platform.starts, [id, id]);
        expect(platform.cancellations, isEmpty);
      } finally {
        second.dispose();
      }
    },
  );
  test('Fremder privater Job wird im öffentlichen Modus nicht als eigener Download übernommen', () async {
    final session = sessionFixture();
    final job = OfflineJob(
      id: jobId,
      catalog: catalog,
      selection: selection,
      origin: session.server.origin,
      projectId: session.projectId,
      userId: session.user.id,
    );
    await job.save(support);
    final platform = _Downloads()
      ..current = const OfflineTaskStatus(jobId: jobId, status: 'running');
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: FakeTransport(),
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await controller.restore();
      expect(controller.viewingPublic, true);
      expect(controller.downloadTask, isNull);
      expect(controller.error, contains('anderen Projektzugangs'));
      expect(platform.cancellations, isEmpty);
    } finally {
      controller.dispose();
    }
  });
  test('Historischer nativer Abschluss bestätigt kein fehlendes oder beschädigtes Paket', () async {
    final job = OfflineJob(id: jobId, catalog: catalog, selection: selection);
    await job.save(support);
    final platform = _Downloads()
      ..current = const OfflineTaskStatus(
        jobId: jobId,
        status: 'completed',
        message: 'Erfolgreich',
      );
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: FakeTransport(),
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await controller.usePublicCatalog();
      await controller.restoreDownload();
      expect(controller.error, contains('Offlinepaket fehlt'));
      expect(controller.status, isNot('Erfolgreich'));
      await runOfflineJob(
        job,
        support,
        vault: MemoryVault(),
        transport: FakeTransport(),
        cancelled: () => false,
        onProgress: (_) {},
      );
      await controller.restoreDownload();
      expect(controller.error, isEmpty);
      expect(controller.status, 'Erfolgreich');
      await File('${job.storeDirectory(support).path}/package.json')
          .writeAsString('{broken');
      controller.downloading = true;
      await controller.restoreDownload();
      expect(controller.error, isNotEmpty);
      expect(controller.offline, isNull);
      expect(controller.downloading, false);
    } finally {
      controller.dispose();
    }
  });
  test('Anmeldung während eines öffentlichen Downloads wechselt weder Bestand noch Zugang', () async {
    final platform = _Downloads();
    final transport = FakeTransport();
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: transport,
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await controller.usePublicCatalog();
      await controller.download(selection);
      final id = controller.downloadTask!.jobId;
      expect(
        await controller.login(
          'https://project.example.invalid',
          'another',
          'not-stored',
        ),
        false,
      );
      expect(controller.viewingPublic, true);
      expect(controller.session, isNull);
      expect(controller.downloadTask!.jobId, id);
      expect(transport.requests, isEmpty);
    } finally {
      controller.dispose();
    }
  });
  test('Bewusster Bestandswechsel nimmt den passenden öffentlichen Hintergrundauftrag wieder auf', () async {
    await OfflineJob(
      id: jobId,
      catalog: catalog,
      selection: selection,
    ).save(support);
    final platform = _Downloads()
      ..current = const OfflineTaskStatus(jobId: jobId, status: 'running');
    final transport = FakeTransport()
      ..onJson = (_, _, _, _) async =>
          throw const SocketException('synthetic offline');
    final controller = ExplorerController(
      vault: MemoryVault(sessionFixture()),
      transport: transport,
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await controller.restore();
      expect(controller.viewingPublic, false);
      expect(controller.downloadTask, isNull);
      await controller.usePublicCatalog();
      expect(controller.viewingPublic, true);
      expect(controller.downloading, true);
      expect(controller.downloadTask!.jobId, jobId);
      expect(platform.starts, isEmpty);
    } finally {
      controller.dispose();
    }
  });
  test('Verspäteter alter Abschluss kann neuen laufenden Auftrag im gleichen Bestand nicht entsperren', () async {
    const nextId = 'fedcba9876543210fedcba9876543210';
    await OfflineJob(
      id: jobId,
      catalog: catalog,
      selection: selection,
    ).save(support);
    await OfflineJob(
      id: nextId,
      catalog: catalog,
      selection: selection,
    ).save(support);
    final oldResponse = Completer<OfflineTaskStatus?>();
    final platform = _Downloads();
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: FakeTransport(),
      supportDirectory: support,
      publicCatalog: catalog,
      downloads: platform,
    );
    try {
      await controller.usePublicCatalog();
      platform.onStatus = () => oldResponse.future;
      final oldRead = controller.restoreDownload();
      platform.onStatus = () async =>
          const OfflineTaskStatus(jobId: nextId, status: 'running');
      await controller.restoreDownload();
      oldResponse.complete(
        const OfflineTaskStatus(jobId: jobId, status: 'completed'),
      );
      await oldRead;
      expect(controller.downloading, true);
      expect(controller.downloadTask!.jobId, nextId);
      await controller.removeOffline();
      expect(controller.downloading, true);
    } finally {
      controller.dispose();
    }
  });
}
