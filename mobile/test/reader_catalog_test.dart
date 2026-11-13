import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/art_editorial.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support.dart';

final server = Uri.parse('https://project.example.org:55431');
final snapshot = List.filled(64, 'a').join();
final session = ProjectSession(
  server: server,
  projectId: 'fixture-project',
  token: 'synthetic-reader-token',
  expiresAt: DateTime.utc(2030),
  user: const ProjectIdentity(
    id: 'fixture-user',
    username: 'fixture',
    displayName: 'Fixture',
    role: 'reader',
  ),
);

Map<String, dynamic> page({
  List<String> ids = const [],
  String? cursor,
  int count = 2,
  bool checked = false,
  String project = 'fixture-project',
  String revision = '12',
  String? marker,
  Map<String, dynamic>? editorial,
}) => {
  'schemaVersion': 2,
  'projectId': project,
  'revision': revision,
  'generatedAt': '2026-11-09T12:00:00.000Z',
  'snapshot': marker ?? snapshot,
  'totalCount': count,
  'species': [
    for (final id in ids)
      {
        'id': id,
        'content': editorial ?? {'kind': 'legacy-sections', 'sections': []},
      },
  ],
  'nextCursor': cursor,
  'complete': cursor == null,
  'checked': checked,
};

class ReaderTransport implements ProjectTransport {
  final List<Object> responses;
  final requests = <({Uri uri, String method, String? bearer})>[];

  ReaderTransport(this.responses);

  @override
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  }) async {
    final index = requests.length;
    requests.add((uri: uri, method: method, bearer: bearer));
    final value = responses[index];
    if (value is ProjectApiException) throw value;
    return value as Map<String, dynamic>;
  }

  @override
  Stream<List<int>> media(Uri uri) => throw StateError('Unexpected media');

  @override
  void close() {}
}

void main() {
  test('Reader 2 completes two pages and checks that exact snapshot', () async {
    final transport = ReaderTransport([
      page(ids: ['a'], cursor: 'next-A'),
      page(ids: ['b']),
      page(checked: true),
    ]);
    final result = await ProjectApi(server, transport).readerCatalog(session);
    expect(result.projectId, session.projectId);
    expect(result.revision, '12');
    expect(result.species.map((value) => value['id']), ['a', 'b']);
    expect(result.species.last['content'], {
      'kind': 'legacy-sections',
      'sections': [],
    });
    expect(transport.requests.map((call) => call.uri.path).toSet(), {
      '/api/v2/catalog/page',
    });
    expect(transport.requests.map((call) => call.uri.queryParameters), [
      <String, String>{},
      {'snapshot': snapshot, 'cursor': 'next-A'},
      {'snapshot': snapshot, 'check': '1'},
    ]);
    expect(
      transport.requests.every(
        (call) =>
            call.uri.origin == server.origin &&
            call.method == 'GET' &&
            call.bearer == session.token,
      ),
      isTrue,
    );
  });

  test('an empty catalog still needs the closing check', () async {
    final transport = ReaderTransport([
      page(count: 0),
      page(count: 0, checked: true),
    ]);
    final result = await ProjectApi(server, transport).readerCatalog(session);
    expect(result.species, isEmpty);
    expect(transport.requests, hasLength(2));
  });

  test('structured content keeps the heading, list order and empty decision through the full cache', () async {
    final raw = structuredEditorialFixture();
    final transport = ReaderTransport([
      page(ids: ['test-art'], count: 1, editorial: raw),
      page(count: 1, checked: true),
    ]);
    final result = await ProjectApi(server, transport).readerCatalog(session);
    final editorial = result.editorialById['test-art']!;
    expect(editorial.toJson(), raw);
    expect(editorial.sections[1].blocks.first, isA<ArtHeading>());
    expect(editorial.sections[2].intentionallyEmpty, isTrue);
    final catalog = catalogFixture(media: false);
    final species = (catalog['species'] as List).first as Map<String, dynamic>;
    species['editorial'] = editorial.toJson();
    final parsed = Catalog.fromJson(catalog);
    expect(
      Catalog.fromJson(parsed.toJson()).species.first.editorial?.toJson(),
      raw,
    );
    expect(
      Catalog.fromJson(parsed.toJson(includeDetails: false))
          .species
          .first
          .editorial,
      isNull,
    );
  });

  test('a deliberately empty section with real text stops the catalog before confirmation', () async {
    final raw = structuredEditorialFixture();
    (raw['sections'] as List)[1]['intentionallyEmpty'] = true;
    final transport = ReaderTransport([
      page(ids: ['test-art'], count: 1, editorial: raw),
    ]);
    await expectLater(
      ProjectApi(server, transport).readerCatalog(session),
      throwsFormatException,
    );
    expect(transport.requests, hasLength(1));
  });

  final faults = <String, List<Object>>{
    'foreign project': [
      page(project: 'other', ids: ['a', 'b']),
    ],
    'truncated completion': [
      page(ids: ['a']),
    ],
    'too many species': [
      page(ids: ['a', 'b'], count: 1),
    ],
    'changed marker': [
      page(ids: ['a'], cursor: 'next'),
      page(ids: ['b'], marker: List.filled(64, 'b').join()),
    ],
    'changed revision': [
      page(ids: ['a'], cursor: 'next'),
      page(ids: ['b'], revision: '13'),
    ],
    'changed count': [
      page(ids: ['a'], cursor: 'next'),
      page(ids: ['b'], count: 3),
    ],
    'duplicate species': [
      page(ids: ['a'], cursor: 'next'),
      page(ids: ['a']),
    ],
    'unsorted species': [
      page(ids: ['b', 'a']),
    ],
    'repeated cursor': [
      page(ids: ['a'], cursor: 'next', count: 3),
      page(ids: ['b'], cursor: 'next', count: 3),
    ],
    'unsafe cursor': [
      page(ids: ['a'], cursor: 'https://other.example/'),
    ],
    'unsolicited check': [page(checked: true)],
    'bad closing check': [
      page(ids: ['a', 'b']),
      page(checked: true, revision: '13'),
    ],
  };
  for (final fault in faults.entries) {
    test('Reader 2 rejects ${fault.key} without returning a catalog', () async {
      final transport = ReaderTransport(fault.value);
      await expectLater(
        ProjectApi(server, transport).readerCatalog(session),
        throwsFormatException,
      );
      expect(transport.requests, hasLength(fault.value.length));
    });
  }

  test(
    'an HTTP conflict on the last check propagates without fallback',
    () async {
      const conflict = ProjectApiException(
        409,
        'Fixture',
        code: 'reader_snapshot_changed',
      );
      final transport = ReaderTransport([
        page(ids: ['a', 'b']),
        conflict,
      ]);
      await expectLater(
        ProjectApi(server, transport).readerCatalog(session),
        throwsA(same(conflict)),
      );
      expect(transport.requests, hasLength(2));
    },
  );

  test('an API for another server cannot send the existing session', () async {
    final transport = ReaderTransport([]);
    final other = ProjectApi(
      Uri.parse('https://other.example.org:55431'),
      transport,
    );
    await expectLater(other.readerCatalog(session), throwsFormatException);
    await expectLater(other.catalog(session), throwsFormatException);
    await expectLater(other.refresh(session), throwsFormatException);
    await expectLater(other.logout(session), throwsFormatException);
    expect(transport.requests, isEmpty);
  });
}
