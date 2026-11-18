import {test} from 'node:test';import assert from 'node:assert/strict';
import {FACE_POSES,FACE_PIPS,safeFace,diceValues} from '../public/dice3d.js';
import {createState,person,start,roll} from '../src/game.js';
test('Every 3D face has the right number of pips and lands facing forward',()=>{
 const normals={1:[0,0,1],2:[0,-1,0],3:[1,0,0],4:[-1,0,0],5:[0,1,0],6:[0,0,-1]};
 for(let n=1;n<=6;n++){
  assert.equal(FACE_PIPS[n].length,n);assert.equal(new Set(FACE_PIPS[n]).size,n);assert(FACE_PIPS[n].every(i=>i>=0&&i<=8));
  const [rx,ry]=FACE_POSES[n].map(v=>v*Math.PI/180),[x,y,z]=normals[n];
  const px=Math.cos(ry)*x+Math.sin(ry)*z,pz=-Math.sin(ry)*x+Math.cos(ry)*z;
  const finalY=Math.cos(rx)*y-Math.sin(rx)*pz,finalZ=Math.sin(rx)*y+Math.cos(rx)*pz;
  assert(Math.abs(px)<1e-8);assert(Math.abs(finalY)<1e-8);assert(Math.abs(finalZ-1)<1e-8);
 }
});
test('Single, double and repeated dice results retain authoritative face values',()=>{
 assert.equal(safeFace(7),5);assert.equal(safeFace(0),5);assert.equal(safeFace(6),6);
 assert.deepEqual(diceValues({lastRoll:{faces:[2,6]},diceFaces:[1]}),[2,6]);
 const s=createState('A','dice-test-authority-player');s.players.push(person('B','dice-test-second-player'));start(s,0);
 s.players[0].bag.remote=2;roll(s,6);assert.equal(s.lastRoll.player,0);assert.deepEqual(s.lastRoll.faces,[6]);assert.equal(s.lastRoll.id,1);
 s.current=0;s.phase='roll';s.players[0].pos=0;roll(s,6);assert.equal(s.lastRoll.id,2);assert.deepEqual(s.lastRoll.faces,[6]);
 s.current=0;s.phase='roll';s.players[0].doubleReady=true;roll(s);assert.equal(s.lastRoll.faces.length,2);assert.equal(s.lastRoll.faces.reduce((a,b)=>a+b,0),s.dice);
});
