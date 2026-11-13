const _invalid = FormatException('Ungültige Gliederung der Artseite.');
final _identifier = RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$');

Map<String, dynamic> _object(Object? value) {
  if (value is! Map<String, dynamic>) throw _invalid;
  return value;
}

void _fields(
  Map<String, dynamic> value,
  Set<String> required, [
  Set<String> optional = const {},
]) {
  if (!required.every(value.containsKey) ||
      value.keys.any(
        (key) => !required.contains(key) && !optional.contains(key),
      )) {
    throw _invalid;
  }
}

String _text(Object? value, int limit, {bool allowEmpty = false}) {
  if (value is! String ||
      value.length > limit ||
      (!allowEmpty && value.trim().isEmpty)) {
    throw _invalid;
  }
  return value;
}

String _id(Object? value) {
  if (value is! String || !_identifier.hasMatch(value)) throw _invalid;
  return value;
}

bool _bool(Object? value) {
  if (value is! bool) throw _invalid;
  return value;
}

List<T> _items<T>(Object? value, int maximum, T Function(Object?) read) {
  if (value is! List || value.length > maximum) throw _invalid;
  return List.unmodifiable(value.map(read));
}

sealed class ArtTextBlock {
  const ArtTextBlock();

  factory ArtTextBlock.fromJson(Object? raw) {
    final value = _object(raw);
    switch (value['type']) {
      case 'paragraph':
        _fields(value, {'type', 'text'});
        return ArtParagraph(_text(value['text'], 100000, allowEmpty: true));
      case 'heading':
        _fields(value, {'type', 'text', 'level'});
        final level = value['level'];
        if (level is! int || (level != 5 && level != 6)) throw _invalid;
        return ArtHeading(
          _text(value['text'], 100000, allowEmpty: true),
          level,
        );
      case 'bullet-list':
      case 'numbered-list':
        _fields(value, {'type', 'items'});
        final items = _items(value['items'], 100, (item) => _text(item, 10000));
        if (items.isEmpty) throw _invalid;
        return ArtList(items, numbered: value['type'] == 'numbered-list');
      default:
        throw _invalid;
    }
  }

  bool get hasText;
  Map<String, dynamic> toJson();
}

final class ArtParagraph extends ArtTextBlock {
  final String text;
  const ArtParagraph(this.text);

  @override
  bool get hasText => text.trim().isNotEmpty;
  @override
  Map<String, dynamic> toJson() => {'type': 'paragraph', 'text': text};
}

final class ArtHeading extends ArtTextBlock {
  final String text;
  final int level;
  const ArtHeading(this.text, this.level);

  @override
  bool get hasText => text.trim().isNotEmpty;
  @override
  Map<String, dynamic> toJson() => {
    'type': 'heading',
    'text': text,
    'level': level,
  };
}

final class ArtList extends ArtTextBlock {
  final List<String> items;
  final bool numbered;
  const ArtList(this.items, {required this.numbered});

  @override
  bool get hasText => items.isNotEmpty;
  @override
  Map<String, dynamic> toJson() => {
    'type': numbered ? 'numbered-list' : 'bullet-list',
    'items': items,
  };
}

class ArtTextSource {
  final String id, label;
  final String? url, sha256;
  const ArtTextSource._(this.id, this.label, this.url, this.sha256);

  factory ArtTextSource.fromJson(Object? raw) {
    final value = _object(raw);
    _fields(value, {'id', 'label'}, {'url', 'sha256'});
    final url = value.containsKey('url') ? _text(value['url'], 4096) : null;
    final hash = value.containsKey('sha256')
        ? _text(value['sha256'], 64)
        : null;
    if (url != null) {
      final uri = Uri.tryParse(url);
      if (uri == null ||
          uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          uri.fragment.isNotEmpty ||
          uri.queryParameters.keys.any(
            RegExp(
              r'token|secret|password|credential|signature|x-amz|x-goog',
              caseSensitive: false,
            ).hasMatch,
          )) {
        throw _invalid;
      }
    }
    if (hash != null && !RegExp(r'^[a-f0-9]{64}$').hasMatch(hash)) {
      throw _invalid;
    }
    return ArtTextSource._(
      _id(value['id']),
      _text(value['label'], 1000),
      url,
      hash,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    if (url != null) 'url': url,
    if (sha256 != null) 'sha256': sha256,
  };
}

enum ArtEditorialKind {
  general('general-module'),
  text('editorial'),
  map('map-module');

