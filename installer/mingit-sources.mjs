const SHA256 = /^[a-f0-9]{64}$/;

export async function collectMingitSources({ installedFiles, pin, readEvidence }) {
  const [baseline, gfw, gfwSignatures, msys, msysSignatures, packaging, extraSignatures, keyring, releaseSignatures] = await Promise.all([
    "mingit-file-provenance.json", "package-sources/source-coverage.json", "package-sources/source-signatures.json",
    "upstream-msys2/installer-source-coverage.json", "upstream-msys2/source-archives/verified-source-signatures.json",
    "packaging-evidence/mingit-packaging-provenance.json", "packaging-evidence/verified-package-signatures.json",
    "upstream-msys2/msys2-keyring-source.json", "pacman-release-signatures.json",
  ].map(readEvidence));
  const { runtimeFileCount, archiveCount, coreArchive } = pin.sourceCompanion;
  const installed = new Map(installedFiles.map(file => [file.path, file.sha256]));
  const previous = new Map(baseline.files.map(file => [file.installerPath, file]));
  if (baseline.minGitSha256 !== pin.sha256 || installedFiles.length !== runtimeFileCount
    || installed.size !== runtimeFileCount || previous.size !== runtimeFileCount
    || new Set(installedFiles.map(file => file.path.toLowerCase())).size !== runtimeFileCount) {
    throw new Error("Das Installermanifest enthält einen anderen MinGit-Bestand.");
  }
  for (const [file, sha256] of installed) {
    if (!SHA256.test(sha256) || previous.get(file)?.sha256 !== sha256) throw new Error(`MinGit-Datei weicht vom belegten Herstellerbestand ab: ${file}`);
  }

  const archives = new Map();
  function addArchive(asset, signature, directory = "") {
    const { name, sha256 } = asset;
    if (!/^[\w.+~-]+\.src\.tar\.(?:gz|zst)$/.test(name) || signature.name !== `${name}.sig`
      || !SHA256.test(sha256) || !SHA256.test(signature.sha256) || archives.has(name)) {
      throw new Error(`MinGit-Quellarchiv oder Signatur nicht eindeutig: ${name}`);
    }
    archives.set(name, { path: `${directory}${name}`, sha256, signature: { path: `${directory}${signature.name}`, sha256: signature.sha256 } });
  }
  const core = gfw.packages.find(pkg => pkg.archive.name === coreArchive)?.archive;
  if (!core || !releaseSignatures.some(entry => entry.asset === coreArchive && entry.validSignature === true)) {
    throw new Error("Der signierte Git-Kern fehlt im Herstellernachweis.");
  }
  addArchive(core, { name: `${coreArchive}.sig`, sha256: pin.sourceCompanion.evidence[`${coreArchive}.sig`] });
  for (const proof of gfwSignatures) {
    if (proof.validSignature !== true) throw new Error(`Signaturprüfung fehlt: ${proof.archive}`);
    addArchive({ name: proof.archive, sha256: proof.archiveSha256 },
      { name: `${proof.archive}.sig`, sha256: proof.signatureSha256 }, "package-sources/");
  }
  for (const { source, signature } of msysSignatures.packages) addArchive(source, signature, "upstream-msys2/source-archives/");
  for (const { asset, signature } of extraSignatures.packages) {
    if (asset.name.includes(".src.tar.")) addArchive(asset, signature, "packaging-evidence/");
  }

  const files = new Map(), usedArchives = new Set();
  function cover(file, { archive, ...details }) {
    const sha256 = installed.get(file);
    if (!sha256 || files.has(file)) throw new Error(`MinGit-Quellenzuordnung ist nicht eindeutig: ${file}`);
    if (archive) {
      usedArchives.add(archive.name);
      if (archives.get(archive.name)?.sha256 !== archive.sha256) throw new Error(`MinGit-Quellarchiv fehlt oder weicht ab: ${archive.name}`);
    }
    files.set(file, { path: file, sha256, ...details, ...(archive && { sourceArchive: archives.get(archive.name).path }) });
  }
  for (const { package: name, version, archive, installerFiles } of gfw.packages) {
    for (const file of installerFiles) {
      if (!previous.get(file)?.candidateOwners.some(candidate => candidate.package === name && candidate.version === version)) {
        throw new Error(`Git-for-Windows-Paketzuordnung hat sich geändert: ${file}`);
      }
      cover(file, { method: "git-for-windows", package: name, version, archive });
    }
  }
  for (const match of msys.fileMatches) {
    if (match.fileSha256 !== installed.get(match.installerPath)) throw new Error(`MSYS2-Datei stimmt nicht überein: ${match.installerPath}`);
    cover(match.installerPath, { method: "msys2-byte-match", package: match.package, version: match.version, archive: match.archive });
  }
  for (const entry of packaging.files) {
    if (entry.sha256 !== installed.get(entry.installerPath)) throw new Error(`MinGit-Verpackungseingabe stimmt nicht überein: ${entry.installerPath}`);
    const archive = entry.sourceArchive ? { name: entry.sourceArchive, sha256: archives.get(entry.sourceArchive)?.sha256 } : null;
    if (entry.sourceArchive && !archive.sha256) throw new Error(`MinGit-Quellarchiv zur Verpackung fehlt: ${entry.sourceArchive}`);
    cover(entry.installerPath, { method: entry.method, package: entry.package, version: entry.version,
      archive, ...(entry.input && { input: `packaging-evidence/vendor-inputs/${entry.input}` }) });
  }
  if (files.size !== runtimeFileCount || archives.size !== archiveCount || usedArchives.size !== archiveCount) {
    throw new Error("Die MinGit-Beilage deckt den gebundenen Datei- und Archivbestand nicht vollständig ab.");
  }
  const inputs = [
    ...Object.entries(packaging.inputs).map(([name, value]) => ({ path: `packaging-evidence/vendor-inputs/${name}`, sha256: value.sha256 })),
    ...keyring.files.map(file => ({ path: `upstream-msys2/${file.file}`, sha256: file.sha256 })),
  ];
  return { installed: [...files.values()].sort((a, b) => a.path.localeCompare(b.path, "en")), archives: [...archives.values()], inputs };
}
