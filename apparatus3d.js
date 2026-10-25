(function(global){
  'use strict';
  var DEFAULT={yaw:-0.80,pitch:0.24,zoom:1};
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function vec(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function norm(a){var n=Math.hypot(a[0],a[1],a[2])||1;return a.map(function(x){return x/n;});}
  function shade(hex,n){var m=hex.match(/^#([a-f\d]{6})$/i);if(!m)return hex;var h=m[1],l=norm([-.5,.85,1]),d=Math.max(0,n[0]*l[0]+n[1]*l[1]+n[2]*l[2]),k=.56+.48*d+.06*Math.abs(n[1]);return 'rgb('+[0,2,4].map(function(i){return clamp(Math.round(parseInt(h.slice(i,i+2),16)*k),0,255);}).join(',')+')';}
  function mesh(){var all=[];
    function face(v,color,part){all.push({v:v,color:color,part:part,n:norm(cross(vec(v[1],v[0]),vec(v[2],v[0])))});}
    function box(x,y,z,w,h,d,color,part,transform){var a=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]];if(transform)a=a.map(transform);[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]].forEach(function(f){face(f.map(function(i){return a[i];}),color,part);});}
    function cylinder(a,b,r,color,part,segments){var count=segments||18,axis=norm(vec(b,a)),basis=norm(cross(axis,Math.abs(axis[1])<.85?[0,1,0]:[1,0,0])),other=cross(axis,basis),aa=[],bb=[];for(var i=0;i<count;i++){var t=i/count*Math.PI*2,v=[0,1,2].map(function(k){return r*(Math.cos(t)*basis[k]+Math.sin(t)*other[k]);});aa.push(a.map(function(x,k){return x+v[k];}));bb.push(b.map(function(x,k){return x+v[k];}));}for(var j=0;j<count;j++){var k=(j+1)%count;face([aa[j],aa[k],bb[k],bb[j]],color,part);}face(aa.slice().reverse(),color,part);face(bb,color,part);}
    function line(a,b,color,width,dash,arrow){all.push({v:[a,b],line:true,color:color,width:width||1,dash:dash||[],arrow:!!arrow});}
    return{all:all,face:face,box:box,cylinder:cylinder,line:line};
  }
  function layout(mass,extension){
    var shift=Number.isFinite(extension)?clamp(extension*.065,0,.14):Math.max(0,mass-2)*.009;
    var pivot=[-1.35,1.50,0],arm=.39,theta=Math.asin(shift/arm),co=Math.cos(theta),si=Math.sin(theta);
    function turn(p){var x=p[0]-pivot[0],y=p[1]-pivot[1];return[pivot[0]+co*x-si*y,pivot[1]+si*x+co*y,p[2]];}
    var normal=[co,si,0],frontA=turn([-1.35,1.50,-.30]),frontB=turn([-1.35,1.50,.30]),rear=turn([-1.74,1.50,0]);
    var corners=[[-1.475,1.59,-.30],[-1.475,2.03,-.30],[-1.475,2.03,.30],[-1.475,1.59,.30]].map(turn),center=turn([-1.475,1.81,0]);
    var objective=[.943,1.81,0],rulerX=1.00,rulerZ=.50,dx=objective[0]-center[0],dy=objective[1]-center[1],dot=dx*normal[0]+dy*normal[1];
    var toScaleX=2*dot*normal[0]-dx,toScaleY=2*dot*normal[1]-dy,range=rulerX-center[0];
    var point=[center[0],center[1],rulerZ/(1+range/toScaleX)],scale=[rulerX,point[1]+range*toScaleY/toScaleX,rulerZ];
    var incident=norm(vec(point,scale)),outgoing=norm(vec(objective,point)),nd=incident[0]*normal[0]+incident[1]*normal[1]+incident[2]*normal[2],reflected=incident.map(function(v,i){return v-2*nd*normal[i];});
    return{shift:shift,theta:theta,pivot:pivot,turn:turn,frontA:frontA,frontB:frontB,rear:rear,normal:normal,corners:corners,center:center,objective:objective,scale:scale,point:point,incident:incident,outgoing:outgoing,reflected:reflected,reflectionResidual:Math.hypot.apply(null,vec(reflected,outgoing))};
  }
  function geometryLocal(mass,extension){var g=mesh(),b=g.box,c=g.cylinder,line=g.line,L=layout(mass,extension),shift=L.shift,turn=L.turn;
    b(-2.96,.07,-.64,2.4,.14,1.28,'#607581','frame');
    [[-2.74,-.43],[-.78,-.43],[-2.74,.43],[-.78,.43]].forEach(function(p){c([p[0],0,p[1]],[p[0],.10,p[1]],.09,'#7f9099','frame',14);});
    [-2.64,-.98].forEach(function(x){b(x,.2,-.12,.16,2.92,.24,'#76909c','frame');b(x+.015,.23,.125,.034,2.83,.006,'#e1e8ea','frame');});
    b(-2.74,3.08,-.21,2,.18,.42,'#4d7084','frame');
    // A through-slot leaves the sliding lower clamp and the tilted lever plate free.
    function platformRing(x,y,z,w,h,d,color){var x0=-1.88,x1=-1.39,z0=-.29,z1=.29;b(x,y,z,x0-x,h,d,color,'frame');b(x1,y,z,x+w-x1,h,d,color,'frame');b(x0,y,z,x1-x0,h,z0-z,color,'frame');b(x0,y,z1,x1-x0,h,z+d-z1,color,'frame');}
    platformRing(-2.74,1.35,-.42,2,.14,.84,'#7f9aa4');
    platformRing(-2.7,1.475,-.40,1.92,.025,.80,'#d5dee1');
    c([-1.74,2.83,0],[-1.74,3.10,0],.105,'#aebdc4','wire',22);
    c([-1.74,1.27-shift,0],[-1.74,1.50-shift,0],.11,'#9bafb9','wire',22);
    c([-1.74,1.50-shift,0],[-1.74,2.84,0],.008,'#c29c51','wire',8);
    c([-1.74,1.31-shift,0],[-1.74,.91-shift,0],.016,'#b9c4c9','mass',8);
    line([-1.74,.99-shift,0],[-2.12,.70-shift,0],'#8a784f',1.3);
    line([-1.74,.99-shift,0],[-1.36,.70-shift,0],'#8a784f',1.3);
    c([-1.74,.61-shift,0],[-1.74,.67-shift,0],.43,'#b79c55','mass',30);
    for(var i=0;i<Math.round(mass);i++){var y=.67+i*.034-shift;c([-1.74,y,0],[-1.74,y+.029,0],.32,'#d2b86b','mass',28);}
    c([-1.74,.67-shift,0],[-1.74,.70+Math.round(mass)*.034-shift,0],.024,'#9a8b62','mass',10);
    var plate=[[-1.74,1.54,0],[-1.35,1.54,-.30],[-1.35,1.54,.30]],under=plate.map(function(p){return[p[0],p[1]-.018,p[2]];});
    g.face(plate.map(turn),'#c7d2d7','lever');g.face(under.slice().reverse().map(turn),'#97adb8','lever');
    for(var j=0;j<3;j++){var k=(j+1)%3;g.face([plate[j],under[j],under[k],plate[k]].map(turn),'#aebfc6','lever');}
    [[-1.35,1.50,-.30],[-1.35,1.50,.30],[-1.74,1.50,0]].forEach(function(p){c(turn(p),turn([p[0],p[1]+.04,p[2]]),.018,'#344f60','lever',10);});
    b(-1.56,1.54,-.34,.16,.06,.68,'#5d798a','lever',turn);
    b(-1.51,1.57,-.32,.03,.48,.64,'#617f8f','lever',turn);
    g.face(L.corners,'#c8e9ee','lever');g.all[g.all.length-1].glass=true;
    line(turn([-1.472,1.62,-.23]),turn([-1.472,1.98,-.16]),'#ffffff',1.5);
    line(turn([-1.472,1.62,-.16]),turn([-1.472,1.90,-.10]),'#eafcff',.65);
    [[1.08,.025,.20],[2.20,.025,.47],[1.70,.025,-.70]].forEach(function(v){c(v,[1.65,1.08,0],.035,'#8ca0a9','telescope',12);c([v[0],0,v[2]],[v[0],.06,v[2]],.055,'#324e5e','telescope',12);});
    c([1.65,.88,0],[1.65,1.61,0],.034,'#c1cdd1','telescope',14);
    b(1.53,1.50,-.14,.25,.11,.28,'#5c7889','telescope');
    c([1.65,1.58,0],[1.65,1.72,0],.09,'#758e9b','telescope',18);
    c([1.02,1.81,0],[2.16,1.81,0],.154,'#b9c8ce','telescope',26);
    c([.96,1.81,0],[1.07,1.81,0],.17,'#344e5e','telescope',26);
    c([.943,1.81,0],[.955,1.81,0],.125,'#70b3c4','telescope',26);
    c([2.15,1.81,0],[2.40,1.81,0],.11,'#637b88','telescope',22);
    c([2.37,1.81,0],[2.43,1.81,0],.126,'#233f50','telescope',22);
    c([1.68,1.80,.13],[1.68,1.80,.23],.095,'#8199a5','telescope',20);
    c([1.38,1.94,0],[1.38,2.015,0],.045,'#587586','telescope',16);
    b(.88,.11,.32,.35,.045,.36,'#667e8c','ruler');
    b(1.02,.15,.465,.045,.38,.07,'#8da0aa','ruler');
    b(1.00,.47,.385,.07,2.36,.23,'#e3e8d5','ruler');
    for(var t=0;t<=40;t++){var yy=2.76-t*.054;line([.994,yy,.397],[.994,yy,.397+(t%5===0?.13:.066)],'#788c76',t%5===0?1:.65);}
    c([.988,L.scale[1],.50],[.998,L.scale[1],.50],.026,'#d2a34c','ruler',14);
    line(L.scale,L.point,'#c29744',1.5,[6,4],true);
    line(L.point,L.objective,'#247f9e',1.4,[5,4],true);
    return{faces:g.all,shift:shift,wire:[-1.74,2.31,0],mirror:L.center,telescope:[1.55,1.81,0],ruler:[1.04,2.1,.50],mass:[-1.74,.82-shift,.12],layout:L};
  }
  // Rotate only the optical/loaded subscene into the fixed frame's XY plane.
  // This is a rigid, right-handed transform; it preserves contacts and reflection angles.
  function toWorld(p){return[-1.74-p[2],p[1],p[0]+1.475];}
  function vectorToWorld(v){return[-v[2],v[1],v[0]];}
  function worldLayout(local){var out={shift:local.shift,theta:local.theta,reflectionResidual:local.reflectionResidual};['pivot','frontA','frontB','rear','center','objective','scale','point'].forEach(function(k){out[k]=toWorld(local[k]);});['normal','incident','outgoing','reflected'].forEach(function(k){out[k]=vectorToWorld(local[k]);});out.corners=local.corners.map(toWorld);return out;}
  function geometry(mass,extension){
    var local=geometryLocal(mass,extension),g=mesh(),b=g.box,c=g.cylinder;
    b(-2.96,.07,-.64,2.4,.14,1.28,'#607581','frame');
    [[-2.74,-.43],[-.78,-.43],[-2.74,.43],[-.78,.43]].forEach(function(p){c([p[0],0,p[1]],[p[0],.10,p[1]],.09,'#7f9099','frame',14);});
    [-2.64,-.98].forEach(function(x){b(x,.2,-.12,.16,2.92,.24,'#76909c','frame');b(x+.015,.23,.125,.034,2.83,.006,'#e1e8ea','frame');});
    b(-2.74,3.08,-.21,2,.18,.42,'#4d7084','frame');
    // A short bracket carries the wire clamp behind the frame centre plane.
    b(-1.91,3.035,-.38,.34,.105,.46,'#78929e','frame');
    function platformRing(x,y,z,w,h,d,color){var x0=-2.03,x1=-1.45,z0=-.405,z1=.085;b(x,y,z,x0-x,h,d,color,'frame');b(x1,y,z,x+w-x1,h,d,color,'frame');b(x0,y,z,x1-x0,h,z0-z,color,'frame');b(x0,y,z1,x1-x0,h,z+d-z1,color,'frame');}
    platformRing(-2.74,1.35,-.45,2,.14,.75,'#7f9aa4');
    platformRing(-2.7,1.475,-.43,1.92,.025,.71,'#d5dee1');
    local.faces.forEach(function(face){if(face.part==='frame')return;var copy={};Object.keys(face).forEach(function(k){copy[k]=face[k];});copy.v=face.v.map(toWorld);if(face.n)copy.n=vectorToWorld(face.n);g.all.push(copy);});
    return{faces:g.all,shift:local.shift,wire:toWorld(local.wire),mirror:toWorld(local.mirror),telescope:toWorld(local.telescope),ruler:toWorld(local.ruler),mass:toWorld(local.mass),layout:worldLayout(local.layout)};
  }
  function inspect(options){var opts=options||{},mass=Number(opts.mass),ext=Number(opts.extension);mass=Number.isFinite(mass)?clamp(mass,2,10):2;ext=opts.extension!==undefined&&Number.isFinite(ext)?Math.max(0,ext):undefined;var local=layout(mass,ext),L=worldLayout(local);return{geometryVersion:'frame-xy-axis-z-rigid-20261025',framePlane:{point:[-1.74,1.81,0],normal:[0,0,1],z:0},mass:mass,discCount:Math.round(mass),shift:L.shift,theta:L.theta,axis:[0,0,1],objective:L.objective,tripodFeet:[[1.08,.025,.20],[2.20,.025,.47],[1.70,.025,-.70]].map(toWorld),rulerBase:{xMin:-2.42,xMax:-2.06,zMin:2.355,zMax:2.705},pivotAxis:[L.frontA,L.frontB],feet:{frontA:L.frontA,frontB:L.frontB,rear:L.rear},platform:{bottomY:1.35,topY:1.50,xMin:-2.7,xMax:-.78,zMin:-.43,zMax:.28,hole:{xMin:-2.03,xMax:-1.45,zMin:-.405,zMax:.085}},plate:{top:[[-1.74,1.54,0],[-1.35,1.54,-.30],[-1.35,1.54,.30]].map(local.turn).map(toWorld),bottom:[[-1.74,1.522,0],[-1.35,1.522,-.30],[-1.35,1.522,.30]].map(local.turn).map(toWorld)},lowerClamp:{centerX:-1.74,centerZ:-.265,topY:1.50-L.shift,radius:.11},mirror:{center:L.center,corners:L.corners,normal:L.normal},ruler:{frontPlaneZ:2.475,xCenter:-2.24,yMin:.47,yMax:2.83,xMin:-2.355,xMax:-2.125},ray:{scale:L.scale,mirror:L.point,objective:L.objective,incident:L.incident,outgoing:L.outgoing,reflected:L.reflected,reflectionResidual:L.reflectionResidual},distanceD:2.475-L.center[2]};}
  function mount(element,options){
    if(!element||!element.ownerDocument)return{update:function(){},destroy:function(){}};
    var doc=element.ownerDocument,shell=doc.createElement('section');shell.className='ya3d'+(options&&options.compact?' ya3d--compact':'');shell.setAttribute('aria-label','拉伸法杨氏模量实验三维示意');
    shell.innerHTML='<div class="ya3d-view"><canvas class="ya3d-canvas" tabindex="0" role="img" aria-label="可旋转的三维实验装置：拉伸架、金属丝、三足光杠杆、挂码、望远镜和侧置标尺。初始镜面位于拉伸架所在竖直平面，望远镜在架前，光轴垂直该平面。标尺光线经镜面反射进入物镜。方向键旋转，加减键缩放，Home复位。"></canvas><span class="ya3d-view-tag">可旋转三维示意</span><span class="ya3d-mass" aria-live="polite"></span></div><div class="ya3d-controls"><p>鼠标拖动旋转；手机横向拖动，纵向滚动页面。</p><div class="ya3d-buttons" role="group" aria-label="三维视角控制"><button type="button" data-view="out" aria-label="缩小三维模型">−</button><button type="button" data-view="in" aria-label="放大三维模型">＋</button><button type="button" data-view="side">侧面观察</button><button type="button" data-view="reset">复位视角</button></div></div><div class="ya3d-parts" role="group" aria-label="认识三维装置部件"><button type="button" data-part="wire" aria-pressed="false">金属丝</button><button type="button" data-part="lever" aria-pressed="false">光杠杆</button><button type="button" data-part="telescope" aria-pressed="false">望远镜与标尺</button></div><p class="ya3d-part-info" role="status" aria-live="polite" hidden></p><details class="ya3d-explain"><summary>查看仪器结构说明</summary><ul><li>拉伸架固定金属丝上端，挂码使金属丝产生微小伸长。</li><li>光杠杆前两足由固定平台支撑，后足落在下夹头端面；下夹头下降时整块光杠杆与镜面绕前足连线转动。</li><li>望远镜位于拉伸架前方，初始读轴垂直框架所在竖直平面；反射镜基准面就在该平面内。标尺在物镜侧方，光线从标尺经镜面反射进入物镜。镜面到尺面的距离为 <i>D</i>。</li></ul></details><p class="ya3d-note">近轴教学示意 · 形变与光路未按真实比例。</p>';
    var canvas=shell.querySelector('canvas'),ctx;
    try{ctx=canvas.getContext('2d',{alpha:false});}catch(e){}
    if(!ctx){var note=doc.createElement('p');note.className='ya3d-note';note.textContent='当前浏览器未能启用三维示意，以下保留装置结构图。';element.appendChild(note);return{update:function(){},destroy:function(){note.remove();}};}
    var original=Array.prototype.slice.call(element.childNodes);element.replaceChildren(shell);
    var config={mass:2,step:0,extension:undefined,onSelect:options&&typeof options.onSelect==='function'?options.onSelect:null},selectedPart='',camera={yaw:DEFAULT.yaw,pitch:DEFAULT.pitch,zoom:DEFAULT.zoom},w=600,h=430,dpr=1,fitFactor=1,offsetX=0,offsetY=0,model,scheduled=0,dead=false,drag=null,observer;
    var activeParts=['frame','lever','telescope','mass','wire',''];
    function project(p){var dx=p[0]+1.74,dy=p[1]-1.57,dz=p[2]-1.50,cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),xx=cy*dx-sy*dz,zz=sy*dx+cy*dz,yy=cp*dy-sp*zz,z=sp*dy+cp*zz,depth=8.2-z,scale=Math.min(w/7.15,h/4.22)*camera.zoom*fitFactor*8.2/Math.max(2.5,depth);return{x:w/2+xx*scale+offsetX,y:h*.53-yy*scale+offsetY,z:z};}
    function frameView(){var zoom=camera.zoom;camera.zoom=1;fitFactor=1;offsetX=offsetY=0;var points=[];[-3.25,-.30].forEach(function(x){[0,3.30].forEach(function(y){[-.70,4.20].forEach(function(z){points.push(project([x,y,z]));});});});camera.zoom=zoom;var xs=points.map(function(p){return p.x;}),ys=points.map(function(p){return p.y;}),minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);fitFactor=Math.min(1,(w-40)/(maxX-minX),(h-48)/(maxY-minY));offsetX=-(minX+maxX-w)/2*fitFactor*zoom;offsetY=-h*.02-((minY+maxY)/2-h*.53)*fitFactor*zoom;}
    function path(points){ctx.beginPath();points.forEach(function(p,i){var q=project(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});}
    function ground(){var grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#f8fafb');grad.addColorStop(1,'#eaf0f3');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(93,126,144,.10)';ctx.lineWidth=.65;for(var x=-4;x<=.5;x+=.5){path([[x,0,-1],[x,0,4.8]]);ctx.stroke();}for(var z=-1;z<=4.8;z+=.5){path([[-4,0,z],[.5,0,z]]);ctx.stroke();}
      [[-1.75,1.15,.62,0],[-1.74,.60,.85,3.175],[-2.24,.22,.30,2.51]].forEach(function(a){var pts=[];for(var i=0;i<36;i++){var t=i/36*Math.PI*2;pts.push([a[0]+Math.cos(t)*a[1],.012,(a[3]||0)+Math.sin(t)*a[2]]);}path(pts);ctx.closePath();ctx.fillStyle='rgba(16,64,92,.085)';ctx.fill();});
    }
    function arrow(a,b,label){var p=project(a),q=project(b),ang=Math.atan2(q.y-p.y,q.x-p.x);ctx.save();ctx.setLineDash([]);ctx.strokeStyle='#7d9baa';ctx.fillStyle='#10405c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();[p,q].forEach(function(t,i){var aa=ang+(i?Math.PI:0);ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.x+Math.cos(aa-.5)*6,t.y+Math.sin(aa-.5)*6);ctx.moveTo(t.x,t.y);ctx.lineTo(t.x+Math.cos(aa+.5)*6,t.y+Math.sin(aa+.5)*6);ctx.stroke();});ctx.font='italic 15px Georgia,serif';ctx.fillText(label,(p.x+q.x)/2+7,(p.y+q.y)/2-6);ctx.restore();}
    function label(p,text,dx,dy){var q=project(p),font=w<500?10:12;ctx.save();ctx.font='500 '+font+'px "PingFang SC","Microsoft YaHei",sans-serif';var tw=ctx.measureText(text).width,bx=clamp(q.x+dx,7,w-tw-21),by=clamp(q.y+dy,18,h-24),bw=tw+16;ctx.strokeStyle='rgba(36,104,145,.40)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(bx+(dx<0?bw:0),by+11);ctx.stroke();ctx.fillStyle='#ffffff';ctx.fillRect(bx,by,bw,23);ctx.strokeStyle='#cfd9de';ctx.strokeRect(bx,by,bw,23);ctx.fillStyle='#10405c';ctx.fillText(text,bx+8,by+15);ctx.fillStyle='#246891';ctx.beginPath();ctx.arc(q.x,q.y,2,0,Math.PI*2);ctx.fill();ctx.restore();}
    function draw(){scheduled=0;if(dead)return;ctx.setTransform(dpr,0,0,dpr,0,0);frameView();ground();
      var faces=model.faces.map(function(f){var z=f.v.reduce(function(v,p){return v+project(p).z;},0)/f.v.length;return{f:f,z:z};}).sort(function(a,b){return a.z-b.z;});
      faces.forEach(function(item){var f=item.f;ctx.save();path(f.v);if(f.line){ctx.strokeStyle=f.color;ctx.lineWidth=f.width;ctx.setLineDash(f.dash);ctx.stroke();if(f.arrow){var a=project(f.v[0]),b=project(f.v[1]),ang=Math.atan2(b.y-a.y,b.x-a.x),x=a.x+(b.x-a.x)*.60,y=a.y+(b.y-a.y)*.60;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(ang-.45)*7,y-Math.sin(ang-.45)*7);ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(ang+.45)*7,y-Math.sin(ang+.45)*7);ctx.stroke();}}else{ctx.closePath();ctx.fillStyle=f.glass?'#c8e9ee':shade(f.color,f.n);ctx.fill();ctx.strokeStyle=(f.part===(selectedPart||activeParts[config.step])||f.part==='ruler'&&(selectedPart||activeParts[config.step])==='telescope')?'rgba(0,166,191,.32)':'rgba(16,45,61,.15)';ctx.lineWidth=(f.part===(selectedPart||activeParts[config.step])||f.part==='ruler'&&(selectedPart||activeParts[config.step])==='telescope')?.65:.35;ctx.stroke();}ctx.restore();});
      arrow([-.35,1.50-model.shift,-.265],[-.35,2.90,-.265],'L');arrow([-3.12,.12,model.layout.center[2]],[-3.12,.12,2.475],'D');
      label(model.wire,'金属丝',w<500?18:35,-25);label(model.mirror,'光杠杆',-85,15);label(model.telescope,'望远镜',-24,-52);if(w>=500)label(model.ruler,'标尺',-58,-8);
      ctx.save();ctx.font='11px Arial,sans-serif';ctx.fillStyle='#788f9c';var angles=Math.round(((camera.yaw*180/Math.PI+180)%360+360)%360-180);ctx.fillText('↔ '+angles+'°',12,h-13);ctx.restore();
    }
    function requestDraw(){if(!dead&&!scheduled)scheduled=global.requestAnimationFrame(draw);}
    function resize(){if(dead)return;var r=shell.querySelector('.ya3d-view').getBoundingClientRect();w=Math.max(260,Math.round(r.width||element.clientWidth||600));h=Math.max(330,Math.round(r.height||430));dpr=clamp(global.devicePixelRatio||1,1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);requestDraw();}
    function reset(){camera.yaw=DEFAULT.yaw;camera.pitch=DEFAULT.pitch;camera.zoom=DEFAULT.zoom;requestDraw();}
    function down(e){if(e.button!==undefined&&e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:camera.yaw,pitch:camera.pitch,type:e.pointerType};if(canvas.setPointerCapture)try{canvas.setPointerCapture(e.pointerId);}catch(err){}canvas.classList.add('is-dragging');}
    function move(e){if(!drag||drag.id!==e.pointerId)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(drag.type==='touch'&&Math.abs(dy)>Math.abs(dx)*1.2&&Math.abs(dy)>8){up(e);return;}camera.yaw=drag.yaw+dx*.009;if(drag.type!=='touch')camera.pitch=clamp(drag.pitch+dy*.007,-.08,.68);if(e.cancelable)e.preventDefault();requestDraw();}
    function up(e){if(!drag||e.pointerId!==drag.id)return;if(canvas.releasePointerCapture)try{canvas.releasePointerCapture(drag.id);}catch(err){}drag=null;canvas.classList.remove('is-dragging');}
    function keys(e){var used=true;if(e.key==='ArrowLeft')camera.yaw-=.13;else if(e.key==='ArrowRight')camera.yaw+=.13;else if(e.key==='ArrowUp')camera.pitch=clamp(camera.pitch+.08,-.08,.68);else if(e.key==='ArrowDown')camera.pitch=clamp(camera.pitch-.08,-.08,.68);else if(e.key==='+'||e.key==='=')camera.zoom=clamp(camera.zoom+.13,.72,1.75);else if(e.key==='-'||e.key==='_')camera.zoom=clamp(camera.zoom-.13,.72,1.75);else if(e.key==='Home')reset();else used=false;if(used){e.preventDefault();requestDraw();}}
    function controls(e){var part=e.target.closest('[data-part]');if(part&&shell.contains(part)){selectedPart=part.dataset.part;Array.prototype.forEach.call(shell.querySelectorAll('[data-part]'),function(b){b.setAttribute('aria-pressed',String(b===part));});requestDraw();if(typeof config.onSelect==='function')config.onSelect(selectedPart);else{var info=shell.querySelector('.ya3d-part-info');info.textContent={wire:'金属丝的有效原长从上夹紧区下缘量至下夹紧区上缘，加载后下夹头随伸长量下降。',lever:'前两足在固定平台上，后足在下夹头顶面，镜面与光杠杆一起绕前足连线刚性转动。',telescope:'望远镜放在拉伸架前方，初始读轴垂直框架所在竖直平面；镜面基准面就在该平面内，侧置标尺的光线经镜面反射后进入物镜。'}[selectedPart];info.hidden=false;}return;}var b=e.target.closest('[data-view]');if(!b||!shell.contains(b))return;var key=b.dataset.view;if(key==='reset')reset();else if(key==='side'){camera.yaw+=Math.PI/2;requestDraw();}else{camera.zoom=clamp(camera.zoom+(key==='in'?.13:-.13),.72,1.75);requestDraw();}}
    function update(next){if(dead)return;next=next||{};if(typeof next.onSelect==='function')config.onSelect=next.onSelect;if(next.mass!==undefined){var m=Number(next.mass);config.mass=Number.isFinite(m)?clamp(m,2,10):2;}if(next.step!==undefined){var s=Number(next.step);config.step=Number.isFinite(s)?clamp(Math.floor(s),0,5):0;}if(next.extension!==undefined){var ext=Number(next.extension);config.extension=Number.isFinite(ext)?Math.max(0,ext):undefined;}else if(next.mass!==undefined)config.extension=undefined;model=geometry(config.mass,config.extension);shell.querySelector('.ya3d-mass').textContent='砝码总质量 '+config.mass.toFixed(2)+' kg';requestDraw();}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move,{passive:false});canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('keydown',keys);shell.addEventListener('click',controls);
    if(global.ResizeObserver){observer=new global.ResizeObserver(resize);observer.observe(shell.querySelector('.ya3d-view'));}else global.addEventListener('resize',resize);
    update(options);resize();
    return{update:update,destroy:function(){if(dead)return;dead=true;if(scheduled)global.cancelAnimationFrame(scheduled);if(observer)observer.disconnect();else global.removeEventListener('resize',resize);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('keydown',keys);shell.removeEventListener('click',controls);if(shell.parentNode===element)element.replaceChildren.apply(element,original);}};
  }
  global.YoungApparatus3D={mount:mount,inspect:inspect};
})(window);
