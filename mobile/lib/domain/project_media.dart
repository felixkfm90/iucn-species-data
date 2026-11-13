const _invalid = FormatException('Ungültiger Beleg für eine Projektdatei.');
final _id = RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$');
final _hash = RegExp(r'^[a-f0-9]{64}$');
final _image = RegExp(
  r'^image-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
);
final _normal = RegExp(r'^normal-[a-f0-9]{64}$');

/// An approved media reference without a URL or credentials.
class ProjectMediaFile {
  final String id, projectId, sha256, mimeType, attribution;
  final int bytes;
  final String? contentId;

  const ProjectMediaFile._({
    required this.id,
    required this.projectId,
    required this.sha256,
    required this.mimeType,
    required this.attribution,
    required this.bytes,
    required this.contentId,
  });

  factory ProjectMediaFile.fromJson(Map<String, dynamic> value) {
    final kind = value['kind'];
    final id = value['id'],
        project = value['projectId'],
        hash = value['sha256'];
    final type = value['mimeType'], bytes = value['bytes'];
    final contentId = value['contentId'], attribution = value['attribution'];
    final normal = kind == 'project-normal';
    final fields = {
      'kind',
      'id',
      'projectId',
      'sha256',
      'mimeType',
      'bytes',
      'attribution',
      if (normal) 'contentId',
    };
    if (value.length != fields.length ||
        !value.keys.every(fields.contains) ||
        id is! String ||
        !_id.hasMatch(id) ||
        project is! String ||
        !_id.hasMatch(project) ||
        hash is! String ||
        !_hash.hasMatch(hash) ||
        attribution is! String ||
        attribution.length > 8000 ||
        type is! String ||
        bytes is! int ||
        bytes <= 0 ||
        bytes > (type == 'audio/mpeg' ? 50 : 20) * 1024 * 1024) {
      throw _invalid;
    }
    if (normal) {
      if (contentId is! String ||
          !_normal.hasMatch(contentId) ||
          !const {'image/jpeg', 'image/webp', 'audio/mpeg'}.contains(type)) {
        throw _invalid;
      }
    } else if (kind != 'project-image' ||
        !_image.hasMatch(id) ||
        !const {'image/jpeg', 'image/png', 'image/webp'}.contains(type)) {
      throw _invalid;
    }
    return ProjectMediaFile._(
      id: id,
      projectId: project,
      sha256: hash,
      mimeType: type,
      attribution: attribution,
      bytes: bytes,
      contentId: contentId as String?,
    );
  }

  String get path => contentId == null
      ? '/api/v1/media/$id/content'
      : '/api/v1/normal-media/$contentId/content';

  Map<String, dynamic> toJson() => {
    'kind': contentId == null ? 'project-image' : 'project-normal',
    'id': id,
    'projectId': projectId,
    'sha256': sha256,
    'mimeType': mimeType,
    'bytes': bytes,
    'attribution': attribution,
    if (contentId != null) 'contentId': contentId,
  };
}
