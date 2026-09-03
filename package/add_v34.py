from pathlib import Path
root=Path('/mnt/data/bigjoe_v33')
server=(root/'server.js').read_text()
index=(root/'public/index.html').read_text()
app=(root/'public/app.js').read_text()
css=(root/'public/style.css').read_text()

# 1. Server endpoint: insert before dashboard endpoint
marker='  if (method === "GET" && url.pathname === "/api/dashboard") {'
endpoint=r'''  // ---------- v34 Budget & Cost Control Centre ----------
  if (method === "GET" && url.pathname === "/api/budget-control") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10), monthKey=d=>d.toISOString().slice(0,7);
    const currentMonth=monthKey(today);
    const plan=db.business_plans.find(x=>x.user_id===u.id)||{};
    const budgets=plan.expense_budgets&&typeof plan.expense_budgets==='object'?plan.expense_budgets:{};
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const monthExpenses=expenses.filter(x=>String(x.date||x.created_at||'').slice(0,7)===currentMonth);
    const actualByCategory={};
    monthExpenses.forEach(x=>{const c=String(x.category||'Other').trim()||'Other';actualByCategory[c]=(actualByCategory[c]||0)+Number(x.amount||0)});
    const categories=new Set([...Object.keys(budgets),...Object.keys(actualByCategory)]);
    const rows=[...categories].map(category=>{
      const budget=Math.max(0,Number(budgets[category]||0));
      const actual=Number(actualByCategory[category]||0);
      const variance=budget-actual;
      const pct=budget>0?(actual/budget)*100:actual>0?100:0;
      const status=budget<=0?(actual>0?'unbudgeted':'not_set'):pct>=100?'over':pct>=80?'watch':'healthy';
      return {category,budget:Number(budget.toFixed(2)),actual:Number(actual.toFixed(2)),variance:Number(variance.toFixed(2)),progress:Number(pct.toFixed(1)),status};
    }).sort((a,b)=>b.actual-a.actual);
    const totalActual=monthExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const totalBudget=Object.values(budgets).reduce((a,x)=>a+Math.max(0,Number(x||0)),0);
    const monthlyLimit=Math.max(0,Number(plan.monthly_expense_limit||0));
    const effectiveBudget=totalBudget>0?totalBudget:monthlyLimit;
    const remaining=effectiveBudget-totalActual;
    const progress=effectiveBudget>0?(totalActual/effectiveBudget)*100:0;
    const recentMonths=[];
    for(let i=2;i>=0;i--){const d=new Date(today.getFullYear(),today.getMonth()-i,1),mk=monthKey(d);const amount=expenses.filter(x=>String(x.date||x.created_at||'').slice(0,7)===mk).reduce((a,x)=>a+Number(x.amount||0),0);recentMonths.push({month:mk,amount:Number(amount.toFixed(2))});}
    const alerts=[];
    const over=rows.filter(x=>x.status==='over');
    const watch=rows.filter(x=>x.status==='watch');
    if(effectiveBudget<=0 && totalActual>0) alerts.push({severity:'medium',title:'Set an expense budget',text:`You have ${moneyText(totalActual)} in expenses this month but no budget is configured yet.`});
    if(over.length) alerts.push({severity:'high',title:'Budget exceeded',text:`${over.length} expense categor${over.length===1?'y':'ies'} ${over.length===1?'is':'are'} already above the configured budget.`});
    if(watch.length) alerts.push({severity:'medium',title:'Spending is approaching budget',text:`${watch.length} categor${watch.length===1?'y':'ies'} have used at least 80% of their budget.`});
    if(effectiveBudget>0 && remaining>=0) alerts.push({severity:'positive',title:'Budget is under control',text:`${moneyText(remaining)} remains within the current monthly expense budget.`});
    if(!alerts.length) alerts.push({severity:'positive',title:'No major budget warning',text:'BIGJOE has no immediate expense-budget warning for the current month.'});
    return json(res,200,{period:{month:currentMonth},summary:{actual:Number(totalActual.toFixed(2)),category_budget:Number(totalBudget.toFixed(2)),monthly_limit:Number(monthlyLimit.toFixed(2)),effective_budget:Number(effectiveBudget.toFixed(2)),remaining:Number(remaining.toFixed(2)),progress:Number(progress.toFixed(1)),expense_count:monthExpenses.length},categories:rows,recent_months:recentMonths,alerts,budgets});
  }

  if (method === "PUT" && url.pathname === "/api/budget-control/settings") {
    const u=requireUser(req,res,db); if(!u)return; const b=await body(req);
    const raw=Array.isArray(b.budgets)?b.budgets:[]; const budgets={};
    raw.forEach(x=>{const category=String(x.category||'').trim();const amount=Math.max(0,Number(x.amount||0));if(category && amount>0)budgets[category]=amount;});
    const monthlyLimit=Math.max(0,Number(b.monthly_expense_limit||0));
    let plan=db.business_plans.find(x=>x.user_id===u.id); if(!plan){plan={id:id(),user_id:u.id,created_at:now()};db.business_plans.push(plan)}
    plan.expense_budgets=budgets; plan.monthly_expense_limit=monthlyLimit; plan.updated_at=now(); dbWrite(db);
    return json(res,200,{plan});
  }

'''
if marker not in server: raise SystemExit('server marker missing')
server=server.replace(marker,endpoint+marker,1)

