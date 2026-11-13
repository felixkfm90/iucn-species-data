import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../domain/catalog.dart';
import 'project_api.dart';
import 'website_photo.dart';

/// The public release is independent of both the APK and personal project access.
class PublicCatalogSource {
  static final manifestUrl = Uri.parse(
    'https://felixkfm90.github.io/iucn-species-data/mobile/catalog/manifest.json',
  );
  final ProjectTransport transport;
  const PublicCatalogSource(this.transport);

  Future<PublicCatalogRelease?> loadNewer(Catalog? current) async {
    final manifest = await _readManifest();
    if (manifest == null ||
        current != null && !manifest.generatedAt.isAfter(current.generatedAt)) {
      return null;
    }
    try {
      return await _readRelease(manifest);
    } on ProjectApiException catch (failure) {
      if (failure.status != 404) rethrow;
      // Pages may have replaced the release between the two requests.
      final replacement = await _readManifest();
      if (replacement == null ||
          replacement.sha256 == manifest.sha256 ||
          !replacement.generatedAt.isAfter(manifest.generatedAt)) {
        rethrow;
      }
      return _readRelease(replacement);
    }
  }

  Future<PublicCatalogManifest?> _readManifest() async {
    try {
      final bytes = await _read(manifestUrl, 4096);
      return PublicCatalogManifest.fromJson(
        object(jsonDecode(utf8.decode(bytes)), 'Öffentliche Katalogfreigabe'),
      );
    } on ProjectApiException catch (failure) {
      if (failure.status == 404) return null;
      rethrow;
    }
  }

  Future<PublicCatalogRelease> _readRelease(
    PublicCatalogManifest manifest,
  ) async {
    final url = manifestUrl.resolve('${manifest.sha256}.json');
    return PublicCatalogRelease.decode(
      manifest,
      await _read(url, manifest.bytes),
    );
  }

  Future<Uint8List> _read(Uri url, int maximumBytes) async {
    final bytes = BytesBuilder(copy: false);
    await for (final chunk in transport.media(url)) {
      if (bytes.length + chunk.length > maximumBytes) {
        throw const FormatException(
          'Die öffentliche Katalogdatei ist zu groß.',
        );
      }
      bytes.add(chunk);
    }
    return bytes.takeBytes();
  }
}

class PublicCatalogManifest {
  static const maximumBytes = 16 * 1024 * 1024;
  final String sha256, revision;
  final DateTime generatedAt;
  final int bytes, speciesCount;
  const PublicCatalogManifest._(
    this.sha256,
    this.revision,
    this.generatedAt,
    this.bytes,
    this.speciesCount,
  );

  factory PublicCatalogManifest.fromJson(Map<String, dynamic> json) {
    final sha256 = json['catalogSha256'], revision = json['revision'];
    final generatedAt = json['generatedAt'], bytes = json['catalogBytes'];
    final count = json['speciesCount'];
    final date = generatedAt is String ? DateTime.tryParse(generatedAt) : null;
    if (json.length != 7 ||
        json['schemaVersion'] != 1 ||
        json['kind'] != 'fn-public-catalog' ||
        sha256 is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(sha256) ||
        revision is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(revision) ||
        date == null ||
        !date.isUtc ||
        date.toIso8601String() != generatedAt ||
        bytes is! int ||
        bytes < 1 ||
        bytes > maximumBytes ||
        count is! int ||
        count < 1 ||
        count > 20000) {
      throw const FormatException(
        'Die öffentliche Katalogfassung ist ungültig.',
      );
    }
    return PublicCatalogManifest._(sha256, revision, date, bytes, count);
  }

  Map<String, dynamic> toJson() => {
    'schemaVersion': 1,
    'kind': 'fn-public-catalog',
    'catalogSha256': sha256,
    'catalogBytes': bytes,
    'revision': revision,
    'generatedAt': generatedAt.toIso8601String(),
    'speciesCount': speciesCount,
  };
}

class PublicCatalogRelease {
  static const _maximumMediaBytes = 32 * 1024 * 1024;
  static final _commit = RegExp(r'^[a-f0-9]{40}$');
  static final _unsafeFolder = RegExp(r'[/\\\x00-\x1f\x7f]');
  final PublicCatalogManifest manifest;
  final Catalog catalog;
  final String _source;
  const PublicCatalogRelease._(this.manifest, this.catalog, this._source);

