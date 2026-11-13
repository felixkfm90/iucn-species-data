import 'dart:convert';
import 'dart:io';

import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/data/public_catalog.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

const pagesMedia =
    'https://felixkfm90.github.io/iucn-species-data/species-assets';
final pinnedMedia =
    'https://raw.githubusercontent.com/felixkfm90/iucn-species-data/${'a' * 40}/species-assets';

Map<String, dynamic> addCoreMedia(Map<String, dynamic> catalog, String root) {
  Map<String, dynamic> asset(String id, String filename, String mimeType) => {
    ...mediaFixture(id),
    'url': '$root/Test%20Kauz/$filename',
    'mimeType': mimeType,
  };
  final species = (catalog['species'] as List).first;
  final media = <String, dynamic>{
    ...species['media'] as Map<String, dynamic>,
    'portrait': asset('portrait', 'portrait.webp', 'image/webp'),
    'map': asset('map', 'map.jpg', 'image/jpeg'),
    'sounds': [asset('sound', 'sound.mp3', 'audio/mpeg')],
    'spectrogram': asset('spectrogram', 'spectrogram.webp', 'image/webp'),
  };
  species['media'] = media;
  return media;
}

Map<String, dynamic> newerCatalog() {
  final catalog = catalogFixture(media: false, revision: 'a' * 64);
  catalog['generatedAt'] = '2026-11-12T15:00:00.000Z';
  for (final entry in catalog['species'] as List) {
    entry['websiteUrl'] =
        'https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/${entry['id']}';
  }
  return catalog;
}

({List<int> manifest, List<int> bytes, Uri url}) releaseFiles(
  Map<String, dynamic> data,
) {
  final bytes = utf8.encode(jsonEncode(data));
  final hash = sha256.convert(bytes).toString();
  final manifest = {
    'schemaVersion': 1,
    'kind': 'fn-public-catalog',
    'catalogSha256': hash,
    'catalogBytes': bytes.length,
    'revision': data['revision'],
    'generatedAt': data['generatedAt'],
    'speciesCount': (data['species'] as List).length,
  };
  return (
    manifest: utf8.encode(jsonEncode(manifest)),
    bytes: bytes,
    url: PublicCatalogSource.manifestUrl.resolve('$hash.json'),
  );
}

void serveRelease(
  FakeTransport transport,
  Map<String, dynamic> data, {
  bool corrupt = false,
}) {
  final files = releaseFiles(data);
  transport.onMedia = (uri) async* {
    if (uri == PublicCatalogSource.manifestUrl) {
      yield files.manifest;
    } else {
      expect(uri, files.url);
      yield corrupt
          ? [files.bytes.first ^ 1, ...files.bytes.skip(1)]
          : files.bytes;
    }
  };
}

