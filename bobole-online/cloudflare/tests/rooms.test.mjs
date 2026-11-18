import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitUntil(fn,ms=8000){const until=Date.now()+ms;while(Date.now()<until){const v=fn();if(v)return v;await pause(10);}throw new Error('Timed out waiting for WebSocket state');}
const options=persist=>({modules:true,scriptPath:'.check/worker.js',compatibilityDate:'2026-05-22',durableObjects:{ROOMS:{className:'BoboleRoom',useSQLite:true}},durableObjectsPersist:persist,assets:{directory:'public',binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}});

test('Workers + SQLite Durable Objects: four modes, WebSockets, isolation, restart, alarms', {timeout:120000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bobole-do-'));let mf=new Miniflare(options(dir));const allSockets=[];
 const get=async(path,cookie)=>{const res=await mf.dispatchFetch('https://example.test/api/'+path,{headers:cookie?{Cookie:cookie}:{}});return {status:res.status,body:await res.json()};};
 const post=async(path,data,cookie,headers={})=>{const res=await mf.dispatchFetch('https://example.test/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(data)});return {status:res.status,body:await res.json(),cookie:res.headers.get('Set-Cookie')?.split(';')[0]};};
 async function socket(cookie){const res=await mf.dispatchFetch('https://example.test/api/ws',{headers:{Cookie:cookie,Upgrade:'websocket'}});assert.equal(res.status,101);const ws=res.webSocket,messages=[];ws.accept();ws.addEventListener('message',ev=>messages.push(JSON.parse(ev.data)));allSockets.push(ws);const watched={ws,messages};await waitUntil(()=>messages.some(m=>m.type==='state'));return watched;}
 async function act(cookie,action,extra={}){await pause(100);const s=(await get('state',cookie)).body;return post('action',{action,version:s.version,...extra},cookie);}
 let persisted;
 try{
  await t.test('same-origin checks, static files, invalid names and unknown game',async()=>{
   assert.equal((await get('health')).status,200);assert.equal((await mf.dispatchFetch('https://example.test/')).status,200);assert.equal((await mf.dispatchFetch('https://example.test/solo')).status,200);
   assert.equal((await post('create',{name:'x',game:'toString'})).status,400);
   assert.equal((await post('create',{name:''})).status,400);assert.equal((await post('create',{name:'x'},{},{Origin:'https://evil.test'})).status,400);
   assert.equal((await get('state')).status,400);assert.equal((await post('join',{name:'x',code:'123456'})).status,400);
  });
  for(const game of ['zjh','holdem','blackjack','baccarat'])await t.test(game+' two-client live round',async()=>{
   const a=await post('create',{name:'甲',game});assert.equal(a.status,200);assert.match(a.cookie,/bobole_cf=/);const b=await post('join',{name:'乙',code:a.body.room});assert.equal(b.status,200);
   const aw=await socket(a.cookie),bw=await socket(b.cookie);let s=(await get('state',a.cookie)).body;assert.equal(s.players.filter(p=>p.connected).length,2);
   // Bidirectional WebSocket input is accepted, and the other client sees it.
   aw.ws.send(JSON.stringify({type:'action',action:'ready',version:s.version}));
   await waitUntil(()=>bw.messages.find(m=>m.state?.players.some(p=>p.name==='甲'&&p.ready)));
   assert.equal((await act(b.cookie,'ready')).status,200);assert.equal((await act(a.cookie,'start')).status,200);
   s=(await get('state',a.cookie)).body;assert.equal(s.round,1);const stale=await post('action',{action:'ready',version:0},a.cookie);assert.equal(stale.status,400);assert.equal((await post('leave',{},a.cookie)).status,400);
   if(game==='zjh'){
    assert.equal((await act(a.cookie,'look')).status,200);const bs=(await get('state',b.cookie)).body;assert.ok(bs.players.find(p=>p.name==='甲').cards.every(c=>c===null));assert.ok(!('deck' in bs));
    assert.equal((await act(a.cookie,'fold')).status,200);
   }else if(game==='holdem'){
    let n=0;while((s=(await get('state',a.cookie)).body).phase==='playing'&&n++<20){const who=s.turn===s.me?a.cookie:b.cookie;assert.equal((await act(who,'call')).status,200);}assert.equal(s.phase,'result');
   }else{
    assert.equal((await act(a.cookie,'bet',{amount:20,pick:'P'})).status,200);assert.equal((await act(b.cookie,'bet',{amount:20,pick:'B'})).status,200);
    if(game==='blackjack'){let n=0;while((s=(await get('state',a.cookie)).body).phase==='playing'&&n++<4){const who=s.turn===s.me?a.cookie:b.cookie;const vs=(await get('state',who)).body;assert.equal(vs.dealer[1],null);assert.equal((await act(who,'stand')).status,200);}}
   }
   const result=(await get('state',a.cookie)).body;assert.equal(result.phase,'result');await waitUntil(()=>bw.messages.find(m=>m.state?.phase==='result'));
   if(['zjh','holdem'].includes(game))assert.equal(result.players.reduce((sum,p)=>sum+p.chips,0),2000);
   // Closing one of a player's two tabs must leave the player connected.
   if(game==='zjh'){const second=await socket(a.cookie);aw.ws.close(1000);await pause(100);assert.equal((await get('state',a.cookie)).body.players.find(p=>p.name==='甲').connected,true);second.ws.close(1000);await pause(100);assert.equal((await get('state',a.cookie)).body.players.find(p=>p.name==='甲').connected,false);persisted={cookie:a.cookie,room:a.body.room,chips:result.players.find(p=>p.name==='甲').chips};}
   else aw.ws.close(1000);bw.ws.close(1000);
  });
  await t.test('reload runtime restores room, seat, hand references and chip totals',async()=>{
   await pause(200);await mf.dispose();mf=new Miniflare(options(dir));const session=await get('session',persisted.cookie);assert.equal(session.body.room,persisted.room);const s=(await get('state',persisted.cookie)).body;assert.equal(s.phase,'result');assert.equal(s.players.find(p=>p.name==='甲').chips,persisted.chips);const w=await socket(persisted.cookie);assert.equal(w.messages.find(m=>m.type==='state').state.code,persisted.room);w.ws.close(1000);
  });
  await t.test('Durable Object alarm advances a round with no connected browsers',async()=>{
   const a=await post('create',{name:'超时甲',game:'holdem'}),b=await post('join',{name:'超时乙',code:a.body.room});const aw=await socket(a.cookie),bw=await socket(b.cookie);await act(a.cookie,'ready');await act(b.cookie,'ready');await act(a.cookie,'start');aw.ws.close(1000);bw.ws.close(1000);
   await pause(46000);const namespace=await mf.getDurableObjectNamespace('ROOMS');const stored=await namespace.get(namespace.idFromName('room:'+a.body.room)).load();assert.equal(stored.room.phase,'result','Alarm must settle before an HTTP state request');const result=(await get('state',b.cookie)).body;assert.equal(result.phase,'result');assert.ok(result.log.some(x=>x.includes('超时')));assert.equal(result.players.reduce((s,p)=>s+p.chips,0),2000);
  });
 }finally{for(const ws of allSockets)try{ws.close(1000);}catch{}await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
