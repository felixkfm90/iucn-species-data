import 'dart:async';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../audio_playback.dart';
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
  @override
  void dispose() {
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
  void _sources(ArtMedia media) => showModalBottomSheet<void>(
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
              SelectableText(media.attribution),
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
  Widget _image(ArtMedia media, MediaKind kind, String title) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      InkWell(
        onTap: () => _zoom(media, kind, title),
        child: SizedBox(
          height: 260,
          child: MediaImage(
            controller: widget.controller,
            species: widget.species,
            media: media,
            kind: kind,
          ),
        ),
      ),
      if (media.caption.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(media.caption),
        ),
      if(kind==MediaKind.gallery) AnimatedBuilder(animation:widget.controller,builder:(context,_){
        final note=widget.controller.offlinePhotoNote(widget.species,media);
        return note==null ? const SizedBox.shrink() : Padding(padding:const EdgeInsets.only(top:6),child:Text(note,style:Theme.of(context).textTheme.bodySmall));
      }),
      Wrap(
        alignment: WrapAlignment.end,
        children: [
          if (media.attribution.isNotEmpty)
            TextButton(
              onPressed: () => _sources(media),
              child: const Text('Quelle und Nutzung'),
            ),
          TextButton.icon(
            onPressed: () => _zoom(media, kind, title),
            icon: const Icon(Icons.zoom_in),
            label: const Text('Vergrößern'),
          ),
        ],
      ),
    ],
  );
  @override
  Widget build(BuildContext context) {
    final species = widget.species;
    return Scaffold(
      appBar: AppBar(title: Text(species.displayName)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              species.scientificName,
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontStyle: FontStyle.italic),
            ),
            const SizedBox(height: 16),
            if (species.portrait != null)
              _image(species.portrait!, MediaKind.portrait, species.displayName)
            else
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('Kein Artbild hinterlegt.'),
              ),
            if (!widget.controller.detailsAvailable)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Arttexte und Taxonomie wurden nicht für die Offlineverwendung geladen. Mit Verbindung die Inhalte aktualisieren.',
                ),
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
                for (final rank in species.taxonomy)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(rank.name),
                    subtitle: Text(_rankName(rank.rank)),
                  ),
              ],
            ),
            for (final section in species.sections)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(section.title),
                childrenPadding: const EdgeInsets.only(bottom: 20),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(
                    section.text.isNotEmpty
                        ? section.text
                        : section.intentionallyEmpty
                        ? 'Dieser Abschnitt ist bewusst ohne Text.'
                        : 'Noch kein Text hinterlegt.',
                  ),
                ],
              ),
            const SizedBox(height: 16),
            Text('Verbreitung', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (species.map != null)
              _image(
                species.map!,
                MediaKind.map,
                'Verbreitung · ${species.displayName}',
              )
            else
              const Text('Keine Verbreitungskarte hinterlegt.'),
            const SizedBox(height: 20),
            Text('Tonaufnahmen', style: Theme.of(context).textTheme.titleLarge),
            if (species.sounds.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('Keine Tonaufnahme hinterlegt.'),
              ),
            AnimatedBuilder(
              animation: widget.audio,
              builder: (context, _) => Column(
                children: [
                  for (final entry in species.sounds.indexed) ...[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        entry.$2.caption.isEmpty
                            ? 'Aufnahme ${entry.$1 + 1}'
                            : entry.$2.caption,
                      ),
                      subtitle: Text(
                        widget.controller.offlineFile(
                                  species,
                                  entry.$2,
                                  MediaKind.sound,
                                ) ==
                                null
                            ? 'Mit Verbindung abspielen'
                            : 'Offline verfügbar',
                      ),
                      trailing: IconButton(
                        tooltip:
                            widget.audio.activeKey ==
                                    '${species.id}/${entry.$2.id}' &&
                                widget.audio.playing
                            ? 'Pausieren'
                            : 'Abspielen',
                        onPressed: widget.audio.loading
                            ? null
                            : () => widget.audio.toggle(
                                '${species.id}/${entry.$2.id}',
                                entry.$2,
                                widget.controller.offlineFile(
                                  species,
                                  entry.$2,
                                  MediaKind.sound,
                                ),
                              ),
                        icon: Icon(
                          widget.audio.activeKey ==
                                      '${species.id}/${entry.$2.id}' &&
                                  widget.audio.playing
                              ? Icons.pause_circle_outline
                              : Icons.play_circle_outline,
                        ),
                      ),
                    ),
                    if (entry.$2.attribution.isNotEmpty)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => _sources(entry.$2),
                          child: const Text('Quelle und Nutzung'),
                        ),
                      ),
                  ],
                  if (widget.audio.error.isNotEmpty) Text(widget.audio.error),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('Fotogalerie', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (species.gallery.isEmpty)
              const Text('Keine zusätzlichen Websitefotos hinterlegt.'),
            for (final media in species.gallery)
              _image(media, MediaKind.gallery, species.displayName),
            if (species.websiteUrl != null)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('Artseite im Web'),
                children: [SelectableText(species.websiteUrl.toString())],
              ),
          ],
        ),
      ),
    );
  }

  String _rankName(String value) =>
      const {
        'kingdom': 'Reich',
        'phylum': 'Stamm',
        'class': 'Klasse',
        'order': 'Ordnung',
        'family': 'Familie',
        'genus': 'Gattung',
        'species': 'Art',
      }[value] ??
      value;
}
