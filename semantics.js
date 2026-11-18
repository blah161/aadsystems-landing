/* AAD Chess Lab — executable instantiation of the manuscript's five
 * structural predicates (Definition 3.2), repair profile (Definition 4.3),
 * and one-opponent-reply robustness test (Definition 4.2).
 * The names describe exact structural facts; they do not encode chess strength.
 */
import {attacked,index,isBoard,legalMoves,san,square,stepUnchecked,uci,inCheck} from './chess-rules.js';

export const ONTOLOGY=[
 {id:'check',symbol:'fcheck',title:'King under attack',desc:'The king is attacked by an opposing piece.'},
 {id:'center',symbol:'fcenter',title:'Exposed central pawn',desc:'An attacked, geometrically undefended pawn on d4, e4, d5, or e5.'},
 {id:'major',symbol:'fmajor',title:'Exposed rook or queen',desc:'An attacked, geometrically undefended rook or queen.'},
 {id:'shield',symbol:'fshield',title:'Home-king shield displacement',desc:'The king remains on e1/e8 while its f2/f7 pawn is absent.'},
 {id:'isolated',symbol:'fisolated',title:'Isolated pawn',desc:'At least one pawn has no friendly pawn on an adjacent file.'},
];
const pieceOf=(p,low)=>p===1?low.toUpperCase():low;
export function observe(s,player){
 if(player!==1&&player!==-1)throw Error('Player must be White (+1) or Black (-1).');
 const b=s.board,own=player,enemy=-own,centerSquares=['d4','e4','d5','e5'];
 const kingSq=b.indexOf(pieceOf(own,'k'));
 const checked=attacked(s,kingSq,enemy);
 const vulnerableCentral=centerSquares.map(index).filter(i=>b[i]===pieceOf(own,'p')&&attacked(s,i,enemy)&&!attacked(s,i,own));
 const vulnerableMajor=[];
 for(let i=0;i<128;i++)if(isBoard(i)&&[pieceOf(own,'q'),pieceOf(own,'r')].includes(b[i])&&attacked(s,i,enemy)&&!attacked(s,i,own))vulnerableMajor.push(i);
 const kingHome=own===1?'e1':'e8',pawnShield=own===1?'f2':'f7';
 const displaced=square(kingSq)===kingHome&&b[index(pawnShield)]!==pieceOf(own,'p');
 const pawns=[];for(let i=0;i<128;i++)if(isBoard(i)&&b[i]===pieceOf(own,'p'))pawns.push(i);
 const files=new Set(pawns.map(i=>i&7));
 const isolated=pawns.filter(i=>!files.has((i&7)-1)&&!files.has((i&7)+1));
 return {player,values:{check:checked,center:vulnerableCentral.length>0,major:vulnerableMajor.length>0,shield:displaced,isolated:isolated.length>0},
 witnesses:{check:checked?[square(kingSq)]:[],center:vulnerableCentral.map(square),major:vulnerableMajor.map(square),shield:displaced?[pawnShield]:[],isolated:isolated.map(square)}};
}
export function signature(obs){return ONTOLOGY.map(f=>Number(obs.values[f.id]));}
export function edge(s,m,player=s.turn){
 const before=observe(s,player),afterState=stepUnchecked(s,m),after=observe(afterState,player);
 const repaired=ONTOLOGY.filter(f=>before.values[f.id]&&!after.values[f.id]).map(f=>f.id);
 const introduced=ONTOLOGY.filter(f=>!before.values[f.id]&&after.values[f.id]).map(f=>f.id);
 const unchanged=ONTOLOGY.filter(f=>before.values[f.id]===after.values[f.id]).map(f=>f.id);
 const guard={};
 for(const id of repaired){
  if(id==='center')guard[id]=before.witnesses[id].some(q=>afterState.board[index(q)]===s.board[index(q)]);
  else if(id==='major')guard[id]=before.witnesses[id].some(q=>{
    const from=index(q);return afterState.board[from]===s.board[from]||
      (m.from===from&&afterState.board[m.to]===s.board[from]);
  });
  else guard[id]=true;
 }
 return {move:uci(m),san:san(s,m),before,after,afterState,repaired,introduced,unchanged,guard,
   validLocalRepair:repaired.some(id=>guard[id]),
   score:repaired.filter(id=>guard[id]).length*4-introduced.length*3+(inCheck(afterState)?0.2:0)};
}
export function analyzePosition(s){
 const player=s.turn;
 const candidates=legalMoves(s).map(m=>({...edge(s,m,player),m}));
 candidates.sort((a,b)=>b.score-a.score||a.san.localeCompare(b.san));
 return {player,observation:observe(s,player),candidates};
}
function allSatisfied(s,player,ids){const o=observe(s,player);return ids.every(id=>!o.values[id]);}
/* A guarded persistence claim requires the originally named subject to
 * survive opponent replies. The center-pawn guard is 'pawn remains on its
 * original target square' (the contract used in manuscript Example 4.9). */
