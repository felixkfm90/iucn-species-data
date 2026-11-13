import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../domain/catalog.dart';
import '../domain/project_media.dart';
import 'offline_inventory.dart';
import 'project_api.dart';
import 'public_catalog.dart';
import 'website_photo.dart';
import 'offline_writer.dart';

export 'offline_inventory.dart';

class OfflineProgress {
  final int completeFiles, totalFiles, receivedBytes;
  final int? totalBytes;
  final String message;
  const OfflineProgress(
    this.completeFiles,
    this.totalFiles,
    this.receivedBytes,
    this.totalBytes,
    this.message,
  );
}

class OfflineSnapshot {
  final Catalog catalog;
  final OfflineSelection selection;
  final Map<String, File> verifiedFiles;
  final List<String> missingFiles;
  final Map<String, OfflineFileBinding> bindings;
  const OfflineSnapshot(
    this.catalog,
    this.selection,
    this.verifiedFiles,
    this.missingFiles, [
    this.bindings = const {},
  ]);
  bool get healthy => missingFiles.isEmpty;
  int get observedPhotoCount =>
      bindings.values.where((entry) => entry.observedWebsite).length;
}

class OfflineFileBinding {
  final String key, sourceUrl, sha256, extension, provenance;
  final String? downloadUrl;
  final int bytes;
  final String? mimeType;
  final DateTime? observedAt;
  final int? width, height;
  const OfflineFileBinding({
    required this.key,
    required this.sourceUrl,
    required this.sha256,
    required this.bytes,
    required this.extension,
    required this.provenance,
    this.mimeType,
    this.observedAt,
    this.width,
    this.height,
    this.downloadUrl,
  });
  bool get observedWebsite => provenance == 'observed-public-website';
  String get filename => '$sha256$extension';
  bool matches(MediaReference reference) =>
      key == reference.key &&
      (observedWebsite
          ? WebsitePhotoPolicy.canObserve(reference) &&
                sourceUrl == reference.media.sourceIdentity &&
                (downloadUrl == null ||
                    downloadUrl ==
                        WebsitePhotoPolicy.offlineUrl(reference.media.url!)
                            .toString())
          : (reference.media.projectFile == null ||
                    sourceUrl == reference.media.sourceIdentity) &&
                reference.media.sha256 == sha256 &&
                reference.media.extension == extension &&
                (reference.media.bytes == null ||
                    reference.media.bytes == bytes));
  Map<String, dynamic> toJson() => {
    'sourceUrl': sourceUrl,
    'sha256': sha256,
    'bytes': bytes,
    'extension': extension,
    'provenance': provenance,
    if (mimeType != null) 'mimeType': mimeType,
    if (downloadUrl != null) 'downloadUrl': downloadUrl,
    if (observedAt != null) 'observedAt': observedAt!.toUtc().toIso8601String(),
    if (width != null) 'width': width,
    if (height != null) 'height': height,
  };
  factory OfflineFileBinding.fromJson(
    MediaReference reference,
    Map<String, dynamic> value,
  ) {
    if (value.keys.any(
          (key) => !{
            'sourceUrl',
            'sha256',
            'bytes',
            'extension',
            'provenance',
            'mimeType',
            'observedAt',
            'width',
            'height',
            'downloadUrl',
          }.contains(key),
        ) ||
        value['sourceUrl'] != reference.media.sourceIdentity ||
        value['sha256'] is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(value['sha256'] as String) ||
        value['bytes'] is! int ||
        (value['bytes'] as int) <= 0 ||
        (value['bytes'] as int) > 512 * 1024 * 1024 ||
        value['mimeType'] != null && value['mimeType'] is! String ||
        value['downloadUrl'] != null && value['downloadUrl'] is! String) {
      throw const FormatException('Ungültige Dateibindung im Offlinepaket.');
    }
    final observed = value['provenance'] == 'observed-public-website';
    DateTime? observedAt;
    if (observed) {
      final type = WebsitePhotoPolicy.checkMime(value['mimeType'] as String?);
      observedAt = DateTime.tryParse(
        value['observedAt'] is String ? value['observedAt'] as String : '',
      );
      if (!WebsitePhotoPolicy.canObserve(reference) ||
          value['bytes'] > WebsitePhotoPolicy.maximumBytes ||
          value['extension'] != WebsitePhotoPolicy.mimeExtensions[type] ||
          observedAt == null ||
          value['width'] is! int ||
          value['height'] is! int ||
          value['downloadUrl'] != null &&
              value['downloadUrl'] !=
                  WebsitePhotoPolicy.offlineUrl(reference.media.url!)
                      .toString()) {
        throw const FormatException(
          'Die beobachtete Websitefassung ist nicht an dieses Galeriefoto gebunden.',
        );
      }
      WebsitePhotoPolicy.checkDimensions(
        value['width'] as int,
        value['height'] as int,
      );
    } else if (value['provenance'] != 'catalog-sha256' ||
        reference.media.sha256 != value['sha256'] ||
        reference.media.extension != value['extension'] ||
        reference.media.bytes != null &&
            reference.media.bytes != value['bytes'] ||
        value['observedAt'] != null ||
        value['width'] != null ||
        value['height'] != null ||
        value['downloadUrl'] != null) {
      throw const FormatException(
        'Die Dateibindung stimmt nicht mit der Katalogprüfsumme überein.',
      );
    }
    return OfflineFileBinding(
      key: reference.key,
      sourceUrl: value['sourceUrl'] as String,
      sha256: value['sha256'] as String,
      bytes: value['bytes'] as int,
      extension: value['extension'] as String,
      provenance: value['provenance'] as String,
      mimeType: value['mimeType'] as String?,
      observedAt: observedAt,
      width: value['width'] as int?,
      height: value['height'] as int?,
      downloadUrl: value['downloadUrl'] as String?,
    );
  }
}

