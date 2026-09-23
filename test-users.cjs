const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('./.tools/dom-test/node_modules/linkedom');
const base=process.argv[2]||'http://127.0.0.1:8080';
async function get(user){const r=await fetch(base+'/api/demo/trace?userId='+user);assert.equal(r.status,200);return r.json();}
function check(d){
 const id=d.targetUser.id,own=d.matrix.find(r=>r.userId===id).values;
 assert.equal(d.similarities.length,d.users.length-1);
 assert.ok(d.similarities.every(s=>s.userId!==id));
 for(const s of d.similarities){
  const other=d.matrix.find(r=>r.userId===s.userId).values;
  const pairs=own.map((a,i)=>[a,other[i]]).filter(p=>p.every(v=>v!=null));
  const [ma,mb]=[0,1].map(i=>pairs.reduce((t,p)=>t+p[i],0)/pairs.length);
  const sum=pairs.reduce((t,[a,b])=>[t[0]+(a-ma)*(b-mb),t[1]+(a-ma)**2,t[2]+(b-mb)**2],[0,0,0]);
  const similarity=sum[0]/Math.sqrt(sum[1]*sum[2]);
  if(Number.isFinite(similarity))assert.ok(Math.abs(similarity-s.value)<1e-5);else assert.equal(s.value,null);
 }
 const positives=d.similarities.filter(s=>s.value>0).sort((a,b)=>b.value-a.value);
 assert.equal(d.neighbors.length,Math.min(2,positives.length));
 d.neighbors.forEach(n=>{assert.ok(n.userId!==id&&n.similarity>0);assert.ok(n.similarity>=positives[Math.min(1,positives.length-1)].value-1e-6);});
 const known=new Set(d.ratings.filter(r=>r.userId===id).map(r=>r.movieId));
 const neighborIds=new Set(d.neighbors.map(n=>n.userId));
 const expected=new Set(d.ratings.filter(r=>neighborIds.has(r.userId)&&!known.has(r.movieId)).map(r=>r.movieId));
 assert.deepEqual(new Set(d.candidates.map(c=>c.movieId)),expected);
 for(const c of d.candidates){
  assert.ok(!known.has(c.movieId));
  c.contributions.forEach(x=>assert.ok(neighborIds.has(x.userId)));
  if(c.contributions.length<2)assert.equal(c.prediction,null);
  else assert.ok(Math.abs(c.prediction-c.numerator/c.denominator)<1e-5);
 }
 const scores=d.candidates.filter(c=>c.prediction!=null).map(c=>c.prediction).sort((a,b)=>b-a).slice(0,2);
 assert.deepEqual(d.topN.map(x=>x.score),scores);
}
(async()=>{
 const all=await Promise.all(Array.from({length:15},(_,i)=>get(i+1)));
 all.forEach((d,i)=>{assert.equal(d.targetUser.id,i+1);check(d);});
 for(const bad of ['0','999','x',''])assert.equal((await fetch(base+'/api/demo/trace?userId='+bad)).status,400);
 const csv=await(await fetch(base+'/api/dataset')).text();
 const post=async(text,id)=>{const r=await fetch(base+'/api/dataset'+(id==null?'':'?userId='+id),{method:'POST',body:text});assert.equal(r.status,200);return r.json();};
 const custom=csv.replaceAll('Bình','Bình tùy chỉnh');const uploaded=await post(custom,2);assert.equal(uploaded.targetUser.name,'Bình tùy chỉnh');check(uploaded);
 const sparse='userId,userName,movieId,movieName,rating\n11,Một,1,A,3\n12,Hai,2,B,4\n13,Ba,3,C,5';
 const empty=await post(sparse);assert.equal(empty.targetUser.id,11);assert.equal(empty.topN.length,0);check(empty);
 const {document}=parseHTML(fs.readFileSync('src/main/resources/web/index.html','utf8'));
 const node=s=>document.querySelector(s);let slowResolve;
 const context=vm.createContext({document,fetch:async(url,opts)=>{if(url.endsWith('userId=4'))await new Promise(r=>slowResolve=r);return fetch(base+url,opts);},setTimeout,clearTimeout,performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},console});
 Object.defineProperty(context,'top',{get:()=>context,configurable:false});
 vm.runInContext(await(await fetch(base+'/app.js')).text(),context);
 for(let i=0;i<200&&!vm.runInContext('state.ready',context);i++)await new Promise(r=>setTimeout(r,10));
 assert.ok(vm.runInContext('state.ready',context));assert.equal(node('#user-select').options.length,15);
 node('#intro-start').onclick();assert.equal(vm.runInContext('state.playing',context),true);
 const switching=node('#user-select').onchange({target:{value:'2'}});
 assert.equal(vm.runInContext('state.playing',context),false);assert.equal(node('#run-user').disabled,true);
 await switching;
 assert.equal(vm.runInContext('state.data.targetUser.id',context),2);assert.equal(vm.runInContext('state.step',context),0);
 assert.equal(node('#intro-user-select').value,'2');assert.ok(node('#user-summary').textContent.includes('Bình'));
 vm.runInContext('go(1)',context);assert.ok(node('.large-matrix tr.target th').textContent.includes('Bình'));
 node('#run-user').onclick();assert.equal(vm.runInContext('state.playing',context),true);
 await node('#intro-user-select').onchange({target:{value:'3'}});assert.equal(node('#user-select').value,'3');
 // A slow old request must not overwrite the most recently selected user.
 const slow=vm.runInContext('load(null,4)',context);await vm.runInContext('load(null,5)',context);slowResolve();await slow;
 assert.equal(vm.runInContext('state.data.targetUser.id',context),5);
 context.uploadFile={size:custom.length,text:async()=>custom};
 await vm.runInContext('load(uploadFile,2)',context);await node('#user-select').onchange({target:{value:'3'}});
 assert.equal(vm.runInContext('state.sourceFile===uploadFile',context),true);
 assert.ok(vm.runInContext('state.data.users.some(u=>u.name==="Bình tùy chỉnh")',context));
 // Render all seven steps for all users, including an empty-recommendation dataset.
 for(const data of [...all,empty]){
  context.testData=data;vm.runInContext('state.data=testData;state.ready=true',context);
  for(let step=0;step<7;step++){vm.runInContext(`go(${step})`,context);assert.ok(!/undefined|NaN/.test(node('#visual').innerHTML));}
 }
 assert.ok(node('#visual').textContent.includes('Không tìm được người'));
 console.log('PASS: 15 users independently verified, selection stops/resets playback, matrix target, controls sync, stale response protection, custom CSV retained, missing IDs and empty recommendations.');
 console.table(all.map(d=>({id:d.targetUser.id,name:d.targetUser.name,neighbors:d.neighbors.length,candidates:d.candidates.length,results:d.topN.length})));
})().catch(e=>{console.error(e);process.exitCode=1;});
