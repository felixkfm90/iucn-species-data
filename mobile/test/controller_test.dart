import 'dart:io';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';

import 'support.dart';

void main() {
  late Directory directory;
  late FakeTransport transport;
  late MemoryVault vault;
  late ExplorerController controller;
  setUp(() async {
    directory = await testDirectory();
    transport = FakeTransport();
    vault = MemoryVault();
    controller = ExplorerController(
      vault: vault,
      transport: transport,
      supportDirectory: directory,
    );
  });
  tearDown(() async {
    controller.dispose();
    await removeTestDirectory(directory);
  });
  test('Regulärer Projektabgleich verbindet geschützte Online- und Offline-Medien mit dem Konto', () async {
    final fixture = sessionFixture();
    transport.onJson = (_, _, _, _) async => fixture.toStored();
    transport.onReader = (uri) async =>
        protectedReaderFixture(uri, fixture.projectId);
    transport.onProtected = (_, file) =>
        Stream.value(file.mimeType == 'audio/mpeg' ? [1, 2, 3] : pngBytes);
    expect(
      await controller.login(
        fixture.server.origin,
        fixture.user.username,
        'fixture',
      ),
      isTrue,
    );
    expect(controller.lastRefreshSucceeded, isTrue);
    final catalog = controller.catalog!, species = catalog.species.single;
    final picture = species.gallery.single, sound = species.sounds.single;
    expect(catalog.revision, 'reader-2:5');
    expect(species.editorial?.title, 'Das Leben am Fluss');
    expect(picture.url, isNull);
    expect(picture.id, 'gallery-use');
    expect(
      await controller.imageBytes(species, picture, MediaKind.gallery),
      pngBytes,
    );
    final local = await controller.prepareProjectAudio(species, sound);
    expect(await local.readAsBytes(), [1, 2, 3]);
    await local.delete();
    await local.parent.delete();
    await controller.download(
      const OfflineSelection(sounds: true, gallery: true),
    );
    expect(controller.offline?.healthy, isTrue);
    expect(controller.offlineFile(species, sound, MediaKind.sound), isNotNull);
    final requested = transport.protectedRequests.length;
    expect(
      await controller.imageBytes(species, picture, MediaKind.gallery),
      pngBytes,
    );
    expect(transport.protectedRequests, hasLength(requested));
    expect(transport.mediaRequests, isEmpty);
    await controller.logout();
    await expectLater(
      controller.imageBytes(species, picture, MediaKind.gallery),
      throwsFormatException,
    );
    expect(transport.protectedRequests, hasLength(requested));
  });
  test('Anmeldung speichert Token und Person aber kein Passwort', () async {
    final fixture = sessionFixture();
    transport.onJson = (uri, method, body, bearer) async =>
        uri.path.endsWith('/login') ? fixture.toStored() : catalogFixture();
    expect(
      await controller.login(
        'https://project.example.invalid',
        'fixture',
        'only-in-memory',
      ),
      true,
    );
    expect(vault.value!.deviceToken, fixture.deviceToken);
    expect(transport.requests.first['body']['scope'], 'read');
    expect(
      jsonEncode(vault.value!.toStored()),
      isNot(contains('only-in-memory')),
    );
    expect(controller.lastRefreshSucceeded, true);
    expect(transport.requests.last['bearer'], fixture.token);
  });
  const pairingProject = 'cc97f537-0bb6-4167-906c-676940203c5e';
  final pairingCode = 'p1_${'a' * 43}';
  Map<String, dynamic> invitationData() => {
    'kind': 'arten-explorer-device-pairing',
    'schemaVersion': 1,
    'server': 'https://project.example.invalid:5443/',
    'projectId': pairingProject,
    'expiresAt': DateTime.fromMillisecondsSinceEpoch(
      DateTime.now().millisecondsSinceEpoch + 120000,
      isUtc: true,
    ).toIso8601String(),
    'code': pairingCode,
  };
  test(
    'QR-Einladung validiert Format, Zieladresse und Ablauf vor dem Abruf',
    () async {
      final valid = invitationData();
      for (final invalid in [
        {'kind': 'numis-device-pairing'},
        {'server': 'http://project.example.invalid/'},
        {'server': 'https://person@project.example.invalid/'},
        {'server': 'https://project.example.invalid/path'},
        {'server': 'https://project.example.invalid/?'},
        {'server': 'https://project.example.invalid/#'},
        {'code': 's1_${'a' * 43}'},
        {'expiresAt': '2000-01-01T00:00:00.000Z'},
        {'scope': 'full'},
      ]) {
        expect(
          () => ProjectPairingInvitation.parse(
            jsonEncode({...valid, ...invalid}),
          ),
          throwsFormatException,
        );
      }
      final invite = ProjectPairingInvitation.parse(jsonEncode(valid));
      final other = ProjectApi(
        Uri.parse('https://other.example.invalid/'),
        transport,
      );
      await expectLater(other.redeemPairing(invite), throwsFormatException);
      expect(transport.requests, isEmpty);
    },
  );
  test('Kopplung sendet nur den Einladungscode und speichert den bestätigten Lesegerätezugang', () async {
    final invite = ProjectPairingInvitation.parse(jsonEncode(invitationData()));
    final fixture = sessionFixture();
    transport.onJson = (uri, method, body, bearer) async =>
        uri.path.endsWith('/redeem')
        ? {...fixture.toStored(), 'projectId': pairingProject}
        : catalogFixture();
    expect(transport.requests, isEmpty);
    expect(await controller.redeemPairing(invite), true);
    expect(transport.requests.first, {
      'uri': 'https://project.example.invalid:5443/api/v1/auth/pairing/redeem',
      'method': 'POST',
      'body': {
        'code': pairingCode,
        'projectId': pairingProject,
        'deviceLabel': 'Arten-Explorer Android',
      },
      'bearer': null,
    });
    expect(vault.value!.server, invite.server);
    expect(vault.value!.projectId, pairingProject);
    expect(vault.value!.deviceToken, fixture.deviceToken);
    expect(jsonEncode(vault.value!.toStored()), isNot(contains(pairingCode)));
    expect(controller.lastRefreshSucceeded, true);
  });
  test('Widersprüchliche und abgelaufene Einladungen behalten die bisherige Anmeldung', () async {
    final previous = vault.value = sessionFixture();
    await controller.restore();
    final invite = ProjectPairingInvitation.parse(jsonEncode(invitationData()));
    for (final invalid in [
      {'projectId': 'other-project'},
      {'scope': 'full'},
      {'device': null},
    ]) {
      transport.onJson = (_, _, _, _) async => {
        ...previous.toStored(),
        'projectId': pairingProject,
        ...invalid,
      };
      expect(await controller.redeemPairing(invite), false);
      expect(vault.value, same(previous));
      expect(controller.session, same(previous));
      expect(controller.error, isNot(contains(pairingCode)));
    }
    transport.onJson = (_, _, _, _) async =>
        throw const ProjectApiException(401, 'fixture');
    expect(await controller.redeemPairing(invite), false);
    expect(controller.error, contains('am PC eine neue erstellen'));
    expect(vault.value, same(previous));
    transport.onJson = (_, _, _, _) async => throw const ProjectApiException(
      401,
      'fixture',
      code: 'authentication_required',
    );
    expect(await controller.redeemPairing(invite), false);
    expect(controller.error, contains('NAS benötigt Version 0.1.8'));
    expect(vault.value, same(previous));
  });
  test('Erfolgreiche Anmeldung mit anschließendem Netzfehler meldet keinen Inhaltsabschluss', () async {
    transport.onJson = (uri, method, body, bearer) async {
      if (uri.path.endsWith('/login')) return sessionFixture().toStored();
      throw const SocketException('synthetic offline');
    };
    expect(
      await controller.login(
        'https://project.example.invalid',
        'fixture',
        'transient',
      ),
      true,
    );
    expect(controller.catalog, isNull);
    expect(controller.lastRefreshSucceeded, false);
    expect(controller.status, 'Noch keine Inhalte geladen.');
    expect(controller.error, contains('Keine sichere Verbindung'));
  });
  test('Netzverlust nach Wiederöffnung erhält vorheriges vollständiges Offlinepaket', () async {
    final saved = vault.value = sessionFixture();
    final store = OfflineStore(
      Directory(
        '${directory.path}/projects/${OfflineStore.projectKey(saved.server, saved.user.id, projectId: saved.projectId)}',
      ),
      transport,
    );
    await store.download(
      Catalog.fromJson(catalogFixture()),
      const OfflineSelection(texts: true),
      onProgress: (_) {},
      cancelled: () => false,
    );
    transport.onJson = (_, method, body, bearer) async =>
        throw const SocketException('synthetic offline');
    await controller.restore();
    expect(controller.loggedIn, true);
    expect(controller.detailsAvailable, true);
    expect(controller.catalog!.revision, 'fixture-1');
    expect(controller.lastRefreshSucceeded, false);
    expect(controller.status, contains('nicht bestätigt'));
  });
  test('Ungültige neue Daten ersetzen den bestätigten Inhalt nicht', () async {
    vault.value = sessionFixture();
    await controller.restore();
    final before = controller.catalog;
    transport.onJson = (_, method, body, bearer) async => {'schemaVersion': 99};
    await controller.refresh();
    expect(controller.catalog, same(before));
    expect(controller.lastRefreshSucceeded, false);
    expect(controller.error, contains('Katalogversion'));
  });
  test(
    'Abgelaufene Sitzung wird ausschließlich mit Gerätetoken erneuert',
    () async {
      vault.value = sessionFixture(
        expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
      );
      transport.onJson = (uri, method, body, bearer) async {
        if (uri.path.endsWith('/refresh')) {
          return sessionFixture().toStored()..remove('device');
        }
        return catalogFixture();
      };
      await controller.restore();
      expect(transport.requests.first['bearer'], 'fixture-device-token');
      expect(transport.requests.last['bearer'], 'fixture-session-token');
      expect(vault.value!.deviceToken, 'fixture-device-token');
    },
  );
  test(
    'Gesperrte Anmeldung beendet den lesenden Zugriff und entfernt Token',
    () async {
      vault.value = sessionFixture();
      transport.onJson = (_, method, body, bearer) async =>
          throw const ProjectApiException(401, 'Erneut anmelden');
      await controller.restore();
      expect(vault.value, isNull);
      expect(controller.loggedIn, false);
      expect(controller.catalog, isNull);
    },
  );
  test('Abgelaufene Gerätezulassung startet keinen Abruf und keinen Offlinezugriff', () async {
    vault.value = sessionFixture(
      deviceExpiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
    );
    await controller.restore();
    expect(transport.requests, isEmpty);
    expect(controller.loggedIn, false);
    expect(vault.value, isNull);
  });
  test('Abmelden ohne Netz entfernt lokal die Anmeldung mit ehrlichem Widerrufshinweis', () async {
    vault.value = sessionFixture();
    await controller.restore();
    transport.onJson = (_, method, body, bearer) async =>
        throw const SocketException('synthetic offline');
    await controller.logout();
    expect(vault.value, isNull);
    expect(controller.loggedIn, false);
    expect(controller.error, contains('noch nicht widerrufen'));
  });
  test('Öffentliche Medien werden ohne persönliche Katalog-Authorization abgerufen', () async {
    vault.value = sessionFixture();
    await controller.restore();
    final species = controller.catalog!.species.first;
    expect(
      await controller.imageBytes(
        species,
        species.portrait!,
        MediaKind.portrait,
      ),
      pngBytes,
    );
    expect(transport.mediaRequests.single.scheme, 'https');
    expect(
      transport.requests.where(
        (request) => request['uri'].toString().contains('media.example'),
      ),
      isEmpty,
    );
  });
  test('beobachtete Galeriefassung wird vor Bildanzeige gehasht und nicht in neuer Katalogrevision vorgetäuscht', () async {
    final catalog = Catalog.fromJson(observedCatalogFixture()),
        store = OfflineStore(
          directory,
          transport,
          photoValidator: (bytes, mime) async => RasterPhoto(mime, 1, 1),
        );
    controller.store = store;
    controller.catalog = catalog;
    controller.offline = await store.download(
      catalog,
      const OfflineSelection(texts: true, gallery: true),
      onProgress: (_) {},
      cancelled: () => false,
    );
    final species = catalog.species.first, media = species.gallery.first;
    expect(
      controller.offlineFile(species, media, MediaKind.gallery),
      isNotNull,
    );
    expect(
      await controller.imageBytes(species, media, MediaKind.gallery),
      pngBytes,
    );
    await controller
        .offlineFile(species, media, MediaKind.gallery)!
        .writeAsBytes(List<int>.filled(pngBytes.length, 0));
    await expectLater(
      controller.imageBytes(species, media, MediaKind.gallery),
      throwsFormatException,
    );
    expect(transport.mediaRequests, isEmpty);
    controller.catalog = Catalog.fromJson(
      observedCatalogFixture(revision: 'fixture-gallery-2'),
    );
    expect(controller.offlineFile(species, media, MediaKind.gallery), isNull);
  });
}
