import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadLaoConfig } from './config.js';
import { createLaoModelSelection, readLaoPreferredModel } from './model-selection.js';
import { startLaoHealthServer } from './health-server.js';

const operator = 'lao-model-test-operator-token-123456789';
test('local model combo selects only installed models and persists its preference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lao-model-selection-'));
  const config = loadLaoConfig({ DEVSPACE_LAO_ENABLED: 'true' });
  const available = ['granite4.2-8b:gpu','qwen2.5-coder:7b','remote:cloud','gemma4:31b-cloud'];
  const selection = createLaoModelSelection(config, dir, async () => available.map(name => ({name})));
  const server = await startLaoHealthServer(config, { port:0, devspaceReady:()=>false,
    dashboard:{ token:operator,listTasks:()=>[],devspaceReady:()=>false,
      listModels:selection.listModels,selectModel:selection.selectModel } });
  const base = 'http://127.0.0.1:' + server.port;
  const auth = { Authorization:'Bearer '+operator };
  const choose = (model:unknown, extra:Record<string,string> = {}) => fetch(base+'/dashboard/api/models/select',{
    method:'POST', headers:{...auth,'content-type':'application/json',...extra},body:JSON.stringify({model}),
  });
  try {
    assert.equal((await fetch(base+'/dashboard/api/models')).status,403);
    const list = await fetch(base+'/dashboard/api/models',{headers:auth});
    assert.equal(list.status,200);
    assert.deepEqual((await list.json()).models,available.slice(0,2));
    assert.equal((await choose('unknown:model')).status,422);
    assert.equal((await choose('remote:cloud')).status,422);
    assert.equal((await choose('bad\nmodel')).status,422);
    assert.equal((await choose(available[1], {Origin:'http://untrusted.invalid'})).status,403);
    assert.equal((await choose(available[1])).status,200);
    assert.equal(config.defaultModel,available[1]);
    assert.equal(JSON.parse(readFileSync(join(dir,'selected-model.json'),'utf8')).model,available[1]);
    assert.equal(readLaoPreferredModel('original:default',{
      DEVSPACE_LAO_STATE_DIR: dir,
    }),available[1], 'the MCP delegate sees the LAO default across processes');
    const restored=loadLaoConfig({DEVSPACE_LAO_ENABLED:'true'});
    await createLaoModelSelection(restored,dir,async()=>available.map(name=>({name}))).restore();
    assert.equal(restored.defaultModel,available[1]);
  } finally { await server.close();rmSync(dir,{recursive:true,force:true}); }
});
