import 'dart:async';
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:just_audio/just_audio.dart';

import 'domain/catalog.dart';

class AudioPlayback extends ChangeNotifier with WidgetsBindingObserver {
  static const _playbackChannel = MethodChannel(
    'de.fnwildlifetravel.arten_explorer/audio',
  );
  final AudioPlayer Function()? createPlayer;
  final Future<bool> Function(bool)? setAudioActive;
  final Future<void> Function(int?)? setPlaybackBoost;
  AudioPlayer? _player;
  File? _preparedAudio;
  AudioSession? _session;
  StreamSubscription<PlayerState>? _stateSubscription;
  StreamSubscription<PlayerException>? _errorSubscription;
  StreamSubscription<int?>? _audioSessionIdSubscription;
  String? activeKey;
  String error = '';
  bool loading = false, _disposed = false;
  bool _foreground = true;
  Future<void> _focusTransition = Future.value();
  int? _focusOwner;
  int _operation = 0;
  AudioPlayback({
    this.createPlayer,
    this.setAudioActive,
    this.setPlaybackBoost,
  }) {
    WidgetsBinding.instance.addObserver(this);
  }
  bool get playing => _player?.playing == true;
  bool get completed => _player?.processingState == ProcessingState.completed;
  Duration get position => _player?.position ?? Duration.zero;
  Duration? get duration => _player?.duration;
  Stream<Duration> get positions =>
      _player?.positionStream ?? const Stream.empty();
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  AudioPlayer _getPlayer() {
    if (_player != null) return _player!;
    final player = _player =
        createPlayer?.call() ??
        AudioPlayer(
          useProxyForRequestHeaders: false,
          handleAudioSessionActivation: false,
        );
    _stateSubscription = player.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        unawaited(_release());
      }
      _changed();
    });
    _errorSubscription = player.errorStream.listen((_) {
      error = 'Ton nicht verfügbar. Verbindung oder Offlinepaket prüfen.';
      loading = false;
      unawaited(_release());
      _changed();
    });
    if (Platform.isAndroid || setPlaybackBoost != null) {
      _audioSessionIdSubscription = player.androidAudioSessionIdStream
          .distinct()
          .listen((id) {
            if (!_disposed) unawaited(_applyPlaybackBoost(id));
          });
    }
    return player;
  }

  Future<void> _applyPlaybackBoost(int? sessionId) async {
    try {
      if (setPlaybackBoost case final override?) {
        await override(sessionId);
      } else {
        await _playbackChannel.invokeMethod<void>('boost', sessionId);
      }
    } catch (_) {
      // Devices without the effect retain the ordinary audio path.
    }
  }

  Future<bool> _setFocus(bool active) async {
    if (setAudioActive case final override?) return override(active);
    final session = _session ??= await AudioSession.instance;
    if (session.configuration == null) {
      await session.configure(const AudioSessionConfiguration.music());
    }
    return session.setActive(active);
  }

  Future<void> _deactivateFocus() async {
    try {
      await _setFocus(false);
    } catch (_) {
      // Stopping playback remains possible when the platform releases focus itself.
    }
  }

  Future<bool> _acquire(int operation) {
    final request = _focusTransition.then((_) async {
      if (!_current(operation)) return false;
      final active = await _setFocus(true);
      if (!active) return false;
      if (_current(operation)) {
        _focusOwner = operation;
      } else {
        _focusOwner = null;
        await _deactivateFocus();
      }
      return true;
    });
    _focusTransition = request.then<void>((_) {}, onError: (Object _) {});
    return request;
  }

  Future<void> _release([int? owner]) {
    final release = _focusTransition.then((_) async {
      if (_focusOwner == null || owner != null && _focusOwner != owner) return;
      _focusOwner = null;
      await _deactivateFocus();
    });
    _focusTransition = release;
    return release;
  }

  bool _current(int operation) =>
      operation == _operation && !_disposed && _foreground;

  Future<void> _removePreparedAudio(File? file) async {
    if (file == null) return;
    try {
      if (await file.exists()) await file.delete();
      await file.parent.delete();
    } on FileSystemException {
      // An Android lifecycle interruption may already have removed the cache.
    }
  }

  Future<void> toggle(
    String key,
    ArtMedia media,
    File? offlineFile, {
    Future<File> Function()? prepareProtected,
  }) async {
    if (loading) return;
    final operation = ++_operation;
    error = '';
    loading = true;
    _changed();
    try {
      if (!_foreground) {
        error = 'Öffne die App auf dem Handy, um die Tierstimme abzuspielen.';
        return;
      }
      final player = _getPlayer();
      if (activeKey == key && playing && !completed) {
        await player.pause();
        await _release();
        return;
      }
      if (activeKey != key) {
        await player.stop();
        final previous = _preparedAudio;
        _preparedAudio = null;
        await _removePreparedAudio(previous);
        if (!_current(operation)) return;
        if (offlineFile != null && await offlineFile.exists()) {
          await player.setFilePath(offlineFile.path);
        } else if (prepareProtected != null) {
          final file = await prepareProtected();
          if (!_current(operation)) {
            await _removePreparedAudio(file);
            return;
          }
          _preparedAudio = file;
          await player.setFilePath(file.path);
        } else {
          final url = media.url;
          if (url == null) {
            throw const FormatException(
              'Für diese Tierstimme fehlt der geschützte Abruf.',
            );
          }
          await player.setUrl(url.toString());
        }
        if (!_current(operation)) return;
        activeKey = key;
      }
      if (completed) {
        await player.pause();
        await player.seek(Duration.zero);
      }
      if (!_current(operation)) return;
      final active = await _acquire(operation);
      if (!_current(operation)) {
        if (active) await _release(operation);
        return;
      }
      if (!active) {
        error = 'Android gibt die Audioausgabe gerade nicht frei. Öffne die App direkt auf dem Handy und versuche es erneut.';
        await _release();
        return;
      }
      unawaited(
        player.play().catchError((Object _) async {
          if (operation == _operation) {
            error = 'Die Wiedergabe wurde unterbrochen.';
            await _release();
            _changed();
          }
        }),
      );
    } catch (_) {
      if (operation == _operation) {
        activeKey = null;
        error = 'Ton nicht verfügbar. Verbindung oder Offlinepaket prüfen.';
        final file = _preparedAudio;
        _preparedAudio = null;
        await _removePreparedAudio(file);
        await _release();
      }
    } finally {
      if (operation == _operation) {
        loading = false;
        _changed();
      }
    }
  }

  Future<void> seek(Duration value) async {
    final player = _player;
    final length = player?.duration;
    if (player == null || length == null || loading || !_foreground) return;
    try {
      if (completed) await player.pause();
      await player.seek(
        Duration(
          milliseconds: value.inMilliseconds.clamp(0, length.inMilliseconds),
        ),
      );
      _changed();
    } catch (_) {
      error = 'Die Wiedergabeposition konnte nicht geändert werden.';
      _changed();
    }
  }

  Future<void> stop() async {
    final operation = ++_operation;
    final file = _preparedAudio;
    _preparedAudio = null;
    loading = false;
    activeKey = null;
    _changed();
    try {
      await _player?.stop();
    } catch (_) {
      // A closed player already has no active playback.
    } finally {
      await _removePreparedAudio(file);
      if (operation == _operation) await _release();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground =
        state == AppLifecycleState.resumed ||
        state == AppLifecycleState.inactive;
    if (!_foreground) {
      ++_operation;
      loading = false;
      final owner = _focusOwner;
      unawaited(
        (_player?.pause() ?? Future<void>.value())
            .catchError((Object _) {})
            .whenComplete(() async {
              if (owner != null) await _release(owner);
            }),
      );
      _changed();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    ++_operation;
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_stateSubscription?.cancel() ?? Future<void>.value());
    unawaited(_errorSubscription?.cancel() ?? Future<void>.value());
    if (_audioSessionIdSubscription case final subscription?) {
      unawaited(subscription.cancel());
      unawaited(_applyPlaybackBoost(null));
    }
    final file = _preparedAudio;
    _preparedAudio = null;
    unawaited(
      (_player?.dispose() ?? Future<void>.value()).whenComplete(
        () => _removePreparedAudio(file),
      ),
    );
    unawaited(_release());
    super.dispose();
  }
}
