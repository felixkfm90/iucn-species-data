import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';

import '../domain/catalog.dart';

class BundledCatalog {
  final Catalog catalog;
  final String sha256;
  const BundledCatalog(this.catalog, this.sha256);
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
    final catalog = Catalog.fromJson(
      object(jsonDecode(utf8.decode(bytes)), 'Öffentlicher Anfangskatalog'),
    );
    if (catalog.revision != manifest['revision'] ||
        catalog.species.length != manifest['speciesCount']) {
      throw const FormatException(
        'Die Bindung des öffentlichen Anfangsbestands stimmt nicht.',
      );
    }
    return BundledCatalog(catalog, actual);
  }
}
