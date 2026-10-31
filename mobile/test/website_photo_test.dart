import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:arten_explorer/data/website_photo.dart';
import 'package:arten_explorer/domain/catalog.dart';

void main(){
  final known='https://${WebsitePhotoPolicy.host}${WebsitePhotoPolicy.pathPrefix}fixture/photo.JPG?format=1500w';
  test('genau gebundene öffentliche FN-Fotoquellen mit Rasterendung sind zulässig',(){
    expect(WebsitePhotoPolicy.checkUrl(Uri.parse(known)).host,WebsitePhotoPolicy.host);
    for(final url in [
      known.replaceFirst('https:','http:'),known.replaceFirst(WebsitePhotoPolicy.host,'example.invalid'),
      known.replaceFirst(WebsitePhotoPolicy.pathPrefix,'/content/v1/other/'),
      known.replaceFirst('.JPG','.svg'),known.replaceFirst('1500w','1500w&token=private'),
      known.replaceFirst('https://','https://user:secret@'),known.replaceFirst('?format=1500w','#fragment'),
      known.replaceFirst('fixture/','fixture/%2f../'),known.replaceFirst('.com/','.com:8443/'),
    ]){expect(()=>WebsitePhotoPolicy.checkUrl(Uri.parse(url)),throwsFormatException);}
  });
  test('alle852 vorhandenen hashfreien Galeriequellen passen ausdrücklich in die neue Ausnahme',(){
    final catalog=Catalog.fromJson(jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map<String,dynamic>);
    final photos=catalog.species.expand((entry)=>entry.media).where((entry)=>entry.kind==MediaKind.gallery).toList();
    expect(photos.length,852);expect(photos.every(WebsitePhotoPolicy.canObserve),true);
  });
  test('Fotoausnahme erweitert nicht Artbilder/Karten/Töne oder erwartete Projekt-Prüfsummen',(){
    final media=ArtMedia(id:'fixture',url:Uri.parse(known));
    for(final kind in [MediaKind.portrait,MediaKind.map,MediaKind.sound]){
      expect(WebsitePhotoPolicy.canObserve(MediaReference('art',kind,media)),false);
    }
    expect(WebsitePhotoPolicy.canObserve(MediaReference('art',MediaKind.gallery,
      ArtMedia(id:'fixture',url:Uri.parse(known),sha256:'a'*64))),false);
  });
  test('Raster-/Pixelgrenzen und Antwortsignatur verhindern HTML/SVG sowie riesige Bilder',(){
    for(final mime in ['text/html','image/svg+xml','image/gif','application/octet-stream']){
      expect(()=>WebsitePhotoPolicy.checkMime(mime),throwsFormatException);
    }
    for(final dimensions in [(0,1),(8193,1),(6000,6000)]){
      expect(()=>WebsitePhotoPolicy.checkDimensions(dimensions.$1,dimensions.$2),throwsFormatException);
    }
    expect(()=>WebsitePhotoPolicy.signature(Uint8List.fromList(utf8.encode('<svg/>'))),throwsFormatException);
  });
  test('wirklicher Rasterdecoder bestätigt kleines vollständiges PNG; Headerattrappe wird abgelehnt',()async{
    final bytes=base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaHD4DwADBAHAqetaQwAAAABJRU5ErkJggg==');
    final photo=await validateWebsiteRaster(bytes,'image/png');expect(photo.width,1);expect(photo.height,1);
    await expectLater(validateWebsiteRaster(Uint8List.fromList([137,80,78,71,13,10,26,10]),'image/png'),throwsFormatException);
    await expectLater(validateWebsiteRaster(bytes,'image/jpeg'),throwsFormatException);
  });
}
