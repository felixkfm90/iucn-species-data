import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app_controller.dart';
import '../domain/catalog.dart';

class MediaImage extends StatefulWidget {
  final ExplorerController controller;
  final Species species;
  final ArtMedia media;
  final MediaKind kind;
  final bool compact;
  const MediaImage({
    super.key,
    required this.controller,
    required this.species,
    required this.media,
    required this.kind,
    this.compact = false,
  });
  @override
  State<MediaImage> createState() => _MediaImageState();
}

class _MediaImageState extends State<MediaImage> {
  late Future<Uint8List> _bytes;
  String _loadedBinding = '';
  String _bindingIdentity() {
    final reference = MediaReference(
      widget.species.id,
      widget.kind,
      widget.media,
    );
    final binding = widget.controller.offline?.bindings[reference.key];
    final permitted = widget.controller.mayUseMedia(
      widget.species,
      widget.media,
      widget.kind,
    );
    final scope = widget.media.projectFile == null
        ? null
        : widget.controller.readerScope;
    return '$permitted|$scope|${widget.controller.catalog?.revision}|${widget.controller.offlineFile(widget.species, widget.media, widget.kind)?.path}|${binding?.observedAt}';
  }

  void _controllerChanged() {
    if (mounted && _loadedBinding != _bindingIdentity()) setState(_load);
  }

  void _load() {
    _loadedBinding = _bindingIdentity();
    _bytes = widget.controller.imageBytes(
      widget.species,
      widget.media,
      widget.kind,
    );
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_controllerChanged);
    _load();
  }

  @override
  void didUpdateWidget(MediaImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_controllerChanged);
      widget.controller.addListener(_controllerChanged);
    }
    if (oldWidget.media.sourceIdentity != widget.media.sourceIdentity ||
        oldWidget.media.sha256 != widget.media.sha256 ||
        oldWidget.species.id != widget.species.id ||
        _loadedBinding != _bindingIdentity()) {
      _load();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_controllerChanged);
    super.dispose();
  }

  Widget _failure() => Center(
    child: widget.compact
        ? const Icon(Icons.image_not_supported_outlined)
        : Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.image_not_supported_outlined),
              const SizedBox(height: 8),
              const Text(
                'Bild nicht verfügbar. Verbindung oder Offlinepaket prüfen.',
                textAlign: TextAlign.center,
              ),
              TextButton(
                onPressed: () => setState(_load),
                child: const Text('Erneut laden'),
              ),
            ],
          ),
  );
  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
    key: ValueKey(_loadedBinding),
    future: _bytes,
    builder: (context, snapshot) {
      if (snapshot.hasError) return _failure();
      if (!snapshot.hasData) {
        return const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        );
      }
      final label = widget.media.alt.isNotEmpty
          ? widget.media.alt
          : widget.media.caption.isNotEmpty
          ? widget.media.caption
          : widget.species.displayName;
      final isSpectrogram = widget.kind == MediaKind.sound;
      // The player's seek position uses the full image width as its time axis.
      final fit = isSpectrogram
          ? BoxFit.fill
          : widget.compact && widget.kind != MediaKind.portrait
          ? BoxFit.cover
          : BoxFit.contain;
      if (widget.media.isSvg) {
        return SvgPicture.string(
          utf8.decode(snapshot.data!),
          fit: isSpectrogram ? fit : BoxFit.contain,
          semanticsLabel: label,
          errorBuilder: (context, error, stack) => _failure(),
        );
      }
      return Image.memory(
        snapshot.data!,
        cacheWidth: widget.compact && !isSpectrogram ? 192 : null,
        fit: fit,
        semanticLabel: label,
        errorBuilder: (_, error, stack) => _failure(),
      );
    },
  );
}
