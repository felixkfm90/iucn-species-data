import 'dart:convert';

import 'art_editorial.dart';
import 'project_media.dart';
import 'taxonomy_names.dart';

String requiredText(Object? value, String field, {int maximum = 200000}) {
  if (value is! String || value.trim().isEmpty || value.length > maximum) {
    throw FormatException(
      'Ungültiger Katalog: $field fehlt oder ist ungültig.',
    );
  }
  return value;
}

Map<String, dynamic> object(Object? value, String field) {
  if (value is! Map<String, dynamic>) {
    throw FormatException('Ungültiger Katalog: $field ist kein Objekt.');
  }
  return value;
}

List<dynamic> array(Object? value, String field) {
  if (value is! List || value.length > 20000) {
    throw FormatException(
      'Ungültiger Katalog: $field ist keine gültige Liste.',
    );
  }
  return value;
}

Uri httpsUri(Object? value, String field) {
  final uri = Uri.tryParse(requiredText(value, field, maximum: 8192));
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.fragment.isNotEmpty) {
    throw FormatException(
      '$field benötigt eine HTTPS-Adresse ohne Zugangsdaten.',
    );
  }
  return uri;
}

String _germanDictionaryKey(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 'ss');

class SpeciesGroup {
  final String id, label;
  final int count;
  const SpeciesGroup({
    required this.id,
    required this.label,
    required this.count,
  });
}

// Follow the Wildlife menu order, including its reserved Asien entry.
const _regionLabels = <String, String>{
  'heimische-tierwelt': 'Heimische Tierwelt',
  'afrika': 'Afrika',
  'costarica': 'Costa Rica',
  'island': 'Island',
  'asien': 'Asien',
  'unassigned': 'Ohne Regionszuordnung',
};
final _wildlifeSpeciesPath = RegExp(
  r'^/wildlife/([a-z0-9]+(?:-[a-z0-9]+)*)/[a-z0-9]+(?:-[a-z0-9]+)*/?$',
);

String _speciesRegionId(Species species) {
  final url = species.websiteUrl;
  if (url == null ||
      url.scheme != 'https' ||
      url.host != 'www.fnwildlifetravel.de' ||
      url.port != 443 ||
      url.userInfo.isNotEmpty ||
      url.hasQuery ||
      url.hasFragment) {
    return 'unassigned';
  }
  final id = _wildlifeSpeciesPath.firstMatch(url.path)?.group(1);
  return id != null && _regionLabels.containsKey(id) ? id : 'unassigned';
}

MapEntry<String, String>? _uniqueTaxon(Species species, Set<String> ranks) {
  final values = <String, String>{};
  for (final taxon in species.taxonomy) {
    final rank = taxon.rank.trim().toLowerCase();
    if (!ranks.contains(rank)) continue;
    final name = taxon.name.trim();
    if (name.isEmpty) continue;
    final key = name.toLowerCase();
    final previous = values[key];
    if (previous == null || name.compareTo(previous) < 0) {
      values[key] = name;
    }
  }
  return values.length == 1 ? values.entries.single : null;
}

String taxonomyDisplayName(String rank, String name) =>
    germanTaxonomyNames[rank.trim().toLowerCase()]?[name
        .trim()
        .toLowerCase()] ??
    name;

({String id, String label}) _speciesClass(Species species) {
  final entry = _uniqueTaxon(species, const {'class', 'klasse'});
  if (entry == null) {
    return (id: 'unassigned', label: 'Nicht zugeordnet');
  }
  const labels = {
    'aves': 'Vögel',
    'mammalia': 'Säugetiere',
    'reptilia': 'Reptilien',
    'amphibia': 'Amphibien',
  };
  return (id: 'class:${entry.key}', label: labels[entry.key] ?? entry.value);
}

List<({String id, String label, List<Species> species})> speciesClasses(
  Iterable<Species> sortedSpecies,
) {
  final grouped = <String, ({String label, List<Species> species})>{};
  for (final entry in sortedSpecies) {
    final group = _speciesClass(entry), previous = grouped[group.id];
    final label = previous == null || group.label.compareTo(previous.label) < 0
        ? group.label
        : previous.label;
    final members = previous?.species ?? <Species>[];
    members.add(entry);
    grouped[group.id] = (label: label, species: members);
  }
  return grouped.entries
      .map(
        (group) => (
          id: group.key,
          label: group.value.label,
          species: group.value.species,
        ),
      )
      .toList()
    ..sort((a, b) {
      if (a.id == 'unassigned') return b.id == 'unassigned' ? 0 : 1;
      if (b.id == 'unassigned') return -1;
      final label = _germanDictionaryKey(a.label)
          .compareTo(_germanDictionaryKey(b.label));
      return label != 0 ? label : a.id.compareTo(b.id);
    });
}

