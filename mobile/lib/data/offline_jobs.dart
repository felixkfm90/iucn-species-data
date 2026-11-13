import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../domain/catalog.dart';
import 'offline_store.dart';
import 'project_api.dart';
import 'token_vault.dart';
import 'offline_writer.dart';

class DownloadNetwork {
  final bool connected, metered;
  const DownloadNetwork({required this.connected, required this.metered});
}

class OfflineTaskStatus {
  final String jobId, status, message;
  final int completeFiles, totalFiles, receivedBytes;
  final bool allowMetered, automatic, scheduled;
  const OfflineTaskStatus({
    required this.jobId,
    required this.status,
    this.message = '',
    this.completeFiles = 0,
    this.totalFiles = 0,
    this.receivedBytes = 0,
    this.allowMetered = false,
    this.automatic = false,
    this.scheduled = false,
  });
  bool get active => const ['queued', 'running', 'paused'].contains(status);
  bool get canResume => status == 'paused' || status == 'queued';
  factory OfflineTaskStatus.fromJson(Map<String, dynamic> value) {
    final id = requiredText(value['jobId'], 'Downloadkennung');
    if (!OfflineJob.validId(id) ||
        !const [
          'queued',
          'running',
          'paused',
          'completed',
          'failed',
          'cancelled',
        ].contains(value['status'])) {
      throw const FormatException(
        'Der gespeicherte Downloadstatus ist ungültig.',
      );
    }
    int count(String key) {
      final valueAt = value[key] ?? 0;
      if (valueAt is! int || valueAt < 0) {
        throw const FormatException('Ungültiger Downloadfortschritt.');
      }
      return valueAt;
    }

    return OfflineTaskStatus(
      jobId: id,
      status: value['status'] as String,
      message: value['message'] is String ? value['message'] as String : '',
      completeFiles: count('completeFiles'),
      totalFiles: count('totalFiles'),
      receivedBytes: count('receivedBytes'),
      allowMetered: value['allowMetered'] == true,
      automatic: value['automatic'] == true,
      scheduled: value['scheduled'] == true,
    );
  }
}

abstract interface class OfflineDownloads {
  Future<DownloadNetwork> network();
  Future<void> start(
    String jobId, {
    required bool allowMetered,
    bool automatic = false,
    int? estimatedBytes,
  });
  Future<OfflineTaskStatus?> status();
  Future<void> cancel(String jobId);
  Future<void> acknowledge(String jobId);
}

class AndroidOfflineDownloads implements OfflineDownloads {
  final MethodChannel channel;
  const AndroidOfflineDownloads({
    this.channel = const MethodChannel(offlineDownloadChannel),
  });
  @override
  Future<DownloadNetwork> network() async {
    final result = await channel.invokeMapMethod<String, dynamic>('network');
    if (result?['connected'] is! bool || result?['metered'] is! bool) {
      throw const FormatException(
        'Die Netzwerkart konnte nicht geprüft werden.',
      );
    }
    return DownloadNetwork(
      connected: result!['connected'] as bool,
      metered: result['metered'] as bool,
    );
  }

  @override
  Future<void> start(
    String jobId, {
    required bool allowMetered,
    bool automatic = false,
    int? estimatedBytes,
  }) => channel.invokeMethod<void>('start', {
    'jobId': jobId,
    'allowMetered': allowMetered,
    'automatic': automatic,
    'estimatedBytes': ?estimatedBytes,
  });
  @override
  Future<OfflineTaskStatus?> status() async {
    final value = await channel.invokeMapMethod<String, dynamic>('status');
    return value == null || value.isEmpty
        ? null
        : OfflineTaskStatus.fromJson(value);
  }

  @override
  Future<void> cancel(String jobId) =>
      channel.invokeMethod<void>('cancel', {'jobId': jobId});
  @override
  Future<void> acknowledge(String jobId) =>
      channel.invokeMethod<void>('acknowledge', {'jobId': jobId});
}

