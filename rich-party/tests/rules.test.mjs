import * as g from '../src/game.js';import * as old from '../src/legacy.js';import assert from 'node:assert/strict';
let clock=Date.now();const realNow=Date.now;Date.now=()=>clock;
const make=(n=3)=>{const s=g.createState('P0','test-map-forty-player-000');for(let i=1;i<n;i++)s.players.push(g.person('P'+i,'test-map-forty-player-00'+i));g.start(s,0);return s;};
let s=make();assert.equal(s.land.length,40);assert.equal(g.tiles.length,40);assert.equal(g.tiles.filter(x=>x.type==='property').length,20);
s.players[0].pos=6;g.landOn(s);assert.equal(s.phase,'bank');g.choose(s,'deposit');assert.equal(s.players[0].savings,500);s.current=0;s.phase='roll';s.players[0].pos=39;s.players[0].bag.remote=1;g.roll(s,1);assert.equal(s.players[0].savings,550);assert.equal(s.players[0].cash,3300);
s=make();s.players[0].pos=4;g.landOn(s);g.choose(s,'shield');assert.equal(s.players[0].bag.shield,1);s.current=0;s.players[0].pos=1;s.land[1]={owner:1,level:2};const cash=s.players[0].cash;g.landOn(s);assert.equal(s.players[0].cash,cash);assert.equal(s.players[0].bag.shield,0);
s=make();s.players[0].bag.boost=1;g.boost(s);g.roll(s);assert.equal(s.diceFaces.length,2);assert(s.dice>=2&&s.dice<=12);
s=make();s.players[0].pos=10;g.landOn(s);g.choose(s,'21');assert.equal(s.players[0].pos,21);assert.equal(s.phase,'buy');g.decide(s,true);assert.equal(s.land[21].owner,0);
s=make();s.players[0].pos=8;g.landOn(s);g.choose(s,'safe');assert.equal(s.players[0].cash,3350);
s=make();s.players[0].pos=13;g.landOn(s);const item=s.auction.tile;g.bid(s,1);const paid=s.auction.bid;assert.throws(()=>g.bid(s,1));clock=s.auction.ends+1;g.automatic(s);assert.equal(s.land[item].owner,1);assert.equal(s.players[1].cash,3200-paid);assert.equal(s.current,1);
s=make();for(const i of [1,2,5])s.land[i]={owner:0,level:0};assert.equal(g.rent(s,1),Math.floor(Math.floor(g.price(1,s)*.24)*1.5));
s=make();s.players[0].pos=17;s.players[0].cash=20;s.players[0].savings=300;g.landOn(s);assert.equal(s.players[0].cash,0);assert.equal(s.players[0].savings,120);assert(!s.players[0].out);
for(let n=2;n<=4;n++)for(let run=0;run<25;run++){s=make(n);s.players.forEach(p=>p.bot=true);let steps=0;while(s.status==='playing'&&steps++<1600){clock+=2000;g.automatic(s);assert(s.players.every(p=>p.cash>=0&&p.savings>=0));assert(s.land.every(l=>!l||l.owner<n&&l.level<=3));}assert.equal(s.status,'finished');assert(s.winner>=0&&s.winner<n);}
const legacy={status:'playing',players:[old.person('A','a',true),old.person('B','b',true)],land:Array(24).fill(null),log:[],current:0,phase:'roll',turns:0,dice:0,deadline:0};for(let i=0;i<300&&legacy.status==='playing';i++)g.automatic(legacy);assert.equal(legacy.status,'finished');assert.equal(g.mapFor(legacy).length,24);
Date.now=realNow;

console.log('PASS: 75 simulated games and all venue rules.');