class DownloadCancelled implements Exception {
  const DownloadCancelled();
  @override
  String toString() =>
      'Download abgebrochen. Der vorherige Offlinebestand bleibt erhalten.';
}

class _ResumeJournal {
  final Catalog catalog;
  final OfflineSelection selection;
  final String jobId, catalogHash, intentKey;
  final List<Map<String, dynamic>> references;
  final Map<String, OfflineFileBinding> files;

  _ResumeJournal(this.catalog, this.selection, this.jobId, this.files)
    : catalogHash = _hash(catalog.encode()),
      references = _references(catalog, selection),
      intentKey = _intent(catalog, selection);

  static String _hash(String value) =>
      crypto.sha256.convert(utf8.encode(value)).toString();
  static List<Map<String, dynamic>> _references(
    Catalog catalog,
    OfflineSelection selection,
  ) => [
    for (final reference in selection.select(catalog))
      {'key': reference.key, 'media': reference.media.toJson()},
  ];
  static String _intent(Catalog catalog, OfflineSelection selection) => _hash(
    jsonEncode({
      'catalogHash': _hash(catalog.encode()),
      'catalogRevision': catalog.revision,
      'selection': selection.toJson(),
      'photoProfile': WebsitePhotoPolicy.offlineProfile,
      'references': _references(catalog, selection),
    }),
  );

  Map<String, dynamic> toJson() => {
    'schemaVersion': 1,
    'jobId': jobId,
    'catalog': catalog.toJson(),
    'catalogRevision': catalog.revision,
    'catalogHash': catalogHash,
    'intentKey': intentKey,
    'selection': selection.toJson(),
    'photoProfile': WebsitePhotoPolicy.offlineProfile,
    'references': references,
    'files': {
      for (final entry in files.entries) entry.key: entry.value.toJson(),
    },
  };
}

class OfflineStore {
  final Directory root;
  final ProjectTransport transport;
  final String? projectId;
  final Future<RasterPhoto> Function(Uint8List, String) photoValidator;
  bool _busy = false;
  static final _writers = <String>{};
  OfflineStore(
    this.root,
    this.transport, {
    this.projectId,
    this.photoValidator = validateWebsiteRaster,
  });

  Catalog _checkCatalog(Catalog catalog) {
    if (catalog.projectId != null && catalog.projectId != projectId) {
      throw const FormatException(
        'Der Offlinekatalog gehört zu einem anderen Projekt.',
      );
    }
    return catalog;
  }

  static String projectKey(
    Uri server,
    String userId, {
    required String projectId,
  }) => crypto.sha256
      .convert(
        utf8.encode(
          '${normalizeServer(server.toString()).origin}|$projectId|$userId',
        ),
      )
      .toString();
  File _file(String name) => File('${root.path}/$name');
  Directory get _mediaDir => Directory('${root.path}/media');
  String _filename(ArtMedia media) => '${media.sha256}${media.extension}';
  File mediaFile(ArtMedia media) =>
      File('${_mediaDir.path}/${_filename(media)}');
  File _bindingFile(OfflineFileBinding binding) =>
      File('${_mediaDir.path}/${binding.filename}');
  String _nonce() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';

  /// The native runner and the foreground app must not commit competing jobs.
  /// Keep the lock file: unlinking it would let a second process lock a new inode.
  Future<T> _exclusive<T>(Future<T> Function() operation) async {
    final key = Platform.isWindows
        ? root.absolute.path.toLowerCase()
        : root.absolute.path;
    if (_busy || !_writers.add(key)) {
      throw StateError('Ein Offlinepaket wird bereits geladen.');
    }
    _busy = true;
    RandomAccessFile? lock;
    final OfflineWriter? nativeWriter = Platform.isAndroid
        ? const AndroidOfflineWriter()
        : null;
    String? nativeLease;
    var locked = false;
    try {
      await root.create(recursive: true);
      if (nativeWriter != null) {
        final canonical = await root.resolveSymbolicLinks();
        nativeLease = await nativeWriter.acquire(
          crypto.sha256.convert(utf8.encode(canonical)).toString(),
        );
      }
      final lockFile = _file('offline-writer.lock');
      final type = await FileSystemEntity.type(
        lockFile.path,
        followLinks: false,
      );
      if (type != FileSystemEntityType.notFound &&
          type != FileSystemEntityType.file) {
        throw const FormatException(
          'Die Downloadsperre ist keine reguläre Datei.',
        );
      }
      lock = await lockFile.open(mode: FileMode.append);
      try {
        await lock.lock(FileLock.exclusive);
        locked = true;
      } on FileSystemException {
        throw StateError(
          'Ein anderer Offlineauftrag verwendet diesen Speicher.',
        );
      }
      return await operation();
    } finally {
      try {
        if (locked) await lock!.unlock();
      } finally {
        try {
          await lock?.close();
        } finally {
          try {
            if (nativeLease != null) await nativeWriter!.release(nativeLease);
          } finally {
            _writers.remove(key);
            _busy = false;
          }
        }
      }
    }
  }

