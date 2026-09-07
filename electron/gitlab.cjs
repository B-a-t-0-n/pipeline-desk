const ACTIVE = new Set(['running', 'pending', 'created', 'preparing', 'waiting_for_resource', 'scheduled']);

function normalizeHost(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Укажите полный адрес GitLab: https://gitlab.example.com'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Нужен HTTPS-адрес GitLab без логина и параметров.');
  return url.href.replace(/\/+$/, '');
}

function parseProject(value, host) {
  let path = String(value).trim();
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path), base = new URL(host);
    if (url.origin !== base.origin || url.username || url.password) throw new Error('Проект должен находиться на подключённом GitLab.');
    const prefix = base.pathname.replace(/\/$/, '');
    if (!url.pathname.startsWith(prefix + '/')) throw new Error('Ссылка находится вне подключённого GitLab.');
    path = decodeURIComponent(url.pathname.slice(prefix.length));
  }
  path = path.replace(/^\/+|\/+$/g, '').split('/-/')[0].replace(/\.git$/, '');
  if (!/^\d+$/.test(path) && !/^[\w.-]+(?:\/[\w.-]+)+$/.test(path)) throw new Error('Вставьте ссылку на проект или путь group/project.');
  if (path.split('/').some(part => part === '.' || part === '..')) throw new Error('Некорректный путь проекта.');
  return path;
}

function stageStatus(jobs) {
  if (jobs.some(j => j.status === 'failed' && !j.allow_failure)) return 'failed';
  if (jobs.some(j => j.status === 'running')) return 'running';
  if (jobs.some(j => ACTIVE.has(j.status))) return 'pending';
  if (jobs.some(j => j.status === 'canceled')) return 'canceled';
  if (jobs.some(j => j.status === 'manual' && !j.allow_failure)) return 'manual';
  if (jobs.some(j => j.status === 'failed' && j.allow_failure)) return 'warning';
  if (jobs.some(j => j.status === 'success')) return 'success';
  if (jobs.some(j => j.status === 'manual')) return 'manual';
  return 'skipped';
}

function summarizeJobs(jobs) {
  const newest = new Map(), order = new Map();
  for (const job of jobs) {
    order.set(job.stage, Math.min(order.get(job.stage) ?? Infinity, job.id));
    const key = `${job.stage}\0${job.name}`;
    if (!newest.has(key) || newest.get(key).id < job.id) newest.set(key, job);
  }
  const stages = new Map();
  for (const job of [...newest.values()].sort((a,b) => a.id - b.id)) {
    if (!stages.has(job.stage)) stages.set(job.stage, []);
    stages.get(job.stage).push(job);
  }
  return [...stages].sort(([a],[b])=>order.get(a)-order.get(b)).map(([name, group]) => ({ name, status: stageStatus(group), jobs: group.map(j => ({ id:j.id, name:j.name, status:j.status, allowFailure:!!j.allow_failure, webUrl:j.web_url || j.downstream_pipeline?.web_url, duration:j.duration })) }));
}

function createClient(host, token, fetcher = fetch, authMode = 'private') {
  async function get(path, query = {}) {
    const url = new URL(`${host}/api/v4${path}`);
    for (const [k,v] of Object.entries(query)) if (v !== '' && v != null) url.searchParams.set(k, v);
    let response;
    try { response = await fetcher(url, { headers:{ ...(authMode==='bearer'?{Authorization:`Bearer ${token}`}:{'PRIVATE-TOKEN':token}), Accept:'application/json' }, signal:AbortSignal.timeout(15000), redirect:'error' }); }
    catch { throw new Error('GitLab недоступен. Проверьте сеть или VPN.'); }
    if (!response.ok) {
      const messages = {401:'Токен недействителен или истёк. Обновите его в настройках.',403:'Недостаточно прав. Проверьте доступ к проекту и scope read_api.',404:'Проект или пайплайн не найден. Проверьте ссылку и доступ.',429:'Лимит GitLab. Повторим запрос позже.'};
      const err = new Error(messages[response.status] || `GitLab: ошибка ${response.status}. Повторим запрос автоматически.`);
      err.status=response.status;
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        err.retryAfter = Math.min(3600000, Math.max(60000, (Number(retry) || 60) * 1000));
      }
      throw err;
    }
    return { data:await response.json(), next:response.headers.get('x-next-page') };
  }
  async function all(path, query = {}, overflowMessage='Слишком много заданий: показ этапов недоступен.') {
    let page = '1', data = [];
    while (page) {
      const result = await get(path, {...query,per_page:100,page});
      data.push(...result.data);
      page = result.next;
      if (data.length >= 10000 && page) throw new Error(overflowMessage);
    }
    return data;
  }
  return {
    user: async () => (await get('/user')).data,
    project: async path => (await get(`/projects/${encodeURIComponent(path)}`)).data,
    async projects(search='',page=1) {
      const result=await get('/projects',{membership:true,simple:true,archived:false,order_by:'last_activity_at',sort:'desc',per_page:30,page,search});
      return {items:result.data.map(p=>({id:p.id,name:p.path,namespace:p.namespace?.full_path||'',path:p.path_with_namespace,webUrl:p.web_url,defaultBranch:p.default_branch})),nextPage:result.next?Number(result.next):null};
    },
    async groups(search='',page=1) {
      const result=await get('/groups',{all_available:false,top_level_only:false,order_by:'name',sort:'asc',per_page:30,page,search});
      return {items:result.data.map(g=>({id:g.id,name:g.name,fullPath:g.full_path,parentId:g.parent_id,webUrl:g.web_url})),nextPage:result.next?Number(result.next):null};
    },
    async group(id) {
      const {data:g}=await get(`/groups/${encodeURIComponent(id)}`,{with_projects:false});
      return {id:g.id,name:g.name,fullPath:g.full_path,parentId:g.parent_id,webUrl:g.web_url};
    },
    groupProjects: (id,includeSubgroups=true)=>all(`/groups/${encodeURIComponent(id)}/projects`,{include_subgroups:includeSubgroups,with_shared:false,archived:false,simple:true,order_by:'path',sort:'asc'},'В группе больше 10 000 проектов. Выберите подгруппы.'),
    async pipeline(project) {
      const base = `/projects/${project.id}/pipelines`;
      const history = (await get(base, {ref:project.branch, per_page:12,order_by:'id',sort:'desc'})).data;
      if (!history.length) return {pipeline:null,history:[],stages:[]};
      const id = history[0].id;
      const [detail, jobs, bridges] = await Promise.all([get(`${base}/${id}`),all(`${base}/${id}/jobs`,{include_retried:true}),all(`${base}/${id}/bridges`)]);
      const p = detail.data;
      return {
        pipeline:{id:p.id,status:p.status,ref:p.ref,sha:p.sha,webUrl:p.web_url,duration:p.duration,createdAt:p.created_at,startedAt:p.started_at,finishedAt:p.finished_at,source:p.source},
        history:history.map(p => ({id:p.id,status:p.status,webUrl:p.web_url})),
        stages:summarizeJobs([...jobs,...bridges])
      };
    }
  };
}

module.exports = {normalizeHost,parseProject,stageStatus,summarizeJobs,createClient};
