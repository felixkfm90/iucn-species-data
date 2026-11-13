import 'package:flutter/material.dart';

import '../domain/catalog.dart';

class SpeciesRegions extends StatelessWidget {
  final List<SpeciesGroup> regions;
  final int speciesCount;
  final ValueChanged<String?> onSelect;

  const SpeciesRegions({
    super.key,
    required this.regions,
    required this.speciesCount,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
    children: [
      Semantics(
        header: true,
        child: Text(
          'Region wählen',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ),
      const SizedBox(height: 10),
      _region('Alle Regionen', speciesCount, null, Icons.public),
      for (final region in regions)
        _region(region.label, region.count, region.id, Icons.place_outlined),
    ],
  );

  Widget _region(String label, int count, String? id, IconData icon) => Card(
    margin: const EdgeInsets.only(bottom: 8),
    child: ListTile(
      leading: Icon(icon),
      title: Text(label),
      subtitle: Text('$count ${count == 1 ? 'Art' : 'Arten'}'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => onSelect(id),
    ),
  );
}
