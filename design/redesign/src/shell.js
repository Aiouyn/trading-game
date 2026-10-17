// Quay chrome builders shared by the Company mocks (same markup as desktop.html / phone.html).
function osStrip({rel='2', day='Day 38 · 11:20', rank='R2 · Owner', nw='$412,860.15', pct='+0.78%', pctCls='gain'}){
  return `<div class="strip">
  <div class="brand"><span>${glyph('quay',20,1.6)}</span><span class="wm">Quay</span><span class="rel">${rel}</span></div>
  <div class="launch">${glyph('search',14)}<span>Find an app, a ticker, a command</span><kbd>Ctrl K</kbd></div>
  <div class="mid"><span class="clock">${day}</span>
    <span class="muted" style="font-size:12px;display:flex;align-items:center;gap:6px"><span class="dot" style="background:var(--gain)"></span>Market open · Port Avalon</span>
    <div class="seg"><div>${glyph('pause',12,1.8)}</div><div class="on">1x</div><div>4x</div><div>20x</div></div></div>
  <div class="right"><span class="chip acc">${rank}</span><span class="nw">${nw} <span class="${pctCls}">${pct}</span></span><span class="bell">${glyph('bell',17)}<i></i></span></div></div>`;
}
function osShelf({running={}, locked=[], ws=2, wsOn=1, layout='Trade layout', r2=true}){
  let sh=`<div class="shelf ${r2?'r2':''}">`;
  APPS.forEach(([k,n],i)=>{ const st=running[k]||''; const lk=locked.includes(k)?' locked':''; sh+=`<div class="tile ${st}${lk}">${glyph(k,20)}${st?'<i class="rd"></i>':''}</div>`; if(i===3) sh+='<div class="sep"></div>'; });
  sh+=`<div class="tools"><div class="tool">${glyph('layout',15)}${layout}</div><div class="tool">${glyph('focus',15)}Focus <kbd>Ctrl .</kbd></div><div class="ws">${Array.from({length:ws},(_,i)=>`<div class="${i+1===wsOn?'on':''}">${i+1}</div>`).join('')}</div></div></div>`;
  return sh;
}
function winCtl(){ return `<div class="ctl"><div>${glyph('collapse',14,1.25)}</div><div>${glyph('fill',14,1.25)}</div><div>${glyph('close',14,1.25)}</div></div>`; }
function winTitle(app,name,sub){ return `<div class="tb"><span class="gl">${glyph(app,15)}</span><span class="nm">${name}</span><span class="sub">${sub||''}</span>${winCtl()}</div>`; }
