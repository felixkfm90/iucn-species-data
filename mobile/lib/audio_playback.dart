import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:just_audio/just_audio.dart';

import 'domain/catalog.dart';

class AudioPlayback extends ChangeNotifier with WidgetsBindingObserver {
  AudioPlayer? _player;
  StreamSubscription<PlayerState>? _stateSubscription;
  StreamSubscription<PlayerException>? _errorSubscription;
  String? activeKey;
  String error = '';
  bool loading = false, _disposed = false;
  bool _foreground = true;
  int _operation = 0;
  AudioPlayback() {
    WidgetsBinding.instance.addObserver(this);
  }
  bool get playing => _player?.playing == true;
  bool get completed => _player?.processingState == ProcessingState.completed;
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  AudioPlayer _getPlayer() {
    if (_player != null) return _player!;
    final player = _player = AudioPlayer(useProxyForRequestHeaders: false);
    _stateSubscription = player.playerStateStream.listen((_) => _changed());
    _errorSubscription = player.errorStream.listen((_) {
      error = 'Ton nicht verfügbar. Verbindung oder Offlinepaket prüfen.';
      loading = false;
      _changed();
    });
    return player;
  }

  Future<void> toggle(String key, ArtMedia media, File? offlineFile) async {
    if (loading) return;
    final operation = ++_operation;
    error = '';
    loading = true;
    _changed();
    try {
      final player = _getPlayer();
      if (activeKey == key && playing && !completed) {
        await player.pause();
        return;
      }
      if (activeKey != key) {
        await player.stop();
        if (offlineFile != null && await offlineFile.exists()) {
          await player.setFilePath(offlineFile.path);
        } else {
          await player.setUrl(media.url.toString());
        }
        if (operation != _operation || _disposed || !_foreground) return;
        activeKey = key;
      }
      if (completed) await player.seek(Duration.zero);
      unawaited(
        player.play().catchError((Object _) {
          if (operation == _operation) {
            error = 'Die Wiedergabe wurde unterbrochen.';
            _changed();
          }
        }),
      );
    } catch (_) {
      if (operation == _operation) {
        activeKey = null;
        error = 'Ton nicht verfügbar. Verbindung oder Offlinepaket prüfen.';
      }
    } finally {
      if (operation == _operation) {
        loading = false;
        _changed();
      }
    }
  }

  Future<void> stop() async {
    ++_operation;
    loading = false;
    await _player?.stop();
    activeKey = null;
    _changed();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) {
      ++_operation;
      loading = false;
      unawaited(_player?.pause() ?? Future<void>.value());
    }
  }

  @override
  void dispose() {
    _disposed = true;
    ++_operation;
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_stateSubscription?.cancel() ?? Future<void>.value());
    unawaited(_errorSubscription?.cancel() ?? Future<void>.value());
    unawaited(_player?.dispose() ?? Future<void>.value());
    super.dispose();
  }
}
