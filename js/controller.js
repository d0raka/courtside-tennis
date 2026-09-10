(function(){
'use strict';
var C=window.Courtside,$=function(id){return document.getElementById(id);},settings=new C.Settings(),network=null,player=0,mode='',phase='join',shot='flat',angle=0,spin=0,ready=false,joined=false,permissionBusy=false,lastSwing=-Infinity,wake=null,calibrationTimer=0,handTimer=0,flashTimer=0,feedbackTimer=0,loadBusy=false,pendingPlayer=0,skipPractice=false,padStart=null,trayTimer=0;
var motion=new C.Motion(function(power,meta){swing(power,meta);},function(a,s){
  if(mode!=='motion'||!ready)return;
  angle=a;spin=s;
  paintTilt(a);
  sendAim();
});
var roomMatch=location.search.match(/[?&]room=(\d{6})(?:&|$)/),remembered=C.storage.session('controller');
if(roomMatch)$('pin').value=roomMatch[1];
else if(remembered)$('pin').value=remembered.room;
motion.setStyle(settings.get('motionStyle','natural'));
motion.setHand(settings.get('motionHand','right'));
$('play-style').value=motion.style;
$('play-hand').value=motion.hand;

function say(text){if($('status')&&$('status').textContent!==text)$('status').textContent=text;}
function show(next){
  phase=next;
  ['join','setup','handedness','calibration','ready-screen','play'].forEach(function(id){var n=$(id);if(n)n.hidden=id!==next;});
  document.body.classList.toggle('playing',next==='play');
  var chrome=$('chrome');
  if(chrome)chrome.hidden=next==='play';
  if($('status'))$('status').hidden=next==='play';
  if($('leave'))$('leave').hidden=next==='play'||!joined;
  if(next!=='play')closeTray();
}
function haptic(){try{if(navigator.vibrate)navigator.vibrate(18);}catch(e){}}
function paintTilt(a){
  var dot=$('tilt-dot');
  if(dot)dot.style.transform='translateX('+(a*86)+'px)';
}
function pulse(text){
  haptic();
  document.body.classList.add('swung');
  clearTimeout(flashTimer);
  flashTimer=setTimeout(function(){document.body.classList.remove('swung');},140);
  if($('live-feedback'))$('live-feedback').textContent=text;
}
function keepAwake(){if(!navigator.wakeLock||document.hidden||wake&&!wake.released)return;try{navigator.wakeLock.request('screen').then(function(value){wake=value;},function(){});}catch(e){}}
function setReady(value){ready=!!value;if(network)network.setReady(ready&&joined&&!document.hidden);if(ready)keepAwake();}
function remember(){if(!player||!/^\d{6}$/.test($('pin').value))return;var prev=C.storage.session('controller')||{};C.storage.session('controller',{room:$('pin').value,player:player,mode:mode||prev.mode||''});}
function hasSavedMotion(){return !!settings.get('motionReady',false);}
function saveMotionPrefs(){settings.set('motionStyle',motion.style);settings.set('motionHand',motion.hand);settings.set('motionReady',true);}

function choose(n){
  if(!/^\d{6}$/.test($('pin').value))return say('Enter the six-digit code on the TV.');
  if(loadBusy)return;
  pendingPlayer=n;
  if(!window.RTCPeerConnection)return say('This browser cannot connect to the court. Try Safari or Chrome on your phone.');
  if(typeof window.Peer!=='function'){
    loadBusy=true;$('p1').disabled=$('p2').disabled=true;say('Loading controller connection…');
    var script=document.createElement('script');
    script.src='peerjs.min.js';
    script.onload=function(){loadBusy=false;connect(pendingPlayer);};
    script.onerror=function(){loadBusy=false;$('p1').disabled=$('p2').disabled=false;say('Connection tools could not load. Tap your player to retry.');};
    document.head.appendChild(script);
  }else connect(n);
}
function connect(n){
  if(network)network.destroy();
  joined=false;player=n;setReady(false);
  $('p1').disabled=$('p2').disabled=true;if($('leave'))$('leave').hidden=false;say('Connecting to your court…');
  network=new C.Network(false,$('pin').value,{
    open:function(){$('connection').textContent='CONNECTING';},
    claimed:function(p){
      player=p;joined=true;$('p1').disabled=$('p2').disabled=false;
      $('connection').textContent='CONNECTED';
      $('identity').textContent='PLAYER 0'+p;
      if($('room-label'))$('room-label').textContent='ROOM '+$('pin').value;
      document.body.style.setProperty('--accent',C.config.colors[p-1]);
      var saved=C.storage.session('controller')||{};
      if(mode){enterPlay(ready);remember();say(ready?'Reconnected. Eyes on the court.':'Reconnected. Finishing setup…');}
      else if(saved.mode==='touch'){activateGestures(true);say('Reconnected. Drag to run, flick to swing.');}
      else{remember();beginMotion();}
    },
    rejected:function(message){say(message);network.destroy();network=null;joined=false;show('join');$('p1').disabled=$('p2').disabled=false;$('connection').textContent='CHOOSE PLAYER';},
    offline:function(){joined=false;$('connection').textContent='RECONNECTING';say('Connection interrupted. Your match is paused. Reconnecting…');},
    error:function(message){say(message);$('p1').disabled=$('p2').disabled=false;},
    feedback:function(data){
      if(!data)return;
      if($('live-feedback'))$('live-feedback').textContent=data.text||'';
      if(data.type==='hit'||data.type==='serve')haptic();
      clearTimeout(feedbackTimer);
      feedbackTimer=setTimeout(function(){if($('live-feedback'))$('live-feedback').textContent='LOOK AT THE TV';},1600);
    },
    state:function(s){
      if(!s||phase!=='play')return;
      if(s.phase==='SERVING'&&ready&&$('live-feedback'))$('live-feedback').textContent=s.server===player-1?'YOUR SERVE · SWING THE PHONE':'P'+(s.server+1)+' SERVES';
      else if(s.phase==='COUNTDOWN')say('Eyes on the court.');
      else if(s.phase==='RECONNECTING')say('Match paused. Waiting for both players.');
      else if(s.phase==='PAUSED')say('Match paused on the TV.');
      else if(s.phase==='RALLY')say('Rally '+s.rally+' · '+s.points.join(' : '));
      else if(s.phase==='MATCH_END')say('Match complete. Start again on the TV.');
    },
    lobby:function(s){
      if(!joined||!s||!s.players)return;
      var mine=s.players[player-1];
      if(ready&&!document.hidden&&mine&&mine.connected&&!mine.ready)network.setReady(true);
    }
  });
  network.wanted=n;
  var identityKey='identity.'+$('pin').value+'.'+n;
  var savedToken=C.storage.session(identityKey);
  if(savedToken)network.token=savedToken;
  else C.storage.session(identityKey,network.token);
}
$('p1').onclick=function(){choose(1);};
$('p2').onclick=function(){choose(2);};
$('pin').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();if(!/^\d{6}$/.test($('pin').value))return say('Enter the six-digit code on the TV.');say('Choose P1 or P2 to join.');$('p1').focus();}});
$('pin').addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').slice(0,6);});

