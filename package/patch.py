from pathlib import Path
p=Path('/mnt/data/v33work/server.js')
s=p.read_text()
marker='  if (method === "GET" && url.pathname === "/api/dashboard") {'
insert=r'''  // ---------- v33 Cash Flow Forecast & Scenario Planning ----------
  if (method === "GET" && url.pathname === "/api/cashflow-forecast") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10);
    const todayKey=key(today);
    const histStart=new Date(today.getTime()-29*86400000), histStartKey=key(histStart);
    const cash=cashbookEntries(db,u,histStartKey,todayKey);
    const daily={};
    for(let i=0;i<30;i++){const d=new Date(histStart.getTime()+i*86400000),k=key(d);daily[k]={date:k,income:0,expense:0,net:0};}
    cash.forEach(x=>{const k=String(x.date||'').slice(0,10);if(daily[k]){const a=Number(x.amount||0);if(x.type==='income')daily[k].income+=a;else daily[k].expense+=a;}});
    const rows=Object.values(daily);
    rows.forEach(x=>x.net=x.income-x.expense);
    const avgIncome=rows.reduce((a,x)=>a+x.income,0)/30;
    const avgExpense=rows.reduce((a,x)=>a+x.expense,0)/30;
    const activeNetDays=rows.filter(x=>x.income||x.expense);
    const avgNet=activeNetDays.length?activeNetDays.reduce((a,x)=>a+x.net,0)/activeNetDays.length:0;
    const currentCash=cashbookEntries(db,u,'','').reduce((a,x)=>a+(x.type==='income'?Number(x.amount||0):-Number(x.amount||0)),0);
    const openInvoices=db.invoices.filter(x=>x.user_id===u.id&&!['paid','cancelled'].includes(x.status)).map(inv=>{const paid=db.receivable_payments.filter(p=>p.user_id===u.id&&p.invoice_id===inv.id).reduce((a,p)=>a+Number(p.amount||0),0);return {...inv,outstanding:Math.max(0,Number(inv.total||0)-paid)};}).filter(x=>x.outstanding>0);
    const openPurchases=db.purchases.filter(x=>x.user_id===u.id&&!['cancelled','returned'].includes(x.status)).map(po=>{const paid=db.supplier_payments.filter(p=>p.user_id===u.id&&p.purchase_id===po.id).reduce((a,p)=>a+Number(p.amount||0),0);return {...po,outstanding:Math.max(0,Number(po.total||0)-paid)};}).filter(x=>x.outstanding>0);
    const horizon=30, forecast=[];
    for(let i=1;i<=horizon;i++){
      const d=new Date(today.getTime()+i*86400000),k=key(d);
      const dueIn=openInvoices.filter(x=>String(x.due_date||'')===k).reduce((a,x)=>a+x.outstanding,0);
      const dueOut=openPurchases.filter(x=>String(x.due_date||'')===k).reduce((a,x)=>a+x.outstanding,0);
      const projectedIncome=avgIncome+dueIn, projectedExpense=avgExpense+dueOut, net=projectedIncome-projectedExpense;
      const prior=forecast.length?forecast[forecast.length-1].closing:currentCash;
      forecast.push({date:k,base_income:Number(avgIncome.toFixed(2)),base_expense:Number(avgExpense.toFixed(2)),receivables_due:Number(dueIn.toFixed(2)),payables_due:Number(dueOut.toFixed(2)),net:Number(net.toFixed(2)),closing:Number((prior+net).toFixed(2))});
    }
    const minClosing=Math.min(currentCash,...forecast.map(x=>x.closing)), endClosing=forecast[forecast.length-1]?.closing||currentCash;
    const totalDueIn=openInvoices.reduce((a,x)=>a+x.outstanding,0), totalDueOut=openPurchases.reduce((a,x)=>a+x.outstanding,0);
    const risk=minClosing<0?'critical':minClosing<avgExpense*7?'watch':'healthy';
    const alerts=[];
    if(minClosing<0)alerts.push({severity:'high',title:'Projected cash shortfall',text:`Projected cash could fall below zero within the next 30 days. Review collections, expenses and supplier payment timing.`});
    else if(minClosing<avgExpense*7)alerts.push({severity:'medium',title:'Cash buffer is getting thin',text:`The projected closing cash falls below roughly seven days of average cash expenses. Protect your working cash.`});
    if(totalDueIn>0)alerts.push({severity:'positive',title:'Customer collections can strengthen cash',text:`${moneyText(totalDueIn)} is currently outstanding from open invoices. Prioritize due and overdue collections.`});
    if(totalDueOut>0)alerts.push({severity:'medium',title:'Supplier payments are coming',text:`${moneyText(totalDueOut)} remains payable on open purchases. Plan payment dates to avoid unnecessary cash pressure.`});
    if(!alerts.length)alerts.push({severity:'positive',title:'Cash outlook looks stable',text:'BIGJOE does not see a major 30-day cash-flow risk from the records currently available.'});
    return json(res,200,{as_of:todayKey,current_cash:Number(currentCash.toFixed(2)),historical:{average_daily_income:Number(avgIncome.toFixed(2)),average_daily_expense:Number(avgExpense.toFixed(2)),average_daily_net:Number(avgNet.toFixed(2))},open_receivables:Number(totalDueIn.toFixed(2)),open_payables:Number(totalDueOut.toFixed(2)),risk,min_projected_cash:Number(minClosing.toFixed(2)),projected_30_day_closing:Number(endClosing.toFixed(2)),forecast,alerts,open_invoices:openInvoices.sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,8).map(x=>({number:x.number,customer_name:x.customer_name,outstanding:Number(x.outstanding.toFixed(2)),due_date:x.due_date||''})),open_purchases:openPurchases.sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,8).map(x=>({number:x.number,supplier_name:x.supplier_name,outstanding:Number(x.outstanding.toFixed(2)),due_date:x.due_date||''}))});
  }

'''
if marker not in s: raise SystemExit('marker not found')
s=s.replace(marker,insert+marker,1)
p.write_text(s)

