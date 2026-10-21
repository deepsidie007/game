import {spawn} from 'node:child_process';
import {existsSync,createWriteStream} from 'node:fs';
import {writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
let server,tunnel;let closing=false;
const stop=()=>{if(closing)return;closing=true;tunnel?.kill();server?.kill();};
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('exit',stop);
try{
 if(Number(process.versions.node.split('.')[0])<22)throw Error('需要 Node.js 22 或更新版本，请安装 Node.js LTS。');
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('这个启动包适用于 Windows 64 位 Intel/AMD 电脑。');
 // Never expose a different service that happened to use the same port.
 const net=await import('node:net');await new Promise((ok,no)=>{const s=net.createServer();s.once('error',()=>no(Error('3000 端口被占用，请关闭之前的游戏启动窗口再试。')));s.listen(3000,'0.0.0.0',()=>s.close(ok));});
 await mkdir('tools',{recursive:true});const exe=path.join(root,'tools','cloudflared.exe');
 if(!existsSync(exe)){
  console.log('正在从 Cloudflare 官方 GitHub 下载连接程序（首次启动需要）…');
  const r=await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('下载连接程序失败：HTTP '+r.status);
  const tmp=exe+'.download';try{await pipeline(Readable.fromWeb(r.body),createWriteStream(tmp));await rename(tmp,exe);}catch(e){await unlink(tmp).catch(()=>{});throw e;}
 }
 console.log('正在启动游戏服务器…');server=spawn(process.execPath,['server/index.js'],{cwd:root,stdio:['ignore','inherit','inherit'],env:{...process.env,PORT:'3000'}});
 server.on('error',e=>{console.error(e.message);stop();process.exitCode=1;});server.on('exit',()=>{if(!closing){console.error('游戏服务已退出。');stop();process.exitCode=1;}});
 let ready=false;for(let i=0;i<100;i++){if(closing)throw Error('服务器启动失败');try{const r=await fetch('http://127.0.0.1:3000/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('游戏服务启动超时');
 console.log('本机地址：http://localhost:3000');console.log('正在生成公网链接，请稍候…');
 tunnel=spawn(exe,['tunnel','--url','http://127.0.0.1:3000','--protocol','http2','--no-autoupdate'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let buffer='',shown=false;const output=chunk=>{const s=chunk.toString();process.stdout.write(s);buffer=(buffer+s).slice(-8000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!shown){shown=true;const url=match[0];console.log('\n========== 分享这个链接给朋友 ==========\n'+url+'\n双方都打开此链接，创建 / 加入房间。\n请保持本窗口运行，关闭窗口后链接失效。\n======================================\n');writeFile('分享链接.txt',url+'\r\n关闭启动窗口后链接失效。\r\n').catch(()=>{});spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore'});}};
 tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);tunnel.on('error',e=>{console.error('连接程序启动失败：'+e.message);stop();process.exitCode=1;});tunnel.on('exit',()=>{if(!closing){console.error('公网连接已停止，请重新启动。');stop();process.exitCode=1;}});
}catch(e){console.error('\n启动失败：'+e.message);stop();process.exitCode=1;}