List<({String id, String label, List<Species> species})> speciesFamilies(
  Iterable<Species> sortedSpecies,
) {
  final grouped = <String, ({String label, List<Species> species})>{};
  for (final entry in sortedSpecies) {
    final taxon = _uniqueTaxon(entry, const {'family', 'familie'});
    final id = taxon?.key ?? '';
    grouped
        .putIfAbsent(
          id,
          () => (
            label: taxon == null
                ? 'Familie nicht zugeordnet'
                : taxonomyDisplayName('family', taxon.value),
            species: [],
          ),
        )
        .species
        .add(entry);
  }
  return grouped.entries
      .map(
        (entry) => (
          id: entry.key,
          label: entry.value.label,
          species: entry.value.species,
        ),
      )
      .toList()
    ..sort((a, b) {
      if (a.id.isEmpty) return b.id.isEmpty ? 0 : 1;
      if (b.id.isEmpty) return -1;
      final label = _germanDictionaryKey(a.label)
          .compareTo(_germanDictionaryKey(b.label));
      return label != 0 ? label : a.id.compareTo(b.id);
    });
}

int _compareSpecies(Species a, Species b) {
  final display = _germanDictionaryKey(a.displayName)
      .compareTo(_germanDictionaryKey(b.displayName));
  if (display != 0) return display;
  final scientific = _germanDictionaryKey(a.scientificName)
      .compareTo(_germanDictionaryKey(b.scientificName));
  return scientific != 0 ? scientific : a.id.compareTo(b.id);
}

class Catalog {
  final String revision;
  final String? projectId;
  final DateTime generatedAt;
  final List<Species> species;
  const Catalog({
    required this.revision,
    this.projectId,
    required this.generatedAt,
    required this.species,
  });

  factory Catalog.fromJson(Map<String, dynamic> json) {
    if (json['schemaVersion'] != 1) {
      throw const FormatException(
        'Diese Katalogversion wird noch nicht unterstützt.',
      );
    }
    final generatedAt = DateTime.tryParse(
      requiredText(json['generatedAt'], 'generatedAt'),
    );
    if (generatedAt == null) {
      throw const FormatException('Ungültiges Katalogdatum.');
    }
    final species = array(
      json['species'],
      'species',
    ).map((entry) => Species.fromJson(object(entry, 'Art'))).toList();
    if (species.map((entry) => entry.id).toSet().length != species.length) {
      throw const FormatException('Doppelte Artkennung im Katalog.');
    }
    final projectId = json.containsKey('projectId')
        ? requiredText(json['projectId'], 'Projektkennung', maximum: 160)
        : null;
    if (species.expand((entry) => entry.media).any((entry) {
      final file = entry.media.projectFile;
      return file != null && file.projectId != projectId;
    })) {
      throw const FormatException(
        'Eine Mediendatei gehört zu einem anderen Projekt.',
      );
    }
    return Catalog(
      revision: requiredText(json['revision'], 'revision', maximum: 256),
      projectId: projectId,
      generatedAt: generatedAt,
      species: List.unmodifiable(species),
    );
  }

  List<SpeciesGroup> get regions {
    final counts = <String, int>{};
    for (final entry in species) {
      final id = _speciesRegionId(entry);
      counts.update(id, (count) => count + 1, ifAbsent: () => 1);
    }
    return List.unmodifiable([
      for (final region in _regionLabels.entries)
        if (counts[region.key] case final count?)
          SpeciesGroup(id: region.key, label: region.value, count: count),
    ]);
  }

  Iterable<Species> _speciesInRegion(String? regionId) => regionId == null
      ? species
      : species.where((entry) => _speciesRegionId(entry) == regionId);

  List<SpeciesGroup> get groups => groupsForRegion(null);

  List<SpeciesGroup> groupsForRegion(String? regionId) {
    return List.unmodifiable(
      speciesClasses(_speciesInRegion(regionId)).map(
        (group) => SpeciesGroup(
          id: group.id,
          label: group.label,
          count: group.species.length,
        ),
      ),
    );
  }

