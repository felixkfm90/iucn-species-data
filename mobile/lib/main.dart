import 'dart:async';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'app.dart';
import 'app_controller.dart';
import 'audio_playback.dart';
import 'data/project_api.dart';
import 'data/token_vault.dart';
import 'data/bundled_catalog.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final directory = await getApplicationSupportDirectory();
    BundledCatalog? publicData;
    String initialError = '';
    try {
      publicData = await BundledCatalog.load();
    } catch (_) {
      initialError = 'Der mitgelieferte öffentliche Anfangsbestand konnte nicht sicher gelesen werden.';
    }
    final controller = ExplorerController(
      vault: const SecureTokenVault(),
      transport: HttpProjectTransport(),
      supportDirectory: directory,
      publicCatalog: publicData?.catalog,
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
