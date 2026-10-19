// BIGJOE app.js patcher: adds the free-trial banner and the signup referral-code field.
//
// Usage (from the folder that contains app.js):
//     node patch-appjs.js app.js
//
// It makes a backup (app.js.bak), applies 6 exact-match edits, and refuses to touch
// the file if any anchor text is missing or appears more than once.

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node patch-appjs.js <path-to-app.js>');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes('function renderTrialBanner()')) {
  console.log('This file is already patched. Nothing to do.');
  process.exit(0);
}

// ---------- New functions (inserted before togglePasswordVisibility) ----------
const NEW_FUNCS = `// ---------- Free trial banner & referral code (added) ----------
function renderTrialBanner(){
  const app=$('app'); if(!app||!user)return;
  let el=$('trialBanner');
  const ended=!user.trial && user.subscription_status==='trial';
  if(actor.type==='staff'||(!user.trial&&!ended)){ if(el)el.remove(); return; }
  if(!el){
    el=document.createElement('div'); el.id='trialBanner'; el.className='settings-note';
    el.style.cssText='margin:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
    const firstPage=app.querySelector(':scope > .page');
    if(firstPage)app.insertBefore(el,firstPage); else app.appendChild(el);
  }
  const days=Number(user.trial_days_left||0);
  const urgent=user.trial&&days<=2;
  el.style.borderLeft='4px solid '+((ended||urgent)?'#d92d20':'#f4b942');
  el.innerHTML=ended
    ?'<div><b>Your free trial has ended.</b> Subscribe to get your Pro or Business features back. Your data is safe.</div><button type="button" class="primary" onclick="showPage(\\'plansPage\\')">Choose a plan</button>'
    :'<div><b>🎁 Free trial: '+days+' day'+(days===1?'':'s')+' left.</b> You have full Pro access. Subscribe any time to keep it.</div><button type="button" class="primary" onclick="showPage(\\'plansPage\\')">Choose a plan</button>';
  if(user.trial&&$('userPlan'))$('userPlan').textContent='Pro • Trial ('+days+'d left)';
}
function ensureReferralField(show){
  let wrap=$('referralField');
  if(!wrap){
    const anchor=$('nameField'); if(!anchor||!anchor.parentNode)return;
    wrap=document.createElement('label'); wrap.id='referralField';
    wrap.innerHTML='Referral code (optional)<input id="referralCode" type="text" maxlength="30" placeholder="e.g. AGENT-AMINA" autocomplete="off">';
    anchor.parentNode.insertBefore(wrap,anchor.nextSibling);
    let ref=''; try{ref=new URLSearchParams(window.location.search).get('ref')||''}catch{}
    if(ref)$('referralCode').value=ref.trim().toUpperCase();
  }
  wrap.style.display=show?'block':'none';
}
`;

// ---------- Edits: [description, anchor text, replacement text] ----------
const edits = [
  [
    'Add trial banner + referral helper functions',
    'function togglePasswordVisibility(){',
    NEW_FUNCS + 'function togglePasswordVisibility(){'
  ],
  [
    'Show the referral field on the register screen',
    '$("nameField").style.display=reg?"block":"none";',
    '$("nameField").style.display=reg?"block":"none";\n  ensureReferralField(reg);'
  ],
  [
    'Save the referral code after a successful signup',
    'await renderApp()}catch(e){console.error("BIGJOE authentication error:",e)',
    'if(mode==="register"){const ref=($("referralCode")?.value||"").trim();if(ref){try{await api("/api/referral",{method:"POST",body:JSON.stringify({code:ref})})}catch(refErr){console.warn("Referral code not saved:",refErr)}}}await renderApp()}catch(e){console.error("BIGJOE authentication error:",e)'
  ],
  [
    'Read trial info from /api/plans and show the banner',
    'user.subscription_expires_at=remote?.subscription_expires_at||null;',
    'user.subscription_expires_at=remote?.subscription_expires_at||null;\n      user.trial=!!remote?.trial;\n      user.trial_days_left=Number(remote?.trial_days_left||0);\n      renderTrialBanner();'
  ],
  [
    'Trial note on the current plan card',
    "let expiryNote='';",
    "let expiryNote='';\n    if(current && paid && user?.trial) expiryNote=`<div class=\"subscription-point\">🎁 <b>Free trial: ${Number(user.trial_days_left||0)} day(s) left.</b> Subscribe to keep this plan.</div>`;"
  ],
  [
    'Change the renew button label during a trial',
    'Renew for another month</button>',
    "${user?.trial?'Subscribe to keep Pro after trial':'Renew for another month'}</button>"
  ]
];

// Check every anchor first so we never leave the file half-patched
for (const [desc, anchor] of edits) {
  const count = src.split(anchor).length - 1;
  if (count !== 1) {
    console.error(`STOPPED: "${desc}" needs its anchor to appear exactly once, but it appears ${count} time(s).`);
    console.error('No changes were made. Send me the section around this text and I will adjust.');
    process.exit(1);
  }
}

fs.writeFileSync(file + '.bak', src);
for (const [desc, anchor, replacement] of edits) {
  src = src.replace(anchor, () => replacement);
  console.log('✓ ' + desc);
}
fs.writeFileSync(file, src);
console.log('\nDone. Backup saved as ' + file + '.bak');