  List<Species> search(String query, {String? groupId, String? regionId}) {
    final terms = query
        .toLowerCase()
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty);
    return _speciesInRegion(regionId).where((entry) {
      if (groupId != null && _speciesClass(entry).id != groupId) return false;
      final value =
          '${entry.commonName} ${entry.scientificName} ${entry.taxonomy.map((rank) => rank.name).join(' ')}'
              .toLowerCase();
      return terms.every(value.contains);
    }).toList()..sort(_compareSpecies);
  }

  Map<String, dynamic> toJson({bool includeDetails = true}) => {
    'schemaVersion': 1,
    'revision': revision,
    if (projectId != null) 'projectId': projectId,
    'generatedAt': generatedAt.toUtc().toIso8601String(),
    'species': species
        .map((entry) => entry.toJson(includeDetails: includeDetails))
        .toList(),
  };
  String encode({bool includeDetails = true}) =>
      jsonEncode(toJson(includeDetails: includeDetails));
}

class Taxon {
  final String rank, name;
  const Taxon(this.rank, this.name);
  factory Taxon.fromJson(Map<String, dynamic> value) => Taxon(
    requiredText(value['rank'], 'Rang'),
    requiredText(value['name'], 'Taxon'),
  );
  Map<String, dynamic> toJson() => {'rank': rank, 'name': name};
}

class ArtSection {
  final String id, title, text;
  final bool intentionallyEmpty;
  const ArtSection({
    required this.id,
    required this.title,
    required this.text,
    required this.intentionallyEmpty,
  });
  factory ArtSection.fromJson(Map<String, dynamic> value) {
    final text = value['text'];
    if (text is! String ||
        text.length > 1000000 ||
        value['intentionallyEmpty'] is! bool) {
      throw const FormatException('Ungültiger Artabschnitt.');
    }
    return ArtSection(
      id: requiredText(value['id'], 'Abschnittkennung'),
      title: requiredText(value['title'], 'Überschrift'),
      text: text,
      intentionallyEmpty: value['intentionallyEmpty'] as bool,
    );
  }
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'text': text,
    'intentionallyEmpty': intentionallyEmpty,
  };
}

enum MediaKind { portrait, map, sound, gallery }

class ArtMedia {
  final String id;
  final Uri? url;
  final ProjectMediaFile? projectFile;
  final int? bytes;
  final String? sha256, mimeType;
  final String alt, caption, attribution;
  final int order;
  const ArtMedia({
    required this.id,
    required Uri this.url,
    this.bytes,
    this.sha256,
    this.mimeType,
    this.alt = '',
    this.caption = '',
    this.attribution = '',
    this.order = 0,
  }) : projectFile = null;

  ArtMedia._project({
    required this.id,
    required ProjectMediaFile file,
    required this.alt,
    required this.caption,
    required this.order,
  }) : projectFile = file,
       url = null,
       bytes = file.bytes,
       sha256 = file.sha256,
       mimeType = file.mimeType,
       attribution = file.attribution;

  factory ArtMedia.fromJson(Map<String, dynamic> value) {
    final attribution = value['attribution'];
    if (attribution != null &&
        (attribution is! String || attribution.length > 8000)) {
      throw const FormatException('Ungültiger Quellen- oder Nutzungshinweis.');
    }
    final size = value['bytes'], hash = value['sha256'];
    if (size != null && (size is! int || size < 0)) {
      throw const FormatException('Ungültige Mediengröße.');
    }
    if (hash != null &&
        (hash is! String || !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(hash))) {
      throw const FormatException('Ungültige Medienprüfsumme.');
    }
    final order = value['order'];
    if (order != null && order is! int) {
      throw const FormatException('Ungültige Bildreihenfolge.');
    }
    final id = requiredText(value['id'], 'Medienkennung', maximum: 512);
    final alt = value['alt'] as String? ?? '';
    final caption =
        value['caption'] as String? ?? value['title'] as String? ?? '';
    if (value.containsKey('projectFile')) {
      if (value.keys.any(
        (key) => !const {
          'id',
          'projectFile',
          'alt',
          'caption',
          'order',
        }.contains(key),
      )) {
        throw const FormatException('Ungültige Projektmedienbindung.');
      }
      final file = ProjectMediaFile.fromJson(
        object(value['projectFile'], 'Projektdatei'),
      );
      return ArtMedia._project(
        id: id,
        file: file,
        alt: alt,
        caption: caption,
        order: order as int? ?? 0,
      );
    }
    return ArtMedia(
      id: id,
      url: httpsUri(value['url'], 'Medienadresse'),
      bytes: size as int?,
      sha256: (hash as String?)?.toLowerCase(),
      mimeType: value['mimeType'] as String?,
      alt: alt,
      caption: caption,
      attribution: attribution as String? ?? '',
      order: order as int? ?? 0,
    );
  }

