import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/data/token_vault.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:arten_explorer/domain/project_media.dart';

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

class FakeTransport
    implements
        ProjectTransport,
        WebsitePhotoTransport,
        ProtectedProjectMediaTransport {
  final requests = <Map<String, dynamic>>[], mediaRequests = <Uri>[];
  final photoRequests = <Uri>[];
  final protectedRequests = <(ProjectSession, ProjectMediaFile)>[];
  Future<Map<String, dynamic>> Function(Uri uri)? onReader;
  Stream<List<int>> Function(ProjectSession session, ProjectMediaFile file)?
  onProtected;
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
    if (uri.path == '/api/v2/catalog/page') {
      final reader = onReader;
      if (reader != null) return reader(uri);
      throw const ProjectApiException(
        404,
        'Fixture legacy route',
        code: 'route_not_found',
      );
    }
    return onJson == null
        ? catalogFixture()
        : onJson!(uri, method, body, bearer);
  }

  @override
  Stream<List<int>> projectMedia(
    ProjectSession session,
    ProjectMediaFile file,
  ) async* {
    protectedRequests.add((session, file));
    final load = onProtected;
    if (load == null) throw StateError('Unexpected protected file');
    yield* load(session, file);
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
    WebsitePhotoPolicy.checkUrl(uri);
    photoRequests.add(uri);
    if (onPhoto != null) return onPhoto!(uri);
    return WebsitePhotoResponse(
      sourceUrl: uri,
      mimeType: 'image/png',
      contentLength: pngBytes.length,
      body: Stream<List<int>>.value(pngBytes),
    );
  }
}

Map<String, dynamic> observedCatalogFixture({
  String revision = 'fixture-gallery-1',
}) {
  final value = catalogFixture(revision: revision);
  for (final entry in value['species'][0]['media']['gallery']) {
    entry.remove('sha256');
    entry.remove('bytes');
    entry.remove('mimeType');
    entry['url'] =
        'https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/${entry['id']}.png?format=1500w';
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

Map<String, dynamic> structuredEditorialFixture() {
  Map<String, dynamic> section(
    String id,
    String kind,
    String title, {
    List<Map<String, dynamic>> blocks = const [],
    bool empty = false,
  }) => {
    'id': id,
    'kind': kind,
    'title': title,
    'requested': true,
    'intentionallyEmpty': empty,
    'blocks': blocks,
    'sources': [],
  };
  return {
    'kind': 'structured',
    'title': 'Das Leben am Fluss',
    'introduction': [
      {'type': 'paragraph', 'text': 'Eine eigene Einleitung.'},
    ],
    'sections': [
      section('general', 'general-module', 'Allgemein'),
      section(
        'appearance',
        'editorial',
        'Aussehen',
        blocks: [
          {'type': 'heading', 'level': 5, 'text': 'Kennzeichen'},
          {
            'type': 'bullet-list',
            'items': ['Breite Flügel', 'Langer Schwanz'],
          },
          {
            'type': 'numbered-list',
            'items': ['Erster Punkt', 'Zweiter Punkt'],
          },
        ],
      ),
      section('food', 'editorial', 'Nahrung', empty: true),
      section('range', 'map-module', 'Verbreitung'),
    ],
    'sources': [
      {'id': 'field', 'label': 'Eigene Beobachtungen'},
    ],
    'galleryRequested': false,
  };
}

Map<String, dynamic> protectedReaderFixture(
  Uri uri,
  String projectId, {
  List<int> sound = const [1, 2, 3],
}) {
  const image = 'image-11111111-1111-4111-8111-111111111111';
  Map<String, dynamic> file(
    String id,
    String type,
    List<int> bytes, {
    String? contentId,
  }) => {
    'kind': contentId == null ? 'project-image' : 'project-normal',
    'id': id,
    'projectId': projectId,
    'mimeType': type,
    'bytes': bytes.length,
    'sha256': sha256.convert(bytes).toString(),
    'attribution': '',
    'contentId': ?contentId,
  };
  return {
    'schemaVersion': 2,
    'projectId': projectId,
    'revision': '5',
    'generatedAt': '2026-11-09T12:00:00.000Z',
    'snapshot': 'a' * 64,
    'totalCount': 1,
    'nextCursor': null,
    'complete': true,
    'checked': uri.queryParameters['check'] == '1',
    'species': [
      if (uri.queryParameters['check'] != '1')
        {
          'id': 'private-art',
          'commonName': 'Projektart',
          'scientificName': 'Strix privata',
          'taxonomy': [],
          'websiteUrl': null,
          'general': [],
          'status': {
            'category': '',
            'status': 'LC',
            'trend': 'Abnehmend',
            'population': '',
          },
          'content': structuredEditorialFixture(),
          'media': {
            'portrait': null,
            'map': null,
            'spectrogram': null,
            'sounds': [
              file(
                'fixture:sound',
                'audio/mpeg',
                sound,
                contentId: 'normal-${'b' * 64}',
              ),
            ],
            'gallery': [
              {
                'id': 'gallery-use',
                'asset': file(image, 'image/png', pngBytes),
                'alt': 'Alttext',
                'caption': 'Bildunterschrift',
                'decorative': false,
                'order': 0,
              },
            ],
          },
        },
    ],
  };
}
