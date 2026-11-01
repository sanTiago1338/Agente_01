(function(w){'use strict';w.TiagoGarras={mount(options){
const title=options.title,background=options.background;
if(!title||!background)throw new Error('Indica el título real y el contenedor decorativo de fondo.');
const signalController=new AbortController(),signal=signalController.signal,motion=matchMedia('(prefers-reduced-motion: reduce)');
const oldPosition=title.style.position,oldIsolation=title.style.isolation;
if(getComputedStyle(title).position==='static')title.style.position='relative';title.style.isolation='isolate';
const hands=document.createElement('span');hands.className='ts-agarre';hands.setAttribute('aria-hidden','true');
for(let i=0;i<2;i++){const img=document.createElement('img');img.src=options.hand;img.alt='';img.className='ts-garra'+(i?' derecha':'');hands.append(img)}title.append(hands);
const blood=document.createElement('div');blood.className='ts-sangre';blood.setAttribute('aria-hidden','true');const texture=document.createElement('img');texture.src=options.blood;texture.alt='';blood.append(texture);background.append(blood);
let stopped=false,running=false,timer=null,repeatTimer=null,destroyed=false;
function reset(){clearTimeout(timer);clearTimeout(repeatTimer);timer=null;repeatTimer=null;running=false;hands.classList.remove('activo');blood.classList.remove('activo')}
function play(){if(destroyed||stopped||running||motion.matches||document.hidden)return;reset();running=true;void hands.offsetWidth;hands.classList.add('activo');blood.classList.add('activo');timer=setTimeout(()=>{hands.classList.remove('activo');blood.classList.remove('activo');running=false;if(options.loop)repeatTimer=setTimeout(play,options.restMs??18000)},7100)}
function pause(value=true){stopped=value;if(value)reset();else if(options.loop)play()}
function environment(){if(document.hidden||motion.matches)reset();else if(options.loop&&!stopped)play()}
motion.addEventListener('change',environment,{signal});document.addEventListener('visibilitychange',environment,{signal});
if(options.autoplay)repeatTimer=setTimeout(play,options.delayMs??1200);
return{play,pause,destroy(){destroyed=true;reset();signalController.abort();hands.remove();blood.remove();title.style.position=oldPosition;title.style.isolation=oldIsolation}};
}}})(window);
