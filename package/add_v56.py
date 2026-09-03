from pathlib import Path
p=Path('/mnt/data/v56work/server.js')
s=p.read_text()
marker='  // ---------- v50 Business Command Center ----------\n'
endpoint=r'''  // ---------- v56 Advanced Business Automation & Smart Alerts ----------
  if (method === "GET" && url.pathname === "/api/automation-center") {
    const u=requireUser(req,res,db); if(!u)return;
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned");
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const products=db.products.filter(x=>x.user_id===u.id);
    const customers=db.customers.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10);
    const todayKey=key(today), weekStart=new Date(today.getTime()-6*86400000), prevWeekStart=new Date(today.getTime()-13*86400000), prevWeekEnd=new Date(today.getTime()-7*86400000);
    const inRange=(v,a,b)=>{const k=String(v||'').slice(0,10);return k>=key(a)&&k<=key(b)};
    const weekSales=sales.filter(x=>inRange(x.created_at,weekStart,today)), prevSales=sales.filter(x=>inRange(x.created_at,prevWeekStart,prevWeekEnd));
    const revenue=weekSales.reduce((a,x)=>a+Number(x.total||0),0), prevRevenue=prevSales.reduce((a,x)=>a+Number(x.total||0),0);
    const profit=weekSales.reduce((a,x)=>a+Number(x.profit||0),0), prevProfit=prevSales.reduce((a,x)=>a+Number(x.profit||0),0);
    const weekExp=expenses.filter(x=>inRange(x.date||x.created_at,weekStart,today)).reduce((a,x)=>a+Number(x.amount||0),0), prevExp=expenses.filter(x=>inRange(x.date||x.created_at,prevWeekStart,prevWeekEnd)).reduce((a,x)=>a+Number(x.amount||0),0);
    const pct=(a,b)=>b?Number(((a-b)/Math.abs(b)*100).toFixed(1)):null;
    const revenueChange=pct(revenue,prevRevenue), profitChange=pct(profit,prevProfit), expenseChange=pct(weekExp,prevExp);
    const demand={}; sales.filter(x=>inRange(x.created_at,new Date(today.getTime()-59*86400000),today)).forEach(s=>(s.items||[]).forEach(i=>{const k=i.product_id||i.sku||i.name;if(k)demand[k]=(demand[k]||0)+Number(i.quantity||0)}));
    const reorder=products.map(p=>{const units=demand[p.id]||demand[p.sku]||demand[p.name]||0;const daily=units/60;const stock=Number(p.stock_quantity||0);const reorderLevel=Number(p.min_stock??p.reorder_level??p.low_stock_level??0);const cover=daily?stock/daily:null;const lead=Number(p.lead_time_days||7);const target=Math.max(reorderLevel,Math.ceil(daily*(lead+7)));const suggested=Math.max(0,Math.ceil(target-stock));return {id:p.id,name:p.name,sku:p.sku||'',stock,reorder_level:reorderLevel,daily_demand:Number(daily.toFixed(2)),cover_days:cover===null?null:Number(cover.toFixed(1)),suggested_quantity:suggested,urgency:stock<=reorderLevel?'urgent':cover!==null&&cover<=lead?'high':cover!==null&&cover<=lead+7?'medium':'low'}}).filter(x=>x.urgency!=='low').sort((a,b)=>({urgent:0,high:1,medium:2}[a.urgency]-({urgent:0,high:1,medium:2}[b.urgency]))||(a.cover_days??999)-(b.cover_days??999)).slice(0,12);
    const alerts=[];
    if(!weekSales.length) alerts.push({level:'danger',title:'No completed sales in the last 7 days',text:'Review sales activity, customer follow-up and branch performance.'});
    else if(revenueChange!==null&&revenueChange<=-10) alerts.push({level:'danger',title:'Sales momentum is falling',text:`Revenue is ${Math.abs(revenueChange).toFixed(1)}% below the previous 7-day period.`});
    if(revenue>0&&profit/revenue<0.2) alerts.push({level:'warning',title:'Gross margin is under pressure',text:`The last 7 days produced a gross margin of ${(profit/revenue*100).toFixed(1)}%. Review pricing, discounts and purchase costs.`});
    if(expenseChange!==null&&expenseChange>=15) alerts.push({level:'warning',title:'Operating expenses are rising',text:`Expenses increased ${expenseChange.toFixed(1)}% compared with the previous 7-day period.`});
    reorder.filter(x=>x.urgency==='urgent').slice(0,3).forEach(x=>alerts.push({level:'danger',title:`Restock ${x.name}`,text:`Only ${x.stock} unit(s) remain. Suggested replenishment: ${x.suggested_quantity} unit(s).`}));
    const inactive=customers.filter(c=>{const last=sales.filter(x=>x.customer_id===c.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];return last&&((today-new Date(String(last.created_at).slice(0,10)+'T00:00:00'))/86400000)>=30}).length;
    if(inactive) alerts.push({level:'warning',title:`${inactive} customer(s) may need follow-up`,text:'Customers with no purchase for 30+ days are worth reviewing for a win-back campaign.'});
    if(!alerts.length) alerts.push({level:'positive',title:'No major automation alert detected',text:'BIGJOE found no urgent exception in the current sales, expense, customer and stock signals.'});
    const actions=[];
    if(reorder.length) actions.push({priority:'urgent',title:'Review replenishment recommendations',text:`${reorder.length} product(s) have a stock-risk signal. Review suggested quantities before ordering.`,page:'procurement'});
    if(revenueChange!==null&&revenueChange<=-10) actions.push({priority:'high',title:'Investigate the sales decline',text:'Compare best sellers, branches and customer activity before changing prices or stock levels.',page:'analytics'});
    if(expenseChange!==null&&expenseChange>=15) actions.push({priority:'high',title:'Review rising expenses',text:'Check the largest expense categories and identify avoidable increases.',page:'expenses'});
    if(inactive) actions.push({priority:'medium',title:'Run a customer win-back review',text:`Review the ${inactive} customer(s) with 30+ days since their last purchase.`,page:'customerIntel'});
    if(!actions.length) actions.push({priority:'medium',title:'Review the weekly business briefing',text:'Use this centre each morning to keep important changes visible.',page:'analytics'});
    const briefing=`Over the last 7 days, BIGJOE recorded ${weekSales.length} completed sale(s) worth ${moneyText(revenue)} with ${moneyText(profit)} gross profit. ${revenueChange===null?'There is not enough prior-period data for a reliable sales comparison.':`Revenue is ${Math.abs(revenueChange).toFixed(1)}% ${revenueChange>=0?'higher':'lower'} than the previous 7-day period.`} ${reorder.length?`${reorder.length} product(s) need stock attention.`:'No immediate stock-risk group was detected.'} ${weekExp?`Recorded operating expenses were ${moneyText(weekExp)}.`:'No operating expenses were recorded in the last 7 days.'}`;
    return json(res,200,{generated_at:new Date().toISOString(),briefing,summary:{revenue:Number(revenue.toFixed(2)),gross_profit:Number(profit.toFixed(2)),expenses:Number(weekExp.toFixed(2)),revenue_change:revenueChange,profit_change:profitChange,expense_change:expenseChange,sales_count:weekSales.length,customers:customers.length,suppliers:suppliers.length},alerts,actions,reorder,recent_changes:{previous_revenue:Number(prevRevenue.toFixed(2)),previous_profit:Number(prevProfit.toFixed(2)),previous_expenses:Number(prevExp.toFixed(2))},automation_note:'Recommendations are generated from recorded BIGJOE data. No financial commitment is executed automatically.'});
  }

'''
if marker not in s: raise SystemExit('marker missing')
s=s.replace(marker,endpoint+marker,1)
p.write_text(s)
