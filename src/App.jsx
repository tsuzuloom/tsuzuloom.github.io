import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://gtivdpvuisquzkdsolla.supabase.co";
const SUPABASE_KEY = "sb_publishable_yys0XxZWiAMOIh1Pgx6lsg_cK1u5qso";
const APP_VERSION = "B4.3";
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===================== UTILS =====================
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const joinName = (parts) => parts.filter(x=>x&&String(x).trim()).map(x=>String(x).trim()).join(" ");
const charName = (ch) => { if (!ch) return "（不明）";
  const n = ch.nameOrder==="last_first"
    ? joinName([ch.lastName,ch.middleName,ch.firstName])
    : joinName([ch.firstName,ch.middleName,ch.lastName]);
  return n||"（無名）"; };
const charFuri = (ch) => { if(!ch) return "";
  return ch.nameOrder==="last_first"
    ? joinName([ch.lastNameFuri,ch.middleNameFuri,ch.firstNameFuri])
    : joinName([ch.firstNameFuri,ch.middleNameFuri,ch.lastNameFuri]); };
const charInitial = (ch) => ((ch&&(ch.nameOrder==="last_first"?(ch.lastName||ch.firstName):(ch.firstName||ch.lastName)))||"?").slice(0,1);
const calcAge = (birth,target) => { if(!birth||!target) return null; const b=new Date(birth),t=new Date(target); let age=t.getFullYear()-b.getFullYear(); const m=t.getMonth()-b.getMonth(); if(m<0||(m===0&&t.getDate()<b.getDate())) age--; return age>=0?age:null; };
const IMG_BUCKET = "character-images";
// 画像は作品データに埋め込まず、別の倉庫に置いて住所だけ持つ
const compressBlob = (dataUrl) => new Promise((resolve,reject) => {
  const img=new Image();
  img.onload=()=>{ const max=800; let w=img.width,h=img.height;
    if(w>max||h>max){ if(w>h){h=Math.round(h*max/w);w=max;} else {w=Math.round(w*max/h);h=max;} }
    const c=document.createElement("canvas"); c.width=w; c.height=h;
    c.getContext("2d").drawImage(img,0,0,w,h);
    c.toBlob(b=>b?resolve(b):reject(new Error("変換できませんでした")),"image/jpeg",0.82);
  };
  img.onerror=()=>reject(new Error("画像を読み込めませんでした"));
  img.src=dataUrl;
});
const readAsDataUrl = (file) => new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=e=>resolve(e.target.result); r.onerror=()=>reject(new Error("ファイルを読めませんでした")); r.readAsDataURL(file); });
const uploadImage = async (blob) => {
  const { data:{ user } } = await db.auth.getUser();
  if(!user) throw new Error("ログインが切れています");
  const path = `${user.id}/${uid()}.jpg`;
  const { error } = await db.storage.from(IMG_BUCKET).upload(path, blob, { contentType:"image/jpeg", upsert:false });
  if(error) throw error;
  return db.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
};
const isEmbedded = (src) => !!src && src.startsWith("data:");

const compressImage = (dataUrl) => new Promise(resolve => { const img=new Image(); img.onload=()=>{ const max=800; let w=img.width,h=img.height; if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max;}else{w=Math.round(w*max/h);h=max;}} const c=document.createElement("canvas"); c.width=w;c.height=h; c.getContext("2d").drawImage(img,0,0,w,h); resolve(c.toDataURL("image/jpeg",0.82)); }; img.src=dataUrl; });
const countChars = (str) => { if(!str) return 0; return str.replace(/\s/g,"").length; };
const storyChars = (d) => (d.scenes||[]).reduce((sum,s)=>sum+countChars(s.script),0);
const mkSummary = (d) => ({ synopsis:(d.storySynopsis||"").slice(0,80), chars:(d.characters||[]).length, scenes:(d.scenes||[]).length, words:storyChars(d) });

const DEFAULT_MONTHS = Array.from({length:12},(_,i)=>({name:`${i+1}月`,days:30}));
const normCal = (c) => ({ enabled:false, yearLabel:"", eraOnly:false, display:"both", months:DEFAULT_MONTHS, eras:[], ...(c||{}),
  months:((c&&c.months&&c.months.length)?c.months:DEFAULT_MONTHS).map(m=>({name:m.name||"",days:Math.max(1,Number(m.days)||30)})),
  eras:((c&&c.eras)||[]).map(e=>({id:e.id||uid(),name:e.name||"",y:Number(e.y)||1,m:Number(e.m)||1,d:Number(e.d)||1})) });
const calYearDays = (cal) => cal.months.reduce((n,m)=>n+m.days,0)||1;
const pad2 = (n) => String(n).padStart(2,"0");
const parseYMD = (str) => { if(!str) return null; const p=String(str).split("-"); if(p.length<3) return null; const y=Number(p[0]),m=Number(p[1]),d=Number(p[2]); if([y,m,d].some(v=>!Number.isFinite(v))) return null; return {y,m,d}; };
const parseFlexibleDate = (str) => { if(!str) return null; const s=String(str).trim(); if(!s) return null; const patterns=[/^(\d{1,4})\D(\d{1,2})\D(\d{1,2})$/,/^(\d{4})-(\d{1,2})-(\d{1,2})$/,/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,/^(\d{4})\s+(\d{1,2})\s+(\d{1,2})$/]; for(const pat of patterns){ const m=s.match(pat); if(m){ const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]); if(y>0&&mo>=1&&mo<=12&&d>=1&&d<=31) return {y,m:mo,d}; } } return null; };
const joinYMD = (t) => t?`${t.y}-${pad2(t.m)}-${pad2(t.d)}`:"";
const calIndex = (cal,str) => { const t=parseYMD(str); if(!t) return null; let before=0; for(let i=0;i<Math.min(t.m-1,cal.months.length);i++) before+=cal.months[i].days; return t.y*calYearDays(cal)+before+(t.d-1); };
const cmpYMD = (a,b) => a.y!==b.y?a.y-b.y:(a.m!==b.m?a.m-b.m:a.d-b.d);
const eraFor = (cal,t) => { let best=null; cal.eras.forEach(e=>{ if(cmpYMD(t,e)>=0 && (!best||cmpYMD(e,best)>0)) best=e; }); return best; };
// 物語の暦が有効なら通日、そうでなければ現実の暦の通日
const dayIndex = (data,str) => { if(!str) return null; const cal=data.calendar; if(cal&&cal.enabled) return calIndex(cal,str); const ms=new Date(str).getTime(); return Number.isFinite(ms)?Math.floor(ms/86400000):null; };
const ageBetween = (data,birth,target) => { const cal=data.calendar;
  if(cal&&cal.enabled){ const a=calIndex(cal,birth),b=calIndex(cal,target); if(a===null||b===null) return null; const v=Math.floor((b-a)/calYearDays(cal)); return v>=0?v:null; }
  return calcAge(birth,target); };
// 作中の「現在」を基準に年齢を出す。没していれば享年
const storyAge = (data,ch) => {
  if(!ch||!ch.birthday) return null;
  if(ch.deathDate){ const a=ageBetween(data,ch.birthday,ch.deathDate); return a===null?null:{age:a,gone:true}; }
  const cal=data.calendar;
  const base = data.nowDate || ((cal&&cal.enabled) ? "" : new Date().toISOString().slice(0,10));
  if(!base) return null;
  const a=ageBetween(data,ch.birthday,base);
  return a===null?null:{age:a,gone:false};
};
const ageText = (data,ch) => { const r=storyAge(data,ch); return r?(r.gone?`享年${r.age}`:`${r.age}歳`):null; };

const dateLabel = (data,str,opt) => { if(!str) return ""; const cal=data.calendar;
  if(!cal||!cal.enabled) return str;
  const t=parseYMD(str); if(!t) return str;
  const mo=cal.months[t.m-1];
  const md=`${mo?mo.name:t.m+"月"}${t.d}日`;
  const base=`${cal.yearLabel||""}${t.y}年 ${md}`;
  const e=eraFor(cal,t);
  const eraTxt=e?`${e.name}${(t.y-e.y+1)===1?"元":(t.y-e.y+1)}年 ${md}`:null;
  const mode=opt||cal.display;
  if(mode==="era") return eraTxt||base;
  if(mode==="base"||!eraTxt) return base;
  return `${eraTxt}（${base}）`; };

const norm = (d) => {
  if (!d) d = {};
  const mkChar = c => ({ image:"",imageColor:"#8EA3C3",genderId:"",birthday:"",deathDate:"",notes:"",lastName:"",firstName:"",middleName:"",lastNameFuri:"",firstNameFuri:"",middleNameFuri:"",nameOrder:"last_first",relatedCharacters:[],relatedGroups:[],relatedTerms:[],parameters:[],abilities:[],abilityStages:null, ...c,
    relatedCharacters:(c.relatedCharacters||[]).map(r=>r&&typeof r==="object"&&r.charId?{charId:r.charId,callName:r.callName||"",calledName:r.calledName||"",relTypeId:r.relTypeId||"",direction:r.direction||"both"}:{charId:r&&r.charId?r.charId:r,callName:(r&&r.callName)||"",calledName:(r&&r.calledName)||"",relTypeId:"",direction:"both"}),
    relatedGroups:(c.relatedGroups||[]).map(r=>r&&typeof r==="object"&&r.groupId?r:{groupId:r&&r.groupId?r.groupId:r,position:(r&&r.position)||""}),
  });
  const migChar = c => { const ch=mkChar(c); if(!ch.abilityStages||!Array.isArray(ch.abilityStages)||ch.abilityStages.length===0){ ch.abilityStages=[{id:uid(),name:"現在",abilities:ch.abilities||[]}]; } return ch; };
  return { storyTitle:d.storyTitle||"新しいストーリー",storySynopsis:d.storySynopsis||"",
    characters:(d.characters||[]).map(migChar),
    groups:(d.groups||[]).map(g=>({name:"",description:"",notes:"",relatedCharacters:[],memberNotes:{},...g,relatedCharacters:(g.relatedCharacters||[]).map(r=>typeof r==="object"?(r.charId||r.id||""):r).filter(Boolean),memberNotes:g.memberNotes||{}})),
    locations:d.locations||[],
    scenes:(d.scenes||[]).map(s=>({title:"",startDate:"",endDate:"",relatedChapterId:"",relatedLocationId:"",script:"",notes:"",relatedCharacters:[],relatedTerms:[],...s})),
    chapters:(d.chapters||[]).map(c=>({title:"",notes:"",relatedScenes:[],...c})),
    terms:d.terms||[],
    genders:d.genders||[{id:uid(),name:"男性",color:"#5B9BD5"},{id:uid(),name:"女性",color:"#D9618A"},{id:uid(),name:"その他",color:"#888"}],
    parameters:d.parameters||[],
    abilityParams:d.abilityParams||[],
    graphPositions:d.graphPositions||{},
    nowDate:d.nowDate||"",
    calendar:normCal(d.calendar),
    relationTypes:d.relationTypes||[{id:uid(),name:"親子",color:"#E8916E"},{id:uid(),name:"友人",color:"#4CAF82"},{id:uid(),name:"恋愛",color:"#D9618A"},{id:uid(),name:"敵対",color:"#C0392B"}],
  };
};

// ===================== THEMES =====================
const THEMES = {
  mono:   { label:"モノクロ", accentColor:"#1F2937", light:{ bg:"#F8F9FA",surface:"#FFFFFF",border:"#E4E7EB",borderL:"#F0F2F5",text:"#111827",sub:"#6B7280",hint:"#9CA3AF",accent:"#1F2937",accentFg:"#FFF",tag:"#F3F4F6",tagTxt:"#4B5563",danger:"#EF4444",font:"" }, dark:{ bg:"#0F1115",surface:"#1A1D23",border:"#2A2E37",borderL:"#22262E",text:"#F3F4F6",sub:"#9CA3AF",hint:"#6B7280",accent:"#E5E7EB",accentFg:"#111827",tag:"#252A32",tagTxt:"#B8BEC8",danger:"#F87171",font:"" } },
  orange: { label:"オレンジ", accentColor:"#E8720C", light:{ bg:"#FDF9F4",surface:"#FFFFFF",border:"#F0E4D6",borderL:"#F7EFE5",text:"#3A2C1E",sub:"#8A7A66",hint:"#B8A992",accent:"#E8720C",accentFg:"#FFF",tag:"#FCEEDD",tagTxt:"#B5651A",danger:"#EF4444",font:"" }, dark:{ bg:"#1A1410",surface:"#241C15",border:"#3A2E22",borderL:"#2E241B",text:"#F5EDE2",sub:"#B8A992",hint:"#7D7061",accent:"#F5943A",accentFg:"#241C15",tag:"#33271C",tagTxt:"#E0A76B",danger:"#F87171",font:"" } },
  yellow: { label:"イエロー", accentColor:"#D9A404", light:{ bg:"#FEFCF3",surface:"#FFFFFF",border:"#EFE8D0",borderL:"#F6F1E2",text:"#3A3418",sub:"#877E5A",hint:"#B5AC86",accent:"#C99700",accentFg:"#FFF",tag:"#FBF3D8",tagTxt:"#A67F0A",danger:"#EF4444",font:"" }, dark:{ bg:"#181509",surface:"#221E10",border:"#38311A",borderL:"#2C2614",text:"#F5EFD9",sub:"#B5AC86",hint:"#7D765A",accent:"#EBC544",accentFg:"#221E10",tag:"#332C16",tagTxt:"#DCC168",danger:"#F87171",font:"" } },
  navy:   { label:"ネイビー", accentColor:"#3B5BA8", light:{ bg:"#F4F6FB",surface:"#FFFFFF",border:"#DBE1EE",borderL:"#EAEEF6",text:"#1A2238",sub:"#5C6B8A",hint:"#94A0BC",accent:"#3B5BA8",accentFg:"#FFF",tag:"#E7ECF7",tagTxt:"#3B5BA8",danger:"#EF4444",font:"" }, dark:{ bg:"#0E121F",surface:"#171D30",border:"#28304A",borderL:"#1E263B",text:"#E8ECF6",sub:"#94A0BC",hint:"#5C6B8A",accent:"#6B8BD6",accentFg:"#141A2B",tag:"#20283F",tagTxt:"#9DB2E0",danger:"#F87171",font:"" } },
  aqua:   { label:"アクア", accentColor:"#0E9BB5", light:{ bg:"#F2FAFB",surface:"#FFFFFF",border:"#D4EBEF",borderL:"#E5F4F6",text:"#123338",sub:"#5B8288",hint:"#8FB4B9",accent:"#0E9BB5",accentFg:"#FFF",tag:"#DEF3F6",tagTxt:"#0E8299",danger:"#EF4444",font:"" }, dark:{ bg:"#0A1618",surface:"#122224",border:"#1F383C",borderL:"#182C2F",text:"#E2F3F5",sub:"#8FB4B9",hint:"#5B8288",accent:"#3EC3DB",accentFg:"#0F2226",tag:"#193034",tagTxt:"#77CEDD",danger:"#F87171",font:"" } },
  paper:  { label:"紙とインク", accentColor:"#8A6D3B", light:{ bg:"#F7F3EB",surface:"#FDFBF6",border:"#E4DBC9",borderL:"#EFE8D9",text:"#4A3F35",sub:"#8A7B67",hint:"#B3A78F",accent:"#8A6D3B",accentFg:"#FDFBF6",tag:"#EEE6D5",tagTxt:"#7A6033",danger:"#C0562F",font:'"Hiragino Mincho ProN","Yu Mincho",serif' }, dark:{ bg:"#211C16",surface:"#2A241C",border:"#3D3529",borderL:"#332C22",text:"#EDE4D4",sub:"#B3A78F",hint:"#7A6F5C",accent:"#C9A968",accentFg:"#2A241C",tag:"#372F24",tagTxt:"#D4BC85",danger:"#D8734A",font:'"Hiragino Mincho ProN","Yu Mincho",serif' } },
};
const SANS_STACK = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic UI", sans-serif';
const SERIF_STACK = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Times New Roman",serif';
let C = { ...THEMES.mono.light, display:"var(--font-display)" };
const applyTheme = (themeKey, dark, serifHeads) => {
  const t = THEMES[themeKey] || THEMES.mono;
  const pal = (dark && t.dark) ? t.dark : t.light;
  C = { ...pal, display:"var(--font-display)" };
  const r = document.documentElement.style;
  r.setProperty("--bg", pal.bg);
  r.setProperty("--font", pal.font || SANS_STACK);
  r.setProperty("--font-display", serifHeads ? SERIF_STACK : (pal.font || SANS_STACK));
};

// ===================== HASH ROUTER =====================
// URLの # に今いる場所を書いておく。リロードしても戻ってこられるようにする
const parseHash = () => {
  const h = (window.location.hash||"").replace(/^#\/?/,"");
  const p = h.split("/").filter(Boolean);
  if(p[0]==="s"&&p[1]) return { screen:"editor", storyId:p[1], section:p[2]||null, charId:(p[2]==="characters"&&p[3])?p[3]:null };
  if(p[0]==="settings") return { screen:"settings", storyId:null, section:null, charId:null };
  if(p[0]==="ideas")    return { screen:"ideas",    storyId:null, section:null, charId:null };
  return { screen:"list", storyId:null, section:null, charId:null };
};
const buildHash = (r) => {
  if(r.screen==="editor"&&r.storyId){
    let s=`#/s/${r.storyId}`;
    if(r.section) s+=`/${r.section}`;
    if(r.section==="characters"&&r.charId) s+=`/${r.charId}`;
    return s;
  }
  if(r.screen==="settings") return "#/settings";
  if(r.screen==="ideas")    return "#/ideas";
  return "#/";
};

// ===================== RESPONSIVE =====================
const DESKTOP_BP = 900;
const useIsDesktop = () => {
  const [d,setD]=useState(typeof window!=="undefined"&&window.innerWidth>=DESKTOP_BP);
  useEffect(()=>{ const mq=window.matchMedia(`(min-width: ${DESKTOP_BP}px)`); const on=e=>setD(e.matches); setD(mq.matches); mq.addEventListener("change",on); return ()=>mq.removeEventListener("change",on); },[]);
  return d;
};

// ===================== ICONS =====================
const Ico = ({ n, s=20, c="currentColor", sw=1.5 }) => {
  const d = {
    person:<><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-1.5a5 5 0 015-5h4a5 5 0 015 5V21"/></>,
    pencil:<><path d="M4 20h4l10.5-10.5a2.1 2.1 0 10-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/></>,
    world:<><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a15 15 0 010 18a15 15 0 010-18"/></>,
    share:<><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></>,
    calendar:<><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></>,
    chart:<><path d="M4 20V10M10 20V4M16 20v-7M4 20h17"/></>,
    group:<><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3 20v-1a4.5 4.5 0 014.5-4.5h3A4.5 4.5 0 0115 19v1"/><path d="M17 14.5h.5A3.5 3.5 0 0121 18v2"/></>,
    pin:<><path d="M12 21s6.5-6.6 6.5-11.2A6.5 6.5 0 005.5 9.8C5.5 14.4 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.2"/></>,
    scene:<><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M3 15h18M8 4.5v15M16 4.5v15"/></>,
    book:<><path d="M12 6.5C10.5 5 8.5 4.5 5 4.5v13c3.5 0 5.5.5 7 2 1.5-1.5 3.5-2 7-2v-13c-3.5 0-5.5.5-7 2z"/><path d="M12 6.5V21"/></>,
    term:<><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></>,
    gender:<><circle cx="10" cy="13" r="5"/><path d="M15 8l5-5M18 3h3v3"/></>,
    param:<><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/></>,
    radar:<><polygon points="12,3 21,8 21,16 12,21 3,16 3,8"/><path d="M12 3v18M3 8l9 5 9-5M3 16l9-5 9 5"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    search:<><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
    link:<><path d="M10 13a5 5 0 007.5.8l3-3a5 5 0 00-7.1-7.1L12 5.2"/><path d="M14 11a5 5 0 00-7.5.8l-3 3a5 5 0 007.1 7.1L12 18.8"/></>,
    back:<path d="M19 12H5M11 6l-6 6 6 6"/>,
    x:<path d="M18 6L6 18M6 6l12 12"/>,
    edit:<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>,
    trash:<><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,
    timeline:<><path d="M2 12h20"/><circle cx="6" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M6 4v5M12 4v5M18 4v5M6 15v5M12 15v5M18 15v5"/></>,
    check:<path d="M20 6L9 17l-5-5"/>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/></>,
    chevR:<path d="M9 18l6-6-6-6"/>,
    chevL:<path d="M15 18l-6-6 6-6"/>,
    chevU:<path d="M18 15l-6-6-6 6"/>,
    chevD:<path d="M6 9l6 6 6-6"/>,
    save:<><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></>,
    camera:<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
    download:<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    upload:<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    logout:<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    copy:<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    dots:<><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/></>,
    bulb:<><path d="M9 18h6M10 21h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"/></>,
    moon:<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    list:<><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></>,
  };
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d[n]||null}</svg>;
};

// ===================== BASE UI =====================
const Tag = ({ label, color, onRemove }) => (<span style={{ display:"inline-flex",alignItems:"center",gap:3,padding:"2px 9px",borderRadius:20,fontSize:11,background:color?color+"1A":C.tag,color:color||C.tagTxt,border:color?`0.5px solid ${color}66`:"none",fontWeight:500,letterSpacing:"0.2px" }}>{label}{onRemove&&<button onClick={onRemove} style={{ border:"none",background:"transparent",padding:0,cursor:"pointer",display:"flex",opacity:0.5,lineHeight:0 }}><Ico n="x" s={9} c="currentColor"/></button>}</span>);
const Lbl = ({ children }) => <div style={{ fontSize:10.5,color:C.hint,marginBottom:5,fontWeight:600,letterSpacing:"0.1em" }}>{children}</div>;
const Field = ({ label, children, mb=14 }) => <div style={{ marginBottom:mb,minWidth:0,maxWidth:"100%" }}>{label&&<Lbl>{label}</Lbl>}{children}</div>;
const IS = () => ({ width:"100%",padding:"10px 12px",border:`0.5px solid ${C.border}`,borderRadius:10,color:C.text,background:C.surface,boxSizing:"border-box",fontFamily:"inherit",minWidth:0,maxWidth:"100%" });
const DateInp = ({ label, value, onChange, cal }) => {
  const useCal = !!(cal && cal.enabled);
  const [showPicker,setShowPicker]=useState(false);
  const [yearMode,setYearMode]=useState(false);
  const [textInput,setTextInput]=useState(value||"");
  const yearBoxRef=useRef(null);
  useEffect(()=>{ setTextInput(value||""); },[value]);

  const today=new Date();
  const t=parseYMD(value)||{y:today.getFullYear(),m:useCal?1:today.getMonth()+1,d:useCal?1:today.getDate()};

  const monthCount = useCal ? cal.months.length : 12;
  const daysInMonth = useCal
    ? ((cal.months[t.m-1]||{days:30}).days)
    : new Date(t.y, t.m, 0).getDate();
  const firstDow = useCal ? 0 : new Date(t.y, t.m-1, 1).getDay();
  const monthName = useCal ? ((cal.months[t.m-1]||{}).name || `${t.m}月`) : `${t.m}月`;

  const yStart = Math.max(1, t.y-130);
  const yEnd = t.y+30;
  const years = Array.from({length:yEnd-yStart+1},(_,i)=>yStart+i);

  // 年の一覧を開いたら、いま選ばれている年のあたりまで自動で送る
  useEffect(()=>{
    if(!yearMode||!yearBoxRef.current) return;
    const row=Math.floor((t.y-yStart)/4);
    yearBoxRef.current.scrollTop=Math.max(0,row*44-90);
  },[yearMode]);

  const commit=(n)=>{ const ymd=joinYMD(n); onChange(ymd); setTextInput(ymd); };
  const set=(patch)=>{
    const n={y:t.y,m:t.m,d:t.d,...patch};
    if(n.m<1){ n.m=monthCount; n.y=n.y-1; }
    if(n.m>monthCount){ n.m=1; n.y=n.y+1; }
    const max = useCal ? ((cal.months[n.m-1]||{days:30}).days) : new Date(n.y, n.m, 0).getDate();
    if(n.d>max) n.d=max;
    commit(n);
  };
  const handleTextChange=(text)=>{ setTextInput(text); const p=parseFlexibleDate(text); if(p) onChange(joinYMD(p)); };
  const clearAll=()=>{ onChange(""); setTextInput(""); };
  const closePicker=()=>{ setShowPicker(false); setYearMode(false); };

  const navBtn=(icon,onClick)=>(
    <button type="button" onClick={onClick} style={{ border:"none",background:"transparent",cursor:"pointer",padding:"6px 7px",display:"flex",alignItems:"center",borderRadius:8 }}><Ico n={icon} s={15} c={C.sub}/></button>
  );

  return (
    <Field label={label}>
      <div style={{ display:"flex",gap:6,alignItems:"stretch" }}>
        <input
          type="text"
          value={textInput}
          onChange={e=>handleTextChange(e.target.value)}
          placeholder="例: 2021/1/1"
          style={{ ...IS(),flex:1,minWidth:0 }}
        />
        <button type="button" onClick={()=>setShowPicker(true)} title="カレンダーから選ぶ" style={{ flexShrink:0,width:42,minHeight:42,borderRadius:10,border:`0.5px solid ${C.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico n="calendar" s={17} c={C.sub}/></button>
        <button type="button" onClick={clearAll} disabled={!value} style={{ flexShrink:0,padding:"0 12px",borderRadius:10,border:`0.5px solid ${C.border}`,background:"transparent",color:value?C.sub:C.hint,opacity:value?1:0.4,cursor:value?"pointer":"default",fontFamily:"inherit",fontSize:11.5,minHeight:42 }}>消す</button>
      </div>

      {showPicker&&(
        <div style={{ position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center" }} onClick={e=>{ if(e.target===e.currentTarget) closePicker(); }}>
          <div style={{ background:C.surface,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:420,padding:"14px 14px calc(14px + env(safe-area-inset-bottom,0px))",boxShadow:"0 -4px 22px rgba(0,0,0,0.18)" }}>

            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
              <div style={{ display:"flex",alignItems:"center",gap:1 }}>
                {navBtn("chevL",()=>set({y:t.y-1}))}
                <button type="button" onClick={()=>setYearMode(v=>!v)} style={{ display:"flex",alignItems:"center",gap:3,border:"none",background:yearMode?C.accent+"14":"transparent",borderRadius:8,padding:"5px 8px",cursor:"pointer",fontFamily:"inherit" }}>
                  <span style={{ fontSize:14,fontWeight:600,color:yearMode?C.accent:C.text }}>{useCal&&cal.yearLabel?cal.yearLabel:""}{t.y}年</span>
                  <Ico n={yearMode?"chevU":"chevD"} s={12} c={yearMode?C.accent:C.hint}/>
                </button>
                {navBtn("chevR",()=>set({y:t.y+1}))}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:1,opacity:yearMode?0.35:1,pointerEvents:yearMode?"none":"auto" }}>
                {navBtn("chevL",()=>set({m:t.m-1}))}
                <span style={{ fontSize:14,fontWeight:600,color:C.text,minWidth:52,textAlign:"center" }}>{monthName}</span>
                {navBtn("chevR",()=>set({m:t.m+1}))}
              </div>
            </div>

            {yearMode?(
              <div ref={yearBoxRef} style={{ height:236,overflowY:"auto",WebkitOverflowScrolling:"touch",marginBottom:10,paddingRight:2 }}>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6 }}>
                  {years.map(y=>{
                    const sel=y===t.y;
                    return <button key={y} type="button" onClick={()=>{ set({y}); setYearMode(false); }} style={{ height:38,borderRadius:9,border:"none",background:sel?C.accent:"transparent",color:sel?C.accentFg:C.text,fontSize:13,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit",padding:0 }}>{y}</button>;
                  })}
                </div>
              </div>
            ):(
              <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:10 }}>
                {!useCal&&["日","月","火","水","木","金","土"].map((d,i)=>(
                  <div key={d} style={{ height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:i===0?"#C0392B":(i===6?"#3B5BA8":C.hint) }}>{d}</div>
                ))}
                {Array.from({length:firstDow},(_,i)=><div key={"b"+i}/>)}
                {Array.from({length:daysInMonth},(_,i)=>{
                  const day=i+1;
                  const sel=!!value&&t.d===day;
                  const isToday=!useCal&&t.y===today.getFullYear()&&t.m===today.getMonth()+1&&day===today.getDate();
                  return (
                    <button key={day} type="button" onClick={()=>set({d:day})} style={{ height:36,borderRadius:9,border:isToday&&!sel?`1px solid ${C.accent}`:"none",background:sel?C.accent:"transparent",color:sel?C.accentFg:C.text,fontSize:13,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit",padding:0 }}>{day}</button>
                  );
                })}
              </div>
            )}

            <div style={{ display:"flex",alignItems:"center",gap:8,paddingTop:10,borderTop:`0.5px solid ${C.borderL}` }}>
              {!useCal&&!yearMode&&<Btn small variant="ghost" onClick={()=>commit({y:today.getFullYear(),m:today.getMonth()+1,d:today.getDate()})}>今日</Btn>}
              <div style={{ flex:1 }}/>
              {value&&<Btn small variant="ghost" onClick={()=>{ clearAll(); closePicker(); }}>クリア</Btn>}
              <Btn small variant="primary" onClick={closePicker}>完了</Btn>
            </div>

          </div>
        </div>
      )}
    </Field>
  );
};

const Inp = ({ label, value, onChange, type="text", placeholder, rows }) => <Field label={label}>{rows?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...IS(),resize:"vertical" }}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ ...IS(), WebkitAppearance:"none", appearance:"none", minWidth:0 }}/>}</Field>;
const Sel = ({ label, value, onChange, options }) => <Field label={label}><select value={value} onChange={e=>onChange(e.target.value)} style={{ ...IS(),cursor:"pointer" }}><option value="">-- 未選択 --</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
const Btn = ({ children, onClick, variant="default", small, icon, full, accent }) => { const ac=accent||C.accent; const vs={default:{bg:"transparent",cl:C.text,br:`0.5px solid ${C.hint}`},primary:{bg:ac+"12",cl:ac,br:`0.5px solid ${ac}`},danger:{bg:C.danger+"10",cl:C.danger,br:`0.5px solid ${C.danger}`},ghost:{bg:"transparent",cl:C.sub,br:"none"}}; const v=vs[variant]||vs.default; return <button onClick={onClick} style={{ display:"inline-flex",alignItems:"center",gap:5,padding:small?"8px 12px":"11px 16px",borderRadius:10,border:v.br,background:v.bg,color:v.cl,fontSize:small?12:13,fontWeight:500,lineHeight:1.6,minHeight:small?36:44,boxSizing:"border-box",cursor:"pointer",fontFamily:"inherit",width:full?"100%":"auto",justifyContent:full?"center":"flex-start",whiteSpace:"nowrap" }}>{icon&&<Ico n={icon} s={small?13:15} c={v.cl}/>}{children}</button>; };
const Divider = () => <div style={{ height:1,background:C.border,margin:"14px 0" }}/>;

const ImageUpload = ({ value, onChange }) => {
  const ref=useRef();
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const pick=async(f)=>{
    setErr(""); setBusy(true);
    try {
      const dataUrl=await readAsDataUrl(f);
      const blob=await compressBlob(dataUrl);
      onChange(await uploadImage(blob));
    } catch(e){ setErr("画像を保存できませんでした。"+(e&&e.message?e.message:"")); }
    setBusy(false);
  };
  return (
    <Field label="キャラクター画像">
      <div style={{ display:"flex",gap:14,alignItems:"flex-start",padding:"2px 0 4px" }}>
        <div onClick={()=>!busy&&ref.current.click()} style={{ width:76,height:76,borderRadius:14,border:value?`0.5px solid ${C.border}`:`1.5px dashed ${C.border}`,overflow:"hidden",cursor:busy?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:value?"transparent":C.bg,flexShrink:0 }}>
          {busy?<span style={{ fontSize:10.5,color:C.hint }}>保存中</span>
            :value?<img src={value} style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }}/>
            :<Ico n="camera" s={24} c={C.hint}/>}
        </div>
        <div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8,paddingTop:2 }}>
          <Btn small icon="camera" onClick={()=>!busy&&ref.current.click()}>{busy?"保存中...":value?"画像を変更":"画像を選択"}</Btn>
          {value
            ? <Btn small variant="ghost" onClick={()=>onChange("")}>画像を削除</Btn>
            : <div style={{ fontSize:11,color:C.hint,lineHeight:1.7 }}>正方形に近い画像がきれいに入ります</div>}
          {isEmbedded(value)&&<div style={{ fontSize:10.5,color:C.hint,lineHeight:1.7 }}>古い形式で保存されています。作品の設定から軽くできます。</div>}
          {err&&<div style={{ fontSize:11.5,color:C.danger,lineHeight:1.7 }}>{err}</div>}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files[0]; e.target.value=""; if(f) pick(f); }}/>
    </Field>
  );
};

const AdditiveLinker = ({ available, onAdd, getLabel, getColor, placeholder="追加して紐付け" }) => {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const filtered=available.filter(x=>getLabel(x).includes(q));
  const close=()=>{ setOpen(false); setQ(""); };
  return (<><button onClick={()=>setOpen(true)} style={{ display:"flex",alignItems:"center",gap:6,width:"100%",padding:"11px 12px",border:`1.5px dashed ${C.border}`,borderRadius:10,background:"transparent",color:C.hint,cursor:"pointer",fontFamily:"inherit",fontSize:13,minHeight:44 }}><Ico n="plus" s={14} c={C.hint}/>{placeholder}</button>{open&&(<div style={{ position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"8vh" }} onClick={e=>{ if(e.target===e.currentTarget) close(); }}><div style={{ background:C.surface,borderRadius:"16px",width:"calc(100% - 24px)",maxWidth:460,maxHeight:"52vh",display:"flex",flexDirection:"column",overflow:"hidden" }}><div style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 14px 10px",borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="検索..." style={{ flex:1,border:`0.5px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:C.text,fontFamily:"inherit",outline:"none",background:C.bg }}/><button onClick={close} style={{ border:"none",background:"transparent",cursor:"pointer",padding:4,display:"flex" }}><Ico n="x" s={18} c={C.sub}/></button></div><div style={{ overflowY:"auto",flex:1 }}>{filtered.length===0?<div style={{ textAlign:"center",padding:"28px 0",color:C.hint,fontSize:13 }}>{available.length===0?"追加できるデータがありません":"見つかりません"}</div>:filtered.map(x=>(<div key={x.id} onClick={()=>{ onAdd(x.id); close(); }} style={{ display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:`0.5px solid ${C.borderL}`,cursor:"pointer" }}>{getColor&&getColor(x)&&<div style={{ width:8,height:8,borderRadius:"50%",background:getColor(x),flexShrink:0 }}/>}<span style={{ fontSize:14,color:C.text,flex:1 }}>{getLabel(x)}</span><Ico n="plus" s={15} c={C.hint}/></div>))}</div></div></div>)}</>);
};

