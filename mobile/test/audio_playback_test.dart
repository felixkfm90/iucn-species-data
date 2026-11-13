import 'dart:async';
import 'dart:io';

import 'package:arten_explorer/audio_playback.dart';
import 'package:arten_explorer/domain/catalog.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';

import 'support.dart';

class _Player extends AudioPlayer {
  String? loadedFile, loadedUrl;
  int playCalls = 0;
  bool _playing = false;
  Duration _position = Duration.zero;
  final sessions = StreamController<int?>.broadcast(sync: true);

  @override
  Stream<int?> get androidAudioSessionIdStream => sessions.stream;
  @override
  bool get playing => _playing;

  @override
  Duration get duration => const Duration(seconds: 10);

  @override
  Duration get position => _position;

  @override
  Future<Duration?> setFilePath(
    String filePath, {
    Duration? initialPosition,
    bool preload = true,
    dynamic tag,
  }) async {
    loadedFile = filePath;
    return duration;
  }

  @override
  Future<Duration?> setUrl(
    String url, {
    Map<String, String>? headers,
    Duration? initialPosition,
    bool preload = true,
    dynamic tag,
  }) async {
    loadedUrl = url;
    return duration;
  }

  @override
  Future<void> seek(Duration? position, {int? index}) async {
    _position = position ?? Duration.zero;
  }

  @override
  Future<void> play() async {
    playCalls++;
    _playing = true;
  }

  @override
  Future<void> pause() async {
    _playing = false;
  }

  @override
  Future<void> stop() => pause();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final sound = ArtMedia.fromJson(mediaFixture('sound', extension: 'mp3'));
  test('Verstärkung folgt der Playersitzung und ein Gerätefehler stoppt den Ton nicht', () async {
    final player = _Player();
    addTearDown(player.sessions.close);
    final calls = <int?>[];
    final audio = AudioPlayback(
      createPlayer: () => player,
      setAudioActive: (_) async => true,
      setPlaybackBoost: (sessionId) async {
        calls.add(sessionId);
        if (sessionId != null) throw StateError('synthetic unsupported effect');
      },
    );
    await audio.toggle('sound', sound, null);
    player.sessions.add(32);
    player.sessions.add(32);
    player.sessions.add(39);
    expect(calls, [32, 39]);
    expect(player.playCalls, 1);
    expect(audio.error, isEmpty);
    audio.dispose();
    expect(calls, [32, 39, null]);
  });

  test(
    'Android-Ablehnung bleibt sichtbar und ein neuer Versuch kann starten',
    () async {
      final player = _Player();
      var allow = false;
      final focusCalls = <bool>[];
      final audio = AudioPlayback(
        createPlayer: () => player,
        setAudioActive: (active) async {
          focusCalls.add(active);
          return allow;
        },
      );
      addTearDown(audio.dispose);
      await audio.toggle('sound', sound, null);
      expect(player.playCalls, 0);
      expect(audio.error, contains('Audioausgabe'));
      expect(audio.loading, isFalse);
      allow = true;
      await audio.toggle('sound', sound, null);
      expect(player.playCalls, 1);
      expect(audio.error, isEmpty);
      expect(player.loadedUrl, sound.url.toString());
      await audio.stop();
      expect(focusCalls, [true, true, false]);
    },
  );

  test(
    'Sichtbare Offline-Tierstimme kann starten, springen und pausieren',
    () async {
      final player = _Player();
      final directory = await testDirectory();
      addTearDown(() => removeTestDirectory(directory));
      final file = await File('${directory.path}/sound.mp3')
          .writeAsBytes([1, 2]);
      final audio = AudioPlayback(
        createPlayer: () => player,
        setAudioActive: (_) async => true,
      );
      addTearDown(audio.dispose);
      audio.didChangeAppLifecycleState(AppLifecycleState.inactive);
      await audio.toggle('sound', sound, file);
      expect(player.loadedFile, file.path);
      expect(player.loadedUrl, isNull);
      expect(audio.playing, isTrue);
      await audio.seek(const Duration(seconds: 6));
      expect(audio.position, const Duration(seconds: 6));
      await audio.toggle('sound', sound, file);
      expect(audio.playing, isFalse);
      audio.didChangeAppLifecycleState(AppLifecycleState.hidden);
      await audio.toggle('sound', sound, file);
      expect(player.playCalls, 1);
      expect(audio.error, contains('App auf dem Handy'));
    },
  );

  test(
    'Eine verspätete Audiofreigabe überschreibt den nächsten Versuch nicht',
    () async {
      final player = _Player();
      final requested = Completer<void>(), previousGrant = Completer<bool>();
      final focusCalls = <bool>[];
      final audio = AudioPlayback(
        createPlayer: () => player,
        setAudioActive: (active) async {
          focusCalls.add(active);
          if (focusCalls.length == 1) {
            requested.complete();
            return previousGrant.future;
          }
          return true;
        },
      );
      addTearDown(audio.dispose);
      final previous = audio.toggle('sound', sound, null);
      await requested.future;
      audio.didChangeAppLifecycleState(AppLifecycleState.hidden);
      audio.didChangeAppLifecycleState(AppLifecycleState.resumed);
      final next = audio.toggle('sound', sound, null);
      previousGrant.complete(true);
      await Future.wait([previous, next]);
      expect(focusCalls, [true, false, true]);
      expect(player.playCalls, 1);
      expect(audio.playing, isTrue);
    },
  );
}
