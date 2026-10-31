import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'project_api.dart';

abstract interface class TokenVault {
  Future<ProjectSession?> read();
  Future<void> write(ProjectSession session);
  Future<void> clear();
}

class SecureTokenVault implements TokenVault {
  static const _key = 'fn-arten-explorer.project-session.v1';
  final FlutterSecureStorage storage;
  const SecureTokenVault({this.storage = const FlutterSecureStorage()});
  @override
  Future<ProjectSession?> read() async {
    final value = await storage.read(key: _key);
    if (value == null) return null;
    return ProjectSession.fromStored(jsonDecode(value) as Map<String, dynamic>);
  }

  @override
  Future<void> write(ProjectSession session) =>
      storage.write(key: _key, value: jsonEncode(session.toStored()));
  @override
  Future<void> clear() => storage.delete(key: _key);
}
