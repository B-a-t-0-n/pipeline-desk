const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeHost,parseProject,stageStatus,summarizeJobs,createClient}=require('../electron/gitlab.cjs');

test('URLs keep self-hosted subpaths and prevent token disclosure to other origins',()=>{
  assert.equal(normalizeHost('https://git.example.com/gitlab/'),'https://git.example.com/gitlab');
  for(const value of ['http://git.example.com','https://user:pass@git.example.com','https://git.example.com?token=x'])assert.throws(()=>normalizeHost(value));
  assert.equal(parseProject('https://git.example.com/gitlab/team/sub/backend/-/pipelines/1042','https://git.example.com/gitlab'),'team/sub/backend');
  assert.equal(parseProject('team/backend.git','https://git.example.com'),'team/backend');
  assert.throws(()=>parseProject('https://evil.example/team/repo','https://git.example.com'));
  assert.throws(()=>parseProject('https://git.example.com/gitlab-other/team/repo','https://git.example.com/gitlab'));
  assert.throws(()=>parseProject('team/../repo','https://git.example.com'));
});

test('required failure wins; optional failure is a warning; manual and canceled stay distinct',()=>{
  assert.equal(stageStatus([{status:'success'},{status:'failed'}]),'failed');
  assert.equal(stageStatus([{status:'success'},{status:'failed',allow_failure:true}]),'warning');
  assert.equal(stageStatus([{status:'running'},{status:'pending'}]),'running');
  assert.equal(stageStatus([{status:'manual',allow_failure:false},{status:'success'}]),'manual');
  assert.equal(stageStatus([{status:'canceled'},{status:'success'}]),'canceled');
  assert.equal(stageStatus([{status:'skipped'}]),'skipped');
});

test('retry replaces previous failure without moving the first stage behind deploy',()=>{
  const result=summarizeJobs([
    {id:10,name:'lint',stage:'quality',status:'success'},
    {id:3,name:'deploy',stage:'deploy',status:'success'},
    {id:2,name:'build',stage:'build',status:'success'},
    {id:1,name:'lint',stage:'quality',status:'failed'},
  ]);
  assert.deepEqual(result.map(s=>s.name),['quality','build','deploy']);
  assert.equal(result[0].status,'success');assert.equal(result[0].jobs.length,1);
});

test('reads latest matching branch, paginates jobs and includes child pipeline bridges',async()=>{
  const calls=[];
  const fixture=async(url,options)=>{
    calls.push(url);assert.equal(options.headers['PRIVATE-TOKEN'],'secret');assert.equal(options.redirect,'error');assert.equal(options.method,undefined);
    const route=url.pathname;
    let body, next='';
    if(route.endsWith('/pipelines')){assert.equal(url.searchParams.get('ref'),'feat/a');body=[{id:8,status:'running'}];}
    else if(route.endsWith('/pipelines/8'))body={id:8,status:'running',ref:'feat/a',sha:'abc',duration:12};
    else if(route.endsWith('/jobs')){
      assert.equal(url.searchParams.get('include_retried'),'true');
      if(url.searchParams.get('page')==='1'){body=[{id:1,name:'test',stage:'test',status:'success'}];next='2';}
      else body=[{id:2,name:'build',stage:'build',status:'running'}];
    }else if(route.endsWith('/bridges'))body=[{id:3,name:'child',stage:'deploy',status:'pending',downstream_pipeline:{web_url:'https://git.example/child/-/pipelines/1'}}];
    else throw new Error('Unexpected request');
    return new Response(JSON.stringify(body),{headers:{'x-next-page':next}});
  };
  const result=await createClient('https://git.example','secret',fixture).pipeline({id:4,branch:'feat/a'});
  assert.equal(result.pipeline.id,8);assert.deepEqual(result.stages.map(s=>s.name),['test','build','deploy']);
  assert.equal(calls.length,5);assert.ok(result.stages[2].jobs[0].webUrl.includes('child'));
});

test('empty project and expired token are explicit; rate limiting carries retry delay',async()=>{
  const empty=await createClient('https://git.example','secret',async()=>new Response('[]')).pipeline({id:1});
  assert.equal(empty.pipeline,null);
  await assert.rejects(createClient('https://git.example','secret',async()=>new Response('{}',{status:401})).user(),/Токен/);
  await assert.rejects(createClient('https://git.example','secret',async()=>new Response('{}',{status:429,headers:{'retry-after':'120'}})).user(),e=>e.retryAfter===120000);
});

test('project discovery keeps membership, search and pagination and strips unused fields',async()=>{
  const client=createClient('https://git.example','secret',async(url)=>{
    assert.equal(url.pathname,'/api/v4/projects');assert.equal(url.searchParams.get('membership'),'true');
    assert.equal(url.searchParams.get('search'),'backend');assert.equal(url.searchParams.get('page'),'2');
    return new Response(JSON.stringify([{id:42,path:'backend',path_with_namespace:'group/backend',namespace:{full_path:'group'},web_url:'https://git.example/group/backend',default_branch:'main',unneeded:'extra'}]),{headers:{'x-next-page':'3'}});
  });
  const result=await client.projects('backend',2);assert.equal(result.nextPage,3);assert.equal(result.items[0].name,'backend');assert.equal(result.items[0].unneeded,undefined);
});

test('OAuth-style netrc uses Bearer without also sending PRIVATE-TOKEN',async()=>{
  await createClient('https://git.example','secret',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer secret');assert.equal(options.headers['PRIVATE-TOKEN'],undefined);return new Response('{}');
  },'bearer').user();
});
