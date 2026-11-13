import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import 'app.dart';
import 'app_controller.dart';
import 'audio_playback.dart';
import 'data/project_api.dart';
import 'data/public_catalog.dart';
import 'data/token_vault.dart';
import 'data/bundled_catalog.dart';
import 'data/offline_jobs.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(const [
      'ZXing',
      'ZXing Android Embedded',
    ], await rootBundle.loadString('assets/licenses/zxing.txt'));
  });
  try {
    final directory = await getApplicationSupportDirectory();
    BundledCatalog? publicData;
    String initialError = '';
    try {
      publicData = await BundledCatalog.load();
    } catch (_) {
      initialError = 'Der mitgelieferte öffentliche Anfangsbestand konnte nicht sicher gelesen werden.';
    }
    final transport = HttpProjectTransport();
    final controller = ExplorerController(
      vault: const SecureTokenVault(),
      transport: transport,
      supportDirectory: directory,
      publicCatalog: publicData?.catalog,
      publicCatalogSource: PublicCatalogSource(transport),
      bundledPhotoSizes: publicData?.photoSizes ?? const {},
      downloads: Platform.isAndroid ? const AndroidOfflineDownloads() : null,
    );
    controller.error = initialError;
    runApp(ExplorerApp(controller: controller, audio: AudioPlayback()));
    unawaited(controller.restore());
  } catch (_) {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: SafeArea(
            child: Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Der geschützte App-Speicher ist nicht verfügbar. Bitte die App erneut öffnen.',
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