function enterPlay(alreadyReady){
  show('play');
  if($('racket-hint'))$('racket-hint').textContent=mode==='motion'?'Tilt to run · Swing the phone':'Drag to run · Flick to swing';
  setReady(!!alreadyReady||true);
  say(mode==='motion'?'Ready. Look at the TV. Tilt and swing — no buttons.':'Ready. Look at the TV. Drag and flick — no buttons.');
}

function activateGestures(autoPlay){
  clearInterval(calibrationTimer);
  clearInterval(handTimer);
  motion.calibrating=false;
  mode='touch';
  remember();
  if(autoPlay)enterPlay(true);
  else{
    show('ready-screen');
    if($('ready-copy'))$('ready-copy').textContent='The whole screen is the racket. Drag to run. Flick to swing. Then look at the TV.';
    say('Gesture racket is ready.');
  }
}

function beginMotion(){
  if(permissionBusy)return;
  permissionBusy=true;
  setReady(false);
  motion.enable().then(function(orientation){
    mode='motion';
    if(!orientation)say('Motion is on. If tilt feels off, hold still and we will recenter.');
    if(hasSavedMotion()){
      motion.setStyle(settings.get('motionStyle','natural'));
      motion.setHand(settings.get('motionHand','right'));
      beginCalibration(true);
    }else{
      show('handedness');
      listenHand();
      say('Tilt the phone toward your racket hand.');
    }
  },function(error){
    say(error.message);
    show('setup');
    if($('setup-copy'))$('setup-copy').textContent=error.message+' The whole screen can still be a racket: drag to run, flick to swing.';
  }).then(function(){permissionBusy=false;});
}

function listenHand(){
  clearInterval(handTimer);
  var picked=false;
  handTimer=setInterval(function(){
    if(picked||phase!=='handedness')return;
    var g=motion.gamma||0;
    var needle=$('hand-needle');
    if(needle)needle.style.transform='translateX('+C.clamp(g,-28,28)*2.2+'px)';
    if(g>16){picked=true;chooseHand('right');}
    else if(g<-16){picked=true;chooseHand('left');}
    else if($('hand-status'))$('hand-status').textContent=Math.abs(g)<6?'Waiting for a clear tilt…':g>0?'Tilting righty…':'Tilting lefty…';
  },80);
  setTimeout(function(){
    if(picked||phase!=='handedness')return;
    picked=true;
    chooseHand('right');
  },9000);
}
function chooseHand(hand){
  clearInterval(handTimer);
  motion.setHand(hand);
  $('play-hand').value=hand;
  beginCalibration(false);
}

