const $=s=>document.querySelector(s);
const SIG={bullish:'Yükseliş',watch:'İzle',bearish:'Düşüş riski'};
let items=[],prices={};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const safeUrl=u=>/^https?:\/\//.test(u)?u:'#';
async function load(){
  const [i,p]=await Promise.all([fetch('data/insights.json').then(r=>r.json()),fetch('data/prices.json').then(r=>r.json()).catch(()=>({tickers:{}}))]);
  items=(i.items||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));prices=p.tickers||{};
  $('#upd').textContent='Son güncelleme: '+(i.updated||'—')+(i.note?' · '+i.note:'');
  const cats=[...new Set(items.map(x=>x.category).filter(Boolean))].sort();
  $('#fc').innerHTML='<option value="">Tüm kategoriler</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  render();
}
function chart(h){
  if(!h||h.length<2)return '<div class="nm">Fiyat verisi henüz yok.</div>';
  const v=h.map(x=>x[1]),mn=Math.min(...v),mx=Math.max(...v),W=600,H=150,P=4;
  const pts=v.map((y,i)=>`${(P+i*(W-2*P)/(v.length-1)).toFixed(1)},${(H-P-(y-mn)/((mx-mn)||1)*(H-2*P)).toFixed(1)}`).join(' ');
  const up=v[v.length-1]>=v[0],col=up?'#3ddc97':'#ff6b6b';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2"/></svg>`;
}
function stats(h){
  if(!h||h.length<2)return '';
  const v=h.map(x=>x[1]),last=v.at(-1),pc=(a,b)=>((a/b-1)*100).toFixed(1)+'%';
  const at=n=>v[Math.max(0,v.length-1-n)];
  return `<div class="stats"><span>Son <b>${last.toFixed(2)}</b></span><span>1G <b>${pc(last,at(1))}</b></span><span>1H <b>${pc(last,at(5))}</b></span><span>1A <b>${pc(last,at(21))}</b></span><span>Dönem yüksek <b>${Math.max(...v).toFixed(2)}</b></span><span>Dönem düşük <b>${Math.min(...v).toFixed(2)}</b></span></div>`;
}
function render(){
  const q=$('#q').value.toLowerCase(),fs=$('#fs').value,fm=$('#fm').value,ft=$('#ft').value,fc=$('#fc').value;
  const out=items.filter(x=>(!fs||x.signal===fs)&&(!fm||x.market===fm)&&(!ft||x.type===ft)&&(!fc||x.category===fc)&&(!q||(x.ticker+' '+x.name).toLowerCase().includes(q)));
  $('#list').innerHTML=out.length?out.map((x,n)=>{
    const h=(prices[x.ticker]||{}).history;
    return `<div class="card" data-n="${n}"><div class="top"><div><span class="tk">${esc(x.ticker)}</span> <span class="nm">${esc(x.name)} · ${esc(x.market)} · ${x.type==='fund'?'Fon':'Hisse'}</span></div><span class="tag s-${esc(x.signal)}">${SIG[x.signal]||esc(x.signal)}</span></div>
    <div class="hl">${esc(x.headline)}</div><div class="nm">${esc(x.category)} · ${esc(x.date)}</div>
    <div class="det"><p>${esc(x.summary)}</p><h4>Neden önemli</h4><p>${esc(x.why)}</p><h4>Risk</h4><p>${esc(x.risk)}</p>
    <h4>Grafik</h4><div class="chart">${chart(h)}${stats(h)}</div>
    <h4>Kaynaklar</h4>${(x.sources||[]).map(s=>`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}</div></div>`}).join(''):'<div class="empty">Sonuç yok.</div>';
}
$('#list').addEventListener('click',e=>{if(e.target.closest('a'))return;const c=e.target.closest('.card');if(c)c.classList.toggle('open')});
['#q','#fs','#fm','#ft','#fc'].forEach(s=>$(s).addEventListener('input',render));
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
load();
