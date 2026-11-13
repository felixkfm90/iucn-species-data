import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import '../domain/project_media.dart';

class ProjectApiException implements Exception {
  final int status;
  final String message;
  final String? code;
  const ProjectApiException(this.status, this.message, {this.code});
  bool get requiresLogin => status == 401 || status == 403;
  @override
  String toString() => message;
}

class _DigestResult implements Sink<crypto.Digest> {
  crypto.Digest? digest;
  @override
  void add(crypto.Digest value) => digest = value;
  @override
  void close() {}
}

/// Receives one exact file. A consumer may commit bytes only after normal completion.
Stream<List<int>> readProjectMedia(
  HttpClient client, {
  required Uri server,
  required String projectId,
  required String bearer,
  required ProjectMediaFile file,
}) async* {
  const invalid = FormatException(
    'Die Projektdatei stimmt nicht mit der geprüften Artfassung überein.',
  );
  if (server.scheme != 'https' ||
      server.host.isEmpty ||
      server.userInfo.isNotEmpty ||
      (server.path != '' && server.path != '/') ||
      server.hasQuery ||
      server.hasFragment ||
      projectId != file.projectId ||
      bearer.isEmpty ||
      bearer.length > 8192 ||
      RegExp(r'\s').hasMatch(bearer)) {
    throw const FormatException(
      'Die Projektdatei gehört nicht zur aktuellen Anmeldung.',
    );
  }
  final clock = Stopwatch()..start();
  final request = await client
      .getUrl(server.replace(path: file.path))
      .timeout(const Duration(seconds: 20));
  HttpClientResponse? response;
  var consuming = false;
  try {
    request.followRedirects = false;
    request.headers.set(HttpHeaders.acceptHeader, file.mimeType);
    request.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
    request.headers.removeAll(HttpHeaders.cookieHeader);
    request.cookies.clear();
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $bearer');
    response = await request.close().timeout(const Duration(seconds: 25));
    if (response.statusCode != HttpStatus.ok) {
      throw ProjectApiException(response.statusCode, switch (response
          .statusCode) {
        401 => 'Bitte erneut am gemeinsamen Projekt anmelden.',
        403 || 404 => 'Diese Projektdatei ist für die aktuelle Lesefassung nicht verfügbar.',
        _ =>
          'Die Projektdatei konnte nicht geladen werden (${response.statusCode}).',
      });
    }
    final headers = response.headers;
    if (response.contentLength != file.bytes ||
        headers.contentType?.mimeType != file.mimeType ||
        headers.value('x-content-sha256') != file.sha256 ||
        !const {
          null,
          'identity',
        }.contains(headers.value(HttpHeaders.contentEncodingHeader))) {
      throw invalid;
    }
    final digest = _DigestResult(),
        hash = crypto.sha256.startChunkedConversion(digest);
    var received = 0;
    consuming = true;
    await for (final chunk in response.timeout(const Duration(seconds: 25))) {
      received += chunk.length;
      if (received > file.bytes || clock.elapsed > const Duration(minutes: 2)) {
        throw invalid;
      }
      hash.add(chunk);
      yield chunk;
    }
    hash.close();
    if (received != file.bytes ||
        digest.digest?.toString() != file.sha256 ||
        clock.elapsed > const Duration(minutes: 2)) {
      throw invalid;
    }
  } finally {
    try {
      if (!consuming && response != null) await response.listen(null).cancel();
    } finally {
      request.abort();
    }
  }
}