# 2. Navigation
old='<button onclick="showPage(\'cashflow\',this)">💧 Cash Flow</button>'
new=old+'<button onclick="showPage(\'budgetControl\',this)">🧾 Budget Control</button>'
if old not in index: raise SystemExit('nav marker missing')
index=index.replace(old,new,1)

# 3. Page after cashflow section
page_marker='</div></div>\n\n<div id="customerIntel" class="page hidden">'
page=r'''</div></div>

<div id="budgetControl" class="page hidden">
<div class="section-head"><div><h2>🧾 BIGJOE Budget & Cost Control Centre</h2><p class="muted">Set spending limits by category, compare actual expenses with your budget and catch cost overruns early.</p></div><div class="doc-actions"><button class="primary" onclick="loadBudgetControl()">↻ Refresh</button></div></div>
<div id="budgetStats" class="stats"></div>
<div class="card budget-settings"><div class="section-head"><div><h3>⚙ Expense Budget Settings</h3><p class="muted">Add the categories you want BIGJOE to monitor. Leave a category out if you do not want a separate limit for it.</p></div></div><div id="budgetRows" class="budget-rows"></div><div class="budget-actions"><button onclick="addBudgetRow()">+ Add Category Budget</button><button class="primary" onclick="saveBudgetSettings()">Save Budget Settings</button></div></div>
<div class="grid dashboard-grid budget-grid">
 <div class="card wide"><div class="section-head"><div><h3>📊 Current-Month Budget vs Actual</h3><p class="muted">Actual operating expenses are compared with your configured category budgets.</p></div></div><div id="budgetTable" class="table-wrap"></div></div>
 <div class="card"><h3>📈 Three-Month Expense Trend</h3><div id="budgetTrend" class="bar-chart"></div></div>
 <div class="card"><h3>🔔 Cost-Control Alerts</h3><div id="budgetAlerts" class="alerts-list"></div></div>
 <div class="card wide"><div class="section-head"><div><h3>💡 BIGJOE Cost-Control Recommendations</h3><p class="muted">Practical actions based on this month's actual spending.</p></div></div><div id="budgetRecommendations" class="insights"></div></div>
</div></div>

<div id="customerIntel" class="page hidden">'''
if page_marker not in index: raise SystemExit('page marker missing')
index=index.replace(page_marker,page,1)

# 4. showPage hook
old_hook='if(id==="cashflow")loadCashFlow();if(id==="customerIntel")loadCustomerIntelligence();'
new_hook='if(id==="cashflow")loadCashFlow();if(id==="budgetControl")loadBudgetControl();if(id==="customerIntel")loadCustomerIntelligence();'
if old_hook not in app: raise SystemExit('hook missing')
app=app.replace(old_hook,new_hook,1)

