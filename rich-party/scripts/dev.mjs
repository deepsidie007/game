import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),args=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf(key);return i>=0&&args[i+1]?args[i+1]:fallback;};
const host=value('--host',value('--ip','127.0.0.1')),port=value('--port','4173');
const child=spawn(process.execPath,[join(dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js'),'dev','--ip',host,'--port',port,'--inspector-port','0'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
