/* Native MathML presentation only. Calculations and recorded data are unchanged. */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/1998/Math/MathML';
  var escape = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]; }); };
  var functions = /^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|lg|log|exp|sqrt|min|max|lim|det)$/;
  var commands = {Delta:'Δ',theta:'θ',sigma:'σ',epsilon:'ε',varepsilon:'ε',pi:'π',gamma:'γ',alpha:'α',beta:'β',mu:'μ',rho:'ρ',lambda:'λ',eta:'η'};
  var operators = {cdot:'·',times:'×',approx:'≈',propto:'∝',pm:'±',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',to:'→',sum:'∑',infty:'∞',partial:'∂'};
  var supers = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'−','⁺':'+'};
  var subs = {'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','ᵣ':'r'};
  function normalize(source) {
    return String(source).replace(/([A-Za-z])\u0304/g, '\\bar{$1}').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, function (s) { return '^{'+Array.from(s).map(function (c) { return supers[c]; }).join('')+'}'; }).replace(/[₀₁₂₃₄₅₆₇₈₉ᵣ]+/g, function (s) { return '_{'+Array.from(s).map(function (c) { return subs[c]; }).join('')+'}'; });
  }
  function tag(name, body, attrs) { return '<'+name+(attrs?' '+attrs:'')+'>'+body+'</'+name+'>'; }
  function atom(text, normal) { return tag('mi',escape(text),normal?'mathvariant="normal"':'mathvariant="italic"'); }
  function Parser(source) { this.s=normalize(source);this.p=0; }
  Parser.prototype.space=function(){while(/\s/.test(this.s.charAt(this.p))&&this.p<this.s.length)this.p++;};
  Parser.prototype.rawGroup=function(){this.space();if(this.s[this.p]!=='{')return this.s[this.p++]||'';var start=++this.p,level=1;while(this.p<this.s.length&&level){var c=this.s[this.p++];if(c==='{')level++;if(c==='}')level--;}return this.s.slice(start,this.p-(level?0:1));};
  Parser.prototype.group=function(index){this.space();if(this.s[this.p]==='{'){this.p++;return tag('mrow',this.sequence('}',index));}return this.primary(index);};
  Parser.prototype.primary=function(index){
    this.space();var c=this.s[this.p++];if(!c)return '';
    if(c==='{')return tag('mrow',this.sequence('}',index));
    if(c==='\\'){
      var name=(this.s.slice(this.p).match(/^[A-Za-z]+/)||[''])[0];this.p+=name.length;
      if(name==='frac')return tag('mfrac',this.group(false)+this.group(false));
      if(name==='sqrt')return tag('msqrt',this.group(false));
      if(name==='bar'||name==='overline')return tag('mover',this.group(false)+tag('mo','¯'),'accent="true"');
      if(name==='mathrm'||name==='text'||name==='operatorname'){var raw=this.rawGroup();return name==='text'?tag('mtext',escape(raw)):atom(raw,true);}
      if(name==='left'||name==='right')return this.primary(index);
      if(commands[name])return atom(commands[name],name==='pi'||name==='Delta');
      if(operators[name])return tag('mo',operators[name]);
      if(functions.test(name))return atom(name,true)+tag('mo','&#x2061;');
      if(!name){var escaped=this.s[this.p++]||'';return tag('mo',escape(escaped));}
      return tag('mtext',escape(name));
    }
    if(/[0-9.]/.test(c)){var tail=(this.s.slice(this.p).match(/^[0-9.]*/)||[''])[0];this.p+=tail.length;return tag('mn',escape(c+tail));}
    if(/[A-Za-z]/.test(c)){
      var word=c+(this.s.slice(this.p).match(/^[A-Za-z]*/)||[''])[0];
      if(functions.test(word)){this.p+=word.length-1;return atom(word,true)+tag('mo','&#x2061;');}
      return atom(c,Boolean(index&&/[ABr]/.test(c)));
    }
    if(/[θσεγρμλαβηδ]/.test(c))return atom(c,false);
    if(c==='π')return atom(c,true);
    if(c==='Δ')return atom(c,true);
    if(/[=+\-−×·/≈∝±≤≥≠|(),;:′″∑√∂]/.test(c))return tag('mo',escape(c));
    if(c==='~')return '<mspace width="0.25em"/>';
    return tag('mtext',escape(c));
  };
  Parser.prototype.sequence=function(end,index){var result='';while(this.p<this.s.length){this.space();if(end&&this.s[this.p]===end){this.p++;break;}if(this.p>=this.s.length)break;var base=this.primary(index),sub='',sup='';this.space();if(this.s[this.p]==='′'||this.s[this.p]==='″'){base=tag('msup',base+tag('mo',this.s[this.p++]));this.space();}while(this.s[this.p]==='_'||this.s[this.p]==='^'){var type=this.s[this.p++],value=this.group(type==='_');if(type==='_')sub=value;else sup=value;this.space();}result+=sub&&sup?tag('msubsup',base+sub+sup):sub?tag('msub',base+sub):sup?tag('msup',base+sup):base;}return result;};
  function markup(source,display,label){return '<math xmlns="'+NS+'" class="ym-math '+(display?'ym-display':'ym-inline')+'" data-ym-normalized="true" display="'+(display?'block':'inline')+'" aria-label="'+escape(label||source)+'">'+new Parser(source).sequence()+'</math>';}
  function render(source,display,label){var box=document.createElement('template');box.innerHTML=markup(source,display,label);return box.content.firstElementChild;}
  var fixed = [
    ['均值 n / mm','\\text{均值}~\\bar{n}~/~\\mathrm{mm}'],
    ['uᵣ(E)² = [u(L)/L]² + [u(D)/D]² + [u(b)/b]² + [2u(d̄)/d̄]² + [u(Δn)/Δn]²','u_r(E)^2=\\left(\\frac{u(L)}{L}\\right)^2+\\left(\\frac{u(D)}{D}\\right)^2+\\left(\\frac{u(b)}{b}\\right)^2+\\left(\\frac{2u(\\bar{d})}{\\bar{d}}\\right)^2+\\left(\\frac{u(Δn)}{Δn}\\right)^2'],
    ['u(d̄) = √[uA(d̄)² + 仪器限²/3 + 估读限²/3]','u(\\bar{d})=\\sqrt{u_A(\\bar{d})^2+\\frac{\\text{仪器限}^2}{3}+\\frac{\\text{估读限}^2}{3}}'],
    ['uA(d̄) = √[Σ(dᵢ − d̄)²/(9×8)]','u_A(\\bar{d})=\\sqrt{\\frac{\\sum_i(d_i-\\bar{d})^2}{9\\times8}}'],
    ['uA(Δn) = √[Σ(δᵢ − δ̄)²/(q(q−1))]','u_A(Δn)=\\sqrt{\\frac{\\sum_i(δ_i-\\bar{δ})^2}{q(q-1)}}'],
    ['uB(Δn) = √[2(仪器限² + 估读限²)/3]','u_B(Δn)=\\sqrt{\\frac{2(\\text{仪器限}^2+\\text{估读限}^2)}{3}}'],
    ['u(x) = √[(仪器限² + 估读限²)/3]','u(x)=\\sqrt{\\frac{\\text{仪器限}^2+\\text{估读限}^2}{3}}'],
    ['u(Δn) = √[uA² + uB²]','u(Δn)=\\sqrt{u_A^2+u_B^2}'],
    ['n = (n′ + n″) / 2','\\bar{n}=\\frac{n′+n″}{2}'],
    ['ΔF = 4mg','ΔF=4mg'],['ΔF = 7mg','ΔF=7mg'],['F = Mg','F=Mg'],['ΔL ≈ bΔn / (2D)','ΔL≈\\frac{bΔn}{2D}'],['ΔL / L','\\frac{ΔL}{L}'],['F / S','\\frac{F}{S}'],
    ['ΔF/Δn','\\frac{ΔF}{Δn}'],['2D / b','\\frac{2D}{b}'],['uA(d̄)','u_A(\\bar{d})'],['uA(Δn)','u_A(Δn)'],['uB(Δn)','u_B(Δn)'],
    ['uᵣ(E)','u_r(E)'],['uA²','u_A^2'],['uB²','u_B^2'],['n₇','n_7'],['n₀','n_0'],['e₀','e_0'],['dᵢ','d_i'],['δᵢ','δ_i'],['δ̄','\\bar{δ}'],['d̄','\\bar{d}'],['n̄','\\bar{n}'],['R²','R^2']
  ].sort(function(a,b){return b[0].length-a[0].length;});
  var token = /(?:arcsin|arccos|arctan|sin|cos|tan|cot|ln|lg|log|exp)(?![A-Za-z])|Δ[LnF]|[EYFSLDMbdngmkRuUqxiθσεγ](?:[′″]|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/g;
  function unitAt(text,index,word){var left=text.slice(0,index),right=text.slice(index+word.length);return /[mg]/.test(word)&&word.length===1&&(/(?:\/|\d|\.)\s*$/.test(left)||/^\s*(?:·s|\/s)/.test(right));}
  function segments(text){var found=[],used=[];
    fixed.forEach(function(pair){var at=text.indexOf(pair[0]);while(at>=0){if(!used.some(function(x){return at<x[1]&&at+pair[0].length>x[0];})){found.push({start:at,end:at+pair[0].length,source:pair[1]});used.push([at,at+pair[0].length]);}at=text.indexOf(pair[0],at+pair[0].length);}});
    token.lastIndex=0;var match;while((match=token.exec(text))){var start=match.index,end=token.lastIndex,word=match[0];if(/[A-Za-z_]/.test(text[start-1]||'')||/[A-Za-z_]/.test(text[end]||''))continue;if(unitAt(text,start,word))continue;if(used.some(function(x){return start<x[1]&&end>x[0];}))continue;found.push({start:start,end:end,source:word});}
    return found.sort(function(a,b){return a.start-b.start;});
  }
  function inlineEquation(source,label){
    if(source.indexOf('u_r(E)^2=')!==0)return render(source,false,label);
    var host=document.createElement('span'),scroll=document.createElement('span'),hint=document.createElement('span');
    host.className='ym-equation-block';scroll.className='ym-equation-scroll';scroll.setAttribute('role','region');scroll.setAttribute('aria-label','不确定度传播公式，可左右滚动查看');scroll.setAttribute('tabindex','0');
    scroll.appendChild(render(source,true,label));hint.className='ym-equation-hint';hint.textContent='左右滑动查看完整公式';host.appendChild(scroll);host.appendChild(hint);return host;
  }
  function inline(node){var text=node.nodeValue,parts=segments(text);if(!parts.length)return;var fragment=document.createDocumentFragment(),last=0;parts.forEach(function(part){fragment.appendChild(document.createTextNode(text.slice(last,part.start)));fragment.appendChild(inlineEquation(part.source,text.slice(part.start,part.end)));last=part.end;});fragment.appendChild(document.createTextNode(text.slice(last)));node.replaceWith(fragment);}
  function fixMath(math){if(math.hasAttribute('data-ym-normalized'))return;Array.from(math.querySelectorAll('mi')).forEach(function(mi){var value=mi.textContent.trim();if(/^Δ[LnF]$/.test(value)){var row=document.createElementNS(NS,'mrow'),delta=document.createElementNS(NS,'mi'),variable=document.createElementNS(NS,'mi');delta.textContent='Δ';delta.setAttribute('mathvariant','normal');variable.textContent=value.slice(1);variable.setAttribute('mathvariant','italic');row.appendChild(delta);row.appendChild(variable);mi.replaceWith(row);return;}if(functions.test(value)||value==='π'||value==='Δ')mi.setAttribute('mathvariant','normal');else if(Array.from(value).length===1&&!/[0-9①②③④⑤⑥]/.test(value))mi.setAttribute('mathvariant','italic');});math.setAttribute('data-ym-normalized','true');}
  function svgText(text){var out='',last=0,re=/(?:[nue][₀₁₂₃₄₅₆₇₈₉ᵣ]+)|R²|Δ[LnF]|[EYFSLDMbdngmkRuUqxiθσεγ](?:\u0304|[′″])?/g,match;while((match=re.exec(text))){var start=match.index,end=re.lastIndex,word=match[0];if(/[A-Za-z_]/.test(text[start-1]||'')||/[A-Za-z_]/.test(text[end]||'')||unitAt(text,start,word))continue;out+=escape(text.slice(last,start));if(word==='R²')out+='<tspan font-style="italic">R</tspan><tspan font-style="normal" baseline-shift="super" font-size="75%">2</tspan>';else if(/[₀₁₂₃₄₅₆₇₈₉ᵣ]/.test(word))out+='<tspan font-style="italic">'+escape(word[0])+'</tspan><tspan font-style="normal" baseline-shift="sub" font-size="75%">'+escape(Array.from(word.slice(1)).map(function(c){return subs[c];}).join(''))+'</tspan>';else if(/[′″]$/.test(word))out+='<tspan font-style="italic">'+escape(word.slice(0,-1))+'</tspan><tspan font-style="normal" baseline-shift="super" font-size="75%">'+escape(word.slice(-1))+'</tspan>';else if(word[0]==='Δ')out+='<tspan font-style="normal">Δ</tspan><tspan font-style="italic">'+escape(word.slice(1))+'</tspan>';else out+='<tspan font-style="italic">'+escape(word)+'</tspan>';last=end;}return out+escape(text.slice(last));}
  function typeset(root){if(!root)return;
    var hero=root.querySelector('.hero-info .formula');if(hero&&!hero.dataset.ymFormula){var note=hero.querySelector('small');hero.replaceChildren(render('Y=\\frac{σ}{ε}=\\frac{F/S}{ΔL/L}',true,'杨氏模量等于应力与应变之比'));if(note)hero.appendChild(note);hero.dataset.ymFormula='true';}
    root.querySelectorAll('.yd-formula').forEach(function(el){if(!el.dataset.ymFormula){el.replaceChildren(render('E=\\frac{8ΔF L D}{π\\bar{d}^{2}bΔn}',true,el.getAttribute('aria-label')));el.dataset.ymFormula='true';}});
    root.querySelectorAll('[data-math]').forEach(function(el){var source=el.getAttribute('data-math');if(el.dataset.ymSource!==source){el.replaceChildren(render(source,el.hasAttribute('data-math-display'),el.getAttribute('aria-label')));el.dataset.ymSource=source;}});
    root.querySelectorAll('math').forEach(fixMath);
    var selector='p,li,h3,h4,label,th,.symbol:not(.step-index),.yd-report-line>span,.yd-inline-result>span,.yd-fit-stats span,.yd-standard-components>div,.yd-budget-row>span,.optical-metrics span,[data-pair-label],[data-out="methodHint"],[data-out="dnLabel"],[data-out="forceLabel"],[data-out="ratioLabel"],[data-out="uDigitsLabel"],[data-out="diameterA"],[data-out="methodResult"]';
    var seen=new Set();root.querySelectorAll(selector).forEach(function(el){if(el.closest('math,svg,input,select,textarea,button,.section-kicker,.yd-kicker,.step-index,.ym-no-typeset'))return;var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){return n.parentElement.closest('math,svg,input,select,textarea,button,.yd-unit,.ym-no-typeset')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});var nodes=[],n;while((n=walker.nextNode()))if(!seen.has(n)){seen.add(n);nodes.push(n);}nodes.forEach(inline);});
    root.querySelectorAll('svg text').forEach(function(el){if(el.children.length)return;var text=el.textContent,formatted=svgText(text);if(formatted!==escape(text)){el.innerHTML=formatted;el.setAttribute('aria-label',text);}});
  }
  global.YoungMath={markup:markup,render:render,typeset:typeset,svgText:svgText,normalize:normalize};
})(window);
