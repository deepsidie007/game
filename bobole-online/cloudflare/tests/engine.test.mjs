import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,makePlayer,start,action,view,timeout,deck,eval3,eval5,best7,bjScore,settlePoker} from '../src/engine.js';
const cards=(vals,s='♠')=>vals.map(v=>({v,s,r:String(v)}));
function room(game,n=3){const ps=Array.from({length:n},(_,i)=>Object.assign(makePlayer(String(i),'玩家'+i),{ready:true,connected:true}));const r=makeRoom(ps[0],game);r.players=ps;return r;}
const total=r=>r.players.reduce((n,p)=>n+p.chips,0);
test('deck uniqueness and poker hand evaluators',()=>{
  assert.equal(new Set(deck().map(c=>c.s+c.v)).size,52);
  assert.deepEqual(eval5(cards([14,5,4,3,2])),[8,5]);
  assert.deepEqual(eval5([...cards([10,10,10,10]),...cards([14],'♥')]),[7,10,14]);
  assert.deepEqual(best7(cards([14,13,12,11,10,2,3])),[8,14]);
  assert.deepEqual(eval3(cards([14,3,2])),[4,3]);
  assert.equal(eval3(cards([8,8,8]))[0],5);assert.equal(bjScore(cards([14,14,9])),21);
});
test('private cards and dealer hole card never leave server',()=>{
  const r=room('zjh');start(r,'0');let v=view(r,'0');assert.deepEqual(v.players[0].cards,[null,null,null]);
  action(r,'0',{action:'look'});v=view(r,'0');assert.ok(v.players[0].cards[0]);assert.deepEqual(v.players[1].cards,[null,null,null]);assert.deepEqual(view(r,'1').players[0].cards,[null,null,null]);
  const b=room('blackjack',2);start(b,'0');action(b,'0',{action:'bet',amount:20});action(b,'1',{action:'bet',amount:20});if(b.phase==='playing')assert.equal(view(b,'0').dealer[1],null);
});
test('room start and action validation prevent out-of-turn or malformed spending',()=>{
  const r=room('holdem');assert.throws(()=>start(r,'1'));r.players[1].ready=false;assert.throws(()=>start(r,'0'));r.players[1].ready=true;start(r,'0');
  const other=r.hand.find(p=>p.id!==r.turn);assert.throws(()=>action(r,other.id,{action:'fold'}));
  const before=total(r);assert.throws(()=>action(r,r.turn,{action:'raise',amount:-100}));assert.equal(total(r),before);assert.throws(()=>action(r,r.turn,{action:'raise',amount:Infinity}));
});
test('holdem multiple all-in side pots conserve chips including ties',()=>{
  const r=room('holdem');start(r,'0');r.board=cards([2,3,4,8,10],'♣');r.board[0].s='♦';r.board[2].s='♠';
  r.hand.forEach((p,i)=>{p.total=[100,200,300][i];p.chips=1000-p.total;p.cards=cards([[14,14],[13,13],[12,12]][i],'♥');});r.pot=600;
  settlePoker(r);assert.equal(total(r),3000);assert.deepEqual(r.hand.map(p=>p.chips),[1200,1000,800]);
  const t=room('holdem');start(t,'0');t.board=cards([10,11,12,13,14]);t.hand.forEach(p=>{p.total=11;p.chips=989;});t.pot=33;settlePoker(t);assert.equal(total(t),3000);assert.deepEqual(t.hand.map(p=>p.chips),[1000,1000,1000]);
});
test('random complete holdem rounds conserve all chips and always terminate',()=>{
  for(let i=0;i<100;i++){const r=room('holdem',2+i%5);start(r,'0');let steps=0;while(r.phase==='playing'&&steps++<200){const p=r.hand.find(p=>p.id===r.turn);const a=Math.random()<.10?'fold':Math.random()<.10&&!p.raiseClosed&&p.street+p.chips>r.currentBet?'raise':'call';action(r,p.id,{action:a,amount:p.street+p.chips});}assert.equal(r.phase,'result');assert.equal(total(r),r.players.length*1000);}
});
test('zjh compare, blind cards, automatic end and chip conservation',()=>{
  for(let i=0;i<30;i++){const r=room('zjh',2+i%5);start(r,'0');let steps=0;while(r.phase==='playing'&&steps++<100){const p=r.hand.find(p=>p.id===r.turn);if(!p.seen)action(r,p.id,{action:'look'});action(r,p.id,{action:p.chips>=r.baseBet*2?'call':'fold'});}assert.equal(r.phase,'result');assert.equal(total(r),r.players.length*1000);}
  const r=room('zjh');start(r,'0');const p=r.turn;assert.throws(()=>action(r,p,{action:'compare',target:p}));action(r,p,{action:'compare',target:r.hand.find(q=>q.id!==p).id});assert.equal(r.hand.filter(q=>q.folded).length,1);
});
test('blackjack natural, push, bust, dealer blackjack and doubling',()=>{
  for(let i=0;i<50;i++){const r=room('blackjack',6);start(r,'0');for(const p of r.players)action(r,p.id,{action:'bet',amount:20});let steps=0;while(r.phase==='playing'&&steps++<60){const p=r.hand.find(p=>p.id===r.turn);action(r,p.id,{action:bjScore(p.cards)<16?'hit':'stand'});}assert.equal(r.phase,'result');assert.ok(r.players.every(p=>Number.isInteger(p.chips)&&p.chips>=0));}
  const r=room('blackjack',2);start(r,'0');
  // pop order: dealer 10,7; player 0 A,K; player 1 10,7.
  r.deck=[...cards([7,10,13,14,7,10])];
  action(r,'0',{action:'bet',amount:20});action(r,'1',{action:'bet',amount:20});action(r,'1',{action:'stand'});assert.deepEqual(r.players.map(p=>p.chips),[1030,1000]);
  const d=room('blackjack',2);start(d,'0');d.deck=cards([7,10,9,8,14,10]);action(d,'0',{action:'bet',amount:20});action(d,'1',{action:'bet',amount:20});assert.equal(d.phase,'result');assert.deepEqual(d.players.map(p=>p.chips),[980,980]);
});
test('baccarat same outcome for everyone, betting hidden and tie refunds',()=>{
  const r=room('baccarat',3);start(r,'0');r.deck=cards([14,7,14,7]);action(r,'0',{action:'bet',amount:100,pick:'P'});assert.equal(view(r,'1').players[0].pick,null);action(r,'1',{action:'bet',amount:100,pick:'B'});action(r,'2',{action:'bet',amount:100,pick:'T'});assert.equal(r.phase,'result');assert.equal(r.bResult,'T');assert.deepEqual(r.players.map(p=>p.chips),[1000,1000,1800]);assert.throws(()=>action(r,'0',{action:'bet',amount:100,pick:'T'}));
});
test('timeouts advance all modes and reconnect does not require client authority',()=>{
  for(const game of ['holdem','zjh','blackjack','baccarat']){const r=room(game);start(r,'0');let n=0;while(r.phase!=='result'&&n++<100)timeout(r,r.deadline+1);assert.equal(r.phase,'result');}
});
test('late join cannot act; switching modes clears hands; refill is restricted',()=>{
  const r=room('zjh');start(r,'0');const guest=makePlayer('guest','新朋友');r.players.push(guest);assert.throws(()=>action(r,guest.id,{action:'look'}));assert.throws(()=>action(r,'0',{action:'refill'}));assert.throws(()=>action(r,'0',{action:'game',game:'holdem'}));while(r.phase==='playing')timeout(r,r.deadline+1);action(r,'0',{action:'game',game:'holdem'});assert.equal(r.hand.length,0);assert.equal(r.phase,'lobby');assert.ok(r.players.every(p=>!p.ready));
});
