import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:arten_explorer/domain/project_media.dart';
import 'package:crypto/crypto.dart';

class RecordingHeaders implements HttpHeaders {
  final values = <String, Object>{};
  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {
    values[name.toLowerCase()] = value;
  }
  @override
  void removeAll(String name)=>values.remove(name.toLowerCase());
  @override
  String? value(String name)=>values[name.toLowerCase()]?.toString();
  @override
  ContentType? get contentType=>values['content-type']==null ? null : ContentType.parse(values['content-type'].toString());

  @override
  set contentType(ContentType? value) {
    if (value != null) values['content-type'] = value.toString();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Response extends Stream<List<int>> implements HttpClientResponse {
  @override
  final int statusCode;
  final List<int> body;
  @override
  final RecordingHeaders headers=RecordingHeaders();
  @override
  final int contentLength;
  Response(this.statusCode, this.body,{String? mimeType,int? declaredLength}):contentLength=declaredLength ?? body.length {
    if(mimeType!=null)headers.contentType=ContentType.parse(mimeType);
  }
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(body).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Request implements HttpClientRequest {
  @override
  final RecordingHeaders headers = RecordingHeaders();
  @override
  bool followRedirects = true;
  String sentBody = '';
  final Response response;
  @override
  final cookies=<Cookie>[];
  bool aborted=false;
  Request(this.response);
  @override
  void write(Object? object) {
    sentBody += object.toString();
  }

  @override
  Future<HttpClientResponse> close() async => response;
  @override
  void abort([Object? exception,StackTrace? stackTrace]){aborted=true;}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Client implements HttpClient {
  final Response response;
  final requests = <Request>[];
  final urls=<Uri>[];
  final bool seededHeaders;
  Client(this.response,{this.seededHeaders=false});
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    final request = Request(response);
    urls.add(url);
    if(seededHeaders){request.headers.set('authorization','fixture-secret');request.headers.set('cookie','fixture-cookie');request.cookies.add(Cookie('session','fixture-cookie'));}
    requests.add(request);
    return request;
  }

  @override
  Future<HttpClientRequest> getUrl(Uri url) => openUrl('GET', url);
  @override
  void close({bool force = false}) {}
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  final projectServer = Uri.parse('https://project.invalid:55431');
  final session = ProjectSession(
    server: projectServer, projectId: 'project-fixture', token: 'fixture-bearer',
    expiresAt: DateTime.utc(2030),
    user: const ProjectIdentity(id: 'user-fixture', username: 'fixture', displayName: 'Fixture', role: 'reader'),
  );
  final imageBody = [137, 80, 78, 71];
  final imageHash = sha256.convert(imageBody).toString();
  const imageId = 'image-11111111-1111-4111-8111-111111111111';
  final image = {
    'kind': 'project-image', 'id': imageId, 'projectId': session.projectId,
    'sha256': imageHash, 'mimeType': 'image/png', 'bytes': imageBody.length, 'attribution': '',
  };
  final imageFile = ProjectMediaFile.fromJson(image);

  test('Geschützte Datei verwendet nur den angemeldeten Ursprung und den gebundenen Abrufweg', () async {
    final response = Response(200, imageBody, mimeType: 'image/png');
    response.headers.set('x-content-sha256', imageHash);
    final client = Client(response, seededHeaders: true);
    final transport = HttpProjectTransport(client: client);
    final downloaded = await ProjectApi(projectServer, transport).projectMedia(session, imageFile)
        .expand((chunk) => chunk).toList();
    expect(downloaded, imageBody);
    expect(client.urls, [projectServer.replace(path: '/api/v1/media/$imageId/content')]);
    final request = client.requests.single;
    expect(request.followRedirects, isFalse);
    expect(request.headers.value('authorization'), 'Bearer fixture-bearer');
    expect(request.headers.value('cookie'), isNull);
    expect(request.cookies, isEmpty);
    expect(request.headers.value('accept-encoding'), 'identity');
    transport.close();
  });

  test('Manipulierte Projektbytes und Weiterleitungen ergeben keine vollständige Datei', () async {
    for (final (response, expected) in <(Response, Matcher)>[
      (Response(302, []), throwsA(isA<ProjectApiException>())),
      (Response(200, [1, 2, 3, 4], mimeType: 'image/png'), throwsFormatException),
      (Response(200, imageBody, mimeType: 'text/html'), throwsFormatException),
    ]) {
      response.headers.set('x-content-sha256', imageHash);
      final client = Client(response), transport = HttpProjectTransport(client: client);
      await expectLater(ProjectApi(projectServer, transport).projectMedia(session, imageFile).toList(), expected);
      expect(client.requests.single.followRedirects, isFalse);
      transport.close();
    }
  });

  test('Projekt- und Serverwechsel sowie fremde Adressen werden vor dem Abruf abgewiesen', () {
    final client = Client(Response(200, imageBody));
    final transport = HttpProjectTransport(client: client);
    final otherFile = ProjectMediaFile.fromJson({...image, 'projectId': 'other-project'});
    expect(() => ProjectApi(projectServer, transport).projectMedia(session, otherFile), throwsFormatException);
    expect(() => ProjectApi(Uri.parse('https://other.invalid'), transport).projectMedia(session, imageFile), throwsFormatException);
    expect(() => ProjectMediaFile.fromJson({...image, 'url': 'https://other.invalid/content'}), throwsFormatException);
    expect(client.requests, isEmpty);
    transport.close();
  });

  test('Reader snapshot conflicts retain the known code and a local message', () async {
    final transport = HttpProjectTransport(client: Client(Response(409,
      utf8.encode('{"error":{"code":"reader_snapshot_changed","message":"private detail"}}'))));
    await expectLater(
      transport.json(Uri.parse('https://project.invalid/api/v2/catalog/page')),
      throwsA(isA<ProjectApiException>()
          .having((error) => error.status, 'status', 409)
          .having((error) => error.code, 'code', 'reader_snapshot_changed')
          .having((error) => error.message, 'message', contains('Bitte erneut aktualisieren'))),
    );
    transport.close();
  });

  test(
    'Echter JSON-Transport bindet Bearer ohne Weiterleitung und sendet JSON',
    () async {
      final client = Client(Response(200, utf8.encode('{"ok":true}')));
      final transport = HttpProjectTransport(client: client);
      expect(
        await transport.json(
          Uri.parse('https://project.invalid/api'),
          method: 'POST',
          bearer: 'fixture-secret',
          body: {'scope': 'read'},
        ),
        {'ok': true},
      );
      expect(client.requests.single.followRedirects, false);
      expect(
        client.requests.single.headers.values['authorization'],
        'Bearer fixture-secret',
      );
      expect(jsonDecode(client.requests.single.sentBody), {'scope': 'read'});
      transport.close();
    },
  );
  test('Echter Medien-Transport sendet keine Authorization und folgt keinem Redirect', () async {
    final client = Client(Response(200, [1, 2, 3]), seededHeaders: true);
    final transport = HttpProjectTransport(client: client);
    expect(
      await transport
          .media(Uri.parse('https://media.invalid/a.mp3'))
          .expand((chunk) => chunk)
          .toList(),
      [1, 2, 3],
    );
    expect(
      client.requests.single.headers.values.containsKey('authorization'),
      false,
    );
    expect(client.requests.single.followRedirects, false);
    expect(client.requests.single.headers.value('cookie'), isNull);
    expect(client.requests.single.cookies, isEmpty);
    transport.close();
  });
  test('HTTP- und lokale Medien scheitern vor einem Netzwerkzugriff', () async {
    final client = Client(Response(200, []));
    final transport = HttpProjectTransport(client: client);
    await expectLater(
      transport.media(Uri.parse('http://media.invalid/a')).toList(),
      throwsFormatException,
    );
    expect(client.requests, isEmpty);
    transport.close();
  });
  test(
    '401 und fehlende Mediendateien werden nicht zu erfolgreichem Inhalt',
    () async {
      final unauthorized = HttpProjectTransport(
        client: Client(Response(401, utf8.encode('{}'))),
      );
      await expectLater(
        unauthorized.json(Uri.parse('https://project.invalid/api')),
        throwsA(
          isA<ProjectApiException>().having(
            (error) => error.status,
            'status',
            401,
          ),
        ),
      );
      final missing = HttpProjectTransport(client: Client(Response(404, [])));
      await expectLater(
        missing.media(Uri.parse('https://media.invalid/a')).toList(),
        throwsA(isA<ProjectApiException>()),
      );
      unauthorized.close();
      missing.close();
    },
  );
  test('Websitefoto-Transport lädt genau bekannte Quelle ohne Token/Cookie und ohne Redirect',()async{
    final client=Client(Response(200,[137,80,78,71],mimeType:'image/png'),seededHeaders:true),transport=HttpProjectTransport(client:client);
    final uri=Uri.parse('https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/image.png?format=1500w');
    final response=await transport.websitePhoto(uri);
    expect(response.sourceUrl,uri);expect(response.mimeType,'image/png');expect(response.contentLength,4);
    expect(await response.body.expand((chunk)=>chunk).toList(),[137,80,78,71]);
    expect(client.urls,[uri]);expect(client.requests.single.followRedirects,false);
    expect(client.requests.single.headers.values.containsKey('authorization'),false);
    expect(client.requests.single.headers.values.containsKey('cookie'),false);expect(client.requests.single.cookies,isEmpty);
    expect(client.requests.single.aborted,true);transport.close();
  });
  test('Galerie-Redirect, HTML, Kompression und zu große/abweichende Antwort werden begrenzt abgelehnt',()async{
    final uri=Uri.parse('https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/image.png');
    for(final response in [Response(302,[]),Response(200,[1],mimeType:'text/html'),
      Response(200,[1],mimeType:'image/png',declaredLength:WebsitePhotoPolicy.maximumBytes+1)]){
      final client=Client(response),transport=HttpProjectTransport(client:client);
      await expectLater(transport.websitePhoto(uri),response.statusCode==302
        ? throwsA(isA<ProjectApiException>().having((error)=>error.status,'status',302)) : throwsFormatException);
      expect(client.requests.length,1);expect(client.requests.single.followRedirects,false);expect(client.requests.single.aborted,true);transport.close();
    }
    final encoded=Response(200,[1],mimeType:'image/png');encoded.headers.set('content-encoding','gzip');
    final gzip=HttpProjectTransport(client:Client(encoded));await expectLater(gzip.websitePhoto(uri),throwsFormatException);gzip.close();
    final short=HttpProjectTransport(client:Client(Response(200,[1],mimeType:'image/png',declaredLength:2)));
    final answer=await short.websitePhoto(uri);await expectLater(answer.body.toList(),throwsFormatException);short.close();
  });
  test('fremde Galerieziele werden vor getUrl abgelehnt',()async{
    final client=Client(Response(200,[])),transport=HttpProjectTransport(client:client);
    await expectLater(transport.websitePhoto(Uri.parse('https://other.invalid/image.png')),throwsFormatException);expect(client.requests,isEmpty);transport.close();
  });
  test('Abwahl vor Streamstart gibt ausschließlich den eigenen Fotoabruf und dessen Timer frei',()async{
    final client=Client(Response(200,[137,80,78,71],mimeType:'image/png')),transport=HttpProjectTransport(client:client);
    final response=await transport.websitePhoto(Uri.parse('https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/image.png'));
    response.close();expect(client.requests.single.aborted,true);transport.close();
  });
}
