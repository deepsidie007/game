const {useLayoutEffect,useEffect,useRef,useState}=React;

export function useBoardWalk(room,length){
 const [walks,setWalks]=useState({});
 const previous=useRef(null),timers=useRef(new Map());
 const roll=room?.lastRoll;
 useEffect(()=>{
  const pending=timers.current;
  return()=>{for(const timer of pending.values())clearTimeout(timer);pending.clear();};
 },[room?.code]);
 useLayoutEffect(()=>{
  const prior=previous.current;
  previous.current={code:room?.code,id:roll?.id};
  if(!room||!roll||prior?.code!==room.code||prior.id===roll.id||
   Date.now()-roll.at>4000||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const player=room.players[roll.player];
  const steps=roll.faces.reduce((sum,face)=>sum+face,0);
  const to=roll.to??player.pos,from=roll.from??(to-steps+length)%length;
  if(!(steps>0&&steps<=12)||player.pos!==to||(from+steps)%length!==to)return;
  const index=roll.player, pending=timers.current;
  clearTimeout(pending.get(index));
  const setWalk=(step)=>setWalks(w=>{
   const next={...w};
   if(step>steps)delete next[index];
   else next[index]={id:roll.id,index,from,to,step,tile:(from+step)%length,code:room.code};
   return next;
  });
  const interval=Math.min(230,1650/steps);
  const advance=(step)=>{
   setWalk(step);
   if(step<=steps)pending.set(index,setTimeout(()=>advance(step+1),interval));
   else pending.delete(index);
  };
  setWalk(0);
  pending.set(index,setTimeout(()=>advance(1),Math.max(0,1250-(Date.now()-roll.at))));
 },[room?.code,roll?.id,length]);
 return Object.values(walks).filter(w=>w.code===room?.code&&room.players[w.index]?.pos===w.to);
}
