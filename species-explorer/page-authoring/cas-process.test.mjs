import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { fixture } from './test-fixture.mjs';
import { clone,fingerprint } from './contract.mjs';
test('two real independent Node writers preserve one exact SQLite CAS winner',async t=>{
  const f=fixture(t),d=await f.create(),children=[];
  try {
    for(const suffix of ['a','b']) {
      const document=clone(d.document);document.title=`Schreiber ${suffix}`;
      const change={projectId:d.projectId,actorId:`writer-${suffix}`,mutationId:`write-${suffix}`,intentHash:fingerprint({suffix}),id:d.id,expectedRevision:d.revision,document};
      const child=fork(fileURLToPath(new URL('./cas-worker.mjs',import.meta.url)),[JSON.stringify({filename:f.filename,change})],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
      children.push(child);assert.equal((await once(child,'message'))[0].ready,true);
    }
    const outcomes=children.map(child=>once(child,'message').then(([value])=>value));const closes=children.map(child=>once(child,'close'));
    for(const child of children)child.send('write');const results=await Promise.all(outcomes);assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.find(result=>!result.ok).code,'draft_conflict');
    for(const [code] of await Promise.all(closes))assert.equal(code,0);
    assert.equal(f.repository.read('project-a',d.id).sequence,2);assert.equal(f.repository.counts().versions,2);
  } finally {for(const child of children)if(child.exitCode===null){child.kill();await once(child,'close');}}
});
