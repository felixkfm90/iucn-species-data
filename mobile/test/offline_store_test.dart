import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/data/offline_store.dart';
import 'package:arten_explorer/data/project_api.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:crypto/crypto.dart' as crypto;

import 'support.dart';

class _TransportWithoutPhotos implements ProjectTransport {
  @override
  Future<Map<String, dynamic>> json(
    Uri uri, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? bearer,
  }) => throw StateError('This fixture must not request project data.');
  @override
  Stream<List<int>> media(Uri uri) => throw StateError(
    'This fixture must not fall back to an unchecked photo stream.',
  );
  @override
  void close() {}
}

void main() {
  late Directory directory;
  late FakeTransport transport;
  late OfflineStore store;
  final catalog = Catalog.fromJson(catalogFixture());
  const selection = OfflineSelection.withoutWebsitePhotos();
  Future<OfflineSnapshot> download({
    Catalog? input,
    OfflineSelection chosen = selection,
    bool Function()? cancelled,
  }) => store.download(
    input ?? catalog,
    chosen,
    onProgress: (_) {},
    cancelled: cancelled ?? () => false,
  );
  setUp(() async {
    directory = await testDirectory();
    transport = FakeTransport();
    store = OfflineStore(directory, transport);
  });
  tearDown(() => removeTestDirectory(directory));
  test('Paket wird vollständig gehasht und nach Wiederöffnung kataloggebunden gelesen', () async {
    final progress = <OfflineProgress>[];
    final snapshot = await store.download(
      catalog,
      selection,
      onProgress: progress.add,
      cancelled: () => false,
    );
    expect(snapshot.healthy, true);
    expect(snapshot.verifiedFiles.length, 3);
    expect(progress.last.completeFiles, 3);
    expect(progress.last.totalFiles, 3);
    final reopened = await OfflineStore(
      directory,
      FakeTransport(),
    ).readPackage();
    expect(reopened!.catalog.revision, catalog.revision);
    expect(reopened.selection.gallery, false);
    expect(
      reopened.catalog.species.first.sections.first.text,
      'Ausschließlich synthetischer Testtext.',
    );
    expect(await store.occupiedBytes(), greaterThan(0));
  });
  test(
    'Geprüfte gleiche Inhalte werden wiederverwendet statt erneut geladen',
    () async {
      await download();
      final calls = transport.mediaRequests.length;
      await download();
      expect(transport.mediaRequests.length, calls);
    },
  );
  test(
    'Neue Revision mit kaputtem Hash ersetzt das vorige Paket nicht',
    () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      final input = catalogFixture(revision: 'fixture-2');
      input['species'][0]['media']['portrait']['sha256'] = 'a' * 64;
      await expectLater(
        download(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
      expect((await store.readPackage())!.healthy, true);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    },
  );
  test('Netzfehler erhält vorherigen Katalog und Dateien', () async {
    await download();
    final before = await File('${directory.path}/package.json').readAsBytes();
    final input = catalogFixture(revision: 'fixture-2');
    input['species'][0]['media']['portrait']['sha256'] = 'b' * 64;
    transport.onMedia = (_) =>
        Stream.error(const SocketException('synthetic offline'));
    await expectLater(
      download(input: Catalog.fromJson(input)),
      throwsA(isA<SocketException>()),
    );
    expect(await File('${directory.path}/package.json').readAsBytes(), before);
  });
  test(
    'Abbruch lässt keinen vollständigen neuen Paketstand entstehen',
    () async {
      await download();
      final before = await File('${directory.path}/package.json').readAsBytes();
      await expectLater(
        download(cancelled: () => true),
        throwsA(isA<DownloadCancelled>()),
      );
      expect(
        await File('${directory.path}/package.json').readAsBytes(),
        before,
      );
    },
  );
  test(
    'Abbruch während eines Streams räumt nur die eigene Teildatei auf',
    () async {
      var cancelled = false;
      transport.onMedia = (_) async* {
        yield pngBytes.sublist(0, 10);
        cancelled = true;
        yield pngBytes.sublist(10);
      };
      await expectLater(
        download(cancelled: () => cancelled),
        throwsA(isA<DownloadCancelled>()),
      );
      expect(await File('${directory.path}/package.json').exists(), false);
      expect(
        await directory
            .list()
            .where((entry) => entry.path.endsWith('.partial'))
            .length,
        0,
      );
    },
  );
  for (final length in [1, pngBytes.length + 1]) {
    test('Angekündigte Dateigröße $length muss exakt stimmen', () async {
      final input = catalogFixture();
      input['species'][0]['media']['portrait']['bytes'] = length;
      await expectLater(
        download(input: Catalog.fromJson(input)),
        throwsFormatException,
      );
      expect(await File('${directory.path}/package.json').exists(), false);
    });
  }
  test('Fehlende Prüfsumme verhindert Download vor dem ersten Abruf', () async {
    final input = catalogFixture();
    input['species'][0]['media']['portrait'].remove('sha256');
    await expectLater(
      download(input: Catalog.fromJson(input)),
      throwsFormatException,
    );
    expect(transport.mediaRequests, isEmpty);
  });
  test(
    'Nachträgliche Beschädigung bleibt bei Wiederöffnung sichtbar',
    () async {
      final snapshot = await download();
      await snapshot.verifiedFiles.values.first.writeAsString('broken');
      final reopened = await store.readPackage();
      expect(reopened!.healthy, false);
      expect(reopened.missingFiles, isNotEmpty);
      expect(reopened.catalog.species.first.sections, isNotEmpty);
    },
  );
  test('Fehlende Datei wird niemals als offline verfügbar bestätigt', () async {
    final snapshot = await download();
    await snapshot.verifiedFiles.values.first.delete();
    final reopened = await store.readPackage();
    expect(reopened!.healthy, false);
    expect(reopened.missingFiles, isNotEmpty);
  });
  test('Abwahl der Fachtexte wird nach Wiederöffnung erhalten', () async {
    await download(chosen: const OfflineSelection(texts: false, maps: true));
    final reopened = await store.readPackage();
    expect(reopened!.selection.texts, false);
    expect(reopened.catalog.species.first.sections, isEmpty);
    expect(reopened.catalog.species.first.taxonomy, isEmpty);
  });
  test('Basiskatalog bleibt getrennt vom vollständigen Offlinepaket', () async {
    await store.saveIndex(catalog);
    expect((await store.readIndex())!.species.first.sections, isEmpty);
    expect(await store.readPackage(), isNull);
  });
  test(
    'Paketentfernung behält Artenliste und unbekannte lokale Datei',
    () async {
      await store.saveIndex(catalog);
      await download();
      final unrelated = File('${directory.path}/media/diagnose.txt');
      await unrelated.writeAsString('keep');
      await store.removePackage();
      expect(await store.readPackage(), isNull);
      expect(await store.readIndex(), isNotNull);
      expect(await unrelated.readAsString(), 'keep');
    },
  );
  test('Gleichzeitiger Paketauftrag wird nicht doppelt gestartet', () async {
    final gate = Completer<void>();
    transport.onMedia = (_) async* {
      await gate.future;
      yield pngBytes;
    };
    final first = download();
    await Future<void>.delayed(Duration.zero);
    await expectLater(download(), throwsStateError);
    gate.complete();
    await first;
  });
  test('Privater Cache wird nach Projektursprung und Person getrennt', () {
    final server = Uri.parse('https://one.invalid');
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(OfflineStore.projectKey(server, 'b', projectId: 'one')),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(
        OfflineStore.projectKey(
          Uri.parse('https://two.invalid'),
          'a',
          projectId: 'one',
        ),
      ),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      isNot(OfflineStore.projectKey(server, 'a', projectId: 'two')),
    );
    expect(
      OfflineStore.projectKey(server, 'a', projectId: 'one'),
      OfflineStore.projectKey(
        Uri.parse('https://ONE.invalid:443/'),
        'a',
        projectId: 'one',
      ),
    );
  });
  group('beobachtete öffentliche Galeriefassungen',(){
    const galleryOnly=OfflineSelection(texts:true,gallery:true);
    OfflineStore photoStore()=>OfflineStore(directory,transport,photoValidator:(bytes,mime)async=>RasterPhoto(mime,1,1));
    Future<OfflineSnapshot> observed({Catalog? input,bool Function()? cancelled})=>photoStore().download(
      input ?? Catalog.fromJson(observedCatalogFixture()),galleryOnly,onProgress:(_){},cancelled:cancelled ?? ()=>false);
    test('hashlose bekannte Galerie lädt getrennte Beobachtungsbelege und lässt den Katalog unverändert',()async{
      final input=Catalog.fromJson(observedCatalogFixture()),before=input.encode();
      final snapshot=await observed(input:input);
      expect(input.encode(),before);expect(input.species.first.gallery.first.sha256,isNull);
      expect(snapshot.observedPhotoCount,2);expect(snapshot.healthy,true);expect(transport.photoRequests.length,2);
      expect(transport.mediaRequests,isEmpty);
      final manifest=jsonDecode(await File('${directory.path}/package.json').readAsString());
      expect(manifest['schemaVersion'],2);expect(manifest['catalog']['species'][0]['media']['gallery'][0]['sha256'],isNull);
      for(final binding in snapshot.bindings.values){
        expect(binding.provenance,'observed-public-website');expect(binding.sha256,crypto.sha256.convert(pngBytes).toString());
        expect(binding.bytes,pngBytes.length);expect(binding.observedAt,isNotNull);expect(binding.mimeType,'image/png');
        expect(binding.width,1);expect(binding.height,1);
      }
      final reopened=await photoStore().readPackage();expect(reopened!.healthy,true);expect(reopened.observedPhotoCount,2);
      final reference=reopened.catalog.species.first.media.firstWhere((entry)=>entry.kind==MediaKind.gallery);
      expect(await photoStore().verifiedImage(reopened,reference),pngBytes);
    });
    test('erneutes Laden beobachtet selbst gleiche URLs neu statt alten Websiteinhalt als aktuell auszugeben',()async{
      await observed();expect(transport.photoRequests.length,2);await observed();expect(transport.photoRequests.length,4);
    });
    test('Alles ohne Websitefotos ruft keine Galeriequelle ab und behält seine bisherigen Defaults',()async{
      final snapshot=await download(input:Catalog.fromJson(observedCatalogFixture()));
      expect(snapshot.observedPhotoCount,0);expect(snapshot.selection.gallery,false);expect(transport.photoRequests,isEmpty);
      expect(const OfflineSelection().gallery,false);
    });
    test('fehlender Hash außerhalb Galerie oder fremder Galeriehost bleibt vor Abruf gesperrt',()async{
      final input=observedCatalogFixture();input['species'][0]['media']['gallery'][0]['url']='https://other.invalid/photo.jpg';
      await expectLater(observed(input:Catalog.fromJson(input)),throwsFormatException);expect(transport.photoRequests,isEmpty);
    });
    test('fehlender sicherer Fototransport erhält das vorhandene Offlinepaket ohne allgemeinen Medienrückfall', () async {
      await download();
      final package = File('${directory.path}/package.json');
      final before = await package.readAsBytes();
      final legacy = OfflineStore(directory, _TransportWithoutPhotos());
      await expectLater(
        legacy.download(
          Catalog.fromJson(observedCatalogFixture()), galleryOnly,
          onProgress: (_) {}, cancelled: () => false,
        ),
        throwsFormatException,
      );
      expect(await package.readAsBytes(), before);
      expect(await directory.list().where((entry) => entry.path.endsWith('.partial')).length, 0);
    });
    test('neue Websiteantwort darf Größe ändern, aber nicht einen mitgelieferten erwarteten Hash ersetzen',()async{
      final input=observedCatalogFixture();input['species'][0]['media']['gallery'][0]['sha256']='a'*64;
      await expectLater(observed(input:Catalog.fromJson(input)),throwsFormatException);
      expect(await File('${directory.path}/package.json').exists(),false);
    });
    test('HTML-/SVG-Antwort, MIME-Widerspruch und falsche Länge ersetzen kein vorhandenes Paket',()async{
      await download();final before=await File('${directory.path}/package.json').readAsBytes();
      for(final mode in ['html','mime','length','empty','large']){
        transport.onPhoto=(uri)async=>WebsitePhotoResponse(sourceUrl:uri,
          mimeType:mode=='html'?'text/html':mode=='mime'?'image/jpeg':'image/png',
          contentLength:mode=='length'?1:mode=='empty'?0:mode=='large'?WebsitePhotoPolicy.maximumBytes+1:pngBytes.length,
          body:Stream<List<int>>.value(mode=='html'?utf8.encode('<svg onload="x"/>'):pngBytes));
        await expectLater(observed(),throwsFormatException);
        expect(await File('${directory.path}/package.json').readAsBytes(),before);
      }
    });
    test('auch ohne Größenankündigung stoppt die tatsächliche Byteobergrenze vor dem Paketabschluss',()async{
      transport.onPhoto=(uri)async=>WebsitePhotoResponse(sourceUrl:uri,mimeType:'image/png',contentLength:null,
        body:Stream<List<int>>.value(Uint8List(WebsitePhotoPolicy.maximumBytes+1)));
      await expectLater(observed(),throwsFormatException);expect(await File('${directory.path}/package.json').exists(),false);
      expect(await directory.list().where((entry)=>entry.path.endsWith('.partial')).length,0);
    });
    test('Abbruch und Verbindungsfehler erhalten den vorigen Abschluss und entfernen Teildateien',()async{
      await download();final before=await File('${directory.path}/package.json').readAsBytes();var cancel=false;
      transport.onPhoto=(uri)async=>WebsitePhotoResponse(sourceUrl:uri,mimeType:'image/png',contentLength:null,body:(()async*{
        yield pngBytes.sublist(0,10);cancel=true;yield pngBytes.sublist(10);
      })());
      await expectLater(observed(cancelled:()=>cancel),throwsA(isA<DownloadCancelled>()));
      expect(await File('${directory.path}/package.json').readAsBytes(),before);
      expect(await directory.list().where((entry)=>entry.path.endsWith('.partial')).length,0);
      transport.onPhoto=(uri)async=>throw const SocketException('synthetic offline');
      await expectLater(observed(),throwsA(isA<SocketException>()));expect(await File('${directory.path}/package.json').readAsBytes(),before);
    });
    test('Manipulation nach Wiederöffnung wird bei tatsächlicher Wiedergabe erneut erkannt',()async{
      final snapshot=await observed(),reference=snapshot.catalog.species.first.media.firstWhere((entry)=>entry.kind==MediaKind.gallery);
      final file=snapshot.verifiedFiles[reference.key]!;await file.writeAsBytes(List<int>.filled(pngBytes.length,0));
      await expectLater(photoStore().verifiedImage(snapshot,reference),throwsFormatException);
      expect((await photoStore().readPackage())!.healthy,false);
    });
    test('URL-/Belegherkunft in Manifest kann nicht als andere Galerie oder Projektprüfsumme umgedeutet werden',()async{
      await observed();final file=File('${directory.path}/package.json'),original=await file.readAsString();
      final changed=jsonDecode(original);final key=(changed['files'] as Map).keys.first;changed['files'][key]['sourceUrl']='https://example.invalid/x.png';
      await file.writeAsString(jsonEncode(changed));await expectLater(photoStore().readPackage(),throwsFormatException);
      final wrongKind=jsonDecode(original);wrongKind['files'][key]['provenance']='catalog-sha256';
      await file.writeAsString(jsonEncode(wrongKind));await expectLater(photoStore().readPackage(),throwsFormatException);
    });
  });
  test('bestehendes V1-Paket bleibt mit seinen erwarteten Kataloghashes lesbar',()async{
    await download();final file=File('${directory.path}/package.json');final value=jsonDecode(await file.readAsString());
    value['schemaVersion']=1;value.remove('files');await file.writeAsString(jsonEncode(value));
    final reopened=await store.readPackage();expect(reopened!.healthy,true);expect(reopened.observedPhotoCount,0);
    expect(reopened.verifiedFiles.length,3);
  });
}
