import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertTestTempPath, closeEmptyTestTempSession, tmpdir } from "../scripts/test-temp.mjs";
import { readPackage } from "./install-engine.mjs";
import { verifyWindowsIcon } from "./icon-resource.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let output = "", error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command}: ${code} ${error}`)));
  });
}

async function electronVersions(repo) {
  const runtime = path.join(repo, "node_modules/electron/dist/electron.exe");
  return JSON.parse(await run(runtime, ["-e", "console.log(JSON.stringify(process.versions))"],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }));
}

const executable = process.argv.find((arg) => arg.startsWith("--exe="))?.slice(6);
const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
const previousExecutable = process.argv.find((arg) => arg.startsWith("--previous-exe="))?.slice(15);
assert.ok(path.isAbsolute(executable || "") && path.isAbsolute(reportPath || ""));
assert.ok(previousExecutable === undefined || path.isAbsolute(previousExecutable));
const root = await fs.mkdtemp(path.join(tmpdir(), "setup-smoke-"));
const packageRoot = path.join(root, "extracted"), base = path.join(root, "Niko und Jörg", "Arten Explorer");
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), executable, fixture: root,
  nativeIntegrationExecuted: false, tests: [] };
const check = (name, detail = {}) => report.tests.push({ name, passed: true, ...detail });
try {
  let previous = null;
  if (previousExecutable) {
    const packageDirectory = path.join(root, "previous-extracted"), previousBase = path.join(root, "Previous installation");
    await run(previousExecutable, ["--extract-test", packageDirectory]);
    const previousManifest = await readPackage(packageDirectory);
    const previousEngine = await import(pathToFileURL(path.join(packageDirectory, "program/install-engine.mjs")).href);
    await previousEngine.installPackage({ packageRoot: packageDirectory, base: previousBase, testMode: true });
    previous = { packageId: previousManifest.packageId, base: previousBase };
    await fs.rm(assertTestTempPath(packageDirectory), { recursive: true });
  }
  await run(executable, ["--extract-test", packageRoot]);
  const manifest = await readPackage(packageRoot);
  const { installPackage } = await import(pathToFileURL(path.join(packageRoot, "program/install-engine.mjs")).href);
  check("Compiled setup extracts its entire bound payload without opening UI", { files: manifest.files.length });
  const acceptedIcon = path.join(packageRoot, "program/arten-explorer.ico");
  check("Compiled setup carries every accepted Arten-Explorer icon image byte-for-byte", await verifyWindowsIcon(executable, acceptedIcon));
  check("Compiled application launcher carries every accepted Arten-Explorer icon image byte-for-byte",
    await verifyWindowsIcon(path.join(packageRoot, "program/Arten-Explorer.exe"), acceptedIcon));
  const repo = path.join(packageRoot, "workspace");
  const node = path.join(repo, "runtime/node/node.exe"), git = path.join(repo, "runtime/git/cmd/git.exe");
  assert.equal(await run(node, ["--version"]), "v24.22.1");
  check("Bundled official Node starts headlessly", { version: "24.22.1" });
  const gitVersion = await run(git, ["--version"]);
  assert.match(gitVersion, /2\.56\.0\.windows\.4/);
  const gitPackages = await fs.readFile(path.join(repo, "runtime/git/etc/package-versions.txt"), "utf8");
  check("Bundled official MinGit starts headlessly", { version: gitVersion, packageVersions: gitPackages.trim().split(/\r?\n/) });
  const gitHead = await run(git, ["rev-parse", "HEAD"], { cwd: repo });
  assert.equal(gitHead, manifest.revision);
  assert.equal(await run(git, ["remote", "get-url", "origin"], { cwd: repo }), "https://github.com/felixkfm90/iucn-species-data.git");
  check("Independent shallow Git object pack is readable and contains the public remote", { revision: gitHead });
  const gitFsck = await run(git, ["fsck", "--full", "--no-reflogs"], { cwd: repo });
  check("Bundled Git checks the shallow snapshot without developer-object dependencies", { output: gitFsck });
  const { ffmpeg: mediaPin } = JSON.parse(await fs.readFile(new URL("./dependencies.lock.json", import.meta.url), "utf8"));
  const mediaFiles = new Map(manifest.files.filter((file) => file.path.startsWith("workspace/local-tools/ffmpeg/"))
    .map((file) => [file.path.slice("workspace/local-tools/ffmpeg/".length), file.sha256]));
  for (const [relative, [, sha256]] of Object.entries(mediaPin.files)) {
    assert.equal(mediaFiles.get(relative), sha256, `FFmpeg package binding: ${relative}`);
  }
  assert.equal(mediaFiles.size, Object.keys(mediaPin.files).length + 1);
  assert.ok(mediaFiles.has("README.txt"));
  check("Bundled FFmpeg binaries, source archives, recipes and licenses match the dependency lock", { files: mediaFiles.size });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const result = await run(path.join(repo, "local-tools/ffmpeg/bin", `${name}.exe`), ["-version"]);
    assert.ok(result.startsWith(`${name} version ${mediaPin.version} `));
    check(`Bundled ${name} starts headlessly`, { firstLine: result.split(/\r?\n/)[0] });
  }
  const electronModule = path.join(repo, "node_modules/electron");
  const { version: expectedElectron } = JSON.parse(await fs.readFile(path.join(electronModule, "package.json"), "utf8"));
  assert.match(expectedElectron, /^\d+\.\d+\.\d+$/);
  assert.equal((await fs.readFile(path.join(electronModule, "dist/version"), "utf8")).trim(), expectedElectron);
  const versions = await electronVersions(repo);
  assert.equal(versions.electron, expectedElectron);
  check("Bundled Electron runs only as headless Node; no window or Explorer starts", { electron: versions.electron, embeddedNode: versions.node });
  const importProbe = `
    const assert = (await import('node:assert/strict')).default;
    const {randomUUID} = await import('node:crypto');
    const path = await import('node:path'), {pathToFileURL} = await import('node:url');
    const load = name => import(pathToFileURL(path.join(process.cwd(),name)).href);
    for (const name of ['species-explorer/server.mjs','species-explorer/shared-project/client-normal-media.mjs',
      'species-explorer/shared-project/local-normal-media.mjs','species-explorer/shared-project/reader-approval.mjs'])
      await load(name);
    const {createSharedProjectStore} = await load('species-explorer/shared-project/store.mjs');
    const {editorialIntegrationFixture} = await load('species-explorer/shared-project/editorial-integration-fixtures.mjs');
    const {projectSpeciesEnrichment} = await load('species-explorer/shared-project/species-enrichment.mjs');
    const {digest,objectJson} = await load('species-explorer/shared-project/security.mjs');
    const {DatabaseSync} = await import('node:sqlite');
    const filename=process.argv[1], store=createSharedProjectStore({filename,localStorageConfirmed:true});
    const schemaVersion=()=>{
      const db=new DatabaseSync(filename,{readOnly:true});
      try {return db.prepare('PRAGMA user_version').get().user_version;} finally {db.close();}
    };
    try {
      assert.equal(schemaVersion(),6);
      const password='Synthetic-'+randomUUID();
      const username='fixture-admin-a';
      await store.bootstrap({confirmed:true,users:[{username,displayName:'Synthetic A',password},
        {username:'fixture-admin-b',displayName:'Synthetic B',password}]});
      const login=await store.login({username,password});
      const {speciesObject}=editorialIntegrationFixture(store,login);
      store.approveObject(login.token,'species',speciesObject.id,{expectedRevision:speciesObject.revision});
      assert.equal(schemaVersion(),6);
      const result={generated:{Family:'Strigidae'},files:{},credits:null,assessmentBinding:null};
      const {data,sourceBindings,complete}=projectSpeciesEnrichment({speciesObject,projectId:login.projectId,result});
      assert.equal(complete,true);
      const change=store.submitChange(login.token,{changeId:'package-smoke-enrichment',kind:'species',id:speciesObject.id,
        baseRevision:speciesObject.revision,enrichment:{schemaVersion:1,actor:{projectId:login.projectId,
          userId:login.user.id,role:login.user.role,userVersion:login.user.version},sourceBindings,result,targetDataHash:digest(objectJson(data))}});
      assert.equal(change.status,'applied');
      assert.equal(change.object.data.generated.Family,'Strigidae');
      assert.equal(change.object.approval,'draft');
      assert.equal(change.object.approvedRevision,speciesObject.revision);
      assert.equal(schemaVersion(),7);
    } finally {store.close();}
    const reopened=createSharedProjectStore({filename,localStorageConfirmed:true});
    try {assert.equal(schemaVersion(),7);} finally {reopened.close();}
    console.log('bound-explorer-source-and-schema6-to-7-ok');
  `;
  const importEnvironment = { ...process.env, FN_EXPLORER_DATA_ROOT: path.join(root, "import-data"),
    IUCN_TAXONOMY_DIR: path.join(root, "import-data", "taxonomy"), FN_LIGHTROOM_SEARCH_ROOT: path.join(root, "import-data", "lightroom") };
  assert.equal(await run(node, ["--no-warnings", "--input-type=module", "-e", importProbe, path.join(root, "node-source.sqlite")],
    { cwd: repo, env: importEnvironment }), "bound-explorer-source-and-schema6-to-7-ok");
  check("Bundled Node loads the Explorer, moves the synthetic shared store from schema 6 to 7 and retains reader approval");
  assert.equal(await run(path.join(repo, "node_modules/electron/dist/electron.exe"),
    ["--no-warnings", "--input-type=module", "-e", importProbe, path.join(root, "electron-source.sqlite")],
    { cwd: repo, env: { ...importEnvironment, ELECTRON_RUN_AS_NODE: "1" } }), "bound-explorer-source-and-schema6-to-7-ok");
  check("Bundled Electron's embedded Node performs the same shared store transition without a window");
  const personalProbe = `
    const assert = (await import('node:assert/strict')).default;
    const path = await import('node:path'), {pathToFileURL} = await import('node:url');
    const load = name => import(pathToFileURL(path.join(process.cwd(),name)).href);
    await load('species-explorer/page-authoring/explorer-session.mjs');
    await load('species-explorer/shared-project/project-journal-backup.mjs');
    const {createSharedProjectClientStore} = await load('species-explorer/shared-project/client-store.mjs');
    const filename=process.argv[1]; let cache=createSharedProjectClientStore({filename,localStorageConfirmed:true});
    let binding;
    try {
      binding=cache.bind({baseUrl:'https://package-smoke.invalid',projectId:'synthetic-project',
        user:{id:'synthetic-user',username:'synthetic',displayName:'Synthetische Paketprobe',role:'publisher'}});
      cache.saveObjects(binding.id,[{kind:'page',id:'synthetic-page',revision:'synthetic-server-revision',approval:'draft',data:{title:'Bisheriger Prüftext'}}]);
      cache.edit(binding.id,'page','synthetic-page',{title:'Erhaltener offener Prüftext'});
    } finally {cache.close();}
    cache=createSharedProjectClientStore({filename,localStorageConfirmed:true});
    try {
      assert.equal(cache.active().id,binding.id);
      assert.equal(cache.get(binding.id,'page','synthetic-page').data.title,'Erhaltener offener Prüftext');
      assert.equal(cache.get(binding.id,'page','synthetic-page').localPending,true);
      assert.equal(cache.counts(binding.id).pending,1);
    } finally {cache.close();}
    const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(filename,{readOnly:true});
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
      for(const table of ['normal_blobs','normal_media'])assert.equal(db.prepare('SELECT count(*) AS n FROM '+table).get().n,0);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    } finally {db.close();}
    const {createSqlitePageAuthoringRepository}=await load('species-explorer/page-authoring/repository.mjs');
    const pages=createSqlitePageAuthoringRepository({filename:filename+'.pages.sqlite',localStorageConfirmed:true});
    try {assert.equal(pages.schemaVersion,1);assert.equal(pages.counts().cms_attempts,0);}finally{pages.close();}
    const {initialDocument,normalizeSpeciesSnapshot}=await load('species-explorer/page-authoring/model.mjs');
    const {composePage}=await load('species-explorer/page-authoring/compose.mjs');
    const {fingerprint}=await load('species-explorer/page-authoring/contract.mjs');
    const {createCmsReadbackExpectation,verifyCmsReadbackProof}=await load('species-explorer/page-authoring/cms-readback.mjs');
    const species=normalizeSpeciesSnapshot({slug:'synthetic-species',scientificName:'Synthetica probatio',commonName:'Synthetische Art',
      taxonomy:[],general:[],status:'',revision:'synthetic-source',dataSha256:'a'.repeat(64),runtimeReady:false,normalAssets:{}},'synthetic-project','synthetic-species');
    const document=initialDocument({templateId:'fn-compact-20261031',species,parentPath:'/wildlife/heimische-tierwelt'});
    const structure=composePage({id:'synthetic-page',revision:'b'.repeat(64),contentHash:fingerprint(document),document},new Map()).structure;
    const expected=createCmsReadbackExpectation(document,structure),observation={schemaVersion:1,observationId:'synthetic-observation',
      page:{id:'synthetic-cms-page',path:expected.path,title:expected.title,enabled:false,saved:true,reopened:true},blocks:structuredClone(expected.blocks)};
    const proof={document,structure,expected,observation,mediaBindings:[]};
    assert.match(verifyCmsReadbackProof(proof).observationHash,/^[a-f0-9]{64}$/);
    observation.page.enabled=true;
    assert.throws(()=>verifyCmsReadbackProof(proof),error=>error.code==='cms_readback_mismatch');
    console.log('personal-cache4-journal-and-cms2-ok');
  `;
  for (const [name, executablePath, extraEnvironment] of [["Node", node, {}],
    ["Electron embedded Node", path.join(repo, "node_modules/electron/dist/electron.exe"), { ELECTRON_RUN_AS_NODE: "1" }]]) {
    assert.equal(await run(executablePath, ["--no-warnings", "--input-type=module", "-e", personalProbe, path.join(root, `${name.split(" ")[0]}-personal.sqlite`)],
      { cwd: repo, env: { ...importEnvironment, ...extraEnvironment } }), "personal-cache4-journal-and-cms2-ok");
    check(`Bundled ${name} preserves personal cache4 offline edits and checks the full CMS2 readback contract without UI or network`);
  }
  if (previous) {
    assert.notEqual(previous.packageId, manifest.packageId);
    const previousRepo = path.join(previous.base, "workspace"), privateDirectory = path.join(previousRepo, "data");
    await fs.mkdir(privateDirectory);
    const privateFile = path.join(privateDirectory, "previous-synthetic.sqlite");
    const seedFile = path.join(previousRepo, "species_list.json");
    const privateContent = Buffer.from("Synthetic private bytes in the earlier installation");
    const seedContent = Buffer.from("Synthetic species edit in the earlier installation");
    await fs.writeFile(privateFile, privateContent);
    await fs.writeFile(seedFile, seedContent);
    const previousHead = await run(git, ["rev-parse", "HEAD"], { cwd: previousRepo });
    const oldVersions = await electronVersions(previousRepo);
    const update = await installPackage({ packageRoot, base: previous.base, testMode: true });
    assert.ok(update.writes > 0);
    assert.deepEqual(await fs.readFile(privateFile), privateContent);
    assert.deepEqual(await fs.readFile(seedFile), seedContent);
    assert.equal(await run(git, ["rev-parse", "HEAD"], { cwd: previousRepo }), previousHead);
    const updatedVersions = await electronVersions(previousRepo);
    assert.equal(updatedVersions.electron, expectedElectron);
    const updatedModule = "workspace/species-explorer/shared-project/species-enrichment.mjs";
    const updatedBytes = await fs.readFile(path.join(previous.base, updatedModule));
    assert.equal(crypto.createHash("sha256").update(updatedBytes).digest("hex"), manifest.files.find(file => file.path === updatedModule).sha256);
    check("Actual previous setup upgrades to the new payload while retaining private bytes, seed edits and Git HEAD", {
      from: previous.packageId, to: manifest.packageId, writes: update.writes, electronFrom: oldVersions.electron, electronTo: updatedVersions.electron,
    });
    await fs.rm(assertTestTempPath(previous.base), { recursive: true });
  }
  const installed = await installPackage({ packageRoot, base, testMode: true });
  check("Real complete payload installs under a new Unicode/space test path", { writes: installed.writes });
  const installedRepo = path.join(base, "workspace");
  const mediaProbe = `
    const assert=(await import('node:assert/strict')).default;
    const {execFileSync}=await import('node:child_process');
    const {readFile}=await import('node:fs/promises');
    const path=await import('node:path'),{pathToFileURL}=await import('node:url');
    const load=name=>import(pathToFileURL(path.join(process.cwd(),'scripts',name)).href);
    const {resolveFfmpegPath,renderSpectrogram}=await load('spectrogram-renderer.mjs');
    const {probeSoundDuration,renderSoundSegments}=await load('sound-segment-editor.mjs');
    const fixture=process.argv[1], source=path.join(fixture,'media-source.mp3');
    const cut=path.join(fixture,'media-cut.mp3'), spectrum=path.join(fixture,'media-spectrum.webp');
    const ffmpegPath=resolveFfmpegPath();
    assert.equal(ffmpegPath,path.join(process.cwd(),'local-tools','ffmpeg','bin','ffmpeg.exe'));
    execFileSync(ffmpegPath,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1.5','-c:a','libmp3lame',source],{windowsHide:true});
    const durationSeconds=await probeSoundDuration({inputPath:source,ffmpegPath});
    assert.ok(durationSeconds>=1.5&&durationSeconds<1.7);
    await renderSoundSegments({inputPath:source,outputPath:cut,ffmpegPath,durationSeconds,segments:[{start:0.2,end:0.8}]});
    const cutDuration=await probeSoundDuration({inputPath:cut,ffmpegPath});
    assert.ok(cutDuration>=0.6&&cutDuration<0.75);
    await renderSpectrogram({inputPath:cut,outputPath:spectrum,ffmpegPath});
    const bytes=await readFile(spectrum);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
    console.log(JSON.stringify({sourceDuration:durationSeconds,cutDuration,spectrumBytes:bytes.length}));
  `;
  const installedNode = path.join(installedRepo, "runtime", "node", "node.exe");
  const mediaResult = JSON.parse(await run(installedNode, ["--input-type=module", "-e", mediaProbe, root],
    { cwd: installedRepo, env: { ...process.env, PATH: "", FFMPEG_PATH: "" } }));
  check("Installed media tools resolve without a system PATH and produce an MP3 cut and a WebP spectrogram", mediaResult);
  const pluginDirectory = path.join(installedRepo, "lightroom-plugin", "FNWildlifeTaxonomy.lrplugin");
  const pluginInfo = await fs.readFile(path.join(pluginDirectory, "Info.lua"), "utf8");
  assert.match(pluginInfo, /LrToolkitIdentifier\s*=\s*"de\.fnwildlifetravel\.taxonomy"/);
  const pluginVersion = pluginInfo.match(/VERSION\s*=\s*\{\s*major\s*=\s*(\d+),\s*minor\s*=\s*(\d+),\s*revision\s*=\s*(\d+),\s*build\s*=\s*(\d+),?\s*\}/)?.slice(1).join(".");
  assert.ok(pluginVersion);
  const request = path.join(root, "lightroom-ping-request.json"), response = path.join(root, "lightroom-ping-response.json");
  await fs.writeFile(request, JSON.stringify({ command: "ping", requestId: "installed-plugin-probe" }), { flag: "wx" });
  await run(installedNode, ["--no-warnings", path.join(installedRepo, "species-explorer", "lightroom-search-helper.mjs"),
    `--request=${request}`, `--response=${response}`, `--search-root=${path.join(root, "empty-search-fixture")}`],
  { cwd: pluginDirectory, env: { ...process.env, PATH: "" } });
  assert.deepEqual(JSON.parse(await fs.readFile(response, "utf8")), { ok: true, requestId: "installed-plugin-probe",
    result: { service: "fn-lightroom-taxonomy-search", protocolVersion: 1 } });
  check("Installed Lightroom plug-in and its search helper are present and the bundled Node answers without a system PATH", { pluginVersion, protocolVersion: 1 });
  const languageProbe = `
    const assert=(await import('node:assert/strict')).default;
    const path=await import('node:path'),{pathToFileURL}=await import('node:url'),{spawn}=await import('node:child_process');
    const repoRoot=process.cwd();
    const {createLanguageCheckService}=await import(pathToFileURL(path.join(repoRoot,'species-explorer/language-check/service.mjs')).href);
    const environment={...process.env,PATH:'',JAVA_HOME:'',FN_EXPLORER_INSTALLED:'1'};
    let child;
    const service=createLanguageCheckService({repoRoot,environment,spawnImpl(command,args,options){
      assert.equal(command,path.join(repoRoot,'runtime','java','bin','java.exe'));
      assert.ok(args.includes('org.languagetool.server.FNManagedLanguageTool'));
      child=spawn(command,args,options);
      return child;
    }});
    let spellingProposal, pluralProposal;
    try {
      const status=await service.status();
      assert.equal(status.available,true,JSON.stringify(status));
      const spellingText='Der Vogeel sitzt auf einem Ast.';
      const spelling=await service.check({text:spellingText});
      assert.equal(spelling.available,true,JSON.stringify(spelling));
      spellingProposal=spelling.findings.find(finding=>finding.kind==='spelling'&&spellingText.slice(finding.start,finding.end)==='Vogeel')?.replacement;
      assert.equal(spellingProposal,'Vogel',JSON.stringify(spelling));
      assert.ok(spelling.findings.some(finding=>finding.replacement==='Vogel'&&finding.alternative==='Vögel'),JSON.stringify(spelling));
      const plural=await service.check({text:'Die Vogeel sitzen auf einem Ast.'});
      assert.equal(plural.available,true,JSON.stringify(plural));
      pluralProposal=plural.findings.find(finding=>finding.kind==='spelling')?.replacement;
      assert.equal(pluralProposal,'Vögel',JSON.stringify(plural));
      assert.ok(!plural.findings.some(finding=>finding.alternative==='Vogel'),JSON.stringify(plural));
      const capitalization=await service.check({text:'Ich sehe einen vogel am Fluss.'});
      assert.equal(capitalization.available,true,JSON.stringify(capitalization));
      assert.ok(capitalization.findings.some(finding=>finding.replacement==='Vogel'));
      const text='Der Vogel fliegt davon weil es regnet.';
      const punctuation=await service.check({text});
      assert.equal(punctuation.available,true,JSON.stringify(punctuation));
      assert.ok(punctuation.findings.reduceRight((result,finding)=>result.slice(0,finding.start)+finding.replacement+result.slice(finding.end),text).includes(', weil'));
      const caption=await service.check({text:'Eisvogel auf einem Ast',context:'caption'});
      assert.equal(caption.available,true,JSON.stringify(caption));
      assert.deepEqual(caption.findings,[]);
      const relativeText='Ein Vogel der auf einem Ast sitzt';
      const relative=await service.check({text:relativeText,context:'caption'});
      assert.equal(relative.available,true,JSON.stringify(relative));
      const corrected=relative.findings.reduceRight((result,finding)=>result.slice(0,finding.start)+finding.replacement+result.slice(finding.end),relativeText);
      assert.equal(corrected,'Ein Vogel, der auf einem Ast sitzt',JSON.stringify(relative));
      const genitive=await service.check({text:'Ein Vogel der Gattung Acanthis',context:'caption'});
      assert.equal(genitive.available,true,JSON.stringify(genitive));
      assert.ok(genitive.findings.every(finding=>finding.kind!=='punctuation'),JSON.stringify(genitive));
    } finally {
      const closed=await service.close();
      if(child){
        assert.equal(closed.lastExit?.code,0,JSON.stringify(closed));
        assert.equal(child.exitCode,0);
      }
    }
    console.log(JSON.stringify({available:true,spellingProposal,pluralProposal,capitalization:true,comma:true,shortCaption:true,relativeCaptionComma:true}));
  `;
  const languageResult = JSON.parse(await run(path.join(installedRepo, "node_modules/electron/dist/electron.exe"), ["--no-warnings", "--input-type=module", "-e", languageProbe],
    { cwd: installedRepo, env: { ...importEnvironment, ELECTRON_RUN_AS_NODE: "1" } }));
  assert.equal(languageResult.available, true);
  check("Fresh installation checks singular and plural spellings, capitalization, commas and short captions with its bundled Java and LanguageTool", languageResult);
  await fs.mkdir(path.join(base, "workspace/data"));
  const protectedFile = path.join(base, "workspace/data/protected.sqlite");
  await fs.writeFile(protectedFile, "synthetic fixture only - no database connection");
  await fs.writeFile(path.join(base, "workspace/species_list.json"), "synthetic user modification");
  const immutable = path.join(base, "workspace/runtime/node/LICENSE.txt");
  await fs.rm(immutable);
  const repaired = await installPackage({ packageRoot, base, operation: "repair", testMode: true });
  assert.ok(repaired.writes >= 1);
  assert.equal(await fs.readFile(path.join(base, "workspace/species_list.json"), "utf8"), "synthetic user modification");
  check("Full-payload repair restores a missing program companion and retains own species edits");
  const changedRelative = "workspace/PROGRAMME-UND-EINRICHTUNG.txt";
  const changedSource = path.join(packageRoot, changedRelative);
  await fs.appendFile(changedSource, "\r\nSynthetic update marker for this private fixture.\r\n");
  const changedBytes = await fs.readFile(changedSource);
  const changedEntry = manifest.files.find((entry) => entry.path === changedRelative);
  changedEntry.bytes = changedBytes.length;
  changedEntry.sha256 = crypto.createHash("sha256").update(changedBytes).digest("hex");
  manifest.packageId += "-smoke-update";
  await fs.writeFile(path.join(packageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await installPackage({ packageRoot, base, testMode: true });
  assert.match(await fs.readFile(path.join(base, changedRelative), "utf8"), /Synthetic update marker/);
  assert.equal(await fs.readFile(path.join(base, "workspace/species_list.json"), "utf8"), "synthetic user modification");
  check("Full-payload update applies a new bound program companion while retaining user edits");
  const protectedBefore = crypto.createHash("sha256").update(await fs.readFile(protectedFile)).digest("hex");
  const openTransaction = path.join(base, `.installer-transaction-${crypto.randomUUID()}`);
  const openBackup = path.join(openTransaction, "synthetic-backup.txt");
  const backupContents = "synthetic rollback backup";
  await fs.mkdir(openTransaction);
  await fs.writeFile(openBackup, backupContents);
  await assert.rejects(installPackage({ base, operation: "uninstall", testMode: true }), /Rücknahme einer früheren Einrichtung/);
  assert.equal(await fs.readFile(openBackup, "utf8"), backupContents);
  await fs.access(path.join(base, "program/Arten-Explorer.exe"));
  await fs.unlink(openBackup);
  await fs.rmdir(openTransaction);
  check("The packaged engine preserves a previous rollback backup and blocks uninstall until the transaction is resolved");
  await installPackage({ base, operation: "uninstall", testMode: true });
  assert.equal(crypto.createHash("sha256").update(await fs.readFile(protectedFile)).digest("hex"), protectedBefore);
  await assert.rejects(fs.access(path.join(base, "program/Arten-Explorer.exe")), { code: "ENOENT" });
  check("Full-payload uninstall removes the launcher and retains synthetic protected data byte-for-byte");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  report.fixtureRemoved = true;
  report.ownSessionRemoved = closeEmptyTestTempSession();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
