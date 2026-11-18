/* AAD Chess Lab — zero-dependency, history-aware 0x88 chess rules kernel.
 * First executable prototype. Independent cross-engine validation is a future gate.
 */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES='abcdefgh';
const D={n:[-33,-31,-18,-14,14,18,31,33],b:[-17,-15,15,17],r:[-16,-1,1,16],k:[-17,-16,-15,-1,1,15,16,17]};
export const isBoard=i=>Number.isInteger(i)&&i>=0&&i<128&&!(i&0x88);
export const color=p=>!p||p==='.'?0:p===p.toUpperCase()?1:-1;
export const square=i=>isBoard(i)?FILES[i&7]+(8-(i>>4)):null;
export function index(s){if(!/^[a-h][1-8]$/.test(s))throw Error('Invalid square: '+s);return (8-Number(s[1]))*16+FILES.indexOf(s[0]);}
export const uci=m=>square(m.from)+square(m.to)+(m.promo||'');
export const opposite=c=>-c;
const rights={'119':1,'112':2,'7':4,'0':8};

export function parseFen(fen){
  const f=String(fen).trim().split(/\s+/);
  if(f.length!==6||!['w','b'].includes(f[1])||!/^(?:-|K?Q?k?q?)$/.test(f[2])||!/^(?:-|[a-h][36])$/.test(f[3])||!/^\d+$/.test(f[4])||!/^\d+$/.test(f[5])||Number(f[5])<1)throw Error('Expected a complete valid six-field FEN.');
  const rows=f[0].split('/'),b=Array(128).fill('.');
  if(rows.length!==8)throw Error('FEN needs eight ranks.');
  rows.forEach((row,r)=>{let c=0;for(const p of row){if(/[1-8]/.test(p))c+=Number(p);else if(/[prnbqkPRNBQK]/.test(p)&&c<8)b[r*16+c++]=p;else throw Error('Invalid FEN piece or rank.');}if(c!==8)throw Error('Invalid FEN rank width.');});
  if(b.filter(p=>p==='K').length!==1||b.filter(p=>p==='k').length!==1)throw Error('Both sides need exactly one king.');
  const pawns=b.map((p,i)=>p.toLowerCase()==='p'?i:-1).filter(i=>i>=0);
  if(pawns.some(i=>(i>>4)===0||(i>>4)===7))throw Error('Pawns cannot occupy the back rank.');
  const turn=f[1]==='w'?1:-1;
  const castle=(f[2].includes('K')?1:0)|(f[2].includes('Q')?2:0)|(f[2].includes('k')?4:0)|(f[2].includes('q')?8:0);
  for(const [bit,k,r] of [[1,116,119],[2,116,112],[4,4,7],[8,4,0]])if((castle&bit)&&(b[k]!== (bit<=2?'K':'k')||b[r]!==(bit<=2?'R':'r')))throw Error('Castling rights conflict with board.');
  const ep=f[3]==='-'?-1:index(f[3]);
  if(ep>=0){const rank=8-(ep>>4);if(rank!==(turn===1?6:3)||b[ep]!=='.'||b[ep+16*turn]!==(turn===1?'p':'P'))throw Error('Invalid en-passant target for side to move.');}
  const s={board:b,turn,castle,ep,half:Number(f[4]),full:Number(f[5])};
  if(inCheck(s,-turn))throw Error('FEN is illegal: player who just moved is in check.');
  const wk=b.indexOf('K'),bk=b.indexOf('k');
  if(D.k.some(d=>wk+d===bk))throw Error('Kings cannot be adjacent.');
  return s;
}
export function toFen(s){
 let ranks=[];for(let r=0;r<8;r++){let row='',spaces=0;for(let c=0;c<8;c++){const p=s.board[r*16+c];if(p==='.')spaces++;else{if(spaces){row+=spaces;spaces=0;}row+=p;}}if(spaces)row+=spaces;ranks.push(row);}
 return ranks.join('/')+' '+(s.turn===1?'w':'b')+' '+([s.castle&1?'K':'',s.castle&2?'Q':'',s.castle&4?'k':'',s.castle&8?'q':''].join('')||'-')+' '+(s.ep>=0?square(s.ep):'-')+' '+s.half+' '+s.full;
}
export function attacked(s,target,by){
 if(!isBoard(target))return false;
 for(let f=0;f<128;f++){if(!isBoard(f)||color(s.board[f])!==by)continue;
  const p=s.board[f].toLowerCase();
  if(p==='p'){if(target===f-16*by-1||target===f-16*by+1)return true;continue;}
  for(const d of D[p]||D.k){for(let t=f+d;isBoard(t);t+=d){if(t===target)return true;if(s.board[t]!=='.'||p==='n'||p==='k')break;}}
 }
 return false;
}
export function inCheck(s,who=s.turn){return attacked(s,s.board.indexOf(who===1?'K':'k'),-who);}
export function stepUnchecked(s,m){
 const b=s.board.slice(),piece=b[m.from],captured=b[m.to];let castle=s.castle;
 b[m.from]='.';b[m.to]=m.promo?(s.turn===1?m.promo.toUpperCase():m.promo):piece;
 if(m.flag==='ep')b[m.to+16*s.turn]='.';
 if(m.flag==='castle'){const rf=m.to>m.from?m.from+3:m.from-4,rt=m.to>m.from?m.from+1:m.from-1;b[rt]=b[rf];b[rf]='.';}
 if(piece==='K')castle&=~3;if(piece==='k')castle&=~12;
 if(piece.toLowerCase()==='r')castle&=~(rights[m.from]||0);
 if(captured.toLowerCase()==='r')castle&=~(rights[m.to]||0);
 const pawn=piece.toLowerCase()==='p';
 return {board:b,turn:-s.turn,castle,ep:pawn&&Math.abs(m.to-m.from)===32?(m.to+m.from)/2:-1,half:pawn||captured!=='.'||m.flag==='ep'?0:s.half+1,full:s.full+(s.turn===-1?1:0)};
}
function pseudo(s){
 const out=[];for(let f=0;f<128;f++){if(!isBoard(f)||color(s.board[f])!==s.turn)continue;
 const p=s.board[f].toLowerCase();
 const add=(t,flag='')=>{if(s.board[t].toLowerCase()==='k')return;if(p==='p'&&((t>>4)===0||(t>>4)===7)){for(const q of ['q','r','b','n'])out.push({from:f,to:t,promo:q,flag});}else out.push({from:f,to:t,promo:'',flag});};
 if(p==='p'){
  const t=f-16*s.turn;
  if(isBoard(t)&&s.board[t]==='.'){
    add(t);const u=t-16*s.turn;if((f>>4)===(s.turn===1?6:1)&&s.board[u]==='.')add(u);
  }
  for(const d of [-1,1]){const u=t+d;if(!isBoard(u))continue;
   if(color(s.board[u])===-s.turn)add(u);
   else if(u===s.ep&&s.board[u]==='.'&&s.board[u+16*s.turn]===(s.turn===1?'p':'P'))add(u,'ep');
  }
 }else{
  for(const d of D[p]||D.k){for(let t=f+d;isBoard(t);t+=d){if(color(s.board[t])===s.turn)break;add(t);if(s.board[t]!=='.'||p==='n'||p==='k')break;}}
  if(p==='k'&&f===(s.turn===1?116:4)&&!inCheck(s)){
    const rook=s.turn===1?'R':'r',ks=s.turn===1?1:4,qs=s.turn===1?2:8;
    if((s.castle&ks)&&s.board[f+3]===rook&&s.board[f+1]==='.'&&s.board[f+2]==='.'&&!attacked(s,f+1,-s.turn)&&!attacked(s,f+2,-s.turn))add(f+2,'castle');
    if((s.castle&qs)&&s.board[f-4]===rook&&s.board[f-1]==='.'&&s.board[f-2]==='.'&&s.board[f-3]==='.'&&!attacked(s,f-1,-s.turn)&&!attacked(s,f-2,-s.turn))add(f-2,'castle');
  }
 }
 }
 return out;
}
export function legalMoves(s){return pseudo(s).filter(m=>!inCheck(stepUnchecked(s,m),s.turn));}
export function legalMove(s,text){return legalMoves(s).find(m=>uci(m)===String(text||'').trim().toLowerCase())||null;}
export function san(s,m,all=null){
 const piece=s.board[m.from].toUpperCase(),captured=s.board[m.to]!=='.'||m.flag==='ep';let str='';
 if(m.flag==='castle')str=m.to>m.from?'O-O':'O-O-O';
 else{
  if(piece!=='P'){
    str=piece;const rivals=(all||legalMoves(s)).filter(x=>x.from!==m.from&&x.to===m.to&&s.board[x.from]===s.board[m.from]);
    if(rivals.length)str+=!rivals.some(x=>(x.from&7)===(m.from&7))?square(m.from)[0]:!rivals.some(x=>(x.from>>4)===(m.from>>4))?square(m.from)[1]:square(m.from);
  }else if(captured)str=square(m.from)[0];
  str+=(captured?'x':'')+square(m.to)+(m.promo?'='+m.promo.toUpperCase():'');
 }
 const after=stepUnchecked(s,m);if(inCheck(after))str+=legalMoves(after).length?'+' : '#';return str;
}
export function applyUci(s,move){const m=legalMove(s,move);if(!m)throw Error('Illegal move: '+move);return stepUnchecked(s,m);}
export function positionKey(s){const ep=s.ep>=0&&legalMoves(s).some(m=>m.flag==='ep')?square(s.ep):'-';return s.board.join('')+':'+s.turn+':'+s.castle+':'+ep;}
export function insufficientMaterial(s){let pieces=[];for(let i=0;i<128;i++)if(isBoard(i)&&s.board[i]!=='.'&&s.board[i].toLowerCase()!=='k')pieces.push([s.board[i].toLowerCase(),((i>>4)+(i&7))%2]);
 return pieces.length===0||(pieces.length===1&&['n','b'].includes(pieces[0][0]))||(pieces.every(p=>p[0]==='b')&&new Set(pieces.map(p=>p[1])).size===1);
}
export function getStatus(states){
 const s=states[states.length-1],moves=legalMoves(s),check=inCheck(s),rep=states.filter(x=>positionKey(x)===positionKey(s)).length;
 if(moves.length===0)return {over:true,result:check?'Checkmate':'Stalemate',detail:check?(s.turn===1?'Black':'White')+' wins':'Draw',claim:null};
 if(insufficientMaterial(s))return {over:true,result:'Draw',detail:'Dead position (insufficient mating material)',claim:null};
 if(s.half>=150||rep>=5)return {over:true,result:'Draw',detail:s.half>=150?'75-move rule':'Fivefold repetition',claim:null};
 return {over:false,result:check?'Check':'In play',detail:(s.turn===1?'White':'Black')+' to move',claim:rep>=3?'Threefold repetition':s.half>=100?'50-move rule':null};
}
export class ChessGame{
 constructor(fen=START_FEN){this.load(fen);}
 load(fen){this.states=[parseFen(fen)];this.records=[];this.claimed=null;this.initialFen=toFen(this.states[0]);return this;}
 get state(){return this.states[this.states.length-1];}
 get status(){const x=getStatus(this.states);return this.claimed?{over:true,result:'Draw claimed',detail:this.claimed,claim:null}:x;}
 get moves(){return this.status.over?[]:legalMoves(this.state);}
 move(text){if(this.status.over)throw Error('Game is finished.');const m=legalMove(this.state,text);if(!m)throw Error('Illegal move: '+text);const old=this.state,notation=san(old,m);this.states.push(stepUnchecked(old,m));const rec={uci:uci(m),san:notation,number:old.full,side:old.turn};this.records.push(rec);return rec;}
 undo(){if(this.states.length<=1)return null;this.states.pop();this.claimed=null;return this.records.pop();}
 claim(){const s=this.status;if(!s.claim)throw Error('No claimable draw in this position.');this.claimed=s.claim;}
}
