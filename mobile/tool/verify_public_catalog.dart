import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'package:arten_explorer/domain/catalog.dart';

void main() {
  final mobile = File.fromUri(Platform.script).parent.parent;
  final bytes = File('${mobile.path}/assets/catalog.json').readAsBytesSync();
  final manifest = jsonDecode(
    File('${mobile.path}/assets/catalog-manifest.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  if (crypto.sha256.convert(bytes).toString() != manifest['catalogSha256'] ||
      bytes.length != manifest['catalogBytes']) {
    throw StateError('Öffentlicher Anfangskatalog ist nicht gebunden.');
  }
  final catalog = Catalog.fromJson(
    jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>,
  );
  if (catalog.species.length != manifest['speciesCount'] ||
      catalog.revision != manifest['revision']) {
    throw StateError('Katalogbindung stimmt nicht.');
  }
  final gallery = catalog.species.fold<int>(
    0,
    (sum, entry) => sum + entry.gallery.length,
  );
  if (gallery != manifest['galleryReferenceCount'] ||
      manifest['bundledMediaFiles'] != 0) {
    throw StateError('Medienbindung stimmt nicht.');
  }
  stdout.writeln(
    jsonEncode({
      'passed': true,
      'species': catalog.species.length,
      'galleryReferences': gallery,
      'sections': catalog.species.fold<int>(
        0,
        (sum, entry) => sum + entry.sections.length,
      ),
      'bundledMediaFiles': 0,
      'sha256': manifest['catalogSha256'],
      'method': 'Reiner Dart-Katalogleser ohne Flutter-, SDK-, Geräte- oder NAS-Aufruf',
    }),
  );
}