function finishMotionSetup(){
  if(motion.finish()){
    mode='motion';
    saveMotionPrefs();
    remember();
    enterPlay(true);
    say(motion.practiceHit?'Nice swing. Look at the TV.':'Grip locked. Look at the TV.');
  }else{
    show('setup');
    say('No usable motion data arrived. You can play with flicks instead.');
  }
}
function beginCalibration(quick){
  if(!motion.enabled){show('setup');return;}
  setReady(false);
  clearInterval(calibrationTimer);
  skipPractice=!!quick;
  motion.calibrate({style:motion.style,hand:motion.hand});
  show('calibration');
  $('calibration-title').textContent='Hold still.';
  $('calibration-count').textContent='2';
  $('calibration-progress').max=skipPractice?2:5;
  $('calibration-progress').value=0;
  $('calibration-copy').textContent='Hold your natural ready grip. We are listening for a quiet baseline.';
  calibrationTimer=setInterval(function(){
    var elapsed=(performance.now()-motion.started)/1000;
    if(elapsed<2){
      $('calibration-progress').value=Math.min(2,elapsed);
      $('calibration-count').textContent=String(Math.max(1,Math.ceil(2-elapsed)));
      $('calibration-title').textContent='Hold still.';
      $('calibration-copy').textContent='Hold your natural ready grip. We are listening for a quiet baseline.';
      return;
    }
    if(skipPractice){
      clearInterval(calibrationTimer);
      finishMotionSetup();
      return;
    }
    $('calibration-progress').max=5;
    $('calibration-progress').value=Math.min(5,elapsed);
    $('calibration-title').textContent='Now swing.';
    $('calibration-copy').textContent=motion.practiceHit?'Got it. That swing is yours.':'One comfortable swing — the same one you will use on court.';
    $('calibration-count').textContent=motion.practiceHit?'✓':String(Math.max(1,Math.ceil(5-elapsed)));
    if(motion.practiceHit&&elapsed>=2.35||elapsed>=5){
      clearInterval(calibrationTimer);
      finishMotionSetup();
    }
  },80);
}

$('motion').onclick=beginMotion;
$('touch').onclick=function(){activateGestures(true);};
$('ready').onclick=function(){if(!joined)return say('Waiting to reconnect.');if(!mode)return;enterPlay(true);};

function closeTray(){if($('escape-tray'))$('escape-tray').hidden=true;}
function toggleTray(){
  var tray=$('escape-tray');
  if(!tray)return;
  tray.hidden=!tray.hidden;
  haptic();
}

$('unready').onclick=function(){
  if(!joined)return say('Waiting to reconnect.');
  if(!mode)return;
  if(ready){
    setReady(false);
    $('unready').textContent='Ready again';
    say('Break taken. The match is paused.');
  }else{
    enterPlay(true);
    $('unready').textContent='Take a break';
  }
  closeTray();
};
$('controls').onclick=function(){setReady(false);closeTray();show('setup');};
$('recalibrate').onclick=function(){closeTray();if(!motion.enabled){beginMotion();return;}beginMotion();};
$('leave-play').onclick=function(){closeTray();leaveCourt();};
$('leave').onclick=leaveCourt;

function leaveCourt(){
  clearInterval(calibrationTimer);clearInterval(handTimer);setReady(false);
  if(network)network.leave();
  network=null;joined=false;player=0;mode='';motion.calibrated=false;
  C.storage.session('controller',null);
  show('join');$('p1').disabled=$('p2').disabled=false;
  $('connection').textContent='NOT CONNECTED';
  if(wake)wake.release();
  say('Choose a player to join.');
}

function sendAim(){if(network&&joined&&ready)network.input({type:'aim',angle:angle,spin:spin,shot:'flat',move:angle,timestamp:Date.now()});}
function swing(intensity,meta){
  var now=performance.now();
  if(!ready||!joined||!network||!network.online||document.hidden||now-lastSwing<250)return;
  lastSwing=now;
  pulse('SWING');
  var nextShot='flat';
  var nextSpin=mode==='motion'?spin:0;
  if(meta){
    if(C.finite(meta.spin))nextSpin=meta.spin;
    if(meta.shot&&meta.shot!=='flat')nextShot=meta.shot;
  }else if(mode==='motion'&&Math.abs(spin)>.35)nextShot=spin>0?'topspin':'slice';
  network.input({type:'swing',angle:angle,spin:nextSpin,shot:nextShot,intensity:intensity,move:angle,timestamp:Date.now()});
}

