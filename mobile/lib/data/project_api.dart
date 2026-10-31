import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../domain/catalog.dart';
import 'website_photo.dart';

class ProjectApiException implements Exception {
  final int status;
  final String message;
  const ProjectApiException(this.status, this.message);
  bool get requiresLogin => status == 401 || status == 403;
  @override
  String toString() => message;
}

abstract interface class ProjectTransport {
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  });
  Stream<List<int>> media(Uri uri);
  void close();
}

class HttpProjectTransport implements ProjectTransport, WebsitePhotoTransport {
  final HttpClient client;
  HttpProjectTransport({HttpClient? client}) : client = client ?? HttpClient() {
    this.client.connectionTimeout = const Duration(seconds: 20);
    this.client.userAgent = 'ArtenExplorer/0.1.2 Android';
  }
  @override
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  }) async {
    httpsUri(uri.toString(), 'Projektadresse');
    final request = await client
        .openUrl(method, uri)
        .timeout(const Duration(seconds: 20));
    // Never forward credentials through an unexpected redirect, including another project origin.
    request.followRedirects = false;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (bearer != null) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $bearer');
    }
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
    }
    final response = await request.close().timeout(const Duration(seconds: 25));
    final bytes = <int>[];
    await for (final chunk in response.timeout(const Duration(seconds: 25))) {
      if (bytes.length + chunk.length > 32 * 1024 * 1024) {
        throw const ProjectApiException(0, 'Der Katalog ist zu groß.');
      }
      bytes.addAll(chunk);
    }
    if (response.statusCode == 401) {
      throw const ProjectApiException(
        401,
        'Bitte erneut am gemeinsamen Projekt anmelden.',
      );
    }
    if (response.statusCode == 403) {
      throw const ProjectApiException(
        403,
        'Für diesen Projektbestand fehlt die Leseberechtigung.',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ProjectApiException(
        response.statusCode,
        'Der Projektdienst antwortet mit Fehler ${response.statusCode}.',
      );
    }
    return object(jsonDecode(utf8.decode(bytes)), 'Serverantwort');
  }

  @override
  Stream<List<int>> media(Uri uri) async* {
    httpsUri(uri.toString(), 'Medienadresse');
    final request = await client
        .getUrl(uri)
        .timeout(const Duration(seconds: 20));
    // Public media never receive the personal project bearer token.
    request.followRedirects = false;
    final response = await request.close().timeout(const Duration(seconds: 25));
    if (response.statusCode != 200) {
      await response.drain<void>();
      throw ProjectApiException(
        response.statusCode,
        'Die Mediendatei konnte nicht geladen werden (${response.statusCode}).',
      );
    }
    yield* response.timeout(const Duration(seconds: 25));
  }

  @override
  void close() => client.close(force: true);

  @override
  Future<WebsitePhotoResponse> websitePhoto(Uri uri) async {
    WebsitePhotoPolicy.checkUrl(uri);
    final request = await client.getUrl(uri).timeout(const Duration(seconds: 20));
    request.followRedirects = false;
    request.headers.set(HttpHeaders.acceptHeader, 'image/jpeg, image/png, image/webp');
    request.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
    request.headers.removeAll(HttpHeaders.authorizationHeader);
    request.headers.removeAll(HttpHeaders.cookieHeader);
    request.cookies.clear();
    final timer = Timer(const Duration(seconds: 90), () {
      request.abort(const FormatException('Das Websitefoto wurde nicht innerhalb des Zeitlimits geladen.'));
    });
    var released=false;
    void release(){if(!released){released=true;timer.cancel();request.abort();}}
    HttpClientResponse? response;
    try {
      final received = await request.close().timeout(const Duration(seconds: 25));
      response = received;
      if (received.statusCode != 200) {
        throw ProjectApiException(received.statusCode,
          'Das öffentliche Websitefoto wurde nicht bestätigt (${received.statusCode}); Weiterleitungen werden nicht übernommen.');
      }
      final type = WebsitePhotoPolicy.checkMime(received.headers.contentType?.mimeType);
      final encoding = received.headers.value(HttpHeaders.contentEncodingHeader);
      if (encoding != null && encoding.toLowerCase() != 'identity' ||
          received.contentLength > WebsitePhotoPolicy.maximumBytes ||
          received.contentLength == 0) {
        throw const FormatException('Die Websiteantwort überschreitet die erlaubte Bildgröße oder Kodierung.');
      }
      Stream<List<int>> bounded() async* {
        var total = 0;
        try {
          await for (final chunk in received.timeout(const Duration(seconds: 25))) {
            total += chunk.length;
            if (total > WebsitePhotoPolicy.maximumBytes ||
                received.contentLength >= 0 && total > received.contentLength) {
              throw const FormatException('Das Websitefoto ist größer als erlaubt.');
            }
            yield chunk;
          }
          if (received.contentLength >= 0 && total != received.contentLength) {
            throw const FormatException('Das Websitefoto wurde nicht vollständig geladen.');
          }
        } finally {
          release();
        }
      }
      return WebsitePhotoResponse(sourceUrl: uri, mimeType: type,
        contentLength: received.contentLength < 0 ? null : received.contentLength, body: bounded(),onClose:release);
    } catch (_) {
      release();
      if (response != null) await response.listen(null).cancel();
      rethrow;
    }
  }
}