# 5. Add JS functions before customer intelligence loader
marker_js='async function loadCustomerIntelligence()'
funcs=r'''function budgetRowTemplate(category='',amount=''){return `<div class="budget-row"><input class="budget-category" placeholder="e.g. Transport" value="${esc(category)}"><input class="budget-amount" type="number" min="0" step="1000" placeholder="Budget (₦)" value="${amount||''}"><button class="danger-link" onclick="this.parentElement.remove()">Remove</button></div>`}
function addBudgetRow(category='',amount=''){const wrap=$('budgetRows');if(wrap)wrap.insertAdjacentHTML('beforeend',budgetRowTemplate(category,amount));}
async function loadBudgetControl(){try{const d=await api('/api/budget-control');window.__budgetControlData=d;const s=d.summary||{};const cls=Number(s.remaining)<0?'danger':'';$('budgetStats').innerHTML=`<div class="stat"><span>Month Expenses</span><b>${money(s.actual)}</b></div><div class="stat"><span>Effective Budget</span><b>${s.effective_budget?money(s.effective_budget):'Not set'}</b></div><div class="stat ${cls}"><span>Budget Remaining</span><b>${money(s.remaining)}</b></div><div class="stat"><span>Budget Used</span><b>${Number(s.progress||0).toFixed(1)}%</b></div>`;
const rows=d.categories||[];$('budgetTable').innerHTML=rows.length?`<table><thead><tr><th>Category</th><th>Budget</th><th>Actual</th><th>Remaining</th><th>Used</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.category)}</b></td><td>${x.budget?money(x.budget):'—'}</td><td>${money(x.actual)}</td><td class="${x.variance<0?'negative-text':'positive-text'}">${money(x.variance)}</td><td>${Number(x.progress).toFixed(1)}%</td><td><span class="planner-priority ${esc(x.status==='over'?'urgent':x.status==='watch'?'watch':x.status==='unbudgeted'?'high':'healthy')}">${esc(x.status)}</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No expense categories found yet.</div>';
const months=d.recent_months||[];const max=Math.max(1,...months.map(x=>Number(x.amount||0)));$('budgetTrend').innerHTML=months.map(x=>{const w=Math.max(2,Number(x.amount||0)/max*100);return `<div class="bar-item" title="${x.month}: ${money(x.amount)}"><div class="bar-label">${new Date(x.month+'-01T00:00:00').toLocaleDateString('en-NG',{month:'short',year:'numeric'})}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="bar-value">${money(x.amount)}</div></div>`}).join('');
$('budgetAlerts').innerHTML=(d.alerts||[]).map(x=>`<div class="alert-item alert-${esc(x.severity||'medium')}"><b>${x.severity==='high'?'⚠️':x.severity==='positive'?'✅':'🔔'} ${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('');
const over=rows.filter(x=>x.status==='over'),watch=rows.filter(x=>x.status==='watch'),unbudgeted=rows.filter(x=>x.status==='unbudgeted');const rec=[];if(over.length)rec.push(`Reduce or review spending in ${over.slice(0,3).map(x=>x.category).join(', ')} because the configured budget has already been exceeded.`);if(watch.length)rec.push(`Watch ${watch.slice(0,3).map(x=>x.category).join(', ')} closely; these categories are approaching their limits.`);if(unbudgeted.length)rec.push(`Consider setting budgets for ${unbudgeted.slice(0,3).map(x=>x.category).join(', ')} so BIGJOE can detect overruns earlier.`);if(!rec.length)rec.push(s.effective_budget?`Current spending is within the configured budget. Keep monitoring the ${Number(s.progress||0).toFixed(1)}% already used.`:'Set a monthly or category budget to activate cost-control recommendations.');$('budgetRecommendations').innerHTML=rec.map((x,i)=>`<div class="insight"><b>${i+1}.</b> ${esc(x)}</div>`).join('');
const wrap=$('budgetRows');if(wrap){wrap.innerHTML='';const configured=d.budgets||{};Object.entries(configured).forEach(([c,a])=>addBudgetRow(c,a));if(!Object.keys(configured).length)rows.slice(0,5).forEach(x=>addBudgetRow(x.category,''));} }catch(e){toast(e.message,true)}}
async function saveBudgetSettings(){try{const rows=[...document.querySelectorAll('.budget-row')].map(r=>({category:r.querySelector('.budget-category')?.value||'',amount:Number(r.querySelector('.budget-amount')?.value||0)})).filter(x=>x.category.trim()&&x.amount>0);const current=window.__budgetControlData?.summary||{};const monthly=prompt('Optional overall monthly expense limit (₦):',String(current.monthly_limit||''));let monthlyLimit=monthly===null?Number(current.monthly_limit||0):Math.max(0,Number(monthly||0));await api('/api/budget-control/settings',{method:'PUT',body:JSON.stringify({budgets:rows,monthly_expense_limit:monthlyLimit})});toast('Budget settings saved successfully.');await loadBudgetControl();}catch(e){toast(e.message,true)}}

'''
if marker_js not in app: raise SystemExit('js function marker missing')
app=app.replace(marker_js,funcs+marker_js,1)

# 6. CSS
css += r'''

/* v34 Budget & Cost Control Centre */
.budget-settings{margin-bottom:18px}.budget-rows{display:grid;gap:9px}.budget-row{display:grid;grid-template-columns:1fr 220px auto;gap:10px;align-items:center}.budget-row input{padding:11px 12px;border:1px solid #d0d5dd;border-radius:9px;font:inherit;color:#172033;background:#fff}.budget-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.danger-link{border:0;background:transparent;color:#b42318;font-weight:700;cursor:pointer}.budget-grid{margin-top:18px}.budget-grid .table-wrap{overflow:auto}.budget-grid table{min-width:720px}.budget-grid .bar-chart{min-height:170px}@media(max-width:700px){.budget-row{grid-template-columns:1fr}.budget-actions button{width:100%}}
'''

(root/'server.js').write_text(server)
(root/'public/index.html').write_text(index)
(root/'public/app.js').write_text(app)
(root/'public/style.css').write_text(css)
(root/'README_V34_BUDGET_COST_CONTROL.md').write_text('''# BIGJOE v34 — Budget & Cost Control Centre\n\nAdds category-level expense budgets, current-month budget-vs-actual analysis, three-month expense trend, cost-control alerts and management recommendations.\n\nExisting v33 Cash Flow, Scenario Centre, Business Planner, Dashboard, accounting, POS, inventory, loyalty and customer features are preserved.\n\n## Testing\n1. Start BIGJOE with `start.bat`.\n2. Log in and open **🧾 Budget Control**.\n3. Add category budgets and optionally set an overall monthly expense limit.\n4. Save and verify the budget-vs-actual table and alerts.\n5. Add an expense and refresh; the actual and remaining budget should update.\n''')
