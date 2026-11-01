(function(global){'use strict';
const frames=[{n:0,ms:650},{n:1,ms:320},{n:2,ms:350},{n:3,ms:400},{n:4,ms:1100},{n:5,ms:400},{n:6,ms:350},{n:7,ms:650}];
global.TiagoTerror={mount(slot,options={}){
if(!slot)throw new Error('Falta el contenedor decorativo.');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const controller=new AbortController(),signal=controller.signal;
const root=document.createElement('div');root.className='ts-secuencia';root.setAttribute('aria-hidden','true');
const url=new URL(options.image||'assets/images/aparicion-sprite.png',document.baseURI).href;
const layers=[0,1].map(()=>{const l=document.createElement('div');l.className='ts-fotograma';l.style.backgroundImage='url('+JSON.stringify(url)+')';root.append(l);return l});
const veil=document.createElement('div');veil.className='ts-velo';root.append(veil);slot.append(root);
let visible=0,position=0,timer=null,destroyed=false,paused=false,running=false,ready=false;
const preload=new Image();
function paint(n){const next=1-visible;layers[next].style.backgroundPosition=(n%4/3*100)+'% '+(Math.floor(n/4)*100)+'%';layers[next].classList.add('visible');layers[visible].classList.remove('visible');visible=next;root.dataset.frame=String(n+1);if(options.onFrame)options.onFrame(n+1)}
function clear(){if(timer!==null)clearTimeout(timer);timer=null}
function stop(){clear();running=false}
function advance(){if(destroyed||paused||document.hidden||reduced.matches){stop();return}const f=frames[position];paint(f.n);timer=setTimeout(()=>{position++;if(position<frames.length)advance();else{running=false;if(options.loop)timer=setTimeout(play,options.restMs??2400)}},f.ms)}
function play(){if(destroyed||paused||running||!ready||document.hidden||reduced.matches)return;clear();running=true;position=0;advance()}
function pause(value=true){paused=value;root.toggleAttribute('data-pausa',paused);if(paused)stop();else if(options.loop)play()}
function environment(){if(document.hidden||reduced.matches){stop();if(reduced.matches&&ready)paint(0)}else if(options.loop&&!paused)play()}
preload.onload=()=>{if(destroyed)return;ready=true;paint(0);if(options.autoplay)play()};
preload.onerror=()=>{if(destroyed)return;stop();root.dataset.error='imagen-no-disponible';if(options.onError)options.onError(new Error('No se pudo cargar la secuencia de terror.'))};
preload.src=url;
reduced.addEventListener('change',environment,{signal});document.addEventListener('visibilitychange',environment,{signal});
return {play,pause,destroy(){destroyed=true;stop();controller.abort();preload.onload=null;preload.onerror=null;root.remove()},get running(){return running}};
}};
})(window);