  factory PublicCatalogRelease.decode(
    PublicCatalogManifest manifest,
    Uint8List bytes,
  ) {
    if (bytes.length != manifest.bytes ||
        crypto.sha256.convert(bytes).toString() != manifest.sha256) {
      throw const FormatException(
        'Die Prüfsumme des öffentlichen Katalogs stimmt nicht.',
      );
    }
    final source = utf8.decode(bytes);
    final data = object(jsonDecode(source), 'Öffentlicher Katalog');
    final catalog = Catalog.fromJson(data);
    if (catalog.projectId != null ||
        catalog.revision != manifest.revision ||
        catalog.generatedAt != manifest.generatedAt ||
        catalog.species.length != manifest.speciesCount) {
      throw const FormatException(
        'Die öffentliche Katalogfassung passt nicht zur Freigabe.',
      );
    }
    for (final species in catalog.species) {
      final site = species.websiteUrl;
      if (site == null ||
          site.origin != 'https://www.fnwildlifetravel.de' ||
          site.hasQuery ||
          !site.path.startsWith('/wildlife/') ||
          site.pathSegments.last != species.id) {
        throw const FormatException(
          'Eine Art hat keine passende öffentliche FN-Seite.',
        );
      }
      for (final reference in species.media) {
        final media = reference.media;
        final url = media.url;
        if (url == null || media.projectFile != null) {
          throw const FormatException(
            'Private Medien gehören nicht in den öffentlichen Katalog.',
          );
        }
        if (reference.kind == MediaKind.gallery) {
          WebsitePhotoPolicy.checkUrl(url);
        } else {
          final name = switch (reference.kind) {
            MediaKind.portrait => 'portrait.webp',
            MediaKind.map => 'map.jpg',
            MediaKind.sound =>
              identical(media, species.spectrogram)
                  ? 'spectrogram.webp'
                  : 'sound.mp3',
            MediaKind.gallery => throw StateError('Galerie bereits geprüft'),
          };
          final size = media.bytes;
          if (!_isPublicMediaUrl(url, name) ||
              media.sha256 == null ||
              size == null ||
              size < 1 ||
              size > _maximumMediaBytes) {
            throw const FormatException(
              'Eine Mediendatei hat keine passende öffentliche FN-Adresse.',
            );
          }
        }
      }
    }
    return PublicCatalogRelease._(manifest, catalog, source);
  }

  static bool _isPublicMediaUrl(Uri url, String filename) {
    if (url.hasQuery || url.hasFragment || url.userInfo.isNotEmpty) {
      return false;
    }
    final parts = url.pathSegments;
    final folderIndex = switch (url.origin) {
      'https://felixkfm90.github.io'
          when parts.length == 4 &&
              parts[0] == 'iucn-species-data' &&
              parts[1] == 'species-assets' =>
        2,
      'https://raw.githubusercontent.com'
          when parts.length == 6 &&
              parts[0] == 'felixkfm90' &&
              parts[1] == 'iucn-species-data' &&
              _commit.hasMatch(parts[2]) &&
              parts[3] == 'species-assets' =>
        4,
      _ => null,
    };
    if (folderIndex == null || parts.last != filename) return false;
    final folder = parts[folderIndex];
    return folder.isNotEmpty &&
        folder != '.' &&
        folder != '..' &&
        !_unsafeFolder.hasMatch(folder);
  }

  factory PublicCatalogRelease.fromCache(Map<String, dynamic> json) =>
      PublicCatalogRelease.decode(
        PublicCatalogManifest.fromJson(
          object(json['manifest'], 'Katalogfreigabe'),
        ),
        Uint8List.fromList(
          utf8.encode(
            requiredText(
              json['catalog'],
              'Katalogdaten',
              maximum: PublicCatalogManifest.maximumBytes,
            ),
          ),
        ),
      );

  Map<String, dynamic> toCache() => {
    'manifest': manifest.toJson(),
    'catalog': _source,
  };
}
