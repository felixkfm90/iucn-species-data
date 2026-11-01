import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../domain/catalog.dart';
import 'project_api.dart';
import 'website_photo.dart';

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
    this.missingFiles,
    [this.bindings = const {}]
  );
  bool get healthy => missingFiles.isEmpty;
  int get observedPhotoCount => bindings.values.where((entry) => entry.observedWebsite).length;
}

class OfflineFileBinding {
  final String key, sourceUrl, sha256, extension, provenance;
  final int bytes;
  final String? mimeType;
  final DateTime? observedAt;
  final int? width, height;
  const OfflineFileBinding({required this.key,required this.sourceUrl,required this.sha256,
    required this.bytes,required this.extension,required this.provenance,this.mimeType,this.observedAt,this.width,this.height});
  bool get observedWebsite => provenance == 'observed-public-website';
  String get filename => '$sha256$extension';
  bool matches(MediaReference reference) => key == reference.key && (observedWebsite
    ? WebsitePhotoPolicy.canObserve(reference) && sourceUrl == reference.media.url.toString()
    : reference.media.sha256 == sha256 && reference.media.extension == extension &&
        (reference.media.bytes == null || reference.media.bytes == bytes));
  Map<String,dynamic> toJson() => {'sourceUrl':sourceUrl,'sha256':sha256,'bytes':bytes,
    'extension':extension,'provenance':provenance,if(mimeType!=null)'mimeType':mimeType,
    if(observedAt!=null)'observedAt':observedAt!.toUtc().toIso8601String(),
    if(width!=null)'width':width,if(height!=null)'height':height};
  factory OfflineFileBinding.fromJson(MediaReference reference,Map<String,dynamic> value) {
    if(value.keys.any((key)=>!{'sourceUrl','sha256','bytes','extension','provenance','mimeType','observedAt','width','height'}.contains(key)) ||
      value['sourceUrl']!=reference.media.url.toString() || value['sha256'] is! String ||
      !RegExp(r'^[a-f0-9]{64}$').hasMatch(value['sha256'] as String) ||
      value['bytes'] is! int || (value['bytes'] as int)<=0 || (value['bytes'] as int)>512*1024*1024 ||
      value['mimeType']!=null && value['mimeType'] is! String) {
      throw const FormatException('Ungültige Dateibindung im Offlinepaket.');
    }
    final observed = value['provenance']=='observed-public-website';
    DateTime? observedAt;
    if(observed) {
      final type=WebsitePhotoPolicy.checkMime(value['mimeType'] as String?);
      observedAt=DateTime.tryParse(value['observedAt'] is String ? value['observedAt'] as String : '');
      if(!WebsitePhotoPolicy.canObserve(reference) || value['bytes']>WebsitePhotoPolicy.maximumBytes ||
        value['extension']!=WebsitePhotoPolicy.mimeExtensions[type] || observedAt==null ||
        value['width'] is! int || value['height'] is! int) {
        throw const FormatException('Die beobachtete Websitefassung ist nicht an dieses Galeriefoto gebunden.');
      }
      WebsitePhotoPolicy.checkDimensions(value['width'] as int,value['height'] as int);
    } else if(value['provenance']!='catalog-sha256' || reference.media.sha256!=value['sha256'] ||
      reference.media.extension!=value['extension'] || reference.media.bytes!=null && reference.media.bytes!=value['bytes'] ||
      value['observedAt']!=null || value['width']!=null || value['height']!=null) {
      throw const FormatException('Die Dateibindung stimmt nicht mit der Katalogprüfsumme überein.');
    }
    return OfflineFileBinding(key:reference.key,sourceUrl:value['sourceUrl'] as String,sha256:value['sha256'] as String,
      bytes:value['bytes'] as int,extension:value['extension'] as String,provenance:value['provenance'] as String,
      mimeType:value['mimeType'] as String?,observedAt:observedAt,width:value['width'] as int?,height:value['height'] as int?);
  }
}

class DownloadCancelled implements Exception {
  const DownloadCancelled();
  @override
  String toString() =>
      'Download abgebrochen. Der vorherige Offlinebestand bleibt erhalten.';
}

class OfflineStore {
  final Directory root;
  final ProjectTransport transport;
  final Future<RasterPhoto> Function(Uint8List,String) photoValidator;
  bool _busy = false;
  OfflineStore(this.root, this.transport,{this.photoValidator = validateWebsiteRaster});
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
  File _bindingFile(OfflineFileBinding binding) => File('${_mediaDir.path}/${binding.filename}');
  String _nonce() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';

