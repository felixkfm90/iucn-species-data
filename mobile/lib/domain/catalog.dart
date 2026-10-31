import 'dart:convert';

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

class Catalog {
  final String revision;
  final DateTime generatedAt;
  final List<Species> species;
  const Catalog({
    required this.revision,
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
    return Catalog(
      revision: requiredText(json['revision'], 'revision', maximum: 256),
      generatedAt: generatedAt,
      species: List.unmodifiable(species),
    );
  }

  List<Species> search(String query) {
    final terms = query
        .toLowerCase()
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty);
    return species.where((entry) {
      final value =
          '${entry.commonName} ${entry.scientificName} ${entry.taxonomy.map((rank) => rank.name).join(' ')}'
              .toLowerCase();
      return terms.every(value.contains);
    }).toList();
  }

  Map<String, dynamic> toJson({bool includeDetails = true}) => {
    'schemaVersion': 1,
    'revision': revision,
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
  final Uri url;
  final int? bytes;
  final String? sha256, mimeType;
  final String alt, caption, attribution;
  final int order;
  const ArtMedia({
    required this.id,
    required this.url,
    this.bytes,
    this.sha256,
    this.mimeType,
    this.alt = '',
    this.caption = '',
    this.attribution = '',
    this.order = 0,
  });

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
    return ArtMedia(
      id: requiredText(value['id'], 'Medienkennung', maximum: 512),
      url: httpsUri(value['url'], 'Medienadresse'),
      bytes: size as int?,
      sha256: (hash as String?)?.toLowerCase(),
      mimeType: value['mimeType'] as String?,
      alt: value['alt'] as String? ?? '',
      caption: value['caption'] as String? ?? value['title'] as String? ?? '',
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
            ).firstMatch(url.path)?.group(0)?.toLowerCase() ??
            '.bin',
    };
  }

  bool get isSvg => extension == '.svg';
  Map<String, dynamic> toJson() => {
    'id': id,
    'url': url.toString(),
    if (bytes != null) 'bytes': bytes,
    if (sha256 != null) 'sha256': sha256,
    if (mimeType != null) 'mimeType': mimeType,
    'alt': alt,
    'caption': caption,
    if (attribution.isNotEmpty) 'attribution': attribution,
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
  final Uri? websiteUrl;
  final ArtMedia? portrait, map;
  final List<ArtMedia> sounds, gallery;
  const Species({
    required this.id,
    required this.scientificName,
    required this.commonName,
    required this.taxonomy,
    required this.sections,
    this.websiteUrl,
    this.portrait,
    this.map,
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
      websiteUrl: value['websiteUrl'] == null
          ? null
          : httpsUri(value['websiteUrl'], 'Website'),
      portrait: media['portrait'] == null
          ? null
          : ArtMedia.fromJson(object(media['portrait'], 'Artbild')),
      map: media['map'] == null
          ? null
          : ArtMedia.fromJson(object(media['map'], 'Karte')),
      sounds: List.unmodifiable(sounds),
      gallery: List.unmodifiable(indexed.map((entry) => entry.$2)),
    );
  }
  String get displayName => commonName.isEmpty ? scientificName : commonName;
  Iterable<MediaReference> get media sync* {
    if (portrait != null) {
      yield MediaReference(id, MediaKind.portrait, portrait!);
    }
    if (map != null) yield MediaReference(id, MediaKind.map, map!);
    for (final entry in sounds) {
      yield MediaReference(id, MediaKind.sound, entry);
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
    if (websiteUrl != null) 'websiteUrl': websiteUrl.toString(),
    'media': {
      if (portrait != null) 'portrait': portrait!.toJson(),
      if (map != null) 'map': map!.toJson(),
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
