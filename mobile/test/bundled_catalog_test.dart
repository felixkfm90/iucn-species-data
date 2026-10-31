import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/data/bundled_catalog.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';

import 'support.dart';

void main() {
  late Directory directory;
  setUp(() async {
    directory = await testDirectory();
  });
  tearDown(() => removeTestDirectory(directory));
  test('Tatsächlicher mitgelieferter Katalog enthält alle quittierten Arten und nur Medienverweise', () {
    final bytes = File('assets/catalog.json').readAsBytesSync();
    final manifest = jsonDecode(
      File('assets/catalog-manifest.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final bundled = BundledCatalog.decode(bytes, manifest);
    expect(bundled.catalog.species.length, 63);
    expect(
      bundled.catalog.species.fold<int>(
        0,
        (sum, entry) => sum + entry.gallery.length,
      ),
      852,
    );
    expect(
      bundled.catalog.species.fold<int>(
        0,
        (sum, entry) => sum + entry.sections.length,
      ),
      597,
    );
    expect(manifest['bundledMediaFiles'], 0);
    expect(
      bundled.sha256,
      'bad4403e0032452dd9899abef6d3383ce86265f7ef01b8a01ba023e6da6984c5',
    );
  });
  test(
    'Beschädigte Anfangsdaten werden nicht als öffentlicher Katalog ausgegeben',
    () {
      final bytes = Uint8List.fromList(
        utf8.encode(Catalog.fromJson(catalogFixture()).encode()),
      );
      final manifest = <String, dynamic>{
        'schemaVersion': 1,
        'kind': 'bundled-public-catalog',
        'catalogSha256': '0' * 64,
        'catalogBytes': bytes.length,
        'revision': 'fixture-1',
        'speciesCount': 2,
        'bundledMediaFiles': 0,
      };
      expect(
        () => BundledCatalog.decode(bytes, manifest),
        throwsFormatException,
      );
      manifest['catalogSha256'] = crypto.sha256.convert(bytes).toString();
      expect(BundledCatalog.decode(bytes, manifest).catalog.species.length, 2);
    },
  );
  test('Erststart zeigt öffentliche Texte offline ohne NASanmeldung oder Dienstabruf', () async {
    final transport = FakeTransport(), vault = MemoryVault();
    final controller = ExplorerController(
      vault: vault,
      transport: transport,
      supportDirectory: directory,
      publicCatalog: Catalog.fromJson(catalogFixture(media: false)),
    );
    try {
      await controller.restore();
      expect(controller.viewingPublic, true);
      expect(controller.loggedIn, false);
      expect(controller.detailsAvailable, true);
      expect(controller.catalog!.species.first.sections, isNotEmpty);
      expect(controller.status, contains('Mitgelieferte öffentliche Daten'));
      expect(controller.lastRefreshSucceeded, false);
      expect(transport.requests, isEmpty);
      expect(vault.value, isNull);
      await controller.refresh();
      expect(transport.requests, isEmpty);
      expect(controller.lastRefreshSucceeded, false);
    } finally {
      controller.dispose();
    }
  });
  test('Appupdate behält private Anmeldung und die gewählte öffentliche Offlineauswahl getrennt', () async {
    final transport = FakeTransport(), vault = MemoryVault(sessionFixture());
    final publicOld = Catalog.fromJson(catalogFixture(revision: 'public-old'));
    final publicNew = Catalog.fromJson(catalogFixture(revision: 'public-new'));
    final publicStore = OfflineStore(
      Directory('${directory.path}/public-catalog'),
      transport,
    );
    await publicStore.download(
      publicOld,
      const OfflineSelection(maps: true),
      onProgress: (_) {},
      cancelled: () => false,
    );
    final savedPackage = await File(
      '${directory.path}/public-catalog/package.json',
    ).readAsBytes();
    final privateSession = vault.value!;
    final privateStore = OfflineStore(
      Directory(
        '${directory.path}/projects/${OfflineStore.projectKey(privateSession.server, privateSession.user.id, projectId: privateSession.projectId)}',
      ),
      transport,
    );
    await privateStore.download(
      Catalog.fromJson(catalogFixture(revision: 'private-saved')),
      const OfflineSelection(texts: true),
      onProgress: (_) {},
      cancelled: () => false,
    );
    transport.onJson = (_, method, body, bearer) async =>
        throw const SocketException('synthetic offline');
    final controller = ExplorerController(
      vault: vault,
      transport: transport,
      supportDirectory: directory,
      publicCatalog: publicNew,
    );
    try {
      await controller.restore();
      expect(controller.viewingPublic, false);
      expect(controller.catalog!.revision, 'private-saved');
      expect(controller.loggedIn, true);
      expect(vault.value!.deviceToken, privateSession.deviceToken);
      await controller.usePublicCatalog();
      expect(controller.catalog!.revision, 'public-new');
      expect(controller.viewingPublic, true);
      expect(controller.offline!.catalog.revision, 'public-old');
      expect(controller.offline!.selection.maps, true);
      expect(controller.packageIsCurrent, false);
      expect(controller.loggedIn, true);
      expect(
        await File('${directory.path}/public-catalog/package.json')
            .readAsBytes(),
        savedPackage,
      );
      await controller.useProjectCatalog();
      expect(controller.viewingPublic, false);
      expect(controller.catalog!.revision, 'private-saved');
      expect(controller.store!.root.path, isNot(publicStore.root.path));
    } finally {
      controller.dispose();
    }
  });
  test('Zurückgezogener Projektzugriff gibt nur den ausdrücklich öffentlichen Bestand frei', () async {
    final transport = FakeTransport(), vault = MemoryVault(sessionFixture());
    transport.onJson = (_, method, body, bearer) async =>
        throw const ProjectApiException(401, 'Erneut anmelden');
    final controller = ExplorerController(
      vault: vault,
      transport: transport,
      supportDirectory: directory,
      publicCatalog: Catalog.fromJson(
        catalogFixture(revision: 'bundled-public', media: false),
      ),
    );
    try {
      await controller.restore();
      expect(controller.loggedIn, false);
      expect(controller.viewingPublic, true);
      expect(vault.value, isNull);
      expect(controller.catalog!.revision, 'bundled-public');
      expect(controller.lastRefreshSucceeded, false);
    } finally {
      controller.dispose();
    }
  });
}