void main() {
  test(
    'an automatic public check can retry after a connection failure',
    () async {
      final directory = await testDirectory();
      addTearDown(() => removeTestDirectory(directory));
      final bundled = catalogFixture(media: false);
      (bundled['species'] as List).removeLast();
      final transport = FakeTransport()
        ..onMedia = (_) async* {
          throw const SocketException('Kein Netz');
        };
      final controller = ExplorerController(
        vault: MemoryVault(),
        transport: transport,
        supportDirectory: directory,
        publicCatalog: Catalog.fromJson(bundled),
        publicCatalogSource: PublicCatalogSource(transport),
      );
      addTearDown(controller.dispose);

      await controller.restore();
      expect(controller.catalog?.species, hasLength(1));
      expect(controller.error, isEmpty);
      expect(transport.mediaRequests, [PublicCatalogSource.manifestUrl]);

      serveRelease(transport, newerCatalog());
      await controller.refreshPublicCatalog(automatic: true);
      expect(controller.catalog?.species, hasLength(2));
      expect(transport.mediaRequests, hasLength(3));

      await controller.refreshPublicCatalog(automatic: true);
      expect(transport.mediaRequests, hasLength(3));
    },
  );

  test('automatic public update persists new species and reopens without the network', () async {
    final directory = await testDirectory();
    addTearDown(() => removeTestDirectory(directory));
    final bundled = catalogFixture(media: false);
    (bundled['species'] as List).removeLast();
    final initial = Catalog.fromJson(bundled);
    final transport = FakeTransport();
    serveRelease(transport, newerCatalog());
    final publicStore = OfflineStore(
      Directory('${directory.path}/public-catalog'),
      transport,
    );
    await publicStore.download(
      initial,
      const OfflineSelection(texts: true),
      onProgress: (_) {},
      cancelled: () => false,
    );

    ExplorerController controllerWith(FakeTransport transport) =>
        ExplorerController(
          vault: MemoryVault(),
          transport: transport,
          supportDirectory: directory,
          publicCatalog: initial,
          publicCatalogSource: PublicCatalogSource(transport),
        );
    final first = controllerWith(transport);
    await first.restore();
    expect(first.catalog?.species.map((entry) => entry.id), [
      'test-art',
      'zweite-art',
    ]);
    expect(first.offline?.catalog.revision, 'a' * 64);
    expect(first.offline?.selection.texts, isTrue);
    expect(first.loggedIn, isFalse);
    expect(transport.requests, isEmpty);
    expect(transport.mediaRequests, hasLength(2));
    await first.refresh();
    expect(
      transport.mediaRequests,
      hasLength(3),
    ); // Same revision, manifest only.
    first.dispose();

    final disconnected = FakeTransport()
      ..onMedia = (_) async* {
        throw const SocketException('Kein Netz');
      };
    final reopened = controllerWith(disconnected);
    addTearDown(reopened.dispose);
    await reopened.restore();
    expect(reopened.catalog?.species, hasLength(2));
    expect(reopened.offline?.healthy, isTrue);
    expect(reopened.error, isEmpty);
  });

  test('public catalog update keeps matching downloaded photos readable while media update is pending', () async {
    final directory = await testDirectory();
    addTearDown(() => removeTestDirectory(directory));
    final bundled = newerCatalog()
      ..['revision'] = 'bundled-catalog'
      ..['generatedAt'] = '2026-10-31T12:00:00.000Z';
    final bundledSpecies = bundled['species'] as List;
    bundledSpecies.removeLast();
    bundledSpecies.first['media']['gallery'] =
        observedCatalogFixture()['species'][0]['media']['gallery'];
    final initial = Catalog.fromJson(bundled);
    final release = newerCatalog();
    final releaseSpecies = release['species'] as List;
    final nextPhotos =
        cloneJson(bundledSpecies.first)['media']['gallery'] as List;
    nextPhotos.last['url'] = (nextPhotos.last['url'] as String).replaceFirst(
      'gallery-one.png',
      'neue-fassung.png',
    );
    releaseSpecies.first['media']['gallery'] = nextPhotos;
    final transport = FakeTransport();
    serveRelease(transport, release);
    final selection = const OfflineSelection(gallery: true);
    final publicStore = OfflineStore(
      Directory('${directory.path}/public-catalog'),
      transport,
    );
    await publicStore.download(
      initial,
      selection,
      onProgress: (_) {},
      cancelled: () => false,
    );
    expect(transport.photoRequests, hasLength(2));

    ExplorerController controllerWith(FakeTransport transport) =>
        ExplorerController(
          vault: MemoryVault(),
          transport: transport,
          supportDirectory: directory,
          publicCatalog: initial,
          publicCatalogSource: PublicCatalogSource(transport),
        );
    final first = controllerWith(transport);
    addTearDown(first.dispose);
    await first.restore();
    expect(first.catalog?.species, hasLength(2));
    expect(first.offline?.catalog.revision, initial.revision);
    expect(first.shouldOfferOfflineUpdate, isTrue);

    final disconnected = FakeTransport()
      ..onMedia = (_) async* {
        throw const SocketException('Kein Netz');
      };
    final reopened = controllerWith(disconnected);
    addTearDown(reopened.dispose);
    await reopened.restore();
    final current = reopened.catalog!.species.first;
    final matching = current.gallery.singleWhere(
      (image) => image.id == 'gallery-two',
    );
    final changed = current.gallery.singleWhere(
      (image) => image.id == 'gallery-one',
    );
    final former = initial.species.first;
    final formerChanged = former.gallery.singleWhere(
      (image) => image.id == changed.id,
    );

    expect(
      await reopened.imageBytes(current, matching, MediaKind.gallery),
      pngBytes,
    );
    expect(reopened.offlineFile(current, changed, MediaKind.gallery), isNull);
    expect(
      reopened.offlineFile(former, formerChanged, MediaKind.gallery),
      isNull,
    );
    final file = reopened.offlineFile(current, matching, MediaKind.gallery)!;
    await file.writeAsBytes(List<int>.filled(pngBytes.length, 0));
    await expectLater(
      reopened.imageBytes(current, matching, MediaKind.gallery),
      throwsFormatException,
    );
    expect(disconnected.mediaRequests, [PublicCatalogSource.manifestUrl]);
    expect(reopened.packageIsCurrent, isFalse);
    await file.writeAsBytes(pngBytes);

    transport.photoRequests.clear();
    await first.download(selection);
    expect(first.packageIsCurrent, isTrue);
    expect(transport.photoRequests.single.path, endsWith('/neue-fassung.png'));
  });

  test(
    'the new catalog keeps downloaded core media when their source is pinned',
    () async {
      final directory = await testDirectory();
      addTearDown(() => removeTestDirectory(directory));
      final bundled = newerCatalog()
        ..['revision'] = 'bundled-catalog'
        ..['generatedAt'] = '2026-10-31T12:00:00.000Z';
      addCoreMedia(bundled, pagesMedia);
      final initial = Catalog.fromJson(bundled);
      final transport = FakeTransport();
      final publicStore = OfflineStore(
        Directory('${directory.path}/public-catalog'),
        transport,
      );
      const selection = OfflineSelection.withoutWebsitePhotos();
      final existing = await publicStore.download(
        initial,
        selection,
        onProgress: (_) {},
        cancelled: () => false,
      );
      expect(existing.verifiedFiles, hasLength(4));
      expect(
        existing.bindings.values.map((entry) => entry.sourceUrl),
        everyElement(startsWith(pagesMedia)),
      );

      final updated = newerCatalog();
      addCoreMedia(updated, pinnedMedia);
      serveRelease(transport, updated);
      transport.mediaRequests.clear();
      final controller = ExplorerController(
        vault: MemoryVault(),
        transport: transport,
        supportDirectory: directory,
        publicCatalog: initial,
        publicCatalogSource: PublicCatalogSource(transport),
      );
      addTearDown(controller.dispose);
      await controller.restore();
      expect(controller.catalog?.revision, updated['revision']);
      final current = controller.catalog!.species.first;
      final refs = current.media.toList();
      expect(refs, hasLength(4));
      for (final ref in refs) {
        expect(ref.media.url.toString(), startsWith(pinnedMedia));
        final file = controller.offlineFile(current, ref.media, ref.kind);
        expect(file?.path, existing.verifiedFiles[ref.key]?.path);
        expect(await file!.readAsBytes(), pngBytes);
      }
      expect(
        await controller.imageBytes(current, current.map!, MediaKind.map),
        pngBytes,
      );
      expect(transport.mediaRequests, hasLength(2));

      await controller.download(selection);
      expect(controller.packageIsCurrent, isTrue);
      expect(
        controller.offline!.bindings.values.map((entry) => entry.sourceUrl),
        everyElement(startsWith(pinnedMedia)),
      );
      expect(transport.mediaRequests, hasLength(2));
      expect(transport.requests, isEmpty);
      expect(transport.protectedRequests, isEmpty);
    },
  );

  test('pinned media require the exact repository, commit, path, role and byte proof', () async {
    final transport = FakeTransport();
    final source = PublicCatalogSource(transport);
    final validUrl = '$pinnedMedia/Test%20Kauz/portrait.webp';
    final variants = {
      'other host': validUrl.replaceFirst(
        'raw.githubusercontent.com',
        'cdn.example.com',
      ),
      'other owner': validUrl.replaceFirst('/felixkfm90/', '/other-owner/'),
      'other repository': validUrl.replaceFirst(
        '/iucn-species-data/',
        '/other-repo/',
      ),
      'branch': validUrl.replaceFirst('/${'a' * 40}/', '/main/'),
      'short commit': validUrl.replaceFirst('/${'a' * 40}/', '/${'a' * 39}/'),
      'uppercase commit': validUrl.replaceFirst(
        '/${'a' * 40}/',
        '/${'A' * 40}/',
      ),
      'other directory': validUrl.replaceFirst('/species-assets/', '/private/'),
      'wrong role': validUrl.replaceFirst('portrait.webp', 'spectrogram.webp'),
      'nested folder': validUrl.replaceFirst('/Test%20Kauz/', '/Test/Kauz/'),
      'escaped separator': validUrl.replaceFirst('Test%20Kauz', 'Test%2FKauz'),
      'escaped backslash': validUrl.replaceFirst('Test%20Kauz', 'Test%5CKauz'),
      'control in folder': validUrl.replaceFirst('Test%20Kauz', 'Test%00Kauz'),
      'query': '$validUrl?source=anything',
      'fragment': '$validUrl#picture',
      'port': validUrl.replaceFirst(
        'githubusercontent.com',
        'githubusercontent.com:8443',
      ),
      'credentials': validUrl.replaceFirst('https://', 'https://anyone@'),
    };
    for (final variant in variants.entries) {
      final release = newerCatalog();
      final media = addCoreMedia(release, pinnedMedia);
      media['portrait']['url'] = variant.value;
      serveRelease(transport, release);
      await expectLater(
        source.loadNewer(null),
        throwsFormatException,
        reason: variant.key,
      );
    }

    for (final origin in [pagesMedia, pinnedMedia]) {
      for (final field in ['bytes', 'sha256']) {
        final release = newerCatalog();
        final media = addCoreMedia(release, origin);
        (media['portrait'] as Map).remove(field);
        serveRelease(transport, release);
        await expectLater(
          source.loadNewer(null),
          throwsFormatException,
          reason: field,
        );
      }
      for (final invalidSize in [0, 32 * 1024 * 1024 + 1]) {
        final release = newerCatalog();
        final media = addCoreMedia(release, origin);
        media['portrait']['bytes'] = invalidSize;
        serveRelease(transport, release);
        await expectLater(
          source.loadNewer(null),
          throwsFormatException,
          reason: '$invalidSize',
        );
      }
    }

    final legacy = newerCatalog();
    addCoreMedia(legacy, pagesMedia);
    serveRelease(transport, legacy);
    expect(
      (await source.loadNewer(null))?.catalog.species.first.media,
      hasLength(4),
    );
  });

  test(
    'integrity failures and private references never replace a public catalog',
    () async {
      final transport = FakeTransport();
      final source = PublicCatalogSource(transport);
      serveRelease(transport, newerCatalog(), corrupt: true);
      await expectLater(source.loadNewer(null), throwsFormatException);
      expect(transport.mediaRequests, hasLength(2));
      serveRelease(transport, {
        ...newerCatalog(),
        'projectId': 'private-project',
      });
      await expectLater(source.loadNewer(null), throwsFormatException);
      final foreign = newerCatalog();
      final species = (foreign['species'] as List).first;
      species['media']['portrait'] = mediaFixture('private-reference');
      await expectLater(() async {
        serveRelease(transport, foreign);
        await source.loadNewer(null);
      }(), throwsFormatException);
    },
  );

  test(
    'a payload removed by Pages deployment resolves to the newer release',
    () async {
      final before = releaseFiles(newerCatalog());
      final published = newerCatalog()
        ..['revision'] = 'b' * 64
        ..['generatedAt'] = '2026-11-12T16:00:00.000Z';
      final after = releaseFiles(published);
      final index = PublicCatalogSource.manifestUrl;
      var indexReads = 0;
      final transport = FakeTransport()
        ..onMedia = (uri) async* {
          if (uri == index) {
            yield indexReads++ == 0 ? before.manifest : after.manifest;
          } else if (uri == before.url) {
            throw const ProjectApiException(404, 'Katalogdatei ersetzt');
          } else {
            expect(uri, after.url);
            yield after.bytes;
          }
        };
      final result = await PublicCatalogSource(transport).loadNewer(null);
      expect(result?.catalog.revision, published['revision']);
      expect(transport.mediaRequests, [index, before.url, index, after.url]);
    },
  );

  test(
    'a missing payload retains the failure without a different, newer release',
    () async {
      final before = releaseFiles(newerCatalog());
      final sameTime = releaseFiles(newerCatalog()..['revision'] = 'b' * 64);
      final index = PublicCatalogSource.manifestUrl;
      const missing = ProjectApiException(404, 'Katalogdatei fehlt');
      for (final replacement in [before.manifest, sameTime.manifest, null]) {
        var indexReads = 0;
        final transport = FakeTransport()
          ..onMedia = (uri) async* {
            if (uri == index) {
              if (indexReads++ == 0) {
                yield before.manifest;
              } else if (replacement != null) {
                yield replacement;
              } else {
                throw const ProjectApiException(404, 'Freigabedatei fehlt');
              }
            } else {
              expect(uri, before.url);
              throw missing;
            }
          };
        await expectLater(
          PublicCatalogSource(transport).loadNewer(null),
          throwsA(same(missing)),
        );
        expect(transport.mediaRequests, [index, before.url, index]);
      }
    },
  );

  test(
    'a missing release index leaves the existing public catalog available',
    () async {
      final transport = FakeTransport()
        ..onMedia = (_) async* {
          throw const ProjectApiException(
            404,
            'Noch keine öffentliche Ausgabe',
          );
        };
      expect(await PublicCatalogSource(transport).loadNewer(null), isNull);
      expect(transport.mediaRequests, [PublicCatalogSource.manifestUrl]);
    },
  );
}
