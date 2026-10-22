'use strict';
const strip=document.createElement('aside');strip.className='connection-strip';strip.innerHTML='<span id="serviceInfo">正在检测联机服务…</span><button id="serviceCopy" class="quiet" hidden>复制公网地址</button>';
document.querySelector('header').after(strip);
let publicAddress='';
async function inspectService(){try{const r=await fetch('/health',{cache:'no-store'});const health=await r.json();if(!r.ok||health.transport!=='websocket')throw Error();$('serviceInfo').textContent='● 联机服务器已连接 · v'+health.version;if(['localhost','127.0.0.1'].includes(location.hostname)){const response=await fetch('/connection.json',{cache:'no-store'});if(response.ok){const info=await response.json();$('serviceInfo').textContent=info.message;publicAddress=info.url||'';$('serviceCopy').hidden=!publicAddress;}}}catch{$('serviceInfo').textContent='联机服务未响应，请检查启动窗口。';}}
$('serviceCopy').onclick=async()=>{try{await navigator.clipboard.writeText(publicAddress);$('serviceCopy').textContent='已复制 ✓';}catch{$('serviceInfo').textContent='公网地址：'+publicAddress;}};
inspectService();setInterval(inspectService,5000);
if(new URLSearchParams(location.search).has('online')){$('mode').value='online';net.open();}
setInterval(()=>{if(net.active&&!net.inBattle)net.paint();},500);
