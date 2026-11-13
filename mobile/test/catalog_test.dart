import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:arten_explorer/data/project_api.dart';

import 'support.dart';

Species listedSpecies(
  String id,
  String name,
  String scientificName, {
  List<Taxon> taxonomy = const [],
  String? websiteUrl,
}) => Species(
  id: id,
  commonName: name,
  scientificName: scientificName,
  taxonomy: List.unmodifiable(taxonomy),
  sections: const [],
  websiteUrl: websiteUrl == null ? null : Uri.parse(websiteUrl),
  sounds: const [],
  gallery: const [],
);

Catalog listCatalog(List<Species> species) => Catalog(
  revision: 'unchanged-list-fixture',
  generatedAt: DateTime.utc(2026, 11, 1),
  species: List.unmodifiable(species),
);

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
  test('Artenliste sortiert deutsch ohne Quellreihenfolge oder Katalogbytes zu ändern', () {
    final catalog = listCatalog([
      listedSpecies('zebra', 'Zebra', 'Equus zebra'),
      listedSpecies('umlaut-z', 'Ähre', 'Zeta alpha'),
      listedSpecies('street-b', 'Straße', 'Strix alba'),
      listedSpecies('no-common', '   ', 'Bubo bubo'),
      listedSpecies('oil', 'Öl', 'Oleum fixture'),
      listedSpecies('umlaut-a', 'Ahre', 'Alpha beta'),
      listedSpecies('oven', 'Ofen', 'Furnus fixture'),
      listedSpecies('street-a', 'Strasse', 'Strix alba'),
      listedSpecies('owl-z', 'Ühu', 'Zeta owl'),
      listedSpecies('owl-a', 'uHU', 'Alpha owl'),
    ]);
    final before = catalog.encode();
    final sourceOrder = catalog.species.map((entry) => entry.id).toList();
    expect(catalog.search('').map((entry) => entry.id), [
      'umlaut-a',
      'umlaut-z',
      'no-common',
      'oven',
      'oil',
      'street-a',
      'street-b',
      'owl-a',
      'owl-z',
      'zebra',
    ]);
    expect(catalog.species[3].displayName, 'Bubo bubo');
    final result = catalog.search('');
    result.clear();
    expect(catalog.species.map((entry) => entry.id), sourceOrder);
    expect(catalog.encode(), before);
    expect(catalog.revision, 'unchanged-list-fixture');
    expect(catalog.generatedAt, DateTime.utc(2026, 11, 1));
  });
  test('Gruppen stammen nur aus eindeutiger tatsächlicher Klasse und bleiben unveränderlich', () {
    final catalog = listCatalog([
      listedSpecies(
        'bird-one',
        'Vogel',
        'Avis one',
        taxonomy: [
          const Taxon('Class', 'Aves'),
          const Taxon(' KLASSE ', ' AVES '),
        ],
      ),
      listedSpecies(
        'lizard',
        'Eidechse',
        'Lacerta fixture',
        taxonomy: [const Taxon('class', 'Reptilia')],
      ),
      listedSpecies(
        'mammal',
        'Säuger',
        'Mammalia fixture',
        taxonomy: [const Taxon('klasse', 'MAMMALIA')],
      ),
      listedSpecies(
        'fish',
        'Fisch',
        'Piscis fixture',
        taxonomy: [const Taxon('class', 'Actinopterygii')],
      ),
      listedSpecies(
        'missing',
        'Ohne Klasse',
        'Incertus one',
        taxonomy: [const Taxon('order', 'Passeriformes')],
      ),
      listedSpecies(
        'conflicting',
        'Widerspruch',
        'Incertus two',
        taxonomy: [
          const Taxon('class', 'Aves'),
          const Taxon('klasse', 'Reptilia'),
        ],
      ),
      listedSpecies(
        'insect',
        'Insekt',
        'Insectum fixture',
        taxonomy: [const Taxon('class', 'Insecta')],
      ),
      listedSpecies(
        'frog',
        'Frosch',
        'Rana fixture',
        taxonomy: [const Taxon('class', 'Amphibia')],
      ),
      listedSpecies(
        'bird-two',
        'Zweiter Vogel',
        'Avis two',
        taxonomy: [const Taxon('class', 'aves')],
      ),
      listedSpecies(
        'wrong-rank',
        'Falscher Rang',
        'Incertus three',
        taxonomy: [const Taxon('phylum', 'Aves')],
      ),
    ]);
    final before = catalog.encode();
    final groups = catalog.groups;
    expect(groups.map((group) => group.id), [
      'class:actinopterygii',
      'class:amphibia',
      'class:insecta',
      'class:reptilia',
      'class:mammalia',
      'class:aves',
      'unassigned',
    ]);
    expect(groups.map((group) => group.label), [
      'Actinopterygii',
      'Amphibien',
      'Insecta',
      'Reptilien',
      'Säugetiere',
      'Vögel',
      'Nicht zugeordnet',
    ]);
    expect(groups.map((group) => group.count), [1, 1, 1, 1, 1, 2, 3]);
    expect(groups.any((group) => group.label == 'Fische'), false);
    expect(groups.any((group) => group.label == 'Wirbellose'), false);
    expect(
      () => groups.add(
        const SpeciesGroup(id: 'other', label: 'Andere', count: 0),
      ),
      throwsUnsupportedError,
    );
    expect(catalog.search('', groupId: 'class:aves').map((entry) => entry.id), [
      'bird-one',
      'bird-two',
    ]);
    expect(catalog.search('', groupId: 'unassigned').map((entry) => entry.id), [
      'wrong-rank',
      'missing',
      'conflicting',
    ]);
    expect(catalog.encode(), before);
  });
  test(
    'Klassenfilter und Mehrwortsuche ergeben gemeinsam alphabetische Treffer',
    () {
      final catalog = listCatalog([
        listedSpecies(
          'wood-owl',
          'Waldkauz',
          'Strix aluco',
          taxonomy: [const Taxon('class', 'Aves')],
        ),
        listedSpecies(
          'wood-lizard',
          'Waldeidechse',
          'Zootoca vivipara',
          taxonomy: [const Taxon('class', 'Reptilia')],
        ),
        listedSpecies(
          'wood-bird',
          'Waldbaumläufer',
          'Certhia familiaris',
          taxonomy: [const Taxon('class', 'Aves')],
        ),
      ]);
      final before = catalog.encode();
      expect(catalog.search(' WALD aves ').map((entry) => entry.id), [
        'wood-bird',
        'wood-owl',
      ]);
      expect(
        catalog.search('wald', groupId: 'class:aves').map((entry) => entry.id),
        ['wood-bird', 'wood-owl'],
      );
      expect(catalog.search('wald Aves', groupId: 'class:reptilia'), isEmpty);
      expect(catalog.search('', groupId: 'class:unknown'), isEmpty);
      expect(catalog.search('wald', groupId: null).map((entry) => entry.id), [
        'wood-bird',
        'wood-lizard',
        'wood-owl',
      ]);
      expect(catalog.groups.map((group) => group.count), [1, 2]);
      expect(catalog.encode(), before);
    },
  );
  test(
    'Wildlife-Regionen filtern vor der Klasse ohne den Katalog zu ändern',
    () {
      const origin = 'https://www.fnwildlifetravel.de';
      final catalog = listCatalog([
        listedSpecies(
          'specht',
          'Mittelspecht',
          'Dendrocoptes medius',
          taxonomy: [const Taxon('class', 'Aves')],
          websiteUrl: '$origin/wildlife/heimische-tierwelt/specht',
        ),
        listedSpecies(
          'tukan',
          'Tukan',
          'Ramphastos fixture',
          taxonomy: [const Taxon('class', 'Aves')],
          websiteUrl: '$origin/wildlife/costarica/tukan/',
        ),
        listedSpecies(
          'frosch',
          'Frosch',
          'Rana fixture',
          taxonomy: [const Taxon('class', 'Amphibia')],
          websiteUrl: '$origin/wildlife/costarica/frosch',
        ),
        listedSpecies(
          'alk',
          'Alk',
          'Alca fixture',
          taxonomy: [const Taxon('class', 'Aves')],
          websiteUrl: '$origin/wildlife/island/alk',
        ),
        listedSpecies(
          'antilope',
          'Rappenantilope',
          'Hippotragus niger',
          taxonomy: [const Taxon('class', 'Mammalia')],
          websiteUrl: '$origin/wildlife/afrika/antilope',
        ),
      ]);
      final before = catalog.encode();
      final regions = catalog.regions;
      expect(regions.map((entry) => entry.label), [
        'Heimische Tierwelt',
        'Afrika',
        'Costa Rica',
        'Island',
      ]);
      expect(regions.map((entry) => entry.count), [1, 1, 2, 1]);
      expect(() => regions.clear(), throwsUnsupportedError);
      expect(catalog.groupsForRegion('costarica').map((group) => group.label), [
        'Amphibien',
        'Vögel',
      ]);
      expect(catalog.groupsForRegion('asien'), isEmpty);
      expect(
        catalog
            .search('ramphastos', regionId: 'costarica', groupId: 'class:aves')
            .single
            .id,
        'tukan',
      );
      expect(catalog.search('tukan', regionId: 'island'), isEmpty);
      expect(
        catalog.search(
          'tukan',
          regionId: 'costarica',
          groupId: 'class:amphibia',
        ),
        isEmpty,
      );
      expect(catalog.search('tukan').single.id, 'tukan');
      expect(catalog.encode(), before);
    },
  );
  test('Arten ohne bestätigte Region bleiben im Bestand auffindbar', () {
    const origin = 'https://www.fnwildlifetravel.de';
    final catalog = listCatalog([
      listedSpecies('ohne-url', 'Art ohne Website', 'Example one'),
      listedSpecies(
        'fremd',
        'Fremde Website',
        'Example two',
        websiteUrl: 'https://example.org/wildlife/island/fremd',
      ),
      listedSpecies(
        'reise',
        'Reiseseite',
        'Example three',
        websiteUrl: '$origin/reisen/island/reise',
      ),
      listedSpecies(
        'uebersicht',
        'Übersicht',
        'Example four',
        websiteUrl: '$origin/wildlife/island/',
      ),
      listedSpecies(
        'unbekannt',
        'Andere Region',
        'Example five',
        websiteUrl: '$origin/wildlife/neue-region/unbekannt',
      ),
      listedSpecies(
        'asien-art',
        'Asiatische Art',
        'Example six',
        websiteUrl: '$origin/wildlife/asien/asien-art',
      ),
    ]);
    expect(catalog.regions.map((entry) => entry.label), [
      'Asien',
      'Ohne Regionszuordnung',
    ]);
    expect(catalog.search('', regionId: 'asien').single.id, 'asien-art');
    expect(catalog.search('', regionId: 'island'), isEmpty);
    expect(catalog.search('example', regionId: 'unassigned'), hasLength(5));
    expect(catalog.search('example'), hasLength(6));
  });
  test(
    'Ein leerer Katalog erfindet weder Klassen noch eine Zuordnungsgruppe',
    () {
      final catalog = listCatalog([]);
      expect(catalog.groups, isEmpty);
      expect(catalog.regions, isEmpty);
      expect(catalog.search(''), isEmpty);
      expect(catalog.search('', groupId: 'unassigned'), isEmpty);
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
