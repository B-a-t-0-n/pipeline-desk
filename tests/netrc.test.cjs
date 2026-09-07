const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseNetrc,readNetrc}=require('../electron/netrc.cjs');
test('netrc matches only the requested host, never default or another machine',()=>{
  const source='default login fallback password fallback-value\nmachine other.example login other password other-value\nmachine GIT.EXAMPLE login dev password test-token';
  assert.deepEqual(parseNetrc(source,'git.example'),{login:'dev',password:'test-token'});
  assert.throws(()=>parseNetrc(source,'missing.example'),/однозначной записи/);
});
test('netrc handles comments, CRLF, quoting, escapes and macros without executing them',()=>{
  const source='# comment\r\nmacdef setup\r\necho ignored\r\n\r\nmachine git.example\r\n login "my user"\r\n password "test \\"value\\""';
  const result=parseNetrc(source,'git.example');
  assert.equal(result.login,'my user');
  assert.equal(result.password,'test "value"');
});
test('ambiguous and malformed entries reject without echoing credentials',()=>{
  for(const source of ['machine git.example password one machine git.example password two','machine git.example password "sensitive']){
    assert.throws(()=>parseNetrc(source,'git.example'),error=>!error.message.includes('sensitive')&&!error.message.includes('one'));
  }
});
test('missing netrc reports recovery without exposing the file contents',async()=>{
  await assert.rejects(readNetrc('Z:/does-not-exist/.netrc','https://git.example'),/недоступен/);
});