var pad=$('racket-pad');
function onPadDown(e){
  if(phase!=='play'||!ready||!joined)return;
  if(e.button!==undefined&&e.button!==0)return;
  e.preventDefault();
  padStart={x:e.clientX,y:e.clientY,t:performance.now()};
  clearTimeout(trayTimer);
  trayTimer=setTimeout(function(){if(padStart)toggleTray();},1150);
  if(e.pointerId!==undefined&&pad.setPointerCapture){try{pad.setPointerCapture(e.pointerId);}catch(err){}}
}
function onPadMove(e){
  if(!padStart||phase!=='play')return;
  e.preventDefault();
  var rect=pad.getBoundingClientRect();
  angle=C.clamp(((e.clientX-rect.left)/Math.max(1,rect.width))*2-1,-1,1);
  paintTilt(angle);
  sendAim();
  var dist=Math.sqrt(Math.pow(e.clientX-padStart.x,2)+Math.pow(e.clientY-padStart.y,2));
  if(dist>22)clearTimeout(trayTimer);
}
function onPadUp(e){
  if(!padStart)return;
  e.preventDefault();
  clearTimeout(trayTimer);
  var dt=performance.now()-padStart.t;
  var dx=e.clientX-padStart.x,dy=e.clientY-padStart.y;
  var dist=Math.sqrt(dx*dx+dy*dy);
  if(mode==='touch'&&dist>52&&dt<340){
    var flickSpin=C.clamp(-dy/150,-1,1);
    swing(C.clamp(dist/210,.42,1),{spin:flickSpin,shot:flickSpin>.35?'topspin':flickSpin<-.35?'slice':'flat'});
  }
  padStart=null;
}
function onPadCancel(){clearTimeout(trayTimer);padStart=null;}
if(pad){
  if(window.PointerEvent){
    pad.addEventListener('pointerdown',onPadDown);
    pad.addEventListener('pointermove',onPadMove);
    pad.addEventListener('pointerup',onPadUp);
    pad.addEventListener('pointercancel',onPadCancel);
  }else{
    pad.addEventListener('touchstart',function(e){if(e.touches[0])onPadDown({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY,preventDefault:function(){e.preventDefault();}});},{passive:false});
    pad.addEventListener('touchmove',function(e){if(e.touches[0])onPadMove({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY,preventDefault:function(){e.preventDefault();}});},{passive:false});
    pad.addEventListener('touchend',function(e){var t=e.changedTouches[0];onPadUp({clientX:t?t.clientX:0,clientY:t?t.clientY:0,preventDefault:function(){e.preventDefault();}});},{passive:false});
  }
}

function applySensitivity(){
  var value=Number($('sensitivity').value||16);
  motion.setThreshold(value,false);
  settings.set('sensitivity',$('sensitivity').value);
  settings.set('threshold',motion.threshold);
}
applySensitivity();

function orientationChanged(){
  if(mode==='motion'&&motion.calibrated){
    motion.rezero();
    say('Phone rotated. Aim recentered — keep playing.');
  }
}
window.addEventListener('orientationchange',orientationChanged);
if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',orientationChanged);

document.addEventListener('visibilitychange',function(){
  onPadCancel();
  if(document.hidden){
    if(phase==='calibration'||phase==='handedness'){
      clearInterval(calibrationTimer);clearInterval(handTimer);
      motion.calibrating=false;
      setReady(false);
      show('setup');
    }
    setTimeout(function(){
      if(!document.hidden)return;
      setReady(false);
      if(phase==='play'){if($('unready'))$('unready').textContent='Ready again';say('Welcome back. Hold still for the menu, then Ready again.');}
    },2000);
  }else{
    keepAwake();
    if(ready&&joined&&network)network.setReady(true);
    if(network&&!network.online)network.schedule();
  }
});

var hideTimer=0;
var diagnosticsTimer=setInterval(function(){
  if($('advanced')&&$('advanced').open&&$('diagnostics')){
    $('diagnostics').textContent='Ping: '+(network&&network.ping!==null?network.ping+' ms':'waiting')+'\nForce: '+motion.force.toFixed(1)+'\nAim: '+angle.toFixed(2);
  }
  if(mode==='motion'&&ready&&performance.now()-motion.lastSample>5000){
    setReady(false);
    if($('unready'))$('unready').textContent='Ready again';
    say('Motion data stopped. Hold still for the menu and try sensors again.');
  }
},1000);

window.addEventListener('pagehide',function(){
  clearTimeout(hideTimer);setReady(false);
  if(network)network.destroy();
  motion.destroy();
  clearInterval(diagnosticsTimer);clearInterval(calibrationTimer);clearInterval(handTimer);clearTimeout(flashTimer);clearTimeout(feedbackTimer);clearTimeout(trayTimer);
});
window.addEventListener('pageshow',function(e){if(e.persisted)location.reload();});
if(remembered&&remembered.room===$('pin').value)choose(remembered.player);
})();
