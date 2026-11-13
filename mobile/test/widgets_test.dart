import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/app.dart';
import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/audio_playback.dart';
import 'package:arten_explorer/data/offline_jobs.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:arten_explorer/ui/offline_page.dart';
import 'package:arten_explorer/ui/species_page.dart';
import 'package:arten_explorer/ui/media_image.dart';

import 'support.dart';

void main() {
  late Directory directory;
  late ExplorerController controller;
  late AudioPlayback audio;
  setUp(() async {
    directory = await testDirectory();
    controller = ExplorerController(
      vault: MemoryVault(),
      transport: FakeTransport(),
      supportDirectory: directory,
    )..initializing = false;
    audio = AudioPlayback();
  });
  tearDown(() async {
    audio.dispose();
    controller.dispose();
    await removeTestDirectory(directory);
  });

  Future<void> chooseAllRegions(WidgetTester tester) async {
    final allRegions = find.text('Alle Regionen');
    await tester.ensureVisible(allRegions);
    await tester.tap(allRegions);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'Strukturierte Arttexte zeigen Listen und Quellen im Infofenster',
    (tester) async {
      final entry =
          (catalogFixture(media: false)['species'] as List).first
              as Map<String, dynamic>;
      final species = Species.fromJson({
        ...entry,
        'editorial': structuredEditorialFixture(),
      });
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: species,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Das Leben am Fluss'), findsOneWidget);
      expect(find.text('Eine eigene Einleitung.'), findsOneWidget);
      expect(find.text('Eigene Beobachtungen'), findsNothing);
      await tester.tap(find.byTooltip('Quellen der Arttexte'));
      await tester.pumpAndSettle();
      expect(find.text('Eigene Beobachtungen'), findsOneWidget);
      await tester.tap(find.text('Schließen'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Aussehen'));
      await tester.tap(find.text('Aussehen'));
      await tester.pumpAndSettle();
      expect(find.text('Kennzeichen'), findsOneWidget);
      expect(find.text('•'), findsNWidgets(2));
      expect(find.text('1.'), findsOneWidget);
      expect(find.text('2.'), findsOneWidget);
      expect(find.text('Nahrung'), findsNothing);
    },
  );
  testWidgets(
    'Ein älterer Offlinekatalog fragt einmal nach der Aktualisierung',
    (tester) async {
      controller.viewingPublic = true;
      controller.catalog = Catalog.fromJson(catalogFixture(revision: 'new'));
      controller.store = OfflineStore(directory, controller.transport);
      controller.offline = OfflineSnapshot(
        Catalog.fromJson(catalogFixture(revision: 'old')),
        const OfflineSelection(maps: true),
        const {},
        const [],
        const {},
      );
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      expect(find.text('Offlineinhalte aktualisieren?'), findsOneWidget);
      await tester.tap(find.text('Später'));
      await tester.pumpAndSettle();
      expect(find.text('Offlineinhalte aktualisieren?'), findsNothing);
      expect(controller.offline!.catalog.revision, 'old');
      expect((controller.transport as FakeTransport).mediaRequests, isEmpty);
    },
  );
  testWidgets(
    'Anmeldung zeigt richtiges Logo und verständliche Felder ohne erfundene Inhalte',
    (tester) async {
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      expect(find.text('Projektadresse'), findsOneWidget);
      expect(find.text('Benutzername'), findsOneWidget);
      expect(find.bySemanticsLabel('Arten-Explorer'), findsWidgets);
      final images = tester.widgetList<Image>(find.byType(Image));
      expect(
        images.any(
          (image) =>
              image.image is AssetImage &&
              (image.image as AssetImage).assetName ==
                  'assets/arten-explorer.png',
        ),
        true,
      );
      expect(find.text('Erste Testart'), findsNothing);
    },
  );
  testWidgets(
    'Artenliste ist auf 320 Pixeln und mit großer Schrift bedienbar',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      tester.platformDispatcher.textScaleFactorTestValue = 1.6;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      controller.session = sessionFixture();
      controller.catalog = Catalog.fromJson(catalogFixture(media: false));
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      await chooseAllRegions(tester);
      expect(find.text('Erste Testart'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.enterText(find.byType(TextField), 'secundum');
      await tester.pumpAndSettle();
      expect(find.text('Zweite Testart'), findsOneWidget);
      expect(find.text('Erste Testart'), findsNothing);
    },
  );
  testWidgets(
    'QR-Scan kontaktiert die angezeigte Projektadresse erst nach Bestätigung',
    (tester) async {
      const channel = MethodChannel(
        'de.fnwildlifetravel.arten_explorer/pairing',
      );
      const server = 'https://project.example.invalid:5443';
      final transport = controller.transport as FakeTransport;
      transport.onJson = (_, _, _, _) async =>
          throw const ProjectApiException(401, 'fixture');
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'scan');
        return jsonEncode({
          'kind': 'arten-explorer-device-pairing',
          'schemaVersion': 1,
          'server': server,
          'projectId': 'cc97f537-0bb6-4167-906c-676940203c5e',
          'expiresAt': DateTime.fromMillisecondsSinceEpoch(
            DateTime.now().millisecondsSinceEpoch + 120000,
            isUtc: true,
          ).toIso8601String(),
          'code': 'p1_${'a' * 43}',
        });
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      final scan = find.text('QR-Code scannen');
      await tester.tap(scan);
      await tester.pumpAndSettle();
      expect(find.textContaining(server), findsOneWidget);
      expect(transport.requests, isEmpty);
      await tester.tap(find.text('Abbrechen'));
      await tester.pumpAndSettle();
      expect(transport.requests, isEmpty);
      await tester.tap(scan);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Verbinden'));
      await tester.pumpAndSettle();
      expect(
        transport.requests.single['uri'],
        '$server/api/v1/auth/pairing/redeem',
      );
      expect(find.textContaining('am PC eine neue erstellen'), findsOneWidget);
    },
  );
  testWidgets(
    'Leerer freigegebener Katalog erklärt ehrlich den fehlenden Bestand',
    (tester) async {
      controller.session = sessionFixture();
      controller.catalog = Catalog.fromJson(catalogFixture()..['species'] = []);
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('noch keine Arten für die App freigegeben'),
        findsOneWidget,
      );
    },
  );
  testWidgets('Zurückgezogener Zugriff schließt auch eine offene Artansicht', (
    tester,
  ) async {
    controller.session = sessionFixture();
    controller.catalog = Catalog.fromJson(catalogFixture(media: false));
    await tester.pumpWidget(ExplorerApp(controller: controller, audio: audio));
    await tester.pumpAndSettle();
    await chooseAllRegions(tester);
    await tester.tap(find.text('Alles ausklappen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Erste Testart'));
    await tester.pumpAndSettle();
    expect(find.text('Taxonomie'), findsOneWidget);
    (controller.transport as FakeTransport).onJson = (
      _,
      method,
      body,
      bearer,
    ) async => throw const ProjectApiException(403, 'Erneut anmelden');
    await controller.refresh();
    await tester.pumpAndSettle();
    expect(find.text('Projektadresse'), findsOneWidget);
    expect(find.text('Taxonomie'), findsNothing);
  });
  testWidgets(
    'Taxonomiepyramide zeigt auf schmalem Bildschirm zentrierte deutsche Namen',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.6;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      controller.detailsAvailable = true;
      final input = catalogFixture(media: false);
      input['species'][0]
        ..['commonName'] = 'Mittelspecht'
        ..['scientificName'] = 'Dendrocoptes medius'
        ..['taxonomy'] = [
          {'rank': 'kingdom', 'name': 'Animalia'},
          {'rank': 'phylum', 'name': 'Chordata'},
          {'rank': 'class', 'name': 'Aves'},
          {'rank': 'order', 'name': 'Piciformes'},
          {'rank': 'family', 'name': 'Picidae'},
          {'rank': 'genus', 'name': 'Dendrocoptes'},
          {'rank': 'species', 'name': 'Dendrocoptes medius'},
        ];
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: Catalog.fromJson(input).species.first,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final title = find.text('Taxonomie');
      await tester.ensureVisible(title);
      await tester.tap(title);
      await tester.pumpAndSettle();

      final pyramid = find.widgetWithText(ExpansionTile, 'Taxonomie');
      Finder inPyramid(String value) =>
          find.descendant(of: pyramid, matching: find.text(value));
      final center = tester.getCenter(inPyramid('Tiere')).dx;
      for (final (rank, value) in [
        ('Reich', 'Tiere'),
        ('Stamm', 'Chordatiere'),
        ('Klasse', 'Vögel'),
        ('Ordnung', 'Spechtvögel'),
        ('Familie', 'Spechte'),
        ('Gattung', 'Dendrocoptes'),
        ('Art', 'Mittelspecht'),
      ]) {
        final rankLabel = inPyramid(rank), name = inPyramid(value);
        expect(rankLabel, findsOneWidget);
        expect(name, findsOneWidget);
        expect(tester.getCenter(rankLabel).dx, closeTo(center, 0.5));
        expect(tester.getCenter(name).dx, closeTo(center, 0.5));
        expect(
          tester.getCenter(rankLabel).dy,
          lessThan(tester.getCenter(name).dy),
        );
      }
      expect(inPyramid('Picidae'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Familienporträts bleiben beim Aufklappen und Scrollen in ihrer Zeile',
    (tester) async {
      final input = catalogFixture(media: false);
      final base = input['species'][0] as Map<String, dynamic>;
      Map<String, dynamic> bird(String name, String family) {
        final id = name.toLowerCase().replaceAll(' ', '-');
        return cloneJson(base)
          ..['id'] = id
          ..['commonName'] = name
          ..['taxonomy'] = [
            {'rank': 'class', 'name': 'Aves'},
            {'rank': 'family', 'name': family},
          ]
          ..['media']['portrait'] = mediaFixture('portrait-$id');
      }

      input['species'] = [
        for (var index = 9; index >= 0; index--)
          bird('Gans $index', 'Anatidae'),
        bird('Fink', 'Fringillidae'),
        bird('Papageientaucher', 'Alcidae'),
      ];
      controller.session = sessionFixture();
      controller.catalog = Catalog.fromJson(input);
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      await chooseAllRegions(tester);
      await tester.tap(find.text('Alles ausklappen'));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Fink')).dy,
        lessThan(tester.getTopLeft(find.text('Gans 0')).dy),
      );
      expect(find.text('Alle Tiergruppen'), findsOneWidget);
      expect(find.text('Vögel'), findsOneWidget);
      await tester.tap(find.text('Alle Tiergruppen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vögel · 12').last);
      await tester.pumpAndSettle();
      final ducks = find.text('Entenvögel');
      final duckPortrait = find.descendant(
        of: find.widgetWithText(ListTile, 'Entenvögel'),
        matching: find.byType(MediaImage),
      );
      expect(duckPortrait, findsOneWidget);
      expect(
        tester.widget<MediaImage>(duckPortrait).species.displayName,
        'Gans 0',
      );
      expect(
        tester.getCenter(duckPortrait).dy,
        closeTo(tester.getCenter(ducks).dy, 1),
      );
      expect(find.text('Fink'), findsNothing);
      await tester.tap(duckPortrait);
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Gans 0')).dy,
        lessThan(tester.getTopLeft(find.text('Gans 1')).dy),
      );

      final labelBefore = tester.getCenter(ducks).dy;
      final portraitBefore = tester.getCenter(duckPortrait).dy;
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -30));
      await tester.pumpAndSettle();
      final labelMovement = tester.getCenter(ducks).dy - labelBefore;
      expect(labelMovement, lessThan(0));
      expect(
        tester.getCenter(duckPortrait).dy - portraitBefore,
        closeTo(labelMovement, 1),
      );

      final finches = find.text('Finken');
      final familyScroll = find.descendant(
        of: find.byType(CustomScrollView),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(finches, 150, scrollable: familyScroll);
      await tester.pumpAndSettle();
      final finchPortrait = find.descendant(
        of: find.widgetWithText(ListTile, 'Finken'),
        matching: find.byType(MediaImage),
      );
      expect(
        tester.getCenter(finchPortrait).dy,
        closeTo(tester.getCenter(finches).dy, 1),
      );
      await tester.tap(finches);
      await tester.pumpAndSettle();
      final finch = find.text('Fink');
      await tester.scrollUntilVisible(finch, 100, scrollable: familyScroll);
      expect(finch.hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Artkopf übernimmt den Website-Untertitel und öffnet den FN-Link',
    (tester) async {
      final input = catalogFixture(media: false);
      const link =
          'https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/test-art';
      input['species'][0]['websiteUrl'] = link;
      input['species'][0]['sections'].insert(0, {
        'id': 'heading',
        'title': 'erste Testart – Kurzuntertitel',
        'text': '',
        'intentionallyEmpty': true,
      });
      const channel = MethodChannel(
        'de.fnwildlifetravel.arten_explorer/browser',
      );
      final calls = <MethodCall>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        calls.add(call);
        return true;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          null,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: Catalog.fromJson(input).species.first,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Erste Testart'), findsOneWidget);
      expect(find.text('Exemplum primum'), findsOneWidget);
      expect(find.text('Kurzuntertitel'), findsOneWidget);
      await tester.tap(find.text('Auf FN-Website öffnen'));
      await tester.pumpAndSettle();
      expect(calls.single.method, 'open');
      expect(calls.single.arguments, link);
    },
  );
  testWidgets(
    'Artansicht zeigt gegliederte Originaltexte und klare Medienlücken',
    (tester) async {
      controller.detailsAvailable = true;
      final species = Catalog.fromJson(catalogFixture(media: false))
          .species
          .first;
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: species,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Kein Artbild hinterlegt.'), findsOneWidget);
      await tester.tap(find.text('Beschreibung'));
      await tester.pumpAndSettle();
      expect(
        find.text('Ausschließlich synthetischer Testtext.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Bewusst leer'));
      await tester.tap(find.text('Bewusst leer'));
      await tester.pumpAndSettle();
      expect(
        find.text('Dieser Abschnitt ist bewusst ohne Text.'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Verbreitung'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.tap(find.text('Verbreitung'));
      await tester.pumpAndSettle();
      expect(find.text('Keine Verbreitungskarte hinterlegt.'), findsOneWidget);
      expect(find.text('Tierstimme'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Vier Medienkategorien lassen sich einzeln auswählen', (
    tester,
  ) async {
    controller.catalog = Catalog.fromJson(catalogFixture());
    await tester.pumpWidget(
      MaterialApp(home: OfflinePage(controller: controller)),
    );
    await tester.pumpAndSettle();
    for (final title in ['Verbreitungskarten', 'Tierstimmen', 'Artbilder']) {
      final tile = find.widgetWithText(CheckboxListTile, title);
      await tester.scrollUntilVisible(tile, 150);
      await tester.tap(tile);
      await tester.pumpAndSettle();
    }
    final tiles = tester
        .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
        .toList();
    expect(tiles.map((tile) => tile.value), [true, true, true, true, false]);
    await tester.scrollUntilVisible(
      find.textContaining('Ausgewählt: 3 Dateien'),
      200,
    );
    expect(find.textContaining('Ausgewählt: 3 Dateien'), findsOneWidget);
  });
  testWidgets(
    'Fehlende Prüfsumme verhindert unberechtigte Offline-Erfolgsaussage',
    (tester) async {
      final input = catalogFixture();
      input['species'][0]['media']['map'].remove('sha256');
      controller.catalog = Catalog.fromJson(input);
      await tester.pumpWidget(
        MaterialApp(home: OfflinePage(controller: controller)),
      );
      await tester.pumpAndSettle();
      final maps = find.widgetWithText(CheckboxListTile, 'Verbreitungskarten');
      await tester.scrollUntilVisible(maps, 150);
      await tester.tap(maps);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.textContaining('fehlt eine Katalogprüfsumme'),
        200,
      );
      expect(
        find.textContaining('fehlt eine Katalogprüfsumme'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Auswahl laden und prüfen'),
        100,
      );
      final button = tester.widget<FilledButton>(
        find
            .ancestor(
              of: find.text('Auswahl laden und prüfen'),
              matching: find.byWidgetPredicate(
                (widget) => widget is FilledButton,
              ),
            )
            .first,
      );
      expect(button.onPressed, isNull);
    },
  );
  testWidgets(
    'Laufender Download zeigt überprüfbare Dateien und Speicherfortschritt',
    (tester) async {
      controller.catalog = Catalog.fromJson(catalogFixture());
      controller.downloading = true;
      controller.progress = const OfflineProgress(
        1,
        3,
        1024,
        3072,
        'Datei geprüft',
      );
      await tester.pumpWidget(
        MaterialApp(home: OfflinePage(controller: controller)),
      );
      await tester.pump();
      await tester.scrollUntilVisible(
        find.textContaining('Neu geladen: 1 · Noch zu laden: 2'),
        200,
      );
      expect(
        find.textContaining('Neu geladen: 1 · Noch zu laden: 2'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(find.text('Download abbrechen'), 100);
      expect(find.text('Download abbrechen'), findsOneWidget);
      expect(find.text('Auswahl laden und prüfen'), findsNothing);
    },
  );
  testWidgets(
    'Papierkorb erscheint nur beim Abwählen gespeicherter Kategorien',
    (tester) async {
      final catalog = Catalog.fromJson(catalogFixture());
      controller.catalog = catalog;
      controller.viewingPublic = true;
      final store = OfflineStore(directory, FakeTransport());
      controller.store = store;
      await tester.runAsync(() async {
        controller.offline = await store.download(
          catalog,
          const OfflineSelection(gallery: true),
          onProgress: (_) {},
          cancelled: () => false,
        );
        await controller.refreshOfflineInventory();
      });
      await tester.pumpWidget(
        MaterialApp(home: OfflinePage(controller: controller)),
      );
      final gallery = find.widgetWithText(CheckboxListTile, 'Fotopaket');
      final galleryTrash = find.byTooltip(
        'Fotopaket von diesem Gerät entfernen',
      );
      await tester.scrollUntilVisible(gallery, 150);
      expect(galleryTrash, findsNothing);
      await tester.tap(gallery);
      await tester.pump();
      expect(galleryTrash, findsOneWidget);
      expect(controller.offline!.selection.gallery, true);
      final sounds = find.widgetWithText(CheckboxListTile, 'Tierstimmen');
      await tester.tap(sounds);
      await tester.pump();
      await tester.tap(sounds);
      await tester.pump();
      expect(
        find.byTooltip('Tierstimmen von diesem Gerät entfernen'),
        findsNothing,
      );
      await tester.runAsync(() async {
        expect(await controller.removeOfflineCategory(MediaKind.gallery), true);
      });
      await tester.pump();
      expect(galleryTrash, findsNothing);
    },
  );
  testWidgets('Wieder geöffnete Offlineansicht zeigt die aktive Fotoauswahl', (
    tester,
  ) async {
    const jobId = '0123456789abcdef0123456789abcdef';
    const channel = MethodChannel('test/offline-progress');
    final catalog = Catalog.fromJson(observedCatalogFixture());
    const selection = OfflineSelection(gallery: true);
    final total = selection.select(catalog).length;
    var state = 'running';
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
      channel,
      (_) async => {
        'jobId': jobId,
        'status': state,
        'message': '1 von $total Dateien heruntergeladen.',
        'completeFiles': 1,
        'totalFiles': total,
        'receivedBytes': 1024,
      },
    );
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    controller.dispose();
    controller =
        ExplorerController(
            vault: MemoryVault(),
            transport: FakeTransport(),
            supportDirectory: directory,
            publicCatalog: catalog,
            downloads: const AndroidOfflineDownloads(channel: channel),
          )
          ..catalog = catalog
          ..viewingPublic = true;
    await tester.runAsync(() async {
      await OfflineJob(
        id: jobId,
        catalog: catalog,
        selection: selection,
      ).save(directory);
      await controller.restoreDownload();
    });
    controller.offlineInventory = OfflineInventory(
      categories: const {
        MediaKind.gallery: OfflineCategoryInventory(
          totalFiles: 2,
          missingFiles: 2,
          resumableFiles: 1,
        ),
      },
      appDataBytes: 1024,
      stageBytes: 1024,
      resumableKeys: {selection.select(catalog).first.key},
      storedBytes: 0,
      resumableBytes: 1024,
    );
    await tester.pumpWidget(
      MaterialApp(home: OfflinePage(controller: controller)),
    );
    final photos = find.widgetWithText(CheckboxListTile, 'Fotopaket');
    await tester.scrollUntilVisible(photos, 180);
    final tile = tester.widget<CheckboxListTile>(photos);
    expect(tile.value, isTrue);
    expect(tile.onChanged, isNull);
    expect((tile.subtitle as Text).data, '2 Fotos\nWird geladen');
    await tester.scrollUntilVisible(
      find.textContaining('Downloadauswahl: $total Dateien'),
      100,
    );
    expect(
      find.textContaining('Downloadauswahl: $total Dateien'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('Neu geladen: 1 · Noch zu laden: ${total - 1} · 1.0 KB'),
      100,
    );
    expect(
      find.textContaining('Zusätzlich für dieses Paket vorbereitet'),
      findsOneWidget,
    );
    state = 'paused';
    await tester.runAsync(controller.restoreDownload);
    await tester.pump();
    expect(
      find.textContaining('Für die Fortsetzung gespeichert'),
      findsOneWidget,
    );
  });
  testWidgets(
    'bekannte Websitefotos sind auch ohne vorab bekannte Dateigröße wählbar',
    (tester) async {
      controller.catalog = Catalog.fromJson(observedCatalogFixture());
      await tester.pumpWidget(
        MaterialApp(home: OfflinePage(controller: controller)),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Fotopaket'), 180);
      await tester.tap(find.text('Fotopaket'));
      await tester.pumpAndSettle();
      final tile = tester.widget<CheckboxListTile>(
        find.widgetWithText(CheckboxListTile, 'Fotopaket'),
      );
      expect(tile.value, isTrue);
      expect((tile.subtitle as Text).data, '2 Fotos');
      await tester.scrollUntilVisible(
        find.text('Auswahl laden und prüfen'),
        180,
      );
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Auswahl laden und prüfen'),
      );
      expect(button.onPressed, isNotNull);
      expect(find.textContaining('Downloadzeitpunkt'), findsNothing);
      expect(find.textContaining('fehlt eine Katalogprüfsumme'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Ein vom Katalog referenziertes Bild wird sichtbar gerendert', (
    tester,
  ) async {
    final species = Catalog.fromJson(catalogFixture()).species.first;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 200,
            height: 200,
            child: MediaImage(
              controller: controller,
              species: species,
              media: species.portrait!,
              kind: MediaKind.portrait,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Synthetisches Testbild'), findsOneWidget);
    expect(find.textContaining('Bild nicht verfügbar'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'Vorhandener Quellen- und Nutzungshinweis ist am Medium erreichbar',
    (tester) async {
      final input = catalogFixture();
      input['species'][0]['media']['portrait']['attribution'] =
          'Synthetische Testquelle · CC BY-NC';
      input['species'][0]['media']['gallery'] = [];
      final species = Catalog.fromJson(input).species.first;
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: species,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Quelle und Nutzung').first);
      await tester.pumpAndSettle();
      expect(find.text('Synthetische Testquelle · CC BY-NC'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Öffentlicher Erststart verlangt keine erfundene Projektanmeldung',
    (tester) async {
      controller.dispose();
      controller = ExplorerController(
        vault: MemoryVault(),
        transport: FakeTransport(),
        supportDirectory: directory,
        publicCatalog: Catalog.fromJson(catalogFixture(media: false)),
      );
      await tester.runAsync(controller.restore);
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();
      expect(find.text('Region wählen'), findsOneWidget);
      expect(find.text('Alle Regionen'), findsOneWidget);
      expect(find.text('Alle Tiergruppen'), findsNothing);
      await chooseAllRegions(tester);
      expect(find.text('2 Arten'), findsOneWidget);
      expect(find.text('Alles ausklappen'), findsOneWidget);
      expect(find.text('Projektadresse'), findsNothing);
      expect(
        find.textContaining('Mitgelieferte öffentliche Daten'),
        findsNothing,
      );
      expect(find.textContaining('Offlineinhalte ·'), findsNothing);
      await tester.tap(find.byTooltip('Informationen'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Mitgelieferte öffentliche Daten'),
        findsOneWidget,
      );
      expect(find.text('Offlineinhalte'), findsNothing);
      expect(find.text('Software-Lizenzen'), findsOneWidget);
      Navigator.of(tester.element(find.text('Informationen'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Mit Projekt verbinden'));
      await tester.pumpAndSettle();
      expect(find.text('Mit gemeinsamem Projekt verbinden'), findsOneWidget);
      expect(find.text('Offlineinhalte'), findsOneWidget);
      expect(find.text('Lizenzen'), findsNothing);
      expect(find.text('Software-Lizenzen'), findsNothing);
      expect(
        find.textContaining('keine Projektanmeldung erforderlich'),
        findsOneWidget,
      );
      await tester.tap(find.text('Offlineinhalte'));
      await tester.pumpAndSettle();
      expect(find.byType(OfflinePage), findsOneWidget);
    },
  );

  testWidgets(
    'Artgalerie steht oben, zählt Bilder und öffnet sie per Antippen',
    (tester) async {
      final input = catalogFixture();
      input['species'][0]['websiteUrl'] = 'https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/test-art';
      input['species'][0]['sections'].insert(0, {
        'id': 'heading',
        'title': 'Erste Testart – Testuntertitel',
        'text': '',
        'intentionallyEmpty': true,
      });
      final species = Catalog.fromJson(input).species.first;
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: species,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1 von 2'), findsOneWidget);
      expect(find.text('Testbeschriftung gallery-one'), findsNothing);
      expect(find.byIcon(Icons.zoom_in), findsNothing);
      final gallery = find.byKey(const ValueKey('species-gallery'));
      expect(
        tester.getTopLeft(find.text('Testuntertitel')).dy,
        lessThan(tester.getTopLeft(gallery).dy),
      );
      expect(
        tester.getTopLeft(find.text('Auf FN-Website öffnen')).dy,
        lessThan(tester.getTopLeft(gallery).dy),
      );
      await tester.fling(gallery, const Offset(-650, 0), 1000);
      await tester.pumpAndSettle();
      expect(find.text('2 von 2'), findsOneWidget);
      expect(find.text('Testbeschriftung gallery-two'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('media-gallery-gallery-two')));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsOneWidget);
    },
  );

  testWidgets('Alle Tiergruppen hat eigene Klassenüberschriften', (
    tester,
  ) async {
    final input = catalogFixture(media: false);
    input['species'][0]['taxonomy'] = [
      {'rank': 'class', 'name': 'Aves'},
    ];
    input['species'][1]['taxonomy'] = [
      {'rank': 'class', 'name': 'Amphibia'},
    ];
    controller.session = sessionFixture();
    controller.catalog = Catalog.fromJson(input);
    await tester.pumpWidget(ExplorerApp(controller: controller, audio: audio));
    await tester.pumpAndSettle();
    await chooseAllRegions(tester);
    expect(find.text('Amphibien'), findsOneWidget);
    expect(find.text('Vögel'), findsOneWidget);
    expect(find.text('Zweite Testart'), findsNothing);
    expect(find.text('Erste Testart'), findsNothing);
    await tester.tap(find.text('Alles ausklappen'));
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('Amphibien')).dy,
      lessThan(tester.getTopLeft(find.text('Zweite Testart')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Vögel')).dy,
      lessThan(tester.getTopLeft(find.text('Erste Testart')).dy),
    );
    await tester.tap(find.text('Alles einklappen'));
    await tester.pumpAndSettle();
    expect(find.text('Zweite Testart'), findsNothing);
  });

  testWidgets(
    'Regionswahl begrenzt Arten und Tiergruppen und lässt sich wechseln',
    (tester) async {
      final input = catalogFixture(media: false);
      final rows = List<Map<String, dynamic>>.from(input['species'] as List);
      input['species'] = rows;
      final [first, second] = rows;
      first['websiteUrl'] =
          'https://www.fnwildlifetravel.de/wildlife/costarica/test-art';
      first['taxonomy'] = [
        {'rank': 'class', 'name': 'Aves'},
        {'rank': 'family', 'name': 'Anatidae'},
      ];
      second['websiteUrl'] =
          'https://www.fnwildlifetravel.de/wildlife/island/zweite-art';
      second['taxonomy'] = [
        {'rank': 'class', 'name': 'Amphibia'},
      ];
      rows.add(
        cloneJson(first)
          ..['id'] = 'dritte-art'
          ..['commonName'] = 'Dritte Testart'
          ..['websiteUrl'] =
              'https://www.fnwildlifetravel.de/wildlife/costarica/dritte-art',
      );
      rows.add(
        cloneJson(second)
          ..['id'] = 'vierte-art'
          ..['commonName'] = 'Vierte Testart'
          ..remove('websiteUrl'),
      );
      controller.viewingPublic = true;
      controller.catalog = Catalog.fromJson(input);
      await tester.pumpWidget(
        ExplorerApp(controller: controller, audio: audio),
      );
      await tester.pumpAndSettle();

      expect(find.text('Region wählen'), findsOneWidget);
      expect(find.text('Costa Rica'), findsOneWidget);
      expect(find.text('Island'), findsOneWidget);
      final costaRica = find.widgetWithText(ListTile, 'Costa Rica');
      final island = find.widgetWithText(ListTile, 'Island');
      expect(
        find.descendant(of: costaRica, matching: find.text('2 Arten')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: island, matching: find.text('1 Art')),
        findsOneWidget,
      );
      expect(find.text('Alle Tiergruppen'), findsNothing);
      expect(find.text('Erste Testart'), findsNothing);

      await tester.tap(find.text('Costa Rica'));
      await tester.pumpAndSettle();
      expect(find.text('2 Arten'), findsOneWidget);
      expect(find.text('Vögel'), findsOneWidget);
      expect(find.text('Amphibien'), findsNothing);
      await tester.tap(find.text('Alle Tiergruppen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vögel · 2').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alles ausklappen'));
      await tester.pumpAndSettle();
      expect(find.text('Entenvögel'), findsOneWidget);
      expect(find.text('Erste Testart'), findsOneWidget);
      expect(find.text('Dritte Testart'), findsOneWidget);
      expect(find.text('Zweite Testart'), findsNothing);

      await tester.tap(find.byTooltip('Region wechseln'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Island'));
      await tester.pumpAndSettle();
      expect(find.text('Alle Tiergruppen'), findsOneWidget);
      expect(find.text('1 Art'), findsOneWidget);
      expect(find.text('Amphibien'), findsOneWidget);
      expect(find.text('Vögel'), findsNothing);

      await tester.tap(find.byTooltip('Region wechseln'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Vierte');
      await tester.pumpAndSettle();
      expect(find.text('Vierte Testart'), findsOneWidget);
      expect(find.text('Zweite Testart'), findsNothing);
      await tester.enterText(find.byType(TextField), '');
      await tester.pumpAndSettle();
      expect(find.text('Region wählen'), findsOneWidget);
      await chooseAllRegions(tester);
      expect(find.text('4 Arten'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Artabschnitte zeigen deutschen Status, kurze Brutzeilen, Karte und Spektrogramm',
    (tester) async {
      final input = catalogFixture();
      input['species'][0]['media']['gallery'] = [];
      input['species'][0]['media']['spectrogram'] = {
        ...mediaFixture('spectrogram'),
        'mimeType': 'image/webp',
      };
      input['species'][0]['sections'] = [
        for (final (title, text) in [
          (
            'Allgemein',
            'Größe: 20 cm\nKategorie: Potentiell gefährdet\nStatus: NT\nTrend: Abnehmend',
          ),
          ('Verbreitung', 'An der Küste'),
          ('Lebensraum', 'Offene Meeresgebiete\n\nFlache tropische Buchten'),
          (
            'Fortpflanzung',
            'Kalbung meist im Winterquartier\n\nTragzeit: ca. 11–12 Monate',
          ),
          ('Brut', 'Nest: am Boden\n\nBrutzeit: Juni'),
        ])
          {
            'id': title,
            'title': title,
            'text': text,
            'intentionallyEmpty': false,
          },
      ];
      final species = Catalog.fromJson(input).species.first;
      await tester.pumpWidget(
        MaterialApp(
          home: SpeciesPage(
            species: species,
            controller: controller,
            audio: audio,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final artScroll = find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first;
      Future<void> open(String title) async {
        final heading = find.text(title);
        await tester.scrollUntilVisible(heading, 150, scrollable: artScroll);
        await Scrollable.ensureVisible(tester.element(heading), alignment: 0.4);
        await tester.pumpAndSettle();
        await tester.tap(heading);
        await tester.pumpAndSettle();
      }

      await tester.scrollUntilVisible(
        find.text('Tierstimme'),
        150,
        scrollable: artScroll,
      );
      final sectionTitles = tester
          .widgetList<ExpansionTile>(find.byType(ExpansionTile))
          .map((tile) => (tile.title as Text).data);
      expect(
        sectionTitles.take(3),
        orderedEquals(['Allgemein', 'Taxonomie', 'Tierstimme']),
      );
      await open('Allgemein');
      expect(find.text('Größe: 20 cm'), findsOneWidget);
      expect(find.text('Potenziell gefährdet'), findsOneWidget);
      expect(find.text('Abnehmend'), findsOneWidget);
      final graphics = tester
          .widgetList<Image>(find.byType(Image))
          .map((widget) => widget.image)
          .whereType<AssetImage>()
          .map((asset) => asset.assetName);
      expect(
        graphics,
        containsAll([
          'assets/status-graphics/NT.png',
          'assets/status-graphics/abnehmend.png',
        ]),
      );
      final spectrogram = find.byKey(
        const ValueKey('sound-spectrogram-spectrogram'),
      );
      expect(spectrogram, findsNothing);
      await open('Tierstimme');
      expect(spectrogram, findsOneWidget);
      expect(find.byType(Slider), findsOneWidget);
      expect(
        tester.getTopLeft(spectrogram).dy,
        lessThan(tester.getTopLeft(find.byTooltip('Abspielen')).dy),
      );
      expect(find.byType(InteractiveViewer), findsNothing);
      await tester.tap(find.text('Tierstimme'));
      await tester.pumpAndSettle();
      await open('Verbreitung');
      final map = find.byKey(const ValueKey('media-map-map'));
      expect(
        tester.getTopLeft(find.text('An der Küste')).dy,
        lessThan(tester.getTopLeft(map).dy),
      );
      await Scrollable.ensureVisible(tester.element(map), alignment: 0.35);
      await tester.pumpAndSettle();
      await tester.tap(map);
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsOneWidget);
      Navigator.of(tester.element(find.byType(InteractiveViewer))).pop();
      await tester.pumpAndSettle();
      await open('Lebensraum');
      expect(
        find.text('Offene Meeresgebiete\nFlache tropische Buchten'),
        findsOneWidget,
      );
      await open('Fortpflanzung');
      expect(
        find.text(
          'Kalbung meist im Winterquartier\nTragzeit: ca. 11–12 Monate',
        ),
        findsOneWidget,
      );
      await open('Brut');
      expect(find.text('Nest: am Boden\nBrutzeit: Juni'), findsOneWidget);
    },
  );
}
