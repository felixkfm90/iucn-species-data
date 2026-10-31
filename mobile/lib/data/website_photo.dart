import 'dart:typed_data';
import 'dart:ui' as ui;

import '../domain/catalog.dart';

/// Only the already exported public FN gallery is eligible for an observed copy.
/// This does not grant arbitrary catalog URLs a hashless-download exception.
class WebsitePhotoPolicy {
  static const host = 'images.squarespace-cdn.com';
  static const pathPrefix = '/content/v1/67556be0338df718ea064210/';
  static const maximumBytes = 32 * 1024 * 1024;
  static const maximumDimension = 8192;
  static const maximumPixels = 24 * 1024 * 1024;
  static const mimeExtensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  static Uri checkUrl(Uri uri) {
    httpsUri(uri.toString(), 'Öffentliches Websitefoto');
    final query = uri.queryParametersAll;
    if (uri.host.toLowerCase() != host ||
        uri.port != 443 ||
        !uri.path.startsWith(pathPrefix) ||
        uri.pathSegments.any((part) => part == '.' || part == '..' || part.contains('/') || part.contains('\\')) ||
        !RegExp(r'\.(jpg|jpeg|png|webp)$', caseSensitive: false)
            .hasMatch(uri.path) ||
        query.keys.any((key) => key != 'format') ||
        query.values.any((values) => values.length != 1) ||
        query['format'] != null &&
            !RegExp(r'^[0-9]{2,4}w$').hasMatch(query['format']!.single)) {
      throw const FormatException(
        'Dieses Foto gehört nicht zu den bekannten öffentlichen FN-Galeriequellen.',
      );
    }
    return uri;
  }

  static bool canObserve(MediaReference reference) {
    if (reference.kind != MediaKind.gallery || reference.media.sha256 != null) {
      return false;
    }
    if(reference.media.bytes!=null && (reference.media.bytes!<=0 || reference.media.bytes!>maximumBytes))return false;
    try {
      checkUrl(reference.media.url);
      return true;
    } on FormatException {
      return false;
    }
  }

  static String checkMime(String? value) {
    final type = value?.toLowerCase().split(';').first.trim();
    if (!mimeExtensions.containsKey(type)) {
      throw const FormatException(
        'Das Websitefoto ist kein unterstütztes JPEG-, PNG- oder WebP-Bild.',
      );
    }
    return type!;
  }

  static void checkDimensions(int width, int height) {
    if (width <= 0 || height <= 0 ||
        width > maximumDimension || height > maximumDimension ||
        width * height > maximumPixels) {
      throw const FormatException('Das Websitefoto überschreitet die erlaubten Bildabmessungen.');
    }
  }

  static String signature(Uint8List bytes) {
    if (bytes.length >= 8 &&
        bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 &&
        bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) {
      return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255) {
      return 'image/jpeg';
    }
    if (bytes.length >= 12 &&
        String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
        String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
      return 'image/webp';
    }
    throw const FormatException('Die Websiteantwort enthält keine unterstützte Rasterbilddatei.');
  }
}

class RasterPhoto {
  final String mimeType;
  final int width, height;
  const RasterPhoto(this.mimeType, this.width, this.height);
}

/// Decode only a bounded static raster; do not silently store HTML, SVG or broken bytes.
Future<RasterPhoto> validateWebsiteRaster(Uint8List bytes, String mimeType) async {
  final type = WebsitePhotoPolicy.checkMime(mimeType);
  if (bytes.isEmpty || bytes.length > WebsitePhotoPolicy.maximumBytes ||
      WebsitePhotoPolicy.signature(bytes) != type) {
    throw const FormatException('Die Bilddatei passt nicht zur bestätigten Websiteantwort.');
  }
  ui.ImmutableBuffer? buffer;
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  try {
    buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    descriptor = await ui.ImageDescriptor.encoded(buffer);
    final width = descriptor.width, height = descriptor.height;
    WebsitePhotoPolicy.checkDimensions(width, height);
    final largest = width > height ? width : height;
    final scale = largest > 2048 ? 2048 / largest : 1.0;
    codec = await descriptor.instantiateCodec(
      targetWidth: (width * scale).round().clamp(1, 2048).toInt(),
      targetHeight: (height * scale).round().clamp(1, 2048).toInt(),
    );
    if (codec.frameCount != 1) {
      throw const FormatException('Für Offlinegalerien werden einzelne unbewegte Fotos benötigt.');
    }
    final frame = await codec.getNextFrame();
    frame.image.dispose();
    return RasterPhoto(type, width, height);
  } on FormatException {
    rethrow;
  } catch (_) {
    throw const FormatException('Das Websitefoto konnte nicht als vollständiges Bild gelesen werden.');
  } finally {
    codec?.dispose();
    descriptor?.dispose();
    buffer?.dispose();
  }
}

class WebsitePhotoResponse {
  final Uri sourceUrl;
  final String mimeType;
  final int? contentLength;
  final Stream<List<int>> body;
  final void Function()? onClose;
  const WebsitePhotoResponse({
    required this.sourceUrl,
    required this.mimeType,
    required this.contentLength,
    required this.body,
    this.onClose,
  });
  void close()=>onClose?.call();
}

abstract interface class WebsitePhotoTransport {
  Future<WebsitePhotoResponse> websitePhoto(Uri uri);
}
