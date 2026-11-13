import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';

import '../domain/catalog.dart';
import 'website_photo.dart';

class BundledCatalog {
  final Catalog catalog;
  final String sha256;
  final Map<String, int> photoSizes;
  const BundledCatalog(this.catalog, this.sha256, [this.photoSizes = const {}]);
  static Future<BundledCatalog> load({AssetBundle? bundle}) async {
    final source = bundle ?? rootBundle;
    final data = await source.load('assets/catalog.json');
    final bytes = data.buffer.asUint8List(
      data.offsetInBytes,
      data.lengthInBytes,
    );
    final manifest = object(
      jsonDecode(await source.loadString('assets/catalog-manifest.json')),
      'Anfangsbestand',
    );
    return decode(bytes, manifest);
  }

  static BundledCatalog decode(Uint8List bytes, Map<String, dynamic> manifest) {
    final actual = crypto.sha256.convert(bytes).toString();
    if (manifest['schemaVersion'] != 1 ||
        manifest['kind'] != 'bundled-public-catalog' ||
        manifest['catalogSha256'] != actual ||
        manifest['catalogBytes'] != bytes.length ||
        manifest['bundledMediaFiles'] != 0) {
      throw const FormatException(
        'Der mitgelieferte öffentliche Anfangsbestand ist beschädigt oder unvollständig.',
      );
    }
    final data = object(
      jsonDecode(utf8.decode(bytes)),
      'Öffentlicher Anfangskatalog',
    );
    final extra = manifest['spectrograms'];
    if (extra != null) {
      final references = object(extra, 'Spektrogramm-Verweise');
      final seen = <String>{};
      for (final raw in array(data['species'], 'Arten')) {
        final entry = object(raw, 'Art'), id = entry['id'];
        if (!references.containsKey(id)) continue;
        final media = object(entry['media'], 'Medien');
        final sounds = array(media['sounds'], 'Tierstimme');
        if (sounds.isEmpty || id is! String || !seen.add(id)) {
          throw const FormatException('Spektrogramm ohne zugehörige Aufnahme.');
        }
        final sound = object(sounds.first, 'Ton');
        final url = httpsUri(sound['url'], 'Tonadresse');
        final spec = object(references[id], 'Spektrogramm');
        if (url.host != 'felixkfm90.github.io' ||
            url.hasPort ||
            url.hasQuery ||
            url.pathSegments.length != 4 ||
            url.pathSegments[0] != 'iucn-species-data' ||
            url.pathSegments[1] != 'species-assets' ||
            url.pathSegments.last != 'sound.mp3' ||
            spec['soundSha256'] != sound['sha256'] ||
            spec['soundSha256'] is! String ||
            spec['sha256'] is! String ||
            spec['bytes'] is! int ||
            (spec['bytes'] as int) <= 0 ||
            (spec['bytes'] as int) > 512 * 1024) {
          throw const FormatException(
            'Spektrogramm und Aufnahme sind nicht eindeutig zugeordnet.',
          );
        }
        media['spectrogram'] = {
          'id': '$id:spectrogram',
          'url': url
              .replace(
                pathSegments: [...url.pathSegments.take(3), 'spectrogram.webp'],
              )
              .toString(),
          'bytes': spec['bytes'],
          'sha256': spec['sha256'],
          'mimeType': 'image/webp',
          'alt': 'Spektrogramm der Tierstimme',
        };
      }
      if (seen.length != references.length) {
        throw const FormatException('Unbekannter Spektrogramm-Verweis.');
      }
    }
    final catalog = Catalog.fromJson(data);
    if (catalog.revision != manifest['revision'] ||
        catalog.species.length != manifest['speciesCount']) {
      throw const FormatException(
        'Die Bindung des öffentlichen Anfangsbestands stimmt nicht.',
      );
    }
    final photoSizes = <String, int>{};
    if (manifest['photoSizes'] case final raw?) {
      final allowed = {
        for (final species in catalog.species)
          for (final reference in species.media)
            if (WebsitePhotoPolicy.canObserve(reference))
              WebsitePhotoPolicy.offlineUrl(reference.media.url!).toString(),
      };
      for (final entry in object(raw, 'Fotogrößen').entries) {
        final size = entry.value;
        if (!allowed.contains(entry.key) ||
            size is! int ||
            size <= 0 ||
            size > WebsitePhotoPolicy.maximumBytes) {
          throw const FormatException(
            'Fotogröße ohne gültige Downloadfassung.',
          );
        }
        photoSizes[entry.key] = size;
      }
    }
    return BundledCatalog(catalog, actual, Map.unmodifiable(photoSizes));
  }
}
