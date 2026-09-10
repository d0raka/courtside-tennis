(function(){
'use strict';
var C=window.Courtside,$=function(id){return document.getElementById(id);},settings=new C.Settings(),network=null,player=0,mode='',phase='join',shot='flat',angle=0,spin=0,ready=false,joined=false,permissionBusy=false,lastSwing=-Infinity,wake=null,calibrationTimer=0,chargeTimer=0,pressed=0,flashTimer=0,feedbackTimer=0,loadBusy=false,pendingPlayer=0,skipPractice=false;
var motion=new C.Motion(function(power,meta){swing(power,meta);},function(a,s){if(mode!=='motion'||!ready)return;angle=a;spin=s;$('aim').value=a;sendAim();});
var roomMatch=location.search.match(/[?&]room=(\d{6})(?:&|$)/),remembered=C.storage.session('controller'),hideTimer=0;
if(roomMatch)$('pin').value=roomMatch[1];
else if(remembered)$('pin').value=remembered.room;
motion.setStyle(settings.get('motionStyle','natural'));
motion.setHand(settings.get('motionHand','right'));
$('play-style').value=motion.style;
$('play-hand').value=motion.hand;

function say(text){if($('status').textContent!==text)$('status').textContent=text;}
function show(next){phase=next;['join','setup','playstyle','handedness','calibration','ready-screen','play'].forEach(function(id){$(id).hidden=id!==next;});}
function haptic(){try{if(navigator.vibrate)navigator.vibrate(18);}catch(e){}}
function pulse(text){haptic();$('swing').classList.add('flash');clearTimeout(flashTimer);flashTimer=setTimeout(function(){$('swing').classList.remove('flash');},110);$('live-feedback').textContent=text;}
function keepAwake(){if(!navigator.wakeLock||document.hidden||wake&&!wake.released)return;try{navigator.wakeLock.request('screen').then(function(value){wake=value;},function(){});}catch(e){}}
function setReady(value){ready=!!value;if(network)network.setReady(ready&&joined&&!document.hidden);if(ready)keepAwake();}
function remember(){if(!player||!/^\d{6}$/.test($('pin').value))return;var prev=C.storage.session('controller')||{};C.storage.session('controller',{room:$('pin').value,player:player,mode:mode||prev.mode||''});}
function hasSavedMotion(){return !!settings.get('motionReady',false);}
function saveMotionPrefs(){settings.set('motionStyle',motion.style);settings.set('motionHand',motion.hand);settings.set('motionReady',true);}
function motionReadyCopy(){return 'Tilt the phone to run along the baseline. You steer the player — the court only helps with a last step. Swing through the ball. Leave Flat on to let the swing choose topspin or slice.';}

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
  $('p1').disabled=$('p2').disabled=true;$('leave').hidden=false;say('Connecting to your court…');
  network=new C.Network(false,$('pin').value,{
    open:function(){$('connection').textContent='CONNECTING';},
    claimed:function(p){
      player=p;joined=true;$('p1').disabled=$('p2').disabled=false;
      $('connection').textContent='CONNECTED';
      $('identity').textContent='PLAYER 0'+p;
      $('room-label').textContent='ROOM '+$('pin').value;
      document.body.style.setProperty('--accent',C.config.colors[p-1]);
      var saved=C.storage.session('controller')||{};
      if(mode){show(ready?'play':'ready-screen');setReady(ready);remember();say(ready?'Reconnected. The court will count you back in.':'Reconnected. Tap Ready when you are set.');}
      else if(saved.mode==='touch'){activateTouch();say('Reconnected. Tap Ready when you are set.');}
      else{remember();show('setup');say('Connected as Player '+p+'. Set up your racket.');}
    },
    rejected:function(message){say(message);network.destroy();network=null;joined=false;show('join');$('p1').disabled=$('p2').disabled=false;$('connection').textContent='CHOOSE PLAYER';},
    offline:function(){joined=false;$('connection').textContent='RECONNECTING';say('Connection interrupted. Your match is paused. Reconnecting…');
    },
    error:function(message){say(message);$('p1').disabled=$('p2').disabled=false;},
    feedback:function(data){
      if(!data)return;
      $('live-feedback').textContent=data.text||'';
      if(data.type==='hit'||data.type==='serve')haptic();
      clearTimeout(feedbackTimer);
      feedbackTimer=setTimeout(function(){$('live-feedback').textContent='LOOK UP AT THE COURT';},1600);
    },
    state:function(s){
      if(!s||phase!=='play')return;
      if(s.phase==='SERVING'&&ready)$('live-feedback').textContent=s.server===player-1?'YOUR SERVE · SWING THROUGH THE TOSS':'P'+(s.server+1)+' SERVES';
      else if(s.phase==='COUNTDOWN')say('Eyes on the court. Get ready…');
      else if(s.phase==='RECONNECTING')say('Match paused. Waiting for both players.');
      else if(s.phase==='PAUSED')say('Match paused on the main screen.');
      else if(s.phase==='RALLY')say('Rally '+s.rally+' · '+s.points.join(' : '));
      else if(s.phase==='MATCH_END')say('Match complete. Choose Play again on the court.');
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

function activateTouch(){
  clearInterval(calibrationTimer);
  motion.calibrating=false;
  mode='touch';
  setReady(false);
  show('ready-screen');
  $('ready-copy').textContent='Drag to run and aim. You move the player; a last step helps if the ball is close. Hold SWING to charge, or tap for a normal shot.';
  $('mode-label').textContent='TOUCH';
  remember();
  say('Touch controls are ready.');
}
$('touch').onclick=activateTouch;
$('cancel-calibration').onclick=activateTouch;
$('style-touch').onclick=activateTouch;

function openPlaystyle(){
  setReady(false);
  $('use-saved').hidden=!hasSavedMotion();
  show('playstyle');
  say('Choose the swing that feels like you.');
}
function pickStyle(style){
  motion.setStyle(style);
  $('play-style').value=style;
  if(!motion.customThreshold){
    $('sensitivity').value=String(motion.profile().base);
    applySensitivity();
  }
  show('handedness');
  say('Righty or lefty — aim will match.');
}
$('style-flick').onclick=function(){pickStyle('flick');};
$('style-natural').onclick=function(){pickStyle('natural');};
$('style-full').onclick=function(){pickStyle('full');};
$('use-saved').onclick=function(){
  motion.setStyle(settings.get('motionStyle','natural'));
  motion.setHand(settings.get('motionHand','right'));
  $('play-style').value=motion.style;
  $('play-hand').value=motion.hand;
  skipPractice=true;
  beginCalibration(true);
};
$('hand-right').onclick=function(){motion.setHand('right');$('play-hand').value='right';beginCalibration(false);};
$('hand-left').onclick=function(){motion.setHand('left');$('play-hand').value='left';beginCalibration(false);};
$('hand-back').onclick=openPlaystyle;

$('motion').onclick=function(){
  if(permissionBusy)return;
  permissionBusy=true;
  setReady(false);
  $('motion').disabled=true;
  motion.enable().then(function(orientation){
    mode='motion';
    $('mode-label').textContent='MOTION';
    if(!orientation)say('Motion enabled. Use the aim slider if tilt aiming is unavailable.');
    openPlaystyle();
  },function(error){say(error.message);}).then(function(){permissionBusy=false;$('motion').disabled=false;});
};

function finishMotionSetup(){
  if(motion.finish()){
    mode='motion';
    saveMotionPrefs();
    remember();
    show('ready-screen');
    $('ready-copy').textContent=motionReadyCopy();
    say(motion.practiceHit?'Nice swing. That is your timing. Tap Ready when you are set.':'Grip locked in. Tap Ready when you are set.');
  }else{
    show('setup');
    say('No usable motion data arrived. Choose touch, or retry motion permissions.');
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
  $('skip-practice').hidden=true;
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
    $('skip-practice').hidden=false;
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
$('skip-practice').onclick=function(){skipPractice=true;clearInterval(calibrationTimer);finishMotionSetup();};

$('ready').onclick=function(){if(!joined)return say('Waiting to reconnect. You can leave and join again.');if(!mode)return;show('play');setReady(true);$('unready').textContent='Take a break';say('Ready. Start the match on the main screen.');};
$('back-controls').onclick=function(){setReady(false);show('setup');};
$('controls').onclick=function(){setReady(false);show('setup');};
$('recalibrate').onclick=function(){if(!motion.enabled){show('setup');return;}openPlaystyle();};

function sendAim(){if(network&&joined&&ready)network.input({type:'aim',angle:angle,spin:spin,shot:shot,move:angle,timestamp:Date.now()});}
function swing(intensity,meta){
  var now=performance.now();
  if(!ready||!joined||!network||!network.online||document.hidden||now-lastSwing<250)return;
  lastSwing=now;
  pulse('SWING');
  $('power').value=intensity;
  var nextShot=shot;
  var nextSpin=mode==='motion'?spin:0;
  if(mode==='motion'&&meta){
    if(C.finite(meta.spin))nextSpin=meta.spin;
    if(shot==='flat'&&meta.shot&&meta.shot!=='flat')nextShot=meta.shot;
  }
  network.input({type:'swing',angle:angle,spin:nextSpin,shot:nextShot,intensity:intensity,move:angle,timestamp:Date.now()});
}
function down(e){if(!ready||!joined)return;if(e)e.preventDefault();pressed=performance.now();haptic();$('swing').classList.add('flash');clearInterval(chargeTimer);chargeTimer=setInterval(function(){$('power').value=C.clamp(.4+(performance.now()-pressed)/1000,.4,1);},50);if(e&&e.pointerId!==undefined&&$('swing').setPointerCapture){try{$('swing').setPointerCapture(e.pointerId);}catch(err){}}}
function up(e){if(!pressed)return;if(e)e.preventDefault();var duration=performance.now()-pressed;pressed=0;clearInterval(chargeTimer);$('swing').classList.remove('flash');swing(duration<150?.62:C.clamp(.4+duration/1000,.4,1));}
function cancel(){pressed=0;clearInterval(chargeTimer);$('swing').classList.remove('flash');}
if(window.PointerEvent){$('swing').addEventListener('pointerdown',down);$('swing').addEventListener('pointerup',up);$('swing').addEventListener('pointercancel',cancel);}
else{$('swing').addEventListener('touchstart',down,{passive:false});$('swing').addEventListener('touchend',up,{passive:false});$('swing').addEventListener('touchcancel',cancel);}
$('swing').onkeydown=function(e){if((e.key===' '||e.key==='Enter')&&!e.repeat)down(e);};
$('swing').onkeyup=function(e){if(e.key===' '||e.key==='Enter')up(e);};
$('aim').oninput=function(){angle=Number(this.value);sendAim();};

var buttons=document.querySelectorAll('[data-shot]');
Array.prototype.forEach.call(buttons,function(button){
  button.onclick=function(){
    shot=button.getAttribute('data-shot');
    Array.prototype.forEach.call(buttons,function(b){b.setAttribute('aria-pressed',String(b===button));});
    haptic();
  };
});

(function(){var savedSens=String(settings.get('sensitivity','16')),map={26:'24',18:'16',12:'11'};if(['24','16','11','custom'].indexOf(savedSens)<0)savedSens=map[savedSens]||'16';$('sensitivity').value=savedSens;})();
$('custom-threshold').value=settings.get('threshold',16);
function applySensitivity(){
  var custom=$('sensitivity').value==='custom';
  $('custom-label').hidden=$('custom-threshold').hidden=!custom;
  var value=Number(custom?$('custom-threshold').value:$('sensitivity').value);
  motion.setThreshold(value,custom);
  settings.set('sensitivity',$('sensitivity').value);
  settings.set('threshold',motion.threshold);
}
$('sensitivity').onchange=applySensitivity;
$('custom-threshold').oninput=applySensitivity;
applySensitivity();
$('play-style').onchange=function(){motion.setStyle(this.value);settings.set('motionStyle',motion.style);if(!motion.customThreshold){$('sensitivity').value=String(motion.profile().base);applySensitivity();}say('Swing style set to '+motion.style+'.');};
$('play-hand').onchange=function(){motion.setHand(this.value);settings.set('motionHand',motion.hand);say(motion.hand==='left'?'Lefty aim is on.':'Righty aim is on.');};

$('leave').onclick=function(){
  clearInterval(calibrationTimer);cancel();setReady(false);
  if(network)network.leave();
  network=null;joined=false;player=0;mode='';motion.calibrated=false;
  C.storage.session('controller',null);
  show('join');$('leave').hidden=true;$('p1').disabled=$('p2').disabled=false;
  $('connection').textContent='NOT CONNECTED';
  if(wake)wake.release();
  say('Choose a player to join.');
};

function orientationChanged(){
  if(mode==='motion'&&motion.calibrated){
    motion.rezero();
    say('Phone rotated. Aim recentered — keep playing, or recalibrate if it feels off.');
  }
  cancel();
}
window.addEventListener('orientationchange',orientationChanged);
if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',orientationChanged);

document.addEventListener('visibilitychange',function(){
  cancel();
  clearTimeout(hideTimer);
  if(document.hidden){
    if(phase==='calibration'||phase==='playstyle'||phase==='handedness'){
      clearInterval(calibrationTimer);
      motion.calibrating=false;
      show('setup');
      setReady(false);
    }
    hideTimer=setTimeout(function(){
      if(!document.hidden)return;
      setReady(false);
      if(phase==='play'){$('unready').textContent='Ready again';say('Welcome back. Tap Ready again to resume safely.');}
    },2000);
  }else{
    keepAwake();
    if(ready&&joined&&network)network.setReady(true);
    if(network&&!network.online)network.schedule();
  }
});

var diagnosticsTimer=setInterval(function(){
  if($('advanced').open){
    $('diagnostics').textContent='Ping: '+(network&&network.ping!==null?network.ping+' ms':'waiting')+'\nPackets/s: '+(network?network.packetRate:0)+'\nForce: '+motion.force.toFixed(1)+'\nAim: '+angle.toFixed(2)+' · Spin: '+spin.toFixed(2)+'\nStyle: '+motion.style+' · '+motion.hand+'\nGrip: '+(motion.calibrated?'calibrated':'not calibrated')+'\nNoise: '+motion.noise.toFixed(1)+' · Axis: '+['X','Y','Z'][motion.axis]+'\nGyro scale: '+motion.gyroScale;
  }
  if(mode==='motion'&&ready&&performance.now()-motion.lastSample>5000){
    setReady(false);
    $('unready').textContent='Ready again';
    say('Motion data stopped. Open Controls and choose touch, or recalibrate.');
  }
},1000);
if(/[?&]debug=1/.test(location.search))$('advanced').open=true;
window.addEventListener('pagehide',function(){
  clearTimeout(hideTimer);setReady(false);
  if(network)network.destroy();
  motion.destroy();
  clearInterval(diagnosticsTimer);clearInterval(calibrationTimer);clearInterval(chargeTimer);
  clearTimeout(flashTimer);clearTimeout(feedbackTimer);
});
window.addEventListener('pageshow',function(e){if(e.persisted)location.reload();});
if(remembered&&remembered.room===$('pin').value)choose(remembered.player);
})();
