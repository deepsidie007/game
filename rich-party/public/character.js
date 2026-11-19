const {createElement: h, useRef, useState}=React;
const views=[['front','正面'],['side','侧面（朝右）'],['back','背面']];
const storageKey='rich-character-views';

export function loadCharacter(){
 try{return JSON.parse(localStorage.getItem(storageKey))||null;}catch{return null;}
}

async function prepareView(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){
  throw Error('请选择 10 MB 以内的 PNG、JPG 或 WebP 图片。');
 }
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  image.src=url;
  await image.decode();
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  for(const size of [96,80,64,48,32]){
   canvas.width=canvas.height=size;
   const scale=size/Math.max(image.naturalWidth,image.naturalHeight);
   const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
   context.drawImage(image,(size-width)/2,(size-height)/2,width,height);
   const data=canvas.toDataURL('image/webp',.8);
   if(data.startsWith('data:image/webp;base64,')&&data.length<=6144)return data;
  }
  throw Error('这张图片无法处理，请换一张再试。');
 }finally{URL.revokeObjectURL(url);}
}

export function CharacterEditor({character,onSave}){
 const dialog=useRef(null);
 const [draft,setDraft]=useState({}),[angle,setAngle]=useState('front');
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 async function upload(file,key){
  if(!file)return;
  setPending(true);
  setError('');
  try{
   const data=await prepareView(file);
   setDraft(previous=>({...previous,[key]:data}));
   setAngle(key);
  }catch(e){setError(e.message||'读取图片失败。');}
  finally{setPending(false);}
 }
 function save(value){
  try{
   if(value)localStorage.setItem(storageKey,JSON.stringify(value));
   else localStorage.removeItem(storageKey);
   onSave(value);
   dialog.current.close();
  }catch{setError('浏览器无法保存角色，请检查本地存储空间。');}
 }
 const src=draft[angle];
 return h(React.Fragment,null,
  h('button',{type:'button',className:'outline character-open',onClick:()=>{
   setDraft(character||{});setAngle('front');setError('');dialog.current.showModal();
  }},character?'编辑自定义角色':'自定义角色'),
  h('dialog',{className:'character-editor',ref:dialog,'aria-labelledby':'character-title',onCancel:e=>{if(pending)e.preventDefault();}},
   h('h2',{id:'character-title'},'自定义角色'),
   h('p',{className:'muted'},'上传正面、朝右侧面和背面。保存后，建房或加入时，同房好友可以看到你的棋子。'),
   h('div',{className:'character-files'},views.map(([key,label])=>h('label',{key},label,
    h('input',{type:'file',accept:'image/png,image/jpeg,image/webp',disabled:pending,onChange:e=>{
     const file=e.currentTarget.files[0];e.currentTarget.value='';upload(file,key);
    }}),draft[key]&&h('small',null,'已上传')))),
   h('div',{className:'character-angles',role:'group','aria-label':'预览角度'},
    views.map(([key,label])=>h('button',{key,type:'button',className:'outline','aria-pressed':angle===key,onClick:()=>setAngle(key)},label))),
   h('div',{className:'character-previews'},
    h('div',{className:'character-preview'},src?h('img',{src,alt:'角色预览'}):'等待上传'),
    h('div',{className:'character-mini'},src&&h('img',{src,alt:'棋子尺寸预览'}))),
   error&&h('p',{className:'error',role:'alert'},error),
   h('div',{className:'character-actions'},
    h('button',{type:'button',className:'outline',disabled:pending,onClick:()=>dialog.current.close()},'取消'),
    character&&h('button',{type:'button',className:'outline',disabled:pending,onClick:()=>save(null)},'恢复默认'),
    h('button',{type:'button',className:'primary',disabled:pending||views.some(([key])=>!draft[key]),onClick:()=>save(draft)},'保存角色'))
  )
 );
}
