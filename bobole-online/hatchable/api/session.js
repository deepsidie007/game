import { guest, route } from 'lib/rooms.js';
export const access='public';
export const methods=['GET'];
export default route(async req=>{const g=await guest(req);return {room:g?.room_code||null,name:g?.name||'',me:g?.guest_id||null};});
