import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('two independent sessions: room, SSE, private cards, stale actions, reload and leave',async()=>{
  const app=createApp();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;const controllers=[];
  try{
    async function post(path,data,cookie){const response=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
    const a=await post('create',{name:'A',game:'zjh'});assert.equal(a.status,200);const b=await post('join',{name:'B',code:a.body.room});assert.equal(b.status,200);
    const stream=async cookie=>{const ctrl=new AbortController();controllers.push(ctrl);const res=await fetch(base+'/api/events',{headers:{cookie},signal:ctrl.signal});assert.equal(res.status,200);const reader=res.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/data:/);return reader;};
    await stream(a.cookie);await stream(b.cookie);
    const state=async cookie=>(await fetch(base+'/api/state',{headers:{cookie}})).json();
    let s=await state(a.cookie);assert.equal(s.players.filter(p=>p.connected).length,2);
    let r=await post('action',{action:'ready',version:s.version},a.cookie);assert.equal(r.status,200);r=await post('action',{action:'ready',version:s.version},a.cookie);assert.equal(r.status,400);
    s=await state(b.cookie);await post('action',{action:'ready',version:s.version},b.cookie);s=await state(a.cookie);r=await post('action',{action:'start',version:s.version},a.cookie);assert.equal(r.status,200);
    s=await state(a.cookie);assert.ok(s.players.every(p=>p.cards.every(c=>c===null)));assert.ok(!JSON.stringify(s).includes('deck'));
    r=await post('action',{action:'look',version:s.version},a.cookie);assert.equal(r.status,200);s=await state(a.cookie);assert.ok(s.players.find(p=>p.id===s.me).cards[0]);const bs=await state(b.cookie);assert.ok(bs.players.find(p=>p.id===s.me).cards.every(c=>c===null));
    const reload=await (await fetch(base+'/api/session',{headers:{cookie:a.cookie}})).json();assert.equal(reload.room,a.body.room);assert.equal(reload.me,s.me);
    assert.equal((await post('leave',{},a.cookie)).status,400);
    const actor=s.turn===s.me?a.cookie:b.cookie;r=await post('action',{action:'fold',version:s.version},actor);assert.equal(r.status,200);s=await state(a.cookie);assert.equal(s.phase,'result');assert.equal(s.players.reduce((t,p)=>t+p.chips,0),2000);
    assert.equal((await post('leave',{},a.cookie)).status,200);
    const foreign=await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});assert.equal(foreign.status,403);
    assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/')).status,200);
  }finally{for(const c of controllers)c.abort();await app.close();}
});
