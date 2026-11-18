import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { makeRoom, makePlayer, action, timeout, view } from './engine.js';

export function createApp(){
  const sessions=new Map(),rooms=new Map(),limits=new Map();
  const cookie=req=>{const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('bobole='));return raw?.slice(7);};
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  function broadcast(r){r.version++;r.updated=Date.now();for(const s of sessions.values())if(s.room===r.code)for(const stream of s.streams){if(stream.writableLength>256*1024){stream.destroy();continue;}stream.write(`data: ${JSON.stringify(view(r,s.id))}\n\n`);}}
  function roomFor(s){const r=rooms.get(s?.room);if(!r)throw new Error('房间已关闭或服务器已重启，请重新创建房间');return r;}
  function getSession(req){const s=sessions.get(cookie(req));if(s)s.active=Date.now();return s;}
  function detach(s){if(!s?.room)return;const r=rooms.get(s.room);if(r){if(!['lobby','result'].includes(r.phase)&&r.hand.some(p=>p.id===s.id))throw new Error('请等待本局结束后离开');r.players=r.players.filter(p=>p.id!==s.id);r.hand=r.hand.filter(p=>p.id!==s.id);if(r.host===s.id)r.host=r.players.find(p=>p.connected)?.id||r.players[0]?.id;if(!r.players.length)rooms.delete(r.code);else broadcast(r);}s.room=null;for(const stream of s.streams)stream.end();s.streams.clear();}
  async function body(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>4096){req.destroy();throw new Error('请求过大');}}try{return JSON.parse(b||'{}');}catch{throw new Error('请求格式错误');}}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'){send(res,200,{ok:true,app:'bobole-online',rooms:rooms.size});return;}
      const files={'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript; charset=utf-8'],'/style.css':['public/style.css','text/css; charset=utf-8'],'/solo':['public/solo.html','text/html; charset=utf-8']};
      if(req.method==='GET'&&files[url.pathname]){const [p,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await readFile(new URL(p,import.meta.url)));return;}
      if(!url.pathname.startsWith('/api/')){send(res,404,{error:'页面不存在'});return;}
      // Cookies are sent only to the same origin. Mutations additionally reject foreign origins.
      if(req.method==='POST'){
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){send(res,403,{error:'来源不允许'});return;}
        if(!(req.headers['content-type']||'').startsWith('application/json')){send(res,415,{error:'需要 JSON 请求'});return;}
        const ip=req.socket.remoteAddress,now=Date.now(),slot=limits.get(ip)||{at:now,n:0};if(now-slot.at>10000){slot.at=now;slot.n=0;}slot.n++;limits.set(ip,slot);if(slot.n>100){send(res,429,{error:'操作太快，请稍候'});return;}
      }
      let s=getSession(req);
      if(req.method==='GET'&&url.pathname==='/api/session'){send(res,200,{room:s?.room&&rooms.has(s.room)?s.room:null,name:s?.name||'',me:s?.id||null});return;}
      if(req.method==='GET'&&url.pathname==='/api/events'){
        const r=roomFor(s),p=r.players.find(p=>p.id===s.id);if(!p)throw new Error('尚未加入房间');
        if(s.streams.size>=4){for(const old of s.streams)old.end();s.streams.clear();}
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 2000\n\n');s.streams.add(res);p.connected=true;s.offlineAt=null;broadcast(r);
        req.on('close',()=>{s.streams.delete(res);if(!s.streams.size){p.connected=false;s.offlineAt=Date.now();if(rooms.has(r.code))broadcast(r);}});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/state'){send(res,200,view(roomFor(s),s.id));return;}
      if(req.method!=='POST'){send(res,405,{error:'请求方法不支持'});return;}
      const data=await body(req);
      if(['/api/create','/api/join'].includes(url.pathname)){
        const name=typeof data.name==='string'?data.name.trim():'';if(name.length<1||name.length>16)throw new Error('昵称需要1–16个字符');
        let target;
        if(url.pathname==='/api/join'){target=rooms.get(String(data.code||'').trim().toUpperCase());if(!target)throw new Error('房间不存在，请检查房间码');if(target.players.length>=6&&target.code!==s?.room)throw new Error('房间已满（最多6人）');}
        if(s?.room&&target?.code===s.room){send(res,200,{room:s.room});return;}
        if(s)detach(s);
        if(!s){if(sessions.size>=5000)throw new Error('服务繁忙，请稍候');const token=randomBytes(32).toString('hex');s={id:randomBytes(12).toString('hex'),name,room:null,streams:new Set(),active:Date.now()};sessions.set(token,s);res.setHeader('Set-Cookie',`bobole=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);}
        s.name=name;const p=makePlayer(s.id,name);
        if(target){target.players.push(p);}else{if(rooms.size>=300)throw new Error('房间数量已达上限');do{target=makeRoom(p,data.game);}while(rooms.has(target.code));rooms.set(target.code,target);}
        s.room=target.code;broadcast(target);send(res,200,{room:target.code});return;
      }
      if(!s)throw new Error('请先加入房间');
      if(url.pathname==='/api/leave'){detach(s);send(res,200,{ok:true});return;}
      if(url.pathname==='/api/action'){
        const r=roomFor(s);if(data.version!==r.version)throw new Error('牌局已更新，请根据最新画面操作');
        action(r,s.id,data);broadcast(r);send(res,200,{ok:true});return;
      }
      send(res,404,{error:'接口不存在'});
    }catch(e){if(!res.headersSent)send(res,400,{error:e.message||'请求失败'});else res.end();}
  });
  const timer=setInterval(()=>{
    const now=Date.now();for(const r of rooms.values()){
      if(now-r.updated>2*3600000&&!r.players.some(p=>p.connected)){rooms.delete(r.code);continue;}
      let changed=false;
      if(!r.players.find(p=>p.id===r.host)?.connected){const hostSession=[...sessions.values()].find(s=>s.id===r.host);if(!hostSession?.offlineAt||now-hostSession.offlineAt>30000){const next=r.players.find(p=>p.connected);if(next&&next.id!==r.host){r.host=next.id;changed=true;}}}
      if(timeout(r,now))changed=true;
      if(changed)broadcast(r);
    }
    for(const [token,s] of sessions)if(!s.streams.size&&now-s.active>86400000)sessions.delete(token);
    for(const [ip,v] of limits)if(now-v.at>60000)limits.delete(ip);
    for(const s of sessions.values())for(const stream of s.streams)stream.write(': heartbeat\n\n');
  },1000);timer.unref();
  server.on('close',()=>clearInterval(timer));
  return {server,rooms,sessions,close:()=>{clearInterval(timer);for(const s of sessions.values())for(const stream of s.streams)stream.end();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=createApp();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Bobole online listening'));
  process.on('SIGTERM',()=>{app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
}
