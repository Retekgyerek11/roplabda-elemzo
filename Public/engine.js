
// ═══════════════════════════════════════════════════════════════════════
// RÖPLABDA MECCS ELEMZŐ — core parsing & stats engine
// Works both in Node (for testing) and in the browser (no imports/exports
// needed in browser build — this file is inlined into a <script> tag).
// ═══════════════════════════════════════════════════════════════════════

// The statistician's OWN code set (highlighted in their Attack Combinations
// sheet). Any attack code outside this set comes from a different scout and
// must be mapped onto one of these before it can be analysed.
const OWN_CODES = ['XF','X2','X1','X7','PP','XP','X5','X0','X6','X8','V5','V6','V8','VP','V3','PR'];

const KNOWN_COMBOS = ["V5","X5","V6","X6","V8","X8","VP","XP","VB","XB","VR","XR",
  "V0","X0","X1","XM","XC","XG","X2","XF","X7","X3","XT","X4","X9","PP","PR","P2","C5","C6","C8","CB","CF","CD"]
  .sort((a,b)=>b.length-a.length);

function decodeDVWBytes(bytes){
  // bytes: Uint8Array
  const attempts = [
    ['utf-8', true],
    ['windows-1250', false],
    ['iso-8859-2', false],
    ['iso-8859-1', false],
  ];
  for (const [enc, fatal] of attempts){
    try{
      const dec = new TextDecoder(enc, {fatal});
      return dec.decode(bytes);
    }catch(e){ /* try next */ }
  }
  // last resort: naive latin1
  let s = '';
  for (let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function parseSection(content, tag){
  const re = new RegExp('\\['+tag+'\\]([\\s\\S]*?)(?=\\[3|$)');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function parseTeams(content){
  const sec = parseSection(content, '3TEAMS');
  const lines = sec.split('\n').map(l=>l.trim()).filter(Boolean);
  return lines.map(l=>l.split(';'));
}

function getTeamNames(content){
  const teams = parseTeams(content);
  return teams.map(t=>(t[1]||'').trim()).filter(Boolean);
}

function findTeamPrefix(content, teamName){
  const teams = parseTeams(content);
  if (teams.length>0 && (teams[0][1]||'').trim()===teamName) return {prefix:'*', hw:'H'};
  if (teams.length>1 && (teams[1][1]||'').trim()===teamName) return {prefix:'a', hw:'V'};
  return null;
}

// DataVolley role codes. Verified against the action profile of all 80
// players in the loaded files:
//   1 → only receives (127 receptions, 0 attacks)            = libero
//   2 → most attacks AND most receptions                     = outside hitter
//   3 → attacks a lot, barely receives                       = opposite
//   4 → most blocks, almost never receives (8 in total)      = middle blocker
//   5 → 612 sets                                             = setter
//   6 → 113 sets                                             = second setter
// The previous map had 2 and 4 the wrong way round, which labelled every
// outside hitter a middle blocker and vice versa.
const ROLE_MAP = {1:'Libero',2:'Szélső ütő',3:'Átló',4:'Center',5:'Feladó',6:'Feladó'};

function parsePlayers(content, hw){
  const tag = hw==='H' ? '3PLAYERS-H' : '3PLAYERS-V';
  const sec = parseSection(content, tag);
  const players = {};
  sec.split('\n').forEach(line=>{
    const p = line.split(';');
    if (p.length<14) return;
    const jersey = parseInt(p[1],10);
    if (isNaN(jersey)) return;
    const lastname = (p[9]||'').trim(), firstname = (p[10]||'').trim();
    const isLibero = (p[12]||'').trim()==='L';
    let roleCode = parseInt(p[13],10); if (isNaN(roleCode)) roleCode = 0;
    let role = ROLE_MAP[roleCode] || '?';
    if (isLibero) role = 'Libero';
    players[jersey] = {name: (lastname+' '+firstname).trim(), role, roleCode};
  });
  return players;
}

// ───────────────────────────────────────────────────────────────────────
// Every .dvw carries its OWN [3ATTACKCOMBINATION] table, which is the
// authoritative source for two things we need:
//   column 2 = the attack's START ZONE (2/3/4 front row, 7/8/9 back row)
//   column 4 = the SET TEMPO (Q quick, T tense, U super, N fast,
//              M medium, H high, O other)
// Statisticians code very differently — V5 is zone 4 for one scout, 7 for
// another and 8 for a third — so a hard-coded lookup table is unusable.
// Reading the table out of each file makes the attack view correct for
// every scout without any manual code mapping.
// ───────────────────────────────────────────────────────────────────────
function parseAttackCombinations(content){
  const sec = parseSection(content, '3ATTACKCOMBINATION');
  const out = {};
  sec.split('\n').forEach(l=>{
    const p = l.split(';');
    const code = (p[0]||'').trim();
    if (!code) return;
    const z = parseInt((p[1]||'').trim(), 10);
    out[code] = {
      startZone: isNaN(z) ? null : z,
      side: (p[2]||'').trim(),
      tempo: (p[3]||'').trim().toUpperCase(),
      desc: (p[4]||'').trim(),
      kind: (p[8]||'').trim().toUpperCase(),   // C center, F front, B back, P pipe, S setter
    };
  });
  return out;
}

// Two buckets: quick / tense / super / fast sets are the "gyors" group, while
// medium sets sit with the high ball — a blocker has time to read both.
// O = setter tip / freeball attack / carry-over, which is not really a set.
const TEMPO_GROUP = {Q:'fast', T:'fast', U:'fast', N:'fast', M:'high', H:'high', O:'other'};
const TEMPO_GROUP_LABEL = {fast:'Gyors', high:'Magas', other:'Egyéb'};

// When the ball touches the block, DataVolley does not record a real landing
// zone — it records the MIRROR of the take-off zone, i.e. "at the net across
// from the hitter". Verified on the sample files: 33/33 blocked attacks from
// zone 4 are logged as landing in zone 2, 10/10 from zone 2 land in zone 4.
// Without this, wipe-off-the-block kills pile up in one corner and make the
// direction map useless.
const ATTACK_MIRROR_ZONE = {4:2, 2:4, 3:3, 7:2, 8:3, 9:4};

function parseStatistician(content){
  const sec = parseSection(content, '3MORE');
  const p = (sec.split('\n')[0]||'').split(';');
  const name = (p[5]||'').trim();
  return name || 'Ismeretlen statisztikus';
}

function parseMatchMeta(content, filename){
  const teams = parseTeams(content);
  const homeName = teams[0] ? (teams[0][1]||'').trim() : '?';
  const awayName = teams[1] ? (teams[1][1]||'').trim() : '?';
  const matchSec = parseSection(content, '3MATCH');
  const mLines = matchSec.split('\n');
  let date = '', comp = '';
  if (mLines[0]){
    const p = mLines[0].split(';');
    date = (p[0]||'').trim();
    comp = (p[3]||'').trim();
  }
  // Be sceptical about the stored date: only accept a real MM/DD/YYYY value.
  // Some exports contain malformed or placeholder dates.
  (function(){
    const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m){ date = ''; return; }
    const mm=+m[1], dd=+m[2], yy=+m[3];
    const d = new Date(yy, mm-1, dd);
    const plausible = mm>=1 && mm<=12 && dd>=1 && dd<=31 && yy>=1990 && yy<=2100
      && d.getFullYear()===yy && d.getMonth()===mm-1 && d.getDate()===dd;
    if (!plausible) date = '';
  })();
  const setSec = parseSection(content, '3SET');
  const sets = [];
  setSec.split('\n').forEach(l=>{
    const p = l.split(';');
    if (p.length>4 && p[0].trim()==='True' && p[4].trim()) sets.push(p[4].trim().replace(/\s+/g,''));
  });
  let homeSets=0, awaySets=0;
  sets.forEach(s=>{
    const parts = s.split('-');
    if (parts.length===2){
      const hs=parseInt(parts[0],10), vs=parseInt(parts[1],10);
      if (!isNaN(hs) && !isNaN(vs)){ if (hs>vs) homeSets++; else awaySets++; }
    }
  });
  return {filename, date, comp, homeName, awayName, sets, homeSets, awaySets};
}

// Groups an attack for the setter grid / overview table. Driven by the
// attack's START ZONE from the match file's own combination table, not by the
// scout's code name — that is what makes manual code mapping unnecessary.
function groupCombo(startZone, kind){
  if (kind==='S') return 'Feladó támadás';
  const byZone = {4:'4-es hely', 3:'3-as hely', 2:'2-es hely',
                  8:'Pipe (6-os hely)', 7:'5-ös hely', 9:'1-es hely'};
  return byZone[startZone] || 'Egyéb';
}

// ─── Main aggregator: compute stats for one team across N matches ────────
function computeTeamStats(matchList, teamName){
  // matchList: [{filename, rawText}]
  const stats = {
    players: {},
    attack: {},   // jersey -> {grades:{}, combos:{}, tech:{}, attackDetails:{code:[{zone,grade,subtype}]}, total:0}
    recv: {},     // jersey -> {grades:{}, total:0}
    serve: {},    // jersey -> {grades:{}, zones:{}, total:0}
    block: {},    // jersey -> {grades:{}, total:0}
    setActions: {}, // jersey -> count (to find main setter)
    setterFB: {}, // jersey -> rot -> recvGrade -> comboGroup -> count
    setterTrans: {}, // jersey -> rot -> comboGroup -> count  (transition / non-reception sets)
    matches: [],
    rotation: {},      // rot(1-6) -> {serveWon,serveLost,recvWon,recvLost}
    recvChain: {},     // recvGrade -> {atkGrade: count}  (what attack outcome follows each reception quality)
    recvByRotation: {},// rot(1-6) -> jersey -> {grades:{}, total:0}
    comboTables: {},  // filename -> the file's own [3ATTACKCOMBINATION] table
  };

  const ensure = (obj,j,shape)=>{ if(!obj[j]) obj[j]=JSON.parse(JSON.stringify(shape)); return obj[j]; };
  const bump = (obj,key)=>{ obj[key]=(obj[key]||0)+1; };

  matchList.forEach(({filename, rawText})=>{
    const content = rawText;
    const info = findTeamPrefix(content, teamName);
    if (!info) return;
    const {prefix, hw} = info;
    const meta = parseMatchMeta(content, filename);
    const teamIsHome = hw==='H';
    const teamSets = teamIsHome ? meta.homeSets : meta.awaySets;
    const oppSets  = teamIsHome ? meta.awaySets : meta.homeSets;
    const oppName  = teamIsHome ? meta.awayName : meta.homeName;

    stats.matches.push({
      filename, date: meta.date, opponent: oppName, comp: meta.comp,
      teamSets, oppSets, sets: meta.sets, won: teamSets>oppSets, home: teamIsHome,
      teamName: teamIsHome ? meta.homeName : meta.awayName,
    });

    const statistician = parseStatistician(content);
    const players = parsePlayers(content, hw);
    Object.entries(players).forEach(([j,p])=>{ stats.players[j] = p; });

    const comboTable = parseAttackCombinations(content);
    stats.comboTables[filename] = comboTable;

    const scout = parseSection(content, '3SCOUT');
    const lines = scout.split('\n');

    let lineup = [];
    let pendingBlocked = null; // attack record waiting for the opponent's B line
    let lastRecvGrade = null;
    let lastSetterNum = null, lastSetterRot = null;
    let focusRotation = null;   // this team's current rotation (1-6), tracked via z-markers
    let lastServePrefix = null; // which team performed the most recent serve action (drives this rally)

    for (const raw of lines){
      const line = raw.trim();
      if (!line) continue;
      const linePrefix = line[0];
      const isTeam = linePrefix===prefix;

      // lineup extraction: fields[14:20] = home lineup, fields[20:26] = away lineup
      // (verified against raw DataVolley export structure across multiple files)
      const partsSc = line.split(';');
      if (partsSc.length>=26){
        const homeF = partsSc.slice(14,20).map(s=>s.trim());
        const awayF = partsSc.slice(20,26).map(s=>s.trim());
        const isValidLineup = arr => arr.length===6 && arr.every(v=>/^\d+$/.test(v) && +v>=1 && +v<=99);
        if (isValidLineup(homeF) && isValidLineup(awayF)){
          lineup = (prefix==='*' ? homeF : awayF).map(Number);
        }
      }

      // Rotation marker: "*z6" / "az3" -> that team just gained serve, now in rotation N
      const zMatch = line.match(/^([*a])z(\d)/);
      if (zMatch){
        if (zMatch[1]===prefix) focusRotation = parseInt(zMatch[2],10);
        continue;
      }

      // Point marker: "*p01:03" / "ap00:01" -> that team just won the point
      const pMatch = line.match(/^([*a])p(\d+):(\d+)/);
      if (pMatch){
        const who = pMatch[1];
        if (focusRotation!==null && lastServePrefix!==null){
          const focusServing = (lastServePrefix===prefix);
          const focusWon = (who===prefix);
          const bucket = stats.rotation[focusRotation] || (stats.rotation[focusRotation]={serveWon:0,serveLost:0,recvWon:0,recvLost:0});
          if (focusServing){ if (focusWon) bucket.serveWon++; else bucket.serveLost++; }
          else { if (focusWon) bucket.recvWon++; else bucket.recvLost++; }
        }
        lastServePrefix = null;
        // Clean rally boundary: a reception from this rally must never be
        // linked to an attack in the next one.
        lastRecvGrade = null; lastSetterNum = null; lastSetterRot = null;
        continue;
      }

      if (line.length<6) continue;
      if (!/[0-9]/.test(line[1])) continue;
      const pNum = parseInt(line.substring(1,3),10);
      if (isNaN(pNum)) continue;

      const skill = line[3];
      if (!['S','R','E','A','B','D','F'].includes(skill)) continue;
      const subtype = line[4] || '?';
      const grade = line[5] || '?';

      const codePart = line.substring(6).split(';')[0];
      const tparts = codePart.split('~');
      let combo = (tparts[0]||'').trim();
      for (const k of KNOWN_COMBOS){ if (combo.startsWith(k)){ combo=k; break; } }
      // Each statistician has their own code set — map theirs onto ours using
      // the mapping saved for that particular scout.
      // No alias mapping any more: start zone, tempo and attack kind all come
      // from the match file's own [3ATTACKCOMBINATION] table, so a scout's
      // private code names never need to be translated onto ours.
      const rawCombo = combo;

      if (skill==='S') lastServePrefix = linePrefix; // track regardless of which team, drives rotation stats

      // A blocked/deflected attack is always followed by the opposing team's
      // B line, which identifies the blocker (verified across all files).
      if (pendingBlocked && skill==='B' && linePrefix!==pendingBlocked._side){
        pendingBlocked.blockedBy = pNum;
        pendingBlocked.blockTouch = true;
        // A block-touched ball logged in the mirror zone carries no usable
        // direction — drop the zone but keep every count intact.
        if (pendingBlocked.rawZone && pendingBlocked.rawZone === ATTACK_MIRROR_ZONE[pendingBlocked.start]){
          pendingBlocked.zone = null;
        }
        pendingBlocked = null;
      } else if (skill!=='B'){
        pendingBlocked = null;
      }

      if (!isTeam) continue;

      if (skill==='R'){
        const o = ensure(stats.recv,pNum,{grades:{},total:0});
        bump(o.grades, grade); o.total++;
        lastRecvGrade = grade;

        // Use the TEAM rotation (tracked from the z-markers, which equal the
        // setter's court position — verified 35/35) so that "R1..R6" means the
        // same thing here as it does in the Feladó riport.
        const recvRot = focusRotation;
        if (recvRot){
          if (!stats.recvByRotation[recvRot]) stats.recvByRotation[recvRot] = {};
          const ro = stats.recvByRotation[recvRot][pNum] || (stats.recvByRotation[recvRot][pNum]={grades:{},total:0});
          bump(ro.grades, grade); ro.total++;
        }
      } else if (skill==='E'){
        stats.setActions[pNum] = (stats.setActions[pNum]||0)+1;
        let spos = null;
        if (lineup.length){
          const idx = lineup.indexOf(pNum);
          if (idx>=0) spos = idx+1;
        }
        lastSetterRot = spos; lastSetterNum = pNum;
        if (spos===null && lineup.length===0) lastSetterRot = lastSetterRot; // keep as-is
      } else if (skill==='A'){
        const o = ensure(stats.attack,pNum,{grades:{},combos:{},tech:{},attackDetails:{},total:0});
        bump(o.grades, grade); o.total++;
        // NOTE: line[4] is the SET TEMPO (fixed per attack code — it mirrors the
        // "Ball" column of the Attack Combinations table: V5=H, X5=T, X1=Q ...).
        // The real HIT TECHNIQUE is the letter that follows the zone digits:
        // H = hard spike, T = tip, P = soft/topspin. Use that instead.
        // Search only AFTER the combo code (so the code's own letters can't
        // be mistaken for the technique), for a technique letter followed by
        // a digit. Handles both "~H2" and the packed "~91BH2" variants.

        // The tail after the 2-character combination code is FIXED-WIDTH, not
        // tilde-delimited — "~" simply marks an empty character slot:
        //   [0] target/setter call   [1] start zone   [2] end zone
        //   [3] end subzone (A-D)    [4] technique    [5] blockers  [6] special
        // So "42~H2" = from 4 to 2, no subzone, hard hit, 2 blockers, while
        // "45BH2" = from 4 to 5 subzone B, and "9~~H" = from 9, no landing zone
        // recorded, hard hit. Reading it positionally makes the start zone match
        // the file's own combination table on 785/785 attacks and recovers the
        // technique on all but 4 of them.
        const tail = codePart.slice(2);
        const at = i => (tail.length>i && tail[i]!=='~' && tail[i]!==' ') ? tail[i] : null;
        const dig = i => { const c = at(i); return (c && /\d/.test(c)) ? parseInt(c,10) : null; };
        let startZone = dig(1);
        let landingZone = dig(2);
        const endSubzone = at(3);
        const hitTypeRaw = at(4);
        const blockers = dig(5);
        const hitType = (hitTypeRaw==='H' || hitTypeRaw==='T' || hitTypeRaw==='P') ? hitTypeRaw : 'O';
        bump(o.tech, hitType);

        const comboMeta = comboTable[rawCombo] || comboTable[combo] || null;
        if (startZone===null && comboMeta && comboMeta.startZone) startZone = comboMeta.startZone;
        const cg = groupCombo(startZone, comboMeta && comboMeta.kind);
        bump(o.combos, cg);
        const tempo = (comboMeta && comboMeta.tempo) || (subtype||'').toUpperCase() || 'O';
        const tempoGroup = TEMPO_GROUP[tempo] || 'other';

        if (!o.attackDetails[combo]) o.attackDetails[combo] = [];
        // "/" and "!" are block contacts by definition. Any other grade may
        // also have touched the block — that shows up as an opposing B line
        // on the very next row, which is filled in below.
        const gradeIsBlock = (grade==='/' || grade==='!');
        const rec = {
          zone: (landingZone && !gradeIsBlock) ? landingZone : null,
          rawZone: landingZone || null,
          start: startZone,
          tempo, tempoGroup,
          grade, subtype: hitType,
          subzone: endSubzone, blockers,
          code: rawCombo,
          blockTouch: gradeIsBlock,
          _side: linePrefix,
          phase: lastRecvGrade ? 'REC' : 'TRANS',
          recvGrade: lastRecvGrade || null,
        };
        o.attackDetails[combo].push(rec);
        pendingBlocked = rec;   // the next opposing B line, if any, belongs to this attack

        if (lastSetterNum && lastSetterRot){
          if (lastRecvGrade){
            if (!stats.setterFB[lastSetterNum]) stats.setterFB[lastSetterNum] = {};
            if (!stats.setterFB[lastSetterNum][lastSetterRot]) stats.setterFB[lastSetterNum][lastSetterRot] = {};
            if (!stats.setterFB[lastSetterNum][lastSetterRot][lastRecvGrade]) stats.setterFB[lastSetterNum][lastSetterRot][lastRecvGrade] = {};
            bump(stats.setterFB[lastSetterNum][lastSetterRot][lastRecvGrade], cg);
          } else {
            // No reception preceded this set, so it came out of transition
            // (dig, cover, freeball) — tracked separately from serve-receive.
            // Keyed by the attack's START ZONE (read from this file's own
            // combination table) rather than by the scout's combo name, so it
            // stays correct across statisticians instead of collapsing into
            // an "Egyéb" bucket.
            if (!stats.setterTrans[lastSetterNum]) stats.setterTrans[lastSetterNum] = {};
            if (!stats.setterTrans[lastSetterNum][lastSetterRot]) stats.setterTrans[lastSetterNum][lastSetterRot] = {};
            bump(stats.setterTrans[lastSetterNum][lastSetterRot], startZone ? String(startZone) : '?');
          }
        }
        if (lastRecvGrade){
          if (!stats.recvChain[lastRecvGrade]) stats.recvChain[lastRecvGrade] = {};
          bump(stats.recvChain[lastRecvGrade], grade);
        }
        lastRecvGrade = null;
      } else if (skill==='S'){
        const o = ensure(stats.serve,pNum,{grades:{},zones:{},total:0});
        bump(o.grades, grade); o.total++;
        // Same fixed-width tail as attacks: [1] the server's own back-row
        // position, [2] the TARGET zone the serve was aimed at.
        const sTail = codePart.slice(2);
        const sTarget = sTail.length>2 ? sTail[2] : null;
        if (sTarget && /\d/.test(sTarget)) bump(o.zones, sTarget);
      } else if (skill==='B'){
        const o = ensure(stats.block,pNum,{grades:{},total:0});
        bump(o.grades, grade); o.total++;
      }
    }
  });

  return stats;
}

function getAllTeamsFromMatches(matchList){
  const set = new Set();
  matchList.forEach(({rawText})=>{
    getTeamNames(rawText).forEach(n=>{ if(n) set.add(n); });
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b,'hu'));
}

// Export for Node testing
// ═══════════════════════════════════════════════════════════════════════
// FULL MATCH REPORT — replicates the DataVolley printed "Match Report"
// for ONE specific match, both teams, matching the official export layout.
// ═══════════════════════════════════════════════════════════════════════

function parseMoreSection(content){
  const sec = parseSection(content, '3MORE');
  const line = sec.split('\n')[0] || '';
  const p = line.split(';');
  return {
    referees: (p[0]||'').trim(),
    spectators: (p[1]||'').trim(),
    receipts: (p[2]||'').trim(),
    city: (p[3]||'').trim(),
    hall: (p[4]||'').trim(),
  };
}

function parseTeamsFull(content){
  const teams = parseTeams(content);
  return teams.map(t => ({
    id: (t[0]||'').trim(),
    name: (t[1]||'').trim(),
    headCoach: (t[3]||'').trim(),
    assistantCoach: (t[4]||'').trim(),
  }));
}

function parseMatchNumberAndTime(content){
  const sec = parseSection(content, '3MATCH');
  const p = (sec.split('\n')[0]||'').split(';');
  return { time: (p[1]||'').trim(), matchNum: (p[7]||'').trim() };
}

function parseSetsFull(content){
  const sec = parseSection(content, '3SET');
  const sets = [];
  sec.split('\n').forEach(l=>{
    const p = l.split(';');
    if (p.length>5 && p[0].trim()==='True' && p[4].trim()){
      sets.push({
        checkpoint1: (p[1]||'').trim().replace(/\s+/g,''),
        checkpoint2: (p[2]||'').trim().replace(/\s+/g,''),
        checkpoint3: (p[3]||'').trim().replace(/\s+/g,''),
        final: (p[4]||'').trim().replace(/\s+/g,''),
        durationMin: (p[5]||'').trim(),
      });
    }
  });
  return sets;
}

// Detect set boundaries within the scout line array via score-reset detection
function detectSetBoundaries(lines){
  const boundaries = [0];
  let prevH=0, prevA=0;
  lines.forEach((line, idx)=>{
    const m = line.match(/^([*a])p(\d+):(\d+)/);
    if (!m) return;
    const h = parseInt(m[2],10), a = parseInt(m[3],10);
    if ((h===0||h===1) && (a===0||a===1) && (h+a) < (prevH+prevA)-5){
      boundaries.push(idx);
    }
    prevH=h; prevA=a;
  });
  return boundaries;
}

function extractLineupAtLine(line){
  const parts = line.split(';');
  if (parts.length<26) return null;
  const homeF = parts.slice(14,20).map(s=>s.trim());
  const awayF = parts.slice(20,26).map(s=>s.trim());
  const isValid = arr => arr.length===6 && arr.every(v=>/^\d+$/.test(v) && +v>=1 && +v<=99);
  if (!isValid(homeF) || !isValid(awayF)) return null;
  return { home: homeF.map(Number), away: awayF.map(Number) };
}

function computeFullMatchReport(rawText, filename){
  const content = rawText;
  const teams = parseTeamsFull(content);
  const more = parseMoreSection(content);
  const { time, matchNum } = parseMatchNumberAndTime(content);
  const sets = parseSetsFull(content);
  const matchMeta = parseMatchMeta(content, filename);
  const playersH = parsePlayers(content, 'H');
  const playersV = parsePlayers(content, 'V');

  const scout = parseSection(content, '3SCOUT');
  const lines = scout.split('\n').filter(l=>l.trim());
  const setBoundaries = detectSetBoundaries(lines);

  // Starting lineup per set (validated against raw per-player fields — 100% match)
  const startingLineups = setBoundaries.map(idx=>{
    for (let i=idx; i<lines.length; i++){
      const lu = extractLineupAtLine(lines[i]);
      if (lu) return lu;
    }
    return {home:[], away:[]};
  });

  function emptyPlayerStat(){
    return {
      pointsTot:0, pointsBP:0, plusMinus:0,
      serveTot:0, serveErr:0, servePts:0,
      recvTot:0, recvErr:0, recvPos:0, recvExc:0,
      atkTot:0, atkErr:0, atkBlo:0, atkPts:0,
      bkPts:0,
      setPositions: {}, // setIndex(1-based) -> starting rotation position (1-6), or null
    };
  }

  const statsH = {}, statsV = {};
  const ensure = (obj,j)=>{ if(!obj[j]) obj[j]=emptyPlayerStat(); return obj[j]; };

  // Assign starting positions from the validated lineup data
  startingLineups.forEach((lu, si)=>{
    lu.home.forEach((j,posIdx)=>{ ensure(statsH,j).setPositions[si+1] = posIdx+1; });
    lu.away.forEach((j,posIdx)=>{ ensure(statsV,j).setPositions[si+1] = posIdx+1; });
  });

  // Team-level aggregates
  const teamAgg = {
    H: { pointsTot:0, pointsBP:0, plusMinus:0, serveTot:0,serveErr:0,servePts:0,
         recvTot:0,recvErr:0,recvPos:0,recvExc:0, atkTot:0,atkErr:0,atkBlo:0,atkPts:0, bkPts:0,
         bySet: {}, // setIdx -> {ser,att,bk,opEr}
         recvWon:0, serveWon:0 },
    V: { pointsTot:0, pointsBP:0, plusMinus:0, serveTot:0,serveErr:0,servePts:0,
         recvTot:0,recvErr:0,recvPos:0,recvExc:0, atkTot:0,atkErr:0,atkBlo:0,atkPts:0, bkPts:0,
         bySet: {}, recvWon:0, serveWon:0 },
  };

  // Kill-on-reception cross tables (both teams combined into one, keyed by team)
  const killTable = {
    H: { posRecv:{tot:0,err:0,blo:0,pts:0}, negRecv:{tot:0,err:0,blo:0,pts:0}, dig:{tot:0,err:0,blo:0,pts:0} },
    V: { posRecv:{tot:0,err:0,blo:0,pts:0}, negRecv:{tot:0,err:0,blo:0,pts:0}, dig:{tot:0,err:0,blo:0,pts:0} },
  };

  let curSetIdx = 0; // 0-based
  let lineupH = [], lineupV = [];
  let lastServePrefix = null, lastServePlayer = null;
  let lastRecvGrade = null, lastRecvTeam = null;
  let lastWasDig = false, lastDigTeam = null;
  let onCourtH = [], onCourtV = [];

  for (let li=0; li<lines.length; li++){
    if (setBoundaries.includes(li)) {
      curSetIdx = setBoundaries.indexOf(li);
    }
    const line = lines[li];
    const linePrefix = line[0];

    const lu = extractLineupAtLine(line);
    if (lu){ lineupH = lu.home; lineupV = lu.away; onCourtH = lu.home; onCourtV = lu.away; }

    const pMatch = line.match(/^([*a])p(\d+):(\d+)/);
    if (pMatch){
      const who = pMatch[1];
      const scoringSide = who==='*' ? 'H' : 'V';
      const otherSide = scoringSide==='H' ? 'V' : 'H';

      // +/- differential for on-court players
      (scoringSide==='H'?onCourtH:onCourtV).forEach(j=>{ ensure(scoringSide==='H'?statsH:statsV,j).plusMinus++; });
      (scoringSide==='H'?onCourtV:onCourtH).forEach(j=>{ ensure(scoringSide==='H'?statsV:statsH,j).plusMinus--; });

      // BP (points scored while serving) — attribute to the serving player + team, only if that team scored
      if (lastServePrefix){
        const serverSide = lastServePrefix==='*' ? 'H' : 'V';
        if (serverSide===scoringSide){
          teamAgg[serverSide].serveWon++;
          teamAgg[serverSide].pointsBP++;
          if (lastServePlayer) ensure(serverSide==='H'?statsH:statsV, lastServePlayer).pointsBP++;
        } else {
          teamAgg[otherSide].recvWon++;
        }
      }

      lastServePrefix = null; lastServePlayer = null;
      // Clean rally boundary — clear cross-rally state so a shadow line from an ace/kill
      // (e.g. an auto-generated reception-error for an unreturnable serve) can never leak
      // into the next, unrelated rally.
      lastRecvGrade = null; lastRecvTeam = null; lastWasDig = false; lastDigTeam = null;
      continue;
    }

    const zMatch = line.match(/^([*a])z(\d)/);
    if (zMatch) continue;

    if (line.length<6 || !/[0-9]/.test(line[1])) continue;
    const pNum = parseInt(line.substring(1,3),10);
    if (isNaN(pNum)) continue;
    const skill = line[3];
    if (!['S','R','E','A','B','D','F'].includes(skill)) continue;
    const grade = line[5]||'?';
    const side = linePrefix==='*' ? 'H' : 'V';

    const statsObj = side==='H' ? statsH : statsV;
    const s = ensure(statsObj, pNum);

    if (skill==='S'){
      lastServePrefix = linePrefix; lastServePlayer = pNum;
      s.serveTot++; teamAgg[side].serveTot++;
      if (grade==='=' ){ s.serveErr++; teamAgg[side].serveErr++; }
      if (grade==='#'){ s.servePts++; teamAgg[side].servePts++; s.pointsTot++; teamAgg[side].pointsTot++; }
    } else if (skill==='R'){
      s.recvTot++; teamAgg[side].recvTot++;
      if (grade==='='){ s.recvErr++; teamAgg[side].recvErr++; }
      if (grade==='#'||grade==='+'){ s.recvPos++; teamAgg[side].recvPos++; }
      if (grade==='#'){ s.recvExc++; teamAgg[side].recvExc++; }
      lastRecvGrade = grade; lastRecvTeam = side;
      lastWasDig = false;
    } else if (skill==='A'){
      s.atkTot++; teamAgg[side].atkTot++;
      if (grade==='='){ s.atkErr++; teamAgg[side].atkErr++; }
      if (grade==='/'){ s.atkBlo++; teamAgg[side].atkBlo++; } // blocked (attack stopped by block)
      if (grade==='#'){ s.atkPts++; teamAgg[side].atkPts++; s.pointsTot++; teamAgg[side].pointsTot++; }

      // Kill-on-reception tracking: is this the first attack after a reception (same team) or after a dig?
      if (lastRecvTeam===side && lastRecvGrade){
        const bucket = (lastRecvGrade==='#'||lastRecvGrade==='+') ? 'posRecv' : 'negRecv';
        const kt = killTable[side][bucket];
        kt.tot++;
        if (grade==='=') kt.err++;
        if (grade==='/') kt.blo++;
        if (grade==='#') kt.pts++;
      } else if (lastWasDig && lastDigTeam===side){
        const kt = killTable[side].dig;
        kt.tot++;
        if (grade==='=') kt.err++;
        if (grade==='/') kt.blo++;
        if (grade==='#') kt.pts++;
      }
      lastRecvGrade = null; lastRecvTeam = null; lastWasDig = false;
    } else if (skill==='B'){
      if (grade==='#'){ s.bkPts++; teamAgg[side].bkPts++; s.pointsTot++; teamAgg[side].pointsTot++; }
    } else if (skill==='D'){
      lastWasDig = (grade!=='='); lastDigTeam = side;
      if (grade==='=') { lastWasDig=false; }
    }

    // Team points-won-by-set breakdown: look back from the NEXT point marker for this rally's ending action
    // (handled implicitly via the point-marker branch below using a small lookahead buffer)
  }

  // Second pass: points-won-by-set breakdown (Ser/Att/BK/Op.Er), using preceding-action classification
  let curSet2 = 0;
  let lastAction = null; // {side, skill, grade}
  let suppressShadow2 = false;
  for (let li=0; li<lines.length; li++){
    if (setBoundaries.includes(li)) curSet2 = setBoundaries.indexOf(li);
    const line = lines[li];
    const pMatch = line.match(/^([*a])p(\d+):(\d+)/);
    if (pMatch){
      const who = pMatch[1];
      const scoringSide = who==='*' ? 'H' : 'V';
      const setKey = curSet2+1;
      if (!teamAgg[scoringSide].bySet[setKey]) teamAgg[scoringSide].bySet[setKey] = {ser:0,att:0,bk:0,opEr:0};
      const bucket = teamAgg[scoringSide].bySet[setKey];
      if (lastAction){
        if (lastAction.side===scoringSide && lastAction.grade==='#'){
          if (lastAction.skill==='S') bucket.ser++;
          else if (lastAction.skill==='A') bucket.att++;
          else if (lastAction.skill==='B') bucket.bk++;
          else bucket.opEr++; // kill-type action on an unexpected skill — closest fallback
        } else if (lastAction.side!==scoringSide && lastAction.grade==='='){
          bucket.opEr++;
        } else {
          // Rare edge case (e.g. a sanction/disciplinary point) that doesn't fit the
          // standard win/error pattern — still award it somewhere so every point in
          // the set is accounted for and totals always match the real score.
          bucket.opEr++;
        }
      } else {
        // No preceding action at all (e.g. very first rally of file) — still count the point.
        bucket.opEr++;
      }
      lastAction = null;
      suppressShadow2 = false;
      continue;
    }
    if (line.length<6 || !/[0-9]/.test(line[1])) continue;
    const skill = line[3];
    if (!['S','R','E','A','B','D','F'].includes(skill)) continue;
    const grade = line[5]||'?';
    const side = line[0]==='*' ? 'H' : 'V';

    if (suppressShadow2 && (skill==='R' || skill==='D')){
      suppressShadow2 = false;
      continue;
    }
    suppressShadow2 = (grade==='#' && (skill==='S' || skill==='A' || skill==='B'));

    lastAction = { side, skill, grade };
  }

  // ─── Third pass: point-origin classification (ace / reception-phase kill /
  // transition-phase kill / block / opponent error) + reception & serve
  // outcome tables (grade -> won/lost). This is what powers the "expected
  // SO%/BP%" and win/loss-breakdown reporting on the Liga Benchmark tab.
  // Fully additive: a brand new loop, touches no existing state above.
  ['H','V'].forEach(side=>{
    teamAgg[side].recvOutcome = {};   // grade -> {won,lost}
    teamAgg[side].serveOutcome = {};  // grade -> {won,lost}
    // Point-origin buckets. "soAtt" is the first attack after our own
    // reception = a genuine side-out attack. A transition attack is only a
    // break point if WE were the serving team in that rally; a transition
    // attack after our own dig is still a side-out rally, so it gets its own
    // bucket instead of being mislabelled.
    teamAgg[side].originWon = {ace:0, soAtt:0, bpAtt:0, soTransAtt:0, block:0, oppErr:0, other:0};
    teamAgg[side].originLost = {oppAce:0, oppSoAtt:0, oppBpAtt:0, oppSoTransAtt:0, oppBlock:0, ownErr:0, other:0};
    teamAgg[side].rallies = 0;
  });
  let rallyServeSide3=null, rallyServeGrade3=null, rallyRecvSide3=null, rallyRecvGrade3=null;
  let lastAction3 = null; // {side, skill, grade, phase}
  let lastOffense3 = null; // most recent attack/block, whatever its grade
  let recvSideForPhase3 = null;
  for (let li=0; li<lines.length; li++){
    const line3 = lines[li];
    const pMatch3 = line3.match(/^([*a])p(\d+):(\d+)/);
    if (pMatch3){
      const scoringSide = pMatch3[1]==='*' ? 'H' : 'V';
      const losingSide = scoringSide==='H' ? 'V' : 'H';
      teamAgg.H.rallies++; teamAgg.V.rallies++;
      if (rallyRecvSide3 && rallyRecvGrade3){
        const bucket = teamAgg[rallyRecvSide3].recvOutcome;
        if (!bucket[rallyRecvGrade3]) bucket[rallyRecvGrade3] = {won:0,lost:0};
        if (rallyRecvSide3===scoringSide) bucket[rallyRecvGrade3].won++; else bucket[rallyRecvGrade3].lost++;
      }
      if (rallyServeSide3 && rallyServeGrade3){
        const bucket = teamAgg[rallyServeSide3].serveOutcome;
        if (!bucket[rallyServeGrade3]) bucket[rallyServeGrade3] = {won:0,lost:0};
        if (rallyServeSide3===scoringSide) bucket[rallyServeGrade3].won++; else bucket[rallyServeGrade3].lost++;
      }
      const winO0 = teamAgg[scoringSide].originWon;
      const losO0 = teamAgg[losingSide].originLost;
      const creditOffense = off => {
        if (off.skill==='B'){ winO0.block++; losO0.oppBlock++; return; }
        if (off.phase==='REC'){ winO0.soAtt++; losO0.oppSoAtt++; }
        else if (rallyServeSide3===scoringSide){ winO0.bpAtt++; losO0.oppBpAtt++; }
        else { winO0.soTransAtt++; losO0.oppSoTransAtt++; }
      };
      // An ace is always followed by the receiver's own "=" reception line, so
      // the last action of the rally is the reception, not the serve. Check the
      // serve for the rally first — otherwise every ace was counted as an
      // opponent error and the "Ász" bucket stayed permanently at zero.
      const aceRally = rallyServeSide3===scoringSide &&
        (rallyServeGrade3==='#' || (lastAction3 && lastAction3.skill==='R' &&
                                    lastAction3.grade==='=' && lastAction3.side===losingSide));
      // Many scouts end a rally by grading the failed DIG ("D=") instead of
      // grading the attack that beat it. Without this, those points were
      // filed under "Ellenfél hibája" and the side out / break point bars
      // stayed almost empty for those files.
      const digMiss = lastAction3 && lastAction3.skill==='D' &&
        lastAction3.grade==='=' && lastAction3.side===losingSide &&
        lastOffense3 && lastOffense3.side===scoringSide;

      if (aceRally){
        winO0.ace++; losO0.oppAce++;
      } else if (digMiss){
        creditOffense(lastOffense3);
      } else if (lastAction3){
        const winO = winO0;
        const losO = losO0;
        if (lastAction3.side===scoringSide && lastAction3.grade==='#'){
          if (lastAction3.skill==='S'){ winO.ace++; losO.oppAce++; }
          else if (lastAction3.skill==='A'){
            if (lastAction3.phase==='REC'){ winO.soAtt++; losO.oppSoAtt++; }
            else if (rallyServeSide3 === scoringSide){ winO.bpAtt++; losO.oppBpAtt++; }
            else { winO.soTransAtt++; losO.oppSoTransAtt++; }
          }
          else if (lastAction3.skill==='B'){ winO.block++; losO.oppBlock++; }
          else { winO.other++; losO.other++; }
        } else if (lastAction3.side===losingSide && lastAction3.grade==='='){
          winO.oppErr++; losO.ownErr++;
        } else {
          winO.other++; losO.other++;
        }
      } else {
        teamAgg[scoringSide].originWon.other++;
      }
      rallyServeSide3=null; rallyServeGrade3=null; rallyRecvSide3=null; rallyRecvGrade3=null;
      lastAction3 = null; lastOffense3 = null; recvSideForPhase3 = null;
      continue;
    }
    if (line3.length<6 || !/[0-9]/.test(line3[1])) continue;
    const skill3 = line3[3];
    if (!['S','R','E','A','B','D','F'].includes(skill3)) continue;
    const grade3 = line3[5]||'?';
    const side3 = line3[0]==='*' ? 'H' : 'V';

    if (skill3==='S'){ rallyServeSide3=side3; rallyServeGrade3=grade3; }
    else if (skill3==='R'){ rallyRecvSide3=side3; rallyRecvGrade3=grade3; recvSideForPhase3=side3; }

    let phase3 = null;
    if (skill3==='A'){
      phase3 = (recvSideForPhase3===side3) ? 'REC' : 'TRANS';
      recvSideForPhase3 = null;
    }
    lastAction3 = { side: side3, skill: skill3, grade: grade3, phase: phase3 };
    if (skill3==='A' || skill3==='B') lastOffense3 = lastAction3;
  }

  function finalizePlayerList(statsObj, playersMeta){
    return Object.entries(statsObj).map(([j,s])=>{
      const p = playersMeta[j] || {name:'#'+j, role:'', roleCode:0, libero:false};
      const recvPosPct = s.recvTot ? Math.round(100*s.recvPos/s.recvTot) : null;
      const recvExcPct = s.recvTot ? Math.round(100*s.recvExc/s.recvTot) : null;
      const atkPtsPct = s.atkTot ? Math.round(100*s.atkPts/s.atkTot) : null;
      return { jersey: j, name: p.name, role: p.role, isLibero: p.roleCode===1,
        ...s, recvPosPct, recvExcPct, atkPtsPct };
    }).sort((a,b)=> parseInt(a.jersey)-parseInt(b.jersey));
  }

  const homePlayers = finalizePlayerList(statsH, playersH);
  const awayPlayers = finalizePlayerList(statsV, playersV);

  function teamTotals(agg){
    return {
      pointsTot: agg.pointsTot, pointsBP: agg.pointsBP,
      serveTot: agg.serveTot, serveErr: agg.serveErr, servePts: agg.servePts,
      recvTot: agg.recvTot, recvErr: agg.recvErr,
      recvPosPct: agg.recvTot? Math.round(100*agg.recvPos/agg.recvTot):0,
      recvExcPct: agg.recvTot? Math.round(100*agg.recvExc/agg.recvTot):0,
      atkTot: agg.atkTot, atkErr: agg.atkErr, atkBlo: agg.atkBlo, atkPts: agg.atkPts,
      atkPtsPct: agg.atkTot? Math.round(100*agg.atkPts/agg.atkTot):0,
      bkPts: agg.bkPts,
      recvWon: agg.recvWon, serveWon: agg.serveWon,
    };
  }

  return {
    filename,
    matchNum, time, date: matchMeta.date, comp: matchMeta.comp,
    city: more.city, hall: more.hall, referees: more.referees,
    spectators: more.spectators, receipts: more.receipts,
    home: { ...teams[0], players: homePlayers, totals: teamTotals(teamAgg.H), bySet: teamAgg.H.bySet, kill: killTable.H,
      recvOutcome: teamAgg.H.recvOutcome, serveOutcome: teamAgg.H.serveOutcome, originWon: teamAgg.H.originWon, originLost: teamAgg.H.originLost, rallies: teamAgg.H.rallies },
    away: { ...teams[1], players: awayPlayers, totals: teamTotals(teamAgg.V), bySet: teamAgg.V.bySet, kill: killTable.V,
      recvOutcome: teamAgg.V.recvOutcome, serveOutcome: teamAgg.V.serveOutcome, originWon: teamAgg.V.originWon, originLost: teamAgg.V.originLost, rallies: teamAgg.V.rallies },
    sets,
    homeSets: matchMeta.homeSets, awaySets: matchMeta.awaySets,
    setCount: sets.length,
  };
}


// ═══════════════════════════════════════════════════════════════════════
// TEAM OUTCOME AGGREGATE + LEAGUE BASELINE — powers the "Liga Benchmark"
// tab: point-origin breakdown (why points are won/lost) and "expected"
// SO%/BP% (comparing a team's actual sideout/breakpoint rate against what
// a league-wide baseline would predict from their own grade distribution,
// the same idea used in professional DataVolley reports). Built entirely
// on top of computeFullMatchReport's per-match rally classification, so it
// shares exactly the same logic already used by the match report feature.
// ═══════════════════════════════════════════════════════════════════════

function aggregateTeamOutcome(matchList, teamName){
  const recvOutcome = {}, serveOutcome = {};
  const originWon = {ace:0, soAtt:0, bpAtt:0, soTransAtt:0, block:0, oppErr:0, other:0};
  const originLost = {oppAce:0, oppSoAtt:0, oppBpAtt:0, oppSoTransAtt:0, oppBlock:0, ownErr:0, other:0};
  let rallies = 0, matchCount = 0;

  const mergeOutcome = (into, from)=>{
    Object.entries(from||{}).forEach(([g,v])=>{
      if (!into[g]) into[g] = {won:0,lost:0};
      into[g].won += v.won; into[g].lost += v.lost;
    });
  };

  matchList.forEach(({rawText, filename})=>{
    let r;
    try { r = computeFullMatchReport(rawText, filename); } catch(e){ return; }
    const side = r.home.name===teamName ? r.home : (r.away.name===teamName ? r.away : null);
    if (!side) return;
    matchCount++;
    mergeOutcome(recvOutcome, side.recvOutcome);
    mergeOutcome(serveOutcome, side.serveOutcome);
    Object.keys(originWon).forEach(k=>{ originWon[k]  += (side.originWon  && side.originWon[k])  || 0; });
    Object.keys(originLost).forEach(k=>{ originLost[k] += (side.originLost && side.originLost[k]) || 0; });
    rallies += side.rallies||0;
  });

  return {recvOutcome, serveOutcome, originWon, originLost, rallies, matchCount};
}

function computeLeagueBaseline(matchList){
  const teams = getAllTeamsFromMatches(matchList);
  const recvAgg = {}, serveAgg = {};
  const mergeOutcome = (into, from)=>{
    Object.entries(from||{}).forEach(([g,v])=>{
      if (!into[g]) into[g] = {won:0,lost:0};
      into[g].won += v.won; into[g].lost += v.lost;
    });
  };
  teams.forEach(team=>{
    const agg = aggregateTeamOutcome(matchList, team);
    mergeOutcome(recvAgg, agg.recvOutcome);
    mergeOutcome(serveAgg, agg.serveOutcome);
  });
  const toRate = obj=>{
    const rate = {}; let n=0;
    Object.entries(obj).forEach(([g,v])=>{ const tot=v.won+v.lost; n+=tot; rate[g] = tot ? v.won/tot : null; });
    return {rate, n};
  };
  const recv = toRate(recvAgg), serve = toRate(serveAgg);
  return {recvRate: recv.rate, recvN: recv.n, serveRate: serve.rate, serveN: serve.n, teamCount: teams.length};
}

// Given a set of {grade: count} (e.g. a team's own reception grades) and a
// league-wide {grade: winRate} table, returns the rate we'd "expect" this
// team to post if they were exactly average at converting each grade.
function expectedRateFromGrades(gradeCounts, rateTable){
  let known=0, sum=0, unknown=0;
  Object.entries(gradeCounts||{}).forEach(([g,n])=>{
    const r = rateTable ? rateTable[g] : undefined;
    if (r===undefined || r===null){ unknown += n; return; }
    known += n; sum += n*r;
  });
  return {expRate: known ? sum/known : null, known, unknown};
}


if (typeof module !== 'undefined'){
  module.exports = {
    decodeDVWBytes, parseSection, parseTeams, getTeamNames, findTeamPrefix,
    parsePlayers, parseMatchMeta, groupCombo, computeTeamStats, getAllTeamsFromMatches,
    computeFullMatchReport, OWN_CODES, parseStatistician,
    parseAttackCombinations, TEMPO_GROUP,
    aggregateTeamOutcome, computeLeagueBaseline, expectedRateFromGrades,
  };
}


