(function(root){
'use strict';
var C=root.Courtside;
C.Motion=function(onSwing,onAim){
  this.onSwing=onSwing;
  this.onAim=onAim;
  this.enabled=false;
  this.calibrating=false;
  this.calibrated=false;
  this.rezeroing=false;
  this.gamma=0;
  this.beta=0;
  this.neutral=[0,0];
  this.noise=0;
  this.force=0;
  this.axis=0;
  this.energy=[0,0,0];
  this.gravity=null;
  this.armed=true;
  this.tracking=false;
  this.trackStart=0;
  this.peak=0;
  this.peakAt=0;
  this.lift=0;
  this.lastSwing=-Infinity;
  this.lastAim=0;
  this.lastSample=0;
  this.lastMag=0;
  this.angle=0;
  this.spin=0;
  this.shotHint='flat';
  this.threshold=16;
  this.customThreshold=false;
  this.samples=0;
  this.sum=0;
  this.style='natural';
  this.hand='right';
  this.gyroScale=1;
  this.maxGyro=0;
  this.practicePeak=0;
  this.practiceHit=false;
  this.phase='idle';
  var self=this;
  this.motionHandler=function(e){self.motion(e);};
  this.orientationHandler=function(e){self.orientation(e);};
};
C.Motion.STYLES={
  flick:{id:'flick',base:11,cooldown:260,settle:.36,peakHold:55,gyroWeight:.72,powerScale:20},
  natural:{id:'natural',base:16,cooldown:320,settle:.42,peakHold:80,gyroWeight:.62,powerScale:28},
  full:{id:'full',base:22,cooldown:400,settle:.5,peakHold:110,gyroWeight:.5,powerScale:36}
};
C.Motion.prototype.profile=function(){return C.Motion.STYLES[this.style]||C.Motion.STYLES.natural;};
C.Motion.prototype.setStyle=function(style){
  this.style=C.Motion.STYLES[style]?style:'natural';
  if(!this.customThreshold)this.threshold=this.profile().base;
};
C.Motion.prototype.setHand=function(hand){this.hand=hand==='left'?'left':'right';};
C.Motion.prototype.setThreshold=function(value,custom){
  if(!C.finite(value))return;
  this.threshold=C.clamp(value,6,48);
  this.customThreshold=!!custom;
};
C.Motion.prototype.enable=function(){
  var self=this;
  if(!root.isSecureContext||!root.DeviceMotionEvent)return Promise.reject(new Error('Motion is unavailable here. Choose touch controls.'));
  var m=typeof root.DeviceMotionEvent.requestPermission==='function'?root.DeviceMotionEvent.requestPermission():Promise.resolve('granted');
  var o=root.DeviceOrientationEvent&&typeof root.DeviceOrientationEvent.requestPermission==='function'?root.DeviceOrientationEvent.requestPermission():Promise.resolve('granted');
  return Promise.all([m,o.catch(function(){return 'denied';})]).then(function(results){
    if(results[0]!=='granted')throw new Error('Motion access was denied. Touch controls are ready to use.');
    if(!self.enabled){
      root.addEventListener('devicemotion',self.motionHandler);
      root.addEventListener('deviceorientation',self.orientationHandler);
      self.enabled=true;
    }
    return results[1]==='granted';
  });
};
C.Motion.prototype.calibrate=function(opts){
  opts=opts||{};
  if(opts.style)this.setStyle(opts.style);
  if(opts.hand)this.setHand(opts.hand);
  this.calibrating=true;
  this.calibrated=false;
  this.rezeroing=false;
  this.samples=0;
  this.sum=0;
  this.sumG=0;
  this.sumB=0;
  this.started=performance.now();
  this.gravity=null;
  this.energy=[0,0,0];
  this.armed=false;
  this.tracking=false;
  this.practicePeak=0;
  this.practiceHit=false;
  this.maxGyro=0;
  this.gyroScale=1;
  this.phase='still';
  this.force=0;
};
C.Motion.prototype.rezero=function(){
  if(!this.calibrated)return;
  this.rezeroing=true;
  this.rezeroStarted=performance.now();
  this.rezeroSamples=0;
  this.rezeroG=0;
  this.rezeroB=0;
};
C.Motion.prototype.finish=function(){
  this.calibrating=false;
  this.phase='idle';
  if(this.samples<15)return false;
  this.neutral=[this.sumG/this.samples,this.sumB/this.samples];
  this.noise=this.sum/this.samples;
  if(this.maxGyro>0&&this.maxGyro<14&&this.practicePeak>8)this.gyroScale=57.2958;
  var style=this.profile(),fromNoise=this.noise*3+6,fromSwing=this.practicePeak>8?this.practicePeak*.38:0;
  if(!this.customThreshold){
    var next=Math.max(style.base,fromNoise);
    if(fromSwing)next=C.clamp(fromSwing,style.base*.7,style.base*1.55);
    this.threshold=C.clamp(next,8,40);
  }
  this.calibrated=true;
  this.force=0;
  this.armed=false;
  this.tracking=false;
  this.lastSwing=performance.now();
  return true;
};
C.Motion.prototype.screenAngle=function(){
  var rotation=root.screen&&root.screen.orientation?root.screen.orientation.angle:root.orientation||0;
  return ((rotation%360)+360)%360;
};
C.Motion.prototype.sideTilt=function(){
  var rotation=this.screenAngle(),g=this.gamma-this.neutral[0],b=this.beta-this.neutral[1];
  if(rotation===90)return b;
  if(rotation===270||rotation===-90)return -b;
  if(rotation===180)return -g;
  return g;
};
C.Motion.prototype.orientation=function(e){
  if(C.finite(e.gamma))this.gamma=e.gamma;
  if(C.finite(e.beta))this.beta=e.beta;
  if(this.rezeroing){
    this.rezeroSamples++;
    this.rezeroG+=this.gamma;
    this.rezeroB+=this.beta;
    if(performance.now()-this.rezeroStarted>=380&&this.rezeroSamples>=6){
      this.neutral=[this.rezeroG/this.rezeroSamples,this.rezeroB/this.rezeroSamples];
      this.rezeroing=false;
      this.angle=0;
    }
    return;
  }
  if(!this.calibrated||document.hidden)return;
  var desired=C.clamp(this.sideTilt()/32,-1,1);
  if(this.hand==='left')desired=-desired;
  this.angle+=.28*(desired-this.angle);
  if(Math.abs(this.angle)<.05)this.angle=0;
  var rawSpin=C.clamp((this.beta-this.neutral[1])/38,-1,1);
  this.spin+=.2*(rawSpin-this.spin);
  var now=performance.now();
  if(now-this.lastAim>50){this.lastAim=now;this.onAim(this.angle,this.spin);}
};
C.Motion.prototype.readAccel=function(e){
  var a=e.acceleration,v,i;
  if(a&&C.finite(a.x)&&C.finite(a.y)&&C.finite(a.z)){
    v=[a.x,a.y,a.z];
    if(!this.gravity)this.gravity=[0,0,9.81];
    return v;
  }
  a=e.accelerationIncludingGravity;
  if(!a||!C.finite(a.x)||!C.finite(a.y)||!C.finite(a.z))return null;
  var raw=[a.x,a.y,a.z];
  if(!this.gravity){this.gravity=raw.slice();return null;}
  v=[];
  var moving=this.force>8;
  for(i=0;i<3;i++){
    v[i]=raw[i]-this.gravity[i];
    this.gravity[i]+=(moving?.02:.055)*(raw[i]-this.gravity[i]);
  }
  return v;
};
C.Motion.prototype.readGyro=function(e){
  var r=e.rotationRate;
  if(!r)return {mag:0,beta:0,vec:[0,0,0]};
  var a=C.finite(r.alpha)?r.alpha:0,b=C.finite(r.beta)?r.beta:0,g=C.finite(r.gamma)?r.gamma:0;
  var mag=Math.sqrt(a*a+b*b+g*g)*this.gyroScale;
  if(mag>this.maxGyro)this.maxGyro=mag;
  return {mag:mag,beta:b*this.gyroScale,vec:[a,b,g]};
};
C.Motion.prototype.energyFrom=function(accMag,gyroMag){
  var gw=this.profile().gyroWeight;
  if(gyroMag<=0)gw=0;
  return (1-gw)*accMag+gw*(gyroMag/14);
};
C.Motion.prototype.fire=function(peak){
  var style=this.profile(),power=C.clamp(.28+(peak-this.threshold)/style.powerScale,.22,1);
  var spin=C.clamp(this.lift/28,-1,1);
  this.spin=spin;
  this.shotHint=spin>.35?'topspin':spin<-.35?'slice':'flat';
  this.tracking=false;
  this.armed=false;
  this.lastSwing=performance.now();
  this.force=peak;
  this.onSwing(power,{spin:spin,shot:this.shotHint,energy:peak});
};
C.Motion.prototype.motion=function(e){
  if(document.hidden)return;
  var v=this.readAccel(e);
  if(!v)return;
  var now=performance.now();
  var dt=this.lastSample?C.clamp((now-this.lastSample)/1000,0.004,0.05):0.016;
  this.lastSample=now;
  var accMag=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
  var gyro=this.readGyro(e);
  var energy=this.energyFrom(accMag,gyro.mag);
  var jerk=Math.abs(accMag-this.lastMag)/Math.max(dt,.008);
  this.lastMag=accMag;
  if(this.calibrating){
    if(now-this.started<2000){
      this.phase='still';
      this.samples++;
      this.sum+=accMag;
      this.sumG+=this.gamma;
      this.sumB+=this.beta;
    }else{
      this.phase='swing';
      for(var axisIndex=0;axisIndex<3;axisIndex++)this.energy[axisIndex]+=v[axisIndex]*v[axisIndex];
      this.axis=this.energy.indexOf(Math.max.apply(Math,this.energy));
      if(energy>this.practicePeak)this.practicePeak=energy;
      if(energy>Math.max(9,this.noise*4+7))this.practiceHit=true;
    }
    return;
  }
  if(!this.calibrated)return;
  for(var n=0;n<3;n++)this.energy[n]=.9*this.energy[n]+.1*v[n]*v[n];
  this.axis=this.energy.indexOf(Math.max.apply(Math,this.energy));
  var style=this.profile();
  var alpha=energy>this.force?.74:.2;
  this.force+=alpha*(energy-this.force);
  var threshold=Math.max(this.threshold,this.noise*2.6+6);
  var quiet=accMag<5.2&&gyro.mag<110&&jerk<18;
  if(this.force<threshold*style.settle){
    this.armed=true;
    this.tracking=false;
  }
  if(quiet&&!this.tracking)return;
  if(this.armed&&!this.tracking&&this.force>threshold&&now-this.lastSwing>style.cooldown){
    this.tracking=true;
    this.trackStart=now;
    this.peak=this.force;
    this.peakAt=now;
    this.lift=0;
    if(this.force>threshold*1.45&&(jerk>22||accMag>threshold||gyro.mag>240)){
      this.fire(this.force);
      return;
    }
  }
  if(this.tracking){
    if(this.gravity)this.lift+=-(v[0]*this.gravity[0]+v[1]*this.gravity[1]+v[2]*this.gravity[2])/9.81;
    this.lift+=gyro.beta*dt*1.4;
    if(this.force>this.peak){this.peak=this.force;this.peakAt=now;}
    var peaked=this.force<this.peak*.82&&now-this.peakAt>=16;
    var held=now-this.trackStart>=style.peakHold&&this.force>=this.peak*.9;
    var stale=now-this.trackStart>140;
    if(peaked||held||stale)this.fire(this.peak);
  }
};
C.Motion.prototype.destroy=function(){
  root.removeEventListener('devicemotion',this.motionHandler);
  root.removeEventListener('deviceorientation',this.orientationHandler);
  this.enabled=false;
};
})(typeof window!=='undefined'?window:globalThis);
