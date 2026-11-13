import 'dart:async';
import 'dart:convert';

import '../domain/art_editorial.dart';
import '../domain/catalog.dart' show Catalog, array, object, requiredText;

/// A complete Reader 2 snapshot confirmed by the service after the last page.
class ReaderCatalogSnapshot {
  final String projectId, revision;
  final DateTime generatedAt;
  final List<Map<String, dynamic>> species;
  final Map<String, ArtEditorial> editorialById;

  const ReaderCatalogSnapshot._({
    required this.projectId,
    required this.revision,
    required this.generatedAt,
    required this.species,
    required this.editorialById,
  });

  Catalog toCatalog() => Catalog.fromJson({
    'schemaVersion': 1,
    'projectId': projectId,
    'revision': 'reader-2:$revision',
    'generatedAt': generatedAt.toUtc().toIso8601String(),
    'species': species.map(_speciesEntry).toList(),
  });

  Map<String, dynamic> _speciesEntry(Map<String, dynamic> entry) {
    final media = object(entry['media'], 'Medien');
    final sounds = array(
      media['sounds'],
      'Tierstimmen',
    ).map(_attachment).nonNulls.toList();
    final gallery = array(media['gallery'], 'Fotogalerie')
        .map((value) {
          final usage = object(value, 'Bildverwendung');
          return _attachment(usage['asset'], usage: usage);
        })
        .nonNulls
        .toList();
    final editorial = editorialById[entry['id']];
    final content = object(entry['content'], 'Arttexte');
    final sections = <Map<String, dynamic>>[
      if (editorial == null)
        ...array(
          content['sections'],
          'Abschnitte',
        ).map((value) => object(value, 'Abschnitt')),
    ];
    if (!sections.any((section) => section['title'] == 'Allgemein')) {
      final status = object(entry['status'], 'Gefährdung');
      final general = <Map<String, dynamic>>[
        ...array(
          entry['general'],
          'Allgemein',
        ).map((value) => object(value, 'Allgemein')),
        for (final (key, label) in const [
          ('status', 'Status'),
          ('category', 'Kategorie'),
          ('trend', 'Trend'),
          ('population', 'Populationsgröße'),
        ])
          {'label': label, 'value': status[key]},
      ];
      final details = general
          .where(
            (row) =>
                row['value'] is String &&
                (row['value'] as String).trim().isNotEmpty,
          )
          .map(
            (row) =>
                '${requiredText(row['label'], 'Feldname')}: ${row['value']}',
          )
          .join('\n');
      if (details.isNotEmpty) {
        final used = sections.map((section) => section['id']).toSet();
        var id = 'reader-general';
        while (used.contains(id)) {
          id += '-x';
        }
        sections.add({
          'id': id,
          'title': 'Allgemein',
          'text': details,
          'intentionallyEmpty': false,
        });
      }
    }
    return {
      for (final key in const [
        'id',
        'commonName',
        'scientificName',
        'taxonomy',
        'websiteUrl',
      ])
        key: entry[key],
      'sections': sections,
      if (editorial != null) 'editorial': editorial.toJson(),
      'media': {
        'portrait': _attachment(media['portrait']),
        'map': _attachment(media['map']),
        if (sounds.isNotEmpty) 'spectrogram': _attachment(media['spectrogram']),
        'sounds': sounds,
        'gallery': gallery,
      },
    };
  }

  Map<String, dynamic>? _attachment(
    Object? value, {
    Map<String, dynamic>? usage,
  }) {
    if (value == null && usage == null) return null;
    final file = object(value, 'Medienbeleg');
    final kind = file['kind'];
    if (kind == 'unavailable') {
      if (file['projectId'] != projectId || file['reason'] != 'not-provided') {
        throw const FormatException(
          'Ungültiger Beleg für eine fehlende Projektdatei.',
        );
      }
      return null;
    }
    if (!const {
      'public-https',
      'project-image',
      'project-normal',
    }.contains(kind)) {
      throw const FormatException('Unbekannte Medienquelle im Projektkatalog.');
    }
    return {
      if (kind == 'public-https') ...{
        for (final key in const [
          'url',
          'bytes',
          'sha256',
          'mimeType',
          'attribution',
        ])
          if (file.containsKey(key)) key: file[key],
      } else
        'projectFile': file,
      'id': usage == null ? file['id'] : usage['id'],
      if (usage != null) ...{
        'alt': usage['alt'],
        'caption': usage['caption'],
        'order': usage['order'],
      },
    };
  }

