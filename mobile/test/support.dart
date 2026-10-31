import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/data/token_vault.dart';
import 'package:arten_explorer/data/website_photo.dart';

final pngBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaHD4DwADBAHAqetaQwAAAABJRU5ErkJggg==',
);
Map<String, dynamic> mediaFixture(
  String id, {
  String extension = 'png',
  int order = 0,
  List<int>? bytes,
}) {
  final content = bytes ?? pngBytes;
  return {
    'id': id,
    'url': 'https://media.example.invalid/$id.$extension',
    'bytes': content.length,
    'sha256': sha256.convert(content).toString(),
    'mimeType': extension == 'mp3' ? 'audio/mpeg' : 'image/png',
    'alt': 'Synthetisches Testbild',
    'caption': 'Testbeschriftung $id',
    'order': order,
  };
}

Map<String, dynamic> catalogFixture({
  String revision = 'fixture-1',
  bool media = true,
}) => {
  'schemaVersion': 1,
  'revision': revision,
  'generatedAt': '2026-10-31T12:00:00.000Z',
  'species': [
    {
      'id': 'test-art',
      'scientificName': 'Exemplum primum',
      'commonName': 'Erste Testart',
      'taxonomy': [
        {'rank': 'class', 'name': 'Testklasse'},
      ],
      'sections': [
        {
          'id': 'beschreibung',
          'title': 'Beschreibung',
          'text': 'Ausschließlich synthetischer Testtext.',
          'intentionallyEmpty': false,
        },
        {
          'id': 'leer',
          'title': 'Bewusst leer',
          'text': '',
          'intentionallyEmpty': true,
        },
      ],
      'media': {
        if (media) 'portrait': mediaFixture('portrait'),
        if (media) 'map': mediaFixture('map'),
        'sounds': media ? [mediaFixture('sound', extension: 'mp3')] : [],
        'gallery': media
            ? [
                mediaFixture('gallery-two', order: 2),
                mediaFixture('gallery-one', order: 1),
              ]
            : [],
      },
    },
    {
      'id': 'zweite-art',
      'scientificName': 'Exemplum secundum',
      'commonName': 'Zweite Testart',
      'taxonomy': [],
      'sections': [],
      'media': {'sounds': [], 'gallery': []},
    },
  ],
};
Map<String, dynamic> cloneJson(Map<String, dynamic> value) =>
    jsonDecode(jsonEncode(value)) as Map<String, dynamic>;

ProjectSession sessionFixture({
  DateTime? expiresAt,
  DateTime? deviceExpiresAt,
  String userId = 'fixture-user',
}) => ProjectSession(
  server: Uri.parse('https://project.example.invalid/'),
  token: 'fixture-session-token',
  projectId: 'fixture-project',
  expiresAt: expiresAt ?? DateTime.now().add(const Duration(hours: 1)),
  user: ProjectIdentity(
    id: userId,
    username: 'fixture',
    displayName: 'Testperson',
    role: 'admin',
  ),
  deviceToken: 'fixture-device-token',
  deviceExpiresAt:
      deviceExpiresAt ?? DateTime.now().add(const Duration(days: 1)),
);

class MemoryVault implements TokenVault {
  ProjectSession? value;
  MemoryVault([this.value]);
  @override
  Future<ProjectSession?> read() async => value;
  @override
  Future<void> write(ProjectSession session) async {
    value = session;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

class FakeTransport implements ProjectTransport, WebsitePhotoTransport {
  final requests = <Map<String, dynamic>>[], mediaRequests = <Uri>[];
  final photoRequests=<Uri>[];
  Future<WebsitePhotoResponse> Function(Uri)? onPhoto;
  Future<Map<String, dynamic>> Function(
    Uri uri,
    String method,
    Map<String, dynamic>? body,
    String? bearer,
  )?
  onJson;
  Stream<List<int>> Function(Uri uri)? onMedia;
  @override
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  }) async {
    requests.add({
      'uri': uri.toString(),
      'method': method,
      'body': body,
      'bearer': bearer,
    });
    return onJson == null
        ? catalogFixture()
        : onJson!(uri, method, body, bearer);
  }

  @override
  Stream<List<int>> media(Uri uri) async* {
    mediaRequests.add(uri);
    if (onMedia != null) {
      yield* onMedia!(uri);
    } else {
      yield pngBytes.sublist(0, 10);
      yield pngBytes.sublist(10);
    }
  }

  @override
  void close() {}
  @override
  Future<WebsitePhotoResponse> websitePhoto(Uri uri) async {
    WebsitePhotoPolicy.checkUrl(uri);photoRequests.add(uri);
    if(onPhoto!=null)return onPhoto!(uri);
    return WebsitePhotoResponse(sourceUrl:uri,mimeType:'image/png',contentLength:pngBytes.length,
      body:Stream<List<int>>.value(pngBytes));
  }
}

Map<String,dynamic> observedCatalogFixture({String revision='fixture-gallery-1'}) {
  final value=catalogFixture(revision:revision);
  for(final entry in value['species'][0]['media']['gallery']) {
    entry.remove('sha256');entry.remove('bytes');entry.remove('mimeType');
    entry['url']='https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/${entry['id']}.png?format=1500w';
  }
  return value;
}

Future<Directory> testDirectory() async {
  final session = Platform.environment['ARTEN_TEST_TEMP'];
  if (session == null || session.isEmpty) {
    throw StateError(
      'Tests über node mobile/tool/check.mjs ausführen; kein Betriebssystem-temp verwenden.',
    );
  }
  final parent = Directory(session);
  if (FileSystemEntity.typeSync(parent.path, followLinks: false) ==
      FileSystemEntityType.link) {
    throw StateError('Test-temp darf keine Verknüpfung sein.');
  }
  return parent.createTemp('mobile-');
}

Future<void> removeTestDirectory(Directory directory) async {
  final session = Directory(Platform.environment['ARTEN_TEST_TEMP']!)
      .absolute
      .path
      .toLowerCase();
  final target = directory.absolute.path.toLowerCase();
  if (!target.startsWith('$session${Platform.pathSeparator}') ||
      target == session) {
    throw StateError('Unzulässige Fixturebereinigung.');
  }
  if (FileSystemEntity.typeSync(directory.path, followLinks: false) ==
      FileSystemEntityType.link) {
    throw StateError('Verknüpfte Fixture bleibt erhalten.');
  }
  if (await directory.exists()) await directory.delete(recursive: true);
}
