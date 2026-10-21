const backend='https://meme-fighters-arena.cokelee320.chatgpt.site/api/room';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'仅支持 POST 请求'});}
 const origin=req.headers.origin,host=req.headers.host;
 if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'请求来源不正确'});}catch{return res.status(403).json({error:'请求来源不正确'});}}
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'消息格式无效'});}
 if(!body||!['create','join','sync','leave'].includes(body.action))return res.status(400).json({error:'操作无效'});
 const raw=JSON.stringify(body);if(Buffer.byteLength(raw)>60000)return res.status(413).json({error:'消息过大'});
 try{
 const upstream=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json'},body:raw,signal:AbortSignal.timeout(6500),redirect:'error'});
 if(!upstream.headers.get('content-type')?.includes('application/json'))return res.status(502).json({error:'房间服务暂时无法连接，请稍后重试。'});
 const result=await upstream.json();return res.status(upstream.status).json(result);
 }catch{return res.status(502).json({error:'房间服务连接超时，请稍后重试。'});}
}
