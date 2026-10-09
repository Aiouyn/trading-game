function crng(seed){let s=seed>>>0;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function cgauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
// 30 min bars, 14 per session, Day 34 to Day 38 (Day 38 open until 11:20 -> 5 bars). Deterministic.
function hlcnBars(){
  const r=crng(1207); let p=80; const out=[]; const days=[34,35,36,37,38];
  days.forEach((d,di)=>{ const n=d===38?5:14; const drift=[.0006,-.0004,-.0016,.0011,.0028][di];
    for(let i=0;i<n;i++){ const o=p; let c=o*(1+drift+.0042*cgauss(r)); if(d===36&&i===3)c=o*.978; if(d===38&&i===2)c=o*1.009;
      const h=Math.max(o,c)*(1+Math.abs(cgauss(r))*.0018), l=Math.min(o,c)*(1-Math.abs(cgauss(r))*.0018);
      out.push({d,i,o,h,l,c,v:.35+r()*.55+(d===36&&i===3?1.1:0)+(i===0?.4:0)}); p=c; } });
  const f=84.62/out[out.length-1].c; return out.map(k=>({...k,o:k.o*f,h:k.h*f,l:k.l*f,c:k.c*f}));
}
function drawChart(el,{w,h,P,pad=56,volH=46,axisH=20}){
  const d=hlcnBars(), n=d.length; const hi=Math.max(...d.map(x=>x.h))*1.002, lo=Math.min(...d.map(x=>x.l))*.998;
  const ch=h-axisH-volH-8; const y=v=>6+(hi-v)/(hi-lo)*(ch-12); const cw=(w-pad-8)/n;
  let s=`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*(i+.5)/5,yy=y(v);s+=`<line x1="0" x2="${w-pad}" y1="${yy}" y2="${yy}" stroke="${P.grid}"/><text x="${w-pad+8}" y="${yy+3.5}" fill="${P.faint}" font-family="JetBrains Mono" font-size="10">${v.toFixed(2)}</text>`}
  // day separators + labels
  d.forEach((k,i)=>{ if(k.i===0){ const x=i*cw; if(i>0) s+=`<line x1="${x}" x2="${x}" y1="0" y2="${h-axisH}" stroke="${P.line}" stroke-dasharray="2 3"/>`; s+=`<text x="${x+6}" y="${h-6}" fill="${P.faint}" font-family="JetBrains Mono" font-size="10">D${k.d}</text>`; } });
  // news pin on D36 bar 3
  const pinI=d.findIndex(k=>k.d===36&&k.i===3); const px=pinI*cw+cw/2; s+=`<circle cx="${px}" cy="${h-axisH-volH-2}" r="3" fill="none" stroke="${P.warn}" stroke-width="1.4"/>`;
  // MA
  let path=''; d.forEach((k,i)=>{ if(i<9) return; const m=d.slice(i-9,i+1).reduce((a,b)=>a+b.c,0)/10; path+=(path?'L':'M')+(i*cw+cw/2).toFixed(1)+' '+y(m).toFixed(1); });
  s+=`<path d="${path}" fill="none" stroke="${P.accLo}" stroke-width="1.25" opacity=".7"/>`;
  d.forEach((k,i)=>{ const x=i*cw+cw/2, up=k.c>=k.o, col=up?P.gain:P.loss, bw=Math.max(1.5,cw*.6);
    s+=`<line x1="${x}" x2="${x}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${col}" stroke-width="1"/>`;
    s+=`<rect x="${x-bw/2}" y="${y(Math.max(k.o,k.c))}" width="${bw}" height="${Math.max(1,Math.abs(y(k.o)-y(k.c)))}" fill="${col}" rx=".8"/>`;
    const vh=k.v/2.1*volH; s+=`<rect x="${x-bw/2}" y="${h-axisH-vh}" width="${bw}" height="${vh}" fill="${col}" opacity=".22"/>`; });
  const lc=d[n-1].c, yy=y(lc);
  s+=`<line x1="0" x2="${w-pad}" y1="${yy}" y2="${yy}" stroke="${P.acc}" stroke-dasharray="2 4" opacity=".85"/><rect x="${w-pad+2}" y="${yy-9}" width="${pad-4}" height="18" rx="4" fill="${P.acc}"/><text x="${w-pad+8}" y="${yy+3.8}" fill="${P.onAcc}" font-family="JetBrains Mono" font-size="10.5" font-weight="600">${lc.toFixed(2)}</text>`;
  s+='</svg>'; el.innerHTML=s;
}
function spark(seed,up,P,w=64,h=20){const r=crng(seed);let p=50,pts=[];for(let i=0;i<32;i++){p+=cgauss(r)*1.5+(up===null?0:up?.3:-.3);pts.push(p)}const hi=Math.max(...pts),lo=Math.min(...pts);const path=pts.map((v,i)=>`${i?'L':'M'}${(i/31*w).toFixed(1)},${(2+(hi-v)/(hi-lo)*(h-4)).toFixed(1)}`).join('');const c=up===null?P.muted:up?P.gain:P.loss;return `<svg width="${w}" height="${h}"><path d="${path}" fill="none" stroke="${c}" stroke-width="1.3"/></svg>`}
