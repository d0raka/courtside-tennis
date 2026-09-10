(function(root){
'use strict';
var C=root.Courtside,PREFIX='courtside-v2-';

function emptySlot(token, extra){
  var slot={token:token,conn:null,connected:false,ready:false,local:false,lastSeq:0,lastSwing:0,lastAim:0,until:0};
  if(extra)for(var k in extra)if(Object.prototype.hasOwnProperty.call(extra,k))slot[k]=extra[k];
  return slot;
}

C.Network=function(host,room,events){
  this.host=host;
  this.events=events||{};
  this.room=room||'';
  this.closed=false;
  this.online=false;
  this.leaving=false;
  this.peer=null;
  this.connection=null;
  this.connections=[];
  this.slots=[null,null];
  this.sequence=0;
  this.lastState=null;
  this.retry=0;
  this.retries=0;
  this.ping=null;
  this.packets=0;
  this.packetRate=0;
  this.peerState='BOOT';
  this.attemptAt=0;
  this.token=C.storage.session('identity')||C.id();
  C.storage.session('identity',this.token);
  this.wanted=0;
  this.ready=false;
  var saved=host?C.storage.session('room'):null;
  if(saved&&saved.code&&Date.now()-saved.at<3600000){
    this.room=saved.code;
    this.slots=(saved.slots||[]).map(function(p){
      return p&&typeof p.token==='string'?emptySlot(p.token,{until:p.until||Date.now()+C.config.grace}):null;
    });
    if(this.slots.length!==2)this.slots=[null,null];
  }
  if(!this.room&&host)this.room=String(100000+Math.floor(Math.random()*900000));
  var self=this;
  this.interval=setInterval(function(){self.heartbeat();},C.config.heartbeat);
  this.startTimer=setTimeout(function(){self.start();},0);
};

C.Network.prototype.fire=function(type,value){
  if(!this.closed&&this.events[type])this.events[type](value);
};

C.Network.prototype.send=function(conn,data,lossy){
  if(!conn||!conn.open)return false;
  try{
    if(lossy&&conn.dataChannel&&conn.dataChannel.bufferedAmount>4096)return false;
    conn.send(data);
    this.packets++;
    return true;
  }catch(e){return false;}
};

C.Network.prototype.persist=function(){
  if(!this.host)return;
  C.storage.session('room',{
    code:this.room,
    at:Date.now(),
    slots:this.slots.map(function(p){return p?{token:p.token,until:p.until||0}:null;})
  });
};

C.Network.prototype.lobby=function(){
  return {
    room:this.room,
    players:this.slots.map(function(p){
      return {
        connected:!!(p&&p.connected),
        ready:!!(p&&p.ready&&p.connected),
        reserved:!!(p&&!p.connected&&p.until>Date.now())
      };
    })
  };
};

C.Network.prototype.broadcast=function(){
  var s=this.lobby();
  this.fire('lobby',s);
  for(var i=0;i<this.connections.length;i++)this.send(this.connections[i],{t:'LOBBY',d:s});
  this.persist();
};

C.Network.prototype.start=function(){
  if(this.closed)return;
  var self=this;
  if(!root.RTCPeerConnection||typeof root.Peer!=='function'){
    this.peerState='UNSUPPORTED';
    this.fire('error','This browser cannot connect phones. Open the court on another device and mirror it to the TV. Practice is still available.');
    return;
  }
  this.peerState='CONNECTING';
  this.attemptAt=Date.now();
  try{
    var peer=this.host?new root.Peer(PREFIX+this.room,{secure:true,debug:0}):new root.Peer({secure:true,debug:0});
    this.peer=peer;
    peer.on('open',function(){
      if(self.closed||self.peer!==peer)return;
      self.retries=0;
      self.attemptAt=0;
      self.peerState='OPEN';
      if(self.host){self.online=true;self.fire('open',self.room);self.broadcast();}
      else self.connect();
    });
    if(this.host)peer.on('connection',function(c){self.accept(c);});
    peer.on('error',function(e){
      if(self.closed||self.peer!==peer)return;
      self.peerState=e.type||'ERROR';
      self.fire('error',e.type==='peer-unavailable'?'Court not found. Check the code and keep the TV page open. Retrying…':e.type==='unavailable-id'?'This court is already open in another tab. Close that tab, then retry.':'Connection interrupted. Check Wi-Fi and internet access. Retrying…');
      self.schedule();
    });
    peer.on('disconnected',function(){
      if(self.peer!==peer)return;
      self.peerState='SIGNALING OFFLINE';
      self.schedule();
    });
    peer.on('close',function(){
      if(self.peer!==peer)return;
      self.online=false;
      self.fire('offline');
      self.schedule();
    });
  }catch(e){
    this.fire('error','Unable to start multiplayer in this browser. Try another browser or use Practice.');
  }
};

C.Network.prototype.schedule=function(){
  if(this.closed||this.leaving||this.retry)return;
  var self=this;
  this.retry=setTimeout(function(){
    self.retry=0;
    if(self.closed)return;
    if(!self.peer||self.peer.destroyed){self.start();return;}
    if(self.peer.disconnected){
      try{self.peer.reconnect();}catch(e){}
      self.schedule();
    }else if(!self.host)self.connect();
  },Math.min(5000,700*Math.pow(1.5,this.retries++)));
};

C.Network.prototype.connect=function(){
  if(this.closed||(this.connection&&this.connection.open))return;
  if(this.connection)this.connection.close();
  if(!this.peer)return;
  var self=this,c=this.peer.connect(PREFIX+this.room,{serialization:'json',reliable:true});
  this.connection=c;
  c.lastSeen=Date.now();
  c.created=Date.now();
  c.on('open',function(){
    if(self.connection!==c||self.closed){c.close();return;}
    self.online=true;
    self.sequence=0;
    self.retries=0;
    self.fire('open');
    self.claim(self.wanted);
  });
  c.on('data',function(m){
    if(self.connection!==c||!m||typeof m.t!=='string')return;
    c.lastSeen=Date.now();
    if(m.t==='RELEASED'){self.destroy();return;}
    if(m.t==='CLAIMED'){self.fire('claimed',m.player);self.setReady(self.ready);}
    else if(m.t==='REJECT'){self.fire('rejected',m.message);self.wanted=0;}
    else if(m.t==='LOBBY')self.fire('lobby',m.d);
    else if(m.t==='FEEDBACK')self.fire('feedback',m.d);
    else if(m.t==='STATE')self.fire('state',m.d);
    else if(m.t==='PONG'&&C.finite(m.at)){self.ping=Math.max(0,Date.now()-m.at);self.fire('ping',self.ping);}
  });
  c.on('close',function(){
    if(self.connection!==c)return;
    self.online=false;
    self.fire('offline');
    self.schedule();
  });
  c.on('error',function(){
    c.close();
    if(self.connection===c){self.online=false;self.fire('offline');self.schedule();}
  });
};

C.Network.prototype.claim=function(p){
  this.wanted=p;
  if(p===1||p===2)this.send(this.connection,{t:'CLAIM',player:p,token:this.token});
};

C.Network.prototype.accept=function(c){
  var self=this;
  if(this.connections.length>=8){c.on('open',function(){c.close();});return;}
  this.connections.push(c);
  c.lastSeen=Date.now();
  c.created=Date.now();
  c.on('open',function(){self.send(c,{t:'LOBBY',d:self.lobby()});});
  c.on('data',function(m){
    if(!m||typeof m.t!=='string')return;
    c.lastSeen=Date.now();
    if(m.t==='PING'){self.send(c,{t:'PONG',at:C.finite(m.at)?m.at:0});return;}
    var index=-1;
    for(var i=0;i<2;i++)if(self.slots[i]&&self.slots[i].conn===c)index=i;
    if(m.t==='CLAIM'){
      if([1,2].indexOf(m.player)<0||typeof m.token!=='string'||m.token.length<10||m.token.length>100)return;
      var n=m.player-1,p=self.slots[n];
      if(p&&p.token!==m.token&&(p.connected||p.until>Date.now())){
        self.send(c,{t:'REJECT',message:'That player is taken or reconnecting. Choose the other player.'});
        return;
      }
      if(p&&p.connected&&p.conn&&p.conn!==c){
        if(p.token===m.token){
          var stale=p.conn;
          p.conn=c;
          p.connected=true;
          p.ready=false;
          p.lastSeq=0;
          self.send(c,{t:'CLAIMED',player:n+1});
          self.broadcast();
          if(self.lastState)self.send(c,{t:'STATE',d:self.lastState});
          try{if(stale&&stale.close)stale.close();}catch(e){}
          return;
        }
        self.send(c,{t:'REJECT',message:'This controller is already open. Close the other tab first.'});
        return;
      }
      if(index===n){self.send(c,{t:'CLAIMED',player:n+1});return;}
      if(index>=0)self.slots[index]=null;
      self.slots[n]=emptySlot(m.token,{conn:c,connected:true});
      self.send(c,{t:'CLAIMED',player:n+1});
      self.broadcast();
      if(self.lastState)self.send(c,{t:'STATE',d:self.lastState});
      return;
    }
    if(index<0)return;
    var slot=self.slots[index];
    if(m.t==='READY'&&typeof m.value==='boolean'){slot.ready=m.value;self.broadcast();}
    else if(m.t==='RELEASE'){self.slots[index]=null;self.send(c,{t:'RELEASED'});self.broadcast();}
    else if(m.t==='INPUT'&&slot.ready){
      var input=C.normalizeInput(m.d);
      if(!input||!C.finite(m.seq)||m.seq<=slot.lastSeq)return;
      slot.lastSeq=m.seq;
      var now=Date.now(),field=input.type==='swing'?'lastSwing':'lastAim',delay=input.type==='swing'?220:30;
      if(now-slot[field]<delay)return;
      slot[field]=now;
      self.fire('input',{player:index,input:input});
    }
  });
  c.on('close',function(){self.drop(c);});
  c.on('error',function(){self.drop(c);c.close();});
};

C.Network.prototype.drop=function(c){
  var at=this.connections.indexOf(c);
  if(at>=0)this.connections.splice(at,1);
  var changed=false;
  for(var i=0;i<2;i++){
    var p=this.slots[i];
    if(p&&p.conn===c){
      p.connected=false;
      p.ready=false;
      p.conn=null;
      p.until=Date.now()+C.config.grace;
      changed=true;
    }
  }
  if(changed)this.broadcast();
};

C.Network.prototype.setReady=function(value){
  this.ready=!!value;
  var sent=this.send(this.connection,{t:'READY',value:this.ready});
  if(!sent&&this.connection){
    var self=this;
    setTimeout(function(){self.send(self.connection,{t:'READY',value:self.ready});},180);
  }
};

C.Network.prototype.input=function(input){
  if(this.online&&this.ready)this.send(this.connection,{t:'INPUT',seq:++this.sequence,d:input},input.type==='aim');
};

C.Network.prototype.feedback=function(p,data){
  if(this.slots[p]&&this.slots[p].local){this.fire('localFeedback',data);return;}
  this.send(this.slots[p]&&this.slots[p].conn,{t:'FEEDBACK',d:data});
};

C.Network.prototype.state=function(data){
  if(JSON.stringify(data)===JSON.stringify(this.lastState))return;
  this.lastState=data;
  for(var i=0;i<2;i++)this.send(this.slots[i]&&this.slots[i].conn,{t:'STATE',d:data});
};

C.Network.prototype.heartbeat=function(){
  if(this.closed)return;
  this.packetRate=Math.round(this.packets/(C.config.heartbeat/1000));
  this.packets=0;
  var now=Date.now();
  if(this.attemptAt&&now-this.attemptAt>15000){
    var oldPeer=this.peer;
    this.peer=null;
    this.attemptAt=0;
    if(oldPeer)oldPeer.destroy();
    this.fire('error','Connecting is taking too long. Check internet access. Retrying…');
    this.schedule();
  }
  if(this.host){
    var list=this.connections.slice();
    for(var i=0;i<list.length;i++){
      if(now-list[i].lastSeen>C.config.timeout||(now-list[i].created>20000&&!this.slots.some(function(p){return p&&p.conn===list[i];}))){
        this.drop(list[i]);
        list[i].close();
      }
    }
    var changed=false;
    for(var n=0;n<2;n++){
      var p=this.slots[n];
      if(p&&!p.connected&&p.until<=now){this.slots[n]=null;changed=true;}
    }
    if(changed)this.broadcast();
  }else{
    var c=this.connection;
    if(c&&c.open){
      this.send(c,{t:'PING',at:now});
      if(now-c.lastSeen>C.config.timeout){
        c.close();
        this.online=false;
        this.fire('offline');
        this.schedule();
      }
    }else if(c&&now-c.created>8000){
      c.close();
      this.fire('error','Court is not responding. Check the code or return to Join.');
      this.schedule();
    }
  }
};

C.Network.prototype.activateLocal=function(){
  var p=this.slots[0],token='local-'+this.token;
  if(!this.host||(p&&p.token!==token&&(p.connected||p.until>Date.now())))return false;
  this.slots[0]=emptySlot(token,{connected:true,local:true});
  this.broadcast();
  return true;
};

C.Network.prototype.localReady=function(ready){
  if(this.slots[0]&&this.slots[0].local){
    this.slots[0].ready=!!ready;
    this.broadcast();
  }
};

C.Network.prototype.leave=function(){
  var self=this;
  this.leaving=true;
  this.ready=false;
  this.send(this.connection,{t:'RELEASE'});
  this.leaveTimer=setTimeout(function(){self.destroy();},500);
};

C.Network.prototype.destroy=function(){
  this.closed=true;
  clearTimeout(this.leaveTimer);
  clearTimeout(this.startTimer);
  clearTimeout(this.retry);
  clearInterval(this.interval);
  if(this.connection)this.connection.close();
  if(this.peer)this.peer.destroy();
  this.connections=[];
};
})(typeof window!=='undefined'?window:globalThis);
