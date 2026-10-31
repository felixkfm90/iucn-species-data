import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWebsiteEditorialPage } from '../website-alt-parser.mjs';
import { listPageTemplates,FN_MODULE_IDS } from './templates.mjs';
import { check,sha256 } from './contract.mjs';

/** Read-only parity check against an already captured, hash-bound source directory. No network or product data writes. */
export function verifyObservedTemplateSources(sourcesDirectory) {
  check(path.isAbsolute(sourcesDirectory),'source_directory_required','Ein absoluter gebundener Quellordner ist erforderlich.');
  const results=[];
  for(const template of listPageTemplates()) {
    const filename=path.join(sourcesDirectory,`${template.source.slug}.html`),stat=fs.lstatSync(filename);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4*1024*1024,'unsafe_source','Die gebundene HTML-Quelle ist keine begrenzte reguläre Datei.');
    const bytes=fs.readFileSync(filename),html=bytes.toString('utf8'),actualHash=sha256(bytes);
    check(actualHash === template.source.htmlSha256,'source_hash_changed','Die historische HTML-Quelle hat sich verändert.',409);
    const page=parseWebsiteEditorialPage(html,template.source.url),headings=page.sections.filter(section=>section.level === 4).map(section=>section.heading);
    const expected=template.sections.map(section=>section.title);
    check(JSON.stringify(headings) === JSON.stringify(expected),'source_structure_changed','Die Gliederung stimmt nicht mit der gebundenen Quellseite überein.',409,{headings,expected});
    for(const id of FN_MODULE_IDS) check(new RegExp(`id=["']${id}["']`).test(html),'source_module_missing','Ein vorhandener FN-Baustein fehlt in der gebundenen Quellseite.',409,{id});
    check(/<h3\b/i.test(html),'source_title_missing','Die gebundene Seite enthält keine Titelüberschrift der Stufe 3.',409);
    results.push({templateId:template.id,source:template.source,bytes:bytes.length,sha256:actualHash,headings,moduleIds:FN_MODULE_IDS,passed:true});
  }
  return {schemaVersion:1,checkedAt:new Date().toISOString(),readOnly:true,results};
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(verifyObservedTemplateSources(path.resolve(process.argv[2])),null,2)}\n`); }
  catch(error) { process.stderr.write(`${error.code || 'source_check_failed'}: ${error.message}\n${error.details ? JSON.stringify(error.details) : ''}\n`);process.exitCode=1; }
}
