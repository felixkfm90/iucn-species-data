import 'dart:convert';
import 'dart:io';

class OfflineSettings {
  final bool allowMetered, autoUpdate;
  const OfflineSettings({this.allowMetered = false, this.autoUpdate = false});

  static File _file(Directory support) =>
      File('${support.path}/offline-settings.json');

  static Future<OfflineSettings> read(Directory support) async {
    try {
      final data = jsonDecode(await _file(support).readAsString());
      if (data is Map && data['schemaVersion'] == 1) {
        return OfflineSettings(
          allowMetered: data['allowMetered'] == true,
          autoUpdate: data['autoUpdate'] == true,
        );
      }
    } on FileSystemException {
      // A missing or unreadable preference must never permit mobile traffic.
    } on FormatException {
      // Old or damaged preferences are safe to reset.
    }
    return const OfflineSettings();
  }

  Future<void> save(Directory support) async {
    final target = _file(support);
    await support.create(recursive: true);
    final draft = File('${target.path}.next');
    await draft.writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'allowMetered': allowMetered,
        'autoUpdate': autoUpdate,
      }),
      flush: true,
    );
    await draft.rename(target.path);
  }
}