  String get extension {
    final type = mimeType?.split(';').first;
    return switch (type) {
      'image/svg+xml' => '.svg',
      'image/png' => '.png',
      'image/jpeg' => '.jpg',
      'image/webp' => '.webp',
      'audio/mpeg' => '.mp3',
      'audio/mp4' => '.m4a',
      'audio/ogg' => '.ogg',
      _ =>
        RegExp(
              r'\.(svg|png|jpg|jpeg|webp|mp3|m4a|ogg|wav)$',
              caseSensitive: false,
            ).firstMatch(url?.path ?? '')?.group(0)?.toLowerCase() ??
            '.bin',
    };
  }

  bool get isSvg => extension == '.svg';
  String get sourceIdentity {
    final file = projectFile;
    return file == null
        ? url!.toString()
        : 'project:${file.projectId}:${file.contentId ?? file.id}';
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (projectFile case final file?)
      'projectFile': file.toJson()
    else ...{
      'url': url!.toString(),
      if (bytes != null) 'bytes': bytes,
      if (sha256 != null) 'sha256': sha256,
      if (mimeType != null) 'mimeType': mimeType,
      if (attribution.isNotEmpty) 'attribution': attribution,
    },
    'alt': alt,
    'caption': caption,
    'order': order,
  };
}

class MediaReference {
  final String speciesId;
  final MediaKind kind;
  final ArtMedia media;
  const MediaReference(this.speciesId, this.kind, this.media);
  String get key => '$speciesId/${kind.name}/${media.id}';
}

class Species {
  final String id, scientificName, commonName;
  final List<Taxon> taxonomy;
  final List<ArtSection> sections;
  final ArtEditorial? editorial;
  final Uri? websiteUrl;
  final ArtMedia? portrait, map, spectrogram;
  final List<ArtMedia> sounds, gallery;
  const Species({
    required this.id,
    required this.scientificName,
    required this.commonName,
    required this.taxonomy,
    required this.sections,
    this.editorial,
    this.websiteUrl,
    this.portrait,
    this.map,
    this.spectrogram,
    required this.sounds,
    required this.gallery,
  });

  factory Species.fromJson(Map<String, dynamic> value) {
    final id = requiredText(value['id'], 'Artkennung', maximum: 120);
    if (!RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(id)) {
      throw const FormatException('Ungültige Artkennung.');
    }
    final media = object(value['media'], 'Medien');
    final gallery = array(
      media['gallery'],
      'Galerie',
    ).map((entry) => ArtMedia.fromJson(object(entry, 'Galeriebild'))).toList();
    final sounds = array(
      media['sounds'],
      'Ton',
    ).map((entry) => ArtMedia.fromJson(object(entry, 'Ton'))).toList();
    final spectrogram = media['spectrogram'] == null
        ? null
        : ArtMedia.fromJson(object(media['spectrogram'], 'Spektrogramm'));
    if (spectrogram != null &&
        (sounds.isEmpty ||
            spectrogram.mimeType != 'image/webp' ||
            sounds.any((sound) => sound.id == spectrogram.id))) {
      throw const FormatException('Ungültige Zuordnung des Spektrogramms.');
    }
    for (final group in [sounds, gallery]) {
      if (group.map((entry) => entry.id).toSet().length != group.length) {
        throw const FormatException(
          'Doppelte Medienkennung innerhalb einer Kategorie.',
        );
      }
    }
    // Stable ordering keeps the catalog order for equal order values.
    final indexed = gallery.indexed.toList()
      ..sort((a, b) {
        final order = a.$2.order.compareTo(b.$2.order);
        return order != 0 ? order : a.$1.compareTo(b.$1);
      });
    final sections = array(
      value['sections'],
      'Arttexte',
    ).map((entry) => ArtSection.fromJson(object(entry, 'Abschnitt'))).toList();
    if (sections.map((section) => section.id).toSet().length !=
        sections.length) {
      throw const FormatException('Doppelte Abschnittkennung.');
    }
    return Species(
      id: id,
      scientificName: requiredText(
        value['scientificName'],
        'Wissenschaftlicher Name',
      ),
      commonName: value['commonName'] is String
          ? value['commonName'] as String
          : '',
      taxonomy: List.unmodifiable(
        array(
          value['taxonomy'],
          'Taxonomie',
        ).map((entry) => Taxon.fromJson(object(entry, 'Taxonomie'))),
      ),
      sections: List.unmodifiable(sections),
      editorial: value.containsKey('editorial')
          ? ArtEditorial.fromJson(value['editorial'])
          : null,
      websiteUrl: value['websiteUrl'] == null
          ? null
          : httpsUri(value['websiteUrl'], 'Website'),
      portrait: media['portrait'] == null
          ? null
          : ArtMedia.fromJson(object(media['portrait'], 'Artbild')),
      map: media['map'] == null
          ? null
          : ArtMedia.fromJson(object(media['map'], 'Karte')),
      spectrogram: spectrogram,
      sounds: List.unmodifiable(sounds),
      gallery: List.unmodifiable(indexed.map((entry) => entry.$2)),
    );
  }
  String get displayName =>
      commonName.trim().isEmpty ? scientificName : commonName;

