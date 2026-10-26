/* A continuous optical-lever demonstration. Physical values use SI/mm;
   only the drawing angle is enlarged, as disclosed in the illustration. */
(function (global) {
  'use strict';
  const DEG = 180 / Math.PI;
  const MAX_EXTENSION = 0.5;
  function model(D, b, extension) {
    const theta = Math.asin(extension / b);
    return {theta, twice: 2 * theta, displacement: D * 1000 * Math.tan(2 * theta), gain: 2 * D * 1000 / b};
  }
  function mount(container) {
    let D = 1.5, b = 70, extension = 0.25, phase = 0.25;
    let running = !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = false, lastTime = null, frame = 0, destroyed = false;
    container.className = 'optical-lab';
    container.innerHTML = `<div class="optical-toolbar"><span class="optical-state" data-opt="status" role="status"></span><button type="button" class="secondary" data-opt-action="play"></button><button type="button" class="optical-reset" data-opt-action="reset">回到零点</button></div>
      <div class="optical-view-switch" role="group" aria-label="光路显示方式"><button type="button" data-opt-view="3d" aria-pressed="false">三维示意</button><button type="button" data-opt-view="2d" aria-pressed="true">二维光路</button></div>
      <div class="optical-three-host" data-opt-three></div>
      <svg data-opt-flat class="optical-scene" viewBox="0 0 640 300" role="img" aria-labelledby="optical-title optical-description">
        <title id="optical-title">动态光杠杆：镜面转动，反射光偏转，标尺读数同步变化</title>
        <desc id="optical-description">入射方向固定。钢丝伸长带动后足下降，镜面向钢丝一侧转动θ，反射光方向改变2θ，光点沿标尺上移。数值显示位移大小，图中转角放大10倍。</desc>
        <defs><marker id="optical-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="#b08844"/></marker><marker id="optical-dimension" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse"><path d="M6 0 0 3 6 6" fill="none" stroke="#9b854d" stroke-width="1"/></marker></defs>
        <rect width="640" height="300" rx="8" fill="#f2f5f9"/>
        <path data-opt="baseline" stroke="#a8b8c8" stroke-dasharray="5 5"/>
        <path d="M110 130 129.10 21.67" stroke="#9cb4c9" stroke-width="2" stroke-dasharray="4 4"/>
        <path d="M81 51 123.30 54.56" fill="none" stroke="#9cb4c9" stroke-width="1"/>
        <text x="24" y="48" fill="#7793aa" font-size="11">初始镜面</text>
        <path data-opt="mirror" stroke="#075b9b" stroke-width="7" stroke-linecap="round"/>
        <path d="M310 202.79 210 166.40 110 130" fill="none" stroke="#8fabc4" stroke-width="2" marker-mid="url(#optical-arrow)"/>
        <path data-opt="reflected" fill="none" stroke="#b08844" stroke-width="2.5" marker-mid="url(#optical-arrow)"/>
        <path data-opt="theta-arc" fill="none" stroke="#075b9b" stroke-width="1.7"/>
        <path data-opt="twice-arc" fill="none" stroke="#b08844" stroke-width="1.7"/>
        <path data-opt="theta-leader" fill="none" stroke="#075b9b" stroke-width="1"/>
        <path data-opt="twice-leader" fill="none" stroke="#b08844" stroke-width="1"/>
        <text data-opt="theta-label" fill="#075b9b" font-size="15">θ</text>
        <text data-opt="twice-label" fill="#a27b38" font-size="15">2θ</text>
        <circle cx="110" cy="130" r="4" fill="#075b9b"/>
        <g data-opt="ruler"><path d="M0 27V237" stroke="#7897b2" stroke-width="4"/>${Array.from({length:23},(_,i)=>`<path d="M0 ${32+i*9}h${i%5===0?12:7}" stroke="#a3b5c6" stroke-width="1"/>`).join('')}<text x="16" y="125" font-size="12" fill="#8a9fb4">n₀</text><text x="-12" y="250" font-size="13" fill="#708ca5">标尺</text></g>
        <path data-opt="displacement" stroke="#b08844" stroke-width="1.1" marker-start="url(#optical-dimension)" marker-end="url(#optical-dimension)"/>
        <circle data-opt="spot-halo" r="11" fill="#caaa5a" opacity=".14"/>
        <circle data-opt="spot" r="4.5" fill="#b08844"/>
        <text data-opt="displacement-label" font-size="15" fill="#a27b38">Δn</text>
        <circle data-opt="incoming-pulse" r="3" fill="#9bb4ca"/><circle data-opt="outgoing-pulse" r="3" fill="#b08844"/>
        <text data-opt="initial-direction" y="104" font-size="11" fill="#8ca0b3">初始反射方向</text>
        <text x="226" y="224" font-size="11" fill="#8ca0b3">入射方向固定</text>
        <path data-opt="distance-line" stroke="#a9bacb" stroke-width="1"/>
        <text data-opt="distance-label" y="278" text-anchor="middle" font-size="13" fill="#708ca5"></text>
      </svg>
      <p class="optical-caption">转角放大 10 倍 · 长度与形变示意 · 下方数值按真实参数计算</p>
      <div class="optical-metrics" aria-label="实时物理量"><div><span>镜面转角 θ</span><output data-opt="theta"></output></div><div><span>光线偏转 2θ</span><output data-opt="twice"></output></div><div><span>标尺位移大小 Δn</span><output data-opt="dn"></output></div></div>
      <label class="control"><span>金属丝伸长 ΔL</span><input id="optics-extension" type="range" min="0" max="0.5" step="0.001" value="0.25"><output data-opt="extension"></output></label>
      <label class="control"><span>镜尺距离 D</span><input id="optics-distance" type="range" min="0.8" max="2" step="0.1" value="1.5"><output data-opt="D"></output></label>
      <label class="control"><span>光杠杆臂 b</span><input id="optics-arm" type="range" min="40" max="100" step="5" value="70"><output data-opt="b"></output></label>
      <div class="formula">放大率 ≈ <span data-opt="gain"></span><small>2D / b · 自动演示加载与卸载，也可暂停后拖动参数</small></div>`;
    const nodes = Object.fromEntries(Array.from(container.querySelectorAll('[data-opt]'), el=>[el.dataset.opt,el]));
    const play = container.querySelector('[data-opt-action="play"]');
    const slider = container.querySelector('#optics-extension');
    const threeHost = container.querySelector('[data-opt-three]'), flatScene = container.querySelector('[data-opt-flat]');
    let scene3d = null, viewMode = '2d';
    if (global.YoungOptics3D) {
      try { scene3d = global.YoungOptics3D.mount(threeHost, {D,b,extension,theta:model(D,b,extension).theta,visualFactor:10,pulse:0}); }
      catch (error) { if (global.console) global.console.warn('光路三维视图未能初始化，已保留二维示意。',error); }
    }
    function setView(mode) {
      viewMode = mode === '3d' && scene3d ? '3d' : '2d';
      threeHost.hidden = viewMode !== '3d'; if(viewMode==='3d')flatScene.setAttribute('hidden','');else flatScene.removeAttribute('hidden');
      container.querySelectorAll('[data-opt-view]').forEach(button=>{
        button.setAttribute('aria-pressed',String(button.dataset.optView === viewMode));
        if(button.dataset.optView==='3d')button.disabled=!scene3d;
      });
      draw();
    }
    const attr = (name, attrs) => Object.entries(attrs).forEach(([key,value])=>nodes[name].setAttribute(key,String(value)));
    const point = (radius, angle) => [110+radius*Math.cos(angle),130+radius*Math.sin(angle)];
    function arc(radius, from, to) {
      const a=point(radius,from), z=point(radius,to);
      return `M${a[0]} ${a[1]} A${radius} ${radius} 0 0 ${to>=from?1:0} ${z[0]} ${z[1]}`;
    }
    function draw() {
      const m = model(D,b,extension), visual=m.theta*10;
      if(scene3d&&viewMode==='3d')scene3d.update({D,b,extension,theta:m.theta,visualFactor:10,pulse:(phase*8)%1});
      const rulerX=110+172*D, hitY=130-(rulerX-110)*Math.tan(2*visual);
      const alpha=-80/DEG-visual, tip=point(92,alpha);
      attr('mirror',{d:`M110 130 L${tip[0]} ${tip[1]}`});
      attr('baseline',{d:`M76 130 H${rulerX+16}`});
      attr('ruler',{transform:`translate(${rulerX} 0)`});
      attr('initial-direction',{x:rulerX+18});
      attr('reflected',{d:`M110 130 L${(110+rulerX)/2} ${(130+hitY)/2} L${rulerX} ${hitY}`});
      const angleVisible=extension>0.005?1:0;
      const mirrorArcMid=point(60,-80/DEG-visual/2), lightArcMid=point(65,-visual);
      attr('theta-arc',{d:arc(60,-80/DEG,alpha),opacity:angleVisible});
      attr('twice-arc',{d:arc(65,0,-2*visual),opacity:angleVisible});
      attr('theta-label',{x:158,y:76,opacity:angleVisible});
      attr('theta-leader',{d:`M151 72 L${mirrorArcMid[0]} ${mirrorArcMid[1]}`,opacity:angleVisible});
      attr('twice-label',{x:207,y:106,opacity:angleVisible});
      attr('twice-leader',{d:`M215 111 L${lightArcMid[0]} ${lightArcMid[1]}`,opacity:angleVisible});
      attr('displacement',{d:`M${rulerX+27} 130V${hitY}`,opacity:Math.abs(hitY-130)>2?1:0});
      attr('spot',{cx:rulerX,cy:hitY});attr('spot-halo',{cx:rulerX,cy:hitY});
      attr('displacement-label',{x:rulerX+36,y:(130+hitY)/2+5,opacity:extension>0.005?1:0});
      attr('distance-line',{d:`M110 252v7M110 256H${rulerX}M${rulerX} 252v7`});
      attr('distance-label',{x:(110+rulerX)/2});nodes['distance-label'].innerHTML=`<tspan font-style="italic">D</tspan><tspan font-style="normal"> = ${D.toFixed(1)} m</tspan>`;
      const pulse=(phase*8)%1;
      attr('incoming-pulse',{cx:310-200*pulse,cy:202.79-72.79*pulse});
      attr('outgoing-pulse',{cx:110+(rulerX-110)*pulse,cy:130+(hitY-130)*pulse});
      nodes.theta.textContent=(m.theta*DEG).toFixed(3)+'°';
      nodes.twice.textContent=(m.twice*DEG).toFixed(3)+'°';
      nodes.dn.textContent=m.displacement.toFixed(2)+' mm';
      nodes.extension.textContent=extension.toFixed(3)+' mm';
      nodes.D.textContent=D.toFixed(1)+' m';nodes.b.textContent=b.toFixed(0)+' mm';nodes.gain.textContent=m.gain.toFixed(1);
      slider.value=extension.toFixed(3);slider.setAttribute('aria-valuetext',extension.toFixed(3)+' 毫米');
    }
    function updateStatus() {
      const direction=phase%1<0.5?'加载':'卸载';
      nodes.status.textContent=running?`● 自动演示 · ${direction}`:'Ⅱ 已暂停 · 可拖动参数';
      play.textContent=running?'Ⅱ 暂停演示':'▶ 播放演示';play.setAttribute('aria-pressed',String(running));
    }
    function tick(time) {
      if(destroyed||!running||!visible||document.hidden){frame=0;lastTime=null;return}
      if(lastTime!==null)phase=(phase+Math.min(time-lastTime,100)/8000)%1;
      lastTime=time;extension=MAX_EXTENSION*(1-Math.cos(2*Math.PI*phase))/2;
      draw();updateStatus();frame=requestAnimationFrame(tick);
    }
    function reconcile() {
      if(frame)cancelAnimationFrame(frame);frame=0;lastTime=null;
      if(running&&visible&&!document.hidden&&!destroyed)frame=requestAnimationFrame(tick);
      updateStatus();
    }
    function onInput(e) {
      if(e.target.id==='optics-extension'){
        extension=Number(e.target.value);phase=Math.acos(1-2*extension/MAX_EXTENSION)/(2*Math.PI);running=false;reconcile();
      }else if(e.target.id==='optics-distance')D=Number(e.target.value);
      else if(e.target.id==='optics-arm')b=Number(e.target.value);
      else return;
      draw();
    }
    function onClick(e) {
      const view = e.target.closest('[data-opt-view]')?.dataset.optView;
      if(view){setView(view);return}
      const action=e.target.closest('[data-opt-action]')?.dataset.optAction;
      if(action==='play'){running=!running;reconcile()}
      if(action==='reset'){running=false;extension=0;phase=0;draw();reconcile()}
    }
    container.addEventListener('input',onInput);container.addEventListener('click',onClick);
    document.addEventListener('visibilitychange',reconcile);
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reconcile()},{threshold:0.05});
    observer.observe(container);setView(scene3d?'3d':'2d');updateStatus();if(global.YoungMath)global.YoungMath.typeset(container);
    return {destroy(){destroyed=true;if(scene3d){scene3d.destroy();scene3d=null}cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',reconcile);container.removeEventListener('input',onInput);container.removeEventListener('click',onClick)}};
  }
  global.YoungOptics={mount,model};
})(window);
