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
  test('Die sichtbare Appversion stimmt mit der Paketversion überein', () {
    final version = RegExp(
      r'^version: ([^+\r\n]+)\+\d+$',
      multiLine: true,
    ).firstMatch(File('pubspec.yaml').readAsStringSync());
    expect(version?.group(1), androidAppVersion);
  });
  test('Tatsächlicher mitgelieferter Katalog enthält alle quittierten Arten und nur Medienverweise', () {
    final bytes = File('assets/catalog.json').readAsBytesSync();
    final manifest = jsonDecode(
      File('assets/catalog-manifest.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final bundled = BundledCatalog.decode(bytes, manifest);
    expect(bundled.photoSizes, hasLength(852));
    expect(bundled.catalog.species.length, 63);
    final families = speciesFamilies(bundled.catalog.search(''));
    expect(families.length, 42);
    expect(
      families.map((group) => group.label),
      containsAll([
        'Kapuzinerartige',
        'Wühler',
        'Regenpfeifer',
        'Greiffrösche',
      ]),
    );
    expect(
      families.where(
        (group) => group.id.isEmpty || group.label.toLowerCase() == group.id,
      ),
      isEmpty,
    );
    expect(
      bundled.catalog.species
          .where((entry) => entry.websiteHeading != null)
          .length,
      63,
    );
    for (final (name, subtitle) in [
      ('Buckelwal', 'Singender Gigant der Ozeane'),
      ('Alpenstrandläufer', 'Der graubraune Wattläufer'),
      ('Panama-Kapuzineraffe', 'Kluger Akrobat des Regenwaldes'),
      ('Goldbaumsteiger', 'Giftiges Juwel des Regenwaldes'),
      ('Eisvogel', 'Der blaue, pfeilschnelle Jäger unserer Flüsse'),
      (
        'Mittelamerikanischer Totenkopfaffe',
        'Tropischer Wirbelwind mit Köpfchen',
      ),
    ]) {
      expect(
        bundled.catalog.species
            .singleWhere((entry) => entry.commonName == name)
            .websiteHeading
            ?.subtitle,
        subtitle,
      );
    }
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
    final alpenstrand = bundled.catalog.species.singleWhere(
      (entry) => entry.commonName == 'Alpenstrandläufer',
    );
    expect(
      alpenstrand.spectrogram?.url?.path,
      endsWith('/Alpenstrandlaeufer/spectrogram.webp'),
    );
    expect(alpenstrand.spectrogram?.sha256, matches(RegExp(r'^[a-f0-9]{64}$')));
    expect(
      bundled.catalog.species
          .where((entry) => entry.spectrogram != null)
          .length,
      60,
    );
    expect(
      alpenstrand.media
          .where(
            (entry) =>
                const OfflineSelection(sounds: true).includes(entry.kind),
          )
          .length,
      2,
    );
    expect(
      Catalog.fromJson(bundled.catalog.toJson()).species
          .singleWhere((entry) => entry.id == alpenstrand.id)
          .spectrogram
          ?.sha256,
      alpenstrand.spectrogram?.sha256,
    );
    expect(
      bundled.sha256,
      'dec3aff4835a75ce7c11585e5b838381f82eb29bc83be041646557fe32a016f3',
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
    final newData = catalogFixture(revision: 'public-new');
    newData['species'][0]['sections'][0]['title'] = 'Korrigierte Überschrift';
    final publicNew = Catalog.fromJson(newData);
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
    final packageFile = File('${directory.path}/public-catalog/package.json');
    final savedPackage = jsonDecode(await packageFile.readAsString()) as Map;
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
      expect(controller.offline!.catalog.revision, 'public-new');
      expect(
        controller.offline!.catalog.species.first.sections.first.title,
        'Korrigierte Überschrift',
      );
      expect(controller.offline!.selection.maps, true);
      expect(controller.packageIsCurrent, true);
      expect(controller.shouldOfferOfflineUpdate, false);
      expect(controller.loggedIn, true);
      final updatedPackage =
          jsonDecode(await packageFile.readAsString()) as Map;
      expect(
        updatedPackage..remove('catalog'),
        savedPackage..remove('catalog'),
      );
      expect(transport.mediaRequests, hasLength(1));
      expect(transport.photoRequests, isEmpty);
      await controller.useProjectCatalog();
      expect(controller.viewingPublic, false);
      expect(controller.catalog!.revision, 'private-saved');
      expect(controller.store!.root.path, isNot(publicStore.root.path));
    } finally {
      controller.dispose();
    }
  });
  test('Neue ausgewählte Medien bleiben bis zur ausdrücklichen Aktualisierung offen', () async {
    final transport = FakeTransport();
    final publicStore = OfflineStore(
      Directory('${directory.path}/public-catalog'),
      transport,
    );
    await publicStore.download(
      Catalog.fromJson(catalogFixture(revision: 'public-old')),
      const OfflineSelection(maps: true),
      onProgress: (_) {},
      cancelled: () => false,
    );
    final newData = catalogFixture(revision: 'public-new');
    newData['species'][0]['media']['map'] = mediaFixture('map-new');
    final controller = ExplorerController(
      vault: MemoryVault(),
      transport: transport,
      supportDirectory: directory,
      publicCatalog: Catalog.fromJson(newData),
    );
    try {
      await controller.restore();
      expect(controller.shouldOfferOfflineUpdate, true);
      expect(controller.offline!.catalog.revision, 'public-old');
      expect(transport.mediaRequests, hasLength(1));
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
