import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:arten_explorer/data/project_api.dart';

import 'support.dart';

void main() {
  test(
    'Katalog erhält fachliche Abschnittreihenfolge und bewusste Leerstelle',
    () {
      final catalog = Catalog.fromJson(catalogFixture());
      expect(catalog.species.first.sections.map((entry) => entry.title), [
        'Beschreibung',
        'Bewusst leer',
      ]);
      expect(catalog.species.first.sections.last.intentionallyEmpty, true);
      expect(catalog.species.first.sections.last.text, '');
      expect(Catalog.fromJson(catalog.toJson()).encode(), catalog.encode());
    },
  );
  test('Neue Art ohne Websiteadresse bleibt eine gültige angelegte Art', () {
    expect(Catalog.fromJson(catalogFixture()).species.first.websiteUrl, isNull);
  });
  test(
    'Suche verbindet deutsche Namen wissenschaftliche Namen und Taxonomie',
    () {
      final catalog = Catalog.fromJson(catalogFixture());
      expect(
        catalog.search(' ERSTE exemplum Testklasse ').single.id,
        'test-art',
      );
      expect(catalog.search('secundum').single.id, 'zweite-art');
      expect(catalog.search('unbekannt'), isEmpty);
    },
  );
  test(
    'Galerie folgt order und erhält bei Gleichstand die Quellreihenfolge',
    () {
      final input = catalogFixture();
      input['species'][0]['media']['gallery'].add(
        mediaFixture('gallery-three', order: 1),
      );
      expect(
        Catalog.fromJson(input).species.first.gallery.map((entry) => entry.id),
        ['gallery-one', 'gallery-three', 'gallery-two'],
      );
    },
  );
  test(
    'Auswahl ohne Websitefotos enthält Artbilder Karten Ton aber keine Galerie',
    () {
      const selection = OfflineSelection.withoutWebsitePhotos();
      final refs = selection.select(Catalog.fromJson(catalogFixture()));
      expect(selection.texts, true);
      expect(selection.gallery, false);
      expect(refs.map((entry) => entry.kind).toSet(), {
        MediaKind.portrait,
        MediaKind.map,
        MediaKind.sound,
      });
    },
  );
  for (final invalid in [
    'http://media.invalid/a.png',
    'file:///local/path',
    'https://person:secret@media.invalid/a.png',
    'https://media.invalid/a.png#part',
  ]) {
    test(
      'Unsichere oder lokale Medienadresse wird abgelehnt: ${Uri.parse(invalid).scheme}',
      () {
        final input = catalogFixture();
        input['species'][0]['media']['portrait']['url'] = invalid;
        expect(() => Catalog.fromJson(input), throwsFormatException);
      },
    );
  }
  test(
    'Unbekanntes Schema wird nicht als erfolgreicher Katalog angenommen',
    () {
      final input = catalogFixture()..['schemaVersion'] = 2;
      expect(() => Catalog.fromJson(input), throwsFormatException);
    },
  );
  test('Doppelte Art- und Abschnittkennungen werden abgelehnt', () {
    final input = cloneJson(catalogFixture());
    input['species'].add(cloneJson(input['species'][0]));
    expect(() => Catalog.fromJson(input), throwsFormatException);
    final other = cloneJson(catalogFixture());
    other['species'][0]['sections'].add(
      cloneJson(other['species'][0]['sections'][0]),
    );
    expect(() => Catalog.fromJson(other), throwsFormatException);
  });
  test('Medien ohne optionale Metadaten sind online beschreibbar ohne Offlinezusage', () {
    final input = catalogFixture();
    input['species'][0]['media']['portrait'].remove('sha256');
    input['species'][0]['media']['portrait'].remove('bytes');
    final portrait = Catalog.fromJson(input).species.first.portrait!;
    expect(portrait.sha256, isNull);
    expect(portrait.bytes, isNull);
  });
  test(
    'Basiskatalog spart Fachtexte und Taxonomie ohne Fachinhalte zu erfinden',
    () {
      final catalog = Catalog.fromJson(
        Catalog.fromJson(catalogFixture()).toJson(includeDetails: false),
      );
      expect(catalog.species.first.sections, isEmpty);
      expect(catalog.species.first.taxonomy, isEmpty);
      expect(catalog.species.first.media, isNotEmpty);
    },
  );
  for (final address in [
    'http://project.invalid',
    'https://user:pass@project.invalid',
    'https://project.invalid/path',
    'https://project.invalid/?token=secret',
  ]) {
    test(
      'Projektadresse benötigt eigenen sicheren Ursprung: ${Uri.parse(address).host}',
      () {
        expect(() => normalizeServer(address), throwsFormatException);
      },
    );
  }
  test(
    'Abgelaufene Gerätezulassung erlaubt keine erneute Offlineanmeldung',
    () {
      expect(
        sessionFixture(
          deviceExpiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
        ).mayReadOffline,
        false,
      );
    },
  );
  test('Doppelte Medienkennungen werden vor Paketbildung abgelehnt', () {
    final input = cloneJson(catalogFixture());
    input['species'][0]['media']['sounds'].add(
      cloneJson(input['species'][0]['media']['sounds'][0]),
    );
    expect(() => Catalog.fromJson(input), throwsFormatException);
  });
  test('Projekt und Person bleiben bei einer Sitzungserneuerung gebunden', () {
    final previous = sessionFixture();
    final changed = previous.toStored()..['projectId'] = 'different-project';
    expect(
      () =>
          ProjectSession.fromJson(previous.server, changed, previous: previous),
      throwsA(isA<ProjectApiException>()),
    );
    final full = previous.toStored()..['scope'] = 'full';
    expect(
      () => ProjectSession.fromJson(previous.server, full),
      throwsFormatException,
    );
  });
  test(
    'Optionale Quellen und NC-Nutzungshinweise bleiben im Katalog-Roundtrip',
    () {
      final input = catalogFixture();
      const credit =
          'Synthetische Testquelle · CC BY-NC · https://example.invalid/quelle';
      input['species'][0]['media']['sounds'][0]['attribution'] = credit;
      final roundtrip = Catalog.fromJson(Catalog.fromJson(input).toJson());
      expect(roundtrip.species.first.sounds.first.attribution, credit);
    },
  );
}