  ({ArtSection section, String subtitle})? get websiteHeading {
    if (websiteUrl == null || sections.isEmpty) return null;
    final section = sections.first;
    if (section.text.trim().isNotEmpty) return null;
    final separator = RegExp(r'\s+[-–—]\s+').firstMatch(section.title);
    if (separator == null) return null;
    final name = section.title.substring(0, separator.start).trim();
    final subtitle = section.title.substring(separator.end).trim();
    final importedHeading =
        RegExp(r'^section-001-[a-f0-9]{12}$').hasMatch(section.id) &&
        section.intentionallyEmpty &&
        sections.length > 1 &&
        sections[1].title == 'Allgemein';
    if (name.isEmpty ||
        subtitle.isEmpty ||
        (!importedHeading &&
            _germanDictionaryKey(name) != _germanDictionaryKey(displayName))) {
      return null;
    }
    return (section: section, subtitle: subtitle);
  }

  Iterable<MediaReference> get media sync* {
    if (portrait != null) {
      yield MediaReference(id, MediaKind.portrait, portrait!);
    }
    if (map != null) yield MediaReference(id, MediaKind.map, map!);
    for (final entry in sounds) {
      yield MediaReference(id, MediaKind.sound, entry);
    }
    if (spectrogram != null) {
      yield MediaReference(id, MediaKind.sound, spectrogram!);
    }
    for (final entry in gallery) {
      yield MediaReference(id, MediaKind.gallery, entry);
    }
  }

  Map<String, dynamic> toJson({bool includeDetails = true}) => {
    'id': id,
    'scientificName': scientificName,
    'commonName': commonName,
    'taxonomy': includeDetails
        ? taxonomy.map((entry) => entry.toJson()).toList()
        : [],
    'sections': includeDetails
        ? sections.map((entry) => entry.toJson()).toList()
        : [],
    if (includeDetails && editorial != null) 'editorial': editorial!.toJson(),
    if (websiteUrl != null) 'websiteUrl': websiteUrl.toString(),
    'media': {
      if (portrait != null) 'portrait': portrait!.toJson(),
      if (map != null) 'map': map!.toJson(),
      if (spectrogram != null) 'spectrogram': spectrogram!.toJson(),
      'sounds': sounds.map((entry) => entry.toJson()).toList(),
      'gallery': gallery.map((entry) => entry.toJson()).toList(),
    },
  };
}

class OfflineSelection {
  final bool texts, portraits, maps, sounds, gallery;
  const OfflineSelection({
    this.texts = true,
    this.portraits = false,
    this.maps = false,
    this.sounds = false,
    this.gallery = false,
  });
  const OfflineSelection.withoutWebsitePhotos()
    : texts = true,
      portraits = true,
      maps = true,
      sounds = true,
      gallery = false;
  factory OfflineSelection.fromJson(Map<String, dynamic> value) =>
      OfflineSelection(
        texts: value['texts'] == true,
        portraits: value['portraits'] == true,
        maps: value['maps'] == true,
        sounds: value['sounds'] == true,
        gallery: value['gallery'] == true,
      );
  bool includes(MediaKind kind) => switch (kind) {
    MediaKind.portrait => portraits,
    MediaKind.map => maps,
    MediaKind.sound => sounds,
    MediaKind.gallery => gallery,
  };
  OfflineSelection without(MediaKind kind) => OfflineSelection(
    texts: texts,
    portraits: portraits && kind != MediaKind.portrait,
    maps: maps && kind != MediaKind.map,
    sounds: sounds && kind != MediaKind.sound,
    gallery: gallery && kind != MediaKind.gallery,
  );
  List<MediaReference> select(Catalog catalog) => catalog.species
      .expand((entry) => entry.media)
      .where((entry) => includes(entry.kind))
      .toList();
  Map<String, dynamic> toJson() => {
    'texts': texts,
    'portraits': portraits,
    'maps': maps,
    'sounds': sounds,
    'gallery': gallery,
  };
}

String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}
