import '../domain/catalog.dart';

/// Counts describe catalog references; storage bytes count each hash file once.
/// A pending selection is not a claim that files have already been removed.
class OfflineCategoryInventory {
  final int totalFiles, verifiedFiles, missingFiles;
  final int knownBytes, unknownSizeFiles, storedBytes;
  final int resumableFiles, resumableBytes;

  const OfflineCategoryInventory({
    this.totalFiles = 0,
    this.verifiedFiles = 0,
    this.missingFiles = 0,
    this.knownBytes = 0,
    this.unknownSizeFiles = 0,
    this.storedBytes = 0,
    this.resumableFiles = 0,
    this.resumableBytes = 0,
  });
}

class OfflineInventory {
  /// Includes every kind, including categories with no files in this catalog.
  final Map<MediaKind, OfflineCategoryInventory> categories;
  final Set<String> verifiedKeys;
  final Set<String> resumableKeys;

  /// Actual regular files in this store, including manifests, staging and old
  /// completed files. This is separate from estimated/reference content sizes.
  final int appDataBytes, stageBytes;

  /// Globally deduplicated physical bytes in verified committed/resumable files.
  /// A file can serve more than one category, so category sums can be larger.
  final int storedBytes, resumableBytes;

  OfflineInventory({
    required Map<MediaKind, OfflineCategoryInventory> categories,
    Set<String> verifiedKeys = const {},
    Set<String> resumableKeys = const {},
    required this.appDataBytes,
    required this.stageBytes,
    required this.storedBytes,
    required this.resumableBytes,
  }) : verifiedKeys = Set.unmodifiable(verifiedKeys),
       resumableKeys = Set.unmodifiable(resumableKeys),
       categories = Map.unmodifiable({
         for (final kind in MediaKind.values)
           kind: categories[kind] ?? const OfflineCategoryInventory(),
       });

  OfflineCategoryInventory operator [](MediaKind kind) => categories[kind]!;
  int _sum(int Function(OfflineCategoryInventory) value) =>
      categories.values.fold(0, (sum, entry) => sum + value(entry));
  int get totalFiles => _sum((entry) => entry.totalFiles);
  int get verifiedFiles => _sum((entry) => entry.verifiedFiles);
  int get missingFiles => _sum((entry) => entry.missingFiles);
  int get knownBytes => _sum((entry) => entry.knownBytes);
  int get unknownSizeFiles => _sum((entry) => entry.unknownSizeFiles);
  int get resumableFiles => _sum((entry) => entry.resumableFiles);
}