const CharRelCard = ({ rel, character, relationTypes, onUpdate, onRemove }) => {
  const rt=relationTypes.find(t=>t.id===rel.relTypeId);
  return (<div style={{ border:`0.5px solid ${C.border}`,borderRadius:11,padding:"11px 12px",marginBottom:6,maxWidth:"100%",overflow:"hidden" }}>
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
      <div style={{ display:"flex",alignItems:"center",gap:7,minWidth:0 }}>{character.image?<img src={character.image} style={{ width:24,height:24,borderRadius:"50%",objectFit:"cover",flexShrink:0 }}/>:<div style={{ width:24,height:24,borderRadius:"50%",background:(character.imageColor||"#ccc")+"30",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><Ico n="person" s={13} c={character.imageColor||C.hint}/></div>}<span style={{ fontSize:13,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charName(character)}</span>{rt&&<span style={{ fontSize:10,padding:"1px 7px",borderRadius:20,background:rt.color+"22",color:rt.color,border:`0.5px solid ${rt.color}`,flexShrink:0,fontWeight:600 }}>{rt.name}</span>}</div>
      <button onClick={onRemove} style={{ border:"none",background:"transparent",cursor:"pointer",padding:3,opacity:0.4,flexShrink:0 }}><Ico n="x" s={14} c={C.text}/></button>
    </div>
    <div style={{ marginBottom:8 }}><Lbl>この人から見た関係</Lbl>
      <select value={rel.relTypeId||""} onChange={e=>onUpdate({...rel,relTypeId:e.target.value})} style={{ ...IS(),padding:"7px 9px",cursor:"pointer" }}>
        <option value="">-- 未設定 --</option>
        {relationTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}>
      <div style={{minWidth:0}}><Lbl>呼び方</Lbl><input value={rel.callName||""} onChange={e=>onUpdate({...rel,callName:e.target.value})} placeholder="呼び方" style={{ ...IS(),padding:"7px 9px" }}/></div>
      <div style={{minWidth:0}}><Lbl>呼ばれ方</Lbl><input value={rel.calledName||""} onChange={e=>onUpdate({...rel,calledName:e.target.value})} placeholder="呼ばれ方" style={{ ...IS(),padding:"7px 9px" }}/></div>
    </div>
    <div style={{ fontSize:10.5,color:C.hint,lineHeight:1.7,marginTop:7 }}>関係は片方向です。相手から見た関係は、相手のページか相関図から別に設定できます。</div>
  </div>);
};
const GroupRelCard = ({ rel, group, onUpdate, onRemove }) => (<div style={{ border:`0.5px solid ${C.border}`,borderRadius:11,padding:"11px 12px",marginBottom:6 }}><div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}><div style={{ display:"flex",alignItems:"center",gap:6 }}><Ico n="group" s={14} c={C.hint}/><span style={{ fontSize:13,fontWeight:600,color:C.text }}>{group.name||"（無名）"}</span></div><button onClick={onRemove} style={{ border:"none",background:"transparent",cursor:"pointer",padding:3,opacity:0.4 }}><Ico n="x" s={14} c={C.text}/></button></div><div><Lbl>立ち位置</Lbl><input value={rel.position||""} onChange={e=>onUpdate({...rel,position:e.target.value})} placeholder="例：リーダー、新入り..." style={{ ...IS(),padding:"7px 9px" }}/></div></div>);

const RadarChart = ({ params, values, color="#5B9BD5", size=200 }) => {
  if (!params||params.length<3) return (<div style={{ textAlign:"center",padding:"20px 0",color:C.hint,fontSize:12,lineHeight:1.6 }}>能力項目を3つ以上追加すると<br/>チャートが表示されます</div>);
  const cx=size/2,cy=size/2,r=size*0.36;
  const ang=(i)=>(2*Math.PI*i/params.length)-Math.PI/2;
  const getV=(pid)=>(values.find(x=>x.paramId===pid)?.value||0)/100;
  const axisEnd=params.map((_,i)=>({x:cx+r*Math.cos(ang(i)),y:cy+r*Math.sin(ang(i))}));
  const valuePts=params.map((p,i)=>{ const v=getV(p.id); return {x:cx+r*v*Math.cos(ang(i)),y:cy+r*v*Math.sin(ang(i))}; });
  const polyStr=valuePts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const grids=[0.25,0.5,0.75,1.0].map(lv=>params.map((_,i)=>`${(cx+r*lv*Math.cos(ang(i))).toFixed(1)},${(cy+r*lv*Math.sin(ang(i))).toFixed(1)}`).join(" "));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display:"block",margin:"0 auto" }}>
      {grids.map((g,i)=><polygon key={i} points={g} fill={i===3?C.bg:"none"} stroke={C.border} strokeWidth="0.8"/>)}
      {axisEnd.map((p,i)=><line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.border} strokeWidth="0.8"/>)}
      <polygon points={polyStr} fill={(color||"#5B9BD5")+"44"} stroke={color||"#5B9BD5"} strokeWidth="2"/>
      {valuePts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color||"#5B9BD5"}/>)}
      {params.map((p,i)=>{ const ep=axisEnd[i]; const dx=ep.x-cx,dy=ep.y-cy; const len=Math.sqrt(dx*dx+dy*dy)||1; const lx=ep.x+(dx/len)*18; const ly=ep.y+(dy/len)*16; return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={C.sub}>{p.name}</text>; })}
    </svg>
  );
};