  final String nameInCatalog;
  const ArtEditorialKind(this.nameInCatalog);
}

class ArtEditorialSection {
  final String id, title;
  final ArtEditorialKind kind;
  final bool requested, intentionallyEmpty;
  final List<ArtTextBlock> blocks;
  final List<ArtTextSource> sources;

  const ArtEditorialSection._(
    this.id,
    this.title,
    this.kind,
    this.requested,
    this.intentionallyEmpty,
    this.blocks,
    this.sources,
  );

  factory ArtEditorialSection._fromJson(Object? raw) {
    final value = _object(raw);
    _fields(value, {
      'id',
      'title',
      'kind',
      'requested',
      'intentionallyEmpty',
      'blocks',
      'sources',
    });
    final kind = ArtEditorialKind.values
        .where((kind) => kind.nameInCatalog == value['kind'])
        .firstOrNull;
    final blocks = _items(value['blocks'], 300, ArtTextBlock.fromJson);
    final empty = _bool(value['intentionallyEmpty']);
    if (kind == null || (empty && blocks.any((block) => block.hasText))) {
      throw _invalid;
    }
    return ArtEditorialSection._(
      _id(value['id']),
      _text(value['title'], 300),
      kind,
      _bool(value['requested']),
      empty,
      blocks,
      _items(value['sources'], 30, ArtTextSource.fromJson),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'kind': kind.nameInCatalog,
    'requested': requested,
    'intentionallyEmpty': intentionallyEmpty,
    'blocks': blocks.map((block) => block.toJson()).toList(),
    'sources': sources.map((source) => source.toJson()).toList(),
  };
}

/// The curated structure shared by the project reader and a full offline entry.
class ArtEditorial {
  final String title;
  final List<ArtTextBlock> introduction;
  final List<ArtEditorialSection> sections;
  final List<ArtTextSource> sources;
  final bool galleryRequested;

  const ArtEditorial._(
    this.title,
    this.introduction,
    this.sections,
    this.sources,
    this.galleryRequested,
  );

  factory ArtEditorial.fromJson(Object? raw) {
    final value = _object(raw);
    _fields(value, {
      'kind',
      'title',
      'introduction',
      'sections',
      'sources',
      'galleryRequested',
    });
    final sections = _items(
      value['sections'],
      100,
      ArtEditorialSection._fromJson,
    );
    if (value['kind'] != 'structured' ||
        sections.length < 2 ||
        sections.first.kind != ArtEditorialKind.general ||
        sections.last.kind != ArtEditorialKind.map ||
        sections
            .skip(1)
            .take(sections.length - 2)
            .any((section) => section.kind != ArtEditorialKind.text) ||
        sections.map((section) => section.id).toSet().length !=
            sections.length) {
      throw _invalid;
    }
    return ArtEditorial._(
      _text(value['title'], 300),
      _items(value['introduction'], 300, ArtTextBlock.fromJson),
      sections,
      _items(value['sources'], 100, ArtTextSource.fromJson),
      _bool(value['galleryRequested']),
    );
  }

  Map<String, dynamic> toJson() => {
    'kind': 'structured',
    'title': title,
    'introduction': introduction.map((block) => block.toJson()).toList(),
    'sections': sections.map((section) => section.toJson()).toList(),
    'sources': sources.map((source) => source.toJson()).toList(),
    'galleryRequested': galleryRequested,
  };
}
