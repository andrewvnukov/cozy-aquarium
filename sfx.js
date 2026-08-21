'use strict';
// ============================================================
// sfx.js — процедурные звуки и лёгкий эмбиент-луп. Никаких аудиофайлов —
// весь звук синтезируется на лету движком ZzFXMicro (Frank Force, MIT/CC0,
// https://killedbyapixel.github.io/ZzFX/), портированным сюда без зависимости
// от LittleJS (в шаблоне используется ванильный Canvas2D).
// GAME: подбери частоты/тембр под тему игры — на сайте ZzFX Sound Designer
// жми Export -> "ZzFX Call Arguments" и вставляй массив в SFX ниже.
// ============================================================
const audioDefaultSampleRate = 44100;
let audioCtx = null, masterGain = null;
function ensureAudio(){
  if(audioCtx) return audioCtx;
  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = .6;
    masterGain.connect(audioCtx.destination);
  }catch(e){}
  return audioCtx;
}
// разблокировка звука по первому касанию (автоплей-политики браузеров/WebView)
addEventListener("pointerdown", ()=>{ const ctx=ensureAudio(); if(ctx&&ctx.state!=="running") ctx.resume().catch(()=>{}); }, {once:true, passive:true});

// Пауза/возврат звука (урок модерации §1.3 и §4.7): вызывается игрой при потере
// фокуса вкладки и на время показа рекламы. resumeAudio возвращает звук только
// если паузу ставили мы (не ломает autoplay-политику до первого тапа игрока).
let audioPausedByGame=false;
function pauseAudio(){
  audioPausedByGame=true;
  if(audioCtx) audioCtx.suspend().catch(()=>{});
}
function resumeAudio(){
  if(!audioPausedByGame) return;
  audioPausedByGame=false;
  if(audioCtx && !document.hidden) audioCtx.resume().catch(()=>{});
}

const rand = (a=1,b=0) => b+(a-b)*Math.random();

// ---------- ZzFXMicro: генерация сэмплов по параметрам ----------
function zzfxG(volume=1, randomness=.05, frequency=220, attack=0, sustain=0, release=.1,
  shape=0, shapeCurve=1, slide=0, deltaSlide=0, pitchJump=0, pitchJumpTime=0, repeatTime=0,
  noise=0, modulation=0, bitCrush=0, delay=0, sustainVolume=1, decay=0, tremolo=0, filter=0){
  let sampleRate=audioDefaultSampleRate, PI2=Math.PI*2,
    startSlide=slide*=500*PI2/sampleRate/sampleRate,
    startFrequency=frequency*=(1+rand(randomness,-randomness))*PI2/sampleRate,
    modOffset=0, repeat=0, crush=0, jump=1, length, b=[], t=0, i=0, s=0, f,
    quality=2, w=PI2*Math.abs(filter)*2/sampleRate,
    cosw=Math.cos(w), alpha=Math.sin(w)/2/quality,
    a0=1+alpha, a1=-2*cosw/a0, a2=(1-alpha)/a0,
    b0=(1+Math.sign(filter)*cosw)/2/a0, b1=-(Math.sign(filter)+cosw)/a0, b2=b0,
    x2=0, x1=0, y2=0, y1=0;
  const minAttack=9;
  attack=attack*sampleRate||minAttack; decay*=sampleRate; sustain*=sampleRate; release*=sampleRate;
  delay*=sampleRate; deltaSlide*=500*PI2/sampleRate**3; modulation*=PI2/sampleRate;
  pitchJump*=PI2/sampleRate; pitchJumpTime*=sampleRate; repeatTime=repeatTime*sampleRate|0;
  for(length=attack+decay+sustain+release+delay|0; i<length; b[i++]=s*volume){
    if(!(++crush%(bitCrush*100|0))){
      s = shape? shape>1? shape>2? shape>3? shape>4?
          (t/PI2%1 < shapeCurve/2? 1:-1):
          Math.sin(t**3):
          Math.max(Math.min(Math.tan(t),1),-1):
          1-(2*t/PI2%2+2)%2:
          1-4*Math.abs(Math.round(t/PI2)-t/PI2):
          Math.sin(t);
      s = (repeatTime? 1-tremolo+tremolo*Math.sin(PI2*i/repeatTime) : 1) *
          (shape>4?s:Math.sign(s)*Math.abs(s)**shapeCurve) *
          (i<attack? i/attack :
           i<attack+decay? 1-((i-attack)/decay)*(1-sustainVolume) :
           i<attack+decay+sustain? sustainVolume :
           i<length-delay? (length-i-delay)/release*sustainVolume : 0);
      s = delay? s/2 + (delay>i? 0 : (i<length-delay? 1:(length-i)/delay) * b[i-delay|0]/2/volume) : s;
      if(filter) s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
    }
    f=(frequency+=slide+=deltaSlide)*Math.cos(modulation*modOffset++);
    t+=f+f*noise*Math.sin(i**5);
    if(jump && ++jump>pitchJumpTime){ frequency+=pitchJump; startFrequency+=pitchJump; jump=0; }
    if(repeatTime && !(++repeat%repeatTime)){ frequency=startFrequency; slide=startSlide; jump=jump||1; }
  }
  return b;
}
function playBuffer(samples, volume=1, loop=false){
  const ctx=ensureAudio(); if(!ctx) return;
  const buf=ctx.createBuffer(1, samples.length, audioDefaultSampleRate);
  buf.getChannelData(0).set(samples);
  const src=ctx.createBufferSource(); src.buffer=buf; src.loop=loop;
  const g=ctx.createGain(); g.gain.value=volume;
  src.connect(g).connect(masterGain);
  src.start(0);
  return src;
}
function zzfx(...params){ return playBuffer(zzfxG(...params)); }

