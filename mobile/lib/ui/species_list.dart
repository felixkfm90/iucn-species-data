import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../domain/catalog.dart';
import 'media_image.dart';

class SpeciesList extends StatefulWidget {
  final ExplorerController controller;
  final List<Species> species;
  final bool byFamily;
  final bool searching;
  final ValueChanged<Species> onOpen;

  const SpeciesList({
    super.key,
    required this.controller,
    required this.species,
    required this.byFamily,
    this.searching = false,
    required this.onOpen,
  });

  @override
  State<SpeciesList> createState() => _SpeciesListState();
}

class _SpeciesListState extends State<SpeciesList> {
  final _expansion = <String, bool>{};
  bool? _expandAll;

  bool _expanded(String id) => _expansion[id] ?? _expandAll ?? widget.searching;

  @override
  void didUpdateWidget(SpeciesList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.searching != widget.searching ||
        oldWidget.byFamily != widget.byFamily) {
      _expandAll = null;
      _expansion.clear();
    }
  }

  Widget _portrait(Species species) {
    final portrait = species.portrait;
    return portrait == null
        ? const Icon(Icons.eco_outlined)
        : MediaImage(
            controller: widget.controller,
            species: species,
            media: portrait,
            kind: MediaKind.portrait,
            compact: true,
          );
  }

  Widget _card(Species species) => Card(
    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: () => widget.onOpen(species),
      child: Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Row(
          children: [
            SizedBox(width: 68, height: 85, child: _portrait(species)),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      species.displayName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (species.commonName.isNotEmpty)
                      Text(
                        species.scientificName,
                        style: const TextStyle(fontStyle: FontStyle.italic),
                      ),
                  ],
                ),
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final families = widget.byFamily
        ? speciesFamilies(widget.species)
        : speciesClasses(widget.species);
    final allExpanded = families.every((family) => _expanded(family.id));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  '${widget.species.length} ${widget.species.length == 1 ? 'Art' : 'Arten'}',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
              Flexible(
                child: TextButton(
                  onPressed: () => setState(() {
                    _expandAll = !allExpanded;
                    _expansion.clear();
                  }),
                  child: Text(
                    allExpanded ? 'Alles einklappen' : 'Alles ausklappen',
                    textAlign: TextAlign.end,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: CustomScrollView(
            slivers: [
              for (final family in families) ...[
                SliverToBoxAdapter(
                  key: ValueKey(family.id),
                  child: ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                    title: Semantics(
                      header: true,
                      child: Text(
                        family.label,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _expanded(family.id)
                              ? Icons.expand_less
                              : Icons.expand_more,
                        ),
                        if (widget.byFamily) ...[
                          const SizedBox(width: 12),
                          ExcludeSemantics(
                            child: SizedBox(
                              width: 30,
                              height: 36,
                              child: _portrait(family.species.first),
                            ),
                          ),
                        ],
                      ],
                    ),
                    onTap: () => setState(
                      () => _expansion[family.id] = !_expanded(family.id),
                    ),
                  ),
                ),
                if (_expanded(family.id))
                  SliverList.builder(
                    itemCount: family.species.length,
                    itemBuilder: (_, index) => _card(family.species[index]),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
