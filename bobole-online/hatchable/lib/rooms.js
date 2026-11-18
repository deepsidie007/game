import { db, events } from 'hatchable';
import { action, makePlayer, makeRoom, timeout, view } from 'lib/engine.js';
export const assert=(yes,msg)=>{if(!yes)throw new Error(msg);};
const hex=()=>{const a=new Uint8Array(24);crypto.getRandomValues(a);return Array.from(a,n=>n.toString(16).padStart(2,'0')).join('');};
export async function guest(req){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('bobole_h='));if(!raw)return null;const {rows}=await db.query('SELECT * FROM bobole_guests WHERE token=$1',[raw.slice(9)]);return rows[0]||null;}
export async function createGuest(name,res){const token=hex(),id=crypto.randomUUID();await db.query('INSERT INTO bobole_guests (token,guest_id,name) VALUES ($1,$2,$3)',[token,id,name]);res.setHeader('Set-Cookie',`bobole_h=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);return {token,guest_id:id,name,room_code:null};}
export async function load(code){const {rows}=await db.query('SELECT state,version FROM bobole_rooms WHERE code=$1',[code]);assert(rows.length,'房间不存在，请检查房间码');const r=typeof rows[0].state==='string'?JSON.parse(rows[0].state):rows[0].state;r.version=Number(rows[0].version);r.hand=(r.hand||[]).map(p=>r.players.find(x=>x.id===p.id)).filter(Boolean);return r;}
export function snapshot(r,id){const s=view(r,id);s.hostIdle=Date.now()-(r.players.find(p=>p.id===r.host)?.lastAction||r.updated)>120000;return s;}
export async function save(r){const old=r.version;r.version=old+1;r.updated=Date.now();const {rows}=await db.query('UPDATE bobole_rooms SET state=$1::jsonb,version=$2,updated_at=now() WHERE code=$3 AND version=$4 RETURNING version',[JSON.stringify(r),r.version,r.code,old]);assert(rows.length,'牌局已更新，请根据最新画面重试');try{await events.publish('room:'+r.code,'changed',{version:r.version});}catch{console.warn('Realtime notification delayed; snapshot remains saved');}return r;}
export async function roomFor(g){assert(g?.room_code,'请先加入房间');const r=await load(g.room_code);assert(r.players.some(p=>p.id===g.guest_id),'尚未入座，请重新加入');return r;}
export async function detach(g){if(!g?.room_code)return;let r;try{r=await load(g.room_code);}catch{return;}assert(['lobby','result'].includes(r.phase)||!r.hand.some(p=>p.id===g.guest_id),'请等待本局结束后离开');r.players=r.players.filter(p=>p.id!==g.guest_id);r.hand=r.hand.filter(p=>p.id!==g.guest_id);if(r.host===g.guest_id)r.host=r.players[0]?.id||null;await save(r);await db.query('UPDATE bobole_guests SET room_code=NULL WHERE token=$1',[g.token]);g.room_code=null;}
export async function enter(req,res,isCreate){
 const d=req.body||{},name=typeof d.name==='string'?d.name.trim():'';assert(name.length>=1&&name.length<=16,'昵称需要1–16个字符');
 let g=await guest(req),r;const code=String(d.code||'').trim().toUpperCase();if(!isCreate){r=await load(code);if(g?.room_code===code)return {room:code};assert(r.players.length<6,'房间已满（最多6人）');}
 if(g)await detach(g);else g=await createGuest(name,res);
 const p=makePlayer(g.guest_id,name);p.connected=true;p.lastAction=Date.now();
 if(isCreate){r=makeRoom(p,d.game);const {rows}=await db.query('INSERT INTO bobole_rooms (code,state,version) VALUES ($1,$2::jsonb,0) ON CONFLICT DO NOTHING RETURNING code',[r.code,JSON.stringify(r)]);assert(rows.length,'房间码重复，请重试');}
 else {r.players.push(p);if(!r.host)r.host=p.id;await save(r);}
 await db.query('UPDATE bobole_guests SET room_code=$1,name=$2 WHERE token=$3',[r.code,name,g.token]);return {room:r.code};
}
export async function perform(g,d){let r=await roomFor(g);if(d.action==='tick'){if(timeout(r))await save(r);return {ok:true,state:snapshot(r,g.guest_id)};}
 if(timeout(r)){await save(r);throw new Error('上一个操作已超时，请根据最新画面重试');}
 assert(d.version===r.version,'牌局已更新，请根据最新画面操作');const p=r.players.find(p=>p.id===g.guest_id);p.lastAction=Date.now();
 if(d.action==='claim'){assert(['lobby','result'].includes(r.phase),'请等待本局结束');assert(snapshot(r,g.guest_id).hostIdle,'房主仍在操作');r.host=g.guest_id;}else action(r,g.guest_id,d);
 await save(r);return {ok:true,state:snapshot(r,g.guest_id)};
}
export function route(fn){return async(req,res)=>{res.setHeader('Cache-Control','no-store');try{return res.json(await fn(req,res));}catch(e){return res.status(400).json({error:e.message||'请求失败'});}};}
