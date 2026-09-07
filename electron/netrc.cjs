const fs = require('node:fs/promises');
const {normalizeHost} = require('./gitlab.cjs');

// Read only an explicit machine entry. Never use credentials from `default`.
function parseNetrc(source, hostname) {
  const tokens=[];
  const text=String(source).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/^\s*macdef\s+[^\n]*\n[\s\S]*?(?:\n\s*\n|$)/gm,'\n');
  let i=0;
  while(i<text.length) {
    if(/\s/.test(text[i])){i++;continue;}
    if(text[i]==='#'){while(i<text.length&&text[i]!=='\n')i++;continue;}
    let value='',quoted=false;
    if(text[i]==='"'){quoted=true;i++;}
    let closed=!quoted;
    while(i<text.length){
      const char=text[i++];
      if(quoted&&char==='"'){closed=true;break;}
      if(!quoted&&/\s/.test(char))break;
      if(char==='\\'&&i<text.length){const escaped=text[i++];value+=({n:'\n',r:'\r',t:'\t'})[escaped]??escaped;}
      else value+=char;
    }
    if(!closed)throw new Error('Не удалось прочитать .netrc. Проверьте кавычки в файле.');
    tokens.push(value);
  }
  const matches=[];
  let entry=null;
  for(let n=0;n<tokens.length;n++){
    const field=tokens[n];
    if(field==='machine'){if(entry)matches.push(entry);entry={machine:tokens[++n]};}
    else if(field==='default'){if(entry)matches.push(entry);entry={machine:null};}
    else if(['login','password','account'].includes(field)){
      const value=tokens[++n];if(entry)entry[field]=value;
    }else throw new Error('Не удалось прочитать формат .netrc.');
  }
  if(entry)matches.push(entry);
  const selected=matches.filter(x=>x.machine?.toLowerCase()===hostname.toLowerCase());
  if(selected.length!==1||!selected[0].password)throw new Error('В .netrc нет однозначной записи для этого GitLab.');
  return {login:selected[0].login||'',password:selected[0].password};
}

async function readNetrc(file,host){
  if(!file)throw new Error('Файл .netrc не настроен. Вставьте токен.');
  let source;
  try{source=await fs.readFile(file,'utf8');}catch{throw new Error('Файл .netrc недоступен. Вставьте токен.');}
  return parseNetrc(source,new URL(normalizeHost(host)).hostname);
}
module.exports={parseNetrc,readNetrc};
