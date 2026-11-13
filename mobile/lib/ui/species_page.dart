import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../audio_playback.dart';
import '../domain/art_editorial.dart';
import '../domain/catalog.dart';
import 'media_image.dart';

class SpeciesPage extends StatefulWidget {
  final Species species;
  final ExplorerController controller;
  final AudioPlayback audio;
  const SpeciesPage({
    super.key,
    required this.species,
    required this.controller,
    required this.audio,
  });
  @override
  State<SpeciesPage> createState() => _SpeciesPageState();
}

class _SpeciesPageState extends State<SpeciesPage> {
  static const _browser = MethodChannel(
    'de.fnwildlifetravel.arten_explorer/browser',
  );
  late final Future<bool> _galleryOnline;
  late final bool _projectReader;
  late final (Uri, String, String)? _readerScope;
  late final String? _readerRevision;
  bool _readerCurrent = true;
  int _galleryIndex = 0;

  @override
  void initState() {
    super.initState();
    _projectReader = widget.controller.catalog?.projectId != null;
    _readerScope = widget.controller.readerScope;
    _readerRevision = widget.controller.catalog?.revision;
    if (_projectReader) {
      _readerCurrent = _readerScope != null;
      widget.controller.addListener(_checkReader);
    }
    _galleryOnline = widget.species.gallery.isEmpty
        ? Future.value(true)
        : _canLoadGallery();
  }

  void _checkReader() {
    final current =
        _readerScope != null &&
        widget.controller.readerScope == _readerScope &&
        widget.controller.catalog?.revision == _readerRevision;
    if (current == _readerCurrent) return;
    if (!current) unawaited(widget.audio.stop());
    setState(() => _readerCurrent = current);
  }

  Future<bool> _canLoadGallery() async {
    try {
      return (await widget.controller.downloadNetwork()).connected;
    } on PlatformException {
      return true;
    } on MissingPluginException {
      return true;
    }
  }

