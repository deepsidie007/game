import { enter, route } from 'lib/rooms.js';
export const access='public';
export const methods=['POST'];
export default route((req,res)=>enter(req,res,false));
