import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:crypto/crypto.dart' as crypto;

import 'support.dart';

class _TransportWithoutPhotos implements ProjectTransport {
  @override
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  }) => throw StateError('This fixture must not request project data.');
  @override
  Stream<List<int>> media(Uri uri) => throw StateError(
    'This fixture must not fall back to an unchecked photo stream.',
  );
  @override
  void close() {}
}

void main() {
  late Directory directory;
  late FakeTransport transport;
  late OfflineStore store;
  final catalog = Catalog.fromJson(catalogFixture());
  const selection = OfflineSelection.withoutWebsitePhotos();
  Future<OfflineSnapshot> download({
    Catalog? input,
    OfflineSelection chosen = selection,
    bool Function()? cancelled,
  }) => store.download(
    input ?? catalog,
    chosen,
    onProgress: (_) {},
    cancelled: cancelled ?? () => false,
  );
  setUp(() async {
    directory = await testDirectory();
    transport = FakeTransport();
    store = OfflineStore(directory, transport);
  });
  tearDown(() => removeTestDirectory(directory));
  test('Paket wird vollständig gehasht und nach Wiederöffnung kataloggebunden gelesen', () async {
    final progress = <OfflineProgress>[];
    final snapshot = await store.download(
      catalog,
      selection,
      onProgress: progress.add,
      cancelled: () => false,
    );
    expect(snapshot.healthy, true);
    expect(snapshot.verifiedFiles.length, 3);
    expect(progress.last.completeFiles, 3);
    expect(progress.last.totalFiles, 3);
    final reopened = await OfflineStore(
      directory,
      FakeTransport(),
    ).readPackage();
    expect(reopened!.catalog.revision, catalog.revision);
    expect(reopened.selection.gallery, false);
    expect(
      reopened.catalog.species.first.sections.first.text,
      'Ausschließlich synthetischer Testtext.',
    );
    expect(await store.occupiedBytes(), greaterThan(0));
  });
  test(
    'Geprüfte gleiche Inhalte werden wiederverwendet statt erneut geladen',
    () async {
      await download();
      final calls = transport.mediaRequests.length;
      await download();
      expect(transport.mediaRequests.length, calls);
    },
  );
  test(
    'Neue Revision mit kaputtem Hash ersetzt das vorige Paket nicht',
    () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      final input = catalogFixture(revision: 'fixture-2');
      input['species'][0]['media']['portrait']['sha256'] = 'a' * 64;
      await expectLater(
        download(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
      expect((await store.readPackage())!.healthy, true);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    },
  );
  test('Netzfehler erhält vorherigen Katalog und Dateien', () async {
    await download();
    final before = await File('${directory.path}/package.json').readAsBytes();
    final input = catalogFixture(revision: 'fixture-2');
    input['species'][0]['media']['portrait']['sha256'] = 'b' * 64;
    transport.onMedia = (_) =>
        Stream.error(const SocketException('synthetic offline'));
    await expectLater(
      download(input: Catalog.fromJson(input)),
      throwsA(isA<SocketException>()),
    );
    expect(await File('${directory.path}/package.json').readAsBytes(), before);
  });
  test(
    'Abbruch lässt keinen vollständigen neuen Paketstand entstehen',
    () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      await expectLater(
        download(cancelled: () => true),
        throwsA(isA<DownloadCancelled>()),
      );
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
    },
  );
  test(
    'Abbruch während eines Streams räumt nur die eigene Teildatei auf',
    () async {
      var cancelled = false;
      transport.onMedia = (_) async* {
        yield pngBytes.sublist(0, 10);
        cancelled = true;
        yield pngBytes.sublist(10);
      };
      await expectLater(
        download(cancelled: () => cancelled),
        throwsA(isA<DownloadCancelled>()),
      );
      expect(await File('${directory.path}/package.json').exists(), false);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    },
  );
  for (final length in [1, pngBytes.length + 1]) {
    test('Angekündigte Dateigröße $length muss exakt stimmen', () async {
      final input = catalogFixture();
      input['species'][0]['media']['portrait']['bytes'] = length;
      await expectLater(
        download(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(await File('${directory.path}/package.json').exists(), false);
    });
  }
  test('Fehlende Prüfsumme verhindert Download vor dem ersten Abruf', () async {
    final input = catalogFixture();
    input['species'][0]['media']['portrait'].remove('sha256');
    await expectLater(
      download(input: Catalog.fromJson(input)),
      throwsFormatException,
    );
    expect(transport.mediaRequests, isEmpty);
  });
  test(
    'Nachträgliche Beschädigung bleibt bei Wiederöffnung sichtbar',
    () async {
      final snapshot = await download();
      await snapshot.verifiedFiles.values.first.writeAsString('broken');
      final reopened = await store.readPackage();
      expect(reopened!.healthy, false);
      expect(reopened.missingFiles, isNotEmpty);
      expect(reopened.catalog.species.first.sections, isNotEmpty);
    },
  );
  test('Fehlende Datei wird niemals als offline verfügbar bestätigt', () async {
    final snapshot = await download();
    await snapshot.verifiedFiles.values.first.delete();
    final reopened = await store.readPackage();
    expect(reopened!.healthy, false);
    expect(reopened.missingFiles, isNotEmpty);
  });
  test('Abwahl der Fachtexte wird nach Wiederöffnung erhalten', () async {
    await download(chosen: const OfflineSelection(texts: false, maps: true));
    final reopened = await store.readPackage();
    expect(reopened!.selection.texts, false);
    expect(reopened.catalog.species.first.sections, isEmpty);
    expect(reopened.catalog.species.first.taxonomy, isEmpty);
  });
  test('Basiskatalog bleibt getrennt vom vollständigen Offlinepaket', () async {
    await store.saveIndex(catalog);
    expect((await store.readIndex())!.species.first.sections, isEmpty);
    expect(await store.readPackage(), isNull);
  });
  test(
    'Paketentfernung behält Artenliste und unbekannte lokale Datei',
    () async {
      await store.saveIndex(catalog);
      await download();
      final unrelated = File('${directory.path}/media/diagnose.txt');
      await unrelated.writeAsString('keep');
      await store.removePackage();
      expect(await store.readPackage(), isNull);
      expect(await store.readIndex(), isNotNull);
      expect(await unrelated.readAsString(), 'keep');
    },
  );
  test('Gleichzeitiger Paketauftrag wird nicht doppelt gestartet', () async {
    final gate = Completer<void>();
    transport.onMedia = (_) async* {
      await gate.future;
      yield pngBytes;
    };
    final first = download();
    await Future<void>.delayed(Duration.zero);
    await expectLater(download(), throwsStateError);
    gate.complete();
    await first;
  });
  test('zweiter Store für denselben Pfad kann laufenden Auftrag weder ersetzen noch entfernen', () async {
    final gate = Completer<void>();
    transport.onMedia = (_) async* {
      await gate.future;
      yield pngBytes;
    };
    final first = download();
    final competing = OfflineStore(directory, FakeTransport());
    try {
      await expectLater(
        competing.download(
          catalog,
          selection,
          onProgress: (_) {},
          cancelled: () => false,
        ),
        throwsStateError,
      );
      await expectLater(competing.removePackage(), throwsStateError);
    } finally {
      gate.complete();
      await first;
    }
  });
  test('Inventar trennt gewählte Katalogmengen, tatsächlich geprüfte Dateien und realen Appspeicher', () async {
    final empty = await store.inventory(catalog);
    expect(empty.categories.keys, containsAll(MediaKind.values));
    expect(empty.totalFiles, 5);
    expect(empty.verifiedFiles, 0);
    expect(empty.missingFiles, 5);
    expect(empty.knownBytes, 5 * pngBytes.length);
    expect(empty.unknownSizeFiles, 0);
    await store.saveIndex(catalog);
    await download();
    final extra = File('${directory.path}/diagnose.partial');
    await extra.writeAsString('keep');
    final current = await store.inventory(catalog);
    expect(current.verifiedFiles, 3);
    expect(current.missingFiles, 2);
    expect(current[MediaKind.portrait].verifiedFiles, 1);
    expect(current[MediaKind.gallery].verifiedFiles, 0);
    expect(current[MediaKind.gallery].storedBytes, 0);
    // Portrait and map have identical hash+extension; audio uses its own filename.
    expect(current.storedBytes, 2 * pngBytes.length);
    expect(current[MediaKind.map].storedBytes, pngBytes.length);
    expect(current.resumableFiles, 0);
    expect(current.resumableBytes, 0);
    expect(current.stageBytes, 4);
    var realBytes = 0;
    await for (final entry in directory.list(
      recursive: true,
      followLinks: false,
    )) {
      if (entry is File) realBytes += await entry.length();
    }
    expect(current.appDataBytes, realBytes);
    expect(await store.occupiedBytes(), realBytes);
    // Only a completed replacement commits a smaller selection.
    expect((await store.inventory(catalog)).verifiedFiles, 3);
    await download(chosen: const OfflineSelection());
    final replaced = await store.inventory(catalog);
    expect(replaced.verifiedFiles, 0);
    expect(replaced.storedBytes, 0);
    expect(await extra.readAsString(), 'keep');
  });
  test('leere Kategorien bleiben im Inventar vorhanden', () async {
    final inventory = await store.inventory(
      Catalog.fromJson(catalogFixture(media: false)),
    );
    for (final kind in MediaKind.values) {
      expect(inventory[kind].totalFiles, 0);
      expect(inventory[kind].missingFiles, 0);
      expect(inventory[kind].unknownSizeFiles, 0);
    }
  });
  test('Privater Cache wird nach Projektursprung und Person getrennt', () {
    final server = Uri.parse('https://one.invalid');
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(OfflineStore.projectKey(server, 'b', projectId: 'one')),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(
        OfflineStore.projectKey(
          Uri.parse('https://two.invalid'),
          'a',
          projectId: 'one',
        ),
      ),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(OfflineStore.projectKey(server, 'a', projectId: 'two')),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      OfflineStore.projectKey(
        Uri.parse('https://ONE.invalid:443/'),
        'a',
        projectId: 'one',
      ),
    );
  });
  group('beobachtete öffentliche Galeriefassungen', () {
    const galleryOnly = OfflineSelection(texts: true, gallery: true);
    OfflineStore photoStore() => OfflineStore(
      directory,
      transport,
      photoValidator: (bytes, mime) async => RasterPhoto(mime, 1, 1),
    );
    Future<OfflineSnapshot> observed({
      Catalog? input,
      bool Function()? cancelled,
    }) => photoStore().download(
      input ?? Catalog.fromJson(observedCatalogFixture()),
      galleryOnly,
      onProgress: (_) {},
      cancelled: cancelled ?? () => false,
    );
    test('hashlose bekannte Galerie lädt getrennte Beobachtungsbelege und lässt den Katalog unverändert', () async {
      final input = Catalog.fromJson(observedCatalogFixture()),
          before = input.encode();
      final snapshot = await observed(input: input);
      expect(input.encode(), before);
      expect(input.species.first.gallery.first.sha256, isNull);
      expect(snapshot.observedPhotoCount, 2);
      expect(snapshot.healthy, true);
      expect(transport.photoRequests.length, 2);
      expect(transport.mediaRequests, isEmpty);
      final manifest = jsonDecode(
        await File('${directory.path}/package.json').readAsString(),
      );
      expect(manifest['schemaVersion'], 3);
      expect(manifest['photoProfile'], WebsitePhotoPolicy.offlineProfile);
      expect(
        manifest['catalog']['species'][0]['media']['gallery'][0]['sha256'],
        isNull,
      );
      for (final binding in snapshot.bindings.values) {
        expect(binding.provenance, 'observed-public-website');
        expect(binding.sha256, crypto.sha256.convert(pngBytes).toString());
        expect(binding.bytes, pngBytes.length);
        expect(binding.observedAt, isNotNull);
        expect(binding.mimeType, 'image/png');
        expect(binding.width, 1);
        expect(binding.height, 1);
        expect(Uri.parse(binding.sourceUrl).queryParameters['format'], '1500w');
        expect(
          Uri.parse(binding.downloadUrl!).queryParameters['format'],
          '750w',
        );
      }
      final reopened = await photoStore().readPackage();
      expect(reopened!.healthy, true);
      expect(reopened.observedPhotoCount, 2);
      final reference = reopened.catalog.species.first.media.firstWhere(
        (entry) => entry.kind == MediaKind.gallery,
      );
      expect(await photoStore().verifiedImage(reopened, reference), pngBytes);
    });
    test('gleiche Websitefotos behalten die geprüfte Fassung und ihren Beobachtungszeitpunkt', () async {
      final before = await observed();
      expect(transport.photoRequests.length, 2);
      final after = await observed();
      expect(transport.photoRequests.length, 2);
      expect(
        after.bindings.values.map((entry) => entry.observedAt),
        before.bindings.values.map((entry) => entry.observedAt),
      );
    });
    test('neue Spektrogramme laden einzeln ohne vorhandene Aufnahmen oder Websitefotos erneut abzurufen', () async {
      final input = observedCatalogFixture();
      final media = input['species'][0]['media'] as Map;
      media['sounds'] = [mediaFixture('sound', extension: 'mp3')];
      const chosen = OfflineSelection(sounds: true, gallery: true);
      await download(input: Catalog.fromJson(input), chosen: chosen);
      final spectrogram = [1, 2, 3, 4, 5];
      media['spectrogram'] = {
        ...mediaFixture('spectrogram', extension: 'webp', bytes: spectrogram),
        'mimeType': 'image/webp',
      };
      final updated = Catalog.fromJson(input);
      final previousInventory = await photoStore().inventory(updated);
      final soundFiles = updated.species.first.media.where(
        (entry) => entry.kind == MediaKind.sound,
      );
      expect(
        soundFiles
            .where(
              (entry) => previousInventory.verifiedKeys.contains(entry.key),
            )
            .map((entry) => entry.media.id),
        ['sound'],
      );
      transport.onMedia = (_) => Stream.value(spectrogram);
      transport.mediaRequests.clear();
      final progress = <OfflineProgress>[];
      final after = await photoStore().download(
        updated,
        chosen,
        onProgress: progress.add,
        cancelled: () => false,
      );
      expect(after.healthy, true);
      expect(transport.photoRequests.length, 2);
      expect(transport.mediaRequests.single.path, '/spectrogram.webp');
      expect(progress.last.completeFiles, 1);
      expect(progress.last.totalFiles, 1);
      expect(progress.last.receivedBytes, spectrogram.length);
    });
    test('Papierkorb entfernt lokal nur die gewählte Kategorie und erhält gemeinsam verwendete Dateien', () async {
      final input = Catalog.fromJson(observedCatalogFixture());
      final uniquePhoto = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaHD4DwADBAFa3jL0JAAAAABJRU5ErkJggg==',
      );
      transport.onPhoto = (uri) async {
        final bytes = uri.path.endsWith('gallery-one.png')
            ? uniquePhoto
            : pngBytes;
        return WebsitePhotoResponse(
          sourceUrl: uri,
          mimeType: 'image/png',
          contentLength: bytes.length,
          body: Stream.value(bytes),
        );
      };
      final before = await photoStore().download(
        input,
        const OfflineSelection(maps: true, gallery: true),
        onProgress: (_) {},
        cancelled: () => false,
      );
      final photo = before.verifiedFiles.entries
          .firstWhere((entry) => entry.key.endsWith('gallery-one'))
          .value;
      final map = before.verifiedFiles.entries
          .firstWhere((entry) => entry.key.endsWith('/map/map'))
          .value;
      expect(await photo.exists(), true);
      final mediaRequests = transport.mediaRequests.length;
      final photoRequests = transport.photoRequests.length;
      final after = await photoStore().removeCategory(
        MediaKind.gallery,
        expected: before,
        currentCatalog: input,
      );
      expect(after.selection.gallery, false);
      expect(after.selection.maps, true);
      expect(after.healthy, true);
      expect(after.verifiedFiles.values.single.path, map.path);
      expect(await map.exists(), true);
      expect(await photo.exists(), false);
      expect(transport.mediaRequests.length, mediaRequests);
      expect(transport.photoRequests.length, photoRequests);
      await expectLater(
        photoStore().removeCategory(
          MediaKind.gallery,
          expected: before,
          currentCatalog: input,
        ),
        throwsFormatException,
      );
    });
    test('Offline-Neubefund: Wiederaufnahme lädt fertig geprüftes erstes Websitefoto nicht erneut', () async {
      var requests = 0;
      transport.onPhoto = (uri) async {
        requests++;
        if (requests == 2) {
          throw const SocketException('synthetic interrupted job');
        }
        return WebsitePhotoResponse(
          sourceUrl: uri,
          mimeType: 'image/png',
          contentLength: pngBytes.length,
          body: Stream<List<int>>.value(pngBytes),
        );
      };
      await expectLater(observed(), throwsA(isA<SocketException>()));
      expect(await File('${directory.path}/package.json').exists(), false);
      final resumed = await observed(); // New store instance, not an in-memory continuation.
      expect(resumed.healthy, true);
      expect(transport.photoRequests.length, 3);
    });
    test('Offline-Neubefund: Websitefoto lädt750w und Ursprungskatalog bleibt1500w', () async {
      final input = Catalog.fromJson(observedCatalogFixture());
      final before = input.encode();
      await observed(input: input);
      expect(
        transport.photoRequests.map((uri) => uri.queryParameters['format']),
        everyElement('750w'),
      );
      expect(input.encode(), before);
      expect(
        input.species.first.gallery.first.url!.queryParameters['format'],
        '1500w',
      );
    });
    Future<void> interruptAfterFirstPhoto() async {
      var requests = 0;
      transport.onPhoto = (uri) async {
        if (++requests == 2) {
          throw const SocketException('synthetic interrupted job');
        }
        return WebsitePhotoResponse(
          sourceUrl: uri,
          mimeType: 'image/png',
          contentLength: pngBytes.length,
          body: Stream<List<int>>.value(pngBytes),
        );
      };
      await expectLater(observed(), throwsA(isA<SocketException>()));
      transport.onPhoto = null;
    }

    test('Fortsetzungsjournal ist nach jeder verifizierten Datei dauerhaft und originalgebunden', () async {
      await interruptAfterFirstPhoto();
      final ledger = jsonDecode(
        await File('${directory.path}/resume.json').readAsString(),
      );
      expect(ledger['catalogRevision'], 'fixture-gallery-1');
      expect(ledger['photoProfile'], WebsitePhotoPolicy.offlineProfile);
      expect(ledger['files'].length, 1);
      expect(ledger['references'].length, 2);
      expect(
        ledger['catalog']['species'][0]['media']['gallery'][0]['sha256'],
        isNull,
      );
      final before = await photoStore().inventory(
        Catalog.fromJson(observedCatalogFixture()),
      );
      expect(before[MediaKind.gallery].verifiedFiles, 0);
      expect(before[MediaKind.gallery].resumableFiles, 1);
      expect(before[MediaKind.gallery].resumableBytes, pngBytes.length);
      expect(before[MediaKind.gallery].knownBytes, pngBytes.length);
      expect(before[MediaKind.gallery].unknownSizeFiles, 1);
      await observed();
      expect(await File('${directory.path}/resume.json').exists(), false);
    });
    test('gleiche Revision mit geändertem Text oder Bildbezug darf ein altes Journal nicht wiederverwenden', () async {
      for (final change in ['text', 'source', 'profile', 'intent']) {
        await store.removePackage();
        transport.photoRequests.clear();
        await interruptAfterFirstPhoto();
        final input = observedCatalogFixture();
        if (change == 'text') {
          input['species'][0]['sections'][0]['text'] =
              'Anderer synthetischer Text.';
        }
        if (change == 'source') {
          input['species'][0]['media']['gallery'][0]['url'] =
              input['species'][0]['media']['gallery'][0]['url'].replaceFirst(
                '.png',
                '-changed.png',
              );
        }
        if (change == 'profile' || change == 'intent') {
          final file = File('${directory.path}/resume.json');
          final value = jsonDecode(await file.readAsString());
          value[change == 'profile' ? 'photoProfile' : 'intentKey'] =
              'not-the-bound-intent';
          await file.writeAsString(jsonEncode(value));
        }
        await observed(input: Catalog.fromJson(input));
        expect(transport.photoRequests.length, 4, reason: change);
      }
    });
    test('Auswahlwechsel entwertet den bisherigen Resumeauftrag auch bei gleicher Galerie', () async {
      await interruptAfterFirstPhoto();
      await photoStore().download(
        Catalog.fromJson(observedCatalogFixture()),
        const OfflineSelection(texts: false, gallery: true),
        onProgress: (_) {},
        cancelled: () => false,
      );
      expect(transport.photoRequests.length, 4);
      expect((await photoStore().readPackage())!.selection.texts, false);
    });
    test('beschädigte fortsetzbare Datei wird neu geladen und niemals als geprüft gezählt', () async {
      await interruptAfterFirstPhoto();
      final value = jsonDecode(
        await File('${directory.path}/resume.json').readAsString(),
      );
      final binding = (value['files'] as Map).values.single;
      await File(
        '${directory.path}/media/${binding['sha256']}${binding['extension']}',
      ).writeAsString('corrupt');
      final inventory = await photoStore().inventory(
        Catalog.fromJson(observedCatalogFixture()),
      );
      expect(inventory.resumableFiles, 0);
      expect(inventory[MediaKind.gallery].unknownSizeFiles, 2);
      await observed();
      expect(transport.photoRequests.length, 4);
      expect((await photoStore().readPackage())!.healthy, true);
    });
    test('voriges fertiges Paket bleibt bei unterbrochenem neuem Auftrag bytegleich erhalten', () async {
      await download();
      final package = File('${directory.path}/package.json');
      final before = await package.readAsBytes();
      await interruptAfterFirstPhoto();
      expect(await package.readAsBytes(), before);
      expect((await store.readPackage())!.healthy, true);
      await observed();
      expect(transport.photoRequests.length, 3);
    });
    test('übrig gebliebenes Journal zählt nach Abschluss nur als verifiziertes Paket', () async {
      await interruptAfterFirstPhoto();
      final ledger = File('${directory.path}/resume.json');
      final before = await ledger.readAsBytes();
      await observed();
      expect(transport.photoRequests.length, 3);
      await ledger.writeAsBytes(
        before,
      ); // Simulates process death directly after package commit.
      expect(
        (await photoStore().inventory(
          Catalog.fromJson(observedCatalogFixture()),
        )).resumableFiles,
        0,
      );
      await observed();
      expect(transport.photoRequests.length, 3);
    });
    test('kleinere Downloadfassung übernimmt keine Größenbehauptung der1500w-Quelle', () async {
      final value = observedCatalogFixture();
      for (final photo in value['species'][0]['media']['gallery']) {
        photo['bytes'] = 1;
      }
      final input = Catalog.fromJson(value);
      expect(
        (await photoStore().inventory(input))[MediaKind.gallery].knownBytes,
        0,
      );
      final result = await observed(input: input);
      expect(
        result.bindings.values.every(
          (binding) => binding.bytes == pngBytes.length,
        ),
        true,
      );
      expect(
        input.species.first.gallery.every((photo) => photo.bytes == 1),
        true,
      );
    });
    test('V2-Websitepaket bleibt lesbar und neue Downloadadresse kann nicht auf andere Quelle zeigen', () async {
      await observed();
      final file = File('${directory.path}/package.json');
      final original = jsonDecode(await file.readAsString());
      final legacy = jsonDecode(jsonEncode(original));
      legacy['schemaVersion'] = 2;
      legacy.remove('photoProfile');
      legacy.remove('downloadJobId');
      for (final binding in (legacy['files'] as Map).values) {
        binding.remove('downloadUrl');
      }
      await file.writeAsString(jsonEncode(legacy));
      expect((await photoStore().readPackage())!.healthy, true);
      final key = (original['files'] as Map).keys.first;
      original['files'][key]['downloadUrl'] =
          original['files'][key]['sourceUrl'];
      await file.writeAsString(jsonEncode(original));
      await expectLater(photoStore().readPackage(), throwsFormatException);
    });
    test('Entfernen räumt eigenen Resumeauftrag auf und behält fremde lokale Diagnose', () async {
      await store.saveIndex(catalog);
      await interruptAfterFirstPhoto();
      final ownPartial = File(
        '${directory.path}/download-1234567890123456-123.partial',
      );
      final unrelated = File('${directory.path}/diagnose.partial');
      await ownPartial.writeAsString('incomplete');
      await unrelated.writeAsString('keep');
      await photoStore().removePackage();
      expect(await File('${directory.path}/resume.json').exists(), false);
      expect(await ownPartial.exists(), false);
      expect(await unrelated.readAsString(), 'keep');
      expect(await store.readIndex(), isNotNull);
      final inventory = await photoStore().inventory(
        Catalog.fromJson(observedCatalogFixture()),
      );
      expect(inventory.resumableFiles, 0);
      expect(inventory.storedBytes, 0);
      expect(inventory[MediaKind.gallery].unknownSizeFiles, 2);
    });
    test('Alles ohne Websitefotos ruft keine Galeriequelle ab und behält seine bisherigen Defaults', () async {
      final snapshot = await download(
        input: Catalog.fromJson(observedCatalogFixture()),
      );
      expect(snapshot.observedPhotoCount, 0);
      expect(snapshot.selection.gallery, false);
      expect(transport.photoRequests, isEmpty);
      expect(const OfflineSelection().gallery, false);
    });
    test('fehlender Hash außerhalb Galerie oder fremder Galeriehost bleibt vor Abruf gesperrt', () async {
      final input = observedCatalogFixture();
      input['species'][0]['media']['gallery'][0]['url'] =
          'https://other.invalid/photo.jpg';
      await expectLater(
        observed(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(transport.photoRequests, isEmpty);
    });
    test('fehlender sicherer Fototransport erhält das vorhandene Offlinepaket ohne allgemeinen Medienrückfall', () async {
      await download();
      final package = File('${directory.path}/package.json');
      final before = await package.readAsBytes();
      final legacy = OfflineStore(directory, _TransportWithoutPhotos());
      await expectLater(
        legacy.download(
          Catalog.fromJson(observedCatalogFixture()),
          galleryOnly,
          onProgress: (_) {},
          cancelled: () => false,
        ),
        throwsFormatException,
      );
      expect(await package.readAsBytes(), before);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    });
    test('neue Websiteantwort darf Größe ändern, aber nicht einen mitgelieferten erwarteten Hash ersetzen', () async {
      final input = observedCatalogFixture();
      input['species'][0]['media']['gallery'][0]['sha256'] = 'a' * 64;
      await expectLater(
        observed(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(await File('${directory.path}/package.json').exists(), false);
    });
    test('HTML-/SVG-Antwort, MIME-Widerspruch und falsche Länge ersetzen kein vorhandenes Paket', () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      for (final mode in ['html', 'mime', 'length', 'empty', 'large']) {
        transport.onPhoto = (uri) async => WebsitePhotoResponse(
          sourceUrl: uri,
          mimeType: mode == 'html'
              ? 'text/html'
              : mode == 'mime'
              ? 'image/jpeg'
              : 'image/png',
          contentLength: mode == 'length'
              ? 1
              : mode == 'empty'
              ? 0
              : mode == 'large'
              ? WebsitePhotoPolicy.maximumBytes + 1
              : pngBytes.length,
          body: Stream<List<int>>.value(
            mode == 'html' ? utf8.encode('<svg onload="x"/>') : pngBytes,
          ),
        );
        await expectLater(observed(), throwsFormatException);
        expect(
          await File('${directory.path}/package.json').readAsBytes(),
          before,
        );
      }
    });
    test('auch ohne Größenankündigung stoppt die tatsächliche Byteobergrenze vor dem Paketabschluss', () async {
      transport.onPhoto = (uri) async => WebsitePhotoResponse(
        sourceUrl: uri,
        mimeType: 'image/png',
        contentLength: null,
        body: Stream<List<int>>.value(
          Uint8List(WebsitePhotoPolicy.maximumBytes + 1),
        ),
      );
      await expectLater(observed(), throwsFormatException);
      expect(await File('${directory.path}/package.json').exists(), false);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    });
    test('Abbruch und Verbindungsfehler erhalten den vorigen Abschluss und entfernen Teildateien', () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      var cancel = false;
      transport.onPhoto = (uri) async => WebsitePhotoResponse(
        sourceUrl: uri,
        mimeType: 'image/png',
        contentLength: null,
        body: (() async* {
          yield pngBytes.sublist(0, 10);
          cancel = true;
          yield pngBytes.sublist(10);
        })(),
      );
      await expectLater(
        observed(cancelled: () => cancel),
        throwsA(isA<DownloadCancelled>()),
      );
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
      transport.onPhoto = (uri) async =>
          throw const SocketException('synthetic offline');
      await expectLater(observed(), throwsA(isA<SocketException>()));
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
    });
    test('Manipulation nach Wiederöffnung wird bei tatsächlicher Wiedergabe erneut erkannt', () async {
      final snapshot = await observed(),
          reference = snapshot.catalog.species.first.media.firstWhere(
            (entry) => entry.kind == MediaKind.gallery,
          );
      final file = snapshot.verifiedFiles[reference.key]!;
      await file.writeAsBytes(List<int>.filled(pngBytes.length, 0));
      await expectLater(
        photoStore().verifiedImage(snapshot, reference),
        throwsFormatException,
      );
      expect((await photoStore().readPackage())!.healthy, false);
    });
    test('URL-/Belegherkunft in Manifest kann nicht als andere Galerie oder Projektprüfsumme umgedeutet werden', () async {
      await observed();
      final file = File('${directory.path}/package.json'),
          original = await file.readAsString();
      final changed = jsonDecode(original);
      final key = (changed['files'] as Map).keys.first;
      changed['files'][key]['sourceUrl'] = 'https://example.invalid/x.png';
      await file.writeAsString(jsonEncode(changed));
      await expectLater(photoStore().readPackage(), throwsFormatException);
      final wrongKind = jsonDecode(original);
      wrongKind['files'][key]['provenance'] = 'catalog-sha256';
      await file.writeAsString(jsonEncode(wrongKind));
      await expectLater(photoStore().readPackage(), throwsFormatException);
    });
  });
  test(
    'bestehendes V1-Paket bleibt mit seinen erwarteten Kataloghashes lesbar',
    () async {
      await download();
      final file = File('${directory.path}/package.json');
      final value = jsonDecode(await file.readAsString());
      value['schemaVersion'] = 1;
      value.remove('files');
      await file.writeAsString(jsonEncode(value));
      final reopened = await store.readPackage();
      expect(reopened!.healthy, true);
      expect(reopened.observedPhotoCount, 0);
      expect(reopened.verifiedFiles.length, 3);
    },
  );
}