  Future<void> _openWebsite(Uri url) async {
    try {
      if (await _browser.invokeMethod<bool>('open', url.toString()) == true) {
        return;
      }
    } on PlatformException {
      // The app remains usable when Android has no browser to handle the link.
    } on MissingPluginException {
      // Android provides the browser hand-off.
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Die FN-Website konnte nicht geöffnet werden.'),
        ),
      );
    }
  }

  @override
  void dispose() {
    if (_projectReader) widget.controller.removeListener(_checkReader);
    unawaited(widget.audio.stop());
    super.dispose();
  }

  void _zoom(ArtMedia media, MediaKind kind, String title) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => Scaffold(
            appBar: AppBar(title: Text(title)),
            body: SafeArea(
              child: InteractiveViewer(
                minScale: 0.5,
                maxScale: 6,
                child: Center(
                  child: MediaImage(
                    controller: widget.controller,
                    species: widget.species,
                    media: media,
                    kind: kind,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
  void _sources(Iterable<String> sources) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheet).height * 0.75,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Quelle und Nutzung',
                style: Theme.of(sheet).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              SelectableText(sources.join('\n\n')),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.pop(sheet),
                child: const Text('Schließen'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  Widget _image(
    ArtMedia media,
    MediaKind kind,
    String title, {
    double height = 260,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Semantics(
              label: '$title vergrößern',
              button: true,
              child: InkWell(
                key: ValueKey('media-${kind.name}-${media.id}'),
                onTap: () => _zoom(media, kind, title),
                child: MediaImage(
                  controller: widget.controller,
                  species: widget.species,
                  media: media,
                  kind: kind,
                ),
              ),
            ),
            if (media.attribution.isNotEmpty)
              Align(
                alignment: Alignment.bottomLeft,
                child: IconButton.filledTonal(
                  tooltip: 'Quelle und Nutzung',
                  onPressed: () => _sources([media.attribution]),
                  icon: const Icon(Icons.info_outline),
                ),
              ),
          ],
        ),
      ),
      if (kind != MediaKind.gallery && media.caption.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(media.caption),
        ),
    ],
  );

  Widget _topGallery(Species species) => FutureBuilder<bool>(
    future: _galleryOnline,
    builder: (context, connection) => AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final photos = connection.data != true
            ? species.gallery
                  .where(
                    (media) =>
                        widget.controller.offlineFile(
                          species,
                          media,
                          MediaKind.gallery,
                        ) !=
                        null,
                  )
                  .toList()
            : species.gallery;
        if (photos.isEmpty) {
          return species.portrait != null
              ? _image(
                  species.portrait!,
                  MediaKind.portrait,
                  species.displayName,
                )
              : const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Text('Kein Artbild hinterlegt.'),
                );
        }
        final index = _galleryIndex.clamp(0, photos.length - 1).toInt();
        final height = (MediaQuery.sizeOf(context).width * 0.68)
            .clamp(220.0, 420.0)
            .toDouble();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: height,
              child: PageView.builder(
                key: const ValueKey('species-gallery'),
                itemCount: photos.length,
                onPageChanged: (value) => setState(() => _galleryIndex = value),
                itemBuilder: (context, index) => _image(
                  photos[index],
                  MediaKind.gallery,
                  species.displayName,
                  height: height,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                '${index + 1} von ${photos.length}',
                textAlign: TextAlign.right,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        );
      },
    ),
  );

  Widget _distribution(
    ArtSection? description,
    ArtSection? mapSection, {
    ArtEditorialSection? editorial,
  }) {
    final species = widget.species;
    final map = species.map;
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: Text(editorial?.title ?? 'Verbreitung'),
      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
      childrenPadding: const EdgeInsets.only(bottom: 16),
      children: [
        for (final section in [description, mapSection])
          if (section != null && section.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SelectableText(section.text, textAlign: TextAlign.left),
            ),
        if (editorial != null) ..._editorialBlocks(editorial.blocks),
        if (map != null)
          _image(
            map,
            MediaKind.map,
            'Verbreitungskarte · ${species.displayName}',
          )
        else if (editorial == null)
          const Text('Keine Verbreitungskarte hinterlegt.'),
      ],
    );
  }

  List<Widget> _editorialBlocks(List<ArtTextBlock> blocks) => [
    for (final block in blocks.where((block) => block.hasText))
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: switch (block) {
          ArtParagraph(:final text) => SelectableText(text),
          ArtHeading(:final text, :final level) => Semantics(
            header: true,
            child: Text(
              text,
              style: level == 5
                  ? Theme.of(context).textTheme.titleSmall
                  : Theme.of(context).textTheme.labelLarge,
            ),
          ),
          ArtList(:final items, :final numbered) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, item) in items.indexed)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text(numbered ? '${index + 1}.' : '•'),
                    ),
                    Expanded(child: SelectableText(item)),
                  ],
                ),
            ],
          ),
        },
      ),
  ];

  Widget _taxonomy(Species species) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final (index, taxon) in species.taxonomy.indexed)
        Container(
          margin: EdgeInsets.symmetric(
            horizontal: (index * 7).clamp(0, 42).toDouble(),
            vertical: 2,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            children: [
              Text(
                _rankName(taxon.rank),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall,
              ),
              Text(
                taxon.rank.trim().toLowerCase() == 'species'
                    ? species.commonName
                    : taxonomyDisplayName(taxon.rank, taxon.name),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
    ],
  );

  String _sectionText(ArtSection section) {
    if (section.text.isEmpty) {
      return section.intentionallyEmpty
          ? 'Dieser Abschnitt ist bewusst ohne Text.'
          : 'Noch kein Text hinterlegt.';
    }
    final lines = section.text.split('\n').map((line) => line.trim()).toList();
    final entries = lines.where((line) => line.isNotEmpty);
    if (section.title == 'Brut' ||
        (const {'Lebensraum', 'Fortpflanzung'}.contains(section.title) &&
            entries.length > 1 &&
            entries.every(
              (line) => line.length <= 130 && !RegExp(r'[.!?]$').hasMatch(line),
            ))) {
      return entries.join('\n');
    }
    return section.text;
  }

  List<Widget> _general(ArtSection section) {
    if (section.text.trim().isEmpty) {
      return [Text(_sectionText(section))];
    }
    final lines = section.text.split('\n').map((line) => line.trim());
    const statusLabels = {
      'NE': 'Nicht bewertet',
      'DD': 'Ungenügende Datengrundlage',
      'LC': 'Nicht gefährdet',
      'NT': 'Potenziell gefährdet',
      'VU': 'Gefährdet',
      'EN': 'Stark gefährdet',
      'CR': 'Vom Aussterben bedroht',
      'EW': 'In der Natur ausgestorben',
      'EX': 'Ausgestorben',
    };
    const hiddenFields = {
      'wissenschaftlicher name',
      'deutscher name',
      'assessment id',
      'letztes iucn update',
      'daten abgerufen',
    };
    String field(String line) => line.split(':').first.trim().toLowerCase();
    String? fieldValue(String name) {
      for (final line in lines) {
        final colon = line.indexOf(':');
        if (colon < 0 || field(line) != name) continue;
        final value = line.substring(colon + 1).trim();
        if (value.isNotEmpty) return value;
      }
      return null;
    }

    final rawStatus = fieldValue('status');
    final code = rawStatus?.toUpperCase();
    final knownStatus = statusLabels[code];
    final status = knownStatus ?? fieldValue('kategorie') ?? rawStatus;
    final rawTrend = fieldValue('trend');
    final trend = rawTrend?.toLowerCase() == 'n/a' ? 'Unbekannt' : rawTrend;
    final trendGraphic = switch (trend?.toLowerCase()) {
      'zunehmend' => 'zunehmend',
      'stabil' => 'stabil',
      'abnehmend' => 'abnehmend',
      _ => 'nodata',
    };
    final details = lines
        .where(
          (line) =>
              line.isNotEmpty &&
              !hiddenFields.contains(field(line)) &&
              !const {'status', 'kategorie', 'trend'}.contains(field(line)),
        )
        .join('\n');

    Widget indicator(String title, String label, String? graphic) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(title),
          if (graphic != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Image.asset(
                'assets/status-graphics/$graphic.png',
                height: 58,
                width: 74,
                fit: BoxFit.contain,
                excludeFromSemantics: true,
              ),
            ),
          Text(label, textAlign: TextAlign.center),
        ],
      ),
    );
    return [
      if (status != null || trend != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (status != null)
                indicator('Status', status, knownStatus == null ? null : code),
              if (trend != null) indicator('Trend', trend, trendGraphic),
            ],
          ),
        ),
      if (details.isNotEmpty)
        SelectableText(details, textAlign: TextAlign.left),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (!_readerCurrent) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(
          child: Text(
            'Die Lesefassung wurde gewechselt. Bitte die Art erneut öffnen.',
          ),
        ),
      );
    }
    final species = widget.species;
    final editorial = species.editorial;
    final heading = species.websiteHeading;
    final subtitle = editorial == null
        ? heading?.subtitle
        : editorial.title == species.displayName
        ? null
        : editorial.title;
    final editorialSources = <String>{
      if (editorial != null)
        for (final source in [
          ...editorial.sources,
          ...editorial.sections.expand((section) => section.sources),
        ])
          [source.label, if (source.url != null) source.url].join('\n'),
    };
    final url = species.websiteUrl;
    final showWebsite =
        url != null &&
        const {
          'www.fnwildlifetravel.de',
          'fnwildlifetravel.de',
        }.contains(url.host) &&
        !url.hasPort &&
        url.path.startsWith('/wildlife/');
    final mapSection = species.sections
        .where((section) => section.title == 'Verbreitungskarte')
        .firstOrNull;
    final description = species.sections
        .where((section) => section.title == 'Verbreitung')
        .firstOrNull;
    final general = species.sections
        .where((section) => section.title == 'Allgemein')
        .firstOrNull;
    final sections = species.sections.where(
      (section) =>
          section != heading?.section &&
          section != general &&
          section != mapSection,
    );
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (editorialSources.isNotEmpty)
            IconButton(
              tooltip: 'Quellen der Arttexte',
              icon: const Icon(Icons.info_outline),
              onPressed: () => _sources(editorialSources),
            ),
        ],
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              species.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (species.commonName.isNotEmpty)
              Text(
                species.scientificName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(fontStyle: FontStyle.italic),
              ),
          ],
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  subtitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            if (showWebsite)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => _openWebsite(url),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Auf FN-Website öffnen'),
                ),
              ),
            _topGallery(species),
            if (editorial != null) ..._editorialBlocks(editorial.introduction),
            if (!widget.controller.detailsAvailable)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Arttexte und Taxonomie wurden nicht für die Offlineverwendung geladen. Mit Verbindung die Inhalte aktualisieren.',
                ),
              ),
            if (general != null ||
                editorial?.sections.first.blocks.any(
                      (block) => block.hasText,
                    ) ==
                    true)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(editorial?.sections.first.title ?? 'Allgemein'),
                childrenPadding: const EdgeInsets.only(bottom: 20),
                expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (general != null) ..._general(general),
                  if (editorial != null)
                    ..._editorialBlocks(editorial.sections.first.blocks),
                ],
              ),
            ExpansionTile(
              title: const Text('Taxonomie'),
              tilePadding: EdgeInsets.zero,
              children: [
                if (species.taxonomy.isEmpty)
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Keine Taxonomie in diesem Bestand vorhanden.'),
                  ),
                if (species.taxonomy.isNotEmpty) _taxonomy(species),
              ],
            ),
            if (species.sounds.isNotEmpty) _sounds(species),
            if (editorial == null) ...[
              for (final section in sections)
                if (section == description)
                  _distribution(description, mapSection)
                else
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(section.title),
                    childrenPadding: const EdgeInsets.only(bottom: 20),
                    expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SelectableText(
                        _sectionText(section),
                        textAlign: TextAlign.left,
                      ),
                    ],
                  ),
              if (description == null) _distribution(null, mapSection),
            ] else ...[
              for (final section in editorial.sections.skip(1))
                if (section.kind == ArtEditorialKind.map) ...[
                  if (species.map != null ||
                      section.blocks.any((block) => block.hasText))
                    _distribution(null, null, editorial: section),
                ] else if (section.blocks.any((block) => block.hasText))
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(section.title),
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                    children: _editorialBlocks(section.blocks),
                  ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _sounds(Species species) => ExpansionTile(
    tilePadding: EdgeInsets.zero,
    expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
    childrenPadding: const EdgeInsets.only(bottom: 16),
    title: const Text('Tierstimme'),
    children: [
      AnimatedBuilder(
        animation: Listenable.merge([widget.audio, widget.controller]),
        builder: (context, _) => Column(
          children: [
            for (final (index, media) in species.sounds.indexed)
              _soundPlayer(species, media, index),
            if (widget.audio.error.isNotEmpty) Text(widget.audio.error),
          ],
        ),
      ),
    ],
  );

  Widget _soundPlayer(Species species, ArtMedia media, int index) {
    final audio = widget.audio;
    final key = '${species.id}/${media.id}';
    final active = audio.activeKey == key;
    final playing = active && audio.playing && !audio.completed;
    final offline = widget.controller.offlineFile(
      species,
      media,
      MediaKind.sound,
    );
    final spectrogram = index == 0 ? species.spectrogram : null;
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            media.caption.isEmpty ? 'Aufnahme ${index + 1}' : media.caption,
          ),
          subtitle: Text(
            offline == null ? 'Mit Verbindung abspielen' : 'Offline verfügbar',
          ),
          trailing: media.attribution.isEmpty
              ? null
              : IconButton(
                  onPressed: () => _sources([media.attribution]),
                  tooltip: 'Quelle und Nutzung',
                  icon: const Icon(Icons.info_outline),
                ),
        ),
        StreamBuilder<Duration>(
          stream: active ? audio.positions : null,
          builder: (context, snapshot) {
            final length = active ? audio.duration : null;
            final position = active
                ? snapshot.data ?? audio.position
                : Duration.zero;
            final totalMs = length?.inMilliseconds ?? 0;
            final seekable = totalMs > 0 && !audio.loading;
            final progress = totalMs > 0
                ? (position.inMilliseconds / totalMs).clamp(0.0, 1.0).toDouble()
                : 0.0;
            void seek(double fraction) => unawaited(
              audio.seek(Duration(milliseconds: (totalMs * fraction).round())),
            );
            final marker = Theme.of(context).colorScheme.primary;
            return Column(
              children: [
                if (spectrogram != null)
                  SizedBox(
                    height: 68,
                    child: LayoutBuilder(
                      builder: (context, bounds) => GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: seekable
                            ? (event) => seek(
                                (event.localPosition.dx / bounds.maxWidth)
                                    .clamp(0.0, 1.0)
                                    .toDouble(),
                              )
                            : null,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            MediaImage(
                              key: ValueKey(
                                'sound-spectrogram-${spectrogram.id}',
                              ),
                              controller: widget.controller,
                              species: species,
                              media: spectrogram,
                              kind: MediaKind.sound,
                              compact: true,
                            ),
                            if (active && totalMs > 0)
                              Align(
                                alignment: Alignment(progress * 2 - 1, 0),
                                child: SizedBox(
                                  width: 2,
                                  height: 68,
                                  child: ColoredBox(color: marker),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                Row(
                  children: [
                    IconButton(
                      tooltip: playing ? 'Pausieren' : 'Abspielen',
                      onPressed: audio.loading
                          ? null
                          : () => audio.toggle(
                              key,
                              media,
                              offline,
                              prepareProtected: media.projectFile == null
                                  ? null
                                  : () => widget.controller.prepareProjectAudio(
                                      species,
                                      media,
                                    ),
                            ),
                      icon: Icon(
                        playing
                            ? Icons.pause_circle_outline
                            : Icons.play_circle_outline,
                      ),
                    ),
                    Expanded(
                      child: Semantics(
                        label: 'Wiedergabeposition',
                        child: Slider(
                          value: progress,
                          onChanged: seekable ? seek : null,
                          semanticFormatterCallback: (value) => _time(
                            Duration(milliseconds: (totalMs * value).round()),
                          ),
                        ),
                      ),
                    ),
                    Text(
                      '${_time(position)} / ${length == null ? '–:––' : _time(length)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  String _time(Duration value) =>
      '${value.inMinutes}:${(value.inSeconds % 60).toString().padLeft(2, '0')}';

  String _rankName(String value) =>
      const {
        'kingdom': 'Reich',
        'phylum': 'Stamm',
        'subphylum': 'Unterstamm',
        'class': 'Klasse',
        'order': 'Ordnung',
        'family': 'Familie',
        'genus': 'Gattung',
        'species': 'Art',
      }[value.trim().toLowerCase()] ??
      value;
}