const Modal = ({ title, onClose, children, footer, compact }) => { const isDesktop=useIsDesktop();
  if(compact) return (
    <div style={{ position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.38)",display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div style={{ background:C.surface,borderRadius:16,width:"100%",maxWidth:400,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 18px 50px rgba(0,0,0,0.22)" }}>
        <div style={{ padding:"15px 16px 11px",borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}><span style={{ fontFamily:C.display,fontSize:15.5,color:C.text }}>{title}</span></div>
        <div style={{ overflowY:"auto",padding:16,flex:1 }}>{children}</div>
        {footer&&<div style={{ padding:"10px 16px 14px",borderTop:`0.5px solid ${C.border}`,display:"flex",gap:8,flexShrink:0 }}>{footer}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ position:"fixed",inset:0,zIndex:1000,background:C.bg,display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3,flexShrink:0 }}><Ico n="back" s={17} c={C.accent}/><span style={{ fontSize:12.5,color:C.accent }}>戻る</span></button>
        <span style={{ fontFamily:C.display,fontSize:15.5,color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{title}</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",overflowX:"hidden" }}>
        <div style={{ maxWidth:isDesktop?720:"none",margin:"0 auto",padding:16,boxSizing:"border-box" }}>{children}</div>
      </div>
      {footer&&<div style={{ padding:"10px 16px calc(14px + env(safe-area-inset-bottom,0px))",borderTop:`0.5px solid ${C.border}`,background:C.surface,flexShrink:0 }}>
        <div style={{ display:"flex",gap:8,width:"100%",maxWidth:isDesktop?720:"none",margin:"0 auto",alignItems:"center" }}>{footer}</div>
      </div>}
    </div>
  );
};

const Tabs = ({ tabs, active, onChange }) => (<div style={{ display:"flex",gap:2,marginBottom:16,background:C.bg,borderRadius:12,padding:3 }}>{tabs.map(t=><button key={t.key} onClick={()=>onChange(t.key)} style={{ flex:1,padding:"8px 4px",borderRadius:9,border:"none",background:active===t.key?C.surface:"transparent",color:active===t.key?C.text:C.hint,fontSize:12,fontWeight:active===t.key?600:400,cursor:"pointer",fontFamily:"inherit",boxShadow:active===t.key?"0 1px 3px rgba(0,0,0,0.07)":"none" }}>{t.label}</button>)}</div>);

// 空状態 — 「何もない」ではなく「ここから始める」導線にする
const EMPTY_HINTS = {
  "人物":"主人公でも、まだ名前のない誰かでもかまいません。\n名前だけ決めて、あとから肉付けできます。",
  "集団":"学校・ギルド・家族など、人がまとまる単位を登録します。\n人物ページからも所属を結べます。",
  "場所":"街・部屋・世界そのもの。シーンの舞台になります。",
  "シーン":"物語のひとかたまり。日付を入れると年表に並びます。",
  "章":"シーンをまとめる入れ物です。章から作ってもかまいません。",
  "用語":"魔法・組織名・造語など、あとで揺れやすい言葉を固定します。",
  "性別":"作品に合わせて自由に定義できます。色は相関図などに使われます。",
  "自由項目":"「好きな食べ物」「口癖」など、人物に持たせたい欄を自分で作れます。",
  "能力の軸":"「攻撃力」「魔力」など、レーダーチャートの軸になる項目です。\n3つ以上でチャートが描かれます。",
  "関係の種類":"「親子」「宿敵」など、つながりの線につく名前と色です。",
};
const EmptyState = ({ icon, title, onAdd, actionLabel }) => (
  <div style={{ padding:"26px 16px" }}>
    <div style={{ textAlign:"center",marginBottom:16 }}>
      <div style={{ fontFamily:C.display,fontSize:16,color:C.text,marginBottom:7 }}>{title}はまだありません</div>
      <div style={{ fontSize:12,color:C.hint,lineHeight:1.9,whiteSpace:"pre-line" }}>{EMPTY_HINTS[title]||""}</div>
    </div>
    {onAdd&&(
      <button onClick={onAdd} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",minHeight:92,border:`0.5px dashed ${C.hint}`,borderRadius:12,background:"transparent",color:C.sub,cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>
        <Ico n="plus" s={16} c={C.sub}/>{actionLabel||`${title}を追加`}
      </button>
    )}
  </div>
);

const EntityCard = ({ icon, iconColor, name, subtitle, tags, onClick, onDelete, onMoveUp, onMoveDown, image }) => (<div onClick={onClick} style={{ display:"flex",alignItems:"center",padding:"11px 14px",borderBottom:`0.5px solid ${C.borderL}`,cursor:"pointer",background:C.surface,gap:10,minHeight:44 }}>{(onMoveUp!==undefined||onMoveDown!==undefined)&&(<div style={{ display:"flex",flexDirection:"column",gap:1,flexShrink:0 }}><button onClick={e=>{e.stopPropagation();onMoveUp&&onMoveUp();}} style={{ border:"none",background:"transparent",cursor:onMoveUp?"pointer":"default",padding:"3px 3px",opacity:onMoveUp?0.5:0.15,lineHeight:0 }}><Ico n="chevU" s={13} c={C.text}/></button><button onClick={e=>{e.stopPropagation();onMoveDown&&onMoveDown();}} style={{ border:"none",background:"transparent",cursor:onMoveDown?"pointer":"default",padding:"3px 3px",opacity:onMoveDown?0.5:0.15,lineHeight:0 }}><Ico n="chevD" s={13} c={C.text}/></button></div>)}<div style={{ width:38,height:38,borderRadius:10,background:C.bg,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden" }}>{image?<img src={image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<Ico n={icon} s={17} c={iconColor||C.hint}/>}</div><div style={{ flex:1,minWidth:0 }}><div style={{ fontFamily:C.display,fontSize:14,color:C.text,marginBottom:1 }}>{name||"（無題）"}</div>{subtitle&&<div style={{ fontSize:11,color:C.sub }}>{subtitle}</div>}{tags&&tags.length>0&&<div style={{ display:"flex",flexWrap:"wrap",gap:3,marginTop:3 }}>{tags.slice(0,3).map((t,i)=><Tag key={i} label={t.label} color={t.color}/>)}</div>}</div><div style={{ display:"flex",gap:2,flexShrink:0,alignItems:"center" }}><button onClick={e=>{e.stopPropagation();onDelete();}} style={{ background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",opacity:0.35 }}><Ico n="trash" s={14} c={C.text}/></button><Ico n="chevR" s={15} c={C.hint}/></div></div>);

const EntityList = ({ title, icon, iconColor, items, onAdd, onEdit, onDelete, renderName, renderSubtitle, renderTags, renderImage, onMoveUp, onMoveDown, headerExtra, subHeader, body }) => (<div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}><div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`0.5px solid ${C.border}`,background:C.surface,flexShrink:0 }}><div style={{ display:"flex",alignItems:"center",gap:7,minWidth:0 }}><Ico n={icon} s={15} c={iconColor||C.hint}/><span style={{ fontFamily:C.display,fontSize:15,color:C.text }}>{title}</span><span style={{ fontSize:11,color:C.hint }}>{items.length}</span></div><div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0 }}>{headerExtra}<button onClick={onAdd} style={{ display:"flex",alignItems:"center",gap:4,padding:"6px 13px",background:"transparent",color:C.text,border:`0.5px solid ${C.hint}`,borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit" }}><Ico n="plus" s={12} c={C.text}/>追加</button></div></div>{subHeader&&<div style={{ padding:"8px 12px",borderBottom:`0.5px solid ${C.borderL}`,background:C.surface,flexShrink:0 }}>{subHeader}</div>}<div style={{ flex:1,overflowY:"auto",background:C.surface }}>{items.length===0?<EmptyState icon={icon} title={title} onAdd={onAdd}/>:(body||items.map((item,i)=><EntityCard key={item.id} icon={icon} iconColor={item.imageColor||item.color||iconColor} image={renderImage?renderImage(item):null} name={renderName(item)} subtitle={renderSubtitle?renderSubtitle(item):null} tags={renderTags?renderTags(item):null} onClick={()=>onEdit(item)} onDelete={()=>onDelete(item.id)} onMoveUp={onMoveUp&&i>0?()=>onMoveUp(i):onMoveUp!==undefined?null:undefined} onMoveDown={onMoveDown&&i<items.length-1?()=>onMoveDown(i):onMoveDown!==undefined?null:undefined}/>))}</div></div>);

// ===================== LOGIN =====================
const RESET_REDIRECT = "https://tsuzuloom.github.io/";

const LoginScreen = ({ onDemo }) => {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState("login");      // login | signup | forgot
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  const [isErr,setIsErr]=useState(false);
  const say=(t,err)=>{ setMsg(t); setIsErr(!!err); };

  const handle = async () => {
    if(mode==="forgot"){
      if(!email){ say("メールアドレスを入力してください",true); return; }
      setLoading(true); say("");
      const { error } = await db.auth.resetPasswordForEmail(email,{ redirectTo:RESET_REDIRECT });
      setLoading(false);
      if(error) say("送信できませんでした。"+error.message,true);
      else say("再設定用のメールを送りました。届いたリンクを開いて、新しいパスワードを決めてください。迷惑メールに入っていることがあります。",false);
      return;
    }
    if(!email||!password){ say("メールアドレスとパスワードを入力してください",true); return; }
    setLoading(true); say("");
    if(mode==="login"){
      const { error } = await db.auth.signInWithPassword({email,password});
      if(error) say("ログインできませんでした。メールアドレスとパスワードをご確認ください。",true);
    } else {
      const { error } = await db.auth.signUp({email,password,options:{emailRedirectTo:RESET_REDIRECT}});
      if(error) say(error.message,true);
      else say("アカウントを作成しました。そのままログインできます。",false);
    }
    setLoading(false);
  };

  const title = mode==="login"?"ログイン":mode==="signup"?"新規登録":"パスワードの再設定";
  const btn   = loading?"処理中...":mode==="login"?"ログイン":mode==="signup"?"登録する":"再設定メールを送る";

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:C.bg,padding:24 }}>
      <div style={{ width:"100%",maxWidth:360,background:C.surface,borderRadius:18,padding:28,border:`0.5px solid ${C.border}` }}>
        <div style={{ fontFamily:C.display,fontSize:24,color:C.text,marginBottom:3,letterSpacing:"0.02em" }}>Tsuzu Loom</div>
        <div style={{ fontSize:11.5,color:C.hint,marginBottom:22,letterSpacing:"0.5px" }}>物語を織る</div>
        <div style={{ fontSize:13,color:C.sub,marginBottom:16 }}>{title}</div>

        {mode==="forgot"&&<div style={{ fontSize:11.5,color:C.hint,lineHeight:1.9,marginBottom:14 }}>登録したメールアドレスを入れてください。再設定用のリンクをお送りします。</div>}

        <Inp label="メールアドレス" value={email} onChange={setEmail} type="email" placeholder="example@email.com"/>
        {mode!=="forgot"&&<Inp label="パスワード" value={password} onChange={setPassword} type="password" placeholder="6文字以上"/>}
        {msg&&<div style={{ fontSize:12,color:isErr?C.danger:"#10B981",marginBottom:12,lineHeight:1.8 }}>{msg}</div>}
        <Btn variant="primary" full onClick={handle}>{btn}</Btn>

        {mode==="login"&&onDemo&&(
          <div style={{ marginTop:18,paddingTop:16,borderTop:`0.5px solid ${C.borderL}` }}>
            <Btn full icon="bulb" onClick={onDemo}>登録せずに試す</Btn>
            <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,marginTop:8,textAlign:"center" }}>見本の作品が入った状態で、すぐに触れます。<br/>この端末の中だけで動き、保存はされません。</div>
          </div>
        )}

        <div style={{ display:"flex",flexDirection:"column",gap:2,marginTop:14 }}>
          {mode==="login"&&<>
            <button onClick={()=>{setMode("forgot");say("");}} style={{ background:"none",border:"none",color:C.hint,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0" }}>パスワードをお忘れですか？</button>
            <button onClick={()=>{setMode("signup");say("");}} style={{ background:"none",border:"none",color:C.hint,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0" }}>アカウントをお持ちでない方 → 新規登録</button>
          </>}
          {mode!=="login"&&<button onClick={()=>{setMode("login");say("");}} style={{ background:"none",border:"none",color:C.hint,fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px 0" }}>← ログインに戻る</button>}
        </div>
      </div>
    </div>
  );
};

// メールのリンクから戻ってきたときだけ出る、新しいパスワードの入力画面
const NewPasswordScreen = ({ onDone }) => {
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  const [isErr,setIsErr]=useState(false);
  const submit=async()=>{
    if(pw.length<6){ setMsg("パスワードは6文字以上にしてください"); setIsErr(true); return; }
    if(pw!==pw2){ setMsg("2つのパスワードが一致しません"); setIsErr(true); return; }
    setLoading(true); setMsg("");
    const { error } = await db.auth.updateUser({ password:pw });
    setLoading(false);
    if(error){ setMsg("変更できませんでした。"+error.message); setIsErr(true); }
    else { setMsg("パスワードを変更しました。"); setIsErr(false); setTimeout(onDone,900); }
  };
  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:C.bg,padding:24 }}>
      <div style={{ width:"100%",maxWidth:360,background:C.surface,borderRadius:18,padding:28,border:`0.5px solid ${C.border}` }}>
        <div style={{ fontFamily:C.display,fontSize:20,color:C.text,marginBottom:6 }}>新しいパスワード</div>
        <div style={{ fontSize:11.5,color:C.hint,lineHeight:1.9,marginBottom:18 }}>新しいパスワードを決めてください。変更するとそのままログインした状態になります。</div>
        <Inp label="新しいパスワード" value={pw} onChange={setPw} type="password" placeholder="6文字以上"/>
        <Inp label="もう一度入力" value={pw2} onChange={setPw2} type="password" placeholder="確認のため"/>
        {msg&&<div style={{ fontSize:12,color:isErr?C.danger:"#10B981",marginBottom:12,lineHeight:1.8 }}>{msg}</div>}
        <Btn variant="primary" full onClick={submit}>{loading?"変更中...":"パスワードを変更する"}</Btn>
      </div>
    </div>
  );
};

// ===================== EDIT MODALS =====================
const CharacterEdit = ({ char: init, data, onSave, onClose, onDelete }) => {
  const applyAllDefaults = data.abilityParams.filter(p=>p.applyAll).map(p=>({paramId:p.id,value:50}));
  const seed = init || {id:uid(),lastName:"",firstName:"",middleName:"",lastNameFuri:"",firstNameFuri:"",middleNameFuri:"",nameOrder:"last_first",genderId:"",imageColor:"#8EA3C3",image:"",birthday:"",deathDate:"",notes:"",relatedCharacters:[],relatedGroups:[],relatedTerms:[],parameters:[],abilities:[],abilityStages:[{id:uid(),name:"現在",abilities:applyAllDefaults}]};
  const [c,setC]=useState(()=>{ const s={...seed}; if(!s.abilityStages||s.abilityStages.length===0) s.abilityStages=[{id:uid(),name:"現在",abilities:s.abilities||[]}]; return s; });
  const u=(k,v)=>setC(p=>({...p,[k]:v}));
  const [tab,setTab]=useState("basic");
  const [midOpen,setMidOpen]=useState(false);
  const [stageIdx,setStageIdx]=useState(0);
  const stage=c.abilityStages[stageIdx]||c.abilityStages[0];
  const setStage=(patch)=>{ const next=c.abilityStages.map((s,i)=>i===stageIdx?{...s,...patch}:s); u("abilityStages",next); };
  const getAbilityVal=(pid)=>(stage.abilities.find(x=>x.paramId===pid)?.value)||0;
  const setAbilityVal=(pid,val)=>{ const next=stage.abilities.filter(x=>x.paramId!==pid); next.push({paramId:pid,value:Number(val)}); setStage({abilities:next}); };
  const removeAbility=(pid)=>setStage({abilities:stage.abilities.filter(x=>x.paramId!==pid)});
  const [stagePrompt,setStagePrompt]=useState(null);
  const [stageDel,setStageDel]=useState(false);
  const addStage=()=>setStagePrompt({mode:"add",value:""});
  const renameStage=()=>setStagePrompt({mode:"rename",value:stage.name});
  const commitStage=()=>{
    const name=(stagePrompt.value||"").trim();
    if(stagePrompt.mode==="add"){ const seedAb=data.abilityParams.filter(p=>p.applyAll).map(p=>({paramId:p.id,value:50})); const ns={id:uid(),name:name||`時期${c.abilityStages.length+1}`,abilities:seedAb}; const next=[...c.abilityStages,ns]; u("abilityStages",next); setStageIdx(next.length-1); }
    else setStage({name:name||stage.name});
    setStagePrompt(null);
  };
  const deleteStage=()=>{ const next=c.abilityStages.filter((_,i)=>i!==stageIdx); u("abilityStages",next); setStageIdx(0); setStageDel(false); };
  const includedParams=data.abilityParams.filter(p=>stage.abilities.some(a=>a.paramId===p.id));
  const availableParams=data.abilityParams.filter(p=>!stage.abilities.some(a=>a.paramId===p.id));
  const saveAll=()=>{ const out={...c,abilities:(c.abilityStages[0]&&c.abilityStages[0].abilities)||[]}; onSave(out); };
  return (<Modal title={charName(c)||"新しい人物"} onClose={onClose} footer={<>{init&&<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={saveAll}>保存</Btn></>}>
    <Tabs active={tab} onChange={setTab} tabs={[{key:"basic",label:"基本"},{key:"links",label:"つながり"},{key:"ability",label:"能力値"},{key:"params",label:"自由項目"}]}/>
    {tab==="basic"&&<><ImageUpload value={c.image} onChange={v=>u("image",v)}/><Field label="名前の順序"><div style={{ display:"flex",gap:6 }}>{[["last_first","姓 → 名"],["first_last","名 → 姓"]].map(([v,l])=><button key={v} onClick={()=>u("nameOrder",v)} style={{ padding:"6px 13px",borderRadius:18,border:`1.5px solid ${c.nameOrder===v?C.accent:C.border}`,background:c.nameOrder===v?C.accent:C.surface,color:c.nameOrder===v?C.accentFg:C.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:500 }}>{l}</button>)}</div></Field>
    {c.nameOrder==="last_first"?<><div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><Inp label="姓" value={c.lastName} onChange={v=>u("lastName",v)} placeholder="山田"/><Inp label="名" value={c.firstName} onChange={v=>u("firstName",v)} placeholder="太郎"/></div><div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><Inp label="姓（ふりがな）" value={c.lastNameFuri} onChange={v=>u("lastNameFuri",v)} placeholder="やまだ"/><Inp label="名（ふりがな）" value={c.firstNameFuri} onChange={v=>u("firstNameFuri",v)} placeholder="たろう"/></div></>:<><div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><Inp label="名" value={c.firstName} onChange={v=>u("firstName",v)} placeholder="太郎"/><Inp label="姓" value={c.lastName} onChange={v=>u("lastName",v)} placeholder="山田"/></div><div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><Inp label="名（ふりがな）" value={c.firstNameFuri} onChange={v=>u("firstNameFuri",v)} placeholder="たろう"/><Inp label="姓（ふりがな）" value={c.lastNameFuri} onChange={v=>u("lastNameFuri",v)} placeholder="やまだ"/></div></>}
    {(midOpen||c.middleName||c.middleNameFuri)?(
      <div style={{ border:`0.5px solid ${C.border}`,borderRadius:12,padding:"12px 12px 2px",marginBottom:14,background:C.bg }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
          <span style={{ fontSize:11,color:C.sub,fontWeight:600,letterSpacing:"0.06em" }}>ミドルネーム</span>
          <button onClick={()=>{ u("middleName",""); u("middleNameFuri",""); setMidOpen(false); }} style={{ display:"flex",alignItems:"center",gap:4,border:"none",background:"transparent",color:C.hint,cursor:"pointer",fontFamily:"inherit",fontSize:11,padding:"2px 4px" }}><Ico n="x" s={12} c={C.hint}/>使わない</button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}>
          <Inp label="ミドルネーム" value={c.middleName} onChange={v=>u("middleName",v)} placeholder="Ronald"/>
          <Inp label="ふりがな" value={c.middleNameFuri} onChange={v=>u("middleNameFuri",v)} placeholder="ロナルド"/>
        </div>
        <div style={{ fontSize:10.5,color:C.hint,lineHeight:1.7,paddingBottom:10 }}>姓と名のあいだに入ります。今は「{charName(c)}」と表示されます。</div>
      </div>
    ):(
      <div style={{ marginBottom:14 }}>
        <button onClick={()=>setMidOpen(true)} style={{ display:"flex",alignItems:"center",gap:6,padding:"9px 12px",border:`0.5px dashed ${C.hint}`,borderRadius:10,background:"transparent",color:C.sub,cursor:"pointer",fontFamily:"inherit",fontSize:12.5 }}><Ico n="plus" s={13} c={C.sub}/>ミドルネームを追加</button>
      </div>
    )}
    <Sel label="性別" value={c.genderId} onChange={v=>u("genderId",v)} options={data.genders.map(g=>({value:g.id,label:g.name}))}/><Field label="イメージカラー"><div style={{ display:"flex",gap:10,alignItems:"center" }}><input type="color" value={c.imageColor} onChange={e=>u("imageColor",e.target.value)} style={{ width:36,height:36,border:`0.5px solid ${C.border}`,borderRadius:8,cursor:"pointer",padding:2 }}/><span style={{ fontSize:12,color:C.sub }}>{c.imageColor}</span></div></Field>
    <div data-date-grid style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><DateInp cal={data.calendar} label="誕生日" value={c.birthday} onChange={v=>u("birthday",v)}/><DateInp cal={data.calendar} label="死亡日" value={c.deathDate} onChange={v=>u("deathDate",v)}/></div><Inp label="備考" value={c.notes} onChange={v=>u("notes",v)} rows={3} placeholder="メモ・設定など..."/></>}
    {tab==="links"&&<>
      <Field label="関連人物" mb={16}>        {c.relatedCharacters.map(rel=>{const ch=data.characters.find(x=>x.id===rel.charId);return ch?<CharRelCard key={rel.charId} rel={rel} character={ch} relationTypes={data.relationTypes} onUpdate={up=>u("relatedCharacters",c.relatedCharacters.map(r=>r.charId===up.charId?up:r))} onRemove={()=>u("relatedCharacters",c.relatedCharacters.filter(r=>r.charId!==rel.charId))}/>:null;})}
        <AdditiveLinker available={data.characters.filter(ch=>ch.id!==c.id&&!c.relatedCharacters.some(r=>r.charId===ch.id))} onAdd={id=>u("relatedCharacters",[...c.relatedCharacters,{charId:id,callName:"",calledName:"",relTypeId:"",direction:"both"}])} getLabel={charName} getColor={ch=>ch.imageColor}/></Field>
      <Divider/>
      <Field label="関連集団" mb={16}>{c.relatedGroups.map(rel=>{const g=data.groups.find(x=>x.id===rel.groupId);return g?<GroupRelCard key={rel.groupId} rel={rel} group={g} onUpdate={up=>u("relatedGroups",c.relatedGroups.map(r=>r.groupId===up.groupId?up:r))} onRemove={()=>u("relatedGroups",c.relatedGroups.filter(r=>r.groupId!==rel.groupId))}/>:null;})}<AdditiveLinker available={data.groups.filter(g=>!c.relatedGroups.some(r=>r.groupId===g.id))} onAdd={id=>u("relatedGroups",[...c.relatedGroups,{groupId:id,position:""}])} getLabel={g=>g.name||"（無名）"}/></Field>
      <Divider/>
      <Field label="関連用語" mb={0}><div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{c.relatedTerms.map(id=>{const t=data.terms.find(x=>x.id===id);return t?<Tag key={id} label={t.name} onRemove={()=>u("relatedTerms",c.relatedTerms.filter(x=>x!==id))}/>:null;})}</div><AdditiveLinker available={data.terms.filter(t=>!c.relatedTerms.includes(t.id))} onAdd={id=>u("relatedTerms",[...c.relatedTerms,id])} getLabel={t=>t.name||"（無名）"}/></Field>
    </>}
    {tab==="ability"&&<>
      <div style={{ display:"flex",gap:6,alignItems:"center",marginBottom:12,overflowX:"auto",paddingBottom:2 }}>
        {c.abilityStages.map((st,i)=>(<button key={st.id} onClick={()=>setStageIdx(i)} style={{ flexShrink:0,padding:"6px 12px",borderRadius:18,border:`1.5px solid ${i===stageIdx?C.accent:C.border}`,background:i===stageIdx?C.accent:C.surface,color:i===stageIdx?C.accentFg:C.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:i===stageIdx?600:400,whiteSpace:"nowrap" }}>{st.name}</button>))}
        <button onClick={addStage} style={{ flexShrink:0,width:30,height:30,borderRadius:"50%",border:`1.5px dashed ${C.border}`,background:"transparent",color:C.hint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico n="plus" s={14} c={C.hint}/></button>
      </div>
      <div style={{ display:"flex",gap:6,marginBottom:12 }}>
        <Btn small variant="ghost" icon="edit" onClick={renameStage}>時期名変更</Btn>
        {c.abilityStages.length>1&&<Btn small variant="ghost" onClick={()=>setStageDel(true)}>この時期を削除</Btn>}
      </div>
      <div style={{ background:C.bg,borderRadius:14,padding:"16px 8px 8px",marginBottom:16 }}>
        <div style={{ textAlign:"center",fontSize:11,color:C.sub,marginBottom:4,fontWeight:600 }}>{stage.name}</div>
        <RadarChart params={includedParams} values={stage.abilities} color={c.imageColor||C.accent} size={200}/>
      </div>
      {data.abilityParams.length===0?<div style={{ textAlign:"center",padding:"12px 0",color:C.hint,fontSize:13 }}>設定 → 能力の軸 で項目を追加してください</div>:<>
        {includedParams.map(p=>(<div key={p.id} style={{ marginBottom:14 }}><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}><span style={{ fontSize:13,fontWeight:600,color:C.text }}>{p.name}</span><div style={{ display:"flex",alignItems:"center",gap:8 }}><span style={{ fontSize:13,fontWeight:700,color:c.imageColor||C.accent,minWidth:28,textAlign:"right" }}>{getAbilityVal(p.id)}</span><button onClick={()=>removeAbility(p.id)} style={{ border:"none",background:"transparent",cursor:"pointer",padding:2,opacity:0.35 }}><Ico n="x" s={14} c={C.text}/></button></div></div><input type="range" min="0" max="100" value={getAbilityVal(p.id)} onChange={e=>setAbilityVal(p.id,e.target.value)} style={{ width:"100%",accentColor:c.imageColor||C.accent }}/></div>))}
        {availableParams.length>0&&<AdditiveLinker available={availableParams} onAdd={id=>setAbilityVal(id,50)} getLabel={p=>p.name||"（無名）"} placeholder="能力項目を追加"/>}
      </>}
    </>}
    {tab==="params"&&(data.parameters.length===0?<div style={{ textAlign:"center",padding:"24px 0",color:C.hint,fontSize:13 }}>設定 → 自由項目 で欄を追加してください</div>:data.parameters.map(p=>{const ex=c.parameters.find(x=>x.paramId===p.id);return <Inp key={p.id} label={p.name} value={ex?ex.value:""} onChange={v=>{const np=c.parameters.filter(x=>x.paramId!==p.id);if(v) np.push({paramId:p.id,value:v});u("parameters",np);}} placeholder={`${p.name}を入力...`}/>;}))}
    {stagePrompt&&(
      <Modal compact title={stagePrompt.mode==="add"?"時期を追加":"時期の名前を変更"} onClose={()=>setStagePrompt(null)} footer={<><Btn onClick={()=>setStagePrompt(null)}>キャンセル</Btn><div style={{ flex:1 }}/><Btn variant="primary" onClick={commitStage}>{stagePrompt.mode==="add"?"追加":"変更"}</Btn></>}>
        <Inp label="時期の名前" value={stagePrompt.value} onChange={v=>setStagePrompt(prev=>({...prev,value:v}))} placeholder="例：初期、中盤、完結後"/>
        <div style={{ fontSize:11,color:C.hint,lineHeight:1.8 }}>能力値を時期ごとに分けて記録できます。空のままでも自動で名前が付きます。</div>
      </Modal>
    )}
    {stageDel&&(
      <Modal compact title="時期を削除" onClose={()=>setStageDel(false)} footer={<><Btn onClick={()=>setStageDel(false)}>キャンセル</Btn><div style={{ flex:1 }}/><Btn variant="danger" icon="trash" onClick={deleteStage}>削除する</Btn></>}>
        <div style={{ fontSize:13,color:C.text,lineHeight:1.9 }}>「{stage.name}」の能力値を削除します。この時期に入れた数値は元に戻せません。</div>
      </Modal>
    )}
  </Modal>);
};

const SceneEdit = ({ scene: init, preset, data, onSave, onClose, onDelete }) => {
  const [s,setS]=useState(init||{id:uid(),title:"",startDate:"",endDate:"",relatedCharacters:[],relatedLocationId:"",relatedChapterId:"",relatedTerms:[],script:"",notes:"",...(preset||{})});
  const u=(k,v)=>setS(p=>({...p,[k]:v}));
  const [tab,setTab]=useState("basic");
  return (<Modal title={s.title||"新しいシーン"} onClose={onClose} footer={<>{init&&<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={()=>onSave(s)}>保存</Btn></>}>
    <Tabs active={tab} onChange={setTab} tabs={[{key:"basic",label:"基本"},{key:"script",label:"脚本"},{key:"links",label:"紐付け"}]}/>
    {tab==="basic"&&<><Inp label="シーンタイトル" value={s.title} onChange={v=>u("title",v)} placeholder="タイトルを入力..."/><div data-date-grid style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8 }}><DateInp cal={data.calendar} label="開始日" value={s.startDate} onChange={v=>u("startDate",v)}/><DateInp cal={data.calendar} label="終了日" value={s.endDate} onChange={v=>u("endDate",v)}/></div>
    {s.startDate&&s.relatedCharacters.length>0&&<div style={{ background:C.tag,borderRadius:10,padding:"10px 12px",marginBottom:14 }}><Lbl>登場人物の年齢（開始日時点）</Lbl>{s.relatedCharacters.map(cid=>{const ch=data.characters.find(c=>c.id===cid);if(!ch||!ch.birthday) return null;const age=ageBetween(data,ch.birthday,s.startDate);return age!==null?<div key={cid} style={{ display:"flex",gap:6,fontSize:12,marginBottom:1 }}><span style={{ color:ch.imageColor,fontWeight:700 }}>●</span><span style={{color:C.text}}>{charName(ch)}</span><span style={{ color:C.sub }}>{age}歳</span></div>:null;})}</div>}
    <Sel label="関連場所" value={s.relatedLocationId} onChange={v=>u("relatedLocationId",v)} options={data.locations.map(l=>({value:l.id,label:l.name||"（無名）"}))}/>
    <Sel label="関連する章" value={s.relatedChapterId} onChange={v=>u("relatedChapterId",v)} options={data.chapters.map(c=>({value:c.id,label:c.title||"（無題）"}))}/><Inp label="備考" value={s.notes} onChange={v=>u("notes",v)} rows={3} placeholder="メモ..."/></>}
    {tab==="script"&&<><Inp label="脚本" value={s.script} onChange={v=>u("script",v)} rows={12} placeholder="シーンの脚本..."/><div style={{ textAlign:"right",fontSize:11,color:C.hint,marginTop:-8 }}>{countChars(s.script)}文字（空白除く） / {(s.script||"").length}文字</div></>}
    {tab==="links"&&<><Field label="関連人物" mb={16}><div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{s.relatedCharacters.map(id=>{const ch=data.characters.find(c=>c.id===id);return ch?<Tag key={id} label={charName(ch)} color={ch.imageColor} onRemove={()=>u("relatedCharacters",s.relatedCharacters.filter(x=>x!==id))}/>:null;})}</div><AdditiveLinker available={data.characters.filter(ch=>!s.relatedCharacters.includes(ch.id))} onAdd={id=>u("relatedCharacters",[...s.relatedCharacters,id])} getLabel={charName} getColor={ch=>ch.imageColor}/></Field>
      <Divider/><Field label="関連用語" mb={0}><div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{s.relatedTerms.map(id=>{const t=data.terms.find(x=>x.id===id);return t?<Tag key={id} label={t.name} onRemove={()=>u("relatedTerms",s.relatedTerms.filter(x=>x!==id))}/>:null;})}</div><AdditiveLinker available={data.terms.filter(t=>!s.relatedTerms.includes(t.id))} onAdd={id=>u("relatedTerms",[...s.relatedTerms,id])} getLabel={t=>t.name||"（無名）"}/></Field></>}
  </Modal>);
};

const GroupEdit = ({ group: init, data, onSave, onClose, onDelete }) => {
  const [g,setG]=useState(init||{id:uid(),name:"",description:"",notes:"",relatedCharacters:[],memberNotes:{}});
  const u=(k,v)=>setG(p=>({...p,[k]:v}));
  const setMemberNote=(cid,note)=>{ const mn={...(g.memberNotes||{})}; if(note) mn[cid]=note; else delete mn[cid]; u("memberNotes",mn); };
  return (<Modal title={g.name||"新しい集団"} onClose={onClose} footer={<>{init&&<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={()=>onSave(g)}>保存</Btn></>}>
    <Inp label="集団名" value={g.name} onChange={v=>u("name",v)} placeholder="例：冒険者ギルド"/>
    <Inp label="説明" value={g.description} onChange={v=>u("description",v)} rows={3} placeholder="集団の説明..."/>
    <Field label="所属人物" mb={16}>
      {g.relatedCharacters.map(cid=>{ const ch=data.characters.find(x=>x.id===cid); if(!ch) return null; return (
        <div key={cid} style={{ border:`0.5px solid ${C.border}`,borderRadius:11,padding:"10px 12px",marginBottom:6 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7 }}>
            <div style={{ display:"flex",alignItems:"center",gap:7,minWidth:0 }}>{ch.image?<img src={ch.image} style={{ width:24,height:24,borderRadius:"50%",objectFit:"cover",flexShrink:0 }}/>:<div style={{ width:24,height:24,borderRadius:"50%",background:(ch.imageColor||"#ccc")+"30",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><Ico n="person" s={13} c={ch.imageColor||C.hint}/></div>}<span style={{ fontSize:13,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charName(ch)}</span></div>
            <button onClick={()=>u("relatedCharacters",g.relatedCharacters.filter(x=>x!==cid))} style={{ border:"none",background:"transparent",cursor:"pointer",padding:3,opacity:0.4,flexShrink:0 }}><Ico n="x" s={14} c={C.text}/></button>
          </div>
          <input value={(g.memberNotes||{})[cid]||""} onChange={e=>setMemberNote(cid,e.target.value)} placeholder="立ち位置・役職メモ（例：団長）" style={{ ...IS(),padding:"7px 9px" }}/>
        </div>
      ); })}
      <AdditiveLinker available={data.characters.filter(ch=>!g.relatedCharacters.includes(ch.id))} onAdd={id=>u("relatedCharacters",[...g.relatedCharacters,id])} getLabel={charName} getColor={ch=>ch.imageColor}/>
    </Field>
    <Inp label="備考" value={g.notes} onChange={v=>u("notes",v)} rows={3} placeholder="メモ..."/>
  </Modal>);
};

const ChapterEdit = ({ chapter: init, data, onSave, onClose, onDelete }) => { const [ch,setCh]=useState(init||{id:uid(),title:"",relatedScenes:[],notes:""}); const u=(k,v)=>setCh(p=>({...p,[k]:v})); return (<Modal title={ch.title||"新しい章"} onClose={onClose} footer={<>{init&&<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={()=>onSave(ch)}>保存</Btn></>}><Inp label="章タイトル" value={ch.title} onChange={v=>u("title",v)} placeholder="第一章: ..."/><Field label="関連シーン" mb={14}><div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{ch.relatedScenes.map(id=>{const s=data.scenes.find(x=>x.id===id);return s?<Tag key={id} label={s.title||"（無題）"} onRemove={()=>u("relatedScenes",ch.relatedScenes.filter(x=>x!==id))}/>:null;})}</div><AdditiveLinker available={data.scenes.filter(s=>!ch.relatedScenes.includes(s.id))} onAdd={id=>u("relatedScenes",[...ch.relatedScenes,id])} getLabel={s=>s.title||"（無題）"}/></Field><Inp label="備考" value={ch.notes} onChange={v=>u("notes",v)} rows={3} placeholder="メモ..."/></Modal>); };

const SimpleEdit = ({ item: init, entityName, fields, data, onSave, onClose, onDelete }) => { const defs={id:uid(),name:""}; fields.forEach(f=>{if(!(f.key in defs)) defs[f.key]=f.type==="links"?[]:""; }); const [item,setItem]=useState({...defs,...(init||{})}); const u=(k,v)=>setItem(p=>({...p,[k]:v})); return (<Modal title={item.name||`新しい${entityName}`} onClose={onClose} footer={<>{init&&<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={()=>onSave(item)}>保存</Btn></>}>{fields.map(f=>{ if(f.type==="text") return <Inp key={f.key} label={f.label} value={item[f.key]||""} onChange={v=>u(f.key,v)} placeholder={f.placeholder}/>; if(f.type==="textarea") return <Inp key={f.key} label={f.label} value={item[f.key]||""} onChange={v=>u(f.key,v)} rows={3} placeholder={f.placeholder}/>; if(f.type==="color") return <Field key={f.key} label={f.label}><div style={{ display:"flex",gap:10,alignItems:"center" }}><input type="color" value={item[f.key]||"#888"} onChange={e=>u(f.key,e.target.value)} style={{ width:36,height:36,border:`0.5px solid ${C.border}`,borderRadius:8,cursor:"pointer",padding:2 }}/><span style={{ fontSize:12,color:C.sub }}>{item[f.key]}</span></div></Field>; if(f.type==="links") return <Field key={f.key} label={f.label} mb={14}><div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{(item[f.key]||[]).map(id=>{const x=(data[f.dataKey]||[]).find(d=>d.id===id);return x?<Tag key={id} label={f.getLabel?f.getLabel(x):(x.name||"?")} color={f.getColor?f.getColor(x):null} onRemove={()=>u(f.key,(item[f.key]||[]).filter(i=>i!==id))}/>:null;})}</div><AdditiveLinker available={(data[f.dataKey]||[]).filter(x=>!(item[f.key]||[]).includes(x.id))} onAdd={id=>u(f.key,[...(item[f.key]||[]),id])} getLabel={f.getLabel||(x=>x.name||"（無名）")} getColor={f.getColor}/></Field>; return null; })}</Modal>); };

const AbilityParamEdit = ({ param: init, onSave, onClose, onDelete }) => {
  const [p,setP]=useState(init||{id:uid(),name:"",applyAll:false});
  const u=(k,v)=>setP(prev=>({...prev,[k]:v}));
  return (<Modal title={p.name||"新しい能力項目"} onClose={onClose} footer={<>{init?<Btn variant="danger" icon="trash" small onClick={onDelete}>削除</Btn>:null}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={()=>onSave(p)}>保存</Btn></>}>
    <Inp label="項目名" value={p.name} onChange={v=>u("name",v)} placeholder="例：攻撃力、魔力、素早さ..."/>
    <div onClick={()=>u("applyAll",!p.applyAll)} style={{ display:"flex",alignItems:"flex-start",gap:11,padding:"14px",borderRadius:12,border:`1.5px solid ${p.applyAll?C.accent:C.border}`,background:p.applyAll?C.accent+"14":C.surface,cursor:"pointer",marginTop:4 }}>
      <div style={{ width:22,height:22,borderRadius:6,border:`1.5px solid ${p.applyAll?C.accent:C.border}`,background:p.applyAll?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>
        {p.applyAll?<Ico n="check" s={14} c={C.accentFg}/>:null}
      </div>
      <div>
        <div style={{ fontSize:14,fontWeight:600,color:C.text,marginBottom:3 }}>全人物に適用</div>
        <div style={{ fontSize:11.5,color:C.sub,lineHeight:1.6 }}>ONにして保存すると、いま登録されている全人物の全時期チャートにこの項目が追加されます。今後作る人物にも自動で入ります。OFFの場合は各人物ページで個別に追加します。</div>
      </div>
    </div>
  </Modal>);
};

// ===================== CHARACTER VIEW（閲覧ビュー）=====================
const VSection = ({ title, count, accent, children, action }) => (
  <div style={{ marginBottom:12,background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,overflow:"hidden" }}>
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:C.bg,borderBottom:`0.5px solid ${C.border}` }}>
      <span style={{ fontSize:10.5,fontWeight:600,color:C.hint,letterSpacing:"0.1em" }}>{title}</span>
      {count!==undefined&&<span style={{ fontSize:10,color:C.hint }}>{count}</span>}
      {action&&<div style={{ marginLeft:"auto" }}>{action}</div>}
    </div>
    <div>{children}</div>
  </div>
);
const InfoRows = ({ rows }) => (<>{rows.map(([label,value],i)=>(
  <div key={i} style={{ display:"flex",gap:10,padding:"11px 14px",borderBottom:i<rows.length-1?`0.5px solid ${C.borderL}`:"none",alignItems:"flex-start" }}>
    <div style={{ width:76,flexShrink:0,fontSize:11.5,color:C.hint,paddingTop:2 }}>{label}</div>
    <div style={{ flex:1,minWidth:0,fontSize:13,color:C.text,lineHeight:1.75,wordBreak:"break-word",whiteSpace:"pre-wrap" }}>{value}</div>
  </div>
))}</>);

const CharacterView = ({ char, data, onClose, onEdit, onJump, onEditRel, embedded }) => {
  const acc = char.imageColor || C.accent;
  const stages = (char.abilityStages&&char.abilityStages.length)?char.abilityStages:[{id:"s0",name:"現在",abilities:char.abilities||[]}];
  const [sIdx,setSIdx]=useState(0);
  const stage = stages[Math.min(sIdx,stages.length-1)];
  const abParams = data.abilityParams.filter(p=>stage.abilities.some(a=>a.paramId===p.id));
  const gender = data.genders.find(g=>g.id===char.genderId);
  const cal = data.calendar;
  const today = new Date().toISOString().slice(0,10);
  const ageInfo = storyAge(data,char);
  const age = ageInfo?ageInfo.age:null;
  const groups = char.relatedGroups.map(r=>({ ...r, g:data.groups.find(x=>x.id===r.groupId) })).filter(x=>x.g);
  const terms = char.relatedTerms.map(id=>data.terms.find(t=>t.id===id)).filter(Boolean);
  const params = data.parameters.map(p=>({ p, v:(char.parameters.find(x=>x.paramId===p.id)||{}).value })).filter(x=>x.v);
  const rels = char.relatedCharacters.map(r=>({ ...r, other:data.characters.find(c=>c.id===r.charId) })).filter(x=>x.other);
  const scenes = data.scenes.filter(s=>(s.relatedCharacters||[]).includes(char.id));
  const furi = charFuri(char);
  const basics=[];
  if(char.birthday) basics.push(["誕生日",dateLabel(data,char.birthday)+(age!==null&&!char.deathDate?`　${age}歳`:"")]);
  if(char.deathDate) basics.push(["死亡日",dateLabel(data,char.deathDate)+(age!==null?`　享年${age}`:"")]);
  if(char.notes) basics.push(["備考",char.notes]);

  return (
    <div style={embedded
      ? { flex:1,minWidth:0,background:C.bg,display:"flex",flexDirection:"column",overflow:"hidden" }
      : { position:"fixed",inset:0,zIndex:900,background:C.bg,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column",animation:"tlSlideUp 0.18s ease-out" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 10px 10px 6px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="back" s={17} c={acc}/><span style={{ fontSize:12.5,color:acc }}>人物一覧</span></button>
        <span style={{ fontSize:12,color:C.hint }}>人物</span>
        <Btn small variant="primary" accent={acc} icon="edit" onClick={onEdit}>編集</Btn>
      </div>

      <div style={{ flex:1,overflowY:"auto" }}>
        <div style={{ padding:"22px 18px 18px",display:"flex",gap:16,alignItems:"center",borderBottom:`0.5px solid ${C.border}` }}>
          <div style={{ width:74,height:74,borderRadius:14,overflow:"hidden",flexShrink:0,background:C.surface,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative" }}>
            {char.image?<img src={char.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontFamily:C.display,fontSize:30,color:acc }}>{charInitial(char)}</span>}
            <div style={{ position:"absolute",left:0,right:0,bottom:0,height:2,background:acc }}/>
          </div>
          <div style={{ minWidth:0,flex:1 }}>
            <div style={{ fontFamily:C.display,fontSize:23,color:C.text,lineHeight:1.2,marginBottom:2,wordBreak:"break-word" }}>{charName(char)}</div>
            {furi&&<div style={{ fontSize:11.5,color:C.hint,marginBottom:6 }}>{furi}</div>}
            <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginTop:6 }}>
              {gender&&<Tag label={gender.name} color={gender.color}/>}
              {ageText(data,char)&&<Tag label={ageText(data,char)}/>}
              {groups.slice(0,2).map(x=><Tag key={x.groupId} label={x.position?`${x.g.name}・${x.position}`:x.g.name}/>)}
            </div>
          </div>
        </div>

        <div style={{ padding:"14px 12px calc(28px + env(safe-area-inset-bottom,0px))" }}>
          {basics.length>0&&<VSection title="基本情報" accent={acc}><InfoRows rows={basics}/></VSection>}

          {abParams.length>0&&(
            <VSection title="能力値" accent={acc} action={stages.length>1?(
              <div style={{ display:"flex",gap:4 }}>{stages.map((st,i)=>(
                <button key={st.id} onClick={()=>setSIdx(i)} style={{ padding:"3px 10px",borderRadius:14,border:`0.5px solid ${i===sIdx?acc:C.border}`,background:i===sIdx?acc+"1F":"transparent",color:i===sIdx?acc:C.hint,fontSize:10.5,fontWeight:i===sIdx?700:400,cursor:"pointer",fontFamily:"inherit" }}>{st.name}</button>
              ))}</div>
            ):null}>
              <div style={{ padding:"14px 8px 6px" }}>
                <RadarChart params={abParams} values={stage.abilities} color={acc} size={210}/>
              </div>
              <div style={{ padding:"4px 14px 14px",display:"flex",flexWrap:"wrap",gap:"6px 14px" }}>
                {abParams.map(p=>{ const v=(stage.abilities.find(a=>a.paramId===p.id)||{}).value||0; return (
                  <div key={p.id} style={{ display:"flex",alignItems:"baseline",gap:5,fontSize:12 }}>
                    <span style={{ color:C.sub }}>{p.name}</span>
                    <span style={{ fontWeight:700,color:acc }}>{v}</span>
                  </div>
                ); })}
              </div>
            </VSection>
          )}

          {params.length>0&&<VSection title="自由項目" accent={acc}><InfoRows rows={params.map(x=>[x.p.name,x.v])}/></VSection>}

          {rels.length>0&&(
            <VSection title="関連人物" count={rels.length} accent={acc}>
              {rels.map((r,i)=>{ const rt=data.relationTypes.find(t=>t.id===r.relTypeId); const arrow=r.direction==="to"?"→":r.direction==="from"?"←":"↔"; return (
                <div key={r.charId} onClick={()=>onJump(r.charId)} style={{ display:"flex",gap:10,padding:"11px 14px",borderBottom:i<rels.length-1?`0.5px solid ${C.borderL}`:"none",cursor:"pointer",alignItems:"center" }}>
                  <div style={{ width:34,height:34,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:(r.other.imageColor||"#ccc")+"26",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    {r.other.image?<img src={r.other.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontSize:14,fontWeight:700,color:r.other.imageColor||C.hint }}>{charInitial(r.other)}</span>}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:5,flexWrap:"wrap" }}>
                      <span style={{ fontSize:11,color:C.hint }}>{arrow}</span>
                      <span style={{ fontSize:13.5,fontWeight:600,color:C.text }}>{charName(r.other)}</span>
                      {rt&&<span style={{ fontSize:10,padding:"1px 7px",borderRadius:20,background:rt.color+"22",color:rt.color,border:`0.5px solid ${rt.color}`,fontWeight:600 }}>{rt.name}</span>}
                    </div>
                    <div style={{ fontSize:11,color:C.sub,lineHeight:1.6,marginTop:2 }}>
                      {r.callName&&<span>「{r.callName}」と呼ぶ</span>}
                      {r.callName&&r.calledName&&<span style={{ color:C.hint }}> ／ </span>}
                      {r.calledName&&<span>「{r.calledName}」と呼ばれる</span>}
                      {!r.callName&&!r.calledName&&<span style={{ color:C.hint }}>呼び方は未設定</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:2,flexShrink:0 }}>
                    <button onClick={e=>{e.stopPropagation();onEditRel&&onEditRel(char.id,r.charId);}} style={{ border:"none",background:"transparent",cursor:"pointer",padding:5,display:"flex" }}><Ico n="edit" s={14} c={C.sub}/></button>
                    <Ico n="chevR" s={14} c={C.hint}/>
                  </div>
                </div>
              ); })}
            </VSection>
          )}

          {groups.length>0&&(
            <VSection title="所属集団" count={groups.length} accent={acc}>
              <InfoRows rows={groups.map(x=>[x.g.name||"（無名）",x.position||"（立ち位置は未設定）"])}/>
            </VSection>
          )}

          {terms.length>0&&(
            <VSection title="関連用語" count={terms.length} accent={acc}>
              <div style={{ padding:"12px 14px",display:"flex",flexWrap:"wrap",gap:5 }}>{terms.map(t=><Tag key={t.id} label={t.name||"（無名）"}/>)}</div>
            </VSection>
          )}

          {scenes.length>0&&(
            <VSection title="登場シーン" count={scenes.length} accent={acc}>
              <InfoRows rows={scenes.map(s=>[dateLabel(data,s.startDate)||"日付なし",s.title||"（無題）"])}/>
            </VSection>
          )}

          {basics.length===0&&rels.length===0&&groups.length===0&&params.length===0&&abParams.length===0&&terms.length===0&&scenes.length===0&&(
            <div style={{ textAlign:"center",padding:"36px 24px",color:C.hint }}>
              <div style={{ fontSize:13,color:C.text,fontWeight:600,marginBottom:6 }}>まだ名前だけの人物です</div>
              <div style={{ fontSize:12,lineHeight:1.8,marginBottom:16,whiteSpace:"pre-line" }}>誕生日や備考、関係を書き足すと{"\n"}このページに並んでいきます。</div>
              <Btn variant="primary" accent={acc} icon="edit" onClick={onEdit}>書き足す</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===================== CHARACTER GRID（カード表示）=====================
const FaceGrid = ({ chars, onOpen }) => (
  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(78px,1fr))",gap:12,padding:14 }}>
    {chars.map(c=>{ const col=c.imageColor||"#8EA3C3"; return (
      <button key={c.id} onClick={()=>onOpen(c)} style={{ background:"transparent",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
        <div style={{ width:"100%",aspectRatio:"1 / 1",borderRadius:"50%",overflow:"hidden",background:C.bg,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
          {c.image?<img src={c.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontFamily:C.display,fontSize:26,color:col }}>{charInitial(c)}</span>}
        </div>
        <span style={{ fontSize:11,color:C.text,textAlign:"center",lineHeight:1.35,wordBreak:"break-word" }}>{charName(c)}</span>
      </button>
    ); })}
  </div>
);

const CharacterGrid = ({ chars, data, onOpen }) => (
  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:12 }}>
    {chars.map(c=>{ const col=c.imageColor||"#8EA3C3"; const g=data.genders.find(x=>x.id===c.genderId); const grp=c.relatedGroups.map(r=>(data.groups.find(x=>x.id===r.groupId)||{}).name).filter(Boolean); return (
      <button key={c.id} onClick={()=>onOpen(c)} style={{ display:"block",textAlign:"left",padding:14,background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,cursor:"pointer",fontFamily:"inherit" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
          <div style={{ width:44,height:44,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:C.bg,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
            {c.image?<img src={c.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontFamily:C.display,fontSize:17,color:col }}>{charInitial(c)}</span>}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontFamily:C.display,fontSize:15,color:C.text,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charName(c)}</div>
            <div style={{ fontSize:10.5,color:C.hint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charFuri(c)||"　"}</div>
          </div>
        </div>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
          {g&&<Tag label={g.name} color={g.color}/>}
          {ageText(data,c)&&<Tag label={ageText(data,c)}/>}
          {grp[0]&&<Tag label={grp[0]}/>}
        </div>
      </button>
    ); })}
  </div>
);

// ===================== CHAPTER BOARD（章＝カード／シーン＝積み木）=====================
const ChapterBoard = ({ data, onOpenChapter, onOpenScene, onAddChapter, onAddScene, onMoveChapter }) => {
  const sceneOf = id => data.scenes.find(s=>s.id===id);
  const chapterScenes = ch => (ch.relatedScenes||[]).map(sceneOf).filter(Boolean);
  const unassigned = data.scenes.filter(s=>!s.relatedChapterId||!data.chapters.some(c=>c.id===s.relatedChapterId));
  const sceneBlock = (s, color) => (
    <div key={s.id} onClick={()=>onOpenScene(s)} style={{ display:"flex",alignItems:"center",gap:9,padding:"9px 11px",background:C.bg,borderRadius:9,borderLeft:`3px solid ${color}`,marginBottom:5,cursor:"pointer" }}>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:12.5,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.title||"（無題）"}</div>
        <div style={{ fontSize:10,color:C.hint,marginTop:1 }}>{[dateLabel(data,s.startDate)||null,countChars(s.script)>0?`${countChars(s.script).toLocaleString()}字`:"未執筆"].filter(Boolean).join(" · ")}</div>
      </div>
      <Ico n="chevR" s={13} c={C.hint}/>
    </div>
  );
  return (
    <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`0.5px solid ${C.border}`,background:C.surface,flexShrink:0 }}>
        <div style={{ display:"flex",alignItems:"center",gap:7 }}><Ico n="book" s={16} c="#9B7DD4"/><span style={{ fontFamily:C.display,fontSize:15,color:C.text }}>章</span><span style={{ fontSize:11,color:C.hint }}>{data.chapters.length}章 · {data.scenes.length}シーン</span></div>
        <button onClick={onAddChapter} style={{ display:"flex",alignItems:"center",gap:4,padding:"7px 13px",background:C.accent,color:C.accentFg,border:"none",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}><Ico n="plus" s={11} c={C.accentFg}/>章を追加</button>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 12px 24px" }}>
        <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,padding:"0 4px 12px" }}>章のカードに、その章のシーンが積み上がります。並び順がそのまま物語の流れになります。</div>
        {data.chapters.length===0&&unassigned.length===0?(
          <EmptyState icon="book" title="章" onAdd={onAddChapter} actionLabel="最初の章を作る"/>
        ):(<>
          {data.chapters.map((ch,i)=>{ const scenes=chapterScenes(ch); const words=scenes.reduce((n,s)=>n+countChars(s.script),0); return (
            <div key={ch.id} style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:16,padding:"12px 12px 10px",marginBottom:10 }}>
              <div style={{ display:"flex",alignItems:"flex-start",gap:9,marginBottom:10 }}>
                <div style={{ display:"flex",flexDirection:"column",gap:1,flexShrink:0,paddingTop:2 }}>
                  <button onClick={()=>onMoveChapter(i,-1)} disabled={i===0} style={{ border:"none",background:"transparent",cursor:i===0?"default":"pointer",padding:"1px 2px",opacity:i===0?0.15:0.4,lineHeight:0 }}><Ico n="chevU" s={12} c={C.text}/></button>
                  <button onClick={()=>onMoveChapter(i,1)} disabled={i===data.chapters.length-1} style={{ border:"none",background:"transparent",cursor:i===data.chapters.length-1?"default":"pointer",padding:"1px 2px",opacity:i===data.chapters.length-1?0.15:0.4,lineHeight:0 }}><Ico n="chevD" s={12} c={C.text}/></button>
                </div>
                <div onClick={()=>onOpenChapter(ch)} style={{ flex:1,minWidth:0,cursor:"pointer" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#9B7DD4",letterSpacing:"1px",marginBottom:2 }}>第{i+1}章</div>
                  <div style={{ fontFamily:C.display,fontSize:15.5,color:C.text,lineHeight:1.3,wordBreak:"break-word" }}>{ch.title||"（無題）"}</div>
                  <div style={{ fontSize:10.5,color:C.hint,marginTop:3 }}>{scenes.length}シーン · {words.toLocaleString()}字</div>
                </div>
                <button onClick={()=>onOpenChapter(ch)} style={{ border:"none",background:"transparent",cursor:"pointer",padding:6,display:"flex",flexShrink:0,opacity:0.5 }}><Ico n="edit" s={14} c={C.text}/></button>
              </div>
              {scenes.map(s=>sceneBlock(s,"#5B9BD5"))}
              <button onClick={()=>onAddScene(ch.id)} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:5,width:"100%",padding:"9px",border:`1.5px dashed ${C.border}`,borderRadius:9,background:"transparent",color:C.hint,cursor:"pointer",fontFamily:"inherit",fontSize:12 }}><Ico n="plus" s={12} c={C.hint}/>この章にシーンを追加</button>
            </div>
          ); })}
          {unassigned.length>0&&(
            <div style={{ background:C.surface,border:`1px dashed ${C.border}`,borderRadius:16,padding:"12px 12px 10px",marginBottom:10 }}>
              <div style={{ fontSize:12.5,fontWeight:700,color:C.sub,marginBottom:3 }}>章に入っていないシーン</div>
              <div style={{ fontSize:10.5,color:C.hint,marginBottom:9 }}>シーンを開いて「関連する章」を選ぶと、上のカードに移ります</div>
              {unassigned.map(s=>sceneBlock(s,C.hint))}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
};

const RelFace = ({ c, size=38 }) => (
  <div style={{ width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:(c.imageColor||"#ccc")+"22",display:"flex",alignItems:"center",justifyContent:"center" }}>
    {c.image?<img src={c.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontFamily:C.display,fontSize:size*0.44,color:c.imageColor||C.hint }}>{charInitial(c)}</span>}
  </div>
);
const LINE_KINDS=[["solid","一本線"],["double","二重線"],["dashed","点線"],["heart","ハート"],["cross","バツ"]];
const LinePreview = ({ kind, color }) => (
  <svg width="26" height="10" viewBox="0 0 26 10">
    {kind==="double"
      ? <><line x1="1" y1="3.5" x2="25" y2="3.5" stroke={color} strokeWidth="1.3"/><line x1="1" y1="6.5" x2="25" y2="6.5" stroke={color} strokeWidth="1.3"/></>
      : <line x1="1" y1="5" x2="25" y2="5" stroke={color} strokeWidth="1.4" strokeDasharray={kind==="dashed"?"4 3":undefined}/>}
    {kind==="heart"&&<text x="13" y="8" textAnchor="middle" fontSize="9" fill={color}>♥</text>}
    {kind==="cross"&&<text x="13" y="8.5" textAnchor="middle" fontSize="9" fill={color}>✕</text>}
  </svg>
);

const RelSide = ({ from, to, type, setType, call, setCall, text, setText, arrow, setArrow, line, setLine, relationTypes }) => {
  const t=relationTypes.find(x=>x.id===type);
  return (
    <div style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 13px",background:C.bg,borderBottom:`0.5px solid ${C.border}` }}>
        <RelFace c={from} size={22}/>
        <span style={{ fontSize:12,color:C.sub,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charName(from)}</span>
        <span style={{ fontSize:13,color:t?t.color:C.hint,flexShrink:0 }}>→</span>
        <span style={{ fontSize:12,color:C.sub,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{charName(to)}</span>
      </div>
      <div style={{ padding:"12px 13px 4px" }}>
        <Sel label="関係（線の色になります）" value={type} onChange={setType} options={relationTypes.map(x=>({value:x.id,label:x.name}))}/>
        <Inp label="この向きの気持ち・関係の言葉" value={text} onChange={setText} placeholder="例：頭が上がらない"/>
        <Inp label={`${charName(from)} は相手を何と呼ぶ`} value={call} onChange={setCall} placeholder="例：たろー"/>
        <Field label="この向きの線">
          <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:8 }}>
            {LINE_KINDS.map(([v,cap])=>(
              <button key={v} onClick={()=>setLine(v)} style={{ padding:"9px 3px",borderRadius:10,border:`1.5px solid ${line===v?C.accent:C.border}`,background:line===v?C.accent+"12":"transparent",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                <LinePreview kind={v} color={line===v?C.accent:C.sub}/>
                <span style={{ fontSize:9.5,color:C.hint }}>{cap}</span>
              </button>
            ))}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
            {[[true,"矢印を出す"],[false,"矢印なし"]].map(([v,cap])=>(
              <button key={String(v)} onClick={()=>setArrow(v)} style={{ padding:"9px 4px",borderRadius:10,border:`1.5px solid ${arrow===v?C.accent:C.border}`,background:arrow===v?C.accent+"12":"transparent",color:arrow===v?C.accent:C.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>{v?"→ ":"— "}{cap}</button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
};

const RelationEdit = ({ charId, otherId, data, onSave, onClose, onRemove }) => {
  const me = data.characters.find(c=>c.id===charId);
  const other = data.characters.find(c=>c.id===otherId);
  const ea = me ? me.relatedCharacters.find(r=>r.charId===otherId) : null;
  const eb = other ? other.relatedCharacters.find(r=>r.charId===charId) : null;
  const has=(e)=>!!(e&&(e.relTypeId||e.text||e.arrowOut));
  const [aType,setAType]=useState((ea&&ea.relTypeId)||"");
  const [bType,setBType]=useState((eb&&eb.relTypeId)||"");
  const [aCall,setACall]=useState((ea&&ea.callName)||(eb&&eb.calledName)||"");
  const [bCall,setBCall]=useState((eb&&eb.callName)||(ea&&ea.calledName)||"");
  const [aText,setAText]=useState((ea&&ea.text)||"");
  const [bText,setBText]=useState((eb&&eb.text)||"");
  const [aLine,setALine]=useState((ea&&ea.lineStyle)||"solid");
  const [bLine,setBLine]=useState((eb&&eb.lineStyle)||"solid");
  const [aArrow,setAArrow]=useState(ea&&ea.arrowOut!==undefined?!!ea.arrowOut:has(ea));
  const [bArrow,setBArrow]=useState(eb&&eb.arrowOut!==undefined?!!eb.arrowOut:has(eb));
  if(!me||!other) return null;
  const save=()=>onSave(charId,otherId,
    { charId:otherId, relTypeId:aType, callName:aCall, calledName:bCall, text:aText, arrowOut:aArrow, lineStyle:aLine, direction:"both" },
    { charId:charId,  relTypeId:bType, callName:bCall, calledName:aCall, text:bText, arrowOut:bArrow, lineStyle:bLine, direction:"both" });
  return (
    <Modal title="関係を編集" onClose={onClose} footer={<>{(ea||eb)&&<Btn variant="danger" icon="trash" small onClick={onRemove}>関係を解除</Btn>}<div style={{ flex:1 }}/><Btn variant="primary" icon="save" onClick={save}>保存</Btn></>}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:14,padding:"4px 2px 8px" }}>
        <div style={{ textAlign:"center" }}><RelFace c={me}/><div style={{ fontSize:11,color:C.sub,marginTop:5 }}>{charName(me)}</div></div>
        <div style={{ fontSize:18,color:C.hint,paddingBottom:16 }}>⇄</div>
        <div style={{ textAlign:"center" }}><RelFace c={other}/><div style={{ fontSize:11,color:C.sub,marginTop:5 }}>{charName(other)}</div></div>
      </div>
      <div style={{ fontSize:11.5,color:C.hint,lineHeight:1.85,padding:"0 2px 16px" }}>関係は向きごとに別々に決められます。片方だけ設定すれば片想い、両方設定すれば行き違いも表せます。</div>
      <RelSide from={me} to={other} type={aType} setType={setAType} call={aCall} setCall={setACall} text={aText} setText={setAText} arrow={aArrow} setArrow={setAArrow} line={aLine} setLine={setALine} relationTypes={data.relationTypes}/>
      <RelSide from={other} to={me} type={bType} setType={setBType} call={bCall} setCall={setBCall} text={bText} setText={setBText} arrow={bArrow} setArrow={setBArrow} line={bLine} setLine={setBLine} relationTypes={data.relationTypes}/>
    </Modal>
  );
};

// ===================== RELATIONSHIP GRAPH =====================
const RelationGraph = ({ data, onOpenChar, onEditRel, onMoveNodes, onResetNodes }) => {
  const [selectedId,setSelectedId]=useState(null);
  const [groupFilter,setGroupFilter]=useState("");
  const [drafts,setDrafts]=useState({});          // 指を離すまでの仮位置
  const dragRef=useRef(null);
  const svgRef=useRef(null);
  const chars=groupFilter?data.characters.filter(c=>c.relatedGroups.some(r=>r.groupId===groupFilter)):data.characters;
  const size=Math.min(window.innerWidth-24,456);
  const cx=size/2, cy=size/2, R=size*0.38;
  const nodeR=chars.length>12?16:chars.length>8?19:22;
  const saved=data.graphPositions||{};
  const pos={};
  chars.forEach((c,i)=>{
    const d=drafts[c.id]||saved[c.id];
    if(d) pos[c.id]={x:d.x*size,y:d.y*size};
    else { const ang=(2*Math.PI*i/chars.length)-Math.PI/2; pos[c.id]={x:cx+R*Math.cos(ang),y:cy+R*Math.sin(ang)}; }
  });
  const toSvg=(e)=>{ const r=svgRef.current.getBoundingClientRect(); return { x:((e.clientX-r.left)/r.width)*size, y:((e.clientY-r.top)/r.height)*size }; };
  const clamp=(v)=>Math.max(nodeR+4,Math.min(size-nodeR-4,v));

  // 双方向を別々に持つ：A側の関係とB側の関係をひとつの線にまとめる
  const relOf=(aId,bId)=>{ const a=data.characters.find(c=>c.id===aId); return a?a.relatedCharacters.find(r=>r.charId===bId):null; };
  const edges=[]; const seen=new Set();
  chars.forEach(c=>{ c.relatedCharacters.forEach(rel=>{
    if(!pos[rel.charId]) return;
    const key=[c.id,rel.charId].sort().join("|"); if(seen.has(key)) return; seen.add(key);
    const [aId,bId]=key.split("|");
    const ra=relOf(aId,bId), rb=relOf(bId,aId);
    const tA=data.relationTypes.find(t=>t.id===(ra&&ra.relTypeId));
    const tB=data.relationTypes.find(t=>t.id===(rb&&rb.relTypeId));
    const textA=(ra&&ra.text)||"", textB=(rb&&rb.text)||"";
    const hasA=!!(tA||textA||(ra&&ra.arrowOut));
    const hasB=!!(tB||textB||(rb&&rb.arrowOut));
    edges.push({ a:aId,b:bId,tA,tB,textA,textB,hasA,hasB,
      outA: ra&&ra.arrowOut!==undefined ? !!ra.arrowOut : !!tA,
      outB: rb&&rb.arrowOut!==undefined ? !!rb.arrowOut : !!tB,
      lineA:(ra&&ra.lineStyle)||"solid", lineB:(rb&&rb.lineStyle)||"solid" });
  }); });
  const isDim=(id)=>selectedId&&id!==selectedId&&!edges.some(e=>(e.a===selectedId&&e.b===id)||(e.b===selectedId&&e.a===id));
  const edgeActive=(e)=>!selectedId||e.a===selectedId||e.b===selectedId;
  const selChar=selectedId?data.characters.find(c=>c.id===selectedId):null;
  const moved=Object.keys(saved).length>0;

  // 向きごとに1本ずつ、平行に少しずらして引く
  const EdgeLabel=({x,y,deg,color,name,text})=>{
    if(!name&&!text) return null;
    const a=((deg+180)%360+360)%360-180; const d=(a>90||a<-90)?a+180:a;
    const w=name?name.length*9+12:0;
    return (
      <g transform={`rotate(${d.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}>
        {name&&<><rect x={x-w/2} y={y-8} width={w} height={16} rx={8} fill={C.surface} stroke={color} strokeWidth="0.7"/>
          <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={color} fontWeight="600">{name}</text></>}
        {text&&<text x={x} y={y+(name?17:1)} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill={C.sub}>{text}</text>}
      </g>
    );
  };

  return (
    <div style={{ flex:1,overflowY:"auto",padding:12 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8 }}>
        <span style={{ fontFamily:C.display,fontSize:15,color:C.text,flexShrink:0 }}>相関図</span>
        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          {moved&&<Btn small variant="ghost" onClick={onResetNodes}>整列に戻す</Btn>}
          <select value={groupFilter} onChange={e=>{setGroupFilter(e.target.value);setSelectedId(null);}} style={{ ...IS(),width:"auto",maxWidth:160,padding:"6px 10px",fontSize:13 }}>
            <option value="">すべての人物</option>
            {data.groups.map(g=><option key={g.id} value={g.id}>{g.name||"（無名）"}</option>)}
          </select>
        </div>
      </div>
      {chars.length<2?<div style={{ textAlign:"center",padding:"50px 20px",color:C.hint,fontSize:13 }}>人物を2人以上登録すると<br/>相関図が表示されます</div>:<>
      <div style={{ background:C.surface,borderRadius:14,border:`0.5px solid ${C.border}`,marginBottom:8 }}>
        <svg ref={svgRef} width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display:"block",touchAction:"none" }} onClick={e=>{ if(e.target.tagName==="svg") setSelectedId(null); }}>
          <defs>
            {data.relationTypes.map(t=>(<marker key={t.id} id={`ah_${t.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill={t.color}/></marker>))}
            <marker id="ah_plain" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill={C.hint}/></marker>
          </defs>
          {edges.map((e,i)=>{ const pa=pos[e.a],pb=pos[e.b]; const act=edgeActive(e);
            const dx=pb.x-pa.x, dy=pb.y-pa.y, len=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/len, uy=dy/len;
            const nx=-uy, ny=ux;                                   // 線に垂直な向き
            const sides=[];
            if(e.hasA) sides.push({ from:pa,to:pb,type:e.tA,text:e.textA,arrow:e.outA,line:e.lineA,sign:1 });
            if(e.hasB) sides.push({ from:pb,to:pa,type:e.tB,text:e.textB,arrow:e.outB,line:e.lineB,sign:-1 });
            const off = sides.length>1 ? 5 : 0;
            const sw  = act&&selectedId?2:1.4;
            // 両方が同じ関係なら、丸いラベルは真ん中に1つだけ
            const sameType = !!(e.tA&&e.tB&&e.tA.id===e.tB.id);
            const baseMid = { x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2 };
            const baseDeg = Math.atan2(pb.y-pa.y,pb.x-pa.x)*180/Math.PI;
            return (<g key={i} opacity={act?(selectedId?1:0.72):0.12}>
              {sides.length===0&&<line x1={pa.x+ux*(nodeR+3)} y1={pa.y+uy*(nodeR+3)} x2={pb.x-ux*(nodeR+3)} y2={pb.y-uy*(nodeR+3)} stroke={C.border} strokeWidth={sw}/>}
              {sides.map((sd,k)=>{
                const ox=nx*off*sd.sign, oy=ny*off*sd.sign;
                const fx=sd.from.x+ox, fy=sd.from.y+oy, tx=sd.to.x+ox, ty=sd.to.y+oy;
                const ddx=tx-fx, ddy=ty-fy, dl=Math.sqrt(ddx*ddx+ddy*ddy)||1, dux=ddx/dl, duy=ddy/dl;
                const x1=fx+dux*(nodeR+3), y1=fy+duy*(nodeR+3), x2=tx-dux*(nodeR+3), y2=ty-duy*(nodeR+3);
                const col=sd.type?sd.type.color:C.hint;
                const mid={x:(x1+x2)/2,y:(y1+y2)/2};
                const deg=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
                const mk=sd.type?`ah_${sd.type.id}`:"ah_plain";
                return (<g key={k}>
                  {sd.line==="double"
                    ? <><line x1={x1+nx*1.6} y1={y1+ny*1.6} x2={x2+nx*1.6} y2={y2+ny*1.6} stroke={col} strokeWidth={sw}/>
                        <line x1={x1-nx*1.6} y1={y1-ny*1.6} x2={x2-nx*1.6} y2={y2-ny*1.6} stroke={col} strokeWidth={sw} markerEnd={sd.arrow?`url(#${mk})`:undefined}/></>
                    : <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={sw} strokeDasharray={sd.line==="dashed"?"6 4":undefined} markerEnd={sd.arrow?`url(#${mk})`:undefined}/>}
                  {(sd.line==="heart"||sd.line==="cross")&&<>
                    <circle cx={mid.x} cy={mid.y} r="7.5" fill={C.surface} stroke={col} strokeWidth="0.7"/>
                    <text x={mid.x} y={mid.y+0.5} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={col}>{sd.line==="heart"?"♥":"✕"}</text>
                  </>}
                  {act&&(()=>{
                    const glyph = sd.line==="heart"||sd.line==="cross";
                    const push  = sameType ? 15 : (glyph ? 14 : 0);   // 中央のラベルや記号を避ける
                    return <EdgeLabel
                      x={mid.x+nx*push*sd.sign} y={mid.y+ny*push*sd.sign} deg={deg} color={col}
                      name={sameType?"":(sd.type?sd.type.name:"")} text={sd.text}/>;
                  })()}
                </g>);
              })}
              {act&&sameType&&<EdgeLabel x={baseMid.x} y={baseMid.y} deg={baseDeg} color={e.tA.color} name={e.tA.name} text=""/>}
            </g>); })}
          {chars.map(c=>{ const p=pos[c.id]; const dim=isDim(c.id); const sel=c.id===selectedId; return (
            <g key={c.id} style={{ cursor:"grab",touchAction:"none" }} opacity={dim?0.25:1}
              onPointerDown={ev=>{ ev.currentTarget.setPointerCapture(ev.pointerId); dragRef.current={id:c.id,moved:false}; }}
              onPointerMove={ev=>{ const d=dragRef.current; if(!d||d.id!==c.id) return; ev.preventDefault(); const q=toSvg(ev); d.moved=true; setDrafts(prev=>({...prev,[c.id]:{x:clamp(q.x)/size,y:clamp(q.y)/size}})); }}
              onPointerUp={ev=>{ const d=dragRef.current; dragRef.current=null; if(!d) return;
                if(d.moved){ setDrafts(prev=>{ const q=prev[c.id]; if(q&&onMoveNodes) onMoveNodes({[c.id]:q}); const n={...prev}; delete n[c.id]; return n; }); }
                else setSelectedId(sel?null:c.id); }}>
              {sel&&<circle cx={p.x} cy={p.y} r={nodeR+4} fill="none" stroke={C.accent} strokeWidth="2"/>}
              <circle cx={p.x} cy={p.y} r={nodeR} fill={(c.imageColor||"#8EA3C3")} opacity={0.9}/>
              {c.image
                ? <image href={c.image} x={p.x-nodeR} y={p.y-nodeR} width={nodeR*2} height={nodeR*2} clipPath={`circle(${nodeR}px at ${nodeR}px ${nodeR}px)`} preserveAspectRatio="xMidYMid slice"/>
                : <text x={p.x} y={p.y+1} textAnchor="middle" dominantBaseline="middle" fontSize={nodeR*0.75} fill="#fff" fontWeight="700">{charInitial(c)}</text>}
              <text x={p.x} y={p.y+nodeR+12} textAnchor="middle" fontSize="10" fill={C.text} fontWeight={sel?"700":"500"}>{charName(c).slice(0,6)}</text>
            </g>
          ); })}
        </svg>
      </div>
      <div style={{ textAlign:"center",fontSize:10.5,color:C.hint,padding:"0 0 10px" }}>ドラッグで配置を変えられます · タップで関係を表示</div>
      {selChar?(
        <div style={{ background:C.surface,borderRadius:14,border:`0.5px solid ${C.border}`,padding:"12px 14px" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
            {selChar.image?<img src={selChar.image} style={{ width:32,height:32,borderRadius:"50%",objectFit:"cover" }}/>:<div style={{ width:32,height:32,borderRadius:"50%",background:(selChar.imageColor||"#ccc")+"30",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico n="person" s={16} c={selChar.imageColor||C.hint}/></div>}
            <span style={{ fontFamily:C.display,fontSize:15,color:C.text }}>{charName(selChar)}</span>
            <div style={{ marginLeft:"auto" }}><Btn small icon="person" onClick={()=>onOpenChar&&onOpenChar(selChar)}>ページ</Btn></div>
          </div>
          {selChar.relatedCharacters.length===0?<div style={{ fontSize:12,color:C.hint,padding:"6px 0" }}>関係がまだありません</div>:
            selChar.relatedCharacters.map(rel=>{ const other=data.characters.find(c=>c.id===rel.charId); if(!other) return null;
              const tA=data.relationTypes.find(t=>t.id===rel.relTypeId);
              const back=other.relatedCharacters.find(r=>r.charId===selChar.id);
              const tB=data.relationTypes.find(t=>t.id===(back&&back.relTypeId));
              return (
              <div key={rel.charId} style={{ display:"flex",alignItems:"center",gap:9,padding:"9px 0",borderBottom:`0.5px solid ${C.borderL}` }}>
                <div style={{ width:30,height:30,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:(other.imageColor||"#ccc")+"26",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  {other.image?<img src={other.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<span style={{ fontFamily:C.display,fontSize:13,color:other.imageColor||C.hint }}>{charInitial(other)}</span>}
                </div>
                <div style={{ minWidth:0,flex:1 }}>
                  <div style={{ fontSize:13.5,color:C.text,marginBottom:3 }}>{charName(other)}</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:4,alignItems:"center" }}>
                    <span style={{ fontSize:10,color:C.hint }}>→</span>{(rel.text||tA)?<Tag label={rel.text||tA.name} color={tA?tA.color:null}/>:<span style={{ fontSize:10.5,color:C.hint }}>未設定</span>}
                    <span style={{ fontSize:10,color:C.hint,marginLeft:4 }}>←</span>{((back&&back.text)||tB)?<Tag label={(back&&back.text)||tB.name} color={tB?tB.color:null}/>:<span style={{ fontSize:10.5,color:C.hint }}>未設定</span>}
                  </div>
                  {(rel.callName||rel.calledName)&&<div style={{ fontSize:11,color:C.sub,lineHeight:1.6,marginTop:3 }}>{rel.callName&&<span>「{rel.callName}」と呼ぶ</span>}{rel.callName&&rel.calledName&&<span style={{ color:C.hint }}> ／ </span>}{rel.calledName&&<span>「{rel.calledName}」と呼ばれる</span>}</div>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:2,flexShrink:0 }}>
                  <button onClick={()=>onEditRel&&onEditRel(selChar.id,other.id)} style={{ border:"none",background:"transparent",cursor:"pointer",padding:5,display:"flex" }}><Ico n="edit" s={14} c={C.sub}/></button>
                  <button onClick={()=>setSelectedId(other.id)} style={{ border:"none",background:"transparent",cursor:"pointer",padding:5,display:"flex" }}><Ico n="chevR" s={14} c={C.hint}/></button>
                </div>
              </div>
            ); })}
          <div style={{ paddingTop:10 }}>
            <AdditiveLinker available={data.characters.filter(c=>c.id!==selChar.id&&!selChar.relatedCharacters.some(r=>r.charId===c.id))} onAdd={id=>onEditRel&&onEditRel(selChar.id,id)} getLabel={charName} getColor={c=>c.imageColor} placeholder="この人物に関係を追加"/>
          </div>
        </div>
      ):(
        <div style={{ textAlign:"center",fontSize:11,color:C.hint,padding:"4px 0" }}>人物をタップすると関係の詳細が見られます</div>
      )}
      </>}
    </div>
  );
};

// ===================== GLOBAL SEARCH =====================
const SearchScreen = ({ data, onClose, onOpenItem }) => {
  const isDesktop=useIsDesktop();
  const [q,setQ]=useState("");
  const query=q.trim();
  const snip=(text,kw)=>{ if(!text) return ""; const i=text.indexOf(kw); if(i<0) return text.slice(0,40); const s=Math.max(0,i-20); return (s>0?"…":"")+text.slice(s,i+kw.length+20)+(i+kw.length+20<text.length?"…":""); };
  const results=[];
  if(query){
    const hit=(v)=>v&&String(v).includes(query);
    data.characters.forEach(c=>{ const fields=[["名前",charName(c)],["ふりがな",charFuri(c)],["備考",c.notes]]; const f=fields.find(([_,v])=>hit(v)); const pf=c.parameters.find(p=>hit(p.value)); if(f||pf){ const label=f?f[0]:(data.parameters.find(x=>x.id===pf.paramId)||{}).name||"パラメータ"; const text=f?f[1]:pf.value; results.push({type:"character",kind:"人物",icon:"person",color:"#E8916E",id:c.id,title:charName(c),label,snippet:snip(String(text),query),item:c}); } });
    data.groups.forEach(g=>{ const f=[["集団名",g.name],["説明",g.description],["備考",g.notes]].find(([_,v])=>hit(v)); if(f) results.push({type:"group",kind:"集団",icon:"group",color:"#D9618A",id:g.id,title:g.name||"（無名）",label:f[0],snippet:snip(String(f[1]),query),item:g}); });
    data.locations.forEach(l=>{ const f=[["場所名",l.name],["説明",l.description],["備考",l.notes]].find(([_,v])=>hit(v)); if(f) results.push({type:"location",kind:"場所",icon:"pin",color:"#4CAF82",id:l.id,title:l.name||"（無名）",label:f[0],snippet:snip(String(f[1]),query),item:l}); });
    data.scenes.forEach(s=>{ const f=[["タイトル",s.title],["脚本",s.script],["備考",s.notes]].find(([_,v])=>hit(v)); if(f) results.push({type:"scene",kind:"シーン",icon:"scene",color:"#5B9BD5",id:s.id,title:s.title||"（無題）",label:f[0],snippet:snip(String(f[1]),query),item:s}); });
    data.chapters.forEach(c=>{ const f=[["章タイトル",c.title],["備考",c.notes]].find(([_,v])=>hit(v)); if(f) results.push({type:"chapter",kind:"章",icon:"book",color:"#9B7DD4",id:c.id,title:c.title||"（無題）",label:f[0],snippet:snip(String(f[1]),query),item:c}); });
    data.terms.forEach(t=>{ const f=[["用語名",t.name],["説明",t.description],["備考",t.notes]].find(([_,v])=>hit(v)); if(f) results.push({type:"term",kind:"用語",icon:"term",color:"#C0392B",id:t.id,title:t.name||"（無名）",label:f[0],snippet:snip(String(f[1]),query),item:t}); });
  }
  const grouped={};
  results.forEach(r=>{ if(!grouped[r.kind]) grouped[r.kind]=[]; grouped[r.kind].push(r); });
  const Hi=({text})=>{ if(!query||!text.includes(query)) return <span>{text}</span>; const parts=text.split(query); return <span>{parts.map((p,i)=>(<React.Fragment key={i}>{p}{i<parts.length-1?<mark style={{ background:C.accent+"40",color:C.text,padding:"0 1px",borderRadius:2 }}>{query}</mark>:null}</React.Fragment>))}</span>; };
  return (
    <div style={{ position:"fixed",inset:0,zIndex:1500,background:C.bg,display:"flex",flexDirection:"column",maxWidth:isDesktop?780:480,margin:"0 auto",borderLeft:isDesktop?`0.5px solid ${C.border}`:"none",borderRight:isDesktop?`0.5px solid ${C.border}`:"none" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 12px 10px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="人物・シーン・用語などを横断検索..." style={{ ...IS(),background:C.bg }}/>
        <button onClick={onClose} style={{ border:"none",background:"transparent",cursor:"pointer",padding:6,display:"flex",flexShrink:0 }}><Ico n="x" s={20} c={C.sub}/></button>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"8px 12px 24px" }}>
        {!query?(
          <div style={{ textAlign:"center",padding:"50px 20px",color:C.hint }}><div style={{ opacity:0.25,marginBottom:10 }}><Ico n="term" s={38} c={C.sub}/></div><div style={{ fontSize:13 }}>作品全体から検索します</div><div style={{ fontSize:11.5,marginTop:6,lineHeight:1.7 }}>人物名・ふりがな・脚本本文・用語<br/>説明・備考・パラメータの値まで対象</div></div>
        ):results.length===0?(
          <div style={{ textAlign:"center",padding:"50px 20px",color:C.hint,fontSize:13 }}>「{query}」に一致する項目はありません</div>
        ):(
          <>
            <div style={{ fontSize:11,color:C.hint,padding:"6px 2px 10px" }}>{results.length}件</div>
            {Object.keys(grouped).map(kind=>(
              <div key={kind} style={{ marginBottom:16 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6,padding:"0 2px" }}>
                  <Ico n={grouped[kind][0].icon} s={13} c={grouped[kind][0].color}/>
                  <span style={{ fontSize:11.5,fontWeight:700,color:C.sub }}>{kind}</span>
                  <span style={{ fontSize:10,color:C.hint,background:C.tag,padding:"1px 6px",borderRadius:8 }}>{grouped[kind].length}</span>
                </div>
                {grouped[kind].map((r,i)=>(
                  <div key={r.type+r.id+i} onClick={()=>onOpenItem(r)} style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,padding:"11px 13px",marginBottom:6,cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start" }}>
                    <div style={{ width:32,height:32,borderRadius:9,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden" }}>
                      {r.type==="character"&&r.item.image?<img src={r.item.image} style={{ width:"100%",height:"100%",objectFit:"cover" }}/>:<Ico n={r.icon} s={15} c={r.color}/>}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13.5,fontWeight:600,color:C.text,marginBottom:2 }}><Hi text={r.title}/></div>
                      <div style={{ fontSize:11,color:C.hint,marginBottom:2 }}>{r.label}</div>
                      <div style={{ fontSize:11.5,color:C.sub,lineHeight:1.6,wordBreak:"break-all" }}><Hi text={r.snippet}/></div>
                    </div>
                    <div style={{ flexShrink:0,paddingTop:8 }}><Ico n="chevR" s={14} c={C.hint}/></div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ===================== WORD COUNT VIEW =====================
const WordCountView = ({ data }) => {
  const [mode,setMode]=useState("chapter");
  const sceneChars=(s)=>countChars(s.script);
  const total=data.scenes.reduce((sum,s)=>sum+sceneChars(s),0);
  const totalRaw=data.scenes.reduce((sum,s)=>sum+((s.script||"").length),0);
  const written=data.scenes.filter(s=>sceneChars(s)>0).length;

  const chapterRows=data.chapters.map(ch=>{ const scenes=ch.relatedScenes.map(id=>data.scenes.find(s=>s.id===id)).filter(Boolean); return { id:ch.id,name:ch.title||"（無題）",count:scenes.reduce((sum,s)=>sum+sceneChars(s),0),sub:`${scenes.length}シーン` }; });
  const unassigned=data.scenes.filter(s=>!s.relatedChapterId);
  if(unassigned.length>0) chapterRows.push({ id:"__none",name:"章未割り当て",count:unassigned.reduce((sum,s)=>sum+sceneChars(s),0),sub:`${unassigned.length}シーン`,muted:true });
  const sceneRows=data.scenes.map(s=>{ const ch=data.chapters.find(c=>c.id===s.relatedChapterId); return { id:s.id,name:s.title||"（無題）",count:sceneChars(s),sub:ch?ch.title||"（無題）":"未割り当て" }; });

  const rows=mode==="chapter"?chapterRows:sceneRows;
  const max=rows.reduce((m,r)=>Math.max(m,r.count),0)||1;
  const pages=Math.ceil(total/400);
  const sheets=Math.ceil(total/(20*20));

  return (
    <div style={{ flex:1,overflowY:"auto",padding:"0 12px 20px" }}>
      <div style={{ background:C.surface,borderRadius:14,border:`0.5px solid ${C.border}`,padding:"16px 14px",marginBottom:12 }}>
        <div style={{ fontSize:11,color:C.sub,fontWeight:600,letterSpacing:"0.4px",marginBottom:6 }}>作品の総文字数</div>
        <div style={{ display:"flex",alignItems:"baseline",gap:6,marginBottom:10 }}>
          <span style={{ fontSize:32,fontWeight:700,color:C.text,letterSpacing:-1 }}>{total.toLocaleString()}</span>
          <span style={{ fontSize:13,color:C.sub }}>字</span>
          <span style={{ fontSize:11,color:C.hint,marginLeft:4 }}>（空白込み {totalRaw.toLocaleString()}字）</span>
        </div>
        <div style={{ display:"flex",gap:14,flexWrap:"wrap",paddingTop:10,borderTop:`0.5px solid ${C.borderL}` }}>
          <div><div style={{ fontSize:10,color:C.hint,marginBottom:2 }}>原稿用紙</div><div style={{ fontSize:14,fontWeight:600,color:C.text }}>{sheets.toLocaleString()}<span style={{ fontSize:10,color:C.sub,fontWeight:400 }}> 枚</span></div></div>
          <div><div style={{ fontSize:10,color:C.hint,marginBottom:2 }}>文庫換算</div><div style={{ fontSize:14,fontWeight:600,color:C.text }}>{pages.toLocaleString()}<span style={{ fontSize:10,color:C.sub,fontWeight:400 }}> ページ</span></div></div>
          <div><div style={{ fontSize:10,color:C.hint,marginBottom:2 }}>執筆済シーン</div><div style={{ fontSize:14,fontWeight:600,color:C.text }}>{written}<span style={{ fontSize:10,color:C.sub,fontWeight:400 }}> / {data.scenes.length}</span></div></div>
        </div>
      </div>

      <Tabs tabs={[{key:"chapter",label:"章ごと"},{key:"scene",label:"シーンごと"}]} active={mode} onChange={setMode}/>

      {rows.length===0?<div style={{ textAlign:"center",padding:"40px 0",color:C.hint,fontSize:13 }}>{mode==="chapter"?"章がまだありません":"シーンがまだありません"}</div>:
        rows.map(r=>(
          <div key={r.id} style={{ background:C.surface,borderRadius:11,border:`0.5px solid ${C.border}`,padding:"11px 13px",marginBottom:6 }}>
            <div style={{ display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8,marginBottom:7 }}>
              <div style={{ minWidth:0,flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600,color:r.muted?C.sub:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.name}</div>
                <div style={{ fontSize:10.5,color:C.hint,marginTop:1 }}>{r.sub}</div>
              </div>
              <div style={{ flexShrink:0,textAlign:"right" }}>
                <span style={{ fontSize:14,fontWeight:700,color:C.text }}>{r.count.toLocaleString()}</span>
                <span style={{ fontSize:10,color:C.sub }}> 字</span>
                {total>0&&<div style={{ fontSize:10,color:C.hint }}>{Math.round(r.count/total*100)}%</div>}
              </div>
            </div>
            <div style={{ height:6,background:C.bg,borderRadius:3,overflow:"hidden" }}>
              <div style={{ width:`${Math.max(r.count/max*100,r.count>0?2:0)}%`,height:"100%",background:r.muted?C.hint:C.accent,borderRadius:3,transition:"width 0.3s" }}/>
            </div>
          </div>
        ))}
    </div>
  );
};

const TimelineView = ({ data }) => {
  const scenes=[...data.scenes].filter(s=>s.startDate).sort((a,b)=>(dayIndex(data,a.startDate)||0)-(dayIndex(data,b.startDate)||0));
  const groups=[];
  scenes.forEach(sc=>{ const last=groups[groups.length-1];
    if(last&&last.key===sc.startDate) last.items.push(sc); else groups.push({key:sc.startDate,items:[sc]}); });
  return (
    <div style={{ flex:1,overflowY:"auto",padding:16 }}>
      <div style={{ fontFamily:C.display,fontSize:15,color:C.text,marginBottom:14 }}>年表</div>
      {groups.length===0?<div style={{ textAlign:"center",padding:"40px 0",color:C.hint,fontSize:13 }}>日付が入ったシーンがここに並びます</div>:
      groups.map((g,gi)=>(
        <div key={g.key+gi} style={{ display:"flex",gap:12,marginBottom:10 }}>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,paddingTop:4 }}>
            <div style={{ width:g.items.length>1?11:8,height:g.items.length>1?11:8,borderRadius:"50%",background:C.accent,flexShrink:0,border:g.items.length>1?`2px solid ${C.bg}`:"none",boxShadow:g.items.length>1?`0 0 0 1.5px ${C.accent}`:"none" }}/>
            {gi<groups.length-1&&<div style={{ width:1,flex:1,background:C.border,marginTop:4 }}/>}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"baseline",gap:7,marginBottom:5 }}>
              <span style={{ fontSize:11.5,color:C.sub,fontWeight:600 }}>{dateLabel(data,g.key)}</span>
              {g.items.length>1&&<span style={{ fontSize:10,color:C.accent,border:`0.5px solid ${C.accent}`,borderRadius:20,padding:"0 7px" }}>同日 {g.items.length}件</span>}
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:6,borderLeft:g.items.length>1?`2px solid ${C.border}`:"none",paddingLeft:g.items.length>1?10:0 }}>
              {g.items.map(sc=>{ const chap=data.chapters.find(c=>c.id===sc.relatedChapterId); const chars=sc.relatedCharacters.map(id=>data.characters.find(c=>c.id===id)).filter(Boolean); return (
                <div key={sc.id} style={{ background:C.surface,borderRadius:11,padding:"10px 12px",border:`0.5px solid ${C.border}` }}>
                  {sc.endDate&&sc.endDate!==sc.startDate&&<div style={{ fontSize:10,color:C.hint,marginBottom:2 }}>→ {dateLabel(data,sc.endDate)}</div>}
                  <div style={{ fontFamily:C.display,fontSize:14,color:C.text,marginBottom:5 }}>{sc.title||"（無題）"}</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:3 }}>{chap&&<Tag label={chap.title||"（無題）"}/>}{chars.map(ch=><Tag key={ch.id} label={charName(ch)} color={ch.imageColor}/>)}</div>
                </div>
              ); })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const HelpBlock = ({ title, children }) => (
  <div style={{ marginBottom:16 }}>
    <div style={{ fontFamily:C.display,fontSize:14,color:C.text,marginBottom:5 }}>{title}</div>
    <div style={{ fontSize:12.5,color:C.sub,lineHeight:1.95 }}>{children}</div>
  </div>
);

const CalendarSettings = ({ data, upd }) => {
  const cal=data.calendar;
  const [help,setHelp]=useState(false);
  const set=(patch)=>upd(p=>({...p,calendar:{...p.calendar,...patch}}));
  const setMonth=(i,patch)=>set({months:cal.months.map((m,j)=>j===i?{...m,...patch}:m)});
  const yd=calYearDays(cal);
  return (
    <div style={{ flex:1,overflowY:"auto",padding:16 }}>
      <div style={{ maxWidth:620,margin:"0 auto" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
          <span style={{ fontFamily:C.display,fontSize:17,color:C.text }}>暦と元号</span>
          <button onClick={()=>setHelp(true)} style={{ display:"flex",alignItems:"center",gap:4,border:`0.5px solid ${C.border}`,background:"transparent",borderRadius:20,padding:"4px 10px 4px 8px",cursor:"pointer",fontFamily:"inherit" }}>
            <Ico n="info" s={14} c={C.sub}/><span style={{ fontSize:11.5,color:C.sub }}>使い方</span>
          </button>
        </div>
        <div onClick={()=>set({enabled:!cal.enabled})} style={{ display:"flex",alignItems:"flex-start",gap:11,padding:14,borderRadius:12,border:`1.5px solid ${cal.enabled?C.accent:C.border}`,background:cal.enabled?C.accent+"12":C.surface,cursor:"pointer",marginBottom:16 }}>
          <div style={{ width:22,height:22,borderRadius:6,border:`1.5px solid ${cal.enabled?C.accent:C.border}`,background:cal.enabled?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>{cal.enabled?<Ico n="check" s={14} c={C.accentFg}/>:null}</div>
          <div>
            <div style={{ fontSize:14,fontWeight:600,color:C.text,marginBottom:3 }}>この作品は独自の暦を使う</div>
            <div style={{ fontSize:11.5,color:C.sub,lineHeight:1.7 }}>ONにすると、誕生日やシーンの日付が下で決めた暦で入力・表示されます。年齢の自動計算も、この暦で行われます。OFFなら現実のカレンダーのままです。</div>
          </div>
        </div>

        {cal.enabled&&<>
          <Inp label="基準の暦の名前" value={cal.yearLabel} onChange={v=>set({yearLabel:v})} placeholder="例：帝暦（空でも可）"/>

          <Field label="表示のしかた">
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6 }}>
              {[["both","併記"],["era","元号だけ"],["base","基準暦だけ"]].map(([v,l])=>(
                <button key={v} onClick={()=>set({display:v})} style={{ padding:"10px 4px",borderRadius:10,border:`1.5px solid ${cal.display===v?C.accent:C.border}`,background:cal.display===v?C.accent+"12":"transparent",color:cal.display===v?C.accent:C.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,marginTop:8 }}>例：{dateLabel(data,`${(cal.eras[0]&&cal.eras[0].y)||1}-01-01`)}</div>
          </Field>

          <Divider/>
          <Lbl>月の並び（1年 = {yd}日）</Lbl>
          <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,margin:"0 0 10px" }}>月ごとに日数を変えられます。名前は「霜の月」のように自由に付けられます。</div>
          {cal.months.map((m,i)=>(
            <div key={i} style={{ display:"flex",gap:6,alignItems:"center",marginBottom:6 }}>
              <span style={{ fontSize:11,color:C.hint,width:22,flexShrink:0,textAlign:"right" }}>{i+1}</span>
              <input value={m.name} onChange={e=>setMonth(i,{name:e.target.value})} placeholder={`${i+1}月`} style={{ ...IS(),flex:1,padding:"8px 10px" }}/>
              <input type="number" inputMode="numeric" value={m.days} onChange={e=>setMonth(i,{days:Math.max(1,Number(e.target.value)||1)})} style={{ ...IS(),flex:"0 0 72px",padding:"8px 8px",textAlign:"center" }}/>
              <span style={{ fontSize:11,color:C.hint,flexShrink:0 }}>日</span>
              <button onClick={()=>set({months:cal.months.filter((_,j)=>j!==i)})} disabled={cal.months.length<=1} style={{ border:"none",background:"transparent",cursor:cal.months.length<=1?"default":"pointer",padding:5,opacity:cal.months.length<=1?0.15:0.4,flexShrink:0 }}><Ico n="x" s={14} c={C.text}/></button>
            </div>
          ))}
          <div style={{ display:"flex",gap:8,marginTop:8 }}>
            <Btn small icon="plus" onClick={()=>set({months:[...cal.months,{name:`${cal.months.length+1}月`,days:30}]})}>月を追加</Btn>
            <Btn small variant="ghost" onClick={()=>{ const d=Number(cal.months[0]?cal.months[0].days:30)||30; set({months:cal.months.map(m=>({...m,days:d}))}); }}>日数を1つ目に揃える</Btn>
          </div>

          <Divider/>
          <Lbl>元号</Lbl>
          <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,margin:"0 0 10px" }}>始まった日を決めると、そこから先の日付が自動でその元号で表示されます。年の途中で改元しても正しく数えます。</div>
          {cal.eras.length===0&&<div style={{ fontSize:12,color:C.hint,padding:"4px 0 10px" }}>元号はまだありません。無くてもかまいません。</div>}
          {cal.eras.map((e,i)=>(
            <div key={e.id} style={{ border:`0.5px solid ${C.border}`,borderRadius:11,padding:"11px 12px",marginBottom:8 }}>
              <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
                <input value={e.name} onChange={ev=>set({eras:cal.eras.map((x,j)=>j===i?{...x,name:ev.target.value}:x)})} placeholder="元号の名前" style={{ ...IS(),flex:1,padding:"8px 10px" }}/>
                <button onClick={()=>set({eras:cal.eras.filter((_,j)=>j!==i)})} style={{ border:"none",background:"transparent",cursor:"pointer",padding:5,opacity:0.4,flexShrink:0 }}><Ico n="trash" s={14} c={C.text}/></button>
              </div>
              <Lbl>始まりの日</Lbl>
              <div style={{ display:"flex",gap:6 }}>
                <input type="number" inputMode="numeric" value={e.y} onChange={ev=>set({eras:cal.eras.map((x,j)=>j===i?{...x,y:Number(ev.target.value)||0}:x)})} style={{ ...IS(),flex:"0 0 78px",padding:"8px 8px" }}/>
                <select value={e.m} onChange={ev=>set({eras:cal.eras.map((x,j)=>j===i?{...x,m:Number(ev.target.value)}:x)})} style={{ ...IS(),flex:1,padding:"8px 8px",cursor:"pointer" }}>{cal.months.map((m,j)=><option key={j} value={j+1}>{m.name||`${j+1}月`}</option>)}</select>
                <select value={e.d} onChange={ev=>set({eras:cal.eras.map((x,j)=>j===i?{...x,d:Number(ev.target.value)}:x)})} style={{ ...IS(),flex:"0 0 84px",padding:"8px 8px",cursor:"pointer" }}>{Array.from({length:(cal.months[e.m-1]||{days:30}).days},(_,k)=><option key={k} value={k+1}>{k+1}日</option>)}</select>
              </div>
            </div>
          ))}
          <Btn small icon="plus" onClick={()=>set({eras:[...cal.eras,{id:uid(),name:"",y:1,m:1,d:1}]})}>元号を追加</Btn>

          <Divider/>
          <div style={{ fontSize:11,color:C.hint,lineHeight:1.9,background:C.bg,borderRadius:10,padding:"12px 13px" }}>
            すでに入っている日付は「年-月-日」の数字として読み替えられます。月の数を減らすと、それより後ろの月に入っていた日付は表示が崩れるので、暦を先に決めてから日付を入れるのが安全です。
          </div>
        </>}
      </div>

      {help&&(
        <Modal title="暦と元号の使い方" onClose={()=>setHelp(false)} footer={<><div style={{ flex:1 }}/><Btn variant="primary" onClick={()=>setHelp(false)}>閉じる</Btn></>}>
          <HelpBlock title="そもそも、何のため？">
            ふつうの日付入力は現実のカレンダーです。1月から12月まで、2月は28日。でもファンタジーの世界に「1月」はありませんよね。<br/><br/>
            かといって自由に文字で書けるようにすると、今度は<b>アプリが日付として理解できなくなります</b>。「霜の月3日」と「芽の月20日」、どちらが先か分からない。年表も並べられないし、年齢も計算できません。<br/><br/>
            そこで<b>あなたの世界の暦を、アプリに教えてあげる</b>のがこの機能です。
          </HelpBlock>

          <HelpBlock title="教えるのは「月の並びと長さ」だけ">
            たとえばこう決めたとします。
            <div style={{ background:C.bg,borderRadius:10,padding:"10px 13px",margin:"8px 0",fontSize:12.5,lineHeight:2,color:C.text }}>
              霜の月 … 30日<br/>芽の月 … 40日<br/>灯の月 … 30日
            </div>
            これで<b>1年 = 100日の世界</b>ができました。本当にこれだけです。
          </HelpBlock>

          <HelpBlock title="アプリが裏でやっていること">
            アプリは日付を「<b>世界がはじまってから何日目か</b>」という数字に直しています。<br/><br/>
            「2年目の 芽の月 5日」なら…
            <div style={{ background:C.bg,borderRadius:10,padding:"10px 13px",margin:"8px 0",fontSize:12.5,lineHeight:2,color:C.text }}>
              1年目が丸ごと終わっている … 100日<br/>
              2年目、霜の月が終わっている … 30日<br/>
              芽の月の5日目 … 4日<br/>
              <span style={{ color:C.accent }}>合計 134日目</span>
            </div>
            この数字ひとつにしてしまえば、あとは足し算と引き算だけです。年表は数字の小さい順に並べるだけ。年齢は「シーンの日 − 誕生日 ÷ 1年の日数」。<br/><br/>
            だから<b>月の長さがバラバラでも、何も狂いません</b>。
          </HelpBlock>

          <HelpBlock title="元号は「年のあだ名」">
            日本でいう平成・令和です。<b>始まった日を教えるだけ</b>。<br/><br/>
            「動乱期は 512年 霜の月 1日から」と登録すると、こう表示されます。
            <div style={{ background:C.bg,borderRadius:10,padding:"10px 13px",margin:"8px 0",fontSize:12.5,lineHeight:2,color:C.text }}>
              511年 … 元号なし（帝暦511年）<br/>512年 … 動乱期 <b>元年</b><br/>514年 … 動乱期 <b>3年</b>
            </div>
            同じ日を2通りに呼べるようになるだけで、中の数字は変わりません。だから元号をまたいでも年齢計算は狂いません。「動乱期に生まれ、新王朝暦12年に死んだ」も平気です。<br/><br/>
            <b>元号は使わなくてもかまいません。</b>「帝暦514年」だけで足りるなら、それで十分です。
          </HelpBlock>

          <HelpBlock title="表示の3つは、ただの見た目">
            同じ日を、どう書くか選ぶだけです。
            <div style={{ background:C.bg,borderRadius:10,padding:"10px 13px",margin:"8px 0",fontSize:12,lineHeight:2,color:C.text }}>
              併記 … 動乱期3年 芽の月8日（帝暦514年 芽の月8日）<br/>
              元号だけ … 動乱期3年 芽の月8日<br/>
              基準暦だけ … 帝暦514年 芽の月8日
            </div>
          </HelpBlock>

          <HelpBlock title="使うときの順番">
            <div style={{ lineHeight:2.1 }}>
              1. このページのスイッチをONにする<br/>
              2. 月を並べる（名前と日数）<br/>
              3. 元号を足す（要らなければ飛ばす）<br/>
              4. 人物やシーンに日付を入れる
            </div>
            <br/>
            <b>2を先にやってください。</b>あとから月を減らすと、その月に入れていた日付の行き場がなくなって、表示が崩れます。
          </HelpBlock>

          <HelpBlock title="すでに入れた日付はどうなる？">
            2007-11-03 のような日付は「2007年 11月 3日」として読み替えられます。月の名前は新しい暦のものに変わります。数が少ないうちは、入れ直したほうが早いかもしれません。
          </HelpBlock>

          <div style={{ fontSize:11.5,color:C.hint,lineHeight:1.9,background:C.bg,borderRadius:10,padding:"12px 13px" }}>
            暦は作品ごとの設定です。現代物とファンタジーを同じアカウントで並行して書けます。閏年のしくみは今のところありません。
          </div>
        </Modal>
      )}
    </div>
  );
};


// ===================== SAMPLE STORY =====================
// 初めてログインした人に、暦と相関図が入った状態の見本を1つだけ用意する
const buildSample = () => {
  const id = (n)=>`s_${n}`;
  const gM=id("gM"), gF=id("gF"), gO=id("gO");
  const rTwin=id("rTwin"), rMaster=id("rMaster"), rLove=id("rLove"), rHate=id("rHate");
  const c1=id("c1"), c2=id("c2"), c3=id("c3");
  const grp1=id("grp1"), loc1=id("loc1"), loc2=id("loc2"), term1=id("term1");
  const ch1=id("ch1"), sc1=id("sc1"), sc2=id("sc2"), sc3=id("sc3");
  const pHeight=id("pHeight"), pFood=id("pFood");
  const ab1=id("ab1"), ab2=id("ab2"), ab3=id("ab3");
  const stage=(name,v)=>({id:uid(),name,abilities:[{paramId:ab1,value:v[0]},{paramId:ab2,value:v[1]},{paramId:ab3,value:v[2]}]});
  return norm({
    storyTitle:"見本：夜明けの断片",
    storySynopsis:"これは使い方を見てもらうための見本です。自由に書き換えても、まるごと削除してもかまいません。\n独自の暦・元号・相関図・能力値が、ひと通り入った状態にしてあります。",
    calendar:{
      enabled:true, yearLabel:"帝暦", display:"both",
      months:[{name:"霜の月",days:30},{name:"芽の月",days:40},{name:"灯の月",days:30}],
      eras:[{id:id("e1"),name:"旧王朝暦",y:1,m:1,d:1},{id:id("e2"),name:"動乱期",y:512,m:1,d:1}],
    },
    genders:[{id:gM,name:"男性",color:"#5B9BD5"},{id:gF,name:"女性",color:"#D9618A"},{id:gO,name:"その他",color:"#888888"}],
    relationTypes:[{id:rTwin,name:"双子",color:"#8A6D3B"},{id:rMaster,name:"師",color:"#4CAF82"},{id:rLove,name:"想い",color:"#D9618A"},{id:rHate,name:"わだかまり",color:"#C0392B"}],
    parameters:[{id:pHeight,name:"身長",description:"数字で入れると身長順に並べ替えられます"},{id:pFood,name:"好きなもの",description:""}],
    abilityParams:[{id:ab1,name:"曜力",applyAll:true},{id:ab2,name:"剣",applyAll:true},{id:ab3,name:"知",applyAll:true}],
    characters:[
      { id:c1, lastName:"水無瀬", firstName:"縁", lastNameFuri:"みなせ", firstNameFuri:"ゆかり", nameOrder:"last_first",
        genderId:gF, imageColor:"#8A6D3B", birthday:"512-01-03", deathDate:"", 
        notes:"花師の末裔。眠たげな藍色の瞳。物静かだが、芯のところは誰より頑固。",
        relatedCharacters:[
          {charId:c2,relTypeId:rTwin,callName:"兄さん",calledName:"縁",arrowOut:true,lineStyle:"double",direction:"both",text:""},
          {charId:c3,relTypeId:rMaster,callName:"灯様",calledName:"縁ちゃん",arrowOut:true,lineStyle:"solid",direction:"both",text:"頭が上がらない"},
        ],
        relatedGroups:[{groupId:grp1,position:"花師"}], relatedTerms:[term1],
        parameters:[{paramId:pHeight,value:"156cm"},{paramId:pFood,value:"彼岸花"}],
        abilityStages:[stage("序盤",[45,20,60]),stage("帝都にて",[75,30,80])] },
      { id:c2, lastName:"柊", firstName:"澪", lastNameFuri:"ひいらぎ", firstNameFuri:"みお", nameOrder:"last_first",
        genderId:gM, imageColor:"#3B5BA8", birthday:"512-01-03", deathDate:"",
        notes:"縁の双子の兄。剣を持って前に立つが、口数は少ない。",
        relatedCharacters:[
          {charId:c1,relTypeId:rTwin,callName:"縁",calledName:"兄さん",arrowOut:true,lineStyle:"double",direction:"both",text:""},
          {charId:c3,relTypeId:rHate,callName:"あの人",calledName:"澪くん",arrowOut:true,lineStyle:"dashed",direction:"both",text:"信じきれない"},
        ],
        relatedGroups:[{groupId:grp1,position:"護衛"}], relatedTerms:[term1],
        parameters:[{paramId:pHeight,value:"174cm"},{paramId:pFood,value:"干し肉"}],
        abilityStages:[stage("序盤",[20,70,45]),stage("帝都にて",[25,88,50])] },
      { id:c3, lastName:"遠野", firstName:"灯", lastNameFuri:"とおの", firstNameFuri:"あかり", nameOrder:"last_first",
        genderId:gF, imageColor:"#4CAF82", birthday:"492-02-18", deathDate:"",
        notes:"帝都の薬師。双子の師にあたる。何を知っていて黙っているのか、まだ誰も知らない。",
        relatedCharacters:[
          {charId:c1,relTypeId:rMaster,callName:"縁ちゃん",calledName:"灯様",arrowOut:true,lineStyle:"solid",direction:"both",text:"見守っている"},
          {charId:c2,relTypeId:"",callName:"澪くん",calledName:"あの人",arrowOut:false,lineStyle:"dashed",direction:"both",text:""},
        ],
        relatedGroups:[], relatedTerms:[term1],
        parameters:[{paramId:pHeight,value:"168cm"},{paramId:pFood,value:"薬草茶"}],
        abilityStages:[stage("帝都にて",[90,10,95])] },
    ],
    groups:[{ id:grp1, name:"白霧の民", description:"辺境の村で伝承を守ってきた一族。", notes:"",
      relatedCharacters:[c1,c2], memberNotes:{[c1]:"花師",[c2]:"護衛"} }],
    locations:[
      { id:loc1, name:"白霧の辺境村", description:"年じゅう白い霧に沈んでいる集落。", notes:"" },
      { id:loc2, name:"帝都 薬草街", description:"薬師たちの問屋が軒を連ねる、湿った路地。", notes:"" },
    ],
    terms:[{ id:term1, name:"曜力", description:"花や万物に宿るとされる、記憶のような力。第二層まで届く者は少ない。", relatedCharacters:[c1], notes:"" }],
    chapters:[{ id:ch1, title:"第一章　残響の芽吹き", notes:"旅立ちから帝都到着まで。", relatedScenes:[sc1,sc2,sc3] }],
    nowDate:"531-02-20",
    scenes:[
      { id:sc1, title:"旅立ちの朝", startDate:"531-01-01", endDate:"", relatedChapterId:ch1, relatedLocationId:loc1,
        script:"霧の晴れ間から、朝日が差し込む。\n「準備はできたかい、縁」\n「……うん、兄さん」",
        notes:"", relatedCharacters:[c1,c2], relatedTerms:[term1] },
      { id:sc2, title:"薬草街の再会", startDate:"531-02-10", endDate:"", relatedChapterId:ch1, relatedLocationId:loc2,
        script:"薬草の匂いが鼻を刺す路地の奥で、遠野灯は待っていた。",
        notes:"同じ日にもう一場面あります。年表で束ねて表示されます。", relatedCharacters:[c1,c2,c3], relatedTerms:[] },
      { id:sc3, title:"その夜、屋根の上で", startDate:"531-02-10", endDate:"", relatedChapterId:ch1, relatedLocationId:loc2,
        script:"「あの人を、まだ信じきれない」\n澪の声は、瓦の上を滑って消えた。",
        notes:"", relatedCharacters:[c2], relatedTerms:[] },
    ],
  });
};

// ===================== STORY EDITOR =====================
function StoryEditor({ data, setData, onBack, saveStatus, saveError, online, onRetrySave, route, onNavigate }) {
  const [activeTab,setActiveTab]=useState("write");
  const [sub,setSub]=useState({write:"chapters",world:"groups"});
  const [deskView,setDeskView]=useState(null);
  const [defOpen,setDefOpen]=useState(false);
  const [defView,setDefView]=useState(null);
  const [modal,setModal]=useState(null);
  const [confirmBox,setConfirmBox]=useState(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [charViewId,setCharViewId]=useState((route&&route.charId)||null);
  const [charLayout,setCharLayout]=useState(localStorage.getItem("tl_charLayout")||"list");
  const [charSort,setCharSort]=useState({key:"manual",asc:true});
  const isDesktop=useIsDesktop();

  // URLの画面キーを、スマホのタブ／PCのサイドバー選択に翻訳する
  const applySection=(key,charId)=>{
    if(!key){ setDefView(null); setDeskView(null); setCharViewId(charId||null); return; }
    if(MORE.includes(key)){ setDefView(key); setDeskView(key); setCharViewId(null); return; }
    setDefView(null); setDeskView(key);
    const t=TABS.find(x=>x.view===key||(x.subs&&x.subs.includes(key)));
    if(t){ setActiveTab(t.key); if(t.subs) setSub(p=>({...p,[t.key]:key})); }
    setCharViewId(key==="characters"?(charId||null):null);
  };
  // 画面を移るときは、状態を変えると同時にURLも書き換える
  const goSection=(key,charId)=>{ applySection(key,charId); onNavigate&&onNavigate(key,charId||null); };
  const routeSec=route?route.section:null, routeChar=route?route.charId:null;
  // ブラウザの戻る/進むでURLが変わったら、その場所へ移る
  useEffect(()=>{ applySection(routeSec,routeChar); },[routeSec,routeChar]);
  const tabSection=(tabKey)=>{ const t=TABS.find(x=>x.key===tabKey)||TABS[0]; return t.subs?(sub[t.key]||t.subs[0]):t.view; };

  const openChar=(id)=>{ goSection("characters",id); };
  const importRef=useRef();
  const upd=useCallback(fn=>setData(p=>fn(p)),[setData]);
  const upsert=useCallback((key,item)=>upd(p=>{const l=[...p[key]];const i=l.findIndex(x=>x.id===item.id);if(i>=0)l[i]=item;else l.push(item);return{...p,[key]:l};}),[upd]);
  const del=useCallback((key,id)=>{upd(p=>({...p,[key]:p[key].filter(x=>x.id!==id)}));setModal(null);if(key==="characters")setCharViewId(null);},[upd]);
  const moveEntity=useCallback((key,idx,dir)=>upd(p=>{const items=[...p[key]];const ni=idx+dir;if(ni<0||ni>=items.length) return p;[items[idx],items[ni]]=[items[ni],items[idx]];return{...p,[key]:items};}),[upd]);
  const setLayout=(v)=>{ setCharLayout(v); localStorage.setItem("tl_charLayout",v); };

  const exportData=useCallback(()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${data.storyTitle||"story"}_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);},[data]);
  const exportMarkdown=useCallback(()=>{
    let md=`# ${data.storyTitle||"ストーリー"}\n\n`;
    if(data.storySynopsis) md+=`## あらすじ\n\n${data.storySynopsis}\n\n`;
    if(data.characters.length){ md+=`---\n\n## 登場人物\n\n`; data.characters.forEach(c=>{ md+=`### ${charName(c)}\n\n`; const lines=[]; const g=data.genders.find(x=>x.id===c.genderId); if(g) lines.push(`**性別:** ${g.name}`); if(c.birthday) lines.push(`**誕生日:** ${c.birthday}`); if(c.deathDate) lines.push(`**死亡日:** ${c.deathDate}`); const grps=c.relatedGroups.map(r=>{const grp=data.groups.find(x=>x.id===r.groupId);return grp?(r.position?`${grp.name}（${r.position}）`:grp.name):null;}).filter(Boolean); if(grps.length) lines.push(`**所属:** ${grps.join("、")}`); const rels=c.relatedCharacters.map(r=>{const ch=data.characters.find(x=>x.id===r.charId);if(!ch) return null;let s=charName(ch);const sub=[r.callName&&`${r.callName}と呼ぶ`,r.calledName&&`${r.calledName}と呼ばれる`].filter(Boolean);if(sub.length) s+=`（${sub.join("・")}）`;return s;}).filter(Boolean); if(rels.length) lines.push(`**関連人物:** ${rels.join("、")}`); data.parameters.forEach(p=>{const pv=c.parameters.find(x=>x.paramId===p.id);if(pv&&pv.value) lines.push(`**${p.name}:** ${pv.value}`);}); const ab=c.abilities.map(a=>{const ap=data.abilityParams.find(x=>x.id===a.paramId);return ap?`${ap.name}: ${a.value}`:null;}).filter(Boolean); if(ab.length) lines.push(`**能力値:** ${ab.join(" / ")}`); if(lines.length) md+=lines.join("  \n")+"\n\n"; if(c.notes) md+=`${c.notes}\n\n`; }); }
    if(data.groups.length){ md+=`---\n\n## 集団\n\n`; data.groups.forEach(g=>{ md+=`### ${g.name||"（無名）"}\n\n`; if(g.description) md+=`${g.description}\n\n`; const m=g.relatedCharacters.map(id=>{const ch=data.characters.find(c=>c.id===id);return ch?charName(ch):null;}).filter(Boolean); if(m.length) md+=`**メンバー:** ${m.join("、")}\n\n`; if(g.notes) md+=`${g.notes}\n\n`; }); }
    if(data.locations.length){ md+=`---\n\n## 場所\n\n`; data.locations.forEach(l=>{ md+=`### ${l.name||"（無名）"}\n\n`; if(l.description) md+=`${l.description}\n\n`; if(l.notes) md+=`${l.notes}\n\n`; }); }
    if(data.terms.length){ md+=`---\n\n## 用語集\n\n`; data.terms.forEach(t=>{ md+=`### ${t.name||"（無名）"}\n\n`; if(t.description) md+=`${t.description}\n\n`; }); }
    if(data.chapters.length){ md+=`---\n\n## 章構成\n\n`; data.chapters.forEach((ch,idx)=>{ md+=`### ${ch.title||`第${idx+1}章`}\n\n`; const sc=ch.relatedScenes.map(id=>data.scenes.find(s=>s.id===id)).filter(Boolean); if(sc.length) md+=`**シーン:** ${sc.map(s=>s.title||"（無題）").join("、")}\n\n`; if(ch.notes) md+=`${ch.notes}\n\n`; }); }
    if(data.scenes.length){ md+=`---\n\n## シーン\n\n`; data.scenes.forEach(s=>{ md+=`### ${s.title||"（無題）"}\n\n`; const info=[]; if(s.startDate){let d=s.startDate;if(s.endDate&&s.endDate!==s.startDate)d+=` → ${s.endDate}`;info.push(`**日時:** ${d}`);} const chap=data.chapters.find(c=>c.id===s.relatedChapterId);if(chap) info.push(`**章:** ${chap.title||"（無題）"}`); const loc=data.locations.find(l=>l.id===s.relatedLocationId);if(loc) info.push(`**場所:** ${loc.name}`); const chars=s.relatedCharacters.map(id=>{const ch=data.characters.find(c=>c.id===id);return ch?charName(ch):null;}).filter(Boolean); if(chars.length) info.push(`**登場人物:** ${chars.join("、")}`); if(info.length) md+=info.join("  \n")+"\n\n"; if(s.notes) md+=`${s.notes}\n\n`; if(s.script) md+=`\`\`\`\n${s.script}\n\`\`\`\n\n`; }); }
    const blob=new Blob([md],{type:"text/markdown;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${data.storyTitle||"story"}.md`;a.click();URL.revokeObjectURL(url);
  },[data]);
  const handleImport=useCallback((e)=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try {
        const imported=norm(JSON.parse(ev.target.result));
        setConfirmBox({ title:"バックアップから復元", body:`この作品の中身を、選んだファイルの内容で上書きします。\n今の内容は元に戻せません。\n\n読み込むデータ：人物 ${imported.characters.length} / シーン ${imported.scenes.length} / 章 ${imported.chapters.length}`, okLabel:"復元する", run:()=>setData(imported) });
      } catch {
        setConfirmBox({ title:"読み込めませんでした", body:"JSONの形式が正しくないようです。このアプリで書き出したファイルか確認してください。", okLabel:"閉じる", safe:true, alone:true });
      }
    };
    reader.readAsText(file); e.target.value="";
  },[setData]);

  const saveChar=useCallback(ch=>{ upd(p=>{ const chars=[...p.characters]; const i=chars.findIndex(c=>c.id===ch.id); if(i>=0) chars[i]=ch; else chars.push(ch); const rev=d=>d==="to"?"from":d==="from"?"to":"both"; const syncedChars=chars.map(other=>{ if(other.id===ch.id) return other; const a=ch.relatedCharacters.find(r=>r.charId===other.id); const b=other.relatedCharacters.find(r=>r.charId===ch.id); if(a){ const recip={charId:ch.id,callName:a.calledName||"",calledName:a.callName||"",relTypeId:b?(b.relTypeId||""):"",direction:"both"}; if(b) return{...other,relatedCharacters:other.relatedCharacters.map(r=>r.charId===ch.id?recip:r)}; return{...other,relatedCharacters:[...other.relatedCharacters,recip]}; } else { if(b) return{...other,relatedCharacters:other.relatedCharacters.filter(r=>r.charId!==ch.id)}; return other; } }); const groups=p.groups.map(g=>{const linked=ch.relatedGroups.some(r=>r.groupId===g.id),has=g.relatedCharacters.includes(ch.id);if(linked&&!has) return{...g,relatedCharacters:[...g.relatedCharacters,ch.id]};if(!linked&&has) return{...g,relatedCharacters:g.relatedCharacters.filter(id=>id!==ch.id)};return g;}); return{...p,characters:syncedChars,groups}; }); setModal(null); },[upd]);
  const saveGroup=useCallback(g=>{upd(p=>{const groups=[...p.groups];const i=groups.findIndex(x=>x.id===g.id);if(i>=0)groups[i]=g;else groups.push(g);const characters=p.characters.map(ch=>{const inGroup=g.relatedCharacters.includes(ch.id),hasGroup=ch.relatedGroups.some(r=>r.groupId===g.id);if(inGroup&&!hasGroup) return{...ch,relatedGroups:[...ch.relatedGroups,{groupId:g.id,position:(g.memberNotes||{})[ch.id]||""}]};if(!inGroup&&hasGroup) return{...ch,relatedGroups:ch.relatedGroups.filter(r=>r.groupId!==g.id)};return ch;});return{...p,groups,characters};});setModal(null);},[upd]);
  const applyAbilityToAllSilent=useCallback((paramId)=>{ upd(p=>({...p,characters:p.characters.map(ch=>{ const stages=(ch.abilityStages&&ch.abilityStages.length?ch.abilityStages:[{id:uid(),name:"現在",abilities:ch.abilities||[]}]).map(st=>{ if(st.abilities.some(a=>a.paramId===paramId)) return st; return {...st,abilities:[...st.abilities,{paramId,value:50}]}; }); return {...ch,abilityStages:stages}; })})); },[upd]);
  const saveRelationPair=useCallback((aId,bId,ra,rb)=>{ upd(p=>({...p,characters:p.characters.map(ch=>{
    if(ch.id===aId) return {...ch,relatedCharacters:[...ch.relatedCharacters.filter(r=>r.charId!==bId),ra]};
    if(ch.id===bId) return {...ch,relatedCharacters:[...ch.relatedCharacters.filter(r=>r.charId!==aId),rb]};
    return ch; })})); },[upd]);
  const removeRelationPair=useCallback((aId,bId)=>{ upd(p=>({...p,characters:p.characters.map(ch=>{
    if(ch.id===aId) return {...ch,relatedCharacters:ch.relatedCharacters.filter(r=>r.charId!==bId)};
    if(ch.id===bId) return {...ch,relatedCharacters:ch.relatedCharacters.filter(r=>r.charId!==aId)};
    return ch; })})); },[upd]);
  const [saveOpen,setSaveOpen]=useState(false);
  const SaveMark = () => (
    saveStatus==="demo"
      ? <span style={{ fontSize:10.5,color:C.hint,flexShrink:0 }}>保存されません</span>
    : saveStatus==="error"
      ? <button onClick={()=>setSaveOpen(true)} style={{ display:"flex",alignItems:"center",gap:4,border:`0.5px solid ${C.danger}`,background:C.danger+"12",borderRadius:20,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0 }}>
          <Ico n="info" s={12} c={C.danger}/><span style={{ fontSize:10.5,color:C.danger }}>保存できていません</span>
        </button>
      : <span style={{ fontSize:10.5,color:C.hint,opacity:saveStatus==="saving"?1:0.6,minWidth:44,textAlign:"right",flexShrink:0 }}>{saveStatus==="saving"?"保存中":"✓ 保存"}</span>
  );
  const saveDialog = saveOpen&&(
    <Modal compact title="保存できていません" onClose={()=>setSaveOpen(false)} footer={<><Btn onClick={()=>setSaveOpen(false)}>閉じる</Btn><div style={{ flex:1 }}/><Btn variant="primary" onClick={()=>{ onRetrySave&&onRetrySave(); setSaveOpen(false); }}>もう一度保存する</Btn></>}>
      <div style={{ fontSize:13,color:C.text,lineHeight:1.95,marginBottom:12 }}>
        書いた内容はこの画面には残っていますが、<b>まだ保存できていません</b>。この状態でアプリを閉じると失われます。
      </div>
      <div style={{ fontSize:12,color:C.danger,lineHeight:1.8,background:C.danger+"10",border:`0.5px solid ${C.danger}`,borderRadius:10,padding:"10px 12px",marginBottom:12,wordBreak:"break-word" }}>{saveError||"原因が分かりませんでした。"}</div>
      <div style={{ fontSize:11.5,color:C.hint,lineHeight:1.9 }}>
        電波の届く場所で「もう一度保存する」を押してください。うまくいかないときは、その他 → 作品の設定 →「JSONでバックアップ」で手元に控えておくと安全です。
      </div>
    </Modal>
  );
  const offlineBar = online===false&&(
    <div style={{ background:C.danger+"12",borderBottom:`0.5px solid ${C.danger}`,padding:"7px 14px",fontSize:11.5,color:C.danger,textAlign:"center",flexShrink:0 }}>
      オフラインです。書いた内容はまだ保存されていません。
    </div>
  );
  const [imgMig,setImgMig]=useState(null);
  const embeddedCount = data.characters.filter(c=>isEmbedded(c.image)).length;
  const migrateImages=useCallback(async()=>{
    const targets=data.characters.filter(c=>isEmbedded(c.image));
    if(targets.length===0){ setConfirmBox({title:"移す画像はありません",body:"この作品の画像は、すべて軽い形式で保存されています。",okLabel:"閉じる",safe:true,alone:true}); return; }
    setImgMig({total:targets.length,done:0,failed:0});
    const map={}; let failed=0;
    for(let i=0;i<targets.length;i++){
      try { const blob=await (await fetch(targets[i].image)).blob(); map[targets[i].id]=await uploadImage(blob); }
      catch(e){ failed++; }
      setImgMig({total:targets.length,done:i+1,failed});
    }
    if(Object.keys(map).length) upd(p=>({...p,characters:p.characters.map(c=>map[c.id]?{...c,image:map[c.id]}:c)}));
    setImgMig(null);
    setConfirmBox({ title:"画像を軽くしました",
      body:`${Object.keys(map).length}件の画像を別の場所へ移しました。${failed?`\n${failed}件は移せませんでした。もう一度お試しください。`:""}\n\nこの作品を開くときの通信量が大きく減ります。`,
      okLabel:"閉じる", safe:true, alone:true });
  },[data,upd]);
  const moveNodes=useCallback((patch)=>upd(p=>({...p,graphPositions:{...(p.graphPositions||{}),...patch}})),[upd]);
  const resetNodes=useCallback(()=>upd(p=>({...p,graphPositions:{}})),[upd]);
  const saveScene=useCallback(sc=>{upd(p=>{const scenes=[...p.scenes];const i=scenes.findIndex(s=>s.id===sc.id);if(i>=0)scenes[i]=sc;else scenes.push(sc);const chapters=p.chapters.map(ch=>{const linked=sc.relatedChapterId===ch.id,has=ch.relatedScenes.includes(sc.id);if(linked&&!has) return{...ch,relatedScenes:[...ch.relatedScenes,sc.id]};if(!linked&&has) return{...ch,relatedScenes:ch.relatedScenes.filter(id=>id!==sc.id)};return ch;});return{...p,scenes,chapters};});setModal(null);},[upd]);
  const saveChapter=useCallback(ch=>{upd(p=>{const chapters=[...p.chapters];const i=chapters.findIndex(c=>c.id===ch.id);if(i>=0)chapters[i]=ch;else chapters.push(ch);const scenes=p.scenes.map(sc=>{const inChap=ch.relatedScenes.includes(sc.id);if(inChap&&sc.relatedChapterId!==ch.id) return{...sc,relatedChapterId:ch.id};if(!inChap&&sc.relatedChapterId===ch.id) return{...sc,relatedChapterId:""};return sc;});return{...p,chapters,scenes};});setModal(null);},[upd]);

  // ---------- one registry, used by both phone tabs and desktop sidebar ----------
  const SECTIONS = {
    chapters:    { label:"章",         icon:"book",   color:"#9B7DD4" },
    scenes:      { label:"シーン",     icon:"scene",  color:"#5B9BD5" },
    count:       { label:"文字数",     icon:"chart" },
    characters:  { label:"人物",       icon:"person", color:"#E8916E" },
    groups:      { label:"集団",       icon:"group",  color:"#D9618A" },
    locations:   { label:"場所",       icon:"pin",    color:"#4CAF82" },
    terms:       { label:"用語",       icon:"term",   color:"#C0392B" },
    graph:       { label:"相関図",     icon:"share" },
    timeline:    { label:"年表",       icon:"calendar" },
    storySettings:{label:"作品の設定", icon:"settings" },
    calendar:    { label:"暦と元号",   icon:"calendar" },
    genders:     { label:"性別",       icon:"gender", color:"#D9618A" },
    parameters:  { label:"自由項目",   icon:"param",  color:"#7B8DA6" },
    abilityParams:{label:"能力の軸",   icon:"radar",  color:"#F59E0B" },
    relationTypes:{label:"関係の種類", icon:"link",   color:"#5B9BD5" },
  };
  const TABS = [
    { key:"write", label:"執筆",   icon:"pencil", subs:["chapters","scenes"] },
    { key:"cast",  label:"人物",   icon:"person", view:"characters" },
    { key:"world", label:"世界観", icon:"world",  subs:["groups","locations","terms"] },
    { key:"link",  label:"関係",   icon:"share",  view:"graph" },
    { key:"time",  label:"年表",   icon:"calendar", view:"timeline" },
  ];
  const MORE = ["count","calendar","genders","parameters","abilityParams","relationTypes","storySettings"];
  // 画面を切り替えてもスクロール位置が残るよう、タブの中身は常に生かしておく
  const LIVE_KEYS = ["chapters","scenes","characters","groups","locations","terms","graph","timeline"];

  const layoutToggle=(
    <div style={{ display:"flex",background:C.bg,borderRadius:9,padding:2 }}>
      {[["list","list"],["grid","grid"],["face","person"]].map(([k,ic])=>(
        <button key={k} onClick={()=>setLayout(k)} style={{ width:32,height:27,borderRadius:7,border:"none",background:charLayout===k?C.surface:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:charLayout===k?"0 1px 2px rgba(0,0,0,0.08)":"none" }}><Ico n={ic} s={14} c={charLayout===k?C.text:C.hint}/></button>
      ))}
    </div>
  );
  // 並び替え：数字が入っていれば数として、そうでなければ五十音で。未入力は常に最後
  const firstNum=(v)=>{ const m=String(v==null?"":v).match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):null; };
  const sortedChars=(()=>{
    const cs=[...data.characters];
    if(charSort.key==="manual") return cs;
    const dir=charSort.asc?1:-1;
    const val=(c)=>{
      if(charSort.key==="name") return charFuri(c)||charName(c);
      if(charSort.key==="birth") return dayIndex(data,c.birthday);
      if(charSort.key.startsWith("p:")){ const e=c.parameters.find(x=>x.paramId===charSort.key.slice(2)); return e?e.value:""; }
      return "";
    };
    cs.sort((a,b)=>{
      const va=val(a), vb=val(b);
      const ea=(va===null||va===undefined||va===""), eb=(vb===null||vb===undefined||vb==="");
      if(ea&&eb) return 0; if(ea) return 1; if(eb) return -1;
      if(typeof va==="number"&&typeof vb==="number") return (va-vb)*dir;
      const na=firstNum(va), nb=firstNum(vb);
      if(na!==null&&nb!==null&&na!==nb) return (na-nb)*dir;
      return String(va).localeCompare(String(vb),"ja")*dir;
    });
    return cs;
  })();
  const manualOrder = charSort.key==="manual";
  const charSortBar=(
    <div style={{ display:"flex",gap:6,alignItems:"center" }}>
      <span style={{ fontSize:10.5,color:C.hint,flexShrink:0,letterSpacing:"0.05em" }}>並び</span>
      <select value={charSort.key} onChange={e=>setCharSort(v=>({...v,key:e.target.value}))} style={{ ...IS(),flex:1,minWidth:0,padding:"7px 9px",cursor:"pointer" }}>
        <option value="manual">登録順（自分で並べ替え）</option>
        <option value="name">名前（ふりがな）</option>
        <option value="birth">生まれた順</option>
        {data.parameters.map(p=><option key={p.id} value={"p:"+p.id}>{p.name||"（無名）"}</option>)}
      </select>
      <button onClick={()=>setCharSort(v=>({...v,asc:!v.asc}))} disabled={manualOrder} style={{ flexShrink:0,padding:"0 12px",minHeight:38,borderRadius:10,border:`0.5px solid ${C.border}`,background:"transparent",color:manualOrder?C.hint:C.sub,opacity:manualOrder?0.35:1,cursor:manualOrder?"default":"pointer",fontFamily:"inherit",fontSize:11.5 }}>{charSort.asc?"小さい順":"大きい順"}</button>
    </div>
  );

  const charListEl = <EntityList title="人物" icon="person" iconColor={SECTIONS.characters.color} items={sortedChars} onAdd={()=>setModal({type:"character"})} onEdit={it=>openChar(it.id)} onDelete={id=>del("characters",id)} renderName={charName} renderImage={c=>c.image||null} renderSubtitle={c=>{const g=data.genders.find(x=>x.id===c.genderId);return[g?g.name:null,ageText(data,c),c.birthday?`${dateLabel(data,c.birthday)}生`:null].filter(Boolean).join(" · ")||null;}} renderTags={c=>c.relatedGroups.slice(0,2).map(r=>{const g=data.groups.find(x=>x.id===r.groupId);return g?{label:r.position?`${g.name}（${r.position}）`:g.name}:null;}).filter(Boolean)} onMoveUp={manualOrder?(i=>moveEntity("characters",i,-1)):undefined} onMoveDown={manualOrder?(i=>moveEntity("characters",i,1)):undefined} headerExtra={layoutToggle} subHeader={charSortBar} body={charLayout==="grid"?<CharacterGrid chars={sortedChars} data={data} onOpen={c=>openChar(c.id)}/>:charLayout==="face"?<FaceGrid chars={sortedChars} onOpen={c=>openChar(c.id)}/>:undefined}/>;

  const simpleList=(key,extra)=>{ const sc=SECTIONS[key]; return <EntityList title={sc.label} icon={sc.icon} iconColor={sc.color} items={data[key]} onAdd={()=>setModal({type:extra.modal})} onEdit={it=>setModal({type:extra.modal,item:it})} onDelete={extra.onDelete||(id=>del(key,id))} renderName={extra.renderName} renderSubtitle={extra.renderSubtitle} onMoveUp={i=>moveEntity(key,i,-1)} onMoveDown={i=>moveEntity(key,i,1)}/>; };

  const viewEl=(key)=>{
    switch(key){
      case "chapters": return <ChapterBoard data={data} onOpenChapter={ch=>setModal({type:"chapter",item:ch})} onOpenScene={sc=>setModal({type:"scene",item:sc})} onAddChapter={()=>setModal({type:"chapter"})} onAddScene={cid=>setModal({type:"scene",preset:{relatedChapterId:cid}})} onMoveChapter={(i,d)=>moveEntity("chapters",i,d)}/>;
      case "count": return <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",paddingTop:12 }}><WordCountView data={data}/></div>;
      case "characters": return charListEl;
      case "graph": return <RelationGraph data={data} onOpenChar={ch=>openChar(ch.id)} onEditRel={(a,b)=>setModal({type:"relation",item:{charId:a,otherId:b}})} onMoveNodes={moveNodes} onResetNodes={resetNodes}/>;
      case "timeline": return <TimelineView data={data}/>;
      case "scenes": return simpleList("scenes",{modal:"scene",renderName:s=>s.title||"（無題）",renderSubtitle:s=>{const ch=data.chapters.find(c=>c.id===s.relatedChapterId);return[dateLabel(data,s.startDate),ch?ch.title:null,s.script?`${countChars(s.script)}字`:null].filter(Boolean).join(" · ")||null;}});
      case "groups": return simpleList("groups",{modal:"group",renderName:g=>g.name||"（無名）",renderSubtitle:g=>`${g.relatedCharacters.length}名が所属`});
      case "locations": return simpleList("locations",{modal:"location",renderName:l=>l.name||"（無名）",renderSubtitle:l=>l.description?l.description.slice(0,36):null});
      case "terms": return simpleList("terms",{modal:"term",renderName:t=>t.name||"（無名）",renderSubtitle:t=>t.description?t.description.slice(0,36):null});
      case "genders": return simpleList("genders",{modal:"gender",renderName:g=>g.name||"（無名）",renderSubtitle:g=>g.color});
      case "parameters": return simpleList("parameters",{modal:"parameter",renderName:p=>p.name||"（無名）",renderSubtitle:p=>p.description?p.description.slice(0,36):"人物ページに欄が増えます"});
      case "abilityParams": return simpleList("abilityParams",{modal:"abilityParam",renderName:p=>p.name||"（無名）",renderSubtitle:()=>"能力値チャートの軸",onDelete:id=>{const p=data.abilityParams.find(x=>x.id===id);setConfirmBox({title:"能力の軸を削除",body:`「${p?p.name:""}」を削除します。全人物のこの項目の値も消えます。`,run:()=>del("abilityParams",id)});}});
      case "relationTypes": return simpleList("relationTypes",{modal:"relationType",renderName:t=>t.name||"（無名）",renderSubtitle:()=>"つながりの線につく名前と色",onDelete:id=>{const t=data.relationTypes.find(x=>x.id===id);setConfirmBox({title:"関係の種類を削除",body:`「${t?t.name:""}」を削除します。`,run:()=>del("relationTypes",id)});}});
      case "calendar": return <CalendarSettings data={data} upd={upd}/>;
      case "storySettings": return (<div style={{ flex:1,overflowY:"auto",padding:16 }}><div style={{ maxWidth:620,margin:"0 auto" }}><Inp label="作品タイトル" value={data.storyTitle} onChange={v=>upd(p=>({...p,storyTitle:v}))} placeholder="タイトルを入力..."/><Inp label="あらすじ" value={data.storySynopsis} onChange={v=>upd(p=>({...p,storySynopsis:v}))} rows={5} placeholder="作品の概要..."/>
<Divider/>
<DateInp cal={data.calendar} label="作中の「現在」" value={data.nowDate} onChange={v=>upd(p=>({...p,nowDate:v}))}/>
<div style={{ fontSize:11,color:C.hint,lineHeight:1.9,marginTop:-6 }}>人物一覧や人物ページに出る年齢は、この日を基準に計算されます。物語がいま何年何月なのかを入れてください。空のままだと、独自の暦を使っている作品では年齢が出ません（現実の暦のままなら今日の日付が使われます）。</div>
<Divider/><Field label="バックアップ"><div style={{ display:"flex",flexDirection:"column",gap:8 }}><Btn icon="download" onClick={exportData}>JSONでバックアップ</Btn><div><Btn icon="upload" onClick={()=>importRef.current.click()}>JSONを復元</Btn><input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport}/></div></div></Field><Divider/><Field label="画像の保存形式">
  {embeddedCount>0?(<>
    <div style={{ fontSize:12,color:C.text,lineHeight:1.9,marginBottom:10 }}>
      この作品には、データの中に直接埋め込まれた画像が<b>{embeddedCount}件</b>あります。<br/>
      そのままでも使えますが、作品を開くたび・保存するたびに画像ごと通信するため、動作が重くなります。
    </div>
    <Btn icon="upload" onClick={migrateImages}>{imgMig?`移動中... ${imgMig.done} / ${imgMig.total}`:"画像を軽くする"}</Btn>
    <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,marginTop:8 }}>画像は別の保管場所へ移り、作品データには住所だけが残ります。見た目は何も変わりません。途中で失敗した画像は元のまま残るので、何度実行しても安全です。</div>
  </>):(
    <div style={{ fontSize:12,color:C.sub,lineHeight:1.9 }}>この作品の画像は、すべて軽い形式で保存されています。</div>
  )}
</Field><Divider/><Field label="書き出し"><div style={{ display:"flex",flexDirection:"column",gap:8 }}><Btn icon="download" onClick={exportMarkdown}>Markdownで書き出し（.md）</Btn><div style={{ fontSize:11,color:C.hint,lineHeight:1.7 }}>登場人物・シーン・章・用語など全情報を書き出します。</div></div></Field></div></div>);
      default: return null;
    }
  };

  const renderModal=()=>{
    if(!modal) return null; const {type,item,preset}=modal;
    const km={character:"characters",scene:"scenes",chapter:"chapters",group:"groups",location:"locations",term:"terms",gender:"genders",parameter:"parameters",abilityParam:"abilityParams",relationType:"relationTypes"};
    const D=(item&&km[type])?()=>del(km[type],item.id):null;
    if(type==="relation") return <RelationEdit charId={item.charId} otherId={item.otherId} data={data} onSave={(a,b,ra,rb)=>{ saveRelationPair(a,b,ra,rb); setModal(null); }} onRemove={()=>{ removeRelationPair(item.charId,item.otherId); setModal(null); }} onClose={()=>setModal(null)}/>;
    if(type==="character") return <CharacterEdit char={item} data={data} onSave={saveChar} onClose={()=>setModal(null)} onDelete={D}/>;
    if(type==="scene") return <SceneEdit scene={item} preset={preset} data={data} onSave={saveScene} onClose={()=>setModal(null)} onDelete={D}/>;
    if(type==="chapter") return <ChapterEdit chapter={item} data={data} onSave={saveChapter} onClose={()=>setModal(null)} onDelete={D}/>;
    if(type==="group") return <GroupEdit group={item} data={data} onSave={saveGroup} onClose={()=>setModal(null)} onDelete={D}/>;
    if(type==="location") return <SimpleEdit item={item} entityName="場所" data={data} onSave={l=>{upsert("locations",l);setModal(null);}} onClose={()=>setModal(null)} onDelete={D} fields={[{key:"name",label:"場所名",type:"text",placeholder:"例：王都カルナ"},{key:"description",label:"説明",type:"textarea",placeholder:"説明..."},{key:"notes",label:"備考",type:"textarea",placeholder:"メモ..."}]}/>;
    if(type==="term") return <SimpleEdit item={item} entityName="用語" data={data} onSave={t=>{upsert("terms",t);setModal(null);}} onClose={()=>setModal(null)} onDelete={D} fields={[{key:"name",label:"用語名",type:"text",placeholder:"例：魔導石"},{key:"description",label:"説明",type:"textarea",placeholder:"説明..."},{key:"relatedCharacters",label:"関連人物",type:"links",dataKey:"characters",getLabel:charName,getColor:c=>c.imageColor},{key:"notes",label:"備考",type:"textarea",placeholder:"メモ..."}]}/>;
    if(type==="gender") return <SimpleEdit item={item} entityName="性別" data={data} onSave={g=>{upsert("genders",g);setModal(null);}} onClose={()=>setModal(null)} onDelete={D} fields={[{key:"name",label:"性別名",type:"text",placeholder:"例：男性 / 女性..."},{key:"color",label:"カラー",type:"color"}]}/>;
    if(type==="parameter") return <SimpleEdit item={item} entityName="自由項目" data={data} onSave={p=>{upsert("parameters",p);setModal(null);}} onClose={()=>setModal(null)} onDelete={D} fields={[{key:"name",label:"項目名",type:"text",placeholder:"例：好きな食べ物、口癖..."},{key:"description",label:"説明（任意）",type:"textarea",placeholder:"説明..."}]}/>;
    if(type==="abilityParam") return <AbilityParamEdit param={item} onSave={p=>{ upsert("abilityParams",p); if(p.applyAll) applyAbilityToAllSilent(p.id); setModal(null); }} onClose={()=>setModal(null)} onDelete={D}/>;
    if(type==="relationType") return <SimpleEdit item={item} entityName="関係の種類" data={data} onSave={t=>{upsert("relationTypes",t);setModal(null);}} onClose={()=>setModal(null)} onDelete={D} fields={[{key:"name",label:"関係の名前",type:"text",placeholder:"例：親子、師弟、宿敵..."},{key:"color",label:"線の色",type:"color"}]}/>;
    return null;
  };

  const viewedChar = charViewId ? data.characters.find(c=>c.id===charViewId) : null;
  const confirmEl = confirmBox && (
    <Modal compact title={confirmBox.title} onClose={()=>setConfirmBox(null)} footer={<>{!confirmBox.alone&&<Btn onClick={()=>setConfirmBox(null)}>キャンセル</Btn>}<div style={{ flex:1 }}/><Btn variant={confirmBox.safe?"primary":"danger"} icon={confirmBox.safe?undefined:"trash"} onClick={()=>{ confirmBox.run&&confirmBox.run(); setConfirmBox(null); }}>{confirmBox.okLabel||"削除する"}</Btn></>}>
      <div style={{ fontSize:13,color:C.text,lineHeight:1.9,whiteSpace:"pre-line" }}>{confirmBox.body}</div>
    </Modal>
  );

  // ---------------- desktop ----------------
  // 描き直すたびに中身が作り直されるとスクロール位置が飛ぶので、部品ではなく関数として書く
  const sideLabel=(text)=><div key={"lb_"+text} style={{ fontSize:10,fontWeight:600,color:C.hint,letterSpacing:"0.12em",padding:"16px 10px 5px" }}>{text}</div>;
  const sideItem=(k)=>{ const sc=SECTIONS[k]; const active=deskView===k; const n=data[k]?data[k].length:undefined; return (
    <button key={k} onClick={()=>goSection(k)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"7px 10px",borderRadius:8,border:"none",background:active?C.accent+"12":"transparent",borderLeft:active?`2px solid ${C.accent}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
      <Ico n={sc.icon} s={15} c={active?C.accent:C.hint}/>
      <span style={{ fontSize:13,color:active?C.text:C.sub,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{sc.label}</span>
      {n!==undefined&&<span style={{ fontSize:10.5,color:C.hint }}>{n}</span>}
    </button>
  ); };
  const paneWrap=(node,max)=>(<div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",maxWidth:max||860,width:"100%",margin:"0 auto" }}>{node}</div>);
  const deskMax=(k)=>k==="graph"?640:(k==="timeline"||k==="count")?780:900;
  const renderDesktopMain=()=>(<>
    {!deskView&&(
      <div style={{ flex:1,overflowY:"auto",padding:"34px 28px" }}>
        <div style={{ maxWidth:760,margin:"0 auto" }}>
          <div style={{ fontSize:10.5,fontWeight:600,color:C.hint,letterSpacing:"0.14em",marginBottom:8 }}>作品</div>
          <div style={{ fontFamily:C.display,fontSize:28,color:C.text,marginBottom:12,wordBreak:"break-word",lineHeight:1.25 }}>{data.storyTitle||"作品"}</div>
          <div style={{ fontSize:13,color:data.storySynopsis?C.sub:C.hint,lineHeight:1.95,whiteSpace:"pre-wrap",marginBottom:26 }}>{data.storySynopsis||"あらすじはまだ書かれていません。左の「作品の設定」から書き始められます。"}</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(122px,1fr))",gap:10 }}>
            {["characters","groups","locations","scenes","terms"].map(k=>(
              <button key={k} onClick={()=>goSection(k)} style={{ textAlign:"left",background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px 12px",cursor:"pointer",fontFamily:"inherit" }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}><Ico n={SECTIONS[k].icon} s={13} c={C.hint}/><span style={{ fontSize:11,color:C.hint }}>{SECTIONS[k].label}</span></div>
                <div style={{ fontFamily:C.display,fontSize:22,color:C.text,lineHeight:1 }}>{data[k].length}</div>
              </button>
            ))}
            <div style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px 12px" }}>
              <div style={{ fontSize:11,color:C.hint,marginBottom:5 }}>総文字数</div>
              <div style={{ fontFamily:C.display,fontSize:22,color:C.text,lineHeight:1 }}>{storyChars(data).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    )}
    {LIVE_KEYS.map(k=>{
      const on=deskView===k;
      // display:none にするとブラウザがスクロール位置を捨てるので、見えなくするだけにする
      const box = on
        ? { display:"flex",flex:1,minWidth:0,overflow:"hidden",position:"relative" }
        : { display:"flex",position:"absolute",inset:0,visibility:"hidden",pointerEvents:"none",overflow:"hidden" };
      if(k==="characters") return (
        <div key={k} style={box}>
          <div style={{ display:viewedChar?"none":"flex",flex:1,flexDirection:"column",overflow:"hidden",maxWidth:900,width:"100%",margin:"0 auto" }}>{charListEl}</div>
          {viewedChar&&<CharacterView key={viewedChar.id} embedded char={viewedChar} data={data} onClose={()=>goSection("characters",null)} onEdit={()=>setModal({type:"character",item:viewedChar})} onJump={id=>openChar(id)} onEditRel={(a,b)=>setModal({type:"relation",item:{charId:a,otherId:b}})}/>}
        </div>
      );
      return <div key={k} style={box}>{paneWrap(viewEl(k),deskMax(k))}</div>;
    })}
    {deskView&&MORE.includes(deskView)&&<div style={{ display:"flex",flex:1,minWidth:0,overflow:"hidden" }}>{paneWrap(viewEl(deskView),deskMax(deskView))}</div>}
  </>);

  if(isDesktop) return (
    <div style={{ height:"100%",display:"flex",background:C.bg }}>
      <div style={{ width:238,flexShrink:0,background:C.surface,borderRight:`0.5px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden" }}>
        <div style={{ padding:"14px 14px 12px",borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
          <button onClick={onBack} style={{ display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:9,fontFamily:"inherit" }}><Ico n="back" s={14} c={C.sub}/><span style={{ fontSize:11.5,color:C.sub }}>ライブラリ</span></button>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:3,height:32,borderRadius:2,background:C.accent,flexShrink:0 }}/>
            <div onClick={()=>goSection(null)} style={{ minWidth:0,cursor:"pointer" }}>
              <div style={{ fontSize:10.5,color:C.hint,letterSpacing:"0.08em" }}>現在の作品</div>
              <div style={{ fontFamily:C.display,fontSize:15.5,color:C.text,lineHeight:1.3,wordBreak:"break-word" }}>{data.storyTitle||"作品"}</div>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",padding:"2px 8px 24px" }}>
          {sideLabel("執筆")}
          {["chapters","scenes"].map(k=>sideItem(k))}
          {sideLabel("登場人物")}
          {sideItem("characters")}
          {sideLabel("世界観")}
          {["groups","locations","terms"].map(k=>sideItem(k))}
          {sideLabel("見取り図")}
          {["graph","timeline"].map(k=>sideItem(k))}
          {sideLabel("その他")}
          {MORE.map(k=>sideItem(k))}
        </div>
      </div>
      <div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 16px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
          <span style={{ fontSize:11,color:C.hint }}>{data.storyTitle||"作品"}{deskView?` / ${SECTIONS[deskView].label}`:""}</span>
          <div style={{ flex:1 }}/>
          <button onClick={()=>setSearchOpen(true)} style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:`0.5px solid ${C.border}`,background:C.bg,color:C.hint,cursor:"pointer",fontFamily:"inherit",fontSize:12.5 }}><Ico n="search" s={14} c={C.hint}/>作品全体を検索</button>
          <SaveMark/>
        </div>
        {offlineBar}
        <div style={{ flex:1,overflow:"hidden",display:"flex",minWidth:0,position:"relative" }}>{renderDesktopMain()}</div>
      </div>
      {renderModal()}
      {confirmEl}
      {saveDialog}
      {searchOpen&&<SearchScreen data={data} onClose={()=>setSearchOpen(false)} onOpenItem={(r)=>{ setSearchOpen(false); if(r.type==="character"){ openChar(r.id); } else setModal({type:r.type,item:r.item}); }}/>}
    </div>
  );

  // ---------------- phone ----------------
  const tab=TABS.find(t=>t.key===activeTab)||TABS[0];
  const currentKey = defView || (tab.subs ? (sub[tab.key]||tab.subs[0]) : tab.view);
  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 10px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        {defView
          ? <button onClick={()=>{ goSection(tabSection(activeTab)); setDefOpen(true); }} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="back" s={16} c={C.accent}/><span style={{ fontSize:12,color:C.accent }}>その他</span></button>
          : <button onClick={onBack} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="back" s={16} c={C.accent}/><span style={{ fontSize:12,color:C.accent }}>ライブラリ</span></button>}
        <div style={{ fontFamily:C.display,fontSize:15,color:C.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{data.storyTitle||"作品"}</div>
        <div style={{ display:"flex",alignItems:"center",gap:0,flexShrink:0 }}>
          <button onClick={()=>setSearchOpen(true)} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 6px",display:"flex" }}><Ico n="search" s={18} c={C.sub}/></button>
          <button onClick={()=>setDefOpen(true)} style={{ display:"flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"6px 4px 6px 6px" }}><Ico n="settings" s={17} c={C.sub}/><span style={{ fontSize:11,color:C.sub }}>その他</span></button>
        </div>
      </div>
      {saveStatus==="error"&&<div style={{ padding:"7px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"center" }}><SaveMark/></div>}
      {offlineBar}
      {!defView&&<div style={{ padding:"4px 12px 0",fontSize:10.5,color:C.hint,letterSpacing:"0.06em",flexShrink:0 }}>{tab.label} / {SECTIONS[currentKey].label}</div>}
      {!defView&&tab.subs&&<div style={{ padding:"8px 12px 0",flexShrink:0 }}><Tabs tabs={tab.subs.map(k=>({key:k,label:SECTIONS[k].label}))} active={currentKey} onChange={k=>goSection(k)}/></div>}
      <div style={{ flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0,position:"relative" }}>
        {defView
          ? viewEl(defView)
          : LIVE_KEYS.map(k=>(
              <div key={k} style={currentKey===k
                ? { flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,position:"relative" }
                : { display:"flex",flexDirection:"column",position:"absolute",inset:0,visibility:"hidden",pointerEvents:"none",overflow:"hidden" }}>{viewEl(k)}</div>
            ))}
      </div>
      {!defView&&(
        <div style={{ display:"flex",borderTop:`0.5px solid ${C.border}`,background:C.surface,flexShrink:0,paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
          {TABS.map(t=>{const active=activeTab===t.key;return <button key={t.key} onClick={()=>goSection(tabSection(t.key))} style={{ flex:1,padding:"9px 2px 7px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit" }}><Ico n={t.icon} s={20} c={active?C.accent:C.hint} sw={active?1.9:1.4}/><span style={{ fontSize:9.5,color:active?C.accent:C.hint }}>{t.label}</span></button>;})}
        </div>
      )}
      {viewedChar&&<CharacterView key={viewedChar.id} char={viewedChar} data={data} onClose={()=>goSection("characters",null)} onEdit={()=>setModal({type:"character",item:viewedChar})} onJump={id=>openChar(id)} onEditRel={(a,b)=>setModal({type:"relation",item:{charId:a,otherId:b}})}/>}
      {defOpen&&(
        <div style={{ position:"fixed",inset:0,zIndex:1400,background:C.bg,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"11px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
            <button onClick={()=>setDefOpen(false)} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="x" s={18} c={C.accent}/><span style={{ fontSize:12,color:C.accent }}>閉じる</span></button>
            <span style={{ fontFamily:C.display,fontSize:16,color:C.text }}>その他</span>
          </div>
          <div style={{ flex:1,overflowY:"auto" }}>
            <div style={{ fontSize:11,color:C.hint,lineHeight:1.8,padding:"14px 16px 6px" }}>人物ページに出る項目の定義や、作品全体の設定はここにあります。</div>
            {MORE.map(k=>(
              <button key={k} onClick={()=>{ goSection(k); setDefOpen(false); }} style={{ width:"100%",padding:"15px 16px",display:"flex",alignItems:"center",gap:12,background:C.surface,border:"none",borderBottom:`0.5px solid ${C.borderL}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                <Ico n={SECTIONS[k].icon} s={17} c={C.hint}/>
                <span style={{ fontSize:14,color:C.text,flex:1 }}>{SECTIONS[k].label}</span>
                {data[k]&&<span style={{ fontSize:11,color:C.hint }}>{data[k].length}</span>}
                <Ico n="chevR" s={14} c={C.hint}/>
              </button>
            ))}
          </div>
        </div>
      )}
      {renderModal()}
      {confirmEl}
      {saveDialog}
      {searchOpen&&<SearchScreen data={data} onClose={()=>setSearchOpen(false)} onOpenItem={(r)=>{ setSearchOpen(false); if(r.type==="character") openChar(r.id); else setModal({type:r.type,item:r.item}); }}/>}
    </div>
  );
}

// ===================== STORY LIST (HOME) =====================
function StoryList({ stories, onOpen, onCreate, onDuplicate, onDelete, onRename, onMove, onOpenSettings, onOpenIdeas }) {
  const isDesktop=useIsDesktop();
  const [menuFor,setMenuFor]=useState(null);
  const [renameFor,setRenameFor]=useState(null);
  const [renameVal,setRenameVal]=useState("");
  const [delFor,setDelFor]=useState(null);
  const [delErr,setDelErr]=useState("");
  const [deleting,setDeleting]=useState(false);
  const runDelete=async()=>{ if(!delFor) return; setDeleting(true); setDelErr(""); const err=await onDelete(delFor.id); setDeleting(false); if(err) setDelErr(err); else setDelFor(null); };
  const [q,setQ]=useState("");
  const filtered=stories.filter(s=>(s.title||"").includes(q));
  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <span style={{ fontFamily:C.display,fontSize:18,color:C.text }}>作品一覧</span>
        <div style={{ display:"flex",gap:4 }}>
          <button onClick={onOpenIdeas} style={{ background:"none",border:"none",cursor:"pointer",padding:8,display:"flex" }}><Ico n="bulb" s={19} c={C.sub}/></button>
          <button onClick={onOpenSettings} style={{ background:"none",border:"none",cursor:"pointer",padding:8,display:"flex" }}><Ico n="settings" s={19} c={C.sub}/></button>
        </div>
      </div>
      {stories.length>3&&<div style={{ padding:"10px 16px 4px",background:C.surface }}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="作品を検索..." style={{ ...IS(),padding:"9px 12px",background:C.bg }}/></div>}
      <div style={{ flex:1,overflowY:"auto",padding:"12px 12px 90px" }}>
        <div style={{ maxWidth:isDesktop?960:"none",margin:"0 auto",display:isDesktop&&stories.length>0?"grid":"block",gridTemplateColumns:isDesktop?"repeat(auto-fill,minmax(276px,1fr))":undefined,gap:isDesktop?12:undefined,alignItems:"start" }}>
        {stories.length===0?(
          <div style={{ textAlign:"center",padding:"56px 26px",color:C.hint }}>
            <div style={{ width:74,height:74,borderRadius:24,background:C.tag,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}><Ico n="book" s={32} c={C.hint} sw={1.3}/></div>
            <div style={{ fontSize:14.5,fontWeight:700,color:C.text,marginBottom:6 }}>作品はまだありません</div>
            <div style={{ fontSize:12,lineHeight:1.8 }}>タイトルは仮でかまいません。<br/>下の「新しい作品」から始められます。</div>
          </div>
        ):
        filtered.map((st,i)=>{ const sm=st.summary; return (
          <div key={st.id} style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:14,padding:"14px 14px 12px",marginBottom:10,position:"relative",zIndex:menuFor===st.id?40:undefined }}>
            <div onClick={()=>onOpen(st.id)} style={{ cursor:"pointer" }}>
              <div style={{ fontFamily:C.display,fontSize:16.5,color:C.text,marginBottom:5,paddingRight:28,lineHeight:1.3 }}>{st.title||"（無題）"}</div>
              {sm&&sm.synopsis&&<div style={{ fontSize:12,color:C.sub,lineHeight:1.5,marginBottom:8,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{sm.synopsis}</div>}
              <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
                {sm&&<><span style={{ fontSize:11,color:C.hint }}>人物 {sm.chars}</span><span style={{ fontSize:11,color:C.hint }}>シーン {sm.scenes}</span><span style={{ fontSize:11,color:C.hint }}>{(sm.words||0).toLocaleString()}字</span></>}
                {st.updated_at&&<span style={{ fontSize:11,color:C.hint,marginLeft:"auto" }}>{new Date(st.updated_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})}</span>}
              </div>
            </div>
            <button onClick={()=>setMenuFor(menuFor===st.id?null:st.id)} style={{ position:"absolute",top:10,right:8,background:"none",border:"none",cursor:"pointer",padding:6,display:"flex" }}><Ico n="dots" s={16} c={C.hint}/></button>
            {!q&&<div style={{ position:"absolute",top:12,right:34,display:"flex",flexDirection:"column",gap:0 }}><button onClick={()=>onMove(i,-1)} disabled={i===0} style={{ border:"none",background:"transparent",cursor:i===0?"default":"pointer",padding:"1px 2px",opacity:i===0?0.15:0.4 }}><Ico n="chevU" s={12} c={C.text}/></button><button onClick={()=>onMove(i,1)} disabled={i===filtered.length-1} style={{ border:"none",background:"transparent",cursor:i===filtered.length-1?"default":"pointer",padding:"1px 2px",opacity:i===filtered.length-1?0.15:0.4 }}><Ico n="chevD" s={12} c={C.text}/></button></div>}
            {menuFor===st.id&&<div onClick={()=>setMenuFor(null)} style={{ position:"fixed",inset:0,zIndex:10 }}/>}
            {menuFor===st.id&&(<div style={{ position:"absolute",top:36,right:8,background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:10,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:20,overflow:"hidden",minWidth:150 }}>
              <button onClick={()=>{setRenameFor(st.id);setRenameVal(st.title);setMenuFor(null);}} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"11px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:C.text }}><Ico n="edit" s={14} c={C.sub}/>名前変更</button>
              <button onClick={()=>{onDuplicate(st.id);setMenuFor(null);}} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"11px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:C.text,borderTop:`0.5px solid ${C.borderL}` }}><Ico n="copy" s={14} c={C.sub}/>複製</button>
              <button onClick={()=>{setDelFor(st);setDelErr("");setMenuFor(null);}} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"11px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:C.danger,borderTop:`0.5px solid ${C.borderL}` }}><Ico n="trash" s={14} c={C.danger}/>削除</button>
            </div>)}
          </div>
        );})}
        </div>
      </div>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px calc(16px + env(safe-area-inset-bottom,0px))",background:C.surface,borderTop:`0.5px solid ${C.border}`,maxWidth:isDesktop?"none":480,margin:"0 auto" }}>
        <div style={{ maxWidth:isDesktop?960:"none",margin:"0 auto" }}><Btn variant="primary" icon="plus" full onClick={onCreate}>新しい作品</Btn></div>
      </div>
      {delFor&&(<Modal compact title="作品を削除" onClose={()=>setDelFor(null)} footer={<><Btn onClick={()=>setDelFor(null)}>キャンセル</Btn><div style={{ flex:1 }}/><Btn variant="danger" icon="trash" onClick={runDelete}>{deleting?"削除中...":"削除する"}</Btn></>}>
        <div style={{ fontSize:14,fontWeight:600,color:C.text,marginBottom:8,wordBreak:"break-word" }}>「{delFor.title||"（無題）"}」</div>
        <div style={{ fontSize:12.5,color:C.sub,lineHeight:1.8 }}>この作品を削除します。人物・シーン・章など、中のデータもすべて消えます。取り消せません。</div>
        <div style={{ fontSize:11.5,color:C.hint,lineHeight:1.8,marginTop:10 }}>残しておきたい場合は、先に作品を開いて「ストーリー設定 → JSONでバックアップ」を実行してください。</div>
        {delErr&&<div style={{ marginTop:14,padding:"11px 12px",borderRadius:10,background:C.danger+"14",border:`0.5px solid ${C.danger}`,color:C.danger,fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap" }}>{delErr}</div>}
      </Modal>)}
      {renameFor&&(<Modal compact title="作品名の変更" onClose={()=>setRenameFor(null)} footer={<><div style={{ flex:1 }}/><Btn variant="primary" onClick={()=>{onRename(renameFor,renameVal);setRenameFor(null);}}>変更</Btn></>}><Inp label="作品名" value={renameVal} onChange={setRenameVal} placeholder="作品名..."/></Modal>)}
    </div>
  );
}

// ===================== SETTINGS =====================
function SettingsScreen({ onBack, theme, dark, serifHeads, onTheme, onDark, onSerif, email, onLogout }) {
  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"11px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="chevL" s={18} c={C.accent}/><span style={{ fontSize:12,color:C.accent }}>戻る</span></button>
        <span style={{ fontFamily:C.display,fontSize:16,color:C.text }}>設定</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:16 }}>
        <div style={{ maxWidth:620,margin:"0 auto" }}>
        <Field label="テーマ">
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
            {Object.entries(THEMES).map(([key,t])=>(
              <button key={key} onClick={()=>onTheme(key)} style={{ display:"flex",alignItems:"center",gap:8,padding:"12px",borderRadius:12,border:`1.5px solid ${theme===key?C.accent:C.border}`,background:theme===key?C.accent+"12":C.surface,cursor:"pointer",fontFamily:"inherit" }}>
                <div style={{ width:22,height:22,borderRadius:7,background:t.accentColor,flexShrink:0,border:`0.5px solid ${C.border}` }}/>
                <span style={{ fontSize:13,fontWeight:theme===key?600:400,color:C.text }}>{t.label}</span>
                {theme===key&&<div style={{ marginLeft:"auto" }}><Ico n="check" s={15} c={C.accent}/></div>}
              </button>
            ))}
          </div>
        </Field>
        <Divider/>
        <Field label="表示モード">
          <button onClick={()=>onDark(!dark)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 14px",borderRadius:12,border:`0.5px solid ${C.border}`,background:C.surface,cursor:"pointer",fontFamily:"inherit" }}>
            <Ico n={dark?"moon":"sun"} s={18} c={C.accent}/>
            <span style={{ fontSize:13,color:C.text }}>{dark?"ダークモード":"ライトモード"}</span>
            <div style={{ marginLeft:"auto",width:42,height:24,borderRadius:12,background:dark?C.accent:C.border,position:"relative",transition:"background 0.2s" }}>
              <div style={{ position:"absolute",top:2,left:dark?20:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
            </div>
          </button>
        </Field>
        <Divider/>
        <Field label="見出しの書体">
          <button onClick={()=>onSerif(!serifHeads)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 14px",borderRadius:12,border:`0.5px solid ${C.border}`,background:C.surface,cursor:"pointer",fontFamily:"inherit" }}>
            <span style={{ fontFamily:C.display,fontSize:17,color:C.text,width:26,textAlign:"center" }}>綴</span>
            <span style={{ fontSize:13,color:C.text }}>{serifHeads?"明朝":"ゴシック"}</span>
            <div style={{ marginLeft:"auto",width:42,height:24,borderRadius:12,background:serifHeads?C.accent:C.border,position:"relative",transition:"background 0.2s" }}>
              <div style={{ position:"absolute",top:2,left:serifHeads?20:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
            </div>
          </button>
          <div style={{ fontSize:11,color:C.hint,lineHeight:1.7,marginTop:7 }}>作品名や人物名など、見出しにあたる文字だけ書体が変わります。</div>
        </Field>
        <Divider/>
        <Field label="アカウント">
          <div style={{ fontSize:12,color:C.sub,padding:"4px 2px 12px" }}>{email}</div>
          <Btn variant="default" icon="logout" full onClick={onLogout}>ログアウト</Btn>
        </Field>
        <div style={{ textAlign:"center",marginTop:28,opacity:0.55 }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.sub,letterSpacing:"-0.2px" }}>Tsuzu Loom</div>
          <div style={{ fontSize:10,color:C.hint,marginTop:2 }}>version {APP_VERSION}</div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ===================== IDEAS BOX =====================
function IdeasScreen({ onBack, ideas, onAdd, onDelete }) {
  const [text,setText]=useState("");
  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"11px 12px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 8px",display:"flex",alignItems:"center",gap:3 }}><Ico n="chevL" s={18} c={C.accent}/><span style={{ fontSize:12,color:C.accent }}>戻る</span></button>
        <span style={{ fontFamily:C.display,fontSize:16,color:C.text }}>アイデアボックス</span>
      </div>
      <div style={{ padding:"12px 16px",background:C.surface,borderBottom:`0.5px solid ${C.borderL}`,display:"flex",gap:8 }}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="思いついたことを書き留める..." style={{ ...IS(),background:C.bg }} onKeyDown={e=>{if(e.key==="Enter"&&text.trim()){onAdd(text.trim());setText("");}}}/>
        <button onClick={()=>{if(text.trim()){onAdd(text.trim());setText("");}}} style={{ flexShrink:0,width:44,borderRadius:10,border:"none",background:C.accent,color:C.accentFg,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico n="plus" s={18} c={C.accentFg}/></button>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"12px 12px 20px" }}>
        {ideas.length===0?<div style={{ textAlign:"center",padding:"50px 20px",color:C.hint }}><div style={{ width:74,height:74,borderRadius:24,background:C.tag,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}><Ico n="bulb" s={32} c={C.hint} sw={1.3}/></div><div style={{ fontSize:14.5,fontWeight:700,color:C.text,marginBottom:6 }}>アイデアはまだありません</div><div style={{ fontSize:12,lineHeight:1.8 }}>全作品共通のメモ帳です。<br/>上の欄に書いて Enter で残せます。</div></div>:
        [...ideas].reverse().map(idea=>(
          <div key={idea.id} style={{ background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start" }}>
            <div style={{ flex:1,fontSize:13,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{idea.text}<div style={{ fontSize:10,color:C.hint,marginTop:5 }}>{new Date(idea.createdAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div></div>
            <button onClick={()=>onDelete(idea.id)} style={{ border:"none",background:"transparent",cursor:"pointer",padding:4,opacity:0.35,flexShrink:0 }}><Ico n="trash" s={14} c={C.text}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== ROOT APP =====================
function App() {
  const isDesktop=useIsDesktop();
  const [session,setSession]=useState(null);
  const [recovery,setRecovery]=useState(false);
  const [demo,setDemo]=useState(false);
  const [demoData,setDemoData]=useState(null);
  const [confirmBox,setConfirmBox]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [stories,setStories]=useState(null);
  const [openId,setOpenId]=useState(null);
  const [openData,setOpenData]=useState(null);
  const [saveStatus,setSaveStatus]=useState("saved");   // saved | saving | error
  const [saveError,setSaveError]=useState("");
  const [loadError,setLoadError]=useState("");
  const [online,setOnline]=useState(typeof navigator==="undefined"||navigator.onLine!==false);
  const [screen,setScreen]=useState("list");
  const [section,setSection]=useState(null);      // 作品の中のどの画面か
  const [charRoute,setCharRoute]=useState(null);  // 人物ページを開いているか
  const [ideas,setIdeas]=useState([]);
  const [theme,setTheme]=useState(localStorage.getItem("sc_theme")||"mono");
  const [dark,setDark]=useState(localStorage.getItem("sc_dark")==="1");
  const [serifHeads,setSerifHeads]=useState(localStorage.getItem("tl_serif")!=="0");
  const [, forceRender]=useState(0);

  applyTheme(theme,dark,serifHeads);

  useEffect(()=>{
    if(/type=recovery/.test(window.location.hash)||/type=recovery/.test(window.location.search)) setRecovery(true);
    db.auth.getSession().then(({data:{session}})=>{ setSession(session); setAuthLoading(false); });
    const {data:{subscription}}=db.auth.onAuthStateChange((e,s)=>{ if(e==="PASSWORD_RECOVERY") setRecovery(true); setSession(s); });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){ setStories(null); setOpenId(null); setOpenData(null); setIdeas([]); return; }
    (async()=>{
      try {
        let { data:meta } = await db.from("user_meta").select("*").eq("user_id",session.user.id).maybeSingle();
        if(!meta){ await db.from("user_meta").insert({user_id:session.user.id,ideas:[],settings:{}}); meta={ideas:[],settings:{}}; }
        setIdeas(meta.ideas||[]);
        if(meta.settings){ if(meta.settings.theme){ setTheme(meta.settings.theme); localStorage.setItem("sc_theme",meta.settings.theme);} if(typeof meta.settings.darkMode==="boolean"){ setDark(meta.settings.darkMode); localStorage.setItem("sc_dark",meta.settings.darkMode?"1":"0"); } if(typeof meta.settings.serifHeads==="boolean"){ setSerifHeads(meta.settings.serifHeads); localStorage.setItem("tl_serif",meta.settings.serifHeads?"1":"0"); } }
        let { data:rows } = await db.from("stories").select("id,title,sort_order,updated_at,summary").eq("user_id",session.user.id).order("sort_order",{ascending:true});
        // 一度も作品がなく、見本もまだ入れていない人にだけ見本を1つ用意する
        if((!rows||rows.length===0) && !(meta.settings&&meta.settings.sampleDone)){
          try {
            const sd=buildSample();
            const { data:ins } = await db.from("stories").insert({user_id:session.user.id,title:sd.storyTitle,data:sd,sort_order:0,summary:mkSummary(sd)}).select("id,title,sort_order,updated_at,summary").single();
            if(ins) rows=[ins];
          } catch(e){ console.error(e); }
          await db.from("user_meta").update({ settings:{...(meta.settings||{}),sampleDone:true} }).eq("user_id",session.user.id);
        }
        setStories((rows||[]).map(r=>({ id:r.id,title:r.title,sort_order:r.sort_order,updated_at:r.updated_at,summary:r.summary||null })));
      } catch(e){ console.error(e); setLoadError(e&&e.message?e.message:"データを読み込めませんでした。"); setStories([]); }
    })();
  },[session]);

  useEffect(()=>{
    const on=()=>setOnline(true), off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  // ---- URLと画面の同期（リロードしても同じ場所に戻る／ブラウザの戻るが効く）----
  const restored=useRef(false);
  const bootRoute=useRef(parseHash());   // 起動時のURLを最初に控える（後で上書きされても残る）
  // ブラウザ任せのスクロール復元を切る（画面が勝手に飛ぶのを防ぐ）
  useEffect(()=>{ if(window.history.scrollRestoration) window.history.scrollRestoration="manual"; },[]);
  useEffect(()=>{
    if(demo||recovery||!session||!restored.current) return;
    const want=buildHash({screen,storyId:openId,section,charId:charRoute});
    if((window.location.hash||"#/")===want) return;
    // location.hash に代入するとブラウザが先頭へスクロールしてしまうので pushState を使う
    window.history.pushState(null,"",want);
  },[screen,openId,section,charRoute,demo,recovery,session]);
  useEffect(()=>{
    const on=()=>{
      const r=parseHash();
      if(r.screen==="editor"&&r.storyId){
        if(r.storyId!==openId) openStory(r.storyId,r.section,r.charId);
        else { setScreen("editor"); setSection(r.section||null); setCharRoute(r.charId); }
      } else {
        setScreen(r.screen); setOpenId(null); setOpenData(null); setSection(null); setCharRoute(null);
      }
    };
    // pushState を使うので、戻る/進むは popstate で受ける
    window.addEventListener("popstate",on);
    return ()=>window.removeEventListener("popstate",on);
  },[openId]);
  // 読み込み直後、URLが作品を指していればその作品を開き直す
  useEffect(()=>{
    if(restored.current||recovery||!session||stories===null) return;
    restored.current=true;
    const r=bootRoute.current;
    if(r.screen==="editor"&&r.storyId&&stories.some(x=>x.id===r.storyId)) openStory(r.storyId,r.section,r.charId);
    else if(r.screen==="settings"||r.screen==="ideas") setScreen(r.screen);
    else if((window.location.hash||"#/")!=="#/") window.history.replaceState(null,"","#/");
  },[session,stories,recovery]);

  const pushSave = useCallback(async(payload,id)=>{
    setSaveStatus("saving"); setSaveError("");
    const summary=mkSummary(payload);
    try {
      const { error } = await db.from("stories").update({ data:payload, title:payload.storyTitle||"新しいストーリー", summary, updated_at:new Date().toISOString() }).eq("id",id);
      if(error) throw error;
      setStories(prev=>prev?prev.map(s=>s.id===id?{...s,title:payload.storyTitle,summary,updated_at:new Date().toISOString()}:s):prev);
      setSaveStatus("saved");
    } catch(e){
      setSaveStatus("error");
      setSaveError(navigator.onLine===false ? "インターネットに接続していません。" : (e&&e.message?e.message:"原因が分かりませんでした。"));
    }
  },[]);

  useEffect(()=>{
    if(!openData||!openId||!session) return;
    const t=setTimeout(()=>pushSave(openData,openId),1500);
    return ()=>clearTimeout(t);
  },[openData]);

  const saveMeta=useCallback(async(patch)=>{ if(!session) return; await db.from("user_meta").update({...patch,updated_at:new Date().toISOString()}).eq("user_id",session.user.id); },[session]);

  const changeTheme=(k)=>{ setTheme(k); localStorage.setItem("sc_theme",k); applyTheme(k,dark,serifHeads); forceRender(x=>x+1); saveMeta({settings:{theme:k,darkMode:dark,serifHeads}}); };
  const changeDark=(v)=>{ setDark(v); localStorage.setItem("sc_dark",v?"1":"0"); applyTheme(theme,v,serifHeads); forceRender(x=>x+1); saveMeta({settings:{theme,darkMode:v,serifHeads}}); };
  const changeSerif=(v)=>{ setSerifHeads(v); localStorage.setItem("tl_serif",v?"1":"0"); applyTheme(theme,dark,v); forceRender(x=>x+1); saveMeta({settings:{theme,darkMode:dark,serifHeads:v}}); };

  const openStory=async(id,sec,chId)=>{
    setScreen("editor"); setOpenId(id); setOpenData(null); setLoadError("");
    setSection(sec||null); setCharRoute(chId||null);
    try {
      const { data:row, error } = await db.from("stories").select("data").eq("id",id).single();
      if(error) throw error;
      setOpenData(norm(row?row.data:{}));
    } catch(e){
      setLoadError(navigator.onLine===false ? "インターネットに接続していません。電波の届く場所でもう一度お試しください。" : (e&&e.message?e.message:"作品を読み込めませんでした。"));
    }
  };
  const backToList=()=>{ setScreen("list"); setOpenId(null); setOpenData(null); setSection(null); setCharRoute(null); };

  // ---- デモモード：通信は一切せず、この端末の中だけで動く ----
  const startDemo=()=>{ const d=buildSample(); setDemoData(d); setOpenData(d); setDemo(true); setOpenId("demo"); setScreen("editor"); };
  const exitDemo=()=>{
    if(!demoData){ setDemo(false); return; }
    setConfirmBox({ title:"デモを終了しますか",
      body:"デモで書いた内容は保存されません。続きを残したい場合は、先に「JSONでバックアップ」を取っておいてください。\n\nアカウントを作れば、そのファイルを読み込んで続きから書けます。",
      okLabel:"終了する", run:()=>{ setDemo(false); setDemoData(null); setOpenData(null); setOpenId(null); setScreen("list"); } });
  };

  const createStory=async()=>{
    const d=norm({}); d.storyTitle="新しい作品";
    const maxOrder=stories.reduce((m,s)=>Math.max(m,s.sort_order),-1);
    const { data:ins } = await db.from("stories").insert({user_id:session.user.id,title:d.storyTitle,data:d,sort_order:maxOrder+1,summary:mkSummary(d)}).select("id,title,sort_order,updated_at,summary").single();
    if(ins){ setStories([...stories,{id:ins.id,title:ins.title,sort_order:ins.sort_order,updated_at:ins.updated_at,summary:ins.summary}]); setScreen("editor"); setOpenId(ins.id); setOpenData(d); setSection(null); setCharRoute(null); }
  };
  const duplicateStory=async(id)=>{
    const { data:src } = await db.from("stories").select("data,title").eq("id",id).single();
    if(!src) return;
    const d={...norm(src.data),storyTitle:`${src.title}のコピー`};
    const maxOrder=stories.reduce((m,s)=>Math.max(m,s.sort_order),-1);
    const { data:ins } = await db.from("stories").insert({user_id:session.user.id,title:d.storyTitle,data:d,sort_order:maxOrder+1,summary:mkSummary(d)}).select("id,title,sort_order,updated_at,summary").single();
    if(ins) setStories([...stories,{id:ins.id,title:ins.title,sort_order:ins.sort_order,updated_at:ins.updated_at,summary:ins.summary}]);
  };
  const deleteStory=async(id)=>{
    let removed=null, error=null;
    try { const r = await db.from("stories").delete().eq("id",id).select("id"); removed=r.data; error=r.error; }
    catch(e){ return "通信に失敗しました。\n"+(e&&e.message?e.message:String(e)); }
    if(error) return "削除できませんでした。\n"+error.message;
    if(!removed||removed.length===0) return "削除できませんでした。\nこの作品を削除する権限がありません。別のアカウントで作られた作品か、ログインの有効期限が切れている可能性があります。一度ログアウトして入り直してください。";
    setStories(stories.filter(s=>s.id!==id));
    if(openId===id){ backToList(); }
    return null;
  };
  const renameStory=async(id,title)=>{ const t=title.trim()||"（無題）"; await db.from("stories").update({title:t}).eq("id",id); setStories(stories.map(s=>s.id===id?{...s,title:t}:s)); };
  const moveStory=async(idx,dir)=>{
    const arr=[...stories]; const ni=idx+dir; if(ni<0||ni>=arr.length) return;
    [arr[idx],arr[ni]]=[arr[ni],arr[idx]];
    const reordered=arr.map((s,i)=>({...s,sort_order:i}));
    setStories(reordered);
    for(const s of reordered){ await db.from("stories").update({sort_order:s.sort_order}).eq("id",s.id); }
  };

  const addIdea=async(text)=>{ const next=[...ideas,{id:uid(),text,tags:[],createdAt:new Date().toISOString(),linkedStoryId:null}]; setIdeas(next); await saveMeta({ideas:next}); };
  const deleteIdea=async(id)=>{ const next=ideas.filter(i=>i.id!==id); setIdeas(next); await saveMeta({ideas:next}); };

  if(authLoading) return <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg }}><div style={{ fontSize:13,color:C.hint }}>読み込み中...</div></div>;
  if(demo) return (
    <div style={{ height:"100%",maxWidth:isDesktop?"none":480,margin:"0 auto",background:C.bg,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:C.accent+"14",borderBottom:`0.5px solid ${C.accent}`,flexShrink:0 }}>
        <Ico n="bulb" s={14} c={C.accent}/>
        <span style={{ fontSize:11,color:C.accent,flex:1,minWidth:0 }}>デモモード・保存されません</span>
        <button onClick={exitDemo} style={{ border:`0.5px solid ${C.accent}`,background:"transparent",color:C.accent,borderRadius:20,padding:"3px 11px",fontSize:11,cursor:"pointer",fontFamily:"inherit",flexShrink:0 }}>終了して登録</button>
      </div>
      <div style={{ flex:1,minHeight:0 }}>
        {openData
          ? <StoryEditor data={openData} setData={d=>{ setOpenData(d); setDemoData(d); }} onBack={exitDemo} saveStatus="demo" online={true}/>
          : <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.hint }}>読み込み中...</div>}
      </div>
      {confirmBox&&(
        <Modal compact title={confirmBox.title} onClose={()=>setConfirmBox(null)} footer={<><Btn onClick={()=>setConfirmBox(null)}>キャンセル</Btn><div style={{ flex:1 }}/><Btn variant="primary" onClick={()=>{ confirmBox.run&&confirmBox.run(); setConfirmBox(null); }}>{confirmBox.okLabel}</Btn></>}>
          <div style={{ fontSize:13,color:C.text,lineHeight:1.95,whiteSpace:"pre-line" }}>{confirmBox.body}</div>
        </Modal>
      )}
    </div>
  );

  if(recovery&&session) return <div style={{ height:"100%",maxWidth:480,margin:"0 auto",background:C.bg }}><NewPasswordScreen onDone={()=>{ setRecovery(false); history.replaceState(null,"",window.location.pathname); }}/></div>;
  if(!session) return <div style={{ height:"100%",maxWidth:480,margin:"0 auto",background:C.bg }}><LoginScreen onDemo={startDemo}/></div>;
  if(stories===null) return <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg }}><div style={{ fontSize:13,color:C.hint }}>データを読み込み中...</div></div>;

  const ErrorPane = ({ text, onRetry, onBack }) => (
    <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:26 }}>
      <div style={{ maxWidth:340,textAlign:"center" }}>
        <div style={{ fontFamily:C.display,fontSize:17,color:C.text,marginBottom:10 }}>読み込めませんでした</div>
        <div style={{ fontSize:12.5,color:C.sub,lineHeight:1.95,marginBottom:18,wordBreak:"break-word" }}>{text}</div>
        <div style={{ display:"flex",gap:8,justifyContent:"center" }}>
          {onBack&&<Btn onClick={onBack}>作品一覧へ</Btn>}
          {onRetry&&<Btn variant="primary" onClick={onRetry}>もう一度試す</Btn>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ height:"100%",maxWidth:isDesktop?"none":480,margin:"0 auto",background:C.bg,position:"relative",overflow:"hidden" }}>
      {screen==="list"&&loadError&&stories.length===0&&<ErrorPane text={loadError} onRetry={()=>window.location.reload()}/>}
      {screen==="list"&&!(loadError&&stories.length===0)&&<StoryList stories={stories} onOpen={openStory} onCreate={createStory} onDuplicate={duplicateStory} onDelete={deleteStory} onRename={renameStory} onMove={moveStory} onOpenSettings={()=>setScreen("settings")} onOpenIdeas={()=>setScreen("ideas")}/>}
      {screen==="editor"&&(openData
        ? <StoryEditor data={openData} setData={setOpenData} onBack={backToList} saveStatus={saveStatus} saveError={saveError} online={online} onRetrySave={()=>pushSave(openData,openId)} route={{section,charId:charRoute}} onNavigate={(sec,chId)=>{ setSection(sec); setCharRoute(chId); }}/>
        : loadError
          ? <ErrorPane text={loadError} onBack={backToList} onRetry={()=>openStory(openId)}/>
          : <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}><div style={{ fontSize:13,color:C.hint }}>作品を読み込み中...</div></div>)}
      {screen==="settings"&&<SettingsScreen onBack={()=>setScreen("list")} theme={theme} dark={dark} serifHeads={serifHeads} onTheme={changeTheme} onDark={changeDark} onSerif={changeSerif} email={session.user.email} onLogout={()=>db.auth.signOut()}/>}
      {screen==="ideas"&&<IdeasScreen onBack={()=>setScreen("list")} ideas={ideas} onAdd={addIdea} onDelete={deleteIdea}/>}
    </div>
  );
}

export default App;
