import 'package:flutter/services.dart';

const offlineDownloadChannel =
    'de.fnwildlifetravel.arten_explorer/offline_download';

/// Android file locks are process-scoped. The native arbiter additionally excludes
/// other Flutter engines within that process; the file lock excludes other processes.
abstract interface class OfflineWriter {
  Future<String> acquire(String storeKey);
  Future<void> release(String lease);
}

class AndroidOfflineWriter implements OfflineWriter {
  final MethodChannel channel;
  const AndroidOfflineWriter({
    this.channel = const MethodChannel(offlineDownloadChannel),
  });
  @override
  Future<String> acquire(String storeKey) async {
    final lease = await channel.invokeMethod<String>('acquireWriter', {
      'storeKey': storeKey,
    });
    if (lease == null || !RegExp(r'^[a-f0-9]{32}$').hasMatch(lease)) {
      throw const FormatException(
        'Die gemeinsame Downloadsperre konnte nicht bestätigt werden.',
      );
    }
    return lease;
  }

  @override
  Future<void> release(String lease) =>
      channel.invokeMethod<void>('releaseWriter', {'lease': lease});
}
