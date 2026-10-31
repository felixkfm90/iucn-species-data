import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/app.dart';
import 'package:arten_explorer/app_controller.dart';
import 'package:arten_explorer/audio_playback.dart';
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
      expect(find.text('Erste Testart'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.enterText(find.byType(TextField), 'secundum');
      await tester.pumpAndSettle();
      expect(find.text('Zweite Testart'), findsOneWidget);
      expect(find.text('Erste Testart'), findsNothing);
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
        find.text('Keine Verbreitungskarte hinterlegt.'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Keine Verbreitungskarte hinterlegt.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Ohne Websitefotos wählt alle anderen Kategorien sichtbar aus', (
    tester,
  ) async {
    controller.catalog = Catalog.fromJson(catalogFixture());
    await tester.pumpWidget(
      MaterialApp(home: OfflinePage(controller: controller)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alles ohne Websitefotos auswählen'));
    await tester.pumpAndSettle();
    final tiles = tester
        .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
        .toList();
    expect(tiles.map((tile) => tile.value), [true, true, true, true, false]);
    await tester.scrollUntilVisible(
      find.textContaining('3 Mediendateien'),
      200,
    );
    expect(find.textContaining('3 Mediendateien'), findsOneWidget);
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
      await tester.tap(find.text('Alles ohne Websitefotos auswählen'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.textContaining('fehlt noch eine Prüfsumme'),
        200,
      );
      expect(find.textContaining('fehlt noch eine Prüfsumme'), findsOneWidget);
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
      await tester.scrollUntilVisible(find.textContaining('1/3 Dateien'), 200);
      expect(find.textContaining('1/3 Dateien'), findsOneWidget);
      expect(find.text('Download abbrechen'), findsOneWidget);
      expect(find.text('Auswahl laden und prüfen'), findsNothing);
    },
  );
  testWidgets('bekannte hashlose Websitefotos sind wählbar und als Downloadfassung verständlich erklärt',(tester)async{
    controller.catalog=Catalog.fromJson(observedCatalogFixture());
    await tester.pumpWidget(MaterialApp(home:OfflinePage(controller:controller)));await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Zusätzliche Websitefotos'),180);
    await tester.tap(find.text('Zusätzliche Websitefotos'));await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Auswahl laden und prüfen'),180);
    final button=tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Auswahl laden und prüfen'));
    expect(button.onPressed,isNotNull);expect(find.textContaining('öffentlich sichtbare Fassung vom Downloadzeitpunkt'),findsOneWidget);
    expect(find.textContaining('fehlt eine Katalogprüfsumme'),findsNothing);expect(tester.takeException(),isNull);
  });
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
      await tester.tap(find.text('Quelle und Nutzung').first);
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
      expect(find.text('Erste Testart'), findsOneWidget);
      expect(find.text('Projektadresse'), findsNothing);
      expect(
        find.textContaining('Mitgelieferte öffentliche Daten'),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Mit Projekt verbinden'));
      await tester.pumpAndSettle();
      expect(find.text('Mit gemeinsamem Projekt verbinden'), findsOneWidget);
      expect(
        find.textContaining('keine Projektanmeldung erforderlich'),
        findsOneWidget,
      );
    },
  );
}
