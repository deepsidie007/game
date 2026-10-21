import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Execute the same trusted combat rules as the offline game, without rendering.
const game=readFileSync(new URL('../public/game.js',import.meta.url),'utf8').split('function rect(')[0];
const art=readFileSync(new URL('../public/art.js',import.meta.url),'utf8');
const effects=art.slice(art.indexOf('const specialBursts=[];'),art.indexOf('function renderSpecialEffects'));
export function createEngine(choices){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){},remove(){}},getContext(){return {}}});return nodes.get(id)};
 const context=vm.createContext({document:{getElementById:node,querySelector:node},window:{},choices});
 vm.runInContext(effects+'\n'+game+`\nconst net={other:{choice:choices[1]}}; mode='online';selected=choices[0];resetRound();
 globalThis.engine={
 step(inputs){keys.clear();pressed.clear();inputs.forEach((p,i)=>{for(const k of p.held||[])if(bindings[i][k])keys.add(bindings[i][k]);for(const k of p.pressed||[])if(bindings[i][k])pressed.add(bindings[i][k]);});update(1/60);},
 next(){if(wins.some(n=>n>=2)){wins=[0,0];round=1;}else if(Math.abs(fighters[0].hp-fighters[1].hp)>.01)round++;resetRound();},
 snapshot(){return {state,round,wins,timer,countdown,clock,shake,superFlash,fighters:fighters.map(f=>({...f,trail:[]})),balls:balls.map(b=>({...b,owner:b.owner.id})),fx:fx.slice(-60),texts:texts.slice(-10),bursts:specialBursts.slice(-10),result:[$('resultTitle').textContent,$('resultDesc').textContent,$('resultTag').textContent,document.querySelector('.ko-mark').textContent]};}
 };`,context);
 return context.engine;
}
