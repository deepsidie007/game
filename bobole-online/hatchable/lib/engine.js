function randomInt(max) { const x=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;do{crypto.getRandomValues(x);}while(x[0]>=limit);return x[0]%max; }
function randomHex(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,v=>v.toString(16).padStart(2,'0')).join('');}

export const GAMES = { holdem: '扑克之夜', zjh: '三张风暴', blackjack: '二十一点', baccarat: '庄闲对决' };
const NAMES = ['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
export function deck() {
  const d = [];
  for (const s of ['♠','♥','♦','♣']) for (let v=2;v<=14;v++) d.push({s,v,r:({11:'J',12:'Q',13:'K',14:'A'})[v] || String(v)});
  for(let i=d.length-1;i>0;i--){const j=randomInt(i+1);[d[i],d[j]]=[d[j],d[i]];}
  return d;
}
export function cmp(a,b) { for(let i=0;i<Math.max(a.length,b.length);i++){const n=(a[i]||0)-(b[i]||0);if(n)return n;}return 0; }
export function eval5(cs) {
  const vals=cs.map(c=>c.v).sort((a,b)=>b-a), flush=cs.every(c=>c.s===cs[0].s);
  const unique=[...new Set(vals)];if(unique.includes(14))unique.push(1);
  let straight=0;for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4){straight=unique[i];break;}
  const groups=[...new Set(vals)].map(v=>[vals.filter(x=>x===v).length,v]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  if(flush&&straight)return [8,straight];
  if(groups[0][0]===4)return [7,groups[0][1],groups[1][1]];
  if(groups[0][0]===3&&groups[1][0]===2)return [6,groups[0][1],groups[1][1]];
  if(flush)return [5,...vals];if(straight)return [4,straight];
  if(groups[0][0]===3)return [3,groups[0][1],...groups.slice(1).map(x=>x[1])];
  if(groups[0][0]===2&&groups[1][0]===2)return [2,...groups.map(x=>x[1])];
  if(groups[0][0]===2)return [1,...groups.map(x=>x[1])];return [0,...vals];
}
export function best7(cs) {
  let best=null;
  for(let a=0;a<cs.length-4;a++)for(let b=a+1;b<cs.length-3;b++)for(let c=b+1;c<cs.length-2;c++)for(let d=c+1;d<cs.length-1;d++)for(let e=d+1;e<cs.length;e++){
    const score=eval5([cs[a],cs[b],cs[c],cs[d],cs[e]]);if(!best||cmp(score,best)>0)best=score;
  }
  return best;
}
export function eval3(cs) {
  const vals=cs.map(c=>c.v).sort((a,b)=>b-a),flush=cs.every(c=>c.s===cs[0].s);
  const straight=new Set(vals).size===3&&((vals[0]-vals[2]===2)||(vals.join(',')==='14,3,2'));
  const high=vals.join(',')==='14,3,2'?3:vals[0];
  if(vals[0]===vals[2])return [5,vals[0]];if(straight&&flush)return [4,high];if(flush)return [3,...vals];if(straight)return [2,high];
  if(vals[0]===vals[1])return [1,vals[0],vals[2]];if(vals[1]===vals[2])return [1,vals[1],vals[0]];return [0,...vals];
}
export function bjScore(cs) {let n=0,aces=0;for(const c of cs){n+=c.v===14?11:Math.min(c.v,10);if(c.v===14)aces++;}while(n>21&&aces-->0)n-=10;return n;}
const natural = p=>p.cards.length===2&&bjScore(p.cards)===21;
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const amount=(n,min,max)=>{need(Number.isSafeInteger(n)&&n>=min&&n<=max,`金额须为 ${min}–${max} 的整数`);return n;};
export function makeRoom(host,game='zjh') {
  need(GAMES[game],'未知玩法');
  return {code:randomHex(4).slice(0,6).toUpperCase(),game,host:host.id,players:[host],phase:'lobby',round:0,version:0,log:[],hand:[],deck:[],board:[],dealer:[],pot:0,turn:null,deadline:0,updated:Date.now()};
}
export function makePlayer(id,name) {return {id,name,chips:1000,ready:false,connected:false};}
const log=(r,text)=>{r.log.push(text);r.log=r.log.slice(-40);};
const alive=r=>r.hand.filter(p=>!p.folded);
function pay(r,p,n) {n=Math.min(n,p.chips);p.chips-=n;p.total+=n;p.street+=n;r.pot+=n;return n;}
function finish(r,message) {r.phase='result';r.turn=null;r.deadline=0;r.summary=message;for(const p of r.players)p.ready=false;log(r,message);}
function setTurn(r,p) {r.turn=p?.id||null;r.deadline=p?Date.now()+45000:0;}
function nextAfter(r,id,eligible) {const i=r.hand.findIndex(p=>p.id===id);for(let n=1;n<=r.hand.length;n++){const p=r.hand[(i+n)%r.hand.length];if(eligible(p))return p;}return null;}
export function start(r,id) {
  need(id===r.host,'只有房主可以开始');need(['lobby','result'].includes(r.phase),'本局尚未结束');
  const ps=r.players.filter(p=>p.connected);
  need(ps.length>=2,'至少需要两名在线玩家');need(ps.every(p=>p.ready),'请等待所有在线玩家准备');need(ps.every(p=>p.chips>=20),'筹码不足，请在局间领取练习筹码');
  r.round++;r.deck=deck();r.board=[];r.dealer=[];r.pot=0;r.summary='';r.log=[];r.stage=0;r.currentBet=0;r.minRaise=10;r.steps=0;
  r.hand=ps.map(p=>{Object.assign(p,{cards:[],folded:false,seen:false,total:0,street:0,acted:false,raiseClosed:false,bet:0,pick:null,done:false,outcome:'',startChips:p.chips});return p;});
  r.phase=(r.game==='blackjack'||r.game==='baccarat')?'betting':'playing';
  log(r,`第 ${r.round} 局 · ${GAMES[r.game]}`);
  if(r.phase==='betting'){r.turn=null;r.deadline=Date.now()+45000;return;}
  const count=r.game==='zjh'?3:2;for(let n=0;n<count;n++)for(const p of r.hand)p.cards.push(r.deck.pop());
  if(r.game==='zjh') {r.baseBet=5;for(const p of r.hand)pay(r,p,5);}
  else {
    // Rotate the button; heads-up the button is the small blind.
    r.button=(r.round-1)%r.hand.length;
    const sb=r.hand[(r.button+(r.hand.length===2?0:1))%r.hand.length],bb=nextAfter(r,sb.id,()=>true);
    pay(r,sb,5);pay(r,bb,10);r.currentBet=10;r.lastRaiser=bb.id;
    setTurn(r,nextAfter(r,bb.id,p=>p.chips>0));return;
  }
  setTurn(r,r.hand[(r.round-1)%r.hand.length]);
}
function split(r,winners,n){const share=Math.floor(n/winners.length),rest=n%winners.length;winners.forEach((p,i)=>p.chips+=share+(i<rest?1:0));}
export function settlePoker(r) {
  if(r.game==='holdem'&&alive(r).length>1)while(r.board.length<5)r.board.push(r.deck.pop());
  const scores=new Map(alive(r).map(p=>[p.id,alive(r).length===1?[0]:r.game==='holdem'?best7([...p.cards,...r.board]):eval3(p.cards)]));
  const levels=[...new Set(r.hand.map(p=>p.total).filter(Boolean))].sort((a,b)=>a-b);let previous=0;const wins=new Map();
  for(const level of levels){const contributors=r.hand.filter(p=>p.total>=level),n=(level-previous)*contributors.length;previous=level;
    const eligible=contributors.filter(p=>!p.folded);if(!eligible.length){for(const p of contributors)p.chips+=level-(levels[levels.indexOf(level)-1]||0);continue;}
    let best=scores.get(eligible[0].id);for(const p of eligible)if(cmp(scores.get(p.id),best)>0)best=scores.get(p.id);
    const winners=eligible.filter(p=>cmp(scores.get(p.id),best)===0);split(r,winners,n);for(const p of winners)wins.set(p.id,(wins.get(p.id)||0)+n/winners.length);
  }
  for(const p of r.hand)p.outcome=`${p.chips-p.startChips>=0?'+':''}${p.chips-p.startChips} 筹码`;
  const names=[...wins.keys()].map(id=>r.hand.find(p=>p.id===id).name).join('、');
  finish(r,`${names} 赢得本局 · 底池 ${r.pot} 筹码`);
}
function advanceHoldem(r,id) {
  if(alive(r).length===1)return settlePoker(r);
  const active=alive(r).filter(p=>p.chips>0);
  if(active.length<=1&&active.every(p=>p.street>=r.currentBet))return settlePoker(r);
  const pending=p=>!p.folded&&p.chips>0&&(!p.acted||p.street<r.currentBet);
  if(r.hand.some(pending)){setTurn(r,nextAfter(r,id,pending));return;}
  r.stage++;
  if(r.stage>=4)return settlePoker(r);
  r.currentBet=0;r.minRaise=10;for(const p of r.hand){p.street=0;p.acted=false;p.raiseClosed=false;}
  const n=r.stage===1?3:1;for(let i=0;i<n;i++)r.board.push(r.deck.pop());
  log(r,['','翻牌','转牌','河牌'][r.stage]);setTurn(r,nextAfter(r,r.hand[r.button].id,p=>!p.folded&&p.chips>0));
}
function holdemAction(r,p,a,n){
  need(r.turn===p.id,'还未轮到你');
  if(a==='fold'){p.folded=true;p.acted=true;log(r,`${p.name} 弃牌`);}
  else if(a==='call') {const paid=pay(r,p,Math.max(0,r.currentBet-p.street));p.acted=true;log(r,`${p.name} ${paid?'跟注 '+paid:'过牌'}`);}
  else if(a==='raise') {
    need(!p.raiseClosed,'本轮未足额加注，不能再次加注');
    amount(n,r.currentBet+1,p.street+p.chips);
    const delta=n-r.currentBet;need(delta>=r.minRaise||n===p.street+p.chips,'加注不足最低额度');
    const old=r.currentBet;
    pay(r,p,n-p.street);r.currentBet=n;
    for(const q of alive(r))if(q.id!==p.id){if(delta>=r.minRaise){q.acted=false;q.raiseClosed=false;}else if(q.acted)q.raiseClosed=true;}
    if(delta>=r.minRaise)r.minRaise=n-old;p.acted=true;log(r,`${p.name} 加注至 ${n}`);
  }else throw new Error('无效操作');
  advanceHoldem(r,p.id);
}
function zjhAction(r,p,a,target) {
  if(a==='look'){need(!p.seen,'已经看过牌');p.seen=true;log(r,`${p.name} 看牌`);return;}
  need(r.turn===p.id,'还未轮到你');
  const cost=r.baseBet*(p.seen?2:1);
  if(a==='fold'){p.folded=true;log(r,`${p.name} 弃牌`);}
  else if(a==='call'){need(p.chips>=cost,'筹码不足，请弃牌');pay(r,p,cost);log(r,`${p.name} 跟注 ${cost}`);}
  else if(a==='raise'){need(r.baseBet<80,'单注已达上限');need(p.chips>=cost*2,'筹码不足');r.baseBet*=2;pay(r,p,cost*2);log(r,`${p.name} 加注`);}
  else if(a==='compare'){
    const q=alive(r).find(x=>x.id===target&&x.id!==p.id);need(q,'请选择仍在局中的对手');need(p.chips>=cost*2,'筹码不足以比牌');
    pay(r,p,cost*2);const loser=cmp(eval3(p.cards),eval3(q.cards))>0?q:p;loser.folded=true;log(r,`${p.name} 与 ${q.name} 比牌，${loser.name} 出局`);
  }else throw new Error('无效操作');
  r.steps++;if(alive(r).length<=1||r.steps>=r.hand.length*10)return settlePoker(r);
  setTurn(r,nextAfter(r,p.id,q=>!q.folded));
}
const bValue=c=>c.v===14?1:c.v>=10?0:c.v;
const bTotal=cs=>cs.reduce((s,c)=>s+bValue(c),0)%10;
function settleBaccarat(r){
  const P=[r.deck.pop(),r.deck.pop()],B=[r.deck.pop(),r.deck.pop()];let p=bTotal(P),b=bTotal(B),third=null;
  if(p<8&&b<8){if(p<=5){third=r.deck.pop();P.push(third);}const v=third?bValue(third):null;
    const draw=v===null?b<=5:b<=2||(b===3&&v!==8)||(b===4&&v>=2&&v<=7)||(b===5&&v>=4&&v<=7)||(b===6&&v>=6&&v<=7);if(draw)B.push(r.deck.pop());}
  p=bTotal(P);b=bTotal(B);r.board=P;r.dealer=B;r.bResult=p>b?'P':b>p?'B':'T';
  for(const q of r.hand){let payout=0;if(q.bet){if(q.pick===r.bResult)payout=q.pick==='T'?q.bet*9:q.pick==='B'?Math.floor(q.bet*1.95):q.bet*2;else if(r.bResult==='T'&&q.pick!=='T')payout=q.bet;q.chips+=payout;}q.outcome=`${payout-q.bet>=0?'+':''}${payout-q.bet} 筹码`;}
  finish(r,`闲 ${p} 点 · 庄 ${b} 点 · ${{P:'闲胜',B:'庄胜',T:'和局'}[r.bResult]}`);
}
function dealBlackjack(r){
  r.dealer=[r.deck.pop(),r.deck.pop()];for(const p of r.hand){if(!p.bet){p.done=true;continue;}p.cards=[r.deck.pop(),r.deck.pop()];p.done=natural(p);}
  r.phase='playing';if(natural({cards:r.dealer}))return settleBlackjack(r);
  const p=r.hand.find(p=>!p.done);if(p)setTurn(r,p);else settleBlackjack(r);
}
function settleBlackjack(r){
  while(bjScore(r.dealer)<17)r.dealer.push(r.deck.pop());const d=bjScore(r.dealer),dn=natural({cards:r.dealer});
  for(const p of r.hand){let payout=0;const n=bjScore(p.cards);if(p.bet){if(natural(p)&&!dn)payout=Math.floor(p.bet*2.5);else if(n>21)payout=0;else if(dn)payout=natural(p)?p.bet:0;else if(d>21||n>d)payout=p.bet*2;else if(n===d)payout=p.bet;p.chips+=payout;}p.outcome=`${payout-p.bet>=0?'+':''}${payout-p.bet} 筹码`;}
  finish(r,`庄家 ${d} 点 · 本局已结算`);
}
function blackjackAction(r,p,a){
  need(r.turn===p.id,'还未轮到你');
  if(a==='hit')p.cards.push(r.deck.pop());
  else if(a==='stand')p.done=true;
  else if(a==='double'){need(p.cards.length===2&&p.chips>=p.bet,'当前不能双倍');p.chips-=p.bet;p.bet*=2;p.cards.push(r.deck.pop());p.done=true;}
  else throw new Error('无效操作');
  log(r,`${p.name} ${{hit:'要牌',stand:'停牌',double:'双倍'}[a]}`);
  if(bjScore(p.cards)>=21)p.done=true;
  if(p.done){const next=r.hand.find(p=>!p.done);if(next)setTurn(r,next);else settleBlackjack(r);}else setTurn(r,p);
}
function afterBets(r){if(r.hand.every(p=>p.done)){if(r.game==='baccarat')settleBaccarat(r);else dealBlackjack(r);}}
export function action(r,id,data) {
  const p=r.players.find(p=>p.id===id);need(p,'不在房间中');const a=data.action;
  if(a==='ready'){need(['lobby','result'].includes(r.phase),'牌局进行中');p.ready=!p.ready;return;}
  if(a==='refill'){need(['lobby','result'].includes(r.phase),'请在局间领取');need(p.chips<20,'筹码充足');p.chips=1000;log(r,`${p.name} 领取练习筹码`);return;}
  if(a==='game'){need(r.host===id,'只有房主可以切换');need(['lobby','result'].includes(r.phase),'请等待本局结束');need(GAMES[data.game],'未知玩法');r.game=data.game;r.phase='lobby';r.hand=[];r.board=[];r.dealer=[];r.pot=0;r.summary='';for(const q of r.players)q.ready=false;return;}
  if(a==='start')return start(r,id);
  need(r.hand.includes(p),'本局未入座，请等待下一局');
  if(r.phase==='betting'){
    need(a==='bet'||a==='skip','当前等待选择投入');need(!p.done,'已提交选择');
    if(a==='skip'){p.done=true;log(r,`${p.name} 本局旁观`);afterBets(r);return;}
    const n=amount(data.amount,10,Math.min(200,p.chips));need(n%10===0,'投入须为10的倍数');
    if(r.game==='baccarat')need(['P','B','T'].includes(data.pick),'请选择庄、闲或和');
    p.chips-=n;p.bet=n;p.pick=data.pick||null;p.done=true;log(r,`${p.name} 已确认投入`);afterBets(r);return;
  }
  need(r.phase==='playing','当前没有进行中的对局');need(!p.folded,'已出局');
  if(r.game==='holdem')holdemAction(r,p,a,data.amount);else if(r.game==='zjh')zjhAction(r,p,a,data.target);else if(r.game==='blackjack')blackjackAction(r,p,a);
}
export function timeout(r,now=Date.now()){
  if(!r.deadline||now<r.deadline)return false;
  if(r.phase==='betting'){for(const p of r.hand)if(!p.done){p.done=true;log(r,`${p.name} 超时，本局旁观`);}afterBets(r);}
  else if(r.phase==='playing') {const p=r.hand.find(p=>p.id===r.turn);if(!p)return false;log(r,`${p.name} 操作超时`);if(r.game==='blackjack')blackjackAction(r,p,'stand');else if(r.game==='zjh')zjhAction(r,p,'fold');else holdemAction(r,p,p.street>=r.currentBet?'call':'fold');}
  return true;
}
export function view(r,id){
  const result=r.phase==='result';
  return {code:r.code,host:r.host,game:r.game,phase:r.phase,round:r.round,version:r.version,turn:r.turn,deadline:r.deadline,serverTime:Date.now(),pot:r.pot,baseBet:r.baseBet||5,currentBet:r.currentBet||0,minRaise:r.minRaise||10,stage:r.stage||0,board:r.board,dealer:r.dealer.map((c,i)=>r.game==='blackjack'&&!result&&i===1?null:c),summary:r.summary||'',log:r.log,me:id,
    players:r.players.map(p=>({id:p.id,name:p.name,chips:p.chips,connected:p.connected,ready:p.ready,inHand:r.hand.includes(p),folded:!!p.folded,seen:!!p.seen,total:p.total||0,street:p.street||0,bet:p.bet||0,pick:result?p.pick:null,done:!!p.done,raiseClosed:!!p.raiseClosed,outcome:result?p.outcome:'',cards:(p.cards||[]).map(c=>result||(p.id===id&&(r.game!=='zjh'||p.seen))?c:null),handName:result&&p.cards?.length?(r.game==='holdem'&&r.board.length===5?NAMES[best7([...p.cards,...r.board])[0]]:r.game==='zjh'?['单张','对子','顺子','金花','同花顺','豹子'][eval3(p.cards)[0]]:r.game==='blackjack'?`${bjScore(p.cards)} 点`:''):''}))};
}