function subjectGuardAfterReply(origin,e,replyState,id,m){
 if(id==='center')return e.before.witnesses.center.some(q=>replyState.board[index(q)]===origin.board[index(q)]);
 if(id==='major')return e.before.witnesses.major.some(q=>{
   const from=index(q),target=m.from===from?m.to:from;
   return replyState.board[target]===origin.board[from];
 });
 return true;
}
/* Replays from source; never trusts precomputed semantic values. Both the
 * proposer and this checker use the same chess rules kernel (not independent
 * cross-engine chess-rule validation). */
export function checkCandidate(s,m){
 const listed=legalMoves(s).find(x=>uci(x)===uci(m));
 if(!listed)return {accepted:false,reason:'Move not legal from source state'};
 const fact=edge(s,listed,s.turn);
 const recomputed=observe(fact.afterState,s.turn);
 const equal=ONTOLOGY.every(f=>fact.after.values[f.id]===recomputed.values[f.id]);
 return {accepted:equal,reason:equal?'Legal transition and structural facts recomputed':'Semantic observation mismatch'};
}
export function checkOpponentReplies(s,m){
 const valid=legalMoves(s).find(x=>uci(x)===uci(m));
 if(!valid)throw Error('Cannot analyze an illegal move.');
 const e=edge(s,valid,s.turn),player=s.turn,replyMoves=legalMoves(e.afterState);
 const targets=e.repaired.filter(id=>e.guard[id]);
 const rejected=e.repaired.filter(id=>!e.guard[id]);
 const details=replyMoves.map(r=>{
  const resulting=stepUnchecked(e.afterState,r),obs=observe(resulting,player);
  const reopened=targets.filter(id=>obs.values[id]);
  const guardBroken=targets.filter(id=>!subjectGuardAfterReply(s,e,resulting,id,valid));
  // A guard that has lost its named subject cannot be restored by a
  // later move; restored predicate values are a different, weaker claim.
  const restorations=reopened.length&&!guardBroken.length?
    legalMoves(resulting).filter(z=>allSatisfied(stepUnchecked(resulting,z),player,targets)):[];
  const restorable=!guardBroken.length&&(reopened.length===0||restorations.length>0);
  return {uci:uci(r),san:san(e.afterState,r),reopened,guardBroken,restorable,firstRestoration:restorations.length?san(resulting,restorations[0]):null};
 });
 const counterexamples=details.filter(x=>x.reopened.length>0||x.guardBroken.length>0);
 const notRecoverable=details.filter(x=>!x.restorable);
 return {move:uci(valid),san:e.san,targets,rejected,checkedCount:replyMoves.length,details,
  counterexamples,notRecoverable,
  oneReplyRobust:targets.length>0&&counterexamples.length===0,
  recoverableByOneMove:targets.length>0&&notRecoverable.length===0,
  terminalAfterMove:replyMoves.length===0};
}
export function explain(s,e){
 const names=ids=>ids.map(id=>ONTOLOGY.find(x=>x.id===id)?.title||id);
 const real=e.repaired.filter(id=>e.guard[id]);
 const suppressed=e.repaired.filter(id=>!e.guard[id]);
 let parts=[];
 if(real.length)parts.push('Resolves '+names(real).join(' and ').toLowerCase()+'.');
 else if(e.repaired.length)parts.push('A failure predicate disappears, but its identified subject is not preserved.');
 else parts.push('No active failure predicate is removed in this five-predicate ontology.');
 if(e.introduced.length)parts.push('Introduces '+names(e.introduced).join(' and ').toLowerCase()+'.');
 if(suppressed.length)parts.push('Subject-persistence guard fails for '+names(suppressed).join(', ')+'.');
 return parts.join(' ');
}
