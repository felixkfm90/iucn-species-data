import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/data/offline_estimate.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';

import 'support.dart';

class _Metadata extends FakeTransport implements WebsitePhotoMetadataTransport {
  final heads = <Uri>[];
  @override
  Future<int?> websitePhotoSize(Uri uri) async {
    heads.add(uri);
    return uri.path.contains('gallery-one') ? 12000 : null;
  }
}

void main() {
  test('Größenvorabprüfung nutzt750w und erfindet bei fehlendem Header keine Bytes', () async {
    final catalog = Catalog.fromJson(observedCatalogFixture());
    final transport = _Metadata(), sizes = <String, int>{};
    await estimateWebsitePhotos(
      catalog,
      transport,
      sizes,
      cancelled: () => false,
      onProgress: (_, _) {},
    );
    expect(transport.heads.length, 2);
    expect(
      transport.heads.every((uri) => uri.queryParameters['format'] == '750w'),
      true,
    );
    final estimate = OfflineEstimate.selection(
      catalog,
      const OfflineSelection(texts: true, gallery: true),
      sizes,
    );
    expect(estimate.knownBytes, 12000);
    expect(estimate.unknownFiles, 1);
    expect(transport.mediaRequests, isEmpty);
    expect(transport.requests, isEmpty);
  });
  test(
    'Abgewählte Websitefotos lösen weder Header- noch Fotoabrufe aus',
    () async {
      final catalog = Catalog.fromJson(observedCatalogFixture());
      final estimate = OfflineEstimate.selection(
        catalog,
        const OfflineSelection.withoutWebsitePhotos(),
        {},
      );
      expect(estimate.unknownFiles, 0);
      expect(estimate.knownBytes, pngBytes.length * 3);
    },
  );
}
