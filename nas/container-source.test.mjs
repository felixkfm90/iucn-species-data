import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
async function sourceFiles() {
  const docker = await fs.readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  return docker.split(/\r?\n/).filter((line) => line.startsWith("COPY ")).flatMap((line) => {
    const parts = line.slice(5).trim().split(/\s+/), target = parts.pop().replace(/^\.\//, "");
    return parts.map((source) => {
      assert.match(source, /^(?:species-explorer|nas|scripts)\/[a-z0-9./-]+\.mjs$/);
      assert.ok(!source.includes("..") && !source.endsWith(".test.mjs"));
      assert.equal(target.endsWith("/") ? `${target}${path.posix.basename(source)}` : target, source, "Die Laufzeitstruktur muss unverändert bleiben.");
      return source;
    });
  });
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-container-source-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  for (const file of await sourceFiles()) {
    const target = path.join(root, file); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(repoRoot, file), target);
  }
  return root;
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("NAS-Containerlaufzeit enthält sämtliche tatsächlichen Importabhängigkeiten ohne lokalen Checkout-Rückfall", async (t) => {
  const root = await fixture(t);
  const urls = ["species-explorer/shared-project/cli.mjs", "species-explorer/shared-project/species-record.mjs", "nas/snapshot.mjs", "nas/bootstrap-personal.mjs"].map((file) => pathToFileURL(path.join(root, file)).href);
  const script = `${urls.map((url) => `await import(${JSON.stringify(url)});`).join(" ")} console.log('runtime-imports-ok');`;
  const result = await run(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], root);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout.trim(), "runtime-imports-ok");
  assert.deepEqual((await fs.readdir(root)).sort(), ["nas", "scripts", "species-explorer"], "Ein Import legt keine fachlichen Daten an.");
});

test("Docker-Positivliste erlaubt exakt die ausdrücklich kopierten Module und keinen privaten Bestand", async () => {
  const lines = (await fs.readFile(new URL("../.dockerignore", import.meta.url), "utf8")).trim().split(/\r?\n/);
  assert.equal(lines[0], "**");
  const allowedFiles = lines.slice(1).map((line) => { assert.match(line, /^![a-zA-Z0-9./-]+$/); return line.slice(1); }).filter((file) => !file.endsWith("/"));
  assert.deepEqual(allowedFiles.sort(), ["nas/Dockerfile", ...await sourceFiles()].sort());
});

test("isolierte NAS-Laufzeit schützt Katalog und gebundene Artanlage einschließlich Doppelanlagen", async (t) => {
  const root = await fixture(t);
  const url = (file) => JSON.stringify(pathToFileURL(path.join(root, file)).href);
  const script = `
    const { createSharedProjectStore } = await import(${url("species-explorer/shared-project/store.mjs")});
    const { createSharedProjectHttp } = await import(${url("species-explorer/shared-project/http.mjs")});
    const { projectSpeciesEnrichment, SPECIES_ENRICHMENT_MARKER } = await import(${url("species-explorer/shared-project/species-enrichment.mjs")});
    const { digest, objectJson } = await import(${url("species-explorer/shared-project/security.mjs")});
    const store = createSharedProjectStore({ filename: ${JSON.stringify(path.join(root, "synthetic.sqlite"))}, localStorageConfirmed: true });
    let http;
    try {
      await store.bootstrap({ confirmed: true, users: [
        {username:'fixture-alpha',displayName:'Synthetic Alpha',password:'Synthetic test password alpha'},
        {username:'fixture-beta',displayName:'Synthetic Beta',password:'Synthetic test password beta'}
      ] });
      const session = await store.login({username:'fixture-alpha',password:'Synthetic test password alpha'});
      http = createSharedProjectHttp({store,port:0});
      const address = await http.listen(), url = 'http://' + address.host + ':' + address.port + '/api/v1/catalog';
      const denied = await fetch(url), allowed = await fetch(url,{headers:{Authorization:'Bearer ' + session.token}});
      const catalog = await allowed.json();
      const api = url.slice(0, -'catalog'.length), headers = {Authorization:'Bearer ' + session.token,'Content-Type':'application/json'};
      const support = await (await fetch(api+'capabilities',{headers})).json(), me = store.me(session.token);
      const record = {type:'fn-species-record',schemaVersion:1,id:'isolated-owl',
        input:{german:'Isolierter Testkauz',english:'Isolated owl',genus:'Strix',species:'insularis',size:'30 cm',weight:'300 g',life_expectancy:'10 Jahre'},
        generated:null,taxonomyOverride:null,assessmentBinding:null,
        assets:{assetName:'Isolierter Testkauz',files:{},overrides:{},credits:null,portraitMetadata:null},
        editorial:{websiteUrl:null,sections:[],gallery:[],generalSectionId:null,embeddedGeneralText:null}};
      const binding = {boundSpeciesCreation:true,expectedProjectId:me.projectId,expectedUserId:me.id,expectedRole:me.role,expectedUserVersion:me.version};
      const created = await fetch(api+'objects',{method:'POST',headers,body:JSON.stringify({kind:'species',id:record.id,data:record,...binding})});
      const original = await created.json();
      const second = structuredClone(record); second.id='another-isolated-owl'; second.input.german='Andere Art'; second.assets.assetName='Andere Art';
      const duplicate = await fetch(api+'objects',{method:'POST',headers,body:JSON.stringify({kind:'species',id:second.id,data:second,...binding})});
      const rejection = await duplicate.json();
      const iucnBinding = {scientificName:'Ciccaba insularis',queriedName:'Ciccaba insularis',matchedBy:'master-synonym',taxonId:'123'};
      const result = {generated:{Family:'Strigidae','Taxon ID':'123','IUCN-Zuordnung':iucnBinding},files:{},credits:null,assessmentBinding:null};
      const proposed = projectSpeciesEnrichment({speciesObject:original,projectId:me.projectId,result});
      const change = {changeId:'isolated-nas-proposal',kind:'species',id:record.id,baseRevision:original.revision,enrichment:{schemaVersion:1,
        actor:{projectId:me.projectId,userId:me.id,role:me.role,userVersion:me.version},sourceBindings:proposed.sourceBindings,
        result,targetDataHash:digest(objectJson(proposed.data))}};
      const adoption = await fetch(api+'changes',{method:'POST',headers:{...headers,'X-Shared-Object-Type':SPECIES_ENRICHMENT_MARKER},body:JSON.stringify(change)});
      const adopted = await adoption.json();
      const stored = store.getObject(session.token,'species',record.id);
      console.log(JSON.stringify({denied:denied.status,allowed:allowed.status,species:catalog.species.length,
        speciesCreation:support.speciesCreation,created:created.status,duplicate:duplicate.status,code:rejection.error?.code,
        speciesEnrichment:support.speciesEnrichment,adopted:adoption.status,adoptedOrdinal:adopted.object?.ordinal,
        scientificName:[stored.data.input.genus,stored.data.input.species].join(' '),
        iucnBinding:stored.data.generated?.['IUCN-Zuordnung'],approval:stored.approval}));
    } finally { await http?.close(); store.close(); }
  `;
  const result = await run(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], root);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { denied: 401, allowed: 200, species: 0, speciesCreation: 1, created: 201,
    duplicate: 409, code: "species_identity_exists", speciesEnrichment: 1, adopted: 200, adoptedOrdinal: 2,
    scientificName: "Strix insularis",
    iucnBinding: { scientificName: "Ciccaba insularis", queriedName: "Ciccaba insularis", matchedBy: "master-synonym", taxonId: "123" },
    approval: "draft" });
});