/// A private intent, without passwords, session tokens or arbitrary destination paths.
/// The source catalog is retained exactly; the store derives its media variants separately.
class OfflineJob {
  final String id;
  final Catalog catalog;
  final OfflineSelection selection;
  final String? origin, projectId, userId;
  const OfflineJob({
    required this.id,
    required this.catalog,
    required this.selection,
    this.origin,
    this.projectId,
    this.userId,
  });
  bool get public => origin == null;
  static bool validId(String value) =>
      RegExp(r'^[a-f0-9]{32}$').hasMatch(value);
  static String newId() => List.generate(
    16,
    (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  static File file(Directory support, String id) {
    if (!validId(id)) throw const FormatException('Ungültige Downloadkennung.');
    return File('${support.path}/offline-jobs/$id.json');
  }

  bool belongsTo(ProjectSession? session, {required bool viewingPublic}) =>
      public
      ? viewingPublic
      : !viewingPublic &&
            session != null &&
            session.server.origin == origin &&
            session.projectId == projectId &&
            session.user.id == userId;
  Directory storeDirectory(Directory support) => public
      ? Directory('${support.path}/public-catalog')
      : Directory(
          '${support.path}/projects/${OfflineStore.projectKey(Uri.parse(origin!), userId!, projectId: projectId!)}',
        );
  Map<String, dynamic> toJson() => {
    'schemaVersion': 1,
    'id': id,
    'source': public
        ? {'kind': 'public'}
        : {
            'kind': 'project',
            'origin': origin,
            'projectId': projectId,
            'userId': userId,
          },
    'catalog': catalog.toJson(),
    'selection': selection.toJson(),
  };
  factory OfflineJob.fromJson(Map<String, dynamic> value) {
    final id = requiredText(value['id'], 'Downloadkennung');
    final source = object(value['source'], 'Downloadquelle');
    if (value['schemaVersion'] != 1 ||
        !validId(id) ||
        !const ['public', 'project'].contains(source['kind'])) {
      throw const FormatException('Ungültiger Downloadauftrag.');
    }
    final project = source['kind'] == 'project';
    final origin = project
        ? normalizeServer(requiredText(source['origin'], 'Projektursprung'))
              .origin
        : null;
    if (project && origin != source['origin'] ||
        !project && source.length != 1 ||
        project && source.length != 4) {
      throw const FormatException(
        'Die Downloadquelle ist nicht eindeutig gebunden.',
      );
    }
    return OfflineJob(
      id: id,
      catalog: Catalog.fromJson(object(value['catalog'], 'Downloadkatalog')),
      selection: OfflineSelection.fromJson(
        object(value['selection'], 'Downloadauswahl'),
      ),
      origin: origin,
      projectId: project
          ? requiredText(source['projectId'], 'Projektkennung', maximum: 256)
          : null,
      userId: project
          ? requiredText(source['userId'], 'Personenkennung', maximum: 256)
          : null,
    );
  }
  Future<void> save(Directory support) async {
    final target = file(support, id);
    await target.parent.create(recursive: true);
    await _checkPath(support, target.parent);
    final encoded = utf8.encode(jsonEncode(toJson()));
    if (encoded.length > 32 * 1024 * 1024) {
      throw const FormatException('Der Downloadauftrag ist zu groß.');
    }
    // Exclusive creation: a native task never observes a partly written plan.
    final temporary = File('${target.path}.partial');
    await temporary.create(exclusive: true);
    try {
      await temporary.writeAsBytes(encoded, flush: true);
      if (await FileSystemEntity.type(target.path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        throw const FormatException(
          'Diese Downloadkennung ist bereits vergeben.',
        );
      }
      await temporary.rename(target.path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }

  static Future<void> _checkPath(Directory support, Directory target) async {
    final base = await support.resolveSymbolicLinks();
    final actual = await target.resolveSymbolicLinks();
    if (actual != '$base${Platform.pathSeparator}offline-jobs') {
      throw const FormatException(
        'Der Downloadordner liegt außerhalb des privaten App-Speichers.',
      );
    }
  }

  static Future<OfflineJob> read(Directory support, String id) async {
    final source = file(support, id);
    await _checkPath(support, source.parent);
    if (await FileSystemEntity.type(source.path, followLinks: false) !=
            FileSystemEntityType.file ||
        await source.length() > 32 * 1024 * 1024) {
      throw const FormatException(
        'Der Downloadauftrag fehlt oder ist ungültig.',
      );
    }
    final result = OfflineJob.fromJson(
      object(jsonDecode(await source.readAsString()), 'Downloadauftrag'),
    );
    if (result.id != id) {
      throw const FormatException('Die Downloadkennung wurde verändert.');
    }
    return result;
  }
}

Future<void> runOfflineJob(
  OfflineJob job,
  Directory support, {
  required TokenVault vault,
  required ProjectTransport transport,
  required bool Function() cancelled,
  required void Function(OfflineProgress) onProgress,
}) async {
  final saved = job.public ? null : await vault.read();
  if (!job.belongsTo(saved, viewingPublic: job.public) ||
      !job.public && !saved!.mayReadOffline) {
    throw const FormatException(
      'Der Download gehört nicht zur aktuellen gültigen Projektanmeldung. Bitte erneut anmelden.',
    );
  }
  final deadline = job.public
      ? null
      : saved!.deviceExpiresAt ?? saved.expiresAt;
  final store = OfflineStore(
    job.storeDirectory(support),
    transport,
    projectId: job.projectId,
  );
  var active = saved;
  Future<void> checkAccount() async {
    final current = await vault.read();
    if (!job.belongsTo(current, viewingPublic: false) ||
        !current!.mayReadOffline) {
      throw const FormatException(
        'Die Anmeldung für dieses Offlinepaket ist abgelaufen oder wurde gewechselt.',
      );
    }
  }

  if (cancelled()) throw const DownloadCancelled();
  // OfflineStore owns the exclusive writer lock and the durable per-file journal.
  await store.download(
    job.catalog,
    job.selection,
    onProgress: onProgress,
    projectMedia: job.public
        ? null
        : (file) async* {
            await checkAccount();
            final api = ProjectApi(active!.server, transport);
            if (!active!.expiresAt.isAfter(
              DateTime.now().add(const Duration(minutes: 1)),
            )) {
              active = await api.refresh(active!);
            }
            await checkAccount();
            yield* api.projectMedia(active!, file);
            await checkAccount();
          },
    beforeCommit: job.public ? null : checkAccount,
    cancelled: () =>
        cancelled() || deadline != null && !deadline.isAfter(DateTime.now()),
  );
}

/// Executed by an Android-owned headless engine, independently of MainActivity.
@pragma('vm:entry-point')
Future<void> offlineDownloadEntrypoint() async {
  WidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(offlineDownloadChannel);
  final transport = HttpProjectTransport();
  var cancelled = false;
  Timer? cancellationPoll;
  var polling = false;
  channel.setMethodCallHandler((call) async {
    if (call.method == 'cancel') cancelled = true;
  });
  try {
    final context = await channel.invokeMapMethod<String, dynamic>('context');
    final support = Directory(
      requiredText(context?['supportDirectory'], 'Privater App-Speicher'),
    );
    final job = await OfflineJob.read(
      support,
      requiredText(context?['jobId'], 'Downloadkennung'),
    );
    cancellationPoll = Timer.periodic(const Duration(milliseconds: 500), (
      _,
    ) async {
      if (polling) return;
      polling = true;
      try {
        cancelled =
            cancelled ||
            await channel.invokeMethod<bool>('isCancelled') != false;
      } catch (_) {
        cancelled = true;
      } finally {
        polling = false;
      }
    });
    var lastReport = DateTime.fromMillisecondsSinceEpoch(0);
    var lastFiles = -1, lastTotal = -1;
    OfflineProgress? latest;
    Map<String, Object> progressJson(OfflineProgress value) => {
      'completeFiles': value.completeFiles,
      'totalFiles': value.totalFiles,
      'receivedBytes': value.receivedBytes,
      'message': value.message,
    };
    await runOfflineJob(
      job,
      support,
      vault: const SecureTokenVault(),
      transport: transport,
      cancelled: () => cancelled,
      onProgress: (progress) {
        latest = progress;
        final now = DateTime.now();
        if (lastFiles == progress.completeFiles &&
            lastTotal == progress.totalFiles &&
            now.difference(lastReport).inMilliseconds < 500) {
          return;
        }
        lastReport = now;
        lastFiles = progress.completeFiles;
        lastTotal = progress.totalFiles;
        unawaited(
          channel
              .invokeMethod<void>('progress', progressJson(progress))
              .catchError((Object _) {
                cancelled = true;
              }),
        );
      },
    );
    if (latest != null) {
      await channel.invokeMethod<void>('progress', progressJson(latest!));
    }
    await channel.invokeMethod<void>('finish', {
      'status': 'completed',
      'message': 'Offlineauswahl vollständig geladen und geprüft.',
    });
  } catch (failure) {
    final stopped = cancelled || failure is DownloadCancelled;
    final transient =
        !stopped &&
        (failure is SocketException ||
            failure is TimeoutException ||
            failure is HttpException);
    final message = stopped
        ? 'Download beendet. Bereits geprüfte Dateien können später fortgesetzt werden.'
        : failure is FormatException
        ? failure.message
        : 'Download unterbrochen. Bereits geprüfte Dateien bleiben für das Fortsetzen erhalten.';
    await channel.invokeMethod<void>('finish', {
      'status': stopped
          ? 'cancelled'
          : transient
          ? 'retry_network'
          : 'failed',
      'message': message,
    });
  } finally {
    cancellationPoll?.cancel();
    transport.close();
    channel.setMethodCallHandler(null);
  }
}
