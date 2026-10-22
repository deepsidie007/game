import {spawn} from 'node:child_process';
import {existsSync,createWriteStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {networkInterfaces,platform} from 'node:os';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {WebSocket} from 'ws';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
const log=createWriteStream('联机诊断日志.txt',{flags:'w'});const report=s=>{console.log(s);log.write(s+'\n');};
let server,tunnel,closing=false,tunnelTimer,shareURL;
function stop(){if(closing)return;closing=true;clearTimeout(tunnelTimer);tunnel?.kill();server?.kill();log.end();}
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('exit',stop);
const browse=url=>{if(process.env.NO_BROWSER)return;const child=platform()==='win32'?spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore'}):spawn('xdg-open',[url],{stdio:'ignore'});child.on('error',()=>{});};
const available=port=>new Promise(resolve=>{const s=createServer();s.once('error',()=>resolve(false));s.listen(port,'0.0.0.0',()=>s.close(()=>resolve(true)));});
async function saveStatus(phase,message,url=''){await writeFile('public/connection.json',JSON.stringify({phase,message,url}));}
async function verifyPublic(url){return new Promise(resolve=>{const ws=new WebSocket(url.replace(/^https:/,'wss:')+'/ws',{origin:url});const timer=setTimeout(()=>{ws.terminate();resolve(false);},10000);ws.on('error',()=>{clearTimeout(timer);resolve(false);});ws.on('open',()=>ws.send(JSON.stringify({type:'ping',at:0})));ws.on('message',raw=>{try{if(JSON.parse(raw).type==='pong'){clearTimeout(timer);ws.close();resolve(true);}}catch{}});});}
try{
 if(Number(process.versions.node.split('.')[0])<22)throw Error('请安装 Node.js 22 或更新的 LTS 版本。');
 let port=3000;while(port<3010&&!await available(port))port++;if(port===3010)throw Error('3000–3009 端口均被占用，请关闭旧启动窗口。');
 await saveStatus('local','正在启动游戏…');
 server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>report(b.toString().trim()));server.stderr.on('data',b=>report(b.toString().trim()));server.on('error',e=>{report('游戏启动失败：'+e.message);stop();});server.on('exit',()=>{if(!closing){report('游戏服务器已退出，请查看本日志。');stop();}});
 const base='http://localhost:'+port;let ready=false;
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/');if(r.ok&&(await r.text()).includes('MEME FIGHTERS')){ready=true;break;}}catch{}if(closing)break;await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('首页未通过检查，无法启动。');
 let lan=[];try{lan=Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>'http://'+a.address+':'+port);}catch{report('无法自动读取局域网地址，本机游戏仍可使用。');}
 report('\n本机游戏已就绪：'+base);for(const url of lan)report('同 Wi-Fi 朋友使用：'+url);report('两人打开同一服务器 → 创建 / 加入房间 → 选角 → 双方准备。');
 await saveStatus('local','游戏服务正常。同 Wi-Fi 可以联机，异地联机需下方公网地址。');browse(base+'/?online=1');
 if(process.argv.includes('--lan')){report('局域网模式。保持此窗口打开。');}
 else{
 const exe=platform()==='win32'?path.join(root,'tools','cloudflared.exe'):path.join(root,'tools','cloudflared');
 if(!existsSync(exe)){report('未找到公网连接程序，游戏仍可本机或同 Wi-Fi 联机。');await saveStatus('local','未找到公网连接程序，仍可同 Wi-Fi 联机。');}
 else{
 report('\n正在尝试建立公网连接（最多等待45秒）…');
 let registered=false,verifying=false,buffer='';
 const offline=message=>{report(message);saveStatus('local',message).catch(()=>{});};
 tunnel=spawn(exe,['tunnel','--url',base,'--protocol','http2','--no-autoupdate'],{cwd:root,stdio:['ignore','pipe','pipe']});
 tunnelTimer=setTimeout(()=>{if(!registered){offline('公网连接超时。本机和同 Wi-Fi 联机仍可使用。');tunnel.kill();}},45000);
 const output=b=>{const s=b.toString();log.write(s);buffer=(buffer+s).slice(-16000);shareURL??=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(buffer.includes('Registered tunnel connection')&&shareURL&&!verifying){registered=true;verifying=true;clearTimeout(tunnelTimer);report('公网通道已连接，正在验证网页和联机…');(async()=>{let ok=false;try{const r=await fetch(shareURL+'/health',{signal:AbortSignal.timeout(10000)});ok=r.ok&&await verifyPublic(shareURL);}catch{}const message=ok?'公网网页和联机通道已通过检查':'公网通道已建立，但本机未能完成公网验证，请让朋友打开链接试验';report('\n'+message+'\n朋友访问：'+shareURL+'\n保持本窗口和电脑运行。');await writeFile('分享链接.txt',shareURL+'\r\n'+message+'\r\n');await saveStatus(ok?'public':'unverified',message,shareURL);})().catch(e=>offline(e.message));}};
 tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);tunnel.on('error',e=>{clearTimeout(tunnelTimer);offline('公网程序无法启动：'+e.message+'；本机游戏继续运行。');});tunnel.on('exit',()=>{clearTimeout(tunnelTimer);if(!closing)offline('公网连接已关闭。本机和同 Wi-Fi 游戏继续运行。');});
 }
 }
 report('\n停止游戏：在本窗口按 Ctrl+C。出问题可复制「联机诊断日志.txt」内容。');
}catch(e){report('启动失败：'+e.message);stop();process.exitCode=1;}
