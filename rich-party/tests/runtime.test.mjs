import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=(ws,fn=()=>true,timeout=8000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.removeEventListener('message',listener);reject(Error('Snapshot timeout'));},timeout);function listener(e){try{const b=JSON.parse(e.data);if(b.type==='snapshot'&&fn(b.data)){clearTimeout(timer);ws.removeEventListener('message',listener);resolve(b.data)}}catch{}}ws.addEventListener('message',listener);});
function runtime(persist){return new Miniflare({modules:true,scriptPath:path.join(root,'.check/worker.js'),compatibilityDate:'2026-05-22',durableObjects:{ROOMS:{className:'GameRoom',useSQLite:true}},durableObjectsPersist:persist,serviceBindings:{ASSETS:async req=>{try{const pathname=new URL(req.url).pathname;const data=await readFile(path.join(root,'public',pathname==='/'?'index.html':pathname));return new Response(data)}catch{return new Response('Not Found',{status:404})}}}});}
async function api(mf,token,action,code='',value,extra={}){const r=await mf.dispatchFetch('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action,code,value,name:'玩家'+token.at(-1),...extra})});return{status:r.status,body:await r.json()};}
async function connect(mf,token,code){const r=await mf.dispatchFetch('https://game.test/api/socket?room='+code,{headers:{Upgrade:'websocket'}});assert.equal(r.status,101);const ws=r.webSocket;ws.accept();const p=snapshot(ws);ws.send(JSON.stringify({type:'auth',token}));return{ws,initial:await p};}
test('Cloudflare runtime: authoritative rooms, WebSocket snapshots, alarms, pause/resume and persistent storage',async()=>{
 const persist=await mkdtemp(path.join(tmpdir(),'rich-party-do-'));let mf=runtime(persist);const tokens=Array.from({length:5},(_,i)=>'runtime-integration-player-000'+i);let code;
 try{
 assert.equal((await mf.dispatchFetch('https://game.test/api/health')).status,200);
 assert.equal((await mf.dispatchFetch('https://game.test/')).status,200);
 const created=await api(mf,tokens[0],'create');assert.equal(created.status,200);code=created.body.code;assert.equal(created.body.land.length,40);
 const a=await connect(mf,tokens[0],code);const notice=snapshot(a.ws,x=>x.players.length===2);
 assert.equal((await api(mf,tokens[1],'join',code)).body.me,1);assert.equal((await notice).players.length,2);
 const b=await connect(mf,tokens[1],code);assert.equal(b.initial.me,1);assert(b.initial.players.every(x=>!x.token));
 for(let i=2;i<4;i++)assert.equal((await api(mf,tokens[i],'join',code)).body.me,i);
 assert.equal((await api(mf,tokens[4],'join',code)).status,400);
 assert.equal((await api(mf,tokens[1],'start',code)).status,400);
 const update=snapshot(b.ws,x=>x.status==='playing');assert.equal((await api(mf,tokens[0],'start',code,undefined,{bots:0})).status,200);assert.equal((await update).status,'playing');
 assert.equal((await api(mf,tokens[1],'roll',code)).status,400);
 const results=await Promise.all([api(mf,tokens[0],'roll',code),api(mf,tokens[0],'roll',code)]);assert(results.some(x=>x.status===200));assert(results.some(x=>x.status===400));
 const bad=await mf.dispatchFetch('https://game.test/api/game',{method:'POST',headers:{Origin:'https://attacker.test'},body:JSON.stringify({token:tokens[0],action:'poll',code})});assert.equal(bad.status,403);
 const badWs=await mf.dispatchFetch('https://game.test/api/socket?room='+code,{headers:{Upgrade:'websocket'}});badWs.webSocket.accept();const closed=new Promise(resolve=>badWs.webSocket.addEventListener('close',resolve));badWs.webSocket.send(JSON.stringify({type:'auth',token:'wrong-player-with-no-membership'}));assert.equal((await closed).code,1008);
 a.ws.close();b.ws.close();
 const botToken='server-alarm-integration-player',botCreate=await api(mf,botToken,'create'),botCode=botCreate.body.code;let live=await connect(mf,botToken,botCode);
 await api(mf,botToken,'start',botCode,undefined,{bots:1});
 let state=(await api(mf,botToken,'poll',botCode)).body;
 const before=state.deadline;live.ws.close();await sleep(1200);live=await connect(mf,botToken,botCode);assert(live.initial.deadline>=before+800,'all-offline pause should extend the deadline');
 const alarmResult=snapshot(live.ws,x=>x.current===0&&x.turns>=2);
 let result=(await api(mf,botToken,'roll',botCode)).body;
 if(result.current===0){if(['buy','upgrade'].includes(result.phase))await api(mf,botToken,'skip',botCode);else if(result.phase==='bank'||result.phase==='shop')await api(mf,botToken,'skip',botCode);}
 const advanced=await alarmResult;assert(advanced.turns>=2);live.ws.close();
 const saved=(await api(mf,tokens[0],'poll',code)).body;await mf.dispose();mf=runtime(persist);
 const restored=(await api(mf,tokens[0],'poll',code)).body;assert.equal(restored.code,code);assert.equal(restored.version,saved.version);assert.equal(restored.players.length,4);
 }finally{await mf.dispose();await rm(persist,{recursive:true,force:true});}
});

test('HTTP fallback keeps bot turns moving without a WebSocket', async () => {
 const mf=runtime(false);
 const token='http-fallback-integration-player';
 try {
  const {body:{code}}=await api(mf,token,'create');
  const started=await api(mf,token,'start',code,undefined,{bots:1});
  assert.equal(started.body.players[1].bot,true);
  let {body:state}=await api(mf,token,'roll',code);
  if(state.current===0)({body:state}=await api(mf,token,'skip',code));
  assert.equal(state.current,1);
  const initialTurns=state.turns;
  const end=Date.now()+8000;
  do {
   const reply=await api(mf,token,'poll',code,'heartbeat');
   assert.equal(reply.status,200);
   state=reply.body;
   if(state.current===0&&state.turns>initialTurns)break;
   await sleep(500);
  } while(Date.now()<end);
  assert.equal(state.current,0);
  assert(state.turns>initialTurns);
 } finally {
  await mf.dispose();
 }
});

test('Custom character views persist and reach a room mate over WebSocket', async () => {
 const mf=runtime(false);
 const host='character-integration-host-token',guest='character-integration-guest-token';
 const character={
  front:'data:image/webp;base64,UklGRkwAAABXRUJQVlA4IEAAAABwAwCdASogACAAPm00lkekIyIhKAgAgA2JZQDKLoB+AABBlBAA/vCbQ//ILlhdcjX/8gP+QH/ID/+PfYwoMAAA',
  side:'data:image/webp;base64,UklGRkYAAABXRUJQVlA4IDoAAABQAwCdASogACAAPm00lkekIyIhKAgAgA2JZQB2APwAAIMoIAD+8LA3//5BcsLrka//+bArmufmoAAA',
  back:'data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAAAQAwCdASogACAAPm00lkekIyIhKAgAgA2JZQB2AACAoKAA/vkd2//+QH/+QH/+QH/8gP/+IXeyAwAAAAA='
 };
 try {
  const invalid=await api(mf,host,'create','',undefined,{character:{...character,back:'data:image/svg+xml;base64,AAAA'}});
  assert.equal(invalid.status,400);
  const oversized=await api(mf,host,'create','',undefined,{character:{...character,back:'data:image/webp;base64,UklGRmAAAABXRUJQVlA4IFQAAADQBQCdASphAGEAPm02mUmkIyKhIKgAgA2JaW7hc+lwAAE97iLywDXU3uIvLANdTe4i8sA11N6IAP7/Pgf//8gP/8gP/8gP/5Af/8Qu9kBgAAAAAAA='}});
  assert.equal(oversized.status,400);
  const created=await api(mf,host,'create','',undefined,{character});
  assert.equal(created.status,200);
  const code=created.body.code;
  assert.deepEqual(created.body.players[0].character,character);
  const hostConnection=await connect(mf,host,code);
  const guestCharacter={...character,front:character.back};
  const guestArrives=snapshot(hostConnection.ws,s=>s.players.length===2);
  const joined=await api(mf,guest,'join',code,undefined,{character:guestCharacter});
  assert.equal(joined.status,200);
  assert.deepEqual(joined.body.players[0].character,character);
  assert.deepEqual((await guestArrives).players[1].character,guestCharacter);
  hostConnection.ws.close();
  const reloaded=await api(mf,guest,'poll',code);
  assert.deepEqual(reloaded.body.players[1].character,guestCharacter);
 } finally {
  await mf.dispose();
 }
});