p=Path('/mnt/data/v33work/public/index.html')
s=p.read_text()
s=s.replace("<button onclick=\"showPage('planner',this)\">🎯 Business Planner</button>","<button onclick=\"showPage('planner',this)\">🎯 Business Planner</button><button onclick=\"showPage('cashflow',this)\">💧 Cash Flow</button>",1)
marker='<div id="customerIntel" class="page hidden">'
page='''<div id="cashflow" class="page hidden">\n<div class="section-head"><div><h2>💧 BIGJOE Cash Flow & Scenario Centre</h2><p class="muted">See your projected 30-day cash position, outstanding obligations and test simple business scenarios before making decisions.</p></div><div class="doc-actions"><button class="primary" onclick="loadCashFlow()">↻ Refresh</button></div></div>\n<div id="cashflowStats" class="stats"></div>\n<div class="grid dashboard-grid">\n <div class="card wide"><div class="section-head"><div><h3>🔮 30-Day Cash Forecast</h3><p class="muted">Uses your recent cash movement plus currently due receivables and payables. It is a planning estimate, not a guarantee.</p></div><span id="cashflowRisk" class="badge"></span></div><div id="cashflowChart" class="bar-chart"></div><div id="cashflowAlerts" class="alerts-list"></div></div>\n <div class="card"><h3>📥 Receivables to Collect</h3><div id="cashflowReceivables"></div></div>\n <div class="card"><h3>📤 Payables to Plan</h3><div id="cashflowPayables"></div></div>\n <div class="card wide"><div class="section-head"><div><h3>🧮 What-If Scenario Simulator</h3><p class="muted">Adjust the assumptions to estimate how a change could affect monthly net cash.</p></div></div><div class="scenario-form"><label>Extra monthly sales (₦)<input id="scenarioSales" type="number" min="0" step="1000" value="0"></label><label>Expected gross margin (%)<input id="scenarioMargin" type="number" min="0" max="100" step="1" value="25"></label><label>Extra monthly expenses (₦)<input id="scenarioExpenses" type="number" min="0" step="1000" value="0"></label><label>One-time cash cost (₦)<input id="scenarioCost" type="number" min="0" step="1000" value="0"></label><button class="primary" onclick="runCashScenario()">Calculate Scenario</button></div><div id="scenarioResult" class="scenario-result"></div></div>\n</div></div>\n\n'''
if marker not in s: raise SystemExit('page marker not found')
s=s.replace(marker,page+marker,1)
p.write_text(s)