class ProjectIdentity {
  final String id, username, displayName, role;
  const ProjectIdentity({
    required this.id,
    required this.username,
    required this.displayName,
    required this.role,
  });
  factory ProjectIdentity.fromJson(Map<String, dynamic> value) =>
      ProjectIdentity(
        id: requiredText(value['id'], 'Benutzerkennung'),
        username: requiredText(value['username'], 'Benutzername'),
        displayName:
            value['displayName'] as String? ?? value['username'] as String,
        role: requiredText(value['role'], 'Benutzerrolle'),
      );
  Map<String, dynamic> toJson() => {
    'id': id,
    'username': username,
    'displayName': displayName,
    'role': role,
  };
}

class ProjectSession {
  final Uri server;
  final String projectId;
  final String token;
  final DateTime expiresAt;
  final ProjectIdentity user;
  final String? deviceToken;
  final DateTime? deviceExpiresAt;
  const ProjectSession({
    required this.server,
    required this.projectId,
    required this.token,
    required this.expiresAt,
    required this.user,
    this.deviceToken,
    this.deviceExpiresAt,
  });
  bool get mayReadOffline => deviceExpiresAt != null
      ? deviceExpiresAt!.isAfter(DateTime.now())
      : expiresAt.isAfter(DateTime.now());
  factory ProjectSession.fromJson(
    Uri server,
    Map<String, dynamic> value, {
    ProjectSession? previous,
  }) {
    if (value['scope'] != 'read') {
      throw const FormatException(
        'Der Projektdienst muss eine ausschließlich lesende mobile Sitzung ausstellen.',
      );
    }
    final projectId = requiredText(
      value['projectId'],
      'Projektkennung',
      maximum: 256,
    );
    if (previous != null && previous.projectId != projectId) {
      throw const ProjectApiException(
        401,
        'Der Projektdienst gehört zu einem anderen Bestand. Bitte neu anmelden.',
      );
    }
    final device = value['device'] == null
        ? null
        : object(value['device'], 'Gerätezulassung');
    final expires = DateTime.tryParse(
      requiredText(value['expiresAt'], 'Sitzungsablauf'),
    );
    final deviceExpires = device == null
        ? previous?.deviceExpiresAt
        : DateTime.tryParse(requiredText(device['expiresAt'], 'Geräteablauf'));
    if (expires == null || (device != null && deviceExpires == null)) {
      throw const FormatException('Ungültige Sitzungsdauer.');
    }
    final user = ProjectIdentity.fromJson(object(value['user'], 'Benutzer'));
    if (previous != null && previous.user.id != user.id) {
      throw const ProjectApiException(
        401,
        'Die erneuerte Sitzung gehört zu einer anderen Person. Bitte neu anmelden.',
      );
    }
    return ProjectSession(
      server: server,
      projectId: projectId,
      token: requiredText(value['token'], 'Sitzungstoken'),
      expiresAt: expires,
      user: user,
      deviceToken: device == null
          ? previous?.deviceToken
          : requiredText(device['token'], 'Gerätetoken'),
      deviceExpiresAt: deviceExpires,
    );
  }
  factory ProjectSession.fromStored(Map<String, dynamic> value) {
    final server = normalizeServer(
      requiredText(value['server'], 'Projektadresse'),
    );
    return ProjectSession.fromJson(server, value);
  }
  Map<String, dynamic> toStored() => {
    'server': server.toString(),
    'projectId': projectId,
    'scope': 'read',
    'token': token,
    'expiresAt': expiresAt.toUtc().toIso8601String(),
    'user': user.toJson(),
    if (deviceToken != null && deviceExpiresAt != null)
      'device': {
        'token': deviceToken,
        'expiresAt': deviceExpiresAt!.toUtc().toIso8601String(),
      },
  };
}

Uri normalizeServer(String raw) {
  final uri = httpsUri(raw.trim(), 'Projektadresse');
  if ((uri.path.isNotEmpty && uri.path != '/') || uri.query.isNotEmpty) {
    throw const FormatException(
      'Die Projektadresse bitte ohne Unterseite oder Suchparameter eingeben.',
    );
  }
  return Uri(
    scheme: 'https',
    host: uri.host.toLowerCase(),
    port: uri.port == 443 ? null : uri.port,
    path: '/',
  );
}

class ProjectApi {
  final Uri server;
  final ProjectTransport transport;
  ProjectApi(this.server, this.transport);
  Uri endpoint(String path) => server.resolve('/api/v1/$path');
  Future<ProjectSession> login(String username, String password) async =>
      ProjectSession.fromJson(
        server,
        await transport.json(
          endpoint('auth/login'),
          method: 'POST',
          body: {
            'username': username.trim(),
            'password': password,
            'deviceLabel': 'Arten-Explorer Android',
            'scope': 'read',
          },
        ),
      );
  Future<ProjectSession> refresh(ProjectSession session) async {
    if (session.deviceToken == null || !session.mayReadOffline) {
      throw const ProjectApiException(
        401,
        'Bitte erneut anmelden. Die Gerätezulassung ist abgelaufen.',
      );
    }
    return ProjectSession.fromJson(
      server,
      await transport.json(
        endpoint('auth/refresh'),
        method: 'POST',
        bearer: session.deviceToken,
      ),
      previous: session,
    );
  }

  Future<Catalog> catalog(ProjectSession session) async => Catalog.fromJson(
    await transport.json(endpoint('catalog'), bearer: session.token),
  );
  Future<void> logout(ProjectSession session) async {
    await transport.json(
      endpoint('auth/logout'),
      method: 'POST',
      bearer: session.token,
      body: {'revokeDevice': true},
    );
  }
}
