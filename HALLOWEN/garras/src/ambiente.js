(function(w){'use strict';w.TiagoHorrorFondo={mount(options){
if(!options.background||!options.title)throw new Error('Faltan los contenedores reales de fondo y marca.');
if(!w.TiagoGarras||!w.TiagoTerror)throw new Error('Carga efecto.js y terror-sprite.js antes de ambiente.js.');
const host=options.background,root=document.createElement('div');root.className='ts-ambiente';root.setAttribute('aria-hidden','true');
const wall=document.createElement('div');wall.className='ts-profundidad';wall.style.backgroundImage='url('+JSON.stringify(new URL(options.wall,document.baseURI).href)+')';root.append(wall);
for(const name of ['ts-sombra','ts-bruma','ts-bruma dos']){const layer=document.createElement('div');layer.className=name;root.append(layer)}
const apparitionSlot=document.createElement('div');apparitionSlot.className='ts-presencia-fondo';root.append(apparitionSlot);host.prepend(root);
const appearance=w.TiagoTerror.mount(apparitionSlot,{image:options.sprite,autoplay:false,loop:false,onError:options.onError});
const claws=w.TiagoGarras.mount({title:options.title,background:host,hand:options.hand,blood:options.blood,autoplay:true,loop:true,restMs:24000});
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),ctrl=new AbortController(),signal=ctrl.signal;let paused=false,destroyed=false,startTimer=null,endTimer=null;
function clear(){clearTimeout(startTimer);clearTimeout(endTimer);startTimer=null;endTimer=null;apparitionSlot.classList.remove('visible')}
function schedule(delay=8000){if(paused||destroyed||document.hidden||reduced.matches)return;clearTimeout(startTimer);startTimer=setTimeout(()=>{if(paused||destroyed||document.hidden||reduced.matches)return;apparitionSlot.classList.add('visible');appearance.play();endTimer=setTimeout(()=>{apparitionSlot.classList.remove('visible');schedule(24000)},6500)},delay)}
function sync(){const blocked=paused||document.hidden||reduced.matches;root.classList.toggle('pausado',blocked);claws.pause(blocked);appearance.pause(blocked);if(blocked)clear();else schedule()}
function pause(value=true){paused=value;sync()}
reduced.addEventListener('change',sync,{signal});document.addEventListener('visibilitychange',sync,{signal});
if(reduced.matches||document.hidden)sync();else schedule();
return{pause,play(){if(!paused&&!reduced.matches&&!document.hidden)claws.play()},destroy(){destroyed=true;clear();ctrl.abort();appearance.destroy();claws.destroy();root.remove()}};
}}})(window);
