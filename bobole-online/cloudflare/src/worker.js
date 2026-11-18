import { DurableObject } from 'cloudflare:workers';
import { makeRoom, makePlayer, action, timeout, view } from './engine.js';

const COOKIE='bobole_cf',DAY=86400000;
const assert=(ok,text)=>{if(!ok)throw new Error(text);};
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
function secret(){const a=new Uint8Array(24);crypto.getRandomValues(a);return Array.from(a,v=>v.toString(16).padStart(2,'0')).join('');}
function cookie(request){const value=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!value)return null;const [code,token]=value.split('.');return /^[A-F0-9]{6}$/.test(code)&&/^[a-f0-9]{48}$/.test(token||'')?{code,token}:null;}
const cookieHeader=(request,code,token)=>`${COOKIE}=${code}.${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(request.url).protocol==='https:'?'; Secure':''}`;
async function body(request){assert((request.headers.get('Content-Type')||'').startsWith('application/json'),'需要 JSON 请求');const raw=await request.text();assert(raw.length<=4096,'请求过大');try{const d=JSON.parse(raw||'{}');assert(d&&typeof d==='object'&&!Array.isArray(d),'请求格式错误');return d;}catch{throw new Error('请求格式错误');}}
function stub(env,code){return env.ROOMS.get(env.ROOMS.idFromName('room:'+code));}
function forward(env,code,path,token,data){return stub(env,code).fetch(new Request('https://room.internal/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Room-Code':code,'X-Seat-Token':token||''},body:data?JSON.stringify(data):undefined}));}

export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const origin=request.headers.get('Origin');if(origin)assert(new URL(origin).origin===url.origin,'来源不允许');
   const seat=cookie(request);
   if(path==='/api/health'&&request.method==='GET')return json({ok:true,app:'bobole-cloudflare',transport:'websocket',rooms:'durable-objects'});
   if(path==='/api/session'&&request.method==='GET'){
    if(!seat)return json({room:null,name:'',me:null});const res=await forward(env,seat.code,'session',seat.token);return res.ok?res:json({room:null,name:'',me:null});
   }
   if(['/api/create','/api/join'].includes(path)&&request.method==='POST'){
    const d=await body(request),name=typeof d.name==='string'?d.name.trim():'';assert(name.length>0&&name.length<=16,'昵称需要1–16个字符');
    if(seat){const current=await forward(env,seat.code,'session',seat.token);if(current.ok){if(path==='/api/join'&&String(d.code||'').toUpperCase()===seat.code)return json({room:seat.code});throw new Error('当前已在房间中，请先离开再创建或加入其他房间');}}
    const token=secret(),id=crypto.randomUUID();
    if(path==='/api/join'){
     const code=String(d.code||'').trim().toUpperCase();assert(/^[A-F0-9]{6}$/.test(code),'请输入6位房间码');
     const res=await forward(env,code,'join','',{name,id,token});if(!res.ok)return res;return json({room:code},200,{'Set-Cookie':cookieHeader(request,code,token)});
    }
    for(let i=0;i<4;i++){
     const code=secret().slice(0,6).toUpperCase(),res=await forward(env,code,'init','',{name,id,token,game:d.game});if(res.status===409)continue;if(!res.ok)return res;return json({room:code},200,{'Set-Cookie':cookieHeader(request,code,token)});
    }
    throw new Error('暂时无法分配房间，请重试');
   }
   assert(seat,'请先创建或加入房间');
   if(path==='/api/ws'&&request.method==='GET'){
    assert(request.headers.get('Upgrade')?.toLowerCase()==='websocket','需要 WebSocket 连接');const headers=new Headers(request.headers);headers.set('X-Seat-Token',seat.token);headers.set('X-Room-Code',seat.code);return stub(env,seat.code).fetch(new Request('https://room.internal/ws',{headers}));
   }
   if(path==='/api/state'&&request.method==='GET')return forward(env,seat.code,'state',seat.token);
   if(path==='/api/action'&&request.method==='POST')return forward(env,seat.code,'action',seat.token,await body(request));
   if(path==='/api/leave'&&request.method==='POST'){
    await body(request);const res=await forward(env,seat.code,'leave',seat.token,{});if(!res.ok)return res;
    return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});
   }
   return json({error:'接口不存在或请求方法不支持'},404);
  }catch(e){return json({error:e.message||'请求失败'},400);}
 }
};