  static Future<ReaderCatalogSnapshot> read({
    required String projectId,
    required Future<Map<String, dynamic>> Function(Map<String, String>) get,
  }) async {
    const timeLimit = Duration(minutes: 2);
    final clock = Stopwatch()..start();
    var bytes = 0;
    Future<_ReaderPage> page(Map<String, String> parameters) async {
      final remaining = timeLimit - clock.elapsed;
      if (remaining <= Duration.zero) {
        throw TimeoutException('Der Katalogabruf hat zu lange gedauert.');
      }
      final value = await get(parameters).timeout(remaining);
      final pageBytes = utf8.encode(jsonEncode(value)).length;
      bytes += pageBytes;
      if (pageBytes > 4 * 1024 * 1024 + 16 * 1024 || bytes > 32 * 1024 * 1024) {
        throw const FormatException('Der gemeinsame Artenbestand ist zu groß.');
      }
      final result = _ReaderPage.parse(value);
      if (result.projectId != projectId) {
        throw const FormatException(
          'Die Leserfassung gehört zu einem anderen Projekt.',
        );
      }
      return result;
    }

    final first = await page(const {});
    var current = first;
    final entries = <Map<String, dynamic>>[];
    final editorials = <String, ArtEditorial>{};
    final cursors = <String>{};
    var lastId = '';
    while (true) {
      if (!current.sameSnapshot(first) || current.checked) {
        throw const FormatException(
          'Der Artenbestand hat sich beim Abruf verändert.',
        );
      }
      for (final entry in current.species) {
        final id = requiredText(entry['id'], 'Artkennung', maximum: 120);
        if (!_speciesId.hasMatch(id) || id.compareTo(lastId) <= 0) {
          throw const FormatException(
            'Die Reihenfolge der Artkennungen ist ungültig.',
          );
        }
        lastId = id;
        final content = object(entry['content'], 'Arttexte');
        switch (content['kind']) {
          case 'structured':
            editorials[id] = ArtEditorial.fromJson(content);
          case 'legacy-sections':
            if (content.length != 2 || content['sections'] is! List) {
              throw const FormatException('Ungültige Arttexte.');
            }
          default:
            throw const FormatException('Unbekannte Gliederung der Artseite.');
        }
        entries.add(Map.unmodifiable(entry));
      }
      final count = entries.length;
      if (count > first.totalCount ||
          current.complete != (count == first.totalCount)) {
        throw const FormatException(
          'Der gelieferte Artenbestand ist unvollständig.',
        );
      }
      if (current.complete) break;
      final cursor = current.nextCursor!;
      if (!cursors.add(cursor)) {
        throw const FormatException(
          'Der Projektdienst hat eine Fortsetzung wiederholt.',
        );
      }
      current = await page({'snapshot': first.snapshot, 'cursor': cursor});
    }

    final checked = await page({'snapshot': first.snapshot, 'check': '1'});
    if (!checked.sameSnapshot(first) || !checked.checked) {
      throw const FormatException(
        'Die abschließende Bestandsprüfung ist fehlgeschlagen.',
      );
    }
    return ReaderCatalogSnapshot._(
      projectId: projectId,
      revision: first.revision,
      generatedAt: first.generatedAt,
      species: List.unmodifiable(entries),
      editorialById: Map.unmodifiable(editorials),
    );
  }
}

final _snapshotHash = RegExp(r'^[a-f0-9]{64}$');
final _cursorToken = RegExp(r'^[A-Za-z0-9_-]{1,512}$');
final _speciesId = RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$');

class _ReaderPage {
  final String projectId, revision, snapshot;
  final DateTime generatedAt;
  final int totalCount;
  final List<Map<String, dynamic>> species;
  final String? nextCursor;
  final bool complete, checked;

  const _ReaderPage({
    required this.projectId,
    required this.revision,
    required this.snapshot,
    required this.generatedAt,
    required this.totalCount,
    required this.species,
    required this.nextCursor,
    required this.complete,
    required this.checked,
  });

  factory _ReaderPage.parse(Map<String, dynamic> value) {
    const fields = {
      'schemaVersion',
      'projectId',
      'revision',
      'generatedAt',
      'snapshot',
      'totalCount',
      'species',
      'nextCursor',
      'complete',
      'checked',
    };
    const malformed = FormatException(
      'Ungültige Seite des gemeinsamen Artenbestands.',
    );
    if (value['schemaVersion'] != 2 ||
        value.length != fields.length ||
        !value.keys.every(fields.contains)) {
      throw malformed;
    }
    final snapshot = value['snapshot'],
        total = value['totalCount'],
        entries = value['species'],
        cursor = value['nextCursor'],
        complete = value['complete'],
        checked = value['checked'];
    final generatedAt = DateTime.tryParse(
      requiredText(value['generatedAt'], 'Katalogdatum', maximum: 40),
    );
    if (snapshot is! String ||
        !_snapshotHash.hasMatch(snapshot) ||
        total is! int ||
        total < 0 ||
        total > 20000 ||
        entries is! List ||
        entries.length > 25 ||
        complete is! bool ||
        checked is! bool ||
        generatedAt == null ||
        (complete
            ? cursor != null
            : cursor is! String || !_cursorToken.hasMatch(cursor)) ||
        (checked
            ? !complete || entries.isNotEmpty
            : entries.isEmpty && total != 0)) {
      throw malformed;
    }
    return _ReaderPage(
      projectId: requiredText(
        value['projectId'],
        'Projektkennung',
        maximum: 256,
      ),
      revision: requiredText(
        value['revision'],
        'Katalogrevision',
        maximum: 256,
      ),
      snapshot: snapshot,
      generatedAt: generatedAt,
      totalCount: total,
      species: entries.map((entry) => object(entry, 'Art')).toList(),
      nextCursor: cursor as String?,
      complete: complete,
      checked: checked,
    );
  }

  bool sameSnapshot(_ReaderPage other) =>
      projectId == other.projectId &&
      revision == other.revision &&
      snapshot == other.snapshot &&
      totalCount == other.totalCount;
}