  Future<void> _atomicJson(String name, Map<String, dynamic> value) async {
    await root.create(recursive: true);
    final temporary = _file('$name.${_nonce()}.partial');
    try {
      await temporary.writeAsString(jsonEncode(value), flush: true);
      await temporary.rename(_file(name).path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }

  Future<void> saveIndex(Catalog catalog) =>
      _atomicJson('index.json', catalog.toJson(includeDetails: false));
  Future<Catalog?> readIndex() async {
    if (!await _file('index.json').exists()) return null;
    return Catalog.fromJson(
      object(
        jsonDecode(await _file('index.json').readAsString()),
        'Artübersicht',
      ),
    );
  }

  Future<bool> _matches(ArtMedia media) async {
    if (media.sha256 == null) return false;
    final file = mediaFile(media);
    if (await FileSystemEntity.type(file.path,followLinks:false)!=FileSystemEntityType.file) return false;
    if (media.bytes != null && await file.length() != media.bytes) return false;
    return (await crypto.sha256.bind(file.openRead()).first).toString() ==
        media.sha256;
  }

  Future<bool> _matchesBinding(OfflineFileBinding binding) async {
    final file=_bindingFile(binding);
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
            FileSystemEntityType.file ||
        await file.length() != binding.bytes) {
      return false;
    }
    return (await crypto.sha256.bind(file.openRead()).first).toString()==binding.sha256;
  }

  /// Recheck the actual bytes immediately before display, not only at package reopening.
  Future<Uint8List> verifiedImage(OfflineSnapshot snapshot,MediaReference reference) async {
    final binding=snapshot.bindings[reference.key];
    if(binding==null || !binding.matches(reference) || binding.bytes>WebsitePhotoPolicy.maximumBytes ||
      !await _matchesBinding(binding)) {
      throw const FormatException('Die gespeicherte Bildfassung fehlt oder wurde verändert. Offlinepaket erneut laden.');
    }
    final bytes=await _bindingFile(binding).readAsBytes();
    if(bytes.length!=binding.bytes || crypto.sha256.convert(bytes).toString()!=binding.sha256) {
      throw const FormatException('Das gespeicherte Bild wurde während des Lesens verändert.');
    }
    return bytes;
  }

  Future<OfflineSnapshot?> readPackage() async {
    final file = _file('package.json');
    if (!await file.exists()) return null;
    final value = object(jsonDecode(await file.readAsString()), 'Offlinepaket');
    if (value['schemaVersion'] != 1 && value['schemaVersion'] != 2) {
      throw const FormatException('Unbekannte Offlinepaketversion.');
    }
    final catalog = Catalog.fromJson(
      object(value['catalog'], 'Offlinekatalog'),
    );
    final selection = OfflineSelection.fromJson(
      object(value['selection'], 'Offlineauswahl'),
    );
    final verified = <String, File>{}, missing = <String>[];
    final bindings=<String,OfflineFileBinding>{};
    final fileBindings=value['schemaVersion']==2 ? object(value['files'],'Offline-Dateibindungen') : null;
    final selected=selection.select(catalog);
    final selectedKeys=selected.map((entry)=>entry.key).toSet();
    if(fileBindings!=null && (fileBindings.length!=selected.length || fileBindings.keys.any((key)=>!selectedKeys.contains(key)))) {
      throw const FormatException('Die Dateibindungen stimmen nicht mit der Offlineauswahl überein.');
    }
    for (final reference in selected) {
      OfflineFileBinding? binding;
      if(fileBindings!=null) {
        binding=OfflineFileBinding.fromJson(reference,object(fileBindings[reference.key],'Offline-Datei'));
      } else if(reference.media.sha256!=null && await _matches(reference.media)) {
        binding=OfflineFileBinding(key:reference.key,sourceUrl:reference.media.url.toString(),sha256:reference.media.sha256!,
          bytes:await mediaFile(reference.media).length(),extension:reference.media.extension,provenance:'catalog-sha256',mimeType:reference.media.mimeType);
      }
      if(binding!=null) bindings[reference.key]=binding;
      if (binding!=null && await _matchesBinding(binding)) {
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

  Future<int> occupiedBytes() async {
    var total = 0;
    for (final name in ['index.json', 'package.json']) {
      if (await _file(name).exists()) total += await _file(name).length();
    }
    if (!await _mediaDir.exists()) return total;
    await for (final entry in _mediaDir.list(followLinks: false)) {
      if (entry is File) total += await entry.length();
    }
    return total;
  }

  Future<OfflineSnapshot> download(
    Catalog catalog,
    OfflineSelection selection, {
    required void Function(OfflineProgress) onProgress,
    required bool Function() cancelled,
  }) async {
    if (_busy) throw StateError('Ein Offlinepaket wird bereits geladen.');
    final assets = selection.select(catalog);
    final withoutHash = assets
        .where((entry) => entry.media.sha256 == null && !WebsitePhotoPolicy.canObserve(entry))
        .toList();
    if (withoutHash.isNotEmpty) {
      throw FormatException(
        'Für ${withoutHash.length} ausgewählte Dateien fehlt eine Katalogprüfsumme oder eine bekannte öffentliche Galeriequelle. Diese Auswahl kann nicht offline geladen werden.',
      );
    }
    _busy = true;
    var completed = 0, received = 0;
    final totalBytes = assets.every((entry) => entry.media.bytes != null)
        ? assets.fold<int>(0, (sum, entry) => sum + entry.media.bytes!)
        : null;
    try {
      await _mediaDir.create(recursive: true);
      final bindings=<String,OfflineFileBinding>{};
      for (final reference in assets) {
        if (cancelled()) throw const DownloadCancelled();
        final media = reference.media;
        if(WebsitePhotoPolicy.canObserve(reference)) {
          final binding=await _downloadWebsitePhoto(reference,cancelled:cancelled,onBytes:(count){
            received+=count;
            onProgress(OfflineProgress(completed,assets.length,received,totalBytes,'Öffentliche Websitefassung wird geladen'));
          });
          bindings[reference.key]=binding;
          completed++;
          onProgress(OfflineProgress(completed,assets.length,received,totalBytes,'Websitefassung gespeichert und lokal geprüft'));
          continue;
        }
        if (await _matches(media)) {
          bindings[reference.key]=OfflineFileBinding(key:reference.key,sourceUrl:media.url.toString(),sha256:media.sha256!,
            bytes:await mediaFile(media).length(),extension:media.extension,provenance:'catalog-sha256',mimeType:media.mimeType);
          received += await mediaFile(media).length();
          completed++;
          onProgress(
            OfflineProgress(
              completed,
              assets.length,
              received,
              totalBytes,
              'Geprüfte Datei wiederverwendet',
            ),
          );
          continue;
        }
        final partial = _file('download-${_nonce()}.partial');
        IOSink? sink;
        try {
          sink = partial.openWrite();
          var fileBytes = 0;
          await for (final chunk in transport.media(media.url)) {
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
            onProgress(
              OfflineProgress(
                completed,
                assets.length,
                received,
                totalBytes,
                '${reference.kind == MediaKind.gallery ? 'Galeriefoto' : 'Mediendatei'} wird geladen',
              ),
            );
          }
          await sink.flush();
          await sink.close();
          sink = null;
          if (cancelled()) throw const DownloadCancelled();
          if (media.bytes != null && fileBytes != media.bytes) {
            throw const FormatException('Die Mediendatei ist unvollständig.');
          }
          if(fileBytes==0) throw const FormatException('Die Mediendatei ist leer.');
          final actual = (await crypto.sha256.bind(partial.openRead()).first)
              .toString();
          if (actual != media.sha256) {
            throw const FormatException(
              'Die Prüfsumme stimmt nicht. Der Offlinebestand wurde nicht ersetzt.',
            );
          }
          await partial.rename(mediaFile(media).path);
          bindings[reference.key]=OfflineFileBinding(key:reference.key,sourceUrl:media.url.toString(),sha256:media.sha256!,
            bytes:fileBytes,extension:media.extension,provenance:'catalog-sha256',mimeType:media.mimeType);
          completed++;
          onProgress(
            OfflineProgress(
              completed,
              assets.length,
              received,
              totalBytes,
              'Datei geprüft',
            ),
          );
        } finally {
          await sink?.close();
          if (await partial.exists()) await partial.delete();
        }
      }
      if (cancelled()) throw const DownloadCancelled();
      for(final binding in bindings.values) {
        if(!await _matchesBinding(binding)) throw const FormatException('Eine neue Paketdatei wurde vor dem Abschluss verändert.');
      }
      // One manifest commit exposes the entire verified selection. Previous package survives any earlier failure.
      await _atomicJson('package.json', {
        'schemaVersion': 2,
        'downloadedAt': DateTime.now().toUtc().toIso8601String(),
        'catalog': catalog.toJson(includeDetails: selection.texts),
        'selection': selection.toJson(),
        'files':{for(final entry in bindings.entries)entry.key:entry.value.toJson()},
      });
      final snapshot = await readPackage();
      if (snapshot == null || !snapshot.healthy) {
        throw const FormatException(
          'Offlineprüfung nach dem Speichern fehlgeschlagen.',
        );
      }
      await _removeUnusedFiles(
        bindings.values.map((entry)=>entry.filename).toSet(),
      );
      return snapshot;
    } finally {
      _busy = false;
    }
  }

  Future<OfflineFileBinding> _downloadWebsitePhoto(MediaReference reference,{
    required bool Function() cancelled,required void Function(int) onBytes,
  }) async {
    final Object downloader = transport;
    if(downloader is! WebsitePhotoTransport) {
      throw const FormatException('Der sichere Download öffentlicher Websitefotos ist nicht verfügbar.');
    }
    WebsitePhotoPolicy.checkUrl(reference.media.url);
    final partial=_file('download-${_nonce()}.partial');
    IOSink? sink;
    WebsitePhotoResponse? response;
    var bodyStarted=false;
    try {
      final received=await downloader.websitePhoto(reference.media.url);
      response=received;
      if(received.sourceUrl!=reference.media.url) throw const FormatException('Die Websitefoto-Adresse wurde unerwartet verändert.');
      final mime=WebsitePhotoPolicy.checkMime(received.mimeType);
      if(received.contentLength!=null && (received.contentLength!<=0 || received.contentLength!>WebsitePhotoPolicy.maximumBytes)) {
        throw const FormatException('Die angekündigte Websitefotogröße ist nicht zulässig.');
      }
      if(cancelled()) throw const DownloadCancelled();
      sink=partial.openWrite();var fileBytes=0;bodyStarted=true;
      await for(final chunk in received.body) {
        if(cancelled()) throw const DownloadCancelled();
        fileBytes+=chunk.length;
        if(fileBytes>WebsitePhotoPolicy.maximumBytes ||
          received.contentLength!=null && fileBytes>received.contentLength! ||
          reference.media.bytes!=null && fileBytes>reference.media.bytes!) {
          throw const FormatException('Das Websitefoto überschreitet die erlaubte Dateigröße.');
        }
        sink.add(chunk);onBytes(chunk.length);
      }
      await sink.flush();await sink.close();sink=null;
      if(cancelled()) throw const DownloadCancelled();
      if(fileBytes==0 || received.contentLength!=null && fileBytes!=received.contentLength ||
        reference.media.bytes!=null && fileBytes!=reference.media.bytes) {
        throw const FormatException('Das Websitefoto ist unvollständig.');
      }
      final bytes=await partial.readAsBytes();
      if(WebsitePhotoPolicy.signature(bytes)!=mime) throw const FormatException('Dateiformat und Websiteantwort stimmen nicht überein.');
      final raster=await photoValidator(bytes,mime);
      WebsitePhotoPolicy.checkDimensions(raster.width,raster.height);
      if(raster.mimeType!=mime) throw const FormatException('Die Bildprüfung gehört nicht zur geladenen Websitefassung.');
      if(cancelled()) throw const DownloadCancelled();
      final binding=OfflineFileBinding(key:reference.key,sourceUrl:reference.media.url.toString(),
        sha256:crypto.sha256.convert(bytes).toString(),bytes:fileBytes,extension:WebsitePhotoPolicy.mimeExtensions[mime]!,
        provenance:'observed-public-website',mimeType:mime,observedAt:DateTime.now().toUtc(),width:raster.width,height:raster.height);
      await partial.rename(_bindingFile(binding).path);
      return binding;
    } finally {
      if(response!=null && !bodyStarted)await response.body.listen(null).cancel();
      response?.close();
      await sink?.close();if(await partial.exists())await partial.delete();
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

  Future<void> removePackage() async {
    if (_busy) {
      throw StateError('Der laufende Download muss zuerst beendet werden.');
    }
    if (await _file('package.json').exists()) {
      await _file('package.json').delete();
    }
    await _removeUnusedFiles({});
  }
}