// ---------- GAME: набор эффектов — замени частоты/тембр под тему игры ----------
// GAME: тема «подводный аквариум» — мягкие водяные «блюпы», пузырёк-подъём на монете,
// тёплый колокольчик на покупке, глухой низкий «плюх» на ошибке.
const SFX = {
  tap:  [.5,0,420,.01,.03,.08,0,1.4,-6,0,0,0,0,.2,0,0,0,.5,.03],  // «плюп» падающего корма
  coin: [.5,0,700,.02,.05,.13,0,1.2,0,0,520,.05,0,0,0,0,0,.7,.03], // всплывающий пузырёк
  buy:  [.6,0,523,.02,.09,.2,0,1.6,0,0,180,.07,.12,0,0,0,0,.85,.05],// тёплый колокольчик (новая рыбка)
  error:[.45,0,120,.03,.06,.14,0,.6,0,0,0,0,0,.3,0,.1,0,.6,.05],   // глухой «плюх»
};
function sfx(name){ try{ zzfx(...SFX[name]); }catch(e){} }

// ---------- GAME: короткий эмбиент-луп (2 пэда внахлёст, бесшовно зациклен) ----------
// Подбери frequency двух нот под тональность игры (терция/квинта друг от друга).
let musicSrc=null;
// Фоновая музыка — генеративный подводный эмбиент-луп (~27 c, ля-минор, 72 BPM):
// пэд-аккорды Am–F–C–G, мягкий бас и редкие «капельные» колокольчики с эхом.
// Композиция один раз рендерится в буфер из нот ZzFX и крутится бесшовным лупом.
const NOTE_HZ = m => 440*Math.pow(2,(m-69)/12); // midi -> Гц
function mixInto(mix, samples, offset, gain){
  for(let i=0;i<samples.length;i++){ const j=offset+i; if(j<mix.length) mix[j]+=samples[i]*gain; }
}
function buildSong(){
  const sr=audioDefaultSampleRate, beat=60/72, BEATS=32;
  const mix=new Float32Array(Math.round(BEATS*beat*sr));
  const at=(b,arr,gain)=>mixInto(mix,arr,Math.round(b*beat*sr),gain);
  // пэды по 4 доли: Am — F — C — G (два круга)
  const pads=[[45,48,52],[41,45,48],[48,52,55],[43,47,50]];
  for(let bar=0;bar<8;bar++){
    const ch=pads[bar%4];
    ch.forEach((m,i)=> at(bar*4, zzfxG(.5,0,NOTE_HZ(m),.9,beat*2.8,1.4,0,1,0,0,0,0,0,0,0,0,0,.7,.12), .16-i*.02));
    at(bar*4, zzfxG(.55,0,NOTE_HZ(ch[0]-12),.08,beat*1.6,.6,1,1.2,0,0,0,0,0,0,0,0,0,.7,.08), .17); // мягкий бас
  }
  // редкая «капельная» мелодия пентатоникой ля-минора, с эхом — подводное настроение
  const mel=[[0,76,2],[3,74,1],[4,72,2],[7,69,1],
             [8,74,2],[11,72,1],[12,69,3],
             [16,76,2],[19,79,1],[20,81,2],[23,79,1],
             [24,76,2],[26,74,1],[27,72,1],[28,69,4]];
  mel.forEach(p=> at(p[0], zzfxG(.5,0,NOTE_HZ(p[1]),.02,beat*p[2]*.4,.9,0,1.5,0,0,0,0,0,0,0,0,.15,.55,.12), .13));
  // пузырьковый акцент раз в круг
  at(14, zzfxG(.4,0,NOTE_HZ(88),.01,.03,.3,0,2,6,0,0,0,0,0,0,0,.12,.5,.05), .07);
  at(30, zzfxG(.4,0,NOTE_HZ(86),.01,.03,.3,0,2,6,0,0,0,0,0,0,0,.12,.5,.05), .07);
  // нормализация с запасом от клиппинга
  let peak=0; for(let i=0;i<mix.length;i++){ const a=Math.abs(mix[i]); if(a>peak) peak=a; }
  if(peak>0){ const k=.8/peak; for(let i=0;i<mix.length;i++) mix[i]*=k; }
  return mix;
}
function startMusic(){
  if(musicSrc) return;
  const ctx=ensureAudio(); if(!ctx) return;
  try{ musicSrc=playBuffer(buildSong(), .38, true); }catch(e){}
}
function stopMusic(){ if(musicSrc){ try{ musicSrc.stop(); }catch(e){} musicSrc=null; } }
