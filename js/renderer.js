(function(root){
'use strict';
var C=root.Courtside,colors=C.config.colors,clamp=C.clamp;

C.Camera=function(){this.mode='broadcast';this.follow=0;this.zoom=0;this.kick=0;};
C.Camera.prototype.viewports=function(w,h){
  if(this.mode!=='split')return [{x:0,y:0,w:w,h:h,player:0}];
  return w/h>1.2?[{x:0,y:0,w:w/2-2,h:h,player:0},{x:w/2+2,y:0,w:w/2-2,h:h,player:1}]:[{x:0,y:0,w:w,h:h/2-2,player:0},{x:0,y:h/2+2,w:w,h:h/2-2,player:1}];
};

C.Renderer=function(canvas,camera,settings){
  this.canvas=canvas;
  this.ctx=canvas.getContext('2d');
  this.camera=camera;
  this.settings=settings;
  this.trail=[];
  this.particles=[];
  this.flash=0;
  this.kick=0;
  this.cheer=0;
  this.clock=0;
  this.w=0;
  this.h=0;
  this.resize();
};

C.Renderer.prototype.resize=function(){
  var r=this.canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,1.5);
  var scale=Math.min(dpr,1920/Math.max(1,r.width),1440/Math.max(1,r.height));
  this.w=Math.max(1,Math.round(r.width*scale));
  this.h=Math.max(1,Math.round(r.height*scale));
  this.canvas.width=this.w;
  this.canvas.height=this.h;
};

C.Renderer.prototype.effect=function(e){
  if(this.settings.get('effects',true)===false)return;
  if(e.type==='hit'){this.flash=e.text==='PERFECT'?.32:e.text==='GOOD'?.18:.12;this.kick=1;}
  if(e.type==='serve'){this.flash=.16;this.kick=.7;}
  if(e.type==='point'||e.type==='game'||e.type==='match')this.cheer=1;
  if((e.type==='hit'||e.type==='bounce')&&e.at){
    var n=e.type==='hit'?18:5,i;
    for(i=0;i<n;i++){
      var a=i*2.15;
      this.particles.push({x:e.at.x,y:e.at.y,z:e.at.z,vx:Math.cos(a)*2.8,vy:Math.sin(a)*2.8,vz:1.6,life:.55,color:e.type==='hit'?colors[e.player]:'#fff6a8'});
    }
    if(this.particles.length>80)this.particles.splice(0,this.particles.length-80);
  }
};

C.Renderer.prototype.draw=function(engine,alpha,dt){
  var b=engine.ball,old=engine.previousBall,renderBall=null;
  this.clock+=(dt||0);
  if(b)renderBall={x:old?old.x+(b.x-old.x)*alpha:b.x,y:old?old.y+(b.y-old.y)*alpha:b.y,z:old?old.z+(b.z-old.z)*alpha:b.z};
  if(!renderBall&&engine.state==='SERVING'){
    var sign=engine.score.server===0?1:-1,side=(engine.score.points[0]+engine.score.points[1])%2===0?-.7:.7;
    renderBall={x:side*sign,y:-11.5*sign,z:1.12+Math.sin((engine.time||0)*4)*.1};
  }
  if(renderBall&&(engine.state==='RALLY'||engine.state==='SERVING')&&this.settings.get('effects',true)){
    this.trail.push(renderBall);
    if(this.trail.length>16)this.trail.shift();
  }else this.trail=[];
  for(var i=this.particles.length-1;i>=0;i--){
    var p=this.particles[i];
    p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    if(p.life<=0)this.particles.splice(i,1);
  }
  this.flash=Math.max(0,this.flash-dt);
  this.kick=Math.max(0,this.kick-dt*3.4);
  this.cheer=Math.max(0,this.cheer-dt*.7);
  this.camera.follow+=(b?b.x-this.camera.follow:-this.camera.follow)*Math.min(1,dt*2);
  var serveZoom=engine.state==='SERVING'||engine.state==='COUNTDOWN'?1:0;
  this.camera.zoom=this.camera.zoom||0;
  this.camera.zoom+=(serveZoom-this.camera.zoom)*Math.min(1,dt*2.4);
  var ctx=this.ctx;
  ctx.fillStyle='#6ec4ea';
  ctx.fillRect(0,0,this.w,this.h);
  var views=this.camera.viewports(this.w,this.h);
  for(var n=0;n<views.length;n++)this.viewport(views[n],engine,renderBall);
  if(this.flash>0){
    ctx.fillStyle='rgba(255,255,210,'+(this.flash*.38)+')';
    ctx.fillRect(0,0,this.w,this.h);
  }
};

C.Renderer.prototype.viewport=function(v,engine,ball){
  var ctx=this.ctx,mode=this.camera.mode,player=v.player,flip=player===0?1:-1,w=v.w,h=v.h,self=this;
  var dynamic=mode==='dynamic'&&this.settings.get('effects',true);
  var follow=dynamic?this.camera.follow*.06:0;
  var zoom=1+(this.camera.zoom||0)*(mode==='dynamic'?.1:mode==='split'?.04:.07);
  var shake=this.kick*Math.sin(this.clock*52)*5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x,v.y,w,h);
  ctx.clip();
  ctx.translate(v.x+shake,v.y);

  function project(x,y,z){
    z=z||0;
    var xx=x*flip,yy=y*flip;
    if(mode==='broadcast'){xx=x*.9+y*.28;yy=y*.74-x*.2;}
    var depth=(yy+14.2)/28.4;
    if(mode==='classic'){
      return {x:w/2+xx*w/15.2,y:h*.52-yy*h/30-(z)*w/24,s:w/15.2,d:depth,z:z};
    }
    var fov=mode==='split'?11.4:16.6;
    var scale=w/fov*(1.42-depth*.74)*zoom;
    return {x:w*.5+(xx-follow)*scale,y:h*.86-depth*h*.64-z*scale*.44,s:scale,d:depth,z:z};
  }
  function poly(points,color){
    ctx.fillStyle=color;
    ctx.beginPath();
    for(var i=0;i<points.length;i++){
      var p=project(points[i][0],points[i][1],points[i][2]||0);
      if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  function line(a,b,color,width){
    var p=project(a[0],a[1],a[2]||0),q=project(b[0],b[1],b[2]||0);
    ctx.strokeStyle=color;
    ctx.lineWidth=width||1.5;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
    ctx.lineTo(q.x,q.y);
    ctx.stroke();
  }
  function text(s,x,y,size,color,align){
    ctx.font='700 '+size+'px Arial,Helvetica,sans-serif';
    ctx.fillStyle=color||'#f4fff0';
    ctx.textAlign=align||'left';
    ctx.fillText(s,x,y);
  }

  var sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#3aa4de');
  sky.addColorStop(.38,'#8fd4f2');
  sky.addColorStop(.58,'#d7f0a8');
  sky.addColorStop(1,'#6aa24a');
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,w,h);

  ctx.fillStyle='rgba(255,244,170,.45)';
  ctx.beginPath();
  ctx.arc(w*.78,h*.14,Math.max(18,w/16),0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.arc(w*.78-w/90,h*.14-h/90,Math.max(10,w/28),0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle='rgba(255,255,255,.55)';
  ctx.beginPath();ctx.ellipse(w*.18,h*.16,w*.1,h*.028,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(w*.22,h*.145,w*.07,h*.022,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(w*.62,h*.12,w*.12,h*.03,0,0,Math.PI*2);ctx.fill();

  poly([[-22,-8,0],[-6,-20,0],[6,-20,0],[22,-8,0],[18,4,0],[-18,4,0]],'#5d9a46');
  poly([[-20,2],[20,2],[16,22],[-16,22]],'#4e8a3c');

  function tree(x,y,s){
    var p=project(x,y,0),sc=Math.max(.35,p.s/55)*s;
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.fillStyle='rgba(20,40,16,.28)';
    ctx.beginPath();ctx.ellipse(0,6*sc,14*sc,5*sc,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#6b3a22';
    ctx.fillRect(-2.2*sc,-10*sc,4.4*sc,16*sc);
    ctx.fillStyle='#2f7a38';
    ctx.beginPath();ctx.arc(0,-18*sc,13*sc,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#49a04a';
    ctx.beginPath();ctx.arc(-6*sc,-16*sc,8*sc,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  tree(-9.6,-16.4,1.15);tree(10.2,-15.8,1);tree(-11.4,15.2,.9);tree(11.8,14.6,1.05);tree(-8.4,17.2,.75);tree(8.8,-17.6,.8);

  function bench(x0,x1,y,z0,rows,tint){
    var r;
    for(r=0;r<rows;r++){
      var yy=y+(y>0?r*1.15:-r*1.15),zz=z0+r*.42;
      poly([[x0,yy,zz],[x1,yy,zz],[x1,yy,zz+.38],[x0,yy,zz+.38]],tint[r%2]);
    }
  }
  bench(-13,13,-17.2,0,4,['#d7c4a0','#c9b38c']);
  bench(-13,13,17.2,0,4,['#d7c4a0','#c9b38c']);
  bench(-14.6,-10.4,-12,0,3,['#cbb896','#beaa86']);
  bench(10.4,14.6,-12,0,3,['#cbb896','#beaa86']);

  var cheer=self.cheer,ci,crowd=86;
  for(ci=0;ci<crowd;ci++){
    var side=ci<43?-1:1;
    var fx=(ci%43)/42;
    var cx=(fx-.5)*24;
    var cy=side*(17.6+(ci%4)*.7);
    var hop=cheer>0?Math.abs(Math.sin(self.clock*18+ci))*10*cheer:0;
    var cp=project(cx,cy,.55+hop*.04);
    ctx.fillStyle=ci%5===0?colors[0]:ci%5===1?colors[1]:ci%3===0?'#f2d2b0':'#c57b6a';
    ctx.beginPath();
    ctx.arc(cp.x,cp.y-hop,Math.max(1.6,cp.s*.045),0,Math.PI*2);
    ctx.fill();
  }

  poly([[-8.6,-15.4],[8.6,-15.4],[8.6,15.4],[-8.6,15.4]],'#3f8b48');
  poly([[-6.4,-13.4],[6.4,-13.4],[6.4,13.4],[-6.4,13.4]],'#c9a36a');
  poly([[-6.4,-13.4,0],[-4.115,-11.885,0],[-4.115,11.885,0],[-6.4,13.4,0]],'#b89258');
  poly([[4.115,-11.885,0],[6.4,-13.4,0],[6.4,13.4,0],[4.115,11.885,0]],'#d4b078');

  poly([[-4.115,-11.885,0],[4.115,-11.885,0],[4.115,11.885,0],[-4.115,11.885,0]],'#5f9d4c');
  var gy;
  for(gy=-11.885;gy<11.88;gy+=2.972){
    poly([[-4.115,gy],[4.115,gy],[4.115,Math.min(11.885,gy+1.486)],[-4.115,Math.min(11.885,gy+1.486)]],gy%5.944<2.98?'#6aac55':'#569346');
  }
  poly([[-4.115,-11.885,0],[-4.115,11.885,0],[-4.115,11.885,-.22],[-4.115,-11.885,-.22]],'#3d6f36');
  poly([[4.115,-11.885,0],[4.115,11.885,0],[4.115,11.885,-.22],[4.115,-11.885,-.22]],'#7ab862');

  var boundary='#f4f7e6',lw=Math.max(1.4,w/620);
  line([-4.115,-11.885],[4.115,-11.885],boundary,lw);
  line([-4.115,11.885],[4.115,11.885],boundary,lw);
  line([-4.115,-11.885],[-4.115,11.885],boundary,lw);
  line([4.115,-11.885],[4.115,11.885],boundary,lw);
  line([-4.115,-6.4],[4.115,-6.4],boundary,lw);
  line([-4.115,6.4],[4.115,6.4],boundary,lw);
  line([0,-6.4],[0,6.4],boundary,lw);
  line([0,-11.885],[0,-11.5],boundary,lw);
  line([0,11.885],[0,11.5],boundary,lw);

  for(var k=0;k<2;k++)if(engine.inZone(k)){
    var yy=k===0?-10.6:10.6;
    poly([[-4.1,yy-1.45],[4.1,yy-1.45],[4.1,yy+1.45],[-4.1,yy+1.45]],k===0?'rgba(213,255,97,.3)':'rgba(103,206,255,.3)');
  }

  function avatar(i){
    var pl=engine.players[i],ay=i===0?-11:11,pos=project(pl.x,ay,0);
    var sc=Math.min(1.55,Math.max(.32,pos.s/36));
    var idle=Math.sin((engine.time||self.clock)*7.2+i)* (Math.abs(pl.vx)<.45?3.2:0);
    var hop=(pl.hop||0)*22+idle;
    var lean=clamp((pl.vx||0)*.08,-.5,.5);
    var gait=Math.sin((pl.stride||0)*7.1)*Math.min(1,Math.abs(pl.vx||0)/3.2);
    var near=i===player;
    ctx.save();
    ctx.translate(pos.x,pos.y);
    ctx.scale(sc,sc);
    ctx.fillStyle='rgba(20,40,16,.32)';
    ctx.beginPath();
    ctx.ellipse(lean*12,7,22,7.5,0,0,Math.PI*2);
    ctx.fill();
    ctx.translate(0,-hop);
    ctx.rotate(lean);
    ctx.strokeStyle='#e2c49a';
    ctx.lineWidth=7;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(-8,-14);
    ctx.lineTo(-12+gait*8,8);
    ctx.moveTo(8,-14);
    ctx.lineTo(13-gait*8,8);
    ctx.stroke();
    var body=ctx.createLinearGradient(-16,-48,16,-8);
    body.addColorStop(0,i===0?'#e8ff8a':'#9ae4ff');
    body.addColorStop(1,colors[i]);
    ctx.fillStyle=body;
    ctx.beginPath();
    ctx.moveTo(-5,-46);
    ctx.lineTo(5,-46);
    ctx.quadraticCurveTo(13,-46,13,-36);
    ctx.lineTo(13,-20);
    ctx.quadraticCurveTo(13,-16,-8,-16);
    ctx.lineTo(-8,-16);
    ctx.quadraticCurveTo(-13,-16,-13,-22);
    ctx.lineTo(-13,-36);
    ctx.quadraticCurveTo(-13,-46,-5,-46);
    ctx.fill();
    ctx.fillStyle='#1d3a32';
    ctx.fillRect(-12,-18,24,7);
    var skin=ctx.createRadialGradient(-3,-58,2,0,-54,14);
    skin.addColorStop(0,'#ffe2c0');
    skin.addColorStop(1,'#e3b589');
    ctx.fillStyle=skin;
    ctx.beginPath();
    ctx.arc(0,-56,11,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle=colors[i];
    ctx.beginPath();
    ctx.ellipse(0,-64,12,5,0,0,Math.PI*2);
    ctx.fill();
    ctx.fillRect(-11,-64,22,6);
    ctx.strokeStyle='#e3b589';
    ctx.lineWidth=5.5;
    ctx.beginPath();
    ctx.moveTo(-11,-36);
    ctx.lineTo(-20-gait*4,-24);
    ctx.moveTo(11,-36);
    ctx.lineTo(24+gait*3,-22);
    ctx.stroke();
    ctx.save();
    ctx.translate(24,-22);
    var swing=pl.swing>0?Math.sin(pl.swing/.45*Math.PI)*-2.15:.18;
    ctx.rotate(swing+(pl.aim*.2)+lean*.28);
    ctx.strokeStyle='#f7ffe8';
    ctx.lineWidth=3.4;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(12,-16);
    ctx.stroke();
    ctx.fillStyle='rgba(246,255,214,.16)';
    ctx.strokeStyle='#f4ffe3';
    ctx.lineWidth=2.4;
    ctx.beginPath();
    ctx.ellipse(20,-27,10,14,.48,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle='rgba(255,255,230,.45)';
    ctx.lineWidth=1;
    var rx;
    for(rx=13;rx<28;rx+=4){ctx.beginPath();ctx.moveTo(rx,-38);ctx.lineTo(rx,-16);ctx.stroke();}
    ctx.restore();
    ctx.restore();
    if(near&&mode==='split')text('P'+(i+1),pos.x,pos.y+26*sc,Math.max(12,15*sc),colors[i],'center');
  }

  function drawNet(){
    poly([[-4.7,0,0],[4.7,0,0],[4.7,0,.914],[-4.7,0,.914]],'rgba(18,36,28,.62)');
    var nx;
    for(nx=-4.65;nx<4.7;nx+=.22)line([nx,0,0],[nx,0,.914],'rgba(236,244,220,.28)',.7);
    var nz;
    for(nz=.18;nz<.9;nz+=.18)line([-4.65,0,nz],[4.65,0,nz],'rgba(236,244,220,.26)',.7);
    line([-4.72,0,.914],[4.72,0,.914],'#fff6d8',Math.max(2.2,w/320));
    line([-4.7,0,0],[-4.7,0,1.16],'#d8c07a',4);
    line([4.7,0,0],[4.7,0,1.16],'#d8c07a',4);
  }

  function drawBall(){
    if(!ball)return;
    var ti,t,tp;
    for(ti=0;ti<self.trail.length;ti++){
      t=self.trail[ti];tp=project(t.x,t.y,t.z);
      ctx.globalAlpha=ti/self.trail.length*.4;
      ctx.fillStyle='#f6ff8c';
      ctx.beginPath();
      ctx.arc(tp.x,tp.y,Math.max(2,w/170),0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
    var ground=project(ball.x,ball.y,0),bp=project(ball.x,ball.y,ball.z);
    var toss=engine.state==='SERVING'&&engine.ball&&engine.ball.toss;
    var rad=Math.max(toss?7:5,Math.min(toss?14:11,bp.s*(toss?.26:.18)));
    ctx.fillStyle='rgba(20,40,16,.38)';
    ctx.beginPath();
    ctx.ellipse(ground.x,ground.y,rad*1.15,rad*.42,0,0,Math.PI*2);
    ctx.fill();
    var glow=ctx.createRadialGradient(bp.x-rad*.3,bp.y-rad*.35,1,bp.x,bp.y,rad);
    glow.addColorStop(0,'#f7ffb0');
    glow.addColorStop(.55,'#d8f04a');
    glow.addColorStop(1,'#9bbb1f');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.arc(bp.x,bp.y,rad,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)';
    ctx.lineWidth=1.2;
    ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.85)';
    ctx.lineWidth=1.4;
    ctx.beginPath();
    ctx.arc(bp.x-rad*.18,bp.y,rad*.72,Math.PI*.15,Math.PI*.85);
    ctx.stroke();
  }

  function drawParticles(){
    var pi,particle,pp;
    for(pi=0;pi<self.particles.length;pi++){
      particle=self.particles[pi];
      pp=project(particle.x,particle.y,particle.z);
      ctx.globalAlpha=particle.life/.45;
      ctx.fillStyle=particle.color;
      ctx.beginPath();
      ctx.arc(pp.x,pp.y,3,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  var sprites=[
    {d:project(engine.players[0].x,-11,0).d,fn:function(){avatar(0);}},
    {d:project(engine.players[1].x,11,0).d,fn:function(){avatar(1);}},
    {d:project(0,0,.4).d,fn:drawNet}
  ];
  if(ball)sprites.push({d:project(ball.x,ball.y,ball.z).d,fn:drawBall});
  sprites.sort(function(a,b){return b.d-a.d;});
  for(var si=0;si<sprites.length;si++)sprites[si].fn();
  drawParticles();

  var fontsize=Math.max(12,Math.min(22,w/30)),pad=Math.max(18,w*.04);
  if(mode==='split'){
    text('PLAYER 0'+(player+1),pad,h-pad,fontsize,colors[player]);
    text(engine.inZone(player)?'SWING!':engine.score.server===player&&engine.state==='SERVING'?'YOUR SERVE':'LOOK UP · SWING',w-pad,h-pad,fontsize*.72,'#eef8df','right');
    ctx.fillStyle=colors[player];
    ctx.fillRect(0,h-4,w,4);
  }else{
    text(mode==='broadcast'?'LIVING ROOM COURT':'CENTRE COURT',pad,h-pad,fontsize,'#f3ffe8');
    text(engine.inZone(player)?'SWING!':'',w-pad,h-pad,fontsize*.75,colors[0],'right');
  }
  ctx.restore();
};
})(typeof window!=='undefined'?window:globalThis);
