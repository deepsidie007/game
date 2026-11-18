export const FACE_POSES={1:[0,0],2:[-90,0],3:[0,-90],4:[0,90],5:[90,0],6:[0,180]};
export const FACE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
export function safeFace(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=6?n:5;}
export function diceValues(state){const values=state?.lastRoll?.faces?.length?state.lastRoll.faces:state?.diceFaces?.length?state.diceFaces:[state?.dice||5];return values.slice(0,2).map(safeFace);}
export function Dice3D({value=5,pending=false,rollId=0,rolledAt=0,index=0}){
 const h=React.createElement,{useEffect,useRef,useState}=React;
 const n=safeFace(value),[phase,setPhase]=useState('idle'),seen=useRef(rollId),mounted=useRef(false);
 useEffect(()=>{const first=!mounted.current;mounted.current=true;const changed=rollId!==seen.current,fresh=rolledAt>0&&Math.abs(Date.now()-rolledAt)<5000;
  if(pending){setPhase('spinning');return;}
  if(changed||first&&rollId>0&&fresh){seen.current=rollId;setPhase('settling');const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;const id=setTimeout(()=>setPhase('idle'),reduced?180:1150);return()=>clearTimeout(id);}
  setPhase('idle');
 },[pending,rollId,rolledAt,n]);
 const [rx,ry]=FACE_POSES[n],inMotion=phase!=='idle';
 return h('div',{className:'dice-scene '+(index?'dice-secondary':''),'data-result':n,'data-motion':phase,role:'img','aria-label':inMotion?'骰子滚动中':'骰子点数 '+n,style:{'--face-x':rx+'deg','--face-y':ry+'deg','--roll-direction':index?-1:1}},
  h('div',{className:'dice-ground-shadow '+(inMotion?'is-moving':''),'aria-hidden':true}),
  h('div',{className:'dice-lift is-'+phase,'aria-hidden':true},
   h('div',{className:'dice-cube is-'+phase},[1,2,3,4,5,6].map(face=>h('div',{key:face,className:'cube-face cube-face-'+face,'data-face':face},Array.from({length:9},(_,i)=>h('span',{key:i,className:'dice-pip '+(FACE_PIPS[face].includes(i)?'filled':'empty')})))))),
  h('span',{className:'dice-point-badge','aria-hidden':true},inMotion?'…':String(n)));
}
