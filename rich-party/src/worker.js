import { DurableObject } from 'cloudflare:workers';
import { createState, person, addLog, start, action, automatic } from './game.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=(r,token)=>({...r.state,code:r.code,version:r.version,me:r.state.players.findIndex(p=>p.token===token),players:r.state.players.map(({token,...p})=>p)});
const validToken=token=>typeof token==='string'&&/^[\w-]{20,80}$/.test(token);
const validCode=code=>typeof code==='string'&&/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code);
const tidyName=name=>String(name||'置业玩家').trim().slice(0,12)||'置业玩家';
const ttl=7*24*60*60*1000;
export default {
 async fetch(req,env){
  try{const url=new URL(req.url),origin=req.headers.get('Origin');
  if(url.pathname==='/api/health')return json({ok:true,platform:'Cloudflare Workers + Durable Objects',mapTiles:40});
  if(url.pathname==='/api/game'){
   if(req.method!=='POST')return json({error:'仅支持POST请求'},405);
   if(origin&&origin!==url.origin)return json({error:'请求来源不匹配'},403);
   if(Number(req.headers.get('content-length')||0)>4096)return json({error:'请求过大'},413);
   const raw=await req.text();if(raw.length>4096)return json({error:'请求过大'},413);
   let b;try{b=JSON.parse(raw)}catch{return json({error:'请求格式错误'},400)}
   if(!b||Array.isArray(b)||!validToken(b.token))return json({error:'玩家身份无效，请刷新页面'},400);
   if(b.action==='create'){
    for(let i=0;i<4;i++){const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
     const result=await env.ROOMS.getByName(code).fetch(new Request(req.url,{method:'POST',body:JSON.stringify({...b,code})}));
     if(result.status!==409)return result;
    }return json({error:'开房繁忙，请重试'},503);
   }
   b.code=String(b.code||'').trim().toUpperCase();if(!validCode(b.code))return json({error:'请输入正确的6位房间码'},400);
   return env.ROOMS.getByName(b.code).fetch(new Request(req.url,{method:'POST',body:JSON.stringify(b)}));
  }
  if(url.pathname==='/api/socket'){
   if(req.method!=='GET'||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'需要WebSocket连接'},426);
   if(origin&&origin!==url.origin)return json({error:'请求来源不匹配'},403);
   const code=String(url.searchParams.get('room')||'').toUpperCase();if(!validCode(code))return json({error:'房间码无效'},400);
   return env.ROOMS.getByName(code).fetch(req);
  }
  if(url.pathname.startsWith('/api/'))return json({error:'接口不存在'},404);
  return env.ASSETS.fetch(req);
  }catch(e){console.error('Request failed',e?.name||'Error');return json({error:'服务暂时不可用，请稍后重试'},500)}
 }
};
export class GameRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));}
 sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1&&ws.deserializeAttachment()?.token);}
 online(r){return this.sockets().length>0||(r.pollUntil||0)>Date.now();}
 async load(){return this.ctx.storage.get('room');}
 async save(r){await this.ctx.storage.put('room',r);await this.plan(r);}
 async plan(r){
  let due=r.expiresAt;
  if(r.state.status==='playing'&&this.online(r)){
   if(r.pausedAt){const gap=Date.now()-r.pausedAt;r.state.deadline+=gap;if(r.state.auction){r.state.auction.ends+=gap;if(r.state.auction.nextBotAt)r.state.auction.nextBotAt+=gap;}r.pausedAt=null;await this.ctx.storage.put('room',r);}
   const s=r.state;
   if(s.phase!=='auction'&&s.players[s.current].bot&&!r.botAt){
    r.botAt=Date.now()+1100;
    await this.ctx.storage.put('room',r);
   }
   due=Math.min(due,s.phase==='auction'?Math.min(s.auction.ends,s.auction.nextBotAt||Infinity):r.botAt||s.deadline);
   if(!this.sockets().length)due=Math.min(due,r.pollUntil);
  }
  await this.ctx.storage.setAlarm(Math.max(Date.now()+50,due));
 }
 broadcast(r){for(const ws of this.sockets()){const token=ws.deserializeAttachment().token;try{ws.send(JSON.stringify({type:'snapshot',data:clean(r,token)}));}catch{try{ws.close(1011,'connection closed')}catch{}}}}
 async fetch(req){
  const url=new URL(req.url);
  if(url.pathname==='/api/socket')return this.ctx.blockConcurrencyWhile(async()=>{
   const r=await this.load();if(!r||r.expiresAt<=Date.now())return json({error:'房间不存在或已过期'},404);
   if(this.ctx.getWebSockets().length>=16)return json({error:'房间连接过多，请关闭重复页面'},429);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({token:null,createdAt:Date.now()});
   return new Response(null,{status:101,webSocket:client});
  });
  let b;try{b=await req.json()}catch{return json({error:'请求格式错误'},400)}
  return this.ctx.blockConcurrencyWhile(async()=>{
   try{
    if(!validToken(b.token))return json({error:'玩家身份无效'},400);
    let r=await this.load();
    if(b.action==='create'){
     if(r&&r.expiresAt>Date.now())return json({error:'房间码占用'},409);
     r={code:b.code,state:createState(tidyName(b.name),b.token),version:0,expiresAt:Date.now()+ttl,pausedAt:null};await this.save(r);return json(clean(r,b.token));
    }
    if(!r||r.expiresAt<=Date.now())return json({error:'房间不存在或已过期，请重新创建'},404);
    let s=r.state,me=s.players.findIndex(p=>p.token===b.token),changed=false;
    if(b.action==='join'&&me<0){if(s.status!=='lobby')throw Error('游戏已经开始');if(s.players.length>=4)throw Error('房间已满');s.players.push(person(tidyName(b.name),b.token));me=s.players.length-1;addLog(s,s.players[me].name+'加入房间');changed=true;}
    else if(me<0)return json({error:'请先加入房间'},403);
    else if(b.action==='start'){if(me!==0||s.status!=='lobby')throw Error('只有房主可以开局');const n=Math.max(0,Math.min(4-s.players.length,Math.floor(Number(b.bots)||0)));start(s,n);changed=true;}
    else if(['roll','buy','skip','choose','boost','remote','bid'].includes(b.action)){action(s,me,b.action,b.value);changed=true;}
    else if(!['poll','join'].includes(b.action))throw Error('无效操作');
    if(b.action==='poll'&&b.value==='heartbeat'&&!this.sockets().length&&s.status==='playing'){
     r.pollUntil=Date.now()+8000;
     await this.save(r);
    }
    if(changed){r.botAt=null;r.version++;r.expiresAt=Date.now()+ttl;if(s.status==='playing'&&!this.online(r)&&!r.pausedAt)r.pausedAt=Date.now();await this.save(r);this.broadcast(r);}
    return json(clean(r,b.token));
   }catch(e){return json({error:e.message||'操作失败，请重试'},400)}
  });
 }
 async webSocketMessage(ws,message){
  if(typeof message!=='string'||message.length>512){ws.close(1009,'invalid message');return;}
  let b;try{b=JSON.parse(message)}catch{ws.close(1008,'invalid message');return;}
  await this.ctx.blockConcurrencyWhile(async()=>{
   const r=await this.load();if(!r||r.expiresAt<=Date.now()){ws.close(1008,'room expired');return;}
   if(b.type!=='auth'||!validToken(b.token)||!r.state.players.some(p=>p.token===b.token)){ws.close(1008,'join room first');return;}
   for(const other of this.sockets())if(other!==ws&&other.deserializeAttachment().token===b.token){try{other.close(4001,'opened in another tab')}catch{}}
   ws.serializeAttachment({token:b.token});r.expiresAt=Date.now()+ttl;await this.save(r);ws.send(JSON.stringify({type:'snapshot',data:clean(r,b.token)}));
  });
 }
 async webSocketClose(ws,code,reason){
  try{ws.close(code===1005?1000:code,reason)}catch{}
  await this.ctx.blockConcurrencyWhile(async()=>{const r=await this.load();if(!r)return;const others=this.sockets().filter(x=>x!==ws);if(!others.length&&!(r.pollUntil>Date.now())&&r.state.status==='playing'&&!r.pausedAt){r.pausedAt=Date.now();await this.ctx.storage.put('room',r);}await this.plan(r);});
 }
 async webSocketError(ws){await this.webSocketClose(ws,1011,'connection error');}
 async alarm(){await this.ctx.blockConcurrencyWhile(async()=>{
  const r=await this.load();if(!r)return;
  if(r.expiresAt<=Date.now()){for(const ws of this.ctx.getWebSockets())try{ws.close(1000,'room expired')}catch{}await this.ctx.storage.deleteAll();return;}
  if(r.state.status!=='playing'||!this.online(r)){if(r.state.status==='playing'&&!r.pausedAt){r.pausedAt=Date.now();await this.ctx.storage.put('room',r);}await this.plan(r);return;}
  const s=r.state,due=s.phase==='auction'?Date.now()>=s.auction.ends||!!s.auction.nextBotAt&&Date.now()>=s.auction.nextBotAt:s.players[s.current].bot?Date.now()>=(r.botAt||0):Date.now()>=s.deadline;
  if(due){automatic(s);r.botAt=null;r.version++;await this.save(r);this.broadcast(r);}else await this.plan(r);
 });}
}
