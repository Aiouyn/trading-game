// Deterministic wallpapers, one per palette. Pure SVG, no images.
function _rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function skyline(w, base, seed, x0=0, x1=w, minH=30, maxH=150){
  const r=_rng(seed); const out=[]; let x=x0;
  while(x<x1){ const bw=18+r()*46, bh=minH+Math.pow(r(),1.6)*(maxH-minH); out.push({x,w:bw,h:bh,y:base-bh,spire:r()<.12}); x+=bw+(r()<.3?4+r()*10:0); }
  return out;
}
function wallpaper(slug, w, h, P, hzf=.64){
  const hz = Math.round(h*hzf);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">`;
  const small = w<600; const k = small?.62:1;
  const city = skyline(w, hz, 7, w*.38, w*.96, 26*k, 170*k);
  if (slug==='ink-brass'){
    s += `<defs><radialGradient id="v" cx="70%" cy="60%" r="80%"><stop offset="0" stop-color="#151920"/><stop offset="1" stop-color="${P.bg0}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#v)"/>`;
    s += `<g fill="none" stroke="${P.acc}" stroke-width="1" opacity=".22">`;
    s += `<path d="M0 ${hz}H${w}"/>`;
    city.forEach(b=>{ s+=`<path d="M${b.x} ${hz}V${b.y}H${b.x+b.w}V${hz}"/>`; if(b.spire) s+=`<path d="M${b.x+b.w/2} ${b.y}v-26"/>`;
      for(let yy=b.y+10; yy<hz-6; yy+=14) s+=`<path d="M${b.x+5} ${yy}h${b.w-10}" opacity=".35"/>`; });
    // cranes
    [[w*.18,hz],[w*.27,hz]].forEach(([cx,cy],i)=>{ const t=(150-i*20)*k, a=(140-i*20)*k, L=120*k; s+=`<path d="M${cx} ${cy}V${cy-t}M${cx-30*k} ${cy-a}H${cx+L}M${cx} ${cy-t}L${cx+L} ${cy-a}M${cx} ${cy-t}L${cx-30*k} ${cy-a}M${cx+.75*L} ${cy-a}v${40*k}"/>`; });
    // lighthouse
    const lx=w*.08; s+=`<path d="M${lx-9} ${hz}l4 -70h10l4 70M${lx-7} ${hz-70}h14M${lx} ${hz-70}v-10"/><path d="M${lx+10} ${hz-76}L${lx+130} ${hz-92}M${lx+10} ${hz-74}L${lx+130} ${hz-62}" opacity=".5"/>`;
    // quay + piers
    s+=`<path d="M${w*.05} ${hz+46}H${w*.62}"/>`; for(let i=0;i<9;i++){const px=w*.07+i*w*.064; s+=`<path d="M${px} ${hz+46}v18"/>`}
    for(let i=0;i<7;i++){ const yy=hz+90+i*i*9; s+=`<path d="M${w*(.1+i*.03)} ${yy}H${w*(.9-i*.02)}" opacity="${.5-i*.06}" stroke-dasharray="${40+i*20} ${18+i*6}"/>`}
    s += `</g>`;
  }
  if (slug==='broadsheet'){
    s += `<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.05" fill="#1B1A17"/></pattern>
      <pattern id="ht2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r=".6" fill="#1B1A17"/></pattern>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="1"/></linearGradient></defs>`;
    s += `<rect width="${w}" height="${h}" fill="${P.bg0}"/>`;
    s += `<g opacity=".17">`;
    s += `<path d="M0 ${hz} C ${w*.15} ${hz-90}, ${w*.3} ${hz-120}, ${w*.42} ${hz-60} S ${w*.7} ${hz-40}, ${w} ${hz-80} V${hz} Z" fill="url(#ht2)"/>`;
    city.forEach(b=>{ s+=`<rect x="${b.x}" y="${b.y}" width="${b.w-2}" height="${b.h}" fill="url(#ht)"/>`; if(b.spire) s+=`<path d="M${b.x+b.w/2} ${b.y}v-24" stroke="#1B1A17" stroke-width="1.2"/>`; });
    for(let i=0;i<46;i++){ const yy=hz+4+i*i*.3+i*3; if(yy>h) break; s+=`<path d="M0 ${yy}H${w}" stroke="#1B1A17" stroke-width="${Math.max(.4,1.3-i*.02)}" opacity="${.9-i*.012}"/>`; }
    { const R=46*k, cx=w*.2, cy=hz-150*k; s += `<clipPath id="sunc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#1B1A17" stroke-width="1"/><g clip-path="url(#sunc)">`;
      for(let i=0;i<16;i++) s+=`<path d="M${cx-R} ${cy-R+i*R/8+R/16}h${2*R}" stroke="#1B1A17" stroke-width="${(.4+i*.06).toFixed(2)}"/>`; s+=`</g>`; }
    s += `</g>`;
    s += `<g font-family="Instrument Serif" fill="#1B1A17" opacity="${small?0:.16}"><text x="${w*.05}" y="${h*.12}" font-size="22" letter-spacing="3">THE PORT AVALON HARBOUR · ENGRAVED FROM THE NORTH MOLE</text></g>`;
  }
  if (slug==='phosphor'){
    s += `<rect width="${w}" height="${h}" fill="${P.bg0}"/>`;
    s += `<g stroke="${P.line}" stroke-width="1" opacity=".75">`;
    for(let x=0;x<=w;x+=48) s+=`<path d="M${x} 0V${h}"/>`; for(let y=0;y<=h;y+=48) s+=`<path d="M0 ${y}H${w}"/>`; s+=`</g>`;
    const centers=[[w*.72,h*.62,1],[w*.25,h*.3,.7],[w*.9,h*.15,.5]];
    s += `<g fill="none" stroke="${P.acc}" stroke-width="1">`;
    centers.forEach(([cx,cy,k],ci)=>{ const r=_rng(31+ci); const ph=[r()*6,r()*6,r()*6];
      for(let lev=1; lev<=14; lev++){ const R=lev*26*k+10; let d='';
        for(let a=0;a<=96;a++){ const t=a/96*Math.PI*2; const rr=R*(1+.18*Math.sin(3*t+ph[0])+.09*Math.sin(5*t+ph[1]+lev*.2)+.05*Math.sin(9*t+ph[2])); d+=(a?'L':'M')+(cx+rr*Math.cos(t)).toFixed(1)+' '+(cy+rr*.72*Math.sin(t)).toFixed(1); }
        s+=`<path d="${d}Z" opacity="${(lev%5===0?.2:.09)}"/>`; } });
    s += `</g>`;
    s += `<g font-family="JetBrains Mono" font-size="10" fill="${P.faint}" opacity="${small?0:.5}"><text x="${w-250}" y="${h-70}">PORT AVALON · 41.2N 0.0E · BATHYMETRY</text></g>`;
  }
  if (slug==='riviera'){
    s += `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1A2B"/><stop offset=".45" stop-color="#22304F"/><stop offset=".78" stop-color="#5A4462"/><stop offset="1" stop-color="#C7705F"/></linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D3352"/><stop offset="1" stop-color="#0E1A2B"/></linearGradient></defs>`;
    s += `<rect width="${w}" height="${hz}" fill="url(#sky)"/><rect y="${hz}" width="${w}" height="${h-hz}" fill="url(#sea)"/>`;
    s += `<clipPath id="above"><rect width="${w}" height="${hz}"/></clipPath><circle cx="${w*.62}" cy="${hz-30}" r="${h*.11}" fill="#F2A48F" opacity=".92" clip-path="url(#above)"/>`;
    s += `<path d="M${w*.7} ${hz} C ${w*.78} ${hz-60}, ${w*.86} ${hz-95}, ${w} ${hz-70} V${hz} Z" fill="#2B2A4A"/>`;
    s += `<rect x="0" y="${hz-6}" width="${w}" height="${h*.12}" fill="url(#sky)" opacity="0"/>`;
    s += `<path d="M0 ${hz} C ${w*.12} ${hz-130}, ${w*.22} ${hz-150}, ${w*.36} ${hz-70} C ${w*.42} ${hz-40}, ${w*.48} ${hz-30}, ${w*.55} ${hz} Z" fill="#2B2A4A"/>`;
    s += `<path d="M${w*.04} ${hz} C ${w*.14} ${hz-70}, ${w*.24} ${hz-80}, ${w*.32} ${hz-30} L ${w*.36} ${hz} Z" fill="#1F2440"/>`;
    city.forEach((b,i)=>{ const hh=b.h*.62; s+=`<rect x="${b.x}" y="${hz-hh}" width="${b.w-3}" height="${hh}" fill="${i%3?'#1A2238':'#202A44'}"/>`;
      const r=_rng(100+i); for(let yy=hz-hh+8; yy<hz-8; yy+=11) for(let xx=b.x+5; xx<b.x+b.w-8; xx+=9) if(r()<.18) s+=`<rect x="${xx}" y="${yy}" width="3" height="4" fill="#F2C14E" opacity=".55"/>`; });
    for(let i=0;i<9;i++){ const yy=hz+8+i*i*6+i*6; s+=`<rect x="${w*.62-(70-i*5)}" y="${yy}" width="${(70-i*5)*2}" height="${3+i*.3}" rx="1.5" fill="#F2A48F" opacity="${.5-i*.05}"/>`; }
    for(let i=0;i<6;i++){ const yy=hz+30+i*38; s+=`<path d="M${w*.05+i*40} ${yy}h${w*.18}" stroke="#2A3F5E" stroke-width="2" stroke-linecap="round"/>`; }
    const bx=w*.24, by=hz+70; s+=`<path d="M${bx} ${by}l26 -62v62z" fill="#F4ECDD" opacity=".85"/><path d="M${bx+30} ${by}l18 -44v44z" fill="#E8836B" opacity=".9"/><path d="M${bx-14} ${by+4}h70l-8 9h-54z" fill="#0E1A2B"/>`;
    s += `<g font-family="Instrument Serif" fill="#F4ECDD" opacity="${small?0:.22}"><text x="${w*.05}" y="${h*.14}" font-size="64" letter-spacing="2">Port Avalon</text><text x="${w*.05+4}" y="${h*.14+28}" font-family="Inter" font-size="12" letter-spacing="6">THE BAY AT DUSK</text></g>`;
  }
  return s + '</svg>';
}