p=Path('/mnt/data/v33work/public/app.js')
s=p.read_text()
s=s.replace("if(id===\"dashboard\")loadDashboard();if(id===\"planner\")loadBusinessPlanner();", "if(id===\"dashboard\")loadDashboard();if(id===\"planner\")loadBusinessPlanner();if(id===\"cashflow\")loadCashFlow();",1)
insert='''\nasync function loadCashFlow(){try{const d=await api('/api/cashflow-forecast');window.__cashflowData=d;const risk=d.risk||'healthy';$('cashflowRisk').textContent=risk==='critical'?'⚠ Critical':risk==='watch'?'⚠ Watch':'✓ Stable';$('cashflowStats').innerHTML=`<div class="stat"><span>Current Cash Position</span><b>${money(d.current_cash)}</b></div><div class="stat"><span>30-Day Projected Closing</span><b class="${Number(d.projected_30_day_closing)<0?'negative-text':''}">${money(d.projected_30_day_closing)}</b></div><div class="stat"><span>Open Receivables</span><b>${money(d.open_receivables)}</b></div><div class="stat danger"><span>Open Payables</span><b>${money(d.open_payables)}</b></div>`;const f=d.forecast||[],max=Math.max(1,...f.map(x=>Math.abs(Number(x.closing||0))),Math.abs(Number(d.current_cash||0)));$('cashflowChart').innerHTML=f.map(x=>{const n=Number(x.closing||0),w=Math.max(2,Math.min(100,Math.abs(n)/max*100));return `<div class="bar-item" title="${x.date}: ${money(n)} projected closing cash"><div class="bar-label">${new Date(x.date+'T00:00:00').toLocaleDateString('en-NG',{day:'2-digit',month:'short'})}</div><div class="bar-track"><div class="bar-fill ${n<0?'negative':''}" style="width:${w}%"></div></div><div class="bar-value">${money(n)}</div></div>`}).join('');$('cashflowAlerts').innerHTML=(d.alerts||[]).map(x=>`<div class="alert-item alert-${esc(x.severity||'medium')}"><b>${x.severity==='high'?'⚠️':x.severity==='positive'?'✅':'🔔'} ${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('');$('cashflowReceivables').innerHTML=(d.open_invoices||[]).map(x=>dashboardRow(x.number,money(x.outstanding),`${esc(x.customer_name||'Customer')} • due ${x.due_date||'not set'}`)).join('')||'<div class="empty">No outstanding customer invoices.</div>';$('cashflowPayables').innerHTML=(d.open_purchases||[]).map(x=>dashboardRow(x.number,money(x.outstanding),`${esc(x.supplier_name||'Supplier')} • due ${x.due_date||'not set'}`)).join('')||'<div class="empty">No outstanding supplier purchases.</div>';runCashScenario();}catch(e){toast(e.message,true)}}\nfunction runCashScenario(){const d=window.__cashflowData;if(!d)return;const sales=Math.max(0,Number($('scenarioSales').value||0)),margin=Math.max(0,Math.min(100,Number($('scenarioMargin').value||0))),expenses=Math.max(0,Number($('scenarioExpenses').value||0)),oneTime=Math.max(0,Number($('scenarioCost').value||0));const gross=sales*margin/100,net=gross-expenses-oneTime;const projected=Number(d.projected_30_day_closing||0)+net;$('scenarioResult').innerHTML=`<div class="scenario-card"><div><span>Extra gross profit</span><b>${money(gross)}</b></div><div><span>Scenario net cash impact</span><b class="${net<0?'negative-text':'positive-text'}">${net>=0?'+':''}${money(net)}</b></div><div><span>Estimated closing cash</span><b class="${projected<0?'negative-text':''}">${money(projected)}</b></div><p>${net>=0?'This scenario would improve projected cash based on the assumptions entered.':'This scenario would reduce projected cash. Review the margin, extra expenses or one-time cost before proceeding.'}</p></div>`}\n'''
marker='function dashboardRow(name,value,extra=\'\'){'
if marker not in s: raise SystemExit('js marker not found')
s=s.replace(marker,insert+'\n'+marker,1)
p.write_text(s)

p=Path('/mnt/data/v33work/public/style.css')
s=p.read_text()
s += '''\n/* v33 Cash Flow & Scenario Centre */\n.scenario-form{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:14px;align-items:end}.scenario-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#475467}.scenario-form input{padding:11px 12px;border:1px solid #d0d5dd;border-radius:9px;font:inherit;font-weight:500;color:#172033;background:#fff}.scenario-result{margin-top:16px}.scenario-card{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;border:1px solid #e4e7ec;border-radius:12px;background:#fafbfc}.scenario-card span,.scenario-card p{color:#667085}.scenario-card b{display:block;font-size:20px;margin-top:6px}.scenario-card p{grid-column:1/-1;margin:0;line-height:1.5}.negative-text{color:#b42318!important}.positive-text{color:#087443!important}@media(max-width:1050px){.scenario-form{grid-template-columns:repeat(2,1fr)}.scenario-form button{width:100%}.scenario-card{grid-template-columns:1fr 1fr}}@media(max-width:650px){.scenario-form,.scenario-card{grid-template-columns:1fr}.scenario-card p{grid-column:auto}}\n'''
p.write_text(s)