export class BoboleRoom extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;}
 async load(){const data=await this.ctx.storage.get('data');if(data){const r=data.room;r.hand=(r.hand||[]).map(p=>r.players.find(q=>q.id===p.id)).filter(Boolean);}return data;}
 seat(data,token){const id=data?.tokens?.[token],p=data?.room.players.find(p=>p.id===id);assert(p,'房间已关闭或已离开，请重新入座');return p;}
 snapshot(data,id){return view(data.room,id);}
 sockets(id){return this.ctx.getWebSockets(id?[id]:undefined);}
 async persist(data,touch=true){
  const r=data.room;r.version++;r.updated=Date.now();if(touch)data.expiresAt=Date.now()+DAY;
  await this.ctx.storage.put('data',data);await this.schedule(data);
 }
 async schedule(data){
  const r=data.room,host=r.players.find(p=>p.id===r.host),times=[data.expiresAt];if(r.deadline)times.push(r.deadline);
  if(host&&!host.connected&&r.players.some(p=>p.connected))times.push((host.offlineSince||Date.now())+30000);
  await this.ctx.storage.setAlarm(Math.max(Date.now()+50,Math.min(...times)));
 }
 broadcast(data){
  for(const ws of this.sockets()){
   try{const s=ws.deserializeAttachment();if(!s||data.tokens[s.token]!==s.id||!data.room.players.some(p=>p.id===s.id)){ws.close(1008,'Seat left');continue;}ws.send(JSON.stringify({type:'state',state:this.snapshot(data,s.id)}));}catch{try{ws.close(1011,'Reconnect');}catch{}}
  }
 }
 migrateHost(data){const r=data.room,host=r.players.find(p=>p.id===r.host);if(host&&!host.connected&&Date.now()-(host.offlineSince||Date.now())>=30000){const next=r.players.find(p=>p.connected);if(next){r.host=next.id;return true;}}return false;}
 apply(data,id,d){
  assert(d&&typeof d==='object','请求格式错误');assert(d.version===data.room.version,'牌局已更新，请根据最新画面操作');
  const p=data.room.players.find(p=>p.id===id);assert(p,'尚未入座');assert(Date.now()-(p.rateAt||0)>80,'操作太快，请稍候');p.rateAt=Date.now();
  action(data.room,id,d);
 }
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   const path=new URL(request.url).pathname,token=request.headers.get('X-Seat-Token')||'',code=request.headers.get('X-Room-Code');let data=await this.load();
   if(data&&Date.now()>=data.expiresAt){for(const ws of this.sockets())ws.close(1000,'Room expired');await this.ctx.storage.deleteAll();data=null;}
   if(path==='/init'){
    if(data)return json({error:'房间码已使用'},409);const d=await request.json(),p=makePlayer(d.id,d.name);p.offlineSince=Date.now();const r=makeRoom(p,d.game);r.code=code;data={room:r,tokens:{[d.token]:p.id},expiresAt:Date.now()+DAY};await this.persist(data);return json({ok:true});
   }
   assert(data,'房间不存在或已过期，请重新创建');
   if(path==='/join'){
    const d=await request.json();assert(data.room.players.length<6,'房间已满（最多6人）');const p=makePlayer(d.id,d.name);p.offlineSince=Date.now();data.room.players.push(p);data.tokens[d.token]=p.id;
    if(!data.room.host)data.room.host=p.id;await this.persist(data);this.broadcast(data);return json({ok:true});
   }
   const p=this.seat(data,token),r=data.room;
   if(path==='/session')return json({room:r.code,name:p.name,me:p.id});
   if(timeout(r)||this.migrateHost(data)){await this.persist(data,false);this.broadcast(data);}
   if(path==='/state')return json(this.snapshot(data,p.id));
   if(path==='/ws'){
    assert(this.sockets(p.id).length<3,'同一玩家最多打开3个牌桌页面');const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server,[p.id]);server.serializeAttachment({id:p.id,token});
    p.connected=true;p.offlineSince=null;await this.persist(data);this.broadcast(data);return new Response(null,{status:101,webSocket:client});
   }
   if(path==='/action'){
    this.apply(data,p.id,await request.json());await this.persist(data);this.broadcast(data);return json({ok:true,state:this.snapshot(data,p.id)});
   }
   if(path==='/leave'){
    assert(['lobby','result'].includes(r.phase)||!r.hand.includes(p),'请等待本局结束后离开');r.players=r.players.filter(q=>q.id!==p.id);r.hand=r.hand.filter(q=>q.id!==p.id);delete data.tokens[token];
    if(r.host===p.id)r.host=r.players.find(q=>q.connected)?.id||r.players[0]?.id||null;await this.persist(data);this.broadcast(data);return json({ok:true});
   }
   return json({error:'接口不存在'},404);
  }catch(e){return json({error:e.message||'房间请求失败'},400);}
 });}
 async webSocketMessage(ws,message){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   assert(typeof message==='string'&&message.length<=4096,'消息格式错误');const msg=JSON.parse(message),s=ws.deserializeAttachment(),data=await this.load();assert(data,'房间已关闭');this.seat(data,s.token);
   if(msg.type==='ping'){ws.send(JSON.stringify({type:'pong'}));return;}
   if(msg.type==='state'){ws.send(JSON.stringify({type:'state',state:this.snapshot(data,s.id)}));return;}
   assert(msg.type==='action','未知消息类型');if(timeout(data.room)){await this.persist(data,false);this.broadcast(data);throw new Error('上一个操作已超时，请按最新画面操作');}
   this.apply(data,s.id,msg);await this.persist(data);this.broadcast(data);
  }catch(e){try{ws.send(JSON.stringify({type:'error',error:e.message}));}catch{}}
 });}
 async disconnected(ws){return this.ctx.blockConcurrencyWhile(async()=>{
  const s=ws.deserializeAttachment();if(!s)return;const data=await this.load();if(!data)return;const p=data.room.players.find(p=>p.id===s.id);if(!p)return;
  if(this.sockets(s.id).some(other=>other!==ws&&other.readyState===WebSocket.OPEN))return;
  p.connected=false;p.offlineSince=Date.now();if(['lobby','result'].includes(data.room.phase))p.ready=false;await this.persist(data,false);this.broadcast(data);
 });}
 async webSocketClose(ws,code,reason,wasClean){try{ws.close(code===1006?1000:code,reason);}catch{}await this.disconnected(ws);}
 async webSocketError(ws){try{ws.close(1011,'Reconnect');}catch{}await this.disconnected(ws);}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
  const data=await this.load();if(!data)return;
  if(Date.now()>=data.expiresAt){for(const ws of this.sockets())ws.close(1000,'Room expired');await this.ctx.storage.deleteAll();return;}
  const changed=timeout(data.room),hostChanged=this.migrateHost(data);if(changed||hostChanged){await this.persist(data,false);this.broadcast(data);}else await this.schedule(data);
 });}
}
