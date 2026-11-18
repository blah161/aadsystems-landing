import {ChessGame,START_FEN,index,square,uci,toFen,legalMoves,inCheck,stepUnchecked} from './chess-rules.js';
import {ONTOLOGY,signature,observe,analyzePosition,checkCandidate,checkOpponentReplies,explain} from './semantics.js';
const $=s=>document.querySelector(s);
const board=$('#board'),candidates=$('#candidates'),overview=$('#ontology'),replyBox=$('#reply-analysis'),narrative=$('#narrative');
const glyphs={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'\u265F\uFE0E','.':''};
const stages={central:['e2e4','e7e5','g1f3'],mate:['e2e4','e7e5','d1h5','b8c6','f1c4','a7a6'],start:[],shield:['e2e4','e7e5','g1f3','f7f6']};
let game=new ChessGame(),selectedSquare=-1,chosenMove=null,analysis=null,lastReply=null,pending=null,showAll=false,showReplyList=false,initialLabel='';
function announce(msg,isError=false){const node=$('#alert');node.textContent=msg;node.classList.toggle('error',isError);node.classList.add('show');window.clearTimeout(announce.timer);announce.timer=window.setTimeout(()=>node.classList.remove('show'),4500);}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=id=>ONTOLOGY.find(x=>x.id===id)?.title||id;
function loadPreset(which){
 game=new ChessGame(START_FEN);
 for(const move of stages[which]||[])game.move(move);
 initialLabel=which==='central'?'Manuscript example · 1.e4 e5 2.Nf3':which==='mate'?'Mate-in-one witness · 3...a6':which==='shield'?'Counterexample state · 2...f6':'New game';
 // Secondary Failure illustrates Black's king-shield predicate even though White is to move.
 // Other demonstrations return the observer to the natural side-to-move view.
 $('#perspective-select').value=which==='shield'?'black':'turn';
 resetFocus();refresh();
 if(which==='central')choose('b8c6',false);
 if(which==='mate')choose('h5f7',false);
 announce('Loaded: '+initialLabel);
}
function resetFocus(){selectedSquare=-1;chosenMove=null;lastReply=null;pending=null;showReplyList=false;$('#promotion').hidden=true;}
function play(move){
 try{const record=game.move(move);resetFocus();refresh();announce('Played '+(record.side===1?record.number+'. ':record.number+'... ')+record.san);}catch(e){announce(e.message,true);}
}
function clickSquare(i){
 if(game.status.over)return;
 const s=game.state,moves=game.moves;
 if(pending)return;
 if(selectedSquare>=0){const matches=moves.filter(m=>m.from===selectedSquare&&m.to===i);
  if(matches.length){if(matches.length>1){pending=matches;renderPromotion();return;}play(uci(matches[0]));return;}
 }
 if(s.board[i]!=='.'&&(s.board[i]===s.board[i].toUpperCase())===(s.turn===1))selectedSquare=(selectedSquare===i?-1:i);else selectedSquare=-1;
 renderBoard();
}
function renderBoard(){
 const s=game.state,moves=game.moves,targets=new Set(moves.filter(m=>m.from===selectedSquare).map(m=>m.to));
 const last=game.records.at(-1)?.uci,from=last?index(last.slice(0,2)):-1,to=last?index(last.slice(2,4)):-1;
 const origin=chosenMove?index(chosenMove.move.slice(0,2)):-1,destination=chosenMove?index(chosenMove.move.slice(2,4)):-1;
 const frag=document.createDocumentFragment();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const i=row*16+col,p=s.board[i],el=document.createElement('button');
  el.type='button';el.className='square '+((row+col)%2===0?'light':'dark');
  if(i===selectedSquare)el.classList.add('selected');
  if(i===from||i===to)el.classList.add('lastmove');
  if(i===origin||i===destination)el.classList.add('candidate-path');
  if(p.toLowerCase()==='k'&&p!=='.'&&p=== (s.turn===1?'K':'k')&&inCheck(s))el.classList.add('checked');
  el.setAttribute('aria-label',square(i)+' '+(p==='.'?'empty':pieceDescription(p))+(targets.has(i)?', legal destination':''));
  if(p!=='.'){const piece=document.createElement('span');piece.className='piece '+(p===p.toUpperCase()?'white':'black');piece.textContent=glyphs[p];el.append(piece);}
  if(targets.has(i)){const dot=document.createElement('span');dot.className=p==='.'?'target-dot':'target-ring';el.append(dot);}
  if(col===0){const n=document.createElement('span');n.className='coord rank';n.textContent=8-row;el.append(n);}
  if(row===7){const n=document.createElement('span');n.className='coord file';n.textContent='abcdefgh'[col];el.append(n);}
  el.addEventListener('click',()=>clickSquare(i));frag.append(el);
 }
 board.replaceChildren(frag);
}
function pieceDescription(p){const type={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'}[p.toLowerCase()];return (p===p.toUpperCase()?'white ':'black ')+type;}
function renderPromotion(){const modal=$('#promotion');modal.hidden=false;$('#promotion-choices').replaceChildren();for(const m of pending){const btn=document.createElement('button');btn.className='btn secondary';btn.textContent=({q:'Queen',r:'Rook',b:'Bishop',n:'Knight'})[m.promo];btn.addEventListener('click',()=>play(uci(m)));$('#promotion-choices').append(btn);} }
function renderHistory(){const moves=game.records;$('#move-history').innerHTML=moves.length?moves.map(x=>'<span class="move-chip"><small>'+x.number+(x.side===1?'.':'...')+'</small>'+escape(x.san)+'</span>').join(''):'<span class="muted">No moves played yet.</span>';$('#history-heading').textContent=moves.length+' move'+(moves.length===1?'':'s')+' played';}
function selectedPerspective(){
 const choice=$('#perspective-select').value;
 return choice==='white'?1:choice==='black'?-1:game.state.turn;
}
function renderOntology(){
 const s=game.state,p=selectedPerspective(),obs=observe(s,p),vals=signature(obs);
 $('#signature').textContent='Φ = ('+vals.join(', ')+')';
 const count=vals.reduce((a,b)=>a+b,0);$('#failure-count').textContent=count;
 $('#player-label').textContent=p===1?'WHITE':'BLACK';
 $('#semantics-sub').textContent='Five exact checks · '+(p===1?'White':'Black')+' perspective';
 overview.innerHTML=ONTOLOGY.map(f=>{
  const active=obs.values[f.id],w=obs.witnesses[f.id];
  return '<div class="predicate '+(active?'active':'')+'"><div class="pred-indicator"><span class="pred-state">'+(active?'FLAGGED':'CLEAR')+'</span></div><div class="pred-body"><div class="pred-head"><strong>'+escape(f.title)+'</strong><code>'+escape(f.symbol)+'</code></div><p>'+escape(f.desc)+'</p>'+(w.length?'<div class="evidence">Evidence on: '+escape(w.join(', '))+'</div>':'')+'</div></div>';
 }).join('');
}
function candidateCard(e,idx){
 const supported=e.repaired.filter(id=>e.guard[id]),suppressed=e.repaired.filter(id=>!e.guard[id]);
 const cls=chosenMove?.move===e.move?' chosen':'';
 const scoreNote=supported.length?'Clears: '+supported.map(name).join(', '):suppressed.length?'Flag changes, subject not retained':'No flagged condition cleared';
 return '<button class="candidate'+cls+'" data-move="'+escape(e.move)+'" aria-label="Preview '+escape(e.san)+'"><div class="cand-heading"><span class="move-name">'+escape(e.san)+'</span><code>'+escape(e.move)+'</code><span class="cand-rank">'+(idx+1).toString().padStart(2,'0')+'</span></div><div class="cand-detail">'+escape(scoreNote)+'</div><div class="cand-tags">'+(supported.length?'<span class="tag positive">'+supported.length+' flag'+(supported.length===1?'':'s')+' cleared</span>':'')+(e.introduced.length?'<span class="tag negative">'+e.introduced.length+' newly flagged</span>':'<span class="tag neutral">No new flags</span>')+(suppressed.length?'<span class="tag warning">Subject not retained</span>':'')+'</div></button>';
}
/* Plain-language interpretation of the exact predicates; no chess-strength
 * conclusion is inferred from an observed 1→0 transition. */
function reason(s,e,id,isCleared){
 const a=isCleared?e.before:e.after;
 const loc=a.witnesses[id]||[];
 const where=loc.join(', ');
 const p=e.before.player,king=p===1?'e1':'e8',pawn=p===1?'f2':'f7';
 if(id==='center'){
  if(isCleared){
   const movedOrGuarded=e.before.witnesses.center.find(q=>e.afterState.board[index(q)]===s.board[index(q)]);
   return movedOrGuarded?'The pawn on '+movedOrGuarded+' is no longer both attacked and undefended after this move. Its exposure flag clears.':'The exposed central-pawn condition disappears, but the original pawn is not retained on its named square.';
  }
  return 'The central pawn on '+where+' is now attacked without a friendly defender, so its exposure flag turns on.';
 }
 if(id==='shield'){
  return isCleared?
   'The specific home-king condition no longer holds: the king is no longer on '+king+' or its '+pawn+' pawn is present. This clears that structural flag.':
   'The king remains on '+king+' but its '+pawn+' pawn is missing. That precisely triggers the home-king shield flag.';
 }
 if(id==='isolated'){
  if(isCleared&&e.m.promo){
   return 'The isolated pawn on '+(e.before.witnesses.isolated.join(', ')||'its original square')+' promotes into a '+({q:'queen',r:'rook',b:'bishop',n:'knight'})[e.m.promo]+'. The isolation test no longer finds an isolated pawn.';
  }
  return isCleared?'After the move, every remaining pawn has a friendly pawn on at least one adjacent file (or no pawns remain).':'The pawn at '+where+' has no friendly pawn on an adjacent file; the isolated-pawn flag switches on.';
 }
 if(id==='check')return isCleared?'After the move, this player’s king is no longer under attack.':'After the move, this player’s king is attacked, so the king-under-attack flag turns on.';
 if(id==='major')return isCleared?'No rook or queen is now both attacked and undefended under the declared test. The named piece must also be retained for a guarded rescue claim.':'A rook or queen on '+where+' is attacked and has no friendly geometric defender, triggering the exposed-major-piece flag.';
 return (isCleared?'Clears ':'Introduces ')+name(id)+'.';
}
function renderImpact(s,e){
 const items=[];
 for(const id of e.repaired){
  const ok=e.guard[id];
  items.push('<div class="impact-item '+(ok?'':'caution')+'"><span class="impact-type">'+(ok?'CLEARED · ':'FLAG DISAPPEARS · ')+'</span><strong>'+escape(name(id))+'.</strong> '+escape(reason(s,e,id,true))+(ok?'':' <strong>Named subject not retained: not a guarded repair.</strong>')+'</div>');
 }
 for(const id of e.introduced){
  items.push('<div class="impact-item new"><span class="impact-type">NEW FLAG · </span><strong>'+escape(name(id))+'.</strong> '+escape(reason(s,e,id,false))+'</div>');
 }
 return '<div class="impact-explainer"><h4>What changed—and why?</h4>'+
   (items.length?items.join(''):'<p class="impact-none">None of these five yes/no flags changes. The move can still have other chess effects.</p>')+
   '<p class="impact-footnote"><b>Interpretation:</b> clearing a flag is an exact structural observation. A move must also satisfy its declared guard and opponent-response conditions to support a stronger repair claim.</p></div>';
}
function renderContrast(){
 const contrast=$('#contrast');
 const knight=analysis.candidates.find(x=>x.move==='b8c6'),pawn=analysis.candidates.find(x=>x.move==='f7f6');
 if(!knight||!pawn){contrast.hidden=true;contrast.innerHTML='';return;}
 contrast.hidden=false;
 contrast.innerHTML='<div class="label">TRY THIS · BLACK’S TWO REPAIRS</div><p>Both moves address the e5 pawn. Click each to preview the difference in panel 03; the board stays put until you choose to play it.</p><div class="contrast-grid">'+
 '<button type="button" class="contrast-btn" id="compare-nc6"><strong>2...Nc6</strong><small>e5 pawn defended · f7 shield retained</small></button>'+
 '<button type="button" class="contrast-btn" id="compare-f6"><strong>2...f6</strong><small>e5 pawn defended · f7 shield displaced</small></button></div>';
 $('#compare-nc6').addEventListener('click',()=>choose('b8c6'));
 $('#compare-f6').addEventListener('click',()=>choose('f7f6'));
}
function renderCandidates(){
 const shown=showAll?analysis.candidates:analysis.candidates.slice(0,10);
 candidates.innerHTML=shown.length?shown.map(candidateCard).join(''):'<p class="muted">No legal moves in this position.</p>';
 candidates.querySelectorAll('[data-move]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.move)));
 $('#candidate-counter').textContent=shown.length+' of '+analysis.candidates.length+' legal moves';
 $('#show-all').textContent=showAll?'Show first 10':'Show all moves';
}
function choose(move,scroll=true){
 chosenMove=analysis.candidates.find(x=>x.move===move);if(!chosenMove)return;
 selectedSquare=-1;showReplyList=false;
 lastReply=checkOpponentReplies(game.state,chosenMove.m);
 renderBoard();renderCandidates();renderSelection();
 if(scroll)$('#analysis-panel').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function renderSelection(){
 if(!chosenMove){
  $('#selected-title').textContent='Select a candidate move';
  narrative.textContent='Choose a candidate to preview its structural effects before playing it.';
  $('#play-selected').disabled=true;replyBox.innerHTML='';return;
 }
 const s=game.state,e=chosenMove,r=lastReply,check=checkCandidate(s,e.m);
 $('#selected-title').textContent=e.san+' · Before you play';
 narrative.textContent='This preview compares the current position with the position after '+e.san+'. The board will not move until you click Play Selected Move.';
 $('#play-selected').disabled=game.status.over;
 const cleared=e.repaired.filter(id=>e.guard[id]),introduced=e.introduced;
 const fmt=ids=>ids.length?ids.map(name).join(' · '):'None';
 const before=signature(e.before).join(', '),after=signature(e.after).join(', ');
 let status='';
 if(r.terminalAfterMove)status='The opponent has no legal reply in the resulting position; review its terminal chess status.';
 else if(!r.targets.length)status='No subject-retaining cleared condition is available for the one-reply persistence test. The legal replies are still enumerated.';
 else if(r.oneReplyRobust)status='Every one of the '+r.checkedCount+' legal immediate replies leaves the named cleared conditions absent and preserves their subjects.';
 else status='Of '+r.checkedCount+' immediate legal replies, '+r.counterexamples.length+' reactivates a condition or breaks its named-subject guard.';
 const other=observe(e.afterState,-s.turn),opposite=(s.turn===1?'Black':'White');
 replyBox.innerHTML='<div class="metrics"><div><small>CURRENT POSITION · '+(s.turn===1?'WHITE':'BLACK')+'</small><code>('+before+')</code></div><div><small>AFTER '+escape(e.san)+'</small><code>('+after+')</code></div></div>'+renderImpact(s,e)+
  '<div class="detail-line"><span>Flags cleared (1→0)</span><strong class="good">'+escape(fmt(cleared))+'</strong></div>'+ 
  '<div class="detail-line"><span>New flags (0→1)</span><strong class="'+(introduced.length?'bad':'')+'">'+escape(fmt(introduced))+'</strong></div>'+
  '<div class="detail-line"><span>Local record</span><strong>'+ (check.accepted?'Chess move + predicate values recomputed':'Rejected')+'</strong></div>'+ 
  '<p class="perspective-note">Panel 02 can show either player. This move preview always tracks the <strong>'+(s.turn===1?'White':'Black')+'</strong> player who is moving. The resulting '+opposite+' signature is Φ = ('+signature(other).join(', ')+').</p>'+
  '<div class="verification"><div class="verification-head"><span class="dot '+(r.oneReplyRobust?'green':r.targets.length?'amber':'blue')+'"></span><strong>Now challenge the move: opponent replies</strong></div><p>'+escape(status)+'</p>'+
  '<div class="reply-stats"><span>'+r.checkedCount+' replies examined</span><span>'+r.counterexamples.length+' counter-replies</span><span>'+r.notRecoverable.length+' without immediate restoration</span></div></div>'+
  (r.counterexamples.length?'<div class="refutations"><strong>Replies that challenge this repair</strong><div class="reply-list">'+r.counterexamples.slice(0,8).map(d=>'<span>'+escape(d.san)+' <small>('+escape([...d.reopened.map(name),...d.guardBroken.map(id=>'Guard broken: '+name(id))].join(', '))+')</small></span>').join('')+'</div></div>':'')+
  '<button id="all-replies" class="btn ghost small" type="button">'+(showReplyList?'Hide':'Inspect')+' all '+r.checkedCount+' opponent replies</button>'+
  (showReplyList?'<div class="all-replies">'+r.details.map(d=>'<div><strong>'+escape(d.san)+'</strong><span>'+escape(d.reopened.length||d.guardBroken.length?[d.reopened.length?'Reopens: '+d.reopened.map(name).join(', '):'',d.guardBroken.length?'Guard lost: '+d.guardBroken.map(name).join(', '):'',d.firstRestoration?'Possible restoration: '+d.firstRestoration:''].filter(Boolean).join(' · '):'Named conditions remain clear and subject retained')+'</span></div>').join('')+'</div>':'')+
  '<p class="scope">One-opponent-move analysis relative to five exact predicates. Calculations use this app’s legal-move implementation; deeper certified strategies are a future extension.</p>';
 $('#all-replies').addEventListener('click',()=>{showReplyList=!showReplyList;renderSelection();});
}
function renderStatus(){const s=game.status;
 $('#turn').textContent=s.detail;$('#state-label').textContent=s.result;
 $('#turn-dot').classList.toggle('ended',s.over);
 const claim=$('#draw-claim');claim.hidden=!s.claim;claim.textContent='Claim draw · '+(s.claim||'');
 $('#move-input').disabled=s.over;$('#play-move').disabled=s.over;$('#undo').disabled=game.records.length===0;
 $('#loaded-position').textContent=initialLabel||'New game';
 $('#analysis-perspective').textContent=game.state.turn===1?'White-to-move':'Black-to-move';
 $('#current-fen').value=toFen(game.state);
}
function refresh(){
 analysis=analyzePosition(game.state);
 if(chosenMove&&!analysis.candidates.some(x=>x.move===chosenMove.move)){chosenMove=null;lastReply=null;}
 renderStatus();renderBoard();renderOntology();renderContrast();renderHistory();renderCandidates();renderSelection();
}
$('#preset-central').addEventListener('click',()=>loadPreset('central'));
$('#preset-mate').addEventListener('click',()=>loadPreset('mate'));
$('#preset-shield').addEventListener('click',()=>loadPreset('shield'));
$('#new-game').addEventListener('click',()=>loadPreset('start'));
$('#undo').addEventListener('click',()=>{game.undo();resetFocus();refresh();announce('Last move undone.');});
$('#draw-claim').addEventListener('click',()=>{try{game.claim();resetFocus();refresh();}catch(e){announce(e.message,true);}});
$('#show-all').addEventListener('click',()=>{showAll=!showAll;renderCandidates();});
$('#perspective-select').addEventListener('change',()=>renderOntology());
$('#play-selected').addEventListener('click',()=>{if(chosenMove)play(chosenMove.move);});
$('#copy-fen').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#current-fen').value);announce('FEN copied.');}catch(e){$('#current-fen').select();announce('FEN selected; copy with Ctrl/Cmd+C.');}});
$('#load-fen').addEventListener('click',()=>{try{game=new ChessGame($('#fen-input').value);initialLabel='Custom FEN · history reset';resetFocus();refresh();announce('Loaded position. Repetition history is not encoded in FEN.');}catch(e){announce(e.message,true);}});
$('#move-form').addEventListener('submit',e=>{e.preventDefault();const val=$('#move-input').value.trim().toLowerCase();if(val){play(val);$('#move-input').value='';}});
$('#cancel-promotion').addEventListener('click',()=>{pending=null;$('#promotion').hidden=true;});
$('#hero-demo').addEventListener('click',()=>{$('#lab').scrollIntoView({behavior:'smooth'});});
loadPreset('central');