  Future<_ResumeJournal?> _readResume(
    Catalog catalog, [
    OfflineSelection? selection,
  ]) async {
    final file = _file('resume.json');
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
        FileSystemEntityType.file) {
      return null;
    }
    try {
      final value = object(
        jsonDecode(await file.readAsString()),
        'Downloadfortsetzung',
      );
      if (value.keys.any(
            (key) => !{
              'schemaVersion',
              'jobId',
              'catalog',
              'catalogRevision',
              'catalogHash',
              'intentKey',
              'selection',
              'photoProfile',
              'references',
              'files',
            }.contains(key),
          ) ||
          value['schemaVersion'] != 1 ||
          value['photoProfile'] != WebsitePhotoPolicy.offlineProfile ||
          value['catalogRevision'] != catalog.revision ||
          value['jobId'] is! String ||
          !RegExp(r'^[0-9]{10,20}-[0-9]{1,10}$')
              .hasMatch(value['jobId'] as String)) {
        return null;
      }
      final savedCatalog = Catalog.fromJson(
        object(value['catalog'], 'Fortsetzungskatalog'),
      );
      if (savedCatalog.encode() != catalog.encode()) return null;
      final chosen = object(value['selection'], 'Fortsetzungsauswahl');
      const choices = {'texts', 'portraits', 'maps', 'sounds', 'gallery'};
      if (chosen.length != choices.length ||
          chosen.keys.any((key) => !choices.contains(key)) ||
          chosen.values.any((value) => value is! bool)) {
        return null;
      }
      final savedSelection = OfflineSelection.fromJson(chosen);
      if (selection != null &&
          jsonEncode(savedSelection.toJson()) !=
              jsonEncode(selection.toJson())) {
        return null;
      }
      final result = _ResumeJournal(
        catalog,
        savedSelection,
        value['jobId'] as String,
        {},
      );
      if (value['catalogHash'] != result.catalogHash ||
          value['intentKey'] != result.intentKey ||
          jsonEncode(value['references']) != jsonEncode(result.references)) {
        return null;
      }
      final selected = {
        for (final reference in savedSelection.select(catalog))
          reference.key: reference,
      };
      final files = object(value['files'], 'Fortsetzungsdateien');
      if (files.length > selected.length ||
          files.keys.any((key) => !selected.containsKey(key))) {
        return null;
      }
      for (final entry in files.entries) {
        final binding = OfflineFileBinding.fromJson(
          selected[entry.key]!,
          object(entry.value, 'Fortsetzungsdatei'),
        );
        if (binding.observedWebsite && binding.downloadUrl == null) return null;
        result.files[entry.key] = binding;
      }
      // A crash between commit and journal removal does not leave a pending job.
      // Subsequent jobs can reuse the committed package after checking its bytes.
      final package = _file('package.json');
      if (await FileSystemEntity.type(package.path, followLinks: false) ==
          FileSystemEntityType.file) {
        final committed = object(
          jsonDecode(await package.readAsString()),
          'Offlinepaket',
        );
        if (committed['downloadJobId'] == result.jobId) return null;
      }
      return result;
    } on FormatException {
      // A malformed or differently bound ledger never grants a cache hit.
      return null;
    }
  }

  Future<void> _saveResume(_ResumeJournal journal) =>
      _atomicJson('resume.json', journal.toJson());

  Future<void> _clearIncompleteFiles() async {
    if (!await root.exists()) return;
    await for (final entry in root.list(followLinks: false)) {
      final name = entry.uri.pathSegments.last;
      if (entry is File &&
          RegExp(
            r'^(?:download-|(?:resume|package)\.json\.)[0-9]{10,20}-[0-9]{1,10}\.partial$',
          ).hasMatch(name)) {
        await entry.delete();
      }
    }
  }

  Future<void> _atomicJson(
    String name,
    Map<String, dynamic> value, {
    Future<void> Function()? beforeCommit,
  }) async {
    await root.create(recursive: true);
    final temporary = _file('$name.${_nonce()}.partial');
    try {
      await temporary.writeAsString(jsonEncode(value), flush: true);
      await beforeCommit?.call();
      await temporary.rename(_file(name).path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }

  Future<void> saveIndex(Catalog catalog) => _atomicJson(
    'index.json',
    _checkCatalog(catalog).toJson(includeDetails: false),
  );
  Future<Catalog?> readIndex() async {
    if (!await _file('index.json').exists()) return null;
    return _checkCatalog(
      Catalog.fromJson(
        object(
          jsonDecode(await _file('index.json').readAsString()),
          'Artübersicht',
        ),
      ),
    );
  }

  Future<PublicCatalogRelease?> readPublicRelease() async {
    if (projectId != null) throw StateError('Der Speicher ist an ein Projekt gebunden.');
    final file = _file('public-release.json');
    if (!await file.exists()) return null;
    if (await file.length() > 2 * PublicCatalogManifest.maximumBytes) {
      throw const FormatException('Die gespeicherte öffentliche Katalogfassung ist zu groß.');
    }
    return PublicCatalogRelease.fromCache(object(jsonDecode(await file.readAsString()), 'Öffentliche Katalogfassung'));
  }

  Future<void> savePublicRelease(PublicCatalogRelease release) {
    if (projectId != null) throw StateError('Der Speicher ist an ein Projekt gebunden.');
    return _atomicJson('public-release.json', release.toCache());
  }

  Future<bool> _matches(ArtMedia media) async {
    if (media.sha256 == null) return false;
    final file = mediaFile(media);
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
        FileSystemEntityType.file) {
      return false;
    }
    if (media.bytes != null && await file.length() != media.bytes) return false;
    return (await crypto.sha256.bind(file.openRead()).first).toString() ==
        media.sha256;
  }

  Future<bool> _matchesBinding(OfflineFileBinding binding) async {
    final file = _bindingFile(binding);
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
            FileSystemEntityType.file ||
        await file.length() != binding.bytes) {
      return false;
    }
    return (await crypto.sha256.bind(file.openRead()).first).toString() ==
        binding.sha256;
  }

  /// Recheck the actual bytes immediately before display, not only at package reopening.
  Future<Uint8List> verifiedImage(
    OfflineSnapshot snapshot,
    MediaReference reference,
  ) async {
    final binding = snapshot.bindings[reference.key];
    if (binding == null ||
        !binding.matches(reference) ||
        binding.bytes > WebsitePhotoPolicy.maximumBytes ||
        !await _matchesBinding(binding)) {
      throw const FormatException(
        'Die gespeicherte Bildfassung fehlt oder wurde verändert. Offlinepaket erneut laden.',
      );
    }
    final bytes = await _bindingFile(binding).readAsBytes();
    if (bytes.length != binding.bytes ||
        crypto.sha256.convert(bytes).toString() != binding.sha256) {
      throw const FormatException(
        'Das gespeicherte Bild wurde während des Lesens verändert.',
      );
    }
    return bytes;
  }

  Future<OfflineSnapshot?> readPackage() async {
    final file = _file('package.json');
    if (!await file.exists()) return null;
    final value = object(jsonDecode(await file.readAsString()), 'Offlinepaket');
    if (value['schemaVersion'] != 1 &&
        value['schemaVersion'] != 2 &&
        value['schemaVersion'] != 3) {
      throw const FormatException('Unbekannte Offlinepaketversion.');
    }
    final currentProfile = value['schemaVersion'] == 3;
    if (currentProfile &&
        (value['photoProfile'] != WebsitePhotoPolicy.offlineProfile ||
            value['downloadJobId'] is! String ||
            !RegExp(r'^[0-9]{10,20}-[0-9]{1,10}$')
                .hasMatch(value['downloadJobId'] as String))) {
      throw const FormatException(
        'Das Offlinepaket hat kein bekanntes Smartphone-Fotoprofil.',
      );
    }
    final catalog = _checkCatalog(
      Catalog.fromJson(object(value['catalog'], 'Offlinekatalog')),
    );
    final selection = OfflineSelection.fromJson(
      object(value['selection'], 'Offlineauswahl'),
    );
    final verified = <String, File>{}, missing = <String>[];
    final bindings = <String, OfflineFileBinding>{};
    final fileBindings = value['schemaVersion'] != 1
        ? object(value['files'], 'Offline-Dateibindungen')
        : null;
    final selected = selection.select(catalog);
    final selectedKeys = selected.map((entry) => entry.key).toSet();
    if (fileBindings != null &&
        (fileBindings.length != selected.length ||
            fileBindings.keys.any((key) => !selectedKeys.contains(key)))) {
      throw const FormatException(
        'Die Dateibindungen stimmen nicht mit der Offlineauswahl überein.',
      );
    }
    for (final reference in selected) {
      OfflineFileBinding? binding;
      if (fileBindings != null) {
        binding = OfflineFileBinding.fromJson(
          reference,
          object(fileBindings[reference.key], 'Offline-Datei'),
        );
        if (binding.observedWebsite &&
            (currentProfile != (binding.downloadUrl != null))) {
          throw const FormatException(
            'Fotoprofil und gespeicherte Downloadfassung stimmen nicht überein.',
          );
        }
      } else if (reference.media.sha256 != null &&
          await _matches(reference.media)) {
        binding = OfflineFileBinding(
          key: reference.key,
          sourceUrl: reference.media.sourceIdentity,
          sha256: reference.media.sha256!,
          bytes: await mediaFile(reference.media).length(),
          extension: reference.media.extension,
          provenance: 'catalog-sha256',
          mimeType: reference.media.mimeType,
        );
      }
      if (binding != null) bindings[reference.key] = binding;
      if (binding != null && await _matchesBinding(binding)) {
        verified[reference.key] = _bindingFile(binding);
      } else {
        missing.add(reference.key);
      }
    }
    return OfflineSnapshot(
      catalog,
      selection,
      Map.unmodifiable(verified),
      List.unmodifiable(missing),
      Map.unmodifiable(bindings),
    );
  }

  /// Advance the package's text snapshot when all selected media
  /// still match. The original download receipts, selection and files survive.
  Future<OfflineSnapshot?> updateCatalogWithoutDownload(Catalog catalog) =>
      _exclusive(() async {
        _checkCatalog(catalog);
        final before = await readPackage();
        if (before == null ||
            !before.healthy ||
            before.catalog.encode() ==
                catalog.encode(includeDetails: before.selection.texts) ||
            jsonEncode(
                  _ResumeJournal._references(before.catalog, before.selection),
                ) !=
                jsonEncode(
                  _ResumeJournal._references(catalog, before.selection),
                )) {
          return before;
        }
        final manifest = object(
          jsonDecode(await _file('package.json').readAsString()),
          'Offlinepaket',
        );
        manifest['catalog'] = catalog.toJson(
          includeDetails: before.selection.texts,
        );
        await _atomicJson('package.json', manifest);
        return await readPackage();
      });

  Future<int> occupiedBytes() async {
    var total = 0;
    if (!await root.exists()) return total;
    await for (final entry in root.list(recursive: true, followLinks: false)) {
      if (entry is File) {
        try {
          total += await entry.length();
        } on FileSystemException {
          if (await entry.exists()) rethrow;
        }
      }
    }
    return total;
  }

  Future<OfflineInventory> inventory(Catalog catalog) async {
    _checkCatalog(catalog);
    final snapshot = await readPackage();
    final journal = await _readResume(catalog);
    final staged = <String, OfflineFileBinding>{};
    if (journal != null) {
      for (final entry in journal.files.entries) {
        if (await _matchesBinding(entry.value)) staged[entry.key] = entry.value;
      }
    }
    final categories = <MediaKind, OfflineCategoryInventory>{};
    final allStored = <String, int>{}, allResumable = <String, int>{};
    final verifiedKeys = <String>{}, resumableKeys = <String>{};
    for (final kind in MediaKind.values) {
      final references = catalog.species
          .expand((entry) => entry.media)
          .where((entry) => entry.kind == kind);
      var total = 0, verified = 0, known = 0, unknown = 0, resumable = 0;
      final storedFiles = <String, int>{}, resumableFiles = <String, int>{};
      for (final reference in references) {
        total++;
        final candidate = snapshot?.bindings[reference.key];
        final stored =
            candidate != null &&
                candidate.matches(reference) &&
                snapshot!.verifiedFiles.containsKey(reference.key)
            ? candidate
            : null;
        final partial = staged[reference.key];
        if (stored != null) {
          verified++;
          if (!WebsitePhotoPolicy.canObserve(reference) ||
              stored.observedWebsite && stored.downloadUrl != null) {
            verifiedKeys.add(reference.key);
          }
          storedFiles[stored.filename] = stored.bytes;
          allStored[stored.filename] = stored.bytes;
        }
        if (partial != null && !verifiedKeys.contains(reference.key)) {
          resumable++;
          resumableKeys.add(reference.key);
          resumableFiles[partial.filename] = partial.bytes;
          allResumable[partial.filename] = partial.bytes;
        }
        // A source1500w size is not an estimate of its derived750w download.
        final derived =
            WebsitePhotoPolicy.canObserve(reference) &&
            WebsitePhotoPolicy.offlineUrl(reference.media.url!) !=
                reference.media.url;
        final bytes =
            stored?.bytes ??
            partial?.bytes ??
            (derived ? null : reference.media.bytes);
        if (bytes == null) {
          unknown++;
        } else {
          known += bytes;
        }
      }
      categories[kind] = OfflineCategoryInventory(
        totalFiles: total,
        verifiedFiles: verified,
        missingFiles: total - verified,
        knownBytes: known,
        unknownSizeFiles: unknown,
        storedBytes: storedFiles.values.fold(0, (sum, bytes) => sum + bytes),
        resumableFiles: resumable,
        resumableBytes: resumableFiles.values.fold(
          0,
          (sum, bytes) => sum + bytes,
        ),
      );
    }
    var stageBytes = 0;
    if (await root.exists()) {
      await for (final entry in root.list(
        recursive: true,
        followLinks: false,
      )) {
        if (entry is File && entry.path.endsWith('.partial')) {
          try {
            stageBytes += await entry.length();
          } on FileSystemException {
            if (await entry.exists()) rethrow;
          }
        }
      }
    }
    return OfflineInventory(
      categories: categories,
      verifiedKeys: verifiedKeys,
      resumableKeys: resumableKeys,
      appDataBytes: await occupiedBytes(),
      stageBytes: stageBytes,
      storedBytes: allStored.values.fold(0, (sum, bytes) => sum + bytes),
      resumableBytes: allResumable.values.fold(0, (sum, bytes) => sum + bytes),
    );
  }

  Future<OfflineSnapshot> download(
    Catalog catalog,
    OfflineSelection selection, {
    required void Function(OfflineProgress) onProgress,
    required bool Function() cancelled,
    Stream<List<int>> Function(ProjectMediaFile)? projectMedia,
    Future<void> Function()? beforeCommit,
  }) async {
    _checkCatalog(catalog);
    final assets = selection.select(catalog);
    final withoutHash = assets
        .where(
          (entry) =>
              entry.media.sha256 == null &&
              !WebsitePhotoPolicy.canObserve(entry),
        )
        .toList();
    if (withoutHash.isNotEmpty) {
      throw FormatException(
        'Für ${withoutHash.length} ausgewählte Dateien fehlt eine Katalogprüfsumme oder eine bekannte öffentliche Galeriequelle. Diese Auswahl kann nicht offline geladen werden.',
      );
    }
    return _exclusive(() async {
      var completed = 0, received = 0;
      onProgress(
        const OfflineProgress(
          0,
          0,
          0,
          null,
          'Vorhandene Dateien werden geprüft …',
        ),
      );
      await _mediaDir.create(recursive: true);
      final journal =
          await _readResume(catalog, selection) ??
          _ResumeJournal(catalog, selection, _nonce(), {});
      for (final entry in journal.files.entries.toList()) {
        if (cancelled()) throw const DownloadCancelled();
        if (!await _matchesBinding(entry.value)) {
          journal.files.remove(entry.key);
        }
      }
      final bindings = Map<String, OfflineFileBinding>.of(journal.files);
      OfflineFileBinding hashedBinding(MediaReference reference, int bytes) =>
          OfflineFileBinding(
            key: reference.key,
            sourceUrl: reference.media.sourceIdentity,
            sha256: reference.media.sha256!,
            bytes: bytes,
            extension: reference.media.extension,
            provenance: 'catalog-sha256',
            mimeType: reference.media.mimeType,
          );
      OfflineSnapshot? previous;
      try {
        previous = await readPackage();
      } on FormatException {
        // A malformed manifest cannot authorize reuse of an observed photo.
        // Catalog-hashed files can still be independently verified below.
      }
      final pending = <MediaReference>[];
      for (final reference in assets) {
        if (cancelled()) throw const DownloadCancelled();
        if (bindings.containsKey(reference.key)) continue;
        final media = reference.media;
        final saved = previous?.bindings[reference.key];
        if (saved != null &&
            saved.sourceUrl == media.sourceIdentity &&
            saved.matches(reference) &&
            previous!.verifiedFiles.containsKey(reference.key) &&
            (!WebsitePhotoPolicy.canObserve(reference) ||
                saved.observedWebsite && saved.downloadUrl != null)) {
          bindings[reference.key] = saved;
        } else if (!WebsitePhotoPolicy.canObserve(reference) &&
            await _matches(media)) {
          bindings[reference.key] = hashedBinding(
            reference,
            await mediaFile(media).length(),
          );
        } else {
          pending.add(reference);
        }
      }
      final totalBytes =
          pending.every(
            (entry) =>
                entry.media.bytes != null &&
                (!WebsitePhotoPolicy.canObserve(entry) ||
                    WebsitePhotoPolicy.offlineUrl(entry.media.url!) ==
                        entry.media.url),
          )
          ? pending.fold<int>(0, (sum, entry) => sum + entry.media.bytes!)
          : null;
      await _clearIncompleteFiles();
      await _saveResume(journal);
      void report(String message) => onProgress(
        OfflineProgress(
          completed,
          pending.length,
          received,
          totalBytes,
          message,
        ),
      );
      report(
        pending.isEmpty
            ? 'Offlineauswahl wird geprüft …'
            : 'Fehlende Dateien werden geladen …',
      );
      final downloadedHashes = <String>{};
      for (final reference in pending) {
        if (cancelled()) throw const DownloadCancelled();
        final media = reference.media;
        if (WebsitePhotoPolicy.canObserve(reference)) {
          final binding = await _downloadWebsitePhoto(
            reference,
            cancelled: cancelled,
            onBytes: (count) {
              received += count;
              report('Öffentliche Websitefassung wird geladen');
            },
          );
          bindings[reference.key] = binding;
          journal.files[reference.key] = binding;
          await _saveResume(journal);
          completed++;
          report('Websitefassung gespeichert und lokal geprüft');
          continue;
        }
        final physicalName = '${media.sha256}${media.extension}';
        if (downloadedHashes.contains(physicalName) && await _matches(media)) {
          bindings[reference.key] = hashedBinding(
            reference,
            await mediaFile(media).length(),
          );
          completed++;
          report('Geprüfte Datei wiederverwendet');
          continue;
        }
        final partial = _file('download-${_nonce()}.partial');
        IOSink? sink;
        try {
          sink = partial.openWrite();
          var fileBytes = 0;
          final file = media.projectFile;
          if (file != null && projectMedia == null) {
            throw const FormatException(
              'Bitte für den Projektmedien-Download erneut anmelden.',
            );
          }
          final stream = file == null
              ? transport.media(media.url!)
              : projectMedia!(file);
          await for (final chunk in stream) {
            if (cancelled()) throw const DownloadCancelled();
            fileBytes += chunk.length;
            if (fileBytes > 512 * 1024 * 1024 ||
                (media.bytes != null && fileBytes > media.bytes!)) {
              throw const FormatException(
                'Die Mediendatei überschreitet ihre erlaubte Größe.',
              );
            }
            sink.add(chunk);
            received += chunk.length;
            report('Mediendatei wird geladen');
          }
          await sink.flush();
          await sink.close();
          sink = null;
          if (cancelled()) throw const DownloadCancelled();
          if (media.bytes != null && fileBytes != media.bytes) {
            throw const FormatException('Die Mediendatei ist unvollständig.');
          }
          if (fileBytes == 0) {
            throw const FormatException('Die Mediendatei ist leer.');
          }
          final actual = (await crypto.sha256.bind(partial.openRead()).first)
              .toString();
          if (actual != media.sha256) {
            throw const FormatException(
              'Die Prüfsumme stimmt nicht. Der Offlinebestand wurde nicht ersetzt.',
            );
          }
          await partial.rename(mediaFile(media).path);
          final binding = hashedBinding(reference, fileBytes);
          bindings[reference.key] = binding;
          journal.files[reference.key] = binding;
          downloadedHashes.add(physicalName);
          await _saveResume(journal);
          completed++;
          report('Datei geprüft');
        } finally {
          await sink?.close();
          if (await partial.exists()) await partial.delete();
        }
      }
      if (cancelled()) throw const DownloadCancelled();
      for (final binding in bindings.values) {
        if (!await _matchesBinding(binding)) {
          throw const FormatException(
            'Eine neue Paketdatei wurde vor dem Abschluss verändert.',
          );
        }
      }
      // One manifest commit exposes the entire verified selection. Previous package survives any earlier failure.
      await _atomicJson(
        'package.json',
        {
          'schemaVersion': 3,
          'photoProfile': WebsitePhotoPolicy.offlineProfile,
          'downloadJobId': journal.jobId,
          'downloadedAt': DateTime.now().toUtc().toIso8601String(),
          'catalog': catalog.toJson(includeDetails: selection.texts),
          'selection': selection.toJson(),
          'files': {
            for (final entry in bindings.entries)
              entry.key: entry.value.toJson(),
          },
        },
        beforeCommit: () async {
          await beforeCommit?.call();
          if (cancelled()) throw const DownloadCancelled();
        },
      );
      final snapshot = await readPackage();
      if (snapshot == null || !snapshot.healthy) {
        throw const FormatException(
          'Offlineprüfung nach dem Speichern fehlgeschlagen.',
        );
      }
      if (await _file('resume.json').exists()) {
        await _file('resume.json').delete();
      }
      await _removeUnusedFiles(
        bindings.values.map((entry) => entry.filename).toSet(),
      );
      return snapshot;
    });
  }

  Future<OfflineFileBinding> _downloadWebsitePhoto(
    MediaReference reference, {
    required bool Function() cancelled,
    required void Function(int) onBytes,
  }) async {
    final Object downloader = transport;
    if (downloader is! WebsitePhotoTransport) {
      throw const FormatException(
        'Der sichere Download öffentlicher Websitefotos ist nicht verfügbar.',
      );
    }
    final downloadUrl = WebsitePhotoPolicy.offlineUrl(reference.media.url!);
    // Source bytes, when present, belong to the unchanged catalog representation.
    // They must not be applied to a separate, smaller CDN representation.
    final expectedBytes = downloadUrl == reference.media.url
        ? reference.media.bytes
        : null;
    final partial = _file('download-${_nonce()}.partial');
    IOSink? sink;
    WebsitePhotoResponse? response;
    var bodyStarted = false;
    try {
      final received = await downloader.websitePhoto(downloadUrl);
      response = received;
      if (received.sourceUrl != downloadUrl) {
        throw const FormatException(
          'Die Websitefoto-Adresse wurde unerwartet verändert.',
        );
      }
      final mime = WebsitePhotoPolicy.checkMime(received.mimeType);
      if (received.contentLength != null &&
          (received.contentLength! <= 0 ||
              received.contentLength! > WebsitePhotoPolicy.maximumBytes)) {
        throw const FormatException(
          'Die angekündigte Websitefotogröße ist nicht zulässig.',
        );
      }
      if (cancelled()) throw const DownloadCancelled();
      sink = partial.openWrite();
      var fileBytes = 0;
      bodyStarted = true;
      await for (final chunk in received.body) {
        if (cancelled()) throw const DownloadCancelled();
        fileBytes += chunk.length;
        if (fileBytes > WebsitePhotoPolicy.maximumBytes ||
            received.contentLength != null &&
                fileBytes > received.contentLength! ||
            expectedBytes != null && fileBytes > expectedBytes) {
          throw const FormatException(
            'Das Websitefoto überschreitet die erlaubte Dateigröße.',
          );
        }
        sink.add(chunk);
        onBytes(chunk.length);
      }
      await sink.flush();
      await sink.close();
      sink = null;
      if (cancelled()) throw const DownloadCancelled();
      if (fileBytes == 0 ||
          received.contentLength != null &&
              fileBytes != received.contentLength ||
          expectedBytes != null && fileBytes != expectedBytes) {
        throw const FormatException('Das Websitefoto ist unvollständig.');
      }
      final bytes = await partial.readAsBytes();
      if (WebsitePhotoPolicy.signature(bytes) != mime) {
        throw const FormatException(
          'Dateiformat und Websiteantwort stimmen nicht überein.',
        );
      }
      final raster = await photoValidator(bytes, mime);
      WebsitePhotoPolicy.checkDimensions(raster.width, raster.height);
      if (raster.mimeType != mime) {
        throw const FormatException(
          'Die Bildprüfung gehört nicht zur geladenen Websitefassung.',
        );
      }
      if (cancelled()) throw const DownloadCancelled();
      final binding = OfflineFileBinding(
        key: reference.key,
        sourceUrl: reference.media.sourceIdentity,
        sha256: crypto.sha256.convert(bytes).toString(),
        bytes: fileBytes,
        extension: WebsitePhotoPolicy.mimeExtensions[mime]!,
        provenance: 'observed-public-website',
        mimeType: mime,
        observedAt: DateTime.now().toUtc(),
        width: raster.width,
        height: raster.height,
        downloadUrl: downloadUrl.toString(),
      );
      await partial.rename(_bindingFile(binding).path);
      return binding;
    } finally {
      if (response != null && !bodyStarted) {
        await response.body.listen(null).cancel();
      }
      response?.close();
      await sink?.close();
      if (await partial.exists()) await partial.delete();
    }
  }

  Future<void> _removeUnusedFiles(Set<String> keep) async {
    // App-private hash filenames only, no recursive deletion and no user-selected paths.
    if (!await _mediaDir.exists()) return;
    await for (final entry in _mediaDir.list(followLinks: false)) {
      final name = entry.uri.pathSegments.last;
      if (entry is File &&
          RegExp(r'^[a-f0-9]{64}\.(svg|png|jpg|jpeg|webp|mp3|m4a|ogg|wav|bin)$')
              .hasMatch(name) &&
          !keep.contains(name)) {
        await entry.delete();
      }
    }
  }

  Future<OfflineSnapshot> removeCategory(
    MediaKind kind, {
    required OfflineSnapshot expected,
    required Catalog currentCatalog,
  }) => _exclusive(() async {
    final before = await readPackage();
    if (before == null ||
        !before.selection.includes(kind) ||
        before.catalog.encode() != expected.catalog.encode() ||
        jsonEncode(before.selection.toJson()) !=
            jsonEncode(expected.selection.toJson()) ||
        jsonEncode(
              before.bindings.map(
                (key, value) => MapEntry(key, value.toJson()),
              ),
            ) !=
            jsonEncode(
              expected.bindings.map(
                (key, value) => MapEntry(key, value.toJson()),
              ),
            )) {
      throw const FormatException(
        'Die gespeicherte Offlineauswahl hat sich geändert. Bitte prüfe sie erneut.',
      );
    }
    final removedKeys = before.selection
        .select(before.catalog)
        .where((entry) => entry.kind == kind)
        .map((entry) => entry.key)
        .toSet();
    final removedFiles = <String>{}, keptFiles = <String>{};
    for (final binding in before.bindings.values) {
      (removedKeys.contains(binding.key) ? removedFiles : keptFiles).add(
        binding.filename,
      );
    }
    final manifest = object(
      jsonDecode(await _file('package.json').readAsString()),
      'Offlinepaket',
    );
    manifest['selection'] = before.selection.without(kind).toJson();
    final files = manifest['files'];
    if (files is Map<String, dynamic>) {
      files.removeWhere((key, _) => removedKeys.contains(key));
    }
    final resume =
        await _readResume(currentCatalog) ?? await _readResume(before.catalog);
    _ResumeJournal? trimmedResume;
    if (resume != null) {
      final nextSelection = resume.selection.without(kind);
      final nextKeys = nextSelection
          .select(resume.catalog)
          .map((entry) => entry.key)
          .toSet();
      final kept = <String, OfflineFileBinding>{};
      for (final binding in resume.files.values) {
        if (nextKeys.contains(binding.key)) {
          kept[binding.key] = binding;
          keptFiles.add(binding.filename);
        } else {
          removedFiles.add(binding.filename);
        }
      }
      if (resume.selection.includes(kind)) {
        trimmedResume = _ResumeJournal(
          resume.catalog,
          nextSelection,
          resume.jobId,
          kept,
        );
      }
    }
    await _atomicJson('package.json', manifest);
    if (trimmedResume != null) await _saveResume(trimmedResume);
    for (final name in removedFiles.difference(keptFiles)) {
      final file = File('${_mediaDir.path}${Platform.pathSeparator}$name');
      if (await FileSystemEntity.type(file.path, followLinks: false) ==
          FileSystemEntityType.file) {
        await file.delete();
      }
    }
    return (await readPackage())!;
  });

  Future<void> removePackage() async {
    await _exclusive(() async {
      if (await _file('package.json').exists()) {
        await _file('package.json').delete();
      }
      if (await _file('resume.json').exists()) {
        await _file('resume.json').delete();
      }
      await _clearIncompleteFiles();
      await _removeUnusedFiles({});
    });
  }
}
