import '../domain/catalog.dart';
import 'project_api.dart';
import 'website_photo.dart';

class OfflineEstimate {
  final int knownBytes, unknownFiles;
  const OfflineEstimate(this.knownBytes, this.unknownFiles);
  static OfflineEstimate selection(
    Catalog catalog,
    OfflineSelection selection,
    Map<String, int> photoSizes, {
    Set<String> alreadyAvailable = const {},
  }) {
    var bytes = 0, unknown = 0;
    for (final reference in selection.select(catalog)) {
      if (alreadyAvailable.contains(reference.key)) continue;
      final length = WebsitePhotoPolicy.canObserve(reference)
          ? photoSizes[WebsitePhotoPolicy.offlineUrl(reference.media.url!)
                .toString()]
          : reference.media.bytes;
      if (length == null) {
        unknown++;
      } else {
        bytes += length;
      }
    }
    return OfflineEstimate(bytes, unknown);
  }
}

/// Headers only, bounded concurrency, no private credentials and no guessed file sizes.
Future<void> estimateWebsitePhotos(
  Catalog catalog,
  ProjectTransport transport,
  Map<String, int> sizes, {
  required bool Function() cancelled,
  required void Function(int checked, int total) onProgress,
}) async {
  final Object metadata = transport;
  if (metadata is! WebsitePhotoMetadataTransport) return;
  final urls = catalog.species
      .expand((species) => species.media)
      .where(WebsitePhotoPolicy.canObserve)
      .map(
        (entry) => WebsitePhotoPolicy.offlineUrl(entry.media.url!).toString(),
      )
      .toSet()
      .toList();
  var next = 0, checked = 0;
  Future<void> worker() async {
    while (next < urls.length && !cancelled()) {
      final url = urls[next++];
      if (!sizes.containsKey(url)) {
        try {
          final bytes = await metadata.websitePhotoSize(Uri.parse(url));
          if (!cancelled() && bytes != null) sizes[url] = bytes;
        } catch (_) {
          /* A failed HEAD stays explicitly unknown. */
        }
      }
      if (cancelled()) return;
      onProgress(++checked, urls.length);
    }
  }

  await Future.wait(List.generate(4, (_) => worker()));
}
