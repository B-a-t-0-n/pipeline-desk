import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const name=url.pathname==='/'?'/ui/index.html':decodeURIComponent(url.pathname);
    if(!/^\/(ui|assets)\//.test(name))throw new Error();
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep))throw new Error();
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4317,'127.0.0.1',()=>process.stdout.write('Pipeline Desk preview: http://127.0.0.1:4317/ui/index.html\n'));
