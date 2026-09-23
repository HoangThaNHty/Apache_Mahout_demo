const $=s=>document.querySelector(s);
const state={data:null,step:0,elapsed:0,duration:12000,playing:false,ready:false,timer:0,frame:-1,sourceFile:null,requestId:0};
const steps=[
['Đọc các lượt đánh giá','Dữ liệu','Mỗi dòng CSV chứa ID và tên người, ID và tên phim, cùng điểm từ 1 đến 5. Java kiểm tra dữ liệu và chuyển ba cột số cho Mahout.','FileDataModel','userId, movieId, rating','Tên giúp người xem hiểu; thuật toán làm việc với ID và điểm.'],
['Đưa điểm vào ma trận người – phim','Ma trận','Theo dõi từng lượt đánh giá đi vào đúng hàng người dùng và cột phim. Khi đọc xong, dấu ? còn lại nghĩa là chưa có đánh giá.','DataModel','R[người, phim] = điểm đã đánh giá','Đây là cách trực quan hóa dữ liệu; Mahout không cần lưu một bảng đặc đầy dấu hỏi.'],
['So sánh cách chấm điểm','Tương đồng','Chỉ so sánh các phim hai người cùng đánh giá. Trừ điểm trung bình riêng của mỗi người rồi đo xem các độ lệch có cùng xu hướng hay không.','PearsonCorrelationSimilarity','sim = Σ(a−ā)(b−b̄) / √[Σ(a−ā)² × Σ(b−b̄)²]','Gần +1: cùng xu hướng; gần −1: ngược xu hướng. Không đủ thông tin: không xác định.'],
['Chọn người có thị hiếu gần nhất','Láng giềng','Giữ tối đa hai người có độ tương đồng dương cao nhất. Người được chọn sẽ đóng góp điểm cho các phim cần dự đoán.','NearestNUserNeighborhood · N = 2 · sim > 0','Tương đồng → xếp hạng → chọn tối đa 2 người','Láng giềng là người chấm điểm tương tự, không phải người ở gần về địa lý.'],
['Lọc ra phim có thể gợi ý','Ứng viên','Lấy phim mà ít nhất một láng giềng đã đánh giá. Loại các phim người mục tiêu đã đánh giá; những phim còn lại là ứng viên.','GenericUserBasedRecommender','Phim của láng giềng − phim đã được mục tiêu đánh giá','Chưa đánh giá không đồng nghĩa với chưa xem. Đây là giới hạn dữ liệu của demo.'],
['Tính điểm dự đoán cho từng phim','Dự đoán','Nhân điểm của mỗi láng giềng với độ tương đồng, cộng các tích rồi chia cho tổng độ tương đồng. Xem từng ứng viên được tính lần lượt.','estimatePreference(userId, movieId)','Điểm = Σ(tương đồng × rating) / Σ(tương đồng)','Taste cần ít nhất hai đóng góp hợp lệ cho dự đoán này. Không đủ thì không gợi ý phim đó.'],
['Trả về tối đa hai phim phù hợp','Top-N','Mahout xếp hạng các phim có điểm dự đoán hợp lệ và trả tối đa hai phim. Có thể chỉ có một phim hoặc không có gợi ý nếu thiếu dữ liệu.','recommend(userId, 2)','CSV → dữ liệu → độ tương đồng → điểm → Top-2','Đây là điểm ước lượng trên thang 1–5, không phải xác suất người dùng sẽ thích phim.']
];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(v,d=3)=>v==null||!Number.isFinite(Number(v))?'Không xác định':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:d});
const p=()=>Math.min(1,state.elapsed/state.duration);
const count=length=>Math.min(length,Math.floor(p()*(length+1)));
const target=()=>state.data.targetUser.name;
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function stop(){state.playing=false;cancelAnimationFrame(state.timer);}
function render(){if(!state.ready)return;const s=steps[state.step];
 $('#progress').innerHTML=steps.map((x,i)=>`<button class="progress-step ${i===state.step?'active':''} ${i<state.step?'done':''}" data-step="${i}"><i>${i+1}</i><span>${x[1]}</span></button>`).join('');
 $('#progress').querySelectorAll('button').forEach(b=>b.onclick=()=>go(Number(b.dataset.step)));
 $('#step-kicker').textContent=`BƯỚC ${state.step+1} / 7 · MỤC TIÊU: ${target()}`;
 $('#step-title').textContent=s[0];$('#explain-title').textContent=s[0];$('#explain-text').textContent=s[2];
 $('#mahout-class').textContent=s[3];$('#formula').textContent=s[4];$('#takeaway').textContent=s[5];
 $('#play').textContent=state.playing?'Ⅱ Tạm dừng':'▶ Tiếp tục tự động';$('#prev').disabled=!state.step;$('#next').disabled=state.step===6;
 $('#status-text').textContent=state.playing?'ĐANG MINH HỌA':'TẠM DỪNG';$('.status-pill').classList.toggle('running',state.playing);visual();
}
function meter(text){return `<div class="source-meter">${text}</div>`;}
// Keep the matrix scroll container and result cards alive across animation frames.
const mounted={step:-1,data:null,html:null};
function visual(){
 const d=state.data,el=$('#visual'),fresh=mounted.step!==state.step||mounted.data!==d;
 if(fresh){mounted.step=state.step;mounted.data=d;mounted.html=null;el.scrollTop=0;el.scrollLeft=0;el.classList.toggle('matrix-view',state.step===1);}
 if(state.step===1){
  if(fresh)el.innerHTML=matrix(d);
  updateMatrix(d,el);
 }else if(state.step===6){
  if(fresh)el.innerHTML=renderTop(d);
  el.querySelectorAll('.rank-card').forEach((card,i)=>{
   const pending=i>=count(d.topN.length);
   card.classList.toggle('pending',pending);
   card.setAttribute('aria-hidden',String(pending));
  });
 }else{
  let picker='';const list=state.step===2?d.similarities:state.step===5?d.candidates:[];
  if(list.length)picker='<div class="score-strip">'+list.map((x,i)=>`<button class="quiet" data-detail="${i}">${esc(x.user||x.movie)}</button>`).join('')+'</div>';
  const html=picker+[csv,matrix,similarity,neighbors,candidates,prediction,renderTop][state.step](d);
  if(html!==mounted.html){const y=el.scrollTop,x=el.scrollLeft;el.innerHTML=html;el.scrollTop=y;el.scrollLeft=x;mounted.html=html;}
 }
 $('#step-time').textContent=`${Math.floor(state.elapsed/1000)} giây`;
 $('#timeline-bar').style.width=`${(state.step+p())/7*100}%`;
}
function updateMatrix(d,el){
 const k=count(d.ratings.length),last=d.ratings[k-1];
 const seen=new Map(d.ratings.slice(0,k).map(r=>[`${r.userId}/${r.movieId}`,r.rating]));
 el.querySelectorAll('[data-cell]').forEach(cell=>{
  const key=cell.dataset.cell,v=seen.get(key),text=v==null?'?':String(v);
  if(cell.textContent!==text)cell.textContent=text;
  cell.classList.toggle('missing',v==null);cell.classList.toggle('rated',v!=null);
  cell.classList.toggle('hot',!!last&&key===`${last.userId}/${last.movieId}`);
 });
 const label=last?`Dòng ${k}/${d.ratings.length}: ${last.user} → ${last.movie} → ${last.rating} sao`:'Khởi tạo bảng: hàng là người, cột là phim';
 const meter=el.querySelector('.source-meter');if(meter.textContent!==label)meter.textContent=label;
 const hint=el.querySelector('.hint');
 const text=`Cam: người cần gợi ý. ${k===d.ratings.length?'Các ô ? còn lại chưa có rating.':'Đang nhập điểm; các ô ? có thể đang chờ đọc dữ liệu.'} Bạn có thể cuộn bảng trong lúc chạy; vị trí cuộn được giữ nguyên.`;
 if(hint.textContent!==text)hint.textContent=text;
}
$('#visual').onclick=e=>{if(!state.ready)return;const b=e.target.closest('[data-detail]');if(!b)return;stop();const len=state.step===2?state.data.similarities.length:state.data.candidates.length;state.elapsed=(Number(b.dataset.detail)+.95)/len*state.duration;render();};
function csv(d){const k=count(d.ratings.length);return meter(`Đọc ${k} / ${d.ratings.length} lượt · ${d.users.length} người · ${d.movies.length} phim`)+`<table class="math-table"><thead><tr><th>Dòng</th><th>ID · Người</th><th>ID · Phim</th><th>Điểm</th></tr></thead><tbody>${d.ratings.slice(Math.max(0,k-9),k).map((r,i)=>`<tr><td>${Math.max(0,k-9)+i+1}</td><td>${r.userId} · ${esc(r.user)}</td><td>${r.movieId} · ${esc(r.movie)}</td><td><b>${r.rating} ★</b></td></tr>`).join('')}</tbody></table><p class="hint">Dữ liệu mẫu tự tạo để học thuật toán, không phải đánh giá thực từ khán giả. Mỗi cặp người–phim xuất hiện tối đa một lần.</p>`;}
function matrix(d){const k=count(d.ratings.length),seen=new Map(d.ratings.slice(0,k).map(r=>[`${r.userId}/${r.movieId}`,r.rating])),last=d.ratings[k-1];return meter(last?`Dòng ${k}/${d.ratings.length}: ${esc(last.user)} → ${esc(last.movie)} → ${last.rating} sao`:'Khởi tạo bảng: hàng là người, cột là phim')+`<div class="matrix-scroll"><table class="large-matrix"><thead><tr><th>Người / Phim</th>${d.movies.map(m=>`<th title="${esc(m.name)}">${m.id}<br>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${d.users.map(u=>`<tr class="${u.id===d.targetUser.id?'target':''}"><th>${u.id} · ${esc(u.name)}</th>${d.movies.map(m=>{const key=`${u.id}/${m.id}`,v=seen.get(key);return `<td data-cell="${key}" class="${v==null?'missing':'rated'} ${last&&last.userId===u.id&&last.movieId===m.id?'hot':''}">${v??'?'}</td>`}).join('')}</tr>`).join('')}</tbody></table></div><p class="hint">Cam: người cần gợi ý. ${k===d.ratings.length?'Các ô ? còn lại chưa có rating.':'Đang nhập điểm: một số ô ? vẫn đang chờ đọc dữ liệu.'} Đây là hình minh họa ma trận, không phải cách Mahout cấp phát bộ nhớ.</p>`;}
function similarity(d){const idx=Math.min(d.similarities.length-1,Math.floor(p()*d.similarities.length)),s=d.similarities[idx];if(!s)return '<p>Không có người để so sánh.</p>';const a=d.matrix.find(r=>r.userId===d.targetUser.id),b=d.matrix.find(r=>r.userId===s.userId);const pairs=d.movies.map((m,i)=>({m,a:a.values[i],b:b.values[i]})).filter(x=>x.a!=null&&x.b!=null);const ma=pairs.reduce((t,x)=>t+x.a,0)/pairs.length,mb=pairs.reduce((t,x)=>t+x.b,0)/pairs.length;
return meter(`${esc(target())} ↔ ${esc(s.user)} · ${pairs.length} phim chung · Pearson = ${n(s.value)}`)+`<div class="pair-layout"><div><table class="math-table"><tr><th>Phim chung</th><th>${esc(target())}</th><th>${esc(s.user)}</th><th>Tích độ lệch</th></tr>${pairs.map(x=>`<tr><td>${esc(x.m.name)}</td><td>${x.a} − ${n(ma,2)}</td><td>${x.b} − ${n(mb,2)}</td><td>${n((x.a-ma)*(x.b-mb),2)}</td></tr>`).join('')}</table><p class="hint">Trung bình trên phim chung: ${n(ma,2)} và ${n(mb,2)}. Công thức đầy đủ ở khung giải thích.</p></div><div class="similarity-list">${d.similarities.slice(0,idx+1).map(x=>`<div class="sim-line"><span>${esc(x.user)}</span><div class="signed-track"><i style="left:${x.value<0?50-Math.abs(x.value)*50:50}%;width:${Math.abs(x.value??0)*50}%;background:${x.value<0?'var(--red)':'var(--cyan)'}"></i></div><b>${n(x.value,2)}</b></div>`).join('')}<p class="hint">Trái: −1 · Giữa: 0 · Phải: +1</p></div></div>`;}
function neighbors(d){const list=[...d.similarities].sort((a,b)=>(b.value??-2)-(a.value??-2));return meter(`Chọn tối đa 2 người có tương đồng > 0 với ${esc(target())}`)+`<div class="neighbor-grid">${list.slice(0,count(list.length)).map((x,i)=>`<div class="neighbor-item ${x.selected?'chosen':''}"><span>#${i+1} · ${esc(x.user)}</span><b>${n(x.value)}</b><small>${x.selected?'✓ Được Mahout chọn':'Không được chọn'}</small></div>`).join('')}</div>`;}
function candidates(d){const ids=new Set(d.candidates.map(c=>c.movieId));const near=new Set(d.neighbors.map(x=>x.userId));const movies=d.movies.filter(m=>d.ratings.some(r=>r.movieId===m.id&&near.has(r.userId)));return meter(`Phim từ láng giềng → bỏ phim ${esc(target())} đã đánh giá → ${d.candidates.length} ứng viên`)+`<div class="candidate-grid">${movies.slice(0,count(movies.length)).map(m=>`<article class="candidate ${ids.has(m.id)?'':'excluded'}"><b>${esc(m.name)}</b><p>${ids.has(m.id)?'? Chưa có điểm → giữ lại':'Đã đánh giá → loại khỏi gợi ý'}</p></article>`).join('')}</div>`;}
function prediction(d){if(!d.candidates.length)return '<div class="empty-result"><h3>Chưa có phim để dự đoán</h3><p>'+esc(resultReason(d))+'</p></div>';const pos=p()*d.candidates.length,idx=Math.min(d.candidates.length-1,Math.floor(pos)),phase=p()===1?1:pos-idx,c=d.candidates[idx];return meter(`Ứng viên ${idx+1}/${d.candidates.length} · ${esc(c.movie)} · dự đoán cho ${esc(target())}`)+`<div class="prediction-view"><div class="calc">${c.contributions.map((x,i)=>`<div class="calc-row" style="opacity:${phase>i*.22?1:.25}"><span>${esc(x.user)}<br>${n(x.similarity)} × ${n(x.rating)} sao</span><code> = ${phase>i*.22?n(x.weighted):'…'}</code></div>`).join('')}<div class="equation">${phase>.5?`${n(c.numerator)} ÷ ${n(c.denominator)}`:'Cộng các tích / cộng trọng số'}</div></div><div class="prediction-score"><span>Ô ? CỦA ${esc(target())}</span><strong>${phase>.72?n(c.prediction,2):'?'}</strong><small>${c.prediction==null?'Cần hai đóng góp hợp lệ':'Điểm dự đoán · thang 1–5'}</small></div></div><div class="score-strip">${d.candidates.slice(0,idx).map(x=>`<span>${esc(x.movie)}: <b>${n(x.prediction,2)}</b></span>`).join('')}</div><p class="hint">Phép tính có trọng số của Taste trong cấu hình demo này; không phải ALS. Số hiển thị được làm tròn, phép tính dùng độ chính xác đầy đủ.</p>`;}
function resultReason(d){
 if(!d.neighbors.length)return 'Không tìm được người có độ tương đồng dương với '+d.targetUser.name+'. Cần thêm đánh giá chung có sự khác biệt về điểm.';
 if(!d.candidates.length)return 'Các phim láng giềng đã đánh giá đều có điểm của '+d.targetUser.name+'; không còn phim mới trong tập ứng viên.';
 if(!d.topN.length)return 'Các phim ứng viên chưa có đủ hai đóng góp hợp lệ từ láng giềng để Mahout dự đoán.';
 if(d.topN.length<2)return 'Chỉ có một phim đủ điều kiện dự đoán. Ứng dụng không tự tạo thêm kết quả.';
 return 'Điểm dự đoán, không phải đánh giá đã được người dùng nhập.';
}
function renderTop(d){return meter(`Top-${d.topN.length} cho ${esc(target())} · kết quả Java/Mahout`)+`<div class="ranking">${d.topN.map((x,i)=>`<div class="rank-card ${i>=count(d.topN.length)?'pending':''} ${i===0?'first':''}"><div class="rank-num">#${x.rank}</div><div><h3>${esc(x.movie)}</h3><p>movieId ${x.movieId} · chưa có đánh giá của ${esc(target())}</p></div><div class="rank-score">${n(x.score,2)} ★</div></div>`).join('')}<p class="hint">${esc(resultReason(d))}</p></div>`;}
function tick(now){if(!state.playing)return;state.elapsed=Math.min(state.duration,now-state.startedAt);const bucket=Math.floor(p()*150);if(bucket!==state.frame){state.frame=bucket;visual();}if(state.elapsed>=state.duration){if(state.step===6){stop();render();return;}state.step++;state.elapsed=0;state.startedAt=now;state.frame=-1;render();}state.timer=requestAnimationFrame(tick);}
function playPause(){if(!state.ready)return;$('#intro').classList.add('hidden');if(state.playing){stop();render();return;}if(state.elapsed>=state.duration)state.elapsed=0;state.playing=true;state.startedAt=performance.now()-state.elapsed;state.frame=-1;render();state.timer=requestAnimationFrame(tick);}
function go(step){if(!state.ready)return;stop();state.step=Math.max(0,Math.min(6,step));state.elapsed=state.duration;const len=state.step===2?state.data.similarities.length:state.step===5?state.data.candidates.length:0;if(len)state.elapsed=.95/len*state.duration;render();}
function replay(){if(!state.ready)return;stop();state.step=0;state.elapsed=0;playPause();}
$('#play').onclick=playPause;$('#prev').onclick=()=>go(state.step-1);$('#next').onclick=()=>go(state.step+1);$('#replay').onclick=replay;
$('#overview').onclick=()=>{stop();render();$('#intro').classList.remove('hidden');};$('#intro-start').onclick=replay;
$('#manual-start').onclick=()=>{if(state.ready){$('#intro').classList.add('hidden');go(0);}};
$('#speed').onchange=e=>{const ratio=p();state.duration=Number(e.target.value);state.elapsed=ratio*state.duration;state.startedAt=performance.now()-state.elapsed;};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Trình duyệt không cho phép toàn màn hình.');}};
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();playPause();}else if(e.key==='ArrowRight')go(state.step+1);else if(e.key==='ArrowLeft')go(state.step-1);else if(e.key.toLowerCase()==='r')replay();else if(e.key.toLowerCase()==='f')$('#fullscreen').click();else if(e.key.toLowerCase()==='o')$('#overview').click();});
function enableControls(ready){
 ['intro-start','manual-start','run-user','play','replay','next','prev'].forEach(id=>$('#'+id).disabled=!ready);
 ['user-select','intro-user-select'].forEach(id=>$('#'+id).disabled=!ready);
}
function updateUserControls(d){
 const options=d.users.map(u=>`<option value="${u.id}"${u.id===d.targetUser.id?' selected':''}>${String(u.id).padStart(2,'0')} · ${esc(u.name)}</option>`).join('');
 ['user-select','intro-user-select'].forEach(id=>{
  const select=$('#'+id);select.innerHTML=options;
 });
 const rated=d.matrix.find(r=>r.userId===d.targetUser.id).values.filter(v=>v!=null).length;
 $('#user-summary').textContent=`${d.targetUser.name}: ${rated} phim đã đánh giá · ${d.movies.length-rated} phim chưa có điểm`;
 $('#run-user').textContent=`▶ Chạy gợi ý cho ${d.targetUser.name}`;
}
async function load(file=null,userId=null){
 const requestId=++state.requestId;
 stop();state.ready=false;enableControls(false);
 $('#visual').classList.remove('matrix-view');
 $('#visual').innerHTML='<div class="empty-result">Đang tính lại bằng Java/Mahout…</div>';
 mounted.step=-1;mounted.data=null;
 $('#status-text').textContent='ĐANG TÍNH';$('.status-pill').classList.remove('running');
 $('#user-summary').textContent='Đang tính cho người được chọn…';
 $('#dataset-status').textContent='Đang kiểm tra CSV và tính bằng Java/Mahout…';
 try{
  if(file&&file.size>200000)throw Error('CSV tối đa 200 KB.');
  const suffix=userId==null?'':'?userId='+encodeURIComponent(userId);
  const response=await fetch((file?'/api/dataset':'/api/demo/trace')+suffix,file?{method:'POST',headers:{'Content-Type':'text/csv; charset=utf-8'},body:await file.text()}:{});
  const d=await response.json();if(requestId!==state.requestId)return;
  if(!response.ok)throw Error(d.error||`HTTP ${response.status}`);
  state.sourceFile=file;state.data=d;state.ready=true;state.step=0;state.elapsed=state.duration;
  $('#dataset-size').textContent=`${d.users.length} người · ${d.movies.length} phim`;
  $('#dataset-count').textContent=`${d.ratings.length} lượt đánh giá`;
  $('#target-name').textContent=`Gợi ý cho ${d.targetUser.name}`;
  $('#intro-engine').textContent='✓ Java/Mahout đã tính xong kết quả';
  $('#engine-state').textContent='Mahout Taste · tính từ CSV';
  $('#dataset-status').textContent=`Đã tính cho ${d.targetUser.name}. Bấm chạy để xem các bước từ đầu.`;
  updateUserControls(d);enableControls(true);render();
 }catch(e){
  if(requestId!==state.requestId)return;
  state.ready=false;$('#intro-engine').textContent='✕ Chưa kết nối được dữ liệu';
  const message=`Không tải được dữ liệu: ${e.message}. Mở START_DEMO.cmd và dùng nút Tổng quan để nạp lại dataset.`;
  $('#dataset-status').textContent=message;$('#user-summary').textContent='Tính toán thất bại — hãy nạp lại dataset.';
  $('#visual').textContent=message;$('#status-text').textContent='LỖI KẾT NỐI';
  $('#engine-state').textContent='Dữ liệu chưa sẵn sàng';toast(e.message);
 }
}
$('#user-select').onchange=e=>load(state.sourceFile,Number(e.target.value));
$('#intro-user-select').onchange=e=>load(state.sourceFile,Number(e.target.value));
$('#run-user').onclick=replay;
$('#dataset-file').onchange=e=>{if(e.target.files[0])load(e.target.files[0]);};
$('#default-data').onclick=()=>load();load();
