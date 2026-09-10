(function(){
'use strict';
var C=window.Courtside,canvas=document.getElementById('court');
if(!canvas||!canvas.getContext||!canvas.getContext('2d'))return;
var camera=new C.Camera();
camera.mode='broadcast';
var renderer=new C.Renderer(canvas,camera,new C.Settings()),engine=new C.Engine('rally');
engine.players[0].x=-1.7;
engine.players[1].x=1.2;
engine.ball={x:1.4,y:-3,z:2};
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var raf=0,last=performance.now();
function pose(now){
  var t=now/1000;
  engine.players[0].x=-1.7+Math.sin(t*.7)*.35;
  engine.players[1].x=1.2+Math.cos(t*.55)*.4;
  engine.ball.x=1.4+Math.sin(t*.9)*2.1;
  engine.ball.y=-3+Math.cos(t*.45)*5.2;
  engine.ball.z=1.05+Math.abs(Math.sin(t*1.35))*1.55;
}
function frame(now){
  var dt=Math.min(.05,(now-last)/1000);
  last=now;
  pose(now);
  renderer.draw(engine,1,dt);
  raf=requestAnimationFrame(frame);
}
renderer.draw(engine,1,0);
window.addEventListener('resize',function(){renderer.resize();if(reduce)renderer.draw(engine,1,0);});
if(!reduce)raf=requestAnimationFrame(frame);
window.addEventListener('pagehide',function(){cancelAnimationFrame(raf);});
})();
