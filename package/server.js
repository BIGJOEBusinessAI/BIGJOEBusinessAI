const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { URL } = require("url");

loadEnv();

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FLW_WEBHOOK_SECRET_HASH = process.env.FLW_WEBHOOK_SECRET_HASH || "";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
fs.mkdirSync(DATA_DIR, { recursive: true });

const PLANS = {
  free: { name: "Free Forever", amount: 0, currency: "NGN", features: ["Core business dashboard", "Sales / POS", "Inventory & customers", "Basic AI Assistant"] },
  business: { name: "Business", amount: 1500, currency: "NGN", features: ["Everything in Free Forever", "Advanced analytics & reports", "Branches and business controls", "Priority business tools"] },
  pro: { name: "Pro", amount: 3000, currency: "NGN", features: ["Everything in Business", "Advanced AI & automation", "Premium intelligence & controls", "Priority support"] }
};

// Plan ranking used to decide whether a user's current plan meets a feature's minimum requirement.
const PLAN_ORDER = { free: 0, business: 1, pro: 2 };

// Paths that must always stay reachable regardless of plan: auth, account/meta endpoints,
// and anything related to paying for / managing the subscription itself (a locked-out user
// must always be able to see plans and upgrade).
const OPEN_API_PREFIXES = [
  "/api/me", "/api/login", "/api/logout", "/api/register", "/api/plans", "/api/health",
  "/api/network-info", "/api/actor", "/api/onboarding/status", "/api/business-profile",
  "/api/security-review",
  "/api/payments/flutterwave/initialize", "/api/payments/flutterwave/connection",
  "/api/payments/paystack/connection", "/api/payments/receiving/config", "/api/payments/reconcile",
  "/api/payments/hub", "/api/payments",
  "/api/subscriptions/", "/payment/callback", "/webhooks/flutterwave", "/api/flutterwave/webhook"
];

// Everything under these prefixes matches the "Advanced analytics & reports", "Branches and
// business controls" and "Priority business tools" bullets on the Business plan card.
const BUSINESS_API_PREFIXES = [
  "/api/analytics", "/api/branches", "/api/staff", "/api/purchases", "/api/procurement-intelligence",
  "/api/supplier-payments", "/api/accounting", "/api/budget-control", "/api/financial-center",
  "/api/cashflow-forecast", "/api/business-planner", "/api/customer-intelligence", "/api/marketing",
  "/api/loyalty", "/api/invoices", "/api/quotations", "/api/receivables", "/api/receivable-payments"
];

// Everything under these prefixes matches the "Advanced AI & automation" and "Premium
// intelligence & controls" bullets on the Pro plan card.
const PRO_API_PREFIXES = [
  "/api/predictive-intelligence", "/api/decision-automation", "/api/smart-actions",
  "/api/automation-center", "/api/command-center", "/api/system-health", "/api/data-audit"
];

function matchesApiPrefix(pathname, prefixes) {
  return prefixes.some(p => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

// Everything on the Free plan card ("Core business dashboard", "Sales / POS", "Inventory &
// customers", "Basic AI Assistant") plus anything not explicitly listed above is left
// unrestricted here on purpose — Free is the baseline every plan includes.
function requiredPlanForPath(pathname) {
  if (matchesApiPrefix(pathname, OPEN_API_PREFIXES)) return null;
  if (matchesApiPrefix(pathname, PRO_API_PREFIXES)) return "pro";
  if (matchesApiPrefix(pathname, BUSINESS_API_PREFIXES)) return "business";
  return null;
}

function loadEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function defaultDb() {
  return { subscription_gateway: null, branches: [], staff: [], branch_stock: [], branch_transfers: [], inventory_movements: [], users: [], payments: [], payment_integrations: [], receivable_payments: [], supplier_payments: [], purchases: [], activity: [], sessions: [], categories: [], suppliers: [], products: [], sales: [], sales_returns: [], customers: [], expenses: [], invoices: [], quotations: [], accounting_accounts: [], accounting_entries: [], business_plans: [], marketing_campaigns: [], loyalty_ledger: [], loyalty_rewards: [], loyalty_redemptions: [], smart_tasks: [] };
}
function dbRead() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    data.branches ||= []; data.staff ||= []; data.branch_stock ||= []; data.branch_transfers ||= []; data.users ||= []; data.payments ||= []; []; data.receivable_payments ||= []; data.supplier_payments ||= []; data.purchases ||= []; data.activity ||= []; data.sessions ||= [];
    data.payment_integrations ||= []; data.subscription_gateway ||= null; data.categories ||= []; data.suppliers ||= []; data.products ||= []; data.sales ||= []; data.sales_returns ||= []; data.customers ||= []; data.expenses ||= []; data.invoices ||= []; data.quotations ||= []; data.accounting_accounts ||= []; data.accounting_entries ||= []; data.business_plans ||= []; data.marketing_campaigns ||= []; data.loyalty_ledger ||= []; data.loyalty_rewards ||= []; data.loyalty_redemptions ||= []; data.smart_tasks ||= [];
    return data;
  } catch { return defaultDb(); }
}
function dbWrite(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  res.end(body);
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(x => {
    const i = x.indexOf("=");
    if (i > -1) out[x.slice(0,i).trim()] = decodeURIComponent(x.slice(i+1).trim());
  });
  return out;
}
function setCookie(res, name, value, maxAge=60*60*24*7) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}
function passwordVerify(password, stored) {
  const raw = String(stored || "").trim();
  const parts = raw.split(":");
  // BIGJOE canonical format: salt:pbkdf2-sha256(120000)
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [salt, expected] = parts;
    const actual = crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("hex");
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
  return false;
}
function safeUser(u) {
  const bp={business_name:"BIGJOE",phone:"",address:"",email:u.email,tagline:"Smart business management with BIGJOE.",logo_data_url:"",show_logo:true,show_owner_name:true,show_branding:true,show_contact_info:true,...(u.business_profile||{})};
  return {id:u.id,name:u.name,email:u.email,plan:u.plan,subscription_status:u.subscription_status||((u.plan&&u.plan!=="free")?"active":"free"),subscription_plan:u.subscription_plan||null,subscription_started_at:u.subscription_started_at||null,subscription_expires_at:u.subscription_expires_at||null,created_at:u.created_at,business_profile:bp};
}
function currentUser(req, db) {
  const token = parseCookies(req).bigjoe_session;
  if (!token) return null;
  const s = db.sessions.find(x => x.token === token);
  if (!s) return null;
  const u = db.users.find(x => x.id === s.userId);
  return u ? applySubscriptionExpiry(db,u) : null;
}
function currentSession(req, db) {
  const token = parseCookies(req).bigjoe_session;
  return token ? db.sessions.find(x => x.token === token) || null : null;
}
function currentStaff(req, db) {
  const sess=currentSession(req,db);
  if(!sess || !sess.staffId) return null;
  return (db.staff||[]).find(x=>x.id===sess.staffId && x.active!==false) || null;
}
const ROLE_PERMISSIONS={
  owner:['*'],
  manager:['dashboard','branches','sales','inventory','customers','expenses','reports','financial','accounting','ai','staff'],
  cashier:['dashboard','sales','customers','ai'],
  inventory:['dashboard','inventory','customers','purchases','suppliers','ai'],
  accountant:['dashboard','expenses','reports','financial','accounting','ai'],
  viewer:['dashboard','reports','customers','ai']
};
function staffCan(staff, permission){
  if(!staff) return true;
  const list=Array.isArray(staff.permissions)&&staff.permissions.length?staff.permissions:(ROLE_PERMISSIONS[staff.role]||ROLE_PERMISSIONS.viewer);
  return list.includes('*') || list.includes(permission);
}
function permissionForPath(method,path){
  if(path.startsWith('/api/staff')) return 'staff';
  if(path.startsWith('/api/branches')) return 'branches';
  if(path.startsWith('/api/sales') || path.startsWith('/api/payments') || path.startsWith('/api/flutterwave')) return 'sales';
  if(path.startsWith('/api/products') || path.startsWith('/api/categories') || path.startsWith('/api/suppliers') || path.startsWith('/api/inventory')) return 'inventory';
  if(path.startsWith('/api/customers') || path.startsWith('/api/receivables')) return 'customers';
  if(path.startsWith('/api/expenses') || path.startsWith('/api/accounting')) return 'expenses';
  if(path.startsWith('/api/reports') || path.startsWith('/api/dashboard') || path.startsWith('/api/analytics')) return 'reports';
  if(path.startsWith('/api/financial-center') || path.startsWith('/api/financial')) return 'financial';
  if(path.startsWith('/api/ai') || path.startsWith('/api/tools') || path.startsWith('/api/advisor')) return 'ai';
  if(path.startsWith('/api/purchases') || path.startsWith('/api/procurement')) return 'inventory';
  if(path.startsWith('/api/smart-actions')) return 'reports';
  return null;
}
function requirePermission(req,res,db,permission){
  const staff=currentStaff(req,db);
  if(staff && !staffCan(staff,permission)){ json(res,403,{error:`Your staff role (${staff.role}) does not have permission for this action.`}); return false; }
  return true;
}

// ---------- App platform gating (Payment Hub: web-only) ----------
// The BIGJOE mobile apps (Android/iOS) send an X-BigJoe-Platform header so the server knows
// which surface a request came from. Any browser/PWA request without the header, or with an
// unrecognized value, is treated as "web" so existing web sessions are unaffected.
function requestPlatform(req){
  const h=String(req.headers['x-bigjoe-platform']||'').toLowerCase().trim();
  return (h==='ios'||h==='android')?h:'web';
}
// Receiving-payment configuration (Payment Hub) is managed from the consolidated BIGJOE
// website only — it is intentionally left out of the Android/iOS apps. This is distinct from
// subscription checkout (/api/payments/flutterwave/initialize, /api/subscriptions/*), which
// must stay reachable everywhere so a business can still upgrade from the apps.
const PAYMENT_HUB_WEB_ONLY_PREFIXES = [
  "/api/payments/hub", "/api/payments/flutterwave/connection", "/api/payments/paystack/connection",
  "/api/payments/receiving/config", "/api/payments/reconcile"
];
function isPaymentHubPath(pathname){
  return PAYMENT_HUB_WEB_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

async function body(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
function requireUser(req, res, db) {
  const u = currentUser(req, db);
  if (!u) { json(res, 401, {error:"Please log in first."}); return null; }
  const pathname = String(req.url || "").split("?")[0];
  const required = requiredPlanForPath(pathname);
  if (required) {
    const currentPlan = u.plan || "free";
    if ((PLAN_ORDER[currentPlan] ?? 0) < PLAN_ORDER[required]) {
      const planInfo = PLANS[required];
      json(res, 402, {
        error: `This feature is part of the ${planInfo.name} plan. Upgrade your BIGJOE subscription to unlock it.`,
        upgrade_required: true,
        required_plan: required,
        current_plan: currentPlan
      });
      return null;
    }
  }
  if (isPaymentHubPath(pathname) && requestPlatform(req) !== "web") {
    json(res, 403, {
      error: "Payment Hub is only available on the BIGJOE website. Manage your receiving payment accounts from a web browser.",
      web_only: true
    });
    return null;
  }
  return u;
}
function moneyText(n) { return "₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2}); }

function activity(db, userId, tool, input, output) {
  db.activity.push({id:id(), user_id:userId, tool, input_text:input, output_text:output, created_at:now()});
  db.activity = db.activity.slice(-1000);
}

// ---------- Inventory movement helpers ----------
function recordInventoryMovement(db,user,product,delta,type,reason,reference,branchId){
  db.inventory_movements ||= [];
  const branch=branchId?db.branches.find(b=>b.id===String(branchId)&&b.user_id===user.id):null;
  db.inventory_movements.push({
    id:id(), user_id:user.id, product_id:product.id, product_name:product.name, sku:product.sku||'',
    branch_id:branch?.id||null, branch_name:branch?.name||'', delta:Number(Number(delta||0).toFixed(2)),
    type:String(type||'adjustment'), reason:String(reason||'').trim(), reference:String(reference||'').trim(),
    resulting_stock:Number(Number(product.stock_quantity||0).toFixed(2)), created_at:now()
  });
  db.inventory_movements=db.inventory_movements.slice(-5000);
}

// ---------- Multi-Branch helpers ----------
function ensureBranches(db, user) {
  db.branches ||= []; db.branch_stock ||= []; db.branch_transfers ||= [];
  let changed=false;
  let branches=db.branches.filter(b=>b.user_id===user.id);
  if(!branches.length){
    const bp=user.business_profile||{};
    const main={id:id(),user_id:user.id,name:(bp.business_name||'BIGJOE')+' — Main Branch',code:'MAIN',address:bp.address||'',phone:bp.phone||'',active:true,is_default:true,created_at:now(),updated_at:now()};
    db.branches.push(main); branches=[main]; changed=true;
  }
  const defaultBranch=branches.find(b=>b.is_default)||branches[0];
  const ownedCollections=['sales','expenses','purchases','receivable_payments','supplier_payments','invoices','quotations','accounting_entries','marketing_campaigns','loyalty_ledger','loyalty_redemptions'];
  for(const key of ownedCollections){
    if(!Array.isArray(db[key])) continue;
    for(const row of db[key].filter(x=>x.user_id===user.id)) if(!row.branch_id){row.branch_id=defaultBranch.id;changed=true;}
  }
  const products=db.products.filter(x=>x.user_id===user.id);
  for(const pr of products){
    if(!branches.some(b=>b.active!==false)) continue;
    const rows=db.branch_stock.filter(x=>x.user_id===user.id&&x.product_id===pr.id);
    if(!rows.length){db.branch_stock.push({id:id(),user_id:user.id,branch_id:defaultBranch.id,product_id:pr.id,quantity:Number(pr.stock_quantity||0),updated_at:now()});changed=true;}
  }
  if(changed) dbWrite(db);
  return branches;
}
function getBranch(db,user,branchId){
  ensureBranches(db,user);
  return db.branches.find(b=>b.id===String(branchId||'')&&b.user_id===user.id&&b.active!==false) || db.branches.find(b=>b.user_id===user.id&&b.is_default) || db.branches.find(b=>b.user_id===user.id&&b.active!==false);
}
function branchStockRow(db,user,branchId,productId,create=false){
  let row=db.branch_stock.find(x=>x.user_id===user.id&&x.branch_id===branchId&&x.product_id===productId);
  if(!row&&create){row={id:id(),user_id:user.id,branch_id:branchId,product_id:productId,quantity:0,updated_at:now()};db.branch_stock.push(row);}
  return row;
}
function branchName(db,id){return db.branches.find(b=>b.id===id)?.name||'Main Branch';}

// ---------- Accounting helpers ----------
// Accounting v18 stores simple cashbook movements while keeping the
// underlying sales, expenses and payment modules as the source of truth.
function ensureAccountingAccounts(db, user) {
  normalizeAccountingEntries(db);
  db.accounting_accounts ||= [];
  const defaults = [
    {code:"CASH", name:"Cash", type:"asset"},
    {code:"BANK", name:"Bank Account", type:"asset"},
    {code:"POS", name:"POS / Card", type:"asset"},
    {code:"FLUTTERWAVE", name:"Flutterwave", type:"asset"},
    {code:"SALES_REVENUE", name:"Sales Revenue", type:"income"},
    {code:"OTHER_INCOME", name:"Other Income", type:"income"},
    {code:"COGS", name:"Cost of Goods Sold", type:"expense"},
    {code:"OPERATING_EXPENSES", name:"Operating Expenses", type:"expense"},
    {code:"INVENTORY", name:"Inventory", type:"asset"},
    {code:"ACCOUNTS_RECEIVABLE", name:"Accounts Receivable", type:"asset"},
    {code:"ACCOUNTS_PAYABLE", name:"Accounts Payable", type:"liability"},
    {code:"OWNER_EQUITY", name:"Owner's Equity", type:"equity"},
    {code:"OPENING_BALANCE_EQUITY", name:"Opening Balance Equity", type:"equity"}
  ];
  const userAccounts = db.accounting_accounts.filter(a=>a.user_id===user.id);
  let changed=false;
  for(const d of defaults){
    if(!userAccounts.some(a=>a.code===d.code)){
      db.accounting_accounts.push({id:id(),user_id:user.id,code:d.code,name:d.name,type:d.type,opening_balance:0,active:true,system:true,created_at:now(),updated_at:now()});
      changed=true;
    }
  }
  if(changed) dbWrite(db);
  return db.accounting_accounts.filter(a=>a.user_id===user.id && a.active!==false);
}

function cashbookEntries(db, user, start, end, branchId=null) {
  const inRange=(date)=>{
    const d=String(date||"").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return (!start || d>=start) && (!end || d<=end);
  };
  const out=[];
  const add=(e)=>{ if((!branchId||e.branch_id===branchId)&&inRange(e.date)) out.push(e); };
  const method=(m)=>String(m||"cash").toLowerCase();

  db.sales.filter(x=>x.user_id===user.id && x.status!=="cancelled" && x.status!=="returned").forEach(s=>add({
    id:`sale-${s.id}`,branch_id:s.branch_id,source:"sale",source_id:s.id,date:String(s.created_at||"").slice(0,10),
    description:`Sale ${s.invoice_no||""}`.trim(),reference:s.invoice_no||"",method:method(s.payment_method),type:"income",amount:Number(s.total||0),account_code:"SALES_REVENUE"
  }));
  (db.sales_returns||[]).filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(r=>add({
    id:`sale-return-${r.id}`,branch_id:r.branch_id,source:"sale return",source_id:r.id,date:String(r.created_at||"").slice(0,10),
    description:`Refund ${r.invoice_no||""}`.trim(),reference:r.return_no||r.invoice_no||"",method:method(r.payment_method),type:"expense",amount:Number(r.refund_total||0),account_code:"SALES_REVENUE"
  }));
  db.receivable_payments.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(p=>add({
    id:`receivable-${p.id}`,branch_id:p.branch_id,source:"customer payment",source_id:p.id,date:p.date||p.payment_date||String(p.created_at||"").slice(0,10),
    description:`Customer payment${p.customer_name?` - ${p.customer_name}`:""}`,reference:p.invoice_number||p.reference||"",method:method(p.payment_method),type:"income",amount:Number(p.amount||0),account_code:"ACCOUNTS_RECEIVABLE"
  }));
  db.expenses.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(e=>add({
    id:`expense-${e.id}`,branch_id:e.branch_id,source:"expense",source_id:e.id,date:e.date||String(e.created_at||"").slice(0,10),
    description:e.description||"Expense",reference:"",method:method(e.payment_method),type:"expense",amount:Number(e.amount||0),account_code:"OPERATING_EXPENSES"
  }));
  db.supplier_payments.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(p=>add({
    id:`supplier-${p.id}`,branch_id:p.branch_id,source:"supplier payment",source_id:p.id,date:p.payment_date||String(p.created_at||"").slice(0,10),
    description:`Supplier payment${p.supplier_name?` - ${p.supplier_name}`:""}`,reference:p.purchase_number||p.reference||"",method:method(p.payment_method),type:"expense",amount:Number(p.amount||0),account_code:"ACCOUNTS_PAYABLE"
  }));
  db.accounting_entries.filter(x=>x.user_id===user.id&&(!branchId||!x.branch_id||x.branch_id===branchId)).forEach(e=>add({
    id:`manual-${e.id}`,branch_id:e.branch_id,source:"manual",source_id:e.id,date:e.date,description:e.description,reference:e.reference||"",method:method(e.payment_method),
    type:accountingCashDirection(e),classification:accountingClassification(e),amount:Number(e.amount||0),account_code:e.account_code||""
  }));
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
}

function accountingClassification(e) {
  return String(e.classification || (e.entry_type === 'expense' ? 'expense' : 'income')).toLowerCase();
}

// Determine cash direction from the accounting meaning, not from a legacy
// entry_type field. This keeps Owner Capital and Loan Received as Money In,
// while Owner Withdrawal, Loan Repayment and Asset Purchase remain Money Out.
function accountingCashDirection(e) {
  const c=accountingClassification(e);
  if(['owner_capital','loan_received','income'].includes(c)) return 'income';
  if(['owner_withdrawal','loan_repayment','asset_purchase','expense'].includes(c)) return 'expense';
  return String(e.entry_type||'income').toLowerCase()==='expense' ? 'expense' : 'income';
}

function normalizeAccountingEntries(db) {
  if(!Array.isArray(db.accounting_entries)) db.accounting_entries=[];
  let changed=false;
  const paymentCodes=new Set(['CASH','BANK','POS','FLUTTERWAVE']);
  const users=[...new Set(db.accounting_entries.map(e=>e.user_id).filter(Boolean))];
  for(const uid of users){
    let accounts=db.accounting_accounts.filter(a=>a.user_id===uid && a.active!==false);
    // Repair older asset-purchase entries that were accidentally saved against
    // a payment account (for example CASH). An asset purchase must debit an
    // actual non-cash asset account and credit the payment account.
    let fallback=accounts.find(a=>a.type==='asset' && !paymentCodes.has(a.code) && !['INVENTORY','ACCOUNTS_RECEIVABLE'].includes(a.code));
    if(!fallback){
      fallback={id:id(),user_id:uid,code:'OTHER_ASSETS',name:'Other Assets',type:'asset',opening_balance:0,active:true,system:true,created_at:now(),updated_at:now()};
      db.accounting_accounts.push(fallback); accounts.push(fallback); changed=true;
    }
    for(const e of db.accounting_entries.filter(x=>x.user_id===uid)) {
      const direction=accountingCashDirection(e);
      if(e.entry_type!==direction) { e.entry_type=direction; changed=true; }
      if(accountingClassification(e)==='asset_purchase' && paymentCodes.has(String(e.account_code||'').toUpperCase())) {
        e.account_code=fallback.code;
        changed=true;
      }
    }
  }
  if(changed) dbWrite(db);
}

function accountBalance(account, manualEntries) {
  let balance=Number(account.opening_balance||0);
  for(const e of manualEntries||[]) {
    const amount=Number(e.amount||0);
    if(e.account_code!==account.code) continue;
    const c=accountingClassification(e);
    if(c==='transfer_in') {
      balance += amount;
    } else if(c==='transfer_out') {
      balance -= amount;
    } else if(c==='income' && account.type==='income') {
      balance += amount;
    } else if(c==='expense' && account.type==='expense') {
      balance += amount;
    } else if(c==='owner_capital' && account.type==='equity') {
      balance += amount;
    } else if(c==='owner_withdrawal' && account.type==='equity') {
      balance -= amount;
    } else if(c==='loan_received' && account.type==='liability') {
      balance += amount;
    } else if(c==='loan_repayment' && account.type==='liability') {
      balance -= amount;
    } else if(c==='asset_purchase' && account.type==='asset') {
      balance += amount;
    }
  }
  return Number(balance.toFixed(2));
}

async function paystack(pathname, options={}) {
  const r = await fetch(`https://api.paystack.co${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw:text }; }
  return { ok:r.ok, status:r.status, data };
}

async function flutterwave(pathname, options={}, secretKey=FLW_SECRET_KEY) {
  const key=String(secretKey||'').trim();
  if(!key) throw new Error('Flutterwave secret key is not configured.');
  const r = await fetch(`https://api.flutterwave.com/v3${pathname}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw:text }; }
  return { ok:r.ok, status:r.status, data };
}

function getFlutterwaveConfig(db,user){
  const cfg=(db.payment_integrations||[]).find(x=>x.user_id===user.id&&x.provider==='flutterwave');
  return {
    secret_key:String(cfg?.secret_key||FLW_SECRET_KEY||'').trim(),
    public_key:String(cfg?.public_key||'').trim(),
    mode:cfg?.mode||process.env.FLW_MODE||'test',
    account_name:String(cfg?.account_name||'').trim()
  };
}
// Subscription checkout is intentionally isolated from the Payment Hub.
// Payment Hub credentials are for the business owner's customer-receiving gateways.
// BIGJOE subscription checkout uses the server environment configuration only.
function getSubscriptionFlutterwaveConfig(db=null, user=null, allowPaymentHubFallback=false){
  const envSecret=String(process.env.FLW_SUBSCRIPTION_SECRET_KEY||process.env.SUBSCRIPTION_FLW_SECRET_KEY||'').trim();
  const envMode=String(process.env.FLW_SUBSCRIPTION_MODE||process.env.SUBSCRIPTION_FLW_MODE||process.env.FLW_MODE||'test').trim()||'test';
  if(envSecret) return {secret_key:envSecret, mode:envMode, source:'environment'};

  // Local/prototype convenience: if the platform owner has already configured
  // Flutterwave in Payment Hub, allow that same account to power BIGJOE plan
  // checkout. This fallback is deliberately limited to the owner session;
  // production multi-tenant deployments should use FLW_SUBSCRIPTION_SECRET_KEY.
  if(db && user && allowPaymentHubFallback){
    const cfg=(db.payment_integrations||[]).find(x=>x.user_id===user.id&&x.provider==='flutterwave'&&x.secret_key);
    if(cfg) return {secret_key:String(cfg.secret_key).trim(), mode:cfg.mode||'test', source:'payment_hub_owner'};
  }
  if(String(FLW_SECRET_KEY||'').trim()) return {secret_key:String(FLW_SECRET_KEY).trim(), mode:envMode, source:'legacy_environment'};
  return {secret_key:'', mode:envMode, source:'none'};
}
function flutterwavePlanId(plan){
  if(plan==='business') return String(process.env.FLW_SUBSCRIPTION_BUSINESS_PAYMENT_PLAN_ID||process.env.SUBSCRIPTION_FLW_BUSINESS_PAYMENT_PLAN_ID||process.env.FLW_BUSINESS_PAYMENT_PLAN_ID||'').trim();
  if(plan==='pro') return String(process.env.FLW_SUBSCRIPTION_PRO_PAYMENT_PLAN_ID||process.env.SUBSCRIPTION_FLW_PRO_PAYMENT_PLAN_ID||process.env.FLW_PRO_PAYMENT_PLAN_ID||'').trim();
  return '';
}

function subscriptionExpiryFrom(startDate=new Date()) {
  const d=new Date(startDate); d.setMonth(d.getMonth()+1); return d.toISOString();
}
// If a paid plan's `subscription_expires_at` has passed, the account drops back to Free
// Forever automatically. `subscription_plan` is kept as-is so the UI can offer a one-click
// "Renew" straight back into the same plan. Checked lazily on every authenticated request
// (see currentUser) rather than a background timer, so it's correct even after a restart.
function applySubscriptionExpiry(db,user){
  if(!user) return user;
  if(user.plan && user.plan!=='free' && user.subscription_expires_at && new Date(user.subscription_expires_at).getTime()<=Date.now()){
    const expiredPlan=user.subscription_plan||user.plan;
    user.plan='free'; user.subscription_status='expired';
    activity(db,user.id,'subscription_expired',expiredPlan,`Your BIGJOE ${PLANS[expiredPlan]?.name||expiredPlan} plan expired after one month and the account moved back to Free Forever. Renew anytime from Plans.`);
    dbWrite(db);
  }
  return user;
}
function activateSubscriptionPayment(db,payment,transactionId,verifiedAt=now()) {
  const user=db.users.find(x=>x.id===payment.user_id);
  if(!user) throw new Error('BIGJOE could not find the account associated with this payment.');
  payment.status='successful'; payment.transaction_id=String(transactionId||payment.transaction_id||'');
  payment.verified_at=verifiedAt; payment.activated_at=payment.activated_at||verifiedAt; payment.subscription_status='active';
  // Renewing the same plan before it expires extends the remaining time instead of
  // discarding it; renewing after expiry (or switching plans) starts a fresh month from now.
  const stillActive = user.subscription_status==='active' && user.subscription_plan===payment.plan &&
    user.subscription_expires_at && new Date(user.subscription_expires_at).getTime()>new Date(verifiedAt).getTime();
  const expiryBase = stillActive ? user.subscription_expires_at : verifiedAt;
  user.plan=payment.plan; user.subscription_status='active'; user.subscription_plan=payment.plan;
  user.subscription_payment_id=payment.id; user.subscription_tx_ref=payment.tx_ref;
  user.subscription_started_at=user.subscription_started_at||verifiedAt; user.subscription_expires_at=subscriptionExpiryFrom(expiryBase);
  activity(db,user.id,'subscription_activated',payment.tx_ref,`BIGJOE ${payment.plan} plan activated after verified Flutterwave payment. Renews/expires ${user.subscription_expires_at}.`);
  return user;
}
async function verifySubscriptionPayment(db,payment,transactionId,cfg){
  if(!payment) return {ok:false,error:'BIGJOE could not find this payment reference.'};
  const expected=PLANS[payment.plan]; if(!expected) return {ok:false,error:'Invalid subscription plan attached to this payment.'};
  if(payment.status==='successful' && payment.transaction_id){
    const user=db.users.find(x=>x.id===payment.user_id);
    if(user && user.plan===payment.plan) return {ok:true,user,alreadyActivated:true};
  }
  if(!cfg?.secret_key) return {ok:false,error:'BIGJOE subscription verification could not be completed because the subscription gateway is not configured.'};
  const verify=await flutterwave(`/transactions/${encodeURIComponent(transactionId)}/verify`,{},cfg.secret_key);
  const tx=verify.data?.data;
  const valid=verify.ok && verify.data?.status==='success' && tx?.status==='successful' &&
    tx?.tx_ref===payment.tx_ref && String(tx?.currency||'').toUpperCase()===String(expected.currency||'').toUpperCase() && Number(tx?.amount)>=Number(expected.amount);
  if(!valid) return {ok:false,error:'Payment verification failed. Your BIGJOE plan was not upgraded.',verify_status:verify.status};
  const user=activateSubscriptionPayment(db,payment,transactionId); dbWrite(db);
  return {ok:true,user,alreadyActivated:false};
}
async function readRawBody(req){
  return await new Promise((resolve,reject)=>{let data=''; req.on('data',c=>{data+=c;if(data.length>2e6)req.destroy(new Error('Webhook payload too large.'));}); req.on('end',()=>resolve(data)); req.on('error',reject);});
}
function validFlutterwaveWebhook(rawBody,req){
  const modern=String(req.headers['flutterwave-signature']||'').trim();
  if(modern && FLW_WEBHOOK_SECRET_HASH){const expected=crypto.createHmac('sha256',FLW_WEBHOOK_SECRET_HASH).update(rawBody).digest('base64'); return Buffer.byteLength(modern)===Buffer.byteLength(expected)&&crypto.timingSafeEqual(Buffer.from(modern),Buffer.from(expected));}
  const legacy=String(req.headers['verif-hash']||'').trim();
  if(legacy && FLW_WEBHOOK_SECRET_HASH) return legacy===FLW_WEBHOOK_SECRET_HASH;
  return false;
}

function makeTool(tool, input) {
  const s = String(input || "").trim();
  if (tool === "ad") return `BIGJOE ADVERTISEMENT\n\n${s || "Your business"}\n\nQuality products. Great service. Fair prices.\nOrder today and experience the BIGJOE difference!\n\nCall/WhatsApp: [Your Number]\nLocation: [Your Location]`;
  if (tool === "reply") return `Customer Reply:\n\nHello! Thank you for contacting us. We appreciate your interest. ${s ? `Regarding "${s}", ` : ""}we will be happy to assist you. Please share the details you need and we will respond promptly.`;
  if (tool === "invoice") return `INVOICE\n\nBusiness: BIGJOE Business AI\nCustomer: ${s || "[Customer Name]"}\nDate: ${new Date().toLocaleDateString("en-NG")}\n\nItem/Service: [Description]\nQuantity: [Qty]\nUnit Price: ₦[Amount]\nTotal: ₦[Total]\n\nThank you for your business.`;
  const q=s.toLowerCase();
  if(q.includes('business plan')||q.includes('plan for')) return `BIGJOE BUSINESS PLAN\n\n1. Business idea\nDefine the product/service, target customer and the problem you solve.\n\n2. Target market\nFocus on customers who regularly need the product and are able and willing to pay.\n\n3. Sales strategy\nUse referrals, WhatsApp, social media, repeat-customer offers and clear pricing.\n\n4. Operations\nTrack stock, purchases, expenses, customer payments and daily sales in BIGJOE.\n\n5. Financial plan\nSet a startup budget, monthly expense limit, expected sales and target gross margin.\n\n6. First 30 days\nWeek 1: validate demand.\nWeek 2: launch and promote.\nWeek 3: review sales and customer feedback.\nWeek 4: improve the best-selling offer and control costs.\n\nIf you tell me the business type, location and available capital, I can make this plan more specific.`;
  if(q.includes('business idea')||q.includes('business ideas')) return `BUSINESS IDEAS\n\nHere are practical options to consider:\n\n• Food/snacks and small catering\n• Fashion/accessories resale\n• Phone accessories and basic device services\n• Cleaning services\n• Digital services such as graphic design and social-media management\n\nChoose based on your skills, local demand, starting capital and expected profit margin. Tell me your budget and location and I will narrow this to the best 5 options for you.`;
  if(q.includes('increase sales')||q.includes('more sales')||q.includes('sell more')) return `HOW TO INCREASE SALES\n\n• Identify your top-selling products and keep them in stock.\n• Follow up with existing customers instead of relying only on new customers.\n• Create simple bundle offers and loyalty rewards.\n• Promote your best products on WhatsApp and social media.\n• Compare your prices and margins regularly.\n• Track which marketing activities actually generate sales.\n\nBIGJOE can help you check your sales, customers, inventory and profit so your next decision is based on your records.`;
  if(q.includes('reduce')&&(q.includes('expense')||q.includes('cost'))) return `EXPENSE CONTROL\n\n• Review your largest expense categories first.\n• Set monthly budgets and monitor them before they are exceeded.\n• Compare supplier prices before major purchases.\n• Remove recurring costs that do not contribute to sales.\n• Separate business spending from personal spending.\n• Review expenses every week, not only at month end.\n\nUse BIGJOE Budget Control and Financial Centre to identify where spending is rising.`;
  return `BIGJOE BUSINESS ASSISTANT\n\nI understand your question: “${String(input).trim()}”\n\nI can help you with business ideas, business plans, sales growth, marketing, customer management, inventory, expenses, pricing and basic financial decisions.\n\nTry asking something specific, for example:\n• How can I increase sales?\n• Give me business ideas with ₦100,000.\n• Create a business plan for a fashion business.\n• How can I reduce my expenses?`;
}

function advisorBusinessContext(db, user) {
  const uid=user.id;
  const activeBranchId=user.active_branch_id||null;
  const activeBranch=(db.branches||[]).find(b=>b.id===activeBranchId&&b.user_id===uid);
  const sales=(db.sales||[]).filter(x=>x.user_id===uid && x.status!=="cancelled" && x.status!=="returned" && (!activeBranchId||x.branch_id===activeBranchId));
  const expenses=(db.expenses||[]).filter(x=>x.user_id===uid && (!activeBranchId||x.branch_id===activeBranchId));
  const products=(db.products||[]).filter(x=>x.user_id===uid);
  const customers=(db.customers||[]).filter(x=>x.user_id===uid);
  const purchases=(db.purchases||[]).filter(x=>x.user_id===uid);
  const today=new Date();
  const day=(d)=>String(d||'').slice(0,10);
  const key=today.toISOString().slice(0,10);
  const from=(n)=>{const d=new Date(today.getTime()-n*86400000);return d.toISOString().slice(0,10)};
  const inRange=(arr,start,end,getDate)=>arr.filter(x=>{const d=day(getDate(x));return d>=start&&d<=end});
  const summarize=(ss,ee)=>{
    const a=inRange(sales,ss,ee,x=>x.created_at);
    const ex=inRange(expenses,ss,ee,x=>x.date||x.created_at);
    const revenue=a.reduce((t,x)=>t+Number(x.total||0),0);
    const profit=a.reduce((t,x)=>t+Number(x.profit||0),0);
    const cost=a.reduce((t,x)=>t+Number(x.cost_total||x.cost||0),0);
    const exp=ex.reduce((t,x)=>t+Number(x.amount||0),0);
    return {sales:a.length,revenue:Number(revenue.toFixed(2)),gross_profit:Number(profit.toFixed(2)),cost:Number(cost.toFixed(2)),expenses:Number(exp.toFixed(2)),net_profit:Number((profit-exp).toFixed(2)),gross_margin:Number((revenue?profit/revenue*100:0).toFixed(2)),net_margin:Number((revenue?(profit-exp)/revenue*100:0).toFixed(2))};
  };
  const topMap={}; sales.forEach(x=>{(x.items||[]).forEach(i=>{const k=i.product_id||i.name||'item'; if(!topMap[k])topMap[k]={name:i.name||'Product',units:0,revenue:0,profit:0}; topMap[k].units+=Number(i.quantity||0);topMap[k].revenue+=Number(i.line_total||i.total||0);topMap[k].profit+=Number(i.profit||0);});});
  const topProducts=Object.values(topMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5).map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),profit:Number(x.profit.toFixed(2))}));
  const stock=products.map(p=>({name:p.name,stock:Number((activeBranchId?branchStockRow(db,user,activeBranchId,p.id,false)?.quantity:p.stock_quantity)||0),minimum:Number(p.low_stock_level||0),price:Number(p.selling_price||0),cost:Number(p.cost_price||0)})).sort((a,b)=>(a.stock-a.minimum)-(b.stock-b.minimum));
  const lowStock=stock.filter(x=>x.stock<=x.minimum).slice(0,8);
  const expenseMap={}; expenses.forEach(x=>{const k=x.category||'Other';expenseMap[k]=(expenseMap[k]||0)+Number(x.amount||0)});
  const topExpenses=Object.entries(expenseMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([category,amount])=>({category,amount:Number(amount.toFixed(2))}));
  const custMap={}; sales.forEach(x=>{if(!x.customer_id)return;const k=x.customer_id;if(!custMap[k])custMap[k]={name:x.customer_name||'Customer',orders:0,total:0};custMap[k].orders++;custMap[k].total+=Number(x.total||0)});
  const topCustomers=Object.values(custMap).sort((a,b)=>b.total-a.total).slice(0,5).map(x=>({...x,total:Number(x.total.toFixed(2))}));
  const todaySummary=summarize(key,key), week=summarize(from(6),key), month=summarize(new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10),key), last30=summarize(from(29),key);
  const branchMap={};
  sales.forEach(x=>{const bid=x.branch_id||x.branchId||'main';const bn=x.branch_name||x.branchName||((db.branches||[]).find(b=>b.id===bid)?.name)||'Main Branch';if(!branchMap[bid])branchMap[bid]={branch_id:bid,branch_name:bn,sales:0,revenue:0,gross_profit:0};branchMap[bid].sales++;branchMap[bid].revenue+=Number(x.total||0);branchMap[bid].gross_profit+=Number(x.profit||0);});
  const branchInsights=Object.values(branchMap).map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),gross_profit:Number(x.gross_profit.toFixed(2)),gross_margin:Number((x.revenue?x.gross_profit/x.revenue*100:0).toFixed(2))})).sort((a,b)=>b.revenue-a.revenue);
  const previousMonthStart=new Date(today.getFullYear(),today.getMonth()-1,1).toISOString().slice(0,10);
  const previousMonthEnd=new Date(today.getFullYear(),today.getMonth(),0).toISOString().slice(0,10);
  const previousMonth=summarize(previousMonthStart,previousMonthEnd);
  const pct=(a,b)=>b?Number(((a-b)/Math.abs(b)*100).toFixed(2)):null;
  const monthComparison={revenue_change_pct:pct(month.revenue,previousMonth.revenue),gross_profit_change_pct:pct(month.gross_profit,previousMonth.gross_profit),expense_change_pct:pct(month.expenses,previousMonth.expenses),net_profit_change_pct:pct(month.net_profit,previousMonth.net_profit)};
  return {business_name:user.business_profile?.business_name||'BIGJOE',active_branch:activeBranch?{id:activeBranch.id,name:activeBranch.name}:null,as_of:key,totals:{sales:sales.length,revenue:Number(sales.reduce((t,x)=>t+Number(x.total||0),0).toFixed(2)),customers:customers.length,products:products.length,purchases:purchases.length},periods:{today:todaySummary,last_7_days:week,this_month:month,last_30_days:last30,previous_month:previousMonth},month_comparison:monthComparison,branches:branchInsights,top_products:topProducts,low_stock:lowStock,top_expenses:topExpenses,top_customers:topCustomers};
}

function contextualFallback(message, ctx) {
  const q=String(message||'').toLowerCase(); const m=n=>moneyText(n);
  if(/how.*(business|perform|doing)|business.*(perform|doing)|overall/.test(q)){
    const x=ctx.periods.this_month;
    return `BIGJOE BUSINESS SNAPSHOT\n\nFor this month so far:\n• Sales: ${x.sales}\n• Revenue: ${m(x.revenue)}\n• Gross profit: ${m(x.gross_profit)}\n• Expenses: ${m(x.expenses)}\n• Net profit: ${m(x.net_profit)}\n• Gross margin: ${x.gross_margin.toFixed(1)}%\n\nMy first recommendation: focus on the areas with the biggest impact—sales volume, gross margin and your largest expense categories. Ask me “what should I do next?” and I will prioritize the actions.`;
  }
  if(/today|current sales|sales today/.test(q)) { const x=ctx.periods.today; return `TODAY'S SALES\n\n• Transactions: ${x.sales}\n• Revenue: ${m(x.revenue)}\n• Gross profit: ${m(x.gross_profit)}\n• Expenses recorded today: ${m(x.expenses)}\n• Net profit: ${m(x.net_profit)}\n\nThese figures are taken from your recorded BIGJOE transactions for today.`; }
  if(/profit|profitable|margin/.test(q)) { const x=ctx.periods.this_month; return `PROFITABILITY\n\nThis month so far:\n• Revenue: ${m(x.revenue)}\n• Gross profit: ${m(x.gross_profit)}\n• Expenses: ${m(x.expenses)}\n• Net profit: ${m(x.net_profit)}\n• Gross margin: ${x.gross_margin.toFixed(1)}%\n• Net margin: ${x.net_margin.toFixed(1)}%\n\nIf you want, ask “which products are most profitable?” for a product-level view.`; }
  if(/top|best.?sell|selling product|popular product/.test(q)) { const rows=ctx.top_products.map((x,i)=>`${i+1}. ${x.name} — ${x.units} units, ${m(x.revenue)} revenue`).join('\n'); return `TOP PRODUCTS\n\n${rows||'No sales have been recorded yet.'}\n\nUse this list to protect stock on your strongest products and review their margins before increasing purchases.`; }
  if(/stock|inventory|reorder|out of stock|low stock/.test(q)) { const rows=ctx.low_stock.map(x=>`• ${x.name}: ${x.stock} in stock (minimum ${x.minimum})`).join('\n'); return `INVENTORY ALERT\n\n${rows||'No products are currently at or below their minimum stock level.'}\n\n${rows?'Priority: review these items for replenishment and check supplier lead times.':'Continue monitoring stock levels and sales velocity.'}`; }
  if(/expense|cost|spending/.test(q)) { const rows=ctx.top_expenses.map(x=>`• ${x.category}: ${m(x.amount)}`).join('\n'); return `EXPENSE REVIEW\n\nLargest recorded expense categories:\n${rows||'No expenses have been recorded yet.'}\n\nStart with the largest category when looking for savings, but do not cut costs that directly protect sales or product availability.`; }
  if(/customer|customers/.test(q)) { const rows=ctx.top_customers.map((x,i)=>`${i+1}. ${x.name} — ${x.orders} orders, ${m(x.total)}`).join('\n'); return `CUSTOMER INSIGHT\n\n${rows||'No customer-linked sales have been recorded yet.'}\n\nYour highest-value customers deserve consistent follow-up, excellent service and relevant repeat-purchase offers.`; }
  if(/what.*(next|should i do|should i|important.*do)|priorit|recommend|advice|suggest|what.*important/.test(q)){
    const x=ctx.periods.this_month; const actions=[]; if(x.revenue===0)actions.push('Record sales consistently so BIGJOE can measure demand.'); if(x.gross_margin<20&&x.revenue>0)actions.push('Review product pricing and cost prices because the gross margin is below 20%.'); if(x.expenses>x.gross_profit&&x.revenue>0)actions.push('Review expenses urgently because they are exceeding gross profit.'); if(ctx.low_stock.length)actions.push(`Plan replenishment for ${ctx.low_stock[0].name} and other low-stock items.`); if(ctx.top_products.length)actions.push(`Keep ${ctx.top_products[0].name} available because it is your leading product by recorded revenue.`); if(!actions.length)actions.push('Keep recording accurate transactions and review sales, margins, expenses and stock every week.'); return `BIGJOE PRIORITY ACTIONS\n\n${actions.map((a,i)=>`${i+1}. ${a}`).join('\n')}\n\nThese recommendations are based on your recorded BIGJOE business data.`;
  }
  return null;
}

async function aiAnswer(message, user, db) {
  const ctx=advisorBusinessContext(db,user);
  const fallback=contextualFallback(message,ctx) || makeTool("assistant", message);
  const recent=(db.activity||[]).filter(x=>x.user_id===user.id&&x.action==='ai_assistant').sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).slice(-8).map(x=>({message:x.entity_id,answer:String(x.details||'').slice(0,1200)}));
  const q=String(message||'').toLowerCase();
  const branchAnswer=()=>{
    if(!ctx.branches.length)return null;
    const top=ctx.branches[0], bestMargin=[...ctx.branches].sort((a,b)=>b.gross_margin-a.gross_margin)[0];
    return `BRANCH PERFORMANCE\n\n${ctx.branches.map((b,i)=>`${i+1}. ${b.branch_name}: ${mfmt(b.revenue)} revenue, ${mfmt(b.gross_profit)} gross profit, ${b.gross_margin.toFixed(1)}% margin`).join('\n')}\n\nHighest revenue: ${top.branch_name}. Highest gross margin: ${bestMargin.branch_name}.`;
  };
  if(/which.*branch|branch.*(best|perform|highest|compare)|compare.*branch/.test(q)) { const b=branchAnswer(); if(b) return b; }
  if(/compare.*(month|last month)|last month|previous month|month.*change/.test(q)) {
    const c=ctx.month_comparison, f=v=>v===null?'N/A':`${v>=0?'+':''}${v.toFixed(1)}%`;
    return `MONTH COMPARISON\n\nRevenue: ${f(c.revenue_change_pct)}\nGross profit: ${f(c.gross_profit_change_pct)}\nExpenses: ${f(c.expense_change_pct)}\nNet profit: ${f(c.net_profit_change_pct)}\n\nThis comparison uses recorded BIGJOE transactions for this month versus the previous calendar month.`;
  }
  if(/why.*(profit|revenue|sales|expense)|profit.*(fall|drop|decreas)|revenue.*(fall|drop|decreas)/.test(q)) {
    const x=ctx.periods.this_month,p=ctx.periods.previous_month, reasons=[];
    if(x.revenue<p.revenue) reasons.push(`Revenue is down ${Math.abs(ctx.month_comparison.revenue_change_pct||0).toFixed(1)}% versus last month.`);
    if(x.gross_profit<p.gross_profit) reasons.push(`Gross profit is down ${Math.abs(ctx.month_comparison.gross_profit_change_pct||0).toFixed(1)}%.`);
    if(x.expenses>p.expenses) reasons.push(`Expenses are up ${Math.abs(ctx.month_comparison.expense_change_pct||0).toFixed(1)}%.`);
    if(x.gross_margin<p.gross_margin) reasons.push(`Gross margin has moved from ${p.gross_margin.toFixed(1)}% to ${x.gross_margin.toFixed(1)}%.`);
    if(!reasons.length) reasons.push('The available month-level figures do not show a clear deterioration. More transaction history may be needed for a reliable explanation.');
    return `WHY PERFORMANCE CHANGED\n\n${reasons.map((r,i)=>`${i+1}. ${r}`).join('\n')}\n\nLargest recorded expense categories: ${ctx.top_expenses.map(x=>`${x.category} (${mfmt(x.amount)})`).join(', ')||'none recorded'}.`;
  }
  if(/what.*(three|3).*important|three.*(things|actions)|most important/.test(q)) {
    const x=ctx.periods.this_month, a=[];
    if(ctx.low_stock.length)a.push(`Restock ${ctx.low_stock[0].name} and review the other ${ctx.low_stock.length-1>0?ctx.low_stock.length-1+' low-stock item(s)':''}.`);
    if(x.expenses>x.gross_profit&&x.revenue>0)a.push('Review major expenses because recorded expenses exceed gross profit this month.');
    else if(ctx.top_expenses.length)a.push(`Review ${ctx.top_expenses[0].category}, your largest recorded expense category.`);
    if(x.revenue===0)a.push('Record sales consistently before making major growth decisions.');
    else if(x.gross_margin<20)a.push('Review pricing and supplier costs because gross margin is below 20%.');
    else if(ctx.top_products.length)a.push(`Protect stock and promote ${ctx.top_products[0].name}, your leading product by recorded revenue.`);
    while(a.length<3)a.push('Review the Command Center weekly and convert important recommendations into tracked tasks.');
    return `TOP 3 PRIORITIES\n\n${a.slice(0,3).map((v,i)=>`${i+1}. ${v}`).join('\n')}\n\nThese priorities are generated from your current BIGJOE records.`;
  }
  if (!OPENAI_API_KEY) return fallback;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers: {"Authorization":`Bearer ${OPENAI_API_KEY}`, "Content-Type":"application/json"},
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {role:"system", content:`You are BIGJOE, a practical Nigerian small-business advisor. Answer in simple language for a non-accountant. Use NGN for money. Use only the supplied business data for claims about the user's business. If data is missing, say so. Do not invent sales, customers, products, branches or financial figures. When the user asks a follow-up such as “why?” or “what about it?”, use the recent conversation context. Distinguish facts from recommendations. Do not claim an action was completed unless the system confirms it. Give concise, actionable recommendations. Business data snapshot:\n${JSON.stringify(ctx)}\nRecent BIGJOE conversation:\n${JSON.stringify(recent)}`},
        {role:"user", content:message}
      ],
      temperature:0.2
    })
  });
  const data = await r.json();
  if (!r.ok) return fallback;
  return data.choices?.[0]?.message?.content || fallback;
}
function mfmt(n){return moneyText(Number(n||0));}


function loyaltyConfig(user){
  const p=user.business_profile||{}; const l=p.loyalty||{};
  return {points_per_naira:Math.max(0,Number(l.points_per_naira??0.001)),bronze:Math.max(0,Number(l.bronze??0)),silver:Math.max(0,Number(l.silver??500)),gold:Math.max(0,Number(l.gold??1500)),platinum:Math.max(0,Number(l.platinum??3000))};
}
function loyaltyLevel(points,c){if(points>=c.platinum)return 'Platinum';if(points>=c.gold)return 'Gold';if(points>=c.silver)return 'Silver';return 'Bronze';}
function awardLoyalty(db,user,sale){
  if(!sale.customer_id || Number(sale.total||0)<=0) return 0;
  const cfg=loyaltyConfig(user), pts=Math.floor(Number(sale.total||0)*cfg.points_per_naira);
  if(pts<=0)return 0;
  db.loyalty_ledger.push({id:id(),user_id:user.id,customer_id:sale.customer_id,sale_id:sale.id,type:'earn',points:pts,amount:Number(sale.total||0),description:`Points earned from ${sale.invoice_no}`,created_at:now()});
  return pts;
}
async function route(req, res) {
  const url = new URL(req.url, BASE_URL);
  const db = dbRead();
  const method = req.method;
  const requiredPermission=permissionForPath(method,url.pathname); if(requiredPermission && currentStaff(req,db) && !staffCan(currentStaff(req,db),requiredPermission)){ return json(res,403,{error:`Your staff role does not have permission for this feature.`}); }

  if (method === "GET" && url.pathname === "/api/health")
    return json(res,200,{app:"BIGJOE Business AI",version:"58.2",status:"ready"});

  if (method === "GET" && url.pathname === "/api/network-info") {
    const nets=os.networkInterfaces(), addresses=[];
    for (const list of Object.values(nets)) for (const n of (list||[])) {
      if (n.family === "IPv4" && !n.internal) addresses.push(n.address);
    }
    return json(res,200,{port:PORT,addresses:[...new Set(addresses)],lan_urls:[...new Set(addresses)].map(ip=>`http://${ip}:${PORT}`)});
  }

  if (method === "POST" && url.pathname === "/api/register") {
    try {
      const b = await body(req);
      const name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
      if (name.length<2 || !email.includes("@") || password.length<6) return json(res,400,{error:"Enter a valid name, email and password of at least 6 characters."});
      if (db.users.some(u=>u.email===email)) return json(res,409,{error:"Email already registered."});
      const user={id:id(),name,email,password_hash:passwordHash(password),plan:"free",created_at:now(),business_profile:{business_name:"BIGJOE",phone:"",address:"",email,tagline:"Smart business management with BIGJOE."}};
      db.users.push(user); dbWrite(db);
      const token=id(); db.sessions.push({token,userId:user.id,created_at:now()}); dbWrite(db);
      setCookie(res,"bigjoe_session",token);
      return json(res,201,{success:true,user:safeUser(user)});
    } catch(e) { return json(res,400,{error:e.message}); }
  }

  if (method === "POST" && url.pathname === "/api/login") {
    try {
      const b=await body(req), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
      if (!email || !password) return json(res,400,{error:"Please enter your email address and password."});
      if (!Array.isArray(db.users) || db.users.length===0) {
        return json(res,503,{error:"No BIGJOE owner account was found in the current data/db.json. If you are upgrading an existing installation, copy your previous data/db.json into this version before logging in. Your existing account has not been deleted."});
      }
      const user=db.users.find(u=>String(u.email||"").trim().toLowerCase()===email);
      if (user) {
        if (!passwordVerify(password,user.password_hash)) return json(res,401,{error:"The account was found, but the password did not match. Check your password and make sure you are using the same BIGJOE data/db.json from your previous version."});
        const token=id(); db.sessions=db.sessions.filter(s=>s.userId!==user.id); db.sessions.push({token,userId:user.id,created_at:now(),actor:'owner'}); dbWrite(db);
        setCookie(res,"bigjoe_session",token);
        activity(db,user.id,'login','owner','Business owner logged in successfully.'); dbWrite(db);
        return json(res,200,{success:true,user:safeUser(user),actor:{type:'owner',role:'owner'}});
      }
      const staff=(db.staff||[]).find(x=>String(x.email||"").trim().toLowerCase()===email && x.active!==false);
      if(!staff || !passwordVerify(password,staff.password_hash)) return json(res,401,{error:"Invalid email or password. Please check your login details."});
      const owner=db.users.find(u=>u.id===staff.owner_user_id);
      if(!owner) return json(res,401,{error:"This staff account is no longer linked to a business owner."});
      const token=id(); db.sessions.push({token,userId:owner.id,staffId:staff.id,created_at:now(),actor:'staff'}); dbWrite(db);
      setCookie(res,"bigjoe_session",token);
      activity(db,owner.id,'staff_login',staff.name,`Staff member ${staff.name} logged in as ${staff.role}.`); dbWrite(db);
      return json(res,200,{success:true,user:safeUser(owner),actor:{type:'staff',role:staff.role,name:staff.name,permissions:staff.permissions||[]}});
    } catch(e) { return json(res,400,{error:e.message}); }
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    const token=parseCookies(req).bigjoe_session;
    const logoutUser=currentUser(req,db); db.sessions=db.sessions.filter(s=>s.token!==token); if(logoutUser) activity(db,logoutUser.id,'logout','session','User logged out of BIGJOE.'); dbWrite(db); clearCookie(res,"bigjoe_session");
    return json(res,200,{success:true});
  }

  if (method === "GET" && url.pathname === "/api/me") {
    const u=currentUser(req,db); return json(res,200,{user:u?safeUser(u):null});
  }


  // ---------- Security, Reliability & Commercial Readiness v51.0 ----------
  if(method==='GET' && url.pathname==='/api/system-health'){
    const u=requireUser(req,res,db); if(!u)return;
    const staff=currentStaff(req,db);
    const ownerOnly=!staff;
    const scopedStaff=(db.staff||[]).filter(x=>x.owner_user_id===u.id);
    const ownerBranches=(db.branches||[]).filter(x=>x.user_id===u.id);
    const own=(arr)=>Array.isArray(arr)?arr.filter(x=>x.user_id===u.id):[];
    const sales=own(db.sales), products=own(db.products), customers=own(db.customers), expenses=own(db.expenses), entries=own(db.accounting_entries);
    const checks=[];
    checks.push({key:'database',label:'Business database',status:'ok',detail:`${products.length} products, ${customers.length} customers and ${sales.length} sales records loaded.`});
    checks.push({key:'authentication',label:'Authentication',status:(u&&u.id)?'ok':'error',detail:staff?`Signed in as staff (${staff.role}).`:'Business owner session is active.'});
    const staleSessions=(db.sessions||[]).filter(x=>x.userId===u.id && x.expires && new Date(x.expires)<new Date()).length;
    checks.push({key:'sessions',label:'Session hygiene',status:staleSessions>10?'warn':'ok',detail:`${staleSessions} expired session record${staleSessions===1?'':'s'} found.`});
    const inactive=scopedStaff.filter(x=>x.active===false).length;
    checks.push({key:'staff',label:'Staff access',status:inactive?'warn':'ok',detail:`${scopedStaff.length} staff accounts; ${inactive} inactive.`});
    const orphanProducts=products.filter(x=>x.id==null || !x.name).length;
    const badSales=sales.filter(x=>!x.id || !Array.isArray(x.items) || Number(x.total)<0).length;
    checks.push({key:'data-integrity',label:'Core data integrity',status:(orphanProducts||badSales)?'warn':'ok',detail:(orphanProducts||badSales)?`${orphanProducts} product issue(s), ${badSales} sale issue(s) detected.`:'No obvious core-record integrity issues detected.'});
    const unbalanced=entries.reduce((a,x)=>a+Number(x.amount||0),0);
    checks.push({key:'accounting',label:'Accounting records',status:'ok',detail:`${entries.length} accounting entries available for this business.`});
    checks.push({key:'branches',label:'Branch configuration',status:ownerBranches.length?'ok':'warn',detail:`${ownerBranches.length} active/available branch record${ownerBranches.length===1?'':'s'}.`});
    return json(res,200,{generated_at:now(),owner_only:ownerOnly,summary:{products:products.length,customers:customers.length,sales:sales.length,expenses:expenses.length,accounting_entries:entries.length,staff:scopedStaff.length,branches:ownerBranches.length},checks});
  }
  if(method==='GET' && url.pathname==='/api/security-review'){
    const u=requireUser(req,res,db); if(!u)return;
    if(currentStaff(req,db)) return json(res,403,{error:'Only the business owner can review security settings.'});
    const staff=(db.staff||[]).filter(x=>x.owner_user_id===u.id);
    const inactive=staff.filter(x=>x.active===false);
    const allPerms=staff.reduce((a,x)=>a.concat(Array.isArray(x.permissions)?x.permissions:[]),[]);
    const wildcard=staff.filter(x=>Array.isArray(x.permissions)&&x.permissions.includes('*'));
    const review=[];
    review.push({level:inactive.length?'warn':'ok',title:'Inactive staff accounts',detail:inactive.length?`${inactive.length} inactive account(s) remain in the system.`:'No inactive staff accounts detected.'});
    review.push({level:wildcard.length?'warn':'ok',title:'Wildcard permissions',detail:wildcard.length?`${wildcard.length} staff account(s) have unrestricted permissions.`:'No staff wildcard permissions detected.'});
    review.push({level:staff.length?'ok':'info',title:'Individual staff access',detail:staff.length?`${staff.length} staff login(s) are configured with role-based access.`:'No staff accounts have been configured yet.'});
    review.push({level:'ok',title:'Credential storage',detail:'Passwords are stored as hashes; plaintext passwords are not included in backups or audit exports.'});
    review.push({level:'ok',title:'Audit trail',detail:`${(db.activity||[]).filter(x=>x.user_id===u.id).length} owner-linked activity record(s) are available.`});
    return json(res,200,{generated_at:now(),review,summary:{staff:staff.length,inactive:inactive.length,wildcard:wildcard.length}});
  }
  if(method==='POST' && url.pathname==='/api/system-health/cleanup-sessions'){
    const u=requireUser(req,res,db); if(!u)return;
    if(currentStaff(req,db)) return json(res,403,{error:'Only the business owner can clean expired sessions.'});
    const before=(db.sessions||[]).length; const t=Date.now(); db.sessions=(db.sessions||[]).filter(x=>!(x.userId===u.id && x.expires && new Date(x.expires).getTime()<t)); const removed=before-db.sessions.length;
    activity(db,u.id,'security',u.id,`Removed ${removed} expired session record${removed===1?'':'s'}.`); dbWrite(db); return json(res,200,{success:true,removed});
  }
  // ---------- Data Protection & Audit Centre v40.0 ----------
  if(method==='GET' && url.pathname==='/api/data-audit'){
    const u=requireUser(req,res,db); if(!u)return;
    const st=currentStaff(req,db); if(st) return json(res,403,{error:'Only the business owner can access the Data Protection & Audit Centre.'});
    const search=String(url.searchParams.get('search')||'').trim().toLowerCase();
    const tool=String(url.searchParams.get('tool')||'').trim();
    const start=String(url.searchParams.get('start')||'').slice(0,10), end=String(url.searchParams.get('end')||'').slice(0,10);
    let rows=(db.activity||[]).filter(x=>x.user_id===u.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    if(tool) rows=rows.filter(x=>x.tool===tool);
    if(start) rows=rows.filter(x=>String(x.created_at).slice(0,10)>=start);
    if(end) rows=rows.filter(x=>String(x.created_at).slice(0,10)<=end);
    if(search) rows=rows.filter(x=>[x.tool,x.input_text,x.output_text].some(v=>String(v||'').toLowerCase().includes(search)));
    rows=rows.slice(0,300).map(x=>({...x,user_name:u.name||'Business Owner'}));
    const products=(db.products||[]).filter(x=>x.user_id===u.id), customers=(db.customers||[]).filter(x=>x.user_id===u.id), sales=(db.sales||[]).filter(x=>x.user_id===u.id), branches=(db.branches||[]).filter(x=>x.user_id===u.id);
    const today=new Date(); const expired=products.filter(x=>x.expiry_date && new Date(x.expiry_date+'T23:59:59')<today).length;
    const low_stock=products.filter(x=>Number(x.stock_quantity||0)<=Number(x.low_stock_level||0)).length;
    return json(res,200,{activity:rows,health:{products:products.length,customers:customers.length,sales:sales.length,branches:branches.length,low_stock,expired,last_activity:rows[0]?.created_at||null},protection:{status:'Protected',audit_records:Math.min((db.activity||[]).filter(x=>x.user_id===u.id).length,1000),backup_safe_fields:true}});
  }
  if(method==='GET' && url.pathname==='/api/data-audit/backup'){
    const u=requireUser(req,res,db); if(!u)return; if(currentStaff(req,db)) return json(res,403,{error:'Only the business owner can download a business backup.'});
    const safe=JSON.parse(JSON.stringify(db));
    delete safe.sessions;
    delete safe.staff;
    delete safe.users;
    for(const key of Object.keys(safe)) if(Array.isArray(safe[key])) safe[key]=safe[key].filter(x=>x.user_id===u.id || x.owner_user_id===u.id || !('user_id' in x));
    if(Array.isArray(safe.payment_integrations)) safe.payment_integrations=safe.payment_integrations.map(x=>({...x,secret_key:'[REDACTED]',api_key:'[REDACTED]'}));
    const payload={app:'BIGJOE Business AI',version:'58.2',backup_created_at:now(),business_owner:{id:u.id,name:u.name,email:u.email},data:safe};
    const bodyText=JSON.stringify(payload,null,2); res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="BIGJOE_business_backup_${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'no-store'}); res.end(bodyText);
    return;
  }
  if(method==='GET' && url.pathname==='/api/data-audit/export'){
    const u=requireUser(req,res,db); if(!u)return; if(currentStaff(req,db)) return json(res,403,{error:'Only the business owner can export audit records.'});
    const rows=(db.activity||[]).filter(x=>x.user_id===u.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const csv=[['Date & Time','User','Module','Action / Reference','Details'],...rows.map(x=>[x.created_at,u.name||'Business Owner',x.tool||'',x.input_text||'',x.output_text||''])].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="BIGJOE_audit_log_${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'no-store'});res.end(csv);return;
  }

  if (method === "GET" && url.pathname === "/api/plans") {
    const u=currentUser(req,db);
    const subCfg=getSubscriptionFlutterwaveConfig(db,u,!currentStaff(req,db));
    return json(res,200,{plans:PLANS,current_plan:u?.plan||'free',subscription_status:u?.subscription_status||((u?.plan&&u.plan!=='free')?'active':'free'),subscription_plan:u?.subscription_plan||null,subscription_expires_at:u?.subscription_expires_at||null,recurring_available:{business:Boolean(flutterwavePlanId('business')),pro:Boolean(flutterwavePlanId('pro'))},subscription_gateway:{provider:'flutterwave',configured:Boolean(subCfg.secret_key),mode:subCfg.mode,source:subCfg.source}});
  }

  if (method === "GET" && url.pathname === "/api/subscriptions/flutterwave/connection") {
    const u=requireUser(req,res,db); if(!u)return;
    const cfg=getSubscriptionFlutterwaveConfig(db,u,!currentStaff(req,db));
    if(!cfg.secret_key) return json(res,200,{configured:false,connected:false,mode:cfg.mode,message:'BIGJOE subscription Flutterwave credentials are not configured. Configure Flutterwave in Payment Hub or add FLW_SUBSCRIPTION_SECRET_KEY to .env.'});
    try {
      const r=await gatewayRequest('https://api.flutterwave.com/v3/balances',cfg.secret_key);
      return json(res,200,{configured:true,connected:r.ok&&r.data?.status==='success',mode:cfg.mode,message:r.ok?'BIGJOE subscription checkout is connected.':'BIGJOE subscription checkout could not be verified.'});
    } catch(e) {
      return json(res,200,{configured:true,connected:false,mode:cfg.mode,message:e.message});
    }
  }

  // ---------- Staff, Roles & Permissions ----------
  if (method === "GET" && url.pathname === "/api/staff") {
    const u=requireUser(req,res,db); if(!u)return; if(!requirePermission(req,res,db,'staff'))return;
    ensureBranches(db,u);
    const rows=(db.staff||[]).filter(x=>x.owner_user_id===u.id).map(x=>({id:x.id,name:x.name,email:x.email,role:x.role,active:x.active!==false,branch_id:x.branch_id||null,permissions:x.permissions||[],created_at:x.created_at}));
    return json(res,200,{staff:rows,roles:Object.keys(ROLE_PERMISSIONS).filter(x=>x!=='owner'),branches:db.branches.filter(x=>x.user_id===u.id)});
  }
  if (method === "POST" && url.pathname === "/api/staff") {
    const u=requireUser(req,res,db); if(!u)return; if(!requirePermission(req,res,db,'staff'))return;
    try { const b=await body(req); const name=String(b.name||'').trim(), email=String(b.email||'').trim().toLowerCase(), password=String(b.password||''); const role=String(b.role||'cashier');
      if(name.length<2 || !email.includes('@') || password.length<6) return json(res,400,{error:'Enter staff name, valid email and password of at least 6 characters.'});
      if(!ROLE_PERMISSIONS[role] || role==='owner') return json(res,400,{error:'Select a valid staff role.'});
      if((db.staff||[]).some(x=>x.email===email)) return json(res,409,{error:'A staff account with this email already exists.'});
      ensureBranches(db,u); const branchId=b.branch_id?String(b.branch_id):null; if(branchId && !db.branches.some(x=>x.id===branchId&&x.user_id===u.id&&x.active!==false)) return json(res,400,{error:'Selected branch is not available.'});
      const st={id:id(),owner_user_id:u.id,name,email,role,password_hash:passwordHash(password),branch_id:branchId,permissions:Array.isArray(b.permissions)&&b.permissions.length?b.permissions:ROLE_PERMISSIONS[role].slice(),active:true,created_at:now(),updated_at:now()}; db.staff.push(st); dbWrite(db);
      return json(res,201,{success:true,staff:{id:st.id,name:st.name,email:st.email,role:st.role,active:true,branch_id:st.branch_id,permissions:st.permissions}});
    } catch(e){return json(res,400,{error:e.message})}
  }
  if (method === "PUT" && url.pathname.startsWith("/api/staff/")) {
    const u=requireUser(req,res,db); if(!u)return; if(!requirePermission(req,res,db,'staff'))return;
    const sid=url.pathname.split('/').pop(); const st=(db.staff||[]).find(x=>x.id===sid&&x.owner_user_id===u.id); if(!st)return json(res,404,{error:'Staff member not found.'});
    try { const b=await body(req); if(b.name!==undefined)st.name=String(b.name||'').trim().slice(0,100); if(b.role!==undefined){if(!ROLE_PERMISSIONS[b.role]||b.role==='owner')return json(res,400,{error:'Invalid role.'});st.role=b.role; if(!Array.isArray(b.permissions))st.permissions=ROLE_PERMISSIONS[b.role].slice();} if(Array.isArray(b.permissions))st.permissions=b.permissions; if(b.branch_id!==undefined){const bid=b.branch_id?String(b.branch_id):null;if(bid&&!db.branches.some(x=>x.id===bid&&x.user_id===u.id&&x.active!==false))return json(res,400,{error:'Selected branch is not available.'});st.branch_id=bid;} if(b.active!==undefined)st.active=b.active!==false; if(b.password){if(String(b.password).length<6)return json(res,400,{error:'Password must be at least 6 characters.'});st.password_hash=passwordHash(String(b.password));} st.updated_at=now(); dbWrite(db); return json(res,200,{success:true}); }catch(e){return json(res,400,{error:e.message})}
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/staff/")) {
    const u=requireUser(req,res,db); if(!u)return; if(!requirePermission(req,res,db,'staff'))return; const sid=url.pathname.split('/').pop(); const st=(db.staff||[]).find(x=>x.id===sid&&x.owner_user_id===u.id); if(!st)return json(res,404,{error:'Staff member not found.'}); db.staff=db.staff.filter(x=>x.id!==sid); db.sessions=db.sessions.filter(x=>x.staffId!==sid); dbWrite(db); return json(res,200,{success:true});
  }
  if (method === "GET" && url.pathname === "/api/actor") {
    const u=currentUser(req,db); if(!u)return json(res,401,{error:'Please log in first.'}); const st=currentStaff(req,db); return json(res,200,{actor:st?{type:'staff',name:st.name,role:st.role,permissions:st.permissions||[],branch_id:st.branch_id}: {type:'owner',name:u.name,role:'owner',permissions:['*'],branch_id:null}});
  }

  // ---------- Business Profile ----------
  if (method === "GET" && url.pathname === "/api/business-profile") {
    const u=requireUser(req,res,db); if(!u)return;
    const profile={business_name:"BIGJOE",phone:"",address:"",email:u.email,tagline:"Smart business management with BIGJOE.",logo_data_url:"",show_logo:true,show_owner_name:true,show_branding:true,show_contact_info:true,...(u.business_profile||{})};
    return json(res,200,{profile});
  }

  if (method === "PUT" && url.pathname === "/api/business-profile") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req);
      const profile={
        business_name:String(b.business_name||"BIGJOE").trim().slice(0,100) || "BIGJOE",
        phone:String(b.phone||"").trim().slice(0,40),
        address:String(b.address||"").trim().slice(0,180),
        email:String(b.email||u.email).trim().slice(0,120),
        tagline:String(b.tagline||"").trim().slice(0,180),
        logo_data_url:String(b.logo_data_url||"").trim().slice(0,700000),
        show_logo:b.show_logo!==false,
        show_owner_name:b.show_owner_name!==false,
        show_branding:b.show_branding!==false,
        show_contact_info:b.show_contact_info!==false
      };
      if(profile.logo_data_url && !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(profile.logo_data_url)) profile.logo_data_url="";
      u.business_profile=profile;
      dbWrite(db);
      return json(res,200,{success:true,profile,user:safeUser(u)});
    } catch(e) { return json(res,400,{error:e.message}); }
  }


  // ---------- v55 Business Onboarding & Commercial Readiness ----------
  if (method === "GET" && url.pathname === "/api/onboarding/status") {
    const u=requireUser(req,res,db); if(!u)return;
    const profile=u.business_profile||{};
    const products=(db.products||[]).filter(x=>x.user_id===u.id);
    const customers=(db.customers||[]).filter(x=>x.user_id===u.id);
    const branches=(db.branches||[]).filter(x=>x.user_id===u.id&&x.active!==false);
    const staff=(db.staff||[]).filter(x=>x.owner_user_id===u.id&&x.active!==false);
    const integrations=(db.payment_integrations||[]).filter(x=>x.user_id===u.id&&x.secret_key);
    const checks=[
      {id:'profile',label:'Complete business profile',done:Boolean(String(profile.business_name||'').trim()&&String(profile.phone||'').trim()&&String(profile.address||'').trim())},
      {id:'logo',label:'Add business logo',done:Boolean(profile.logo_data_url)},
      {id:'product',label:'Add your first product',done:products.length>0},
      {id:'customer',label:'Add your first customer',done:customers.length>0},
      {id:'branch',label:'Set up a branch',done:branches.length>0},
      {id:'payment',label:'Configure a receiving payment account',done:integrations.length>0},
      {id:'staff',label:'Add a staff member',done:staff.length>0},
      {id:'plan',label:'Review your subscription plan',done:Boolean(u.plan&&u.plan!=='free')}
    ];
    const completed=checks.filter(x=>x.done).length;
    return json(res,200,{plan:u.plan||'free',checks,completed,total:checks.length,percent:Math.round(completed/checks.length*100),counts:{products:products.length,customers:customers.length,branches:branches.length,staff:staff.length,payment_integrations:integrations.length}});
  }

  // ---------- Multi-Branch Management ----------
  if(method==='GET'&&url.pathname==='/api/branches'){
    const u=requireUser(req,res,db);if(!u)return; const branches=ensureBranches(db,u); const activeId=u.active_branch_id||branches.find(b=>b.is_default)?.id||branches[0]?.id; if(u.active_branch_id!==activeId){u.active_branch_id=activeId;dbWrite(db);}
    return json(res,200,{branches:branches.sort((a,b)=>String(a.name).localeCompare(String(b.name))),active_branch_id:activeId});
  }
  if(method==='POST'&&url.pathname==='/api/branches'){
    const u=requireUser(req,res,db);if(!u)return; const b=await body(req); const name=String(b.name||'').trim().slice(0,100); if(name.length<2)return json(res,400,{error:'Branch name is required.'}); ensureBranches(db,u); if(db.branches.some(x=>x.user_id===u.id&&x.name.toLowerCase()===name.toLowerCase()))return json(res,409,{error:'A branch with this name already exists.'}); const branch={id:id(),user_id:u.id,name,code:String(b.code||'').trim().slice(0,20).toUpperCase()||`BR${db.branches.filter(x=>x.user_id===u.id).length+1}`,address:String(b.address||'').trim().slice(0,180),phone:String(b.phone||'').trim().slice(0,40),active:true,is_default:false,created_at:now(),updated_at:now()};db.branches.push(branch);dbWrite(db);return json(res,201,{success:true,branch});
  }
  if(method==='PUT'&&url.pathname.match(/^\/api\/branches\/[^/]+$/)){
    const u=requireUser(req,res,db);if(!u)return; const bid=url.pathname.split('/').pop(),branch=db.branches.find(x=>x.id===bid&&x.user_id===u.id);if(!branch)return json(res,404,{error:'Branch not found.'});const b=await body(req);if(b.name!==undefined){const name=String(b.name||'').trim();if(name.length<2)return json(res,400,{error:'Branch name is required.'});branch.name=name.slice(0,100);}if(b.code!==undefined)branch.code=String(b.code||'').trim().slice(0,20).toUpperCase();if(b.address!==undefined)branch.address=String(b.address||'').trim().slice(0,180);if(b.phone!==undefined)branch.phone=String(b.phone||'').trim().slice(0,40);if(b.active!==undefined)branch.active=b.active!==false;if(branch.active===false&&u.active_branch_id===branch.id)u.active_branch_id=(db.branches.find(x=>x.user_id===u.id&&x.active!==false&&x.id!==branch.id)?.id);branch.updated_at=now();dbWrite(db);return json(res,200,{success:true,branch});
  }
  if(method==='DELETE'&&url.pathname.match(/^\/api\/branches\/[^/]+$/)){
    const u=requireUser(req,res,db);if(!u)return;ensureBranches(db,u);const bid=url.pathname.split('/').pop(),branch=db.branches.find(x=>x.id===bid&&x.user_id===u.id);if(!branch)return json(res,404,{error:'Branch not found.'});const count=db.branches.filter(x=>x.user_id===u.id&&x.active!==false).length;if(count<=1)return json(res,400,{error:'You must keep at least one active branch.'});if(branch.is_default)return json(res,400,{error:'The default branch cannot be deleted. You can deactivate it instead.'});const replacement=db.branches.find(x=>x.user_id===u.id&&x.active!==false&&x.id!==bid);for(const key of ['sales','expenses','purchases','receivable_payments','supplier_payments','invoices','quotations','accounting_entries','marketing_campaigns','loyalty_ledger','loyalty_redemptions']){for(const row of (db[key]||[]).filter(x=>x.user_id===u.id&&x.branch_id===bid))row.branch_id=replacement.id;}db.branch_stock=(db.branch_stock||[]).filter(x=>!(x.user_id===u.id&&x.branch_id===bid));db.branch_transfers=(db.branch_transfers||[]).filter(x=>!(x.user_id===u.id&&(x.from_branch_id===bid||x.to_branch_id===bid)));db.branches=db.branches.filter(x=>x.id!==bid);if(u.active_branch_id===bid)u.active_branch_id=replacement.id;dbWrite(db);return json(res,200,{success:true});
  }
  if(method==='POST'&&url.pathname==='/api/branches/select'){
    const u=requireUser(req,res,db);if(!u)return;const b=await body(req),branch=getBranch(db,u,b.branch_id);if(!branch)return json(res,404,{error:'Branch not found.'});u.active_branch_id=branch.id;dbWrite(db);return json(res,200,{success:true,active_branch_id:branch.id,branch});
  }
  if(method==='GET'&&url.pathname==='/api/branches/dashboard'){
    const u=requireUser(req,res,db);if(!u)return;const branches=ensureBranches(db,u);const requested=url.searchParams.get('branch_id');const branch=getBranch(db,u,requested);const bid=branch.id;
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.branch_id===bid&&x.status!=='cancelled'&&x.status!=='returned');
    const returns=(db.sales_returns||[]).filter(x=>x.user_id===u.id&&x.branch_id===bid); const expenses=db.expenses.filter(x=>x.user_id===u.id&&x.branch_id===bid); const purchases=db.purchases.filter(x=>x.user_id===u.id&&x.branch_id===bid); const products=db.products.filter(x=>x.user_id===u.id); const stock=products.map(p=>{const r=branchStockRow(db,u,bid,p.id,false);return {...p,branch_quantity:Number(r?.quantity||0),branch_stock_value:Number((Number(r?.quantity||0)*Number(p.cost_price||0)).toFixed(2))};});
    const revenue=sales.reduce((a,x)=>a+Number(x.total||0),0),profit=sales.reduce((a,x)=>a+Number(x.profit||0),0),expenseTotal=expenses.reduce((a,x)=>a+Number(x.amount||0),0),purchaseTotal=purchases.reduce((a,x)=>a+Number(x.total||0),0);
    const branchRows=branches.filter(b=>b.active!==false).map(b=>{const ss=db.sales.filter(x=>x.user_id===u.id&&x.branch_id===b.id&&x.status==='completed');const ee=db.expenses.filter(x=>x.user_id===u.id&&x.branch_id===b.id);return {id:b.id,name:b.name,revenue:Number(ss.reduce((a,x)=>a+Number(x.total||0),0).toFixed(2)),profit:Number(ss.reduce((a,x)=>a+Number(x.profit||0),0).toFixed(2)),expenses:Number(ee.reduce((a,x)=>a+Number(x.amount||0),0).toFixed(2)),sales_count:ss.length};}).sort((a,b)=>b.revenue-a.revenue);
    return json(res,200,{branch,summary:{revenue:Number(revenue.toFixed(2)),gross_profit:Number(profit.toFixed(2)),expenses:Number(expenseTotal.toFixed(2)),net_profit:Number((profit-expenseTotal).toFixed(2)),purchases:Number(purchaseTotal.toFixed(2)),sales_count:sales.length,inventory_value:Number(stock.reduce((a,p)=>a+p.branch_stock_value,0).toFixed(2)),low_stock:stock.filter(p=>Number(p.branch_quantity)<=Number(p.low_stock_level||0)).length},inventory:stock.sort((a,b)=>a.branch_quantity-b.branch_quantity).slice(0,30),branches:branchRows});
  }
  if(method==='GET'&&url.pathname==='/api/branches/consolidated'){
    const u=requireUser(req,res,db);if(!u)return; ensureBranches(db,u);
    const branches=db.branches.filter(x=>x.user_id===u.id&&x.active!==false);
    const endRaw=url.searchParams.get('to'); const startRaw=url.searchParams.get('from');
    const end=endRaw?new Date(endRaw+'T23:59:59'):new Date();
    const start=startRaw?new Date(startRaw+'T00:00:00'):new Date(end.getFullYear(),end.getMonth(),1);
    const inRange=d=>{const x=new Date(d);return x>=start&&x<=end;};
    const rows=branches.map(b=>{
      const sales=db.sales.filter(x=>x.user_id===u.id&&x.branch_id===b.id&&x.status==='completed'&&inRange(x.created_at));
      const expenses=db.expenses.filter(x=>x.user_id===u.id&&x.branch_id===b.id&&inRange(x.date||x.created_at));
      const purchases=db.purchases.filter(x=>x.user_id===u.id&&x.branch_id===b.id&&inRange(x.created_at));
      const stock=(db.products||[]).filter(x=>x.user_id===u.id).reduce((sum,p)=>{const r=branchStockRow(db,u,b.id,p.id,false);return sum+Number(r?.quantity||0)*Number(p.cost_price||0)},0);
      const revenue=sales.reduce((a,x)=>a+Number(x.total||0),0),profit=sales.reduce((a,x)=>a+Number(x.profit||0),0),expense=expenses.reduce((a,x)=>a+Number(x.amount||0),0),purchase=purchases.reduce((a,x)=>a+Number(x.total||0),0);
      return {branch_id:b.id,branch_name:b.name,sales:sales.length,revenue:Number(revenue.toFixed(2)),gross_profit:Number(profit.toFixed(2)),expenses:Number(expense.toFixed(2)),net_profit:Number((profit-expense).toFixed(2)),purchases:Number(purchase.toFixed(2)),inventory_value:Number(stock.toFixed(2)),margin:Number(revenue?((profit/revenue)*100).toFixed(1):0)};
    });
    const totals=rows.reduce((a,r)=>{for(const k of ['sales','revenue','gross_profit','expenses','net_profit','purchases','inventory_value'])a[k]+=Number(r[k]||0);return a;},{sales:0,revenue:0,gross_profit:0,expenses:0,net_profit:0,purchases:0,inventory_value:0});
    totals.margin=totals.revenue?Number((totals.gross_profit/totals.revenue*100).toFixed(1)):0;
    return json(res,200,{range:{start:start.toISOString(),end:end.toISOString()},totals,branches:rows.sort((a,b)=>b.revenue-a.revenue),branch_count:branches.length});
  }
  if(method==='GET'&&url.pathname==='/api/branches/transfers'){
    const u=requireUser(req,res,db);if(!u)return;ensureBranches(db,u);return json(res,200,{transfers:(db.branch_transfers||[]).filter(x=>x.user_id===u.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,100)});
  }
  if(method==='POST'&&url.pathname==='/api/branches/transfers'){
    const u=requireUser(req,res,db);if(!u)return;ensureBranches(db,u);const b=await body(req);const from=getBranch(db,u,b.from_branch_id),to=getBranch(db,u,b.to_branch_id);if(!from||!to||from.id===to.id)return json(res,400,{error:'Select two different active branches.'});const items=Array.isArray(b.items)?b.items:[];if(!items.length)return json(res,400,{error:'Add at least one product to transfer.'});const normalized=[];for(const raw of items){const p=db.products.find(x=>x.id===String(raw.product_id||'')&&x.user_id===u.id);const qty=Number(raw.quantity||0);if(!p||qty<=0)return json(res,400,{error:'Each transfer item must have a valid product and quantity.'});const src=branchStockRow(db,u,from.id,p.id,true);if(qty>Number(src.quantity||0))return json(res,400,{error:`Insufficient ${p.name} stock in ${from.name}. Available: ${src.quantity}.`});normalized.push({product_id:p.id,name:p.name,sku:p.sku||'',quantity:Number(qty.toFixed(2)),unit:p.unit||'pcs'});}
    for(const it of normalized){const src=branchStockRow(db,u,from.id,it.product_id,true),dst=branchStockRow(db,u,to.id,it.product_id,true);src.quantity=Number((Number(src.quantity)-it.quantity).toFixed(2));dst.quantity=Number((Number(dst.quantity)+it.quantity).toFixed(2));src.updated_at=dst.updated_at=now();}
    const tr={id:id(),user_id:u.id,from_branch_id:from.id,from_branch_name:from.name,to_branch_id:to.id,to_branch_name:to.name,items:normalized,status:'completed',created_at:now()};db.branch_transfers.push(tr); for(const it of normalized){const prod=db.products.find(x=>x.id===it.product_id&&x.user_id===u.id);if(prod){recordInventoryMovement(db,u,prod,-it.quantity,"transfer",`Transfer to ${to.name}`,tr.id,from.id);recordInventoryMovement(db,u,prod,it.quantity,"transfer",`Transfer from ${from.name}`,tr.id,to.id);}}activity(db,u.id,'branch_transfer',tr.id,`Transferred ${normalized.length} product line${normalized.length===1?'':'s'} from ${from.name} to ${to.name}.`);dbWrite(db);return json(res,201,{success:true,transfer:tr});
  }

  // ---------- Inventory ----------
  if (method === "GET" && url.pathname === "/api/inventory/summary") {
    const u=requireUser(req,res,db); if(!u)return;
    ensureBranches(db,u);
    const products=db.products.filter(x=>x.user_id===u.id);
    const categories=db.categories.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const requestedBranch=url.searchParams.get('branch_id');
    const allBranches=requestedBranch==='all';
    const branch=allBranches?null:getBranch(db,u,requestedBranch||u.active_branch_id);
    const userBranches=db.branches.filter(b=>b.user_id===u.id&&b.active!==false);
    const qtyFor=p=>allBranches?userBranches.reduce((sum,b)=>sum+Number(branchStockRow(db,u,b.id,p.id,false)?.quantity||0),0):(branch?Number(branchStockRow(db,u,branch.id,p.id,true)?.quantity||0):Number(p.stock_quantity||0));
    const low=products.filter(p=>qtyFor(p)<=Number(p.low_stock_level||0));
    const totalUnits=products.reduce((sum,p)=>sum+qtyFor(p),0);
    const stockValue=products.reduce((sum,p)=>sum+qtyFor(p)*Number(p.cost_price||0),0);
    const potentialProfit=products.reduce((sum,p)=>sum+qtyFor(p)*(Number(p.selling_price||0)-Number(p.cost_price||0)),0);
    return json(res,200,{
      branch_id:branch?.id||null,branch_name:branch?.name||(allBranches?'All branches':''),all_branches:allBranches,
      total_products:products.filter(p=>qtyFor(p)>0).length,total_categories:categories.length,total_suppliers:suppliers.length,
      total_units:Number(totalUnits.toFixed(2)),
      stock_value:Number(stockValue.toFixed(2)),potential_profit:Number(potentialProfit.toFixed(2)),
      low_stock:low.length
    });
  }

  if (method === "GET" && url.pathname === "/api/inventory/movements") {
    const u=requireUser(req,res,db); if(!u)return;
    const pid=String(url.searchParams.get('product_id')||'');
    let rows=(db.inventory_movements||[]).filter(x=>x.user_id===u.id);
    if(pid) rows=rows.filter(x=>x.product_id===pid);
    return json(res,200,{movements:rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,200)});
  }
  if (method === "POST" && url.pathname === "/api/inventory/adjust") {
    const u=requireUser(req,res,db); if(!u)return; ensureBranches(db,u);
    const b=await body(req), pid=String(b.product_id||''), action=String(b.action||'').toLowerCase(), qty=Number(b.quantity||0);
    const p=db.products.find(x=>x.id===pid&&x.user_id===u.id); if(!p)return json(res,404,{error:'Product not found.'});
    if(!['increase','decrease','set'].includes(action))return json(res,400,{error:'Choose Increase, Decrease or Set stock.'});
    if(!Number.isFinite(qty)||qty<0)return json(res,400,{error:'Quantity must be zero or greater.'});
    const branch=getBranch(db,u,b.branch_id||u.active_branch_id); if(!branch)return json(res,400,{error:'Please select an active branch.'});
    const bs=branchStockRow(db,u,branch.id,p.id,true); const before=Number(p.stock_quantity||0), branchBefore=Number(bs.quantity||0);
    let branchAfter=action==='set'?qty:action==='increase'?branchBefore+qty:branchBefore-qty;
    if(branchAfter<0)return json(res,400,{error:`Cannot reduce ${p.name} below zero in ${branch.name}.`});
    const delta=Number((branchAfter-branchBefore).toFixed(2));
    if(action==='set' && qty===branchBefore) return json(res,400,{error:'Stock is already at that quantity.'});
    bs.quantity=branchAfter;bs.updated_at=now(); p.stock_quantity=Number((before+delta).toFixed(2));p.updated_at=now();
    const reason=String(b.reason||'Manual stock adjustment').trim()||'Manual stock adjustment';
    recordInventoryMovement(db,u,p,delta,'adjustment',reason,String(b.reference||''),branch.id);
    activity(db,u.id,'inventory_adjustment',p.sku||p.id,`${p.name}: ${delta>=0?'+':''}${delta} ${p.unit||'pcs'} in ${branch.name}. ${reason}`);
    dbWrite(db);
    return json(res,200,{success:true,product:p,branch_stock:branchAfter,delta});
  }

  if (method === "GET" && url.pathname === "/api/categories") {
    const u=requireUser(req,res,db); if(!u)return;
    return json(res,200,{categories:db.categories.filter(x=>x.user_id===u.id).sort((a,b)=>a.name.localeCompare(b.name))});
  }
  if (method === "POST" && url.pathname === "/api/categories") {
    const u=requireUser(req,res,db); if(!u)return;
    const b=await body(req), name=String(b.name||"").trim(), description=String(b.description||"").trim();
    if(!name)return json(res,400,{error:"Category name is required."});
    if(db.categories.some(x=>x.user_id===u.id && x.name.toLowerCase()===name.toLowerCase())) return json(res,409,{error:"Category already exists."});
    const c={id:id(),user_id:u.id,name,description,created_at:now()}; db.categories.push(c); dbWrite(db);
    return json(res,201,{success:true,category:c});
  }
  if (method === "PUT" && url.pathname.startsWith("/api/categories/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split("/").pop(), b=await body(req), name=String(b.name||"").trim();
    const c=db.categories.find(x=>x.id===cid && x.user_id===u.id); if(!c)return json(res,404,{error:"Category not found."});
    if(!name)return json(res,400,{error:"Category name is required."});
    if(db.categories.some(x=>x.user_id===u.id && x.id!==cid && x.name.toLowerCase()===name.toLowerCase())) return json(res,409,{error:"Category already exists."});
    c.name=name;c.description=String(b.description||"").trim();c.updated_at=now();dbWrite(db);return json(res,200,{success:true,category:c});
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/categories/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split("/").pop();
    if(db.products.some(p=>p.user_id===u.id && p.category_id===cid)) return json(res,400,{error:"Cannot delete a category assigned to products."});
    const before=db.categories.length; db.categories=db.categories.filter(x=>!(x.id===cid&&x.user_id===u.id)); if(before===db.categories.length)return json(res,404,{error:"Category not found."});dbWrite(db);return json(res,200,{success:true});
  }

  if (method === "GET" && url.pathname === "/api/suppliers") {
    const u=requireUser(req,res,db); if(!u)return;
    return json(res,200,{suppliers:db.suppliers.filter(x=>x.user_id===u.id).sort((a,b)=>a.name.localeCompare(b.name))});
  }
  if (method === "POST" && url.pathname === "/api/suppliers") {
    const u=requireUser(req,res,db); if(!u)return;
    const b=await body(req), name=String(b.name||"").trim();
    if(!name)return json(res,400,{error:"Supplier name is required."});
    const sp={id:id(),user_id:u.id,name,phone:String(b.phone||"").trim(),email:String(b.email||"").trim(),address:String(b.address||"").trim(),created_at:now()};
    db.suppliers.push(sp);dbWrite(db);return json(res,201,{success:true,supplier:sp});
  }
  if (method === "PUT" && url.pathname.startsWith("/api/suppliers/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const sid=url.pathname.split("/").pop(), b=await body(req), sp=db.suppliers.find(x=>x.id===sid&&x.user_id===u.id); if(!sp)return json(res,404,{error:"Supplier not found."});
    sp.name=String(b.name||"").trim();sp.phone=String(b.phone||"").trim();sp.email=String(b.email||"").trim();sp.address=String(b.address||"").trim();sp.updated_at=now();dbWrite(db);return json(res,200,{success:true,supplier:sp});
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/suppliers/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const sid=url.pathname.split("/").pop();
    if(db.products.some(p=>p.user_id===u.id&&p.supplier_id===sid))return json(res,400,{error:"Cannot delete a supplier assigned to products."});
    const before=db.suppliers.length;db.suppliers=db.suppliers.filter(x=>!(x.id===sid&&x.user_id===u.id));if(before===db.suppliers.length)return json(res,404,{error:"Supplier not found."});dbWrite(db);return json(res,200,{success:true});
  }

  // ---------- Supplier 360 (v43) ----------
  if(method==='GET'&&url.pathname.match(/^\/api\/suppliers\/[^/]+\/360$/)){
    const u=requireUser(req,res,db);if(!u)return;
    const sid=url.pathname.split('/')[3],supplier=db.suppliers.find(x=>x.id===sid&&x.user_id===u.id);if(!supplier)return json(res,404,{error:'Supplier not found.'});
    const purchases=db.purchases.filter(x=>x.user_id===u.id&&x.supplier_id===sid).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const payments=db.supplier_payments.filter(x=>x.user_id===u.id&&x.supplier_id===sid);const total=purchases.reduce((a,x)=>a+Number(x.total||0),0),paid=payments.reduce((a,x)=>a+Number(x.amount||0),0),pm={};
    purchases.forEach(po=>(po.items||[]).forEach(i=>{const k=i.product_id||i.name;if(!pm[k])pm[k]={product_id:i.product_id||null,name:i.name,sku:i.sku||'',units:0,total:0,last_cost:0,last_date:''};const q=Number(i.quantity||0),c=Number(i.unit_cost||0);pm[k].units+=q;pm[k].total+=q*c;if(!pm[k].last_date||String(po.date||'')>pm[k].last_date){pm[k].last_date=po.date||'';pm[k].last_cost=c;}}));
    const products=Object.values(pm).map(x=>({...x,total:Number(x.total.toFixed(2)),average_cost:x.units?Number((x.total/x.units).toFixed(2)):0})).sort((a,b)=>b.total-a.total);
    return json(res,200,{supplier,summary:{purchase_orders:purchases.length,total_purchases:Number(total.toFixed(2)),total_paid:Number(paid.toFixed(2)),outstanding:Number(Math.max(0,total-paid).toFixed(2)),products_supplied:products.length,last_purchase:purchases[0]?.date||null},purchases:purchases.slice(0,50),payments:payments.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,50),products});
  }

  if (method === "GET" && url.pathname === "/api/products") {
    const u=requireUser(req,res,db); if(!u)return;
    ensureBranches(db,u);
    const requestedBranch=url.searchParams.get('branch_id');
    const allBranches=requestedBranch==='all';
    const branch=allBranches?null:getBranch(db,u,requestedBranch||u.active_branch_id);
    const userBranches=db.branches.filter(b=>b.user_id===u.id&&b.active!==false);
    const products=db.products.filter(x=>x.user_id===u.id).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>{
      const c=db.categories.find(x=>x.id===p.category_id), sp=db.suppliers.find(x=>x.id===p.supplier_id);
      const branchQty=allBranches?userBranches.reduce((sum,b)=>sum+Number(branchStockRow(db,u,b.id,p.id,false)?.quantity||0),0):(branch?Number(branchStockRow(db,u,branch.id,p.id,true)?.quantity||0):Number(p.stock_quantity||0));
      return {...p,category_name:c?.name||"",supplier_name:sp?.name||"",branch_id:branch?.id||null,branch_name:branch?.name||"All branches",branch_quantity:branchQty,
        low_stock:Number(branchQty)<=Number(p.low_stock_level),
        stock_value:Number((branchQty*Number(p.cost_price||0)).toFixed(2)),
        potential_profit:Number((branchQty*(Number(p.selling_price||0)-Number(p.cost_price||0))).toFixed(2))};
    });
    return json(res,200,{products,branch:branch?{id:branch.id,name:branch.name}:null,all_branches:allBranches});
  }
  if (method === "POST" && url.pathname === "/api/products") {
    const u=requireUser(req,res,db); if(!u)return;
    const b=await body(req), name=String(b.name||"").trim();
    if(!name)return json(res,400,{error:"Product name is required."});
    const category_id=b.category_id?String(b.category_id):null,supplier_id=b.supplier_id?String(b.supplier_id):null;
    if(category_id&&!db.categories.some(x=>x.id===category_id&&x.user_id===u.id))return json(res,400,{error:"Invalid category."});
    if(supplier_id&&!db.suppliers.some(x=>x.id===supplier_id&&x.user_id===u.id))return json(res,400,{error:"Invalid supplier."});
    ensureBranches(db,u);
    const p={id:id(),user_id:u.id,category_id,supplier_id,name,sku:String(b.sku||"").trim(),description:String(b.description||"").trim(),
      cost_price:Number(b.cost_price||0),selling_price:Number(b.selling_price||0),stock_quantity:Number(b.stock_quantity||0),
      low_stock_level:Number(b.low_stock_level??5),unit:String(b.unit||"pcs").trim()||"pcs",batch_number:String(b.batch_number||"").trim(),expiry_date:String(b.expiry_date||"").trim(),supplier_lead_days:Number(b.supplier_lead_days??7),created_at:now(),updated_at:now()};
    db.products.push(p); if(p.stock_quantity>0){const branch=getBranch(db,u,b.branch_id||u.active_branch_id); if(branch){const bs=branchStockRow(db,u,branch.id,p.id,true);bs.quantity=Number(p.stock_quantity);bs.updated_at=now();recordInventoryMovement(db,u,p,p.stock_quantity,"opening","Opening stock","",branch.id);}} dbWrite(db);return json(res,201,{success:true,product:p});
  }
  if (method === "PUT" && url.pathname.startsWith("/api/products/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const pid=url.pathname.split("/").pop(), b=await body(req),p=db.products.find(x=>x.id===pid&&x.user_id===u.id);if(!p)return json(res,404,{error:"Product not found."});
    const name=String(b.name||"").trim();if(!name)return json(res,400,{error:"Product name is required."});
    const category_id=b.category_id?String(b.category_id):null,supplier_id=b.supplier_id?String(b.supplier_id):null;
    if(category_id&&!db.categories.some(x=>x.id===category_id&&x.user_id===u.id))return json(res,400,{error:"Invalid category."});
    if(supplier_id&&!db.suppliers.some(x=>x.id===supplier_id&&x.user_id===u.id))return json(res,400,{error:"Invalid supplier."});
    const previousStock=Number(p.stock_quantity||0);
    Object.assign(p,{category_id,supplier_id,name,sku:String(b.sku||"").trim(),description:String(b.description||"").trim(),
      cost_price:Number(b.cost_price||0),selling_price:Number(b.selling_price||0),stock_quantity:Number(b.stock_quantity||0),
      low_stock_level:Number(b.low_stock_level??5),unit:String(b.unit||"pcs").trim()||"pcs",batch_number:String(b.batch_number||"").trim(),expiry_date:String(b.expiry_date||"").trim(),supplier_lead_days:Number(b.supplier_lead_days??7),updated_at:now()});
    ensureBranches(db,u); const branch=getBranch(db,u,b.branch_id||u.active_branch_id); if(branch && previousStock!==Number(p.stock_quantity||0)){const bs=branchStockRow(db,u,branch.id,p.id,true);const delta=Number(p.stock_quantity||0)-previousStock;bs.quantity=Math.max(0,Number(bs.quantity||0)+delta);bs.updated_at=now();if(delta)recordInventoryMovement(db,u,p,delta,"adjustment","Product quantity edited","",branch.id);}
    dbWrite(db);return json(res,200,{success:true,product:p});
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/products/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const pid=url.pathname.split("/").pop(),before=db.products.length;db.products=db.products.filter(x=>!(x.id===pid&&x.user_id===u.id));if(before===db.products.length)return json(res,404,{error:"Product not found."});dbWrite(db);return json(res,200,{success:true});
  }


  // ---------- Customers ----------
  if (method === "GET" && url.pathname === "/api/customers") {
    const u=requireUser(req,res,db); if(!u)return;
    const customers=db.customers.filter(x=>x.user_id===u.id).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{
      const cs=db.sales.filter(s=>s.user_id===u.id && s.customer_id===c.id && s.status!=="cancelled"&&s.status!=="returned");
      const sorted=[...cs].sort((a,b)=>b.created_at.localeCompare(a.created_at));
      return {...c,transaction_count:cs.length,total_spent:Number(cs.reduce((a,s)=>a+Number(s.total||0),0).toFixed(2)),last_purchase:sorted[0]?.created_at||null};
    });
    return json(res,200,{customers});
  }
  if (method === "POST" && url.pathname === "/api/customers") {
    const u=requireUser(req,res,db); if(!u)return;
    const b=await body(req), name=String(b.name||"").trim(), phone=String(b.phone||"").trim();
    if(!name)return json(res,400,{error:"Customer name is required."});
    if(phone && db.customers.some(x=>x.user_id===u.id && x.phone===phone))return json(res,409,{error:"A customer with this phone number already exists."});
    const c={id:id(),user_id:u.id,name,phone,email:String(b.email||"").trim(),address:String(b.address||"").trim(),created_at:now(),updated_at:now()};
    db.customers.push(c);dbWrite(db);return json(res,201,{success:true,customer:c});
  }
  if (method === "GET" && url.pathname.startsWith("/api/customers/") && url.pathname.endsWith("/sales")) {
    const u=requireUser(req,res,db); if(!u)return;
    const parts=url.pathname.split("/"),cid=parts[3],c=db.customers.find(x=>x.id===cid&&x.user_id===u.id);
    if(!c)return json(res,404,{error:"Customer not found."});
    const customerSales=db.sales.filter(s=>s.user_id===u.id&&s.customer_id===cid).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    return json(res,200,{customer:c,sales:customerSales});
  }
  if (method === "GET" && url.pathname.match(/^\/api\/customers\/[^/]+\/360$/)) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split('/')[3], c=db.customers.find(x=>x.id===cid&&x.user_id===u.id);
    if(!c)return json(res,404,{error:"Customer not found."});
    const sales=db.sales.filter(s=>s.user_id===u.id&&s.customer_id===cid&&s.status!=="cancelled"&&s.status!=="returned").sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const returns=db.sales_returns.filter(r=>r.user_id===u.id&&((r.customer_id===cid)||sales.some(s=>s.id===r.sale_id)));
    const profit=sales.reduce((a,s)=>a+Number(s.profit||0),0), spent=sales.reduce((a,s)=>a+Number(s.total||0),0);
    const ledger=db.loyalty_ledger.filter(x=>x.user_id===u.id&&x.customer_id===cid);
    const earned=ledger.filter(x=>x.type==='earn').reduce((a,x)=>a+Number(x.points||0),0);
    const redeemed=ledger.filter(x=>x.type==='redeem').reduce((a,x)=>a+Number(x.points||0),0);
    const reversed=ledger.filter(x=>x.type==='reverse').reduce((a,x)=>a+Number(x.points||0),0);
    const points=Math.max(0,earned-redeemed-reversed);
    const redemptions=db.loyalty_redemptions.filter(x=>x.user_id===u.id&&x.customer_id===cid).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const cfg=loyaltyConfig(u);
    const first=sales.length?sales[sales.length-1].created_at:null, last=sales.length?sales[0].created_at:null;
    const daysSince=last?Math.max(0,Math.floor((Date.now()-new Date(last).getTime())/86400000)):null;
    let segment='Dormant'; if(sales.length>=5&&daysSince!==null&&daysSince<=30)segment='VIP'; else if(sales.length>=3&&daysSince!==null&&daysSince<=45)segment='Loyal'; else if(daysSince!==null&&daysSince<=30)segment='Active'; else if(daysSince!==null&&daysSince<=90)segment='At Risk';
    const avg=sales.length?spent/sales.length:0;
    return json(res,200,{customer:c,summary:{total_spent:Number(spent.toFixed(2)),orders:sales.length,average_order:Number(avg.toFixed(2)),gross_profit:Number(profit.toFixed(2)),lifetime_value:Number(spent.toFixed(2)),first_purchase:first,last_purchase:last,days_since_last:daysSince,segment,points,points_earned:earned,points_redeemed:redeemed,points_reversed:reversed,redemptions:redemptions.length,returns:returns.length},sales:sales.slice(0,50),redemptions:redemptions.slice(0,20),loyalty_config:cfg});
  }
  if (method === "PUT" && url.pathname.startsWith("/api/customers/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split("/").pop(),b=await body(req),c=db.customers.find(x=>x.id===cid&&x.user_id===u.id);
    if(!c)return json(res,404,{error:"Customer not found."});
    const name=String(b.name||"").trim(),phone=String(b.phone||"").trim();if(!name)return json(res,400,{error:"Customer name is required."});
    if(phone && db.customers.some(x=>x.user_id===u.id&&x.id!==cid&&x.phone===phone))return json(res,409,{error:"Another customer already uses this phone number."});
    Object.assign(c,{name,phone,email:String(b.email||"").trim(),address:String(b.address||"").trim(),updated_at:now()});dbWrite(db);return json(res,200,{success:true,customer:c});
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/customers/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split("/").pop();if(!db.customers.some(x=>x.id===cid&&x.user_id===u.id))return json(res,404,{error:"Customer not found."});
    if(db.sales.some(s=>s.user_id===u.id&&s.customer_id===cid))return json(res,400,{error:"This customer has sales history and cannot be deleted. You can edit the customer instead."});
    db.customers=db.customers.filter(x=>!(x.id===cid&&x.user_id===u.id));dbWrite(db);return json(res,200,{success:true});
  }

  // ---------- Expenses ----------
  if (method === "GET" && url.pathname === "/api/expenses") {
    const u=requireUser(req,res,db); if(!u)return;
    const start=url.searchParams.get("start");
    const end=url.searchParams.get("end");
    ensureBranches(db,u); const branchId=url.searchParams.get("branch_id"); let expenses=db.expenses.filter(x=>x.user_id===u.id&&(!branchId||x.branch_id===branchId)).sort((a,b)=>String(b.date||b.created_at).localeCompare(String(a.date||a.created_at)));
    if(start && /^\d{4}-\d{2}-\d{2}$/.test(start)) expenses=expenses.filter(x=>String(x.date||x.created_at).slice(0,10)>=start);
    if(end && /^\d{4}-\d{2}-\d{2}$/.test(end)) expenses=expenses.filter(x=>String(x.date||x.created_at).slice(0,10)<=end);
    const total=expenses.reduce((a,x)=>a+Number(x.amount||0),0);
    return json(res,200,{expenses,total:Number(total.toFixed(2))});
  }
  if (method === "POST" && url.pathname === "/api/expenses") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req);
      ensureBranches(db,u); const activeBranch=getBranch(db,u,b.branch_id||u.active_branch_id); if(!activeBranch)return json(res,400,{error:"Please select an active branch."});
      const description=String(b.description||"").trim();
      const category=String(b.category||"Other").trim()||"Other";
      const amount=Number(b.amount);
      const date=String(b.date||new Date().toISOString().slice(0,10)).trim();
      const paymentMethod=String(b.payment_method||"cash").trim().toLowerCase();
      const notes=String(b.notes||"").trim();
      const allowed=["cash","transfer","pos","flutterwave","other"];
      if(!description)return json(res,400,{error:"Expense description is required."});
      if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:"Expense amount must be greater than zero."});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json(res,400,{error:"Enter a valid expense date."});
      if(!allowed.includes(paymentMethod))return json(res,400,{error:"Invalid payment method."});
      const expense={id:id(),user_id:u.id,branch_id:activeBranch.id,branch_name:activeBranch.name,description,category,amount:Number(amount.toFixed(2)),date,payment_method:paymentMethod,notes,created_at:now(),updated_at:now()};
      db.expenses.push(expense);
      activity(db,u.id,"expense",description,`Expense recorded: ${moneyText(amount)} for ${category}.`);
      dbWrite(db);
      return json(res,201,{success:true,expense});
    } catch(e){return json(res,400,{error:e.message});}
  }
  if (method === "PUT" && url.pathname.startsWith("/api/expenses/")) {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const eid=url.pathname.split("/").pop(), b=await body(req);
      const e=db.expenses.find(x=>x.id===eid&&x.user_id===u.id); if(!e)return json(res,404,{error:"Expense not found."});
      const description=String(b.description||"").trim(), category=String(b.category||"Other").trim()||"Other", amount=Number(b.amount), date=String(b.date||e.date).trim(), paymentMethod=String(b.payment_method||"cash").trim().toLowerCase(), notes=String(b.notes||"").trim();
      ensureBranches(db,u); const branch=getBranch(db,u,b.branch_id||e.branch_id||u.active_branch_id); if(!branch)return json(res,400,{error:"Please select a valid branch."});
      const allowed=["cash","transfer","pos","flutterwave","other"];
      if(!description)return json(res,400,{error:"Expense description is required."});
      if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:"Expense amount must be greater than zero."});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json(res,400,{error:"Enter a valid expense date."});
      if(!allowed.includes(paymentMethod))return json(res,400,{error:"Invalid payment method."});
      Object.assign(e,{description,category,amount:Number(amount.toFixed(2)),date,payment_method:paymentMethod,notes,branch_id:branch.id,branch_name:branch.name,updated_at:now()});
      dbWrite(db); return json(res,200,{success:true,expense:e});
    } catch(e){return json(res,400,{error:e.message});}
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/expenses/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const eid=url.pathname.split("/").pop(), before=db.expenses.length;
    db.expenses=db.expenses.filter(x=>!(x.id===eid&&x.user_id===u.id));
    if(before===db.expenses.length)return json(res,404,{error:"Expense not found."});
    dbWrite(db); return json(res,200,{success:true});
  }

  // ---------- Financial Intelligence Centre ----------
  if (method === "GET" && url.pathname === "/api/financial-center") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date();
    const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||""));
    const endParam=url.searchParams.get("end");
    const startParam=url.searchParams.get("start");
    const endDate=valid(endParam)?endParam:today.toISOString().slice(0,10);
    const startDate=valid(startParam)?startParam:new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
    const requestedBranch=url.searchParams.get('branch_id'); const financialBranch=requestedBranch==='all'?null:getBranch(db,u,requestedBranch||u.active_branch_id); const fbid=financialBranch?.id||null;
    const inRange=(x,dateField="created_at")=>{const d=String(x?.[dateField]||x?.date||x?.created_at||"").slice(0,10);return d>=startDate&&d<=endDate};
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled" && x.status!=="returned"&&(!fbid||x.branch_id===fbid)&&inRange(x));
    const expenses=db.expenses.filter(x=>x.user_id===u.id&&(!fbid||x.branch_id===fbid)&&inRange(x,"date"));
    const receivablePayments=db.receivable_payments.filter(x=>x.user_id===u.id&&(!fbid||x.branch_id===fbid)&&inRange(x,"payment_date"));
    const supplierPayments=db.supplier_payments.filter(x=>x.user_id===u.id&&(!fbid||x.branch_id===fbid)&&inRange(x,"payment_date"));
    const revenue=sales.reduce((a,x)=>a+Number(x.total||0),0);
    const cogs=sales.reduce((a,x)=>a+Number(x.cost_total||0),0);
    const grossProfit=revenue-cogs;
    const operatingExpenses=expenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const netProfit=grossProfit-operatingExpenses;
    const salesCash=sales.reduce((a,x)=>a+Number(x.total||0),0);
    const customerCollections=receivablePayments.reduce((a,x)=>a+Number(x.amount||0),0);
    const supplierCash=supplierPayments.reduce((a,x)=>a+Number(x.amount||0),0);
    const expenseCash=operatingExpenses;
    const cashIn=salesCash+customerCollections;
    const cashOut=supplierCash+expenseCash;
    const netCash=cashIn-cashOut;
    const openInvoices=db.invoices.filter(x=>x.user_id===u.id&&(!fbid||x.branch_id===fbid)).map(inv=>{const paid=db.receivable_payments.filter(p=>p.invoice_id===inv.id&&p.user_id===u.id).reduce((a,p)=>a+Number(p.amount||0),0);return {...inv,outstanding:Math.max(0,Number(inv.total||0)-paid)};}).filter(x=>x.outstanding>0);
    const receivablesTotal=openInvoices.reduce((a,x)=>a+x.outstanding,0);
    const openPurchases=db.purchases.filter(x=>x.user_id===u.id&&(!fbid||x.branch_id===fbid)&&x.status!=="cancelled" && x.status!=="returned").map(po=>{const paid=db.supplier_payments.filter(p=>p.purchase_id===po.id&&p.user_id===u.id).reduce((a,p)=>a+Number(p.amount||0),0);return {...po,outstanding:Math.max(0,Number(po.total||0)-paid)};}).filter(x=>x.outstanding>0);
    const payablesTotal=openPurchases.reduce((a,x)=>a+x.outstanding,0);
    const inventoryValue=db.products.filter(x=>x.user_id===u.id).reduce((a,p)=>a+Number((fbid?branchStockRow(db,u,fbid,p.id,false)?.quantity:p.stock_quantity)||0)*Number(p.cost_price||0),0);
    const expenseMap={};expenses.forEach(x=>{const k=x.category||"Other";expenseMap[k]=(expenseMap[k]||0)+Number(x.amount||0)});
    const expenseBreakdown=Object.entries(expenseMap).map(([category,total])=>({category,total:Number(total.toFixed(2)),share:operatingExpenses?Number((total/operatingExpenses*100).toFixed(1)):0})).sort((a,b)=>b.total-a.total);
    const monthly={};
    const addMonth=(date,key,amount)=>{const m=String(date||"").slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))return;if(!monthly[m])monthly[m]={month:m,revenue:0,expenses:0,net:0};monthly[m][key]+=Number(amount||0)};
    sales.forEach(x=>addMonth(x.created_at,"revenue",x.total));expenses.forEach(x=>addMonth(x.date,"expenses",x.amount));
    const monthlyTrend=Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)).map(x=>({...x,net:Number((x.revenue-x.expenses-sales.filter(s=>String(s.created_at).slice(0,7)===x.month).reduce((a,s)=>a+Number(s.cost_total||0),0)).toFixed(2))}));
    const currentAssets=receivablesTotal+inventoryValue;
    const workingCapital=currentAssets-payablesTotal;
    const days=(new Date(endDate+'T00:00:00')-new Date(startDate+'T00:00:00'))/86400000+1;
    const prevEnd=new Date(new Date(startDate+'T00:00:00').getTime()-86400000);
    const prevStart=new Date(prevEnd.getTime()-(Math.max(1,days)-1)*86400000);
    const iso=d=>d.toISOString().slice(0,10);
    const ps=iso(prevStart), pe=iso(prevEnd);
    const pinRange=(x,field='created_at')=>{const d=String(x?.[field]||x?.date||x?.created_at||'').slice(0,10);return d>=ps&&d<=pe};
    const prevSales=db.sales.filter(x=>x.user_id===u.id&&x.status!=='cancelled'&&x.status!=='returned'&&pinRange(x));
    const prevExpenses=db.expenses.filter(x=>x.user_id===u.id&&pinRange(x,'date'));
    const prevRevenue=prevSales.reduce((a,x)=>a+Number(x.total||0),0);
    const prevCogs=prevSales.reduce((a,x)=>a+Number(x.cost_total||0),0);
    const prevGross=prevRevenue-prevCogs;
    const prevOpex=prevExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const prevNet=prevGross-prevOpex;
    const pct=(a,b)=>b===0?(a===0?0:100):Number(((a-b)/Math.abs(b)*100).toFixed(1));
    const margin=revenue?Number((grossProfit/revenue*100).toFixed(1)):0;
    const netMargin=revenue?Number((netProfit/revenue*100).toFixed(1)):0;
    const expenseRatio=revenue?Number((operatingExpenses/revenue*100).toFixed(1)):0;
    const concentration=expenseBreakdown.slice(0,3).reduce((a,x)=>a+x.share,0);
    const alerts=[];
    if(revenue===0&&operatingExpenses>0) alerts.push({level:'danger',title:'No sales revenue in period',message:'Operating expenses were recorded without qualifying sales revenue. Review cash flow and spending.'});
    if(margin<20&&revenue>0) alerts.push({level:'warning',title:'Gross margin is low',message:`Gross margin is ${margin}%. Review selling prices and product purchase costs.`});
    if(expenseRatio>30&&revenue>0) alerts.push({level:'warning',title:'Operating expenses are heavy',message:`Operating expenses consume ${expenseRatio}% of revenue. Review the largest expense categories.`});
    if(payablesTotal>cashIn&&payablesTotal>0) alerts.push({level:'warning',title:'Supplier obligations exceed period cash inflow',message:`Payables of ${moneyText(payablesTotal)} are higher than cash inflow of ${moneyText(cashIn)}.`});
    if(receivablesTotal>0&&receivablesTotal>revenue*0.35&&revenue>0) alerts.push({level:'warning',title:'Receivables need attention',message:`Customer balances of ${moneyText(receivablesTotal)} are significant relative to period revenue.`});
    if(netProfit<0) alerts.push({level:'danger',title:'Net loss detected',message:`Net profit is negative by ${moneyText(Math.abs(netProfit))}.`});
    if(!alerts.length) alerts.push({level:'success',title:'Financial position looks stable',message:'No major financial warning was detected for the selected period.'});
    let health=100;
    if(netProfit<0) health-=30; else if(netMargin<10) health-=10;
    if(margin<20) health-=15;
    if(expenseRatio>30) health-=15;
    if(workingCapital<0) health-=20;
    if(cashIn<cashOut) health-=10;
    if(payablesTotal>cashIn&&payablesTotal>0) health-=10;
    health=Math.max(0,Math.min(100,health));
    const healthLabel=health>=75?'Healthy':health>=50?'Needs attention':'At risk';
    return json(res,200,{period:{start:startDate,end:endDate,previous_start:ps,previous_end:pe},summary:{revenue:Number(revenue.toFixed(2)),cogs:Number(cogs.toFixed(2)),gross_profit:Number(grossProfit.toFixed(2)),operating_expenses:Number(operatingExpenses.toFixed(2)),net_profit:Number(netProfit.toFixed(2)),cash_in:Number(cashIn.toFixed(2)),cash_out:Number(cashOut.toFixed(2)),net_cash:Number(netCash.toFixed(2)),receivables:Number(receivablesTotal.toFixed(2)),payables:Number(payablesTotal.toFixed(2)),inventory_value:Number(inventoryValue.toFixed(2)),working_capital:Number(workingCapital.toFixed(2)),gross_margin:margin,net_margin:netMargin,expense_ratio:expenseRatio,top_expense_share:Number(concentration.toFixed(1))},comparison:{revenue_change:pct(revenue,prevRevenue),gross_profit_change:pct(grossProfit,prevGross),expenses_change:pct(operatingExpenses,prevOpex),net_profit_change:pct(netProfit,prevNet),previous:{revenue:Number(prevRevenue.toFixed(2)),gross_profit:Number(prevGross.toFixed(2)),operating_expenses:Number(prevOpex.toFixed(2)),net_profit:Number(prevNet.toFixed(2))}},health:{score:health,label:healthLabel},alerts,expense_breakdown:expenseBreakdown,monthly_trend:monthlyTrend,top_receivables:openInvoices.sort((a,b)=>b.outstanding-a.outstanding).slice(0,10).map(x=>({number:x.number,customer_name:x.customer_name,outstanding:Number(x.outstanding.toFixed(2)),due_date:x.due_date||""})),top_payables:openPurchases.sort((a,b)=>b.outstanding-a.outstanding).slice(0,10).map(x=>({number:x.number,supplier_name:x.supplier_name,outstanding:Number(x.outstanding.toFixed(2)),due_date:x.due_date||""})),counts:{sales:sales.length,expenses:expenses.length,customer_collections:receivablePayments.length,supplier_payments:supplierPayments.length}});
  }


  // ---------- Customer Loyalty & Rewards ----------
  if (method === "GET" && url.pathname === "/api/loyalty/overview") {
    const u=requireUser(req,res,db); if(!u)return;
    const cfg=loyaltyConfig(u), customers=db.customers.filter(c=>c.user_id===u.id), ledger=db.loyalty_ledger.filter(x=>x.user_id===u.id), rewards=db.loyalty_rewards.filter(x=>x.user_id===u.id), redemptions=db.loyalty_redemptions.filter(x=>x.user_id===u.id);
    // Loyalty spending is the customer's net value of completed sales. Returned/cancelled
    // sales are excluded because their value has been reversed. This keeps the displayed
    // Spent amount consistent with the same rule used by the Customers module.
    const qualifyingSales=db.sales.filter(s=>s.user_id===u.id&&s.status!=="cancelled"&&s.status!=="returned"&&s.customer_id);
    const rows=customers.map(c=>{
      const entries=ledger.filter(x=>x.customer_id===c.id);
      const earned=entries.filter(x=>x.type==='earn').reduce((a,x)=>a+Number(x.points||0),0);
      const redeemed=entries.filter(x=>x.type==='redeem').reduce((a,x)=>a+Number(x.points||0),0);
      const points=Math.max(0,earned-redeemed);
      const customerSales=qualifyingSales.filter(s=>s.customer_id===c.id);
      const total_spent=Number(customerSales.reduce((a,s)=>a+Number(s.total||0),0).toFixed(2));
      return {...c,points,earned,redeemed,total_spent,transaction_count:customerSales.length,level:loyaltyLevel(points,cfg)};
    }).sort((a,b)=>b.points-a.points);
    const counts={Bronze:0,Silver:0,Gold:0,Platinum:0};rows.forEach(x=>counts[x.level]++);
    return json(res,200,{config:cfg,summary:{members:rows.filter(x=>x.points>0).length,points_issued:ledger.filter(x=>x.type==='earn').reduce((a,x)=>a+Number(x.points||0),0),points_redeemed:ledger.filter(x=>x.type==='redeem').reduce((a,x)=>a+Number(x.points||0),0),rewards:rewards.length,redemptions:redemptions.length},levels:counts,customers:rows,rewards,redemptions:redemptions.slice(-20).reverse()});
  }
  if (method === "PUT" && url.pathname === "/api/loyalty/settings") {
    const u=requireUser(req,res,db);if(!u)return;const b=await body(req), cfg=loyaltyConfig(u);u.business_profile ||= {};u.business_profile.loyalty={points_per_naira:Math.max(0,Number(b.points_per_naira??cfg.points_per_naira)),bronze:Math.max(0,Number(b.bronze??cfg.bronze)),silver:Math.max(0,Number(b.silver??cfg.silver)),gold:Math.max(0,Number(b.gold??cfg.gold)),platinum:Math.max(0,Number(b.platinum??cfg.platinum))};dbWrite(db);return json(res,200,{config:loyaltyConfig(u)});
  }
  if (method === "POST" && url.pathname === "/api/loyalty/rewards") {
    const u=requireUser(req,res,db);if(!u)return;const b=await body(req),name=String(b.name||'').trim();if(!name)return json(res,400,{error:'Reward name is required.'});const points=Math.max(1,Math.floor(Number(b.points||0))),value=Math.max(0,Number(b.value||0));const r={id:id(),user_id:u.id,name,points,value,type:String(b.type||'discount'),description:String(b.description||'').trim().slice(0,300),active:b.active!==false,created_at:now()};db.loyalty_rewards.push(r);dbWrite(db);return json(res,201,{reward:r});
  }
  if (method === "DELETE" && url.pathname.match(/^\/api\/loyalty\/rewards\/[^/]+$/)) {const u=requireUser(req,res,db);if(!u)return;const rid=url.pathname.split('/').pop(),n=db.loyalty_rewards.length;db.loyalty_rewards=db.loyalty_rewards.filter(r=>!(r.id===rid&&r.user_id===u.id));if(n===db.loyalty_rewards.length)return json(res,404,{error:'Reward not found.'});dbWrite(db);return json(res,200,{success:true});}
  if (method === "POST" && url.pathname === "/api/loyalty/redeem") {
    const u=requireUser(req,res,db);if(!u)return;const b=await body(req),cid=String(b.customer_id||''),rid=String(b.reward_id||'');const c=db.customers.find(x=>x.id===cid&&x.user_id===u.id),r=db.loyalty_rewards.find(x=>x.id===rid&&x.user_id===u.id&&x.active!==false);if(!c||!r)return json(res,400,{error:'Valid customer and active reward are required.'});const earned=db.loyalty_ledger.filter(x=>x.user_id===u.id&&x.customer_id===cid&&x.type==='earn').reduce((a,x)=>a+Number(x.points||0),0),used=db.loyalty_ledger.filter(x=>x.user_id===u.id&&x.customer_id===cid&&x.type==='redeem').reduce((a,x)=>a+Number(x.points||0),0),balance=earned-used;if(balance<r.points)return json(res,400,{error:`Insufficient points. ${c.name} has ${balance} points.`});const red={id:id(),user_id:u.id,customer_id:cid,reward_id:rid,points:r.points,value:r.value,created_at:now()};db.loyalty_redemptions.push(red);db.loyalty_ledger.push({id:id(),user_id:u.id,customer_id:cid,type:'redeem',points:r.points,amount:r.value,reward_id:rid,description:`Redeemed reward: ${r.name}`,created_at:now()});dbWrite(db);return json(res,201,{success:true,redemption:red,new_balance:balance-r.points});
  }

  // ---------- Marketing & Customer Engagement ----------
  if (method === "GET" && url.pathname === "/api/marketing/overview") {
    const u=requireUser(req,res,db); if(!u)return;
    const customers=db.customers.filter(c=>c.user_id===u.id);
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned"&&x.customer_id);
    const stats={}; customers.forEach(c=>stats[c.id]={id:c.id,name:c.name||"Customer",phone:c.phone||"",email:c.email||"",orders:0,total:0,last:null});
    sales.forEach(x=>{const c=stats[x.customer_id];if(!c)return;c.orders++;c.total+=Number(x.total||0);const d=String(x.created_at||"").slice(0,10);if(d&&(!c.last||d>c.last))c.last=d;});
    const today=new Date();
    const enriched=Object.values(stats).map(c=>{const days=c.last?Math.max(0,Math.floor((today-new Date(c.last+'T00:00:00'))/86400000)):999;let segment='dormant';if(c.orders>=5&&days<=30)segment='vip';else if(c.orders>=3&&days<=45)segment='loyal';else if(days<=30)segment='active';else if(days<=90)segment='at_risk';return {...c,days,segment};});
    const segments={vip:0,loyal:0,active:0,at_risk:0,dormant:0};enriched.forEach(c=>segments[c.segment]++);
    const campaigns=db.marketing_campaigns.filter(c=>c.user_id===u.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const messages={
      vip:{label:'VIP Customers',title:'VIP Appreciation',message:'Hello {{name}}, thank you for being one of our valued customers at {{business}}. We truly appreciate your continued support. We have something special for you — please contact us to enjoy your exclusive offer.'},
      loyal:{label:'Loyal Customers',title:'Loyal Customer Offer',message:'Hello {{name}}, we appreciate your loyalty to {{business}}. We have a special offer prepared for our returning customers. We would love to serve you again soon!'},
      active:{label:'Active Customers',title:'New Offer',message:'Hello {{name}}, thank you for shopping with {{business}}. We have new products and offers available. Let us know what you are looking for and we will be happy to assist you.'},
      at_risk:{label:'At-Risk Customers',title:'Win-Back Campaign',message:'Hello {{name}}, we have missed serving you at {{business}}. We have exciting products and offers available and would love to welcome you back. Reply to this message and we will help you find something great.'},
      dormant:{label:'Dormant Customers',title:'We Miss You',message:'Hello {{name}}, it has been a while since your last purchase at {{business}}. We would love to have you back. Ask us about our latest products and special offers.'},
      all:{label:'All Customers',title:'Customer Update',message:'Hello {{name}}, thank you for choosing {{business}}. We have new products and special offers available. Reply to this message if you would like to see what is available.'}
    };
    const customerSegments={}; enriched.forEach(c=>customerSegments[c.id]=c.segment); const customer_samples={}; Object.keys(messages).forEach(k=>customer_samples[k]=enriched.filter(c=>k==='all'||c.segment===k).slice(0,5).map(c=>({id:c.id,name:customers.find(x=>x.id===c.id)?.name||c.name}))); return json(res,200,{summary:{customers:customers.length,active:enriched.filter(c=>c.orders>0).length,vip:segments.vip,at_risk:segments.at_risk,dormant:segments.dormant,campaigns:campaigns.length},segments,messages,campaigns,customers,customerSegments,customer_samples});
  }
  if (method === "POST" && url.pathname === "/api/marketing/campaigns") {
    const u=requireUser(req,res,db); if(!u)return; const b=await body(req);
    const segment=String(b.segment||'all'); const allowed=['all','vip','loyal','active','at_risk','dormant']; if(!allowed.includes(segment))return json(res,400,{error:'Invalid customer segment.'});
    const title=String(b.title||'Customer Campaign').trim().slice(0,120), message=String(b.message||'').trim().slice(0,1200); if(!message)return json(res,400,{error:'Campaign message is required.'});
    const c={id:id(),user_id:u.id,title,segment,target_customer_id:b.target_customer_id?String(b.target_customer_id):null,message,channel:String(b.channel||'whatsapp'),offer:String(b.offer||'').trim().slice(0,200),discount_type:['percent','amount'].includes(String(b.discount_type))?String(b.discount_type):'none',discount_value:Math.max(0,Number(b.discount_value||0)),status:'draft',created_at:now()};
    db.marketing_campaigns.push(c);activity(db,u.id,'marketing_campaign',c.id,`Marketing campaign created: ${title}`);dbWrite(db);return json(res,201,{campaign:c});
  }
  if (method === "PUT" && url.pathname.match(/^\/api\/marketing\/campaigns\/[^/]+$/)) {
    const u=requireUser(req,res,db);if(!u)return;const cid=url.pathname.split('/').pop();const c=db.marketing_campaigns.find(x=>x.id===cid&&x.user_id===u.id);if(!c)return json(res,404,{error:'Campaign not found.'});const b=await body(req);
    if(b.status&&['draft','active','completed','archived'].includes(String(b.status)))c.status=String(b.status); if(b.target_customer_id!==undefined)c.target_customer_id=b.target_customer_id?String(b.target_customer_id):null; if(b.discount_type!==undefined&&['none','percent','amount'].includes(String(b.discount_type)))c.discount_type=String(b.discount_type); if(b.discount_value!==undefined)c.discount_value=Math.max(0,Number(b.discount_value||0));if(b.title)c.title=String(b.title).trim().slice(0,120);if(b.message)c.message=String(b.message).trim().slice(0,1200);if(b.offer!==undefined)c.offer=String(b.offer).trim().slice(0,200);dbWrite(db);return json(res,200,{campaign:c});
  }
  if (method === "DELETE" && url.pathname.match(/^\/api\/marketing\/campaigns\/[^/]+$/)) {
    const u=requireUser(req,res,db);if(!u)return;const cid=url.pathname.split('/').pop();const n=db.marketing_campaigns.length;db.marketing_campaigns=db.marketing_campaigns.filter(x=>!(x.id===cid&&x.user_id===u.id));if(n===db.marketing_campaigns.length)return json(res,404,{error:'Campaign not found.'});dbWrite(db);return json(res,200,{success:true});
  }

  // ---------- v53.1 Customer Campaign Offers ----------
  if (method === "GET" && url.pathname.match(/^\/api\/marketing\/customers\/[^/]+\/offers$/)) {
    const u=requireUser(req,res,db); if(!u)return;
    const cid=url.pathname.split('/')[4], customer=db.customers.find(c=>c.id===cid&&c.user_id===u.id); if(!customer)return json(res,404,{error:'Customer not found.'});
    const sales=db.sales.filter(s=>s.user_id===u.id&&s.customer_id===cid&&s.status==='completed').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const last=sales[0]?.created_at?new Date(String(sales[0].created_at).slice(0,10)+'T00:00:00'):null; const days=last?Math.max(0,Math.floor((Date.now()-last.getTime())/86400000)):999;
    let segment='dormant'; if(sales.length>=5&&days<=30)segment='vip'; else if(sales.length>=3&&days<=45)segment='loyal'; else if(days<=30)segment='active'; else if(days<=90)segment='at_risk';
    const offers=(db.marketing_campaigns||[]).filter(c=>c.user_id===u.id&&c.status==='active'&&((c.target_customer_id&&c.target_customer_id===cid)||(!c.target_customer_id&&(c.segment==='all'||c.segment===segment))));
    return json(res,200,{customer:{id:customer.id,name:customer.name},segment,offers:offers.map(c=>({id:c.id,title:c.title,offer:c.offer||'',discount_type:c.discount_type||'none',discount_value:Number(c.discount_value||0),message:String(c.message||'').replace(/\{\{name\}\}/g,customer.name).replace(/\{\{business\}\}/g,String(u.business_profile?.business_name||'BIGJOE')),channel:c.channel}))});
  }

  // ---------- Customer & Sales Intelligence ----------
  if (method === "GET" && url.pathname === "/api/customer-intelligence") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); const key=d=>d.toISOString().slice(0,10);
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned"&&x.customer_id);
    const customers=db.customers.filter(x=>x.user_id===u.id);
    const map={}; customers.forEach(c=>map[c.id]={id:c.id,name:c.name||'Customer',phone:c.phone||'',email:c.email||'',orders:0,total:0,last:null,products:{},dates:[]});
    sales.forEach(s=>{
      const c=map[s.customer_id]; if(!c)return;
      const total=Number(s.total||0); c.orders++; c.total+=total;
      const d=String(s.created_at||'').slice(0,10); if(d){c.dates.push(d);if(!c.last||d>c.last)c.last=d;}
      (s.items||[]).forEach(i=>{const k=i.product_id||i.sku||i.name||'item';if(!c.products[k])c.products[k]={name:i.name||'Product',quantity:0,revenue:0};c.products[k].quantity+=Number(i.quantity||0);c.products[k].revenue+=Number(i.line_total||0);});
    });
    const active=Object.values(map).filter(c=>c.orders>0);
    const totalRevenue=active.reduce((a,c)=>a+c.total,0), repeat=active.filter(c=>c.orders>1).length;
    const customersOut=active.map(c=>{
      const days=c.last?Math.max(0,Math.floor((today-new Date(c.last+'T00:00:00'))/86400000)):null;
      const avg=c.orders?c.total/c.orders:0;
      let segment_key='dormant',segment='Dormant',description='No recent purchase activity.';
      if(c.orders>=5&&days!==null&&days<=30){segment_key='vip';segment='VIP';description='High-value, frequent and recently active.';}
      else if(c.orders>=3&&days!==null&&days<=45){segment_key='loyal';segment='Loyal';description='Repeat customer with strong buying history.';}
      else if(days!==null&&days<=30){segment_key='active';segment='Active';description='Recently purchased and worth nurturing.';}
      else if(days!==null&&days<=90){segment_key='at_risk';segment='At Risk';description='Previously active but purchase is becoming overdue.';}
      const recency=Math.max(0,100-Math.min(days===null?100:days,100));
      const frequency=Math.min(100,c.orders*20);
      const monetary=totalRevenue>0?Math.min(100,(c.total/(Math.max(...active.map(x=>x.total),1)))*100):0;
      const score=Math.round(recency*0.5+frequency*0.3+monetary*0.2);
      let reason='Recent activity and purchase history indicate an opportunity.';
      if(days!==null&&days<=14&&c.orders>=2)reason='Recently purchased and has a repeat-purchase pattern.';
      else if(c.orders>=3&&days!==null&&days<=45)reason='Loyal customer with frequent purchases.';
      else if(days!==null&&days<=30)reason='Recent customer activity suggests a good follow-up opportunity.';
      else if(days!==null&&days<=90)reason='Previously active; a reminder or promotion may win the customer back.';
      return {id:c.id,name:c.name,phone:c.phone,email:c.email,orders:c.orders,total_spent:Number(c.total.toFixed(2)),avg_order:Number(avg.toFixed(2)),last_purchase:c.last,days_since_last:days,segment_key,segment,description,score,reason};
    }).sort((a,b)=>b.total_spent-a.total_spent);
    const likely=customersOut.filter(x=>x.score>=45).sort((a,b)=>b.score-a.score||b.total_spent-a.total_spent).slice(0,10);
    const segmentDefs=[['vip','VIP','High-value, frequent and recently active.'],['loyal','Loyal','Repeat customers with strong buying history.'],['active','Active','Customers who purchased recently.'],['at_risk','At Risk','Previously active customers who may need re-engagement.'],['dormant','Dormant','Customers with no recent purchase activity.']];
    const segments=segmentDefs.map(([k,name,description])=>{const xs=customersOut.filter(x=>x.segment_key===k);return {key:k,name,count:xs.length,revenue:Number(xs.reduce((a,x)=>a+x.total_spent,0).toFixed(2)),description};});
    const productMap={}; active.forEach(c=>Object.values(c.products).forEach(x=>{if(!productMap[x.name])productMap[x.name]={name:x.name,quantity:0,revenue:0,customers:0};productMap[x.name].quantity+=x.quantity;productMap[x.name].revenue+=x.revenue;productMap[x.name].customers++;}));
    const topProducts=Object.values(productMap).sort((a,b)=>b.revenue-a.revenue).slice(0,8).map(x=>({...x,quantity:Number(x.quantity),revenue:Number(x.revenue.toFixed(2))}));
    const actions=[];
    const atRisk=customersOut.filter(x=>x.segment_key==='at_risk').length, vip=customersOut.filter(x=>x.segment_key==='vip').length;
    if(vip)actions.push({title:'Protect your VIP customers',text:`You have ${vip} VIP customer(s). Consider priority service, loyalty rewards and early access to new products.`});
    if(atRisk)actions.push({title:'Run a win-back campaign',text:`${atRisk} customer(s) are at risk of going inactive. Send a personalised offer or reminder based on their previous purchases.`});
    if(repeat===0&&active.length)actions.push({title:'Increase repeat purchases',text:'Most customers have purchased only once. Follow up after each sale and create simple repeat-purchase offers.'});
    if(topProducts.length)actions.push({title:'Promote proven products',text:`${topProducts[0].name} is the strongest customer-linked product by revenue. Consider bundling it or using it to attract repeat buyers.`});
    if(!actions.length)actions.push({title:'Build customer history',text:'Keep linking POS sales to named customers. More purchase history will make BIGJOE customer recommendations more accurate.'});
    return json(res,200,{summary:{total_customers:customers.length,active_customers:active.length,repeat_customers:repeat,total_revenue:Number(totalRevenue.toFixed(2)),average_customer_value:active.length?Number((totalRevenue/active.length).toFixed(2)):0,repeat_rate:active.length?Number((repeat/active.length*100).toFixed(1)):0},segments,customers:customersOut,likely_to_buy:likely,top_products:topProducts,actions});
  }

  // ---------- v48 Intelligent Decision Automation ----------
  if (method === "GET" && url.pathname === "/api/decision-automation") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10), todayKey=key(today);
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned");
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const products=db.products.filter(x=>x.user_id===u.id);
    const customers=db.customers.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const last30=new Date(today.getTime()-29*86400000), prev30=new Date(today.getTime()-59*86400000);
    const inWindow=(x,start,end)=>{const d=new Date(String(x||'').slice(0,10)+'T00:00:00');return d>=start&&d<=end};
    const current=sales.filter(x=>inWindow(x.created_at,last30,today));
    const previous=sales.filter(x=>inWindow(x.created_at,prev30,new Date(last30.getTime()-86400000)));
    const revenue=current.reduce((a,x)=>a+Number(x.total||0),0), prevRevenue=previous.reduce((a,x)=>a+Number(x.total||0),0);
    const profit=current.reduce((a,x)=>a+Number(x.profit||0),0), prevProfit=previous.reduce((a,x)=>a+Number(x.profit||0),0);
    const exp30=expenses.filter(x=>inWindow(x.date||x.created_at,last30,today)).reduce((a,x)=>a+Number(x.amount||0),0);
    const prevExp=expenses.filter(x=>inWindow(x.date||x.created_at,prev30,new Date(last30.getTime()-86400000))).reduce((a,x)=>a+Number(x.amount||0),0);
    const revChange=prevRevenue?((revenue-prevRevenue)/prevRevenue)*100:0, profitChange=prevProfit?((profit-prevProfit)/Math.abs(prevProfit))*100:0, expChange=prevExp?((exp30-prevExp)/prevExp)*100:0;
    const recent7Start=new Date(today.getTime()-6*86400000), prev7Start=new Date(today.getTime()-13*86400000), prev7End=new Date(today.getTime()-7*86400000);
    const r7=sales.filter(x=>inWindow(x.created_at,recent7Start,today)).reduce((a,x)=>a+Number(x.total||0),0), p7=sales.filter(x=>inWindow(x.created_at,prev7Start,prev7End)).reduce((a,x)=>a+Number(x.total||0),0);
    const weeklyChange=p7?((r7-p7)/p7)*100:0;
    const productMap={}; current.forEach(s=>(s.items||[]).forEach(i=>{const k=i.product_id||i.sku||i.name||'item';if(!productMap[k])productMap[k]={name:i.name||'Product',units:0,revenue:0};productMap[k].units+=Number(i.quantity||0);productMap[k].revenue+=Number(i.line_total||0);}));
    const topProducts=Object.values(productMap).sort((a,b)=>b.revenue-a.revenue);
    const lowStock=products.filter(p=>Number(p.stock_quantity||0)<=Number(p.min_stock||p.reorder_level||0));
    const demand={}; sales.filter(x=>inWindow(x.created_at,new Date(today.getTime()-59*86400000),today)).forEach(s=>(s.items||[]).forEach(i=>{const k=i.product_id||i.sku||i.name||'item';demand[k]=(demand[k]||0)+Number(i.quantity||0)}));
    const stockRisks=products.map(p=>{const units=demand[p.id]||demand[p.sku]||demand[p.name]||0;const rate=units/60;const stock=Number(p.stock_quantity||0);const cover=rate?stock/rate:null;return {name:p.name,stock,rate,cover,urgent:stock<=Number(p.min_stock||p.reorder_level||0)|| (cover!==null&&cover<=7)}}).filter(x=>x.urgent).sort((a,b)=>(a.cover??999)-(b.cover??999));
    const plan=db.business_plans.find(x=>x.user_id===u.id)||{}; const target=Number(plan.monthly_sales_target||0); const monthKey=todayKey.slice(0,7); const monthRevenue=sales.filter(x=>String(x.created_at||'').slice(0,7)===monthKey).reduce((a,x)=>a+Number(x.total||0),0); const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate(), daysLeft=Math.max(0,daysInMonth-today.getDate());
    const avgDaily= current.length?revenue/Math.max(1,new Set(current.map(x=>String(x.created_at||'').slice(0,10))).size):0; const requiredDaily=target&&daysLeft?Math.max(0,(target-monthRevenue)/daysLeft):0;
    const decisions=[];
    const add=(priority,title,text,next,reason,score,category)=>decisions.push({id:crypto.randomBytes(6).toString('hex'),priority,title,text,next_step:next,reason,score,category});
    if(stockRisks.length) add('urgent','Protect stock availability',`${stockRisks.length} product(s) need immediate stock attention. ${stockRisks[0].name} is the most urgent signal.`,`Review stock levels and create a purchase/reorder for the most urgent item.`,`Current stock is at or below the minimum level or has about 7 days or less of demand cover.`,96,'Inventory');
    if(target>0&&requiredDaily>0&&avgDaily<requiredDaily) add('high','Increase the sales pace',`You need about ${moneyText(requiredDaily)} per day to reach the monthly target, versus a recent average of ${moneyText(avgDaily)}.`,`Focus the next sales effort on your strongest products and highest-value customers.`,`The current daily pace is below the amount required to reach the target with ${daysLeft} day(s) remaining.`,90,'Sales');
    if(weeklyChange<=-15) add('high','Respond to the sales slowdown',`Sales in the last 7 days are ${Math.abs(weeklyChange).toFixed(1)}% below the previous 7 days.`,`Run a focused promotion, customer follow-up or bundle around a proven product.`,`Recent sales momentum has weakened materially.`,87,'Sales');
    if(expChange>=20&&exp30>0) add('high','Review rising expenses',`Operating expenses are ${expChange.toFixed(1)}% higher than the previous 30-day period.`,`Open Expenses and review the largest categories before approving more discretionary spending.`,`Expense growth is materially above the previous period.`,84,'Finance');
    if(revenue>0&&profit<0) add('urgent','Protect profitability',`The last 30 days generated ${moneyText(revenue)} in revenue but gross profit is ${moneyText(profit)}.`,`Review product margins, discounts and operating expenses before scaling sales.`,`The current period is showing negative gross profit.`,98,'Finance');
    if(topProducts.length) add('medium','Concentrate on proven products',`${topProducts[0].name} is the strongest product by recent revenue at ${moneyText(topProducts[0].revenue)}.`,`Keep it available and test a bundle or cross-sell offer around it.`,`Recent sales data shows a clear top product.`,72,'Sales');
    const namedCustomers=customers.filter(c=>c.name||c.phone||c.email).length;
    if(current.length&&namedCustomers&&current.filter(s=>s.customer_id).length<Math.max(1,current.length*.4)) add('medium','Capture more customer names',`Only part of recent sales are linked to named customers.`,`Link customers to POS sales so BIGJOE can identify repeat buyers and win-back opportunities.`,`Customer-linked sales improve retention and customer intelligence.`,68,'Customers');
    if(!decisions.length) add('medium','Keep the business on track','No urgent exception was detected from the current sales, profit, expense and stock signals.','Continue recording transactions and review this centre regularly.','Current indicators do not show a major immediate problem.',55,'Monitoring');
    decisions.sort((a,b)=>b.score-a.score);
    const groups={urgent:[],high:[],medium:[]};decisions.forEach(d=>groups[d.priority].push(d));
    const top=decisions.slice(0,3);
    const summary={revenue:Number(revenue.toFixed(2)),profit:Number(profit.toFixed(2)),expenses:Number(exp30.toFixed(2)),revenue_change:Number(revChange.toFixed(1)),profit_change:Number(profitChange.toFixed(1)),expense_change:Number(expChange.toFixed(1)),weekly_change:Number(weeklyChange.toFixed(1)),monthly_target:target,current_month_revenue:Number(monthRevenue.toFixed(2)),required_daily:Number(requiredDaily.toFixed(2)),days_left:daysLeft};
    return json(res,200,{generated_at:new Date().toISOString(),summary,priority_counts:{urgent:groups.urgent.length,high:groups.high.length,medium:groups.medium.length},top_decisions:top,decisions,execution_plan:[...top.map((x,i)=>({order:i+1,when:i===0?'Now':i===1?'Today':'This week',title:x.title,next_step:x.next_step,category:x.category}))],data_quality:{recent_sales:current.length,customer_linked_sales:current.filter(s=>s.customer_id).length,products:products.length,suppliers:suppliers.length},note:'Recommendations are generated from recorded BIGJOE data. They are decision support, not guaranteed outcomes.'});
  }

  // ---------- v56 Advanced Business Automation & Smart Alerts ----------
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

  // ---------- v50 Business Command Center ----------
  if (method === "GET" && url.pathname === "/api/command-center") {
    const u=requireUser(req,res,db); if(!u)return;
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned");
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const products=db.products.filter(x=>x.user_id===u.id);
    const customers=db.customers.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10), todayKey=key(today);
    const monthStart=new Date(today.getFullYear(),today.getMonth(),1), prevStart=new Date(today.getFullYear(),today.getMonth()-1,1), prevEnd=new Date(today.getFullYear(),today.getMonth(),0);
    const inRange=(x,a,b)=>{const k=String(x||'').slice(0,10);return k>=key(a)&&k<=key(b)};
    const monthSales=sales.filter(x=>inRange(x.created_at,monthStart,today));
    const prevSales=sales.filter(x=>inRange(x.created_at,prevStart,prevEnd));
    const monthExp=expenses.filter(x=>inRange(x.date||x.created_at,monthStart,today));
    const revenue=monthSales.reduce((a,x)=>a+Number(x.total||0),0), gross=monthSales.reduce((a,x)=>a+Number(x.profit||0),0), exp=monthExp.reduce((a,x)=>a+Number(x.amount||0),0), net=gross-exp;
    const prevRevenue=prevSales.reduce((a,x)=>a+Number(x.total||0),0), prevGross=prevSales.reduce((a,x)=>a+Number(x.profit||0),0);
    const pct=(a,b)=>b?Number(((a-b)/Math.abs(b)*100).toFixed(1)):null;
    const low=products.filter(x=>Number(x.stock??x.quantity??0)<=Number(x.reorder_level??x.reorderLevel??0));
    const open=(db.smart_tasks||[]).filter(x=>x.user_id===u.id&&!['completed','cancelled'].includes(x.status));
    const overdue=open.filter(x=>x.due_date&&x.due_date<todayKey);
    const healthParts=[];
    const margin=revenue?gross/revenue*100:0;
    healthParts.push(Math.max(0,Math.min(100,50+Math.max(-20,Math.min(20,pct(revenue,prevRevenue)||0)))));
    healthParts.push(Math.max(0,Math.min(100,margin*2)));
    healthParts.push(low.length?Math.max(20,100-low.length*8):100);
    healthParts.push(open.length>10?40:open.length>5?65:90);
    const health=Math.round(healthParts.reduce((a,b)=>a+b,0)/healthParts.length);
    const healthLabel=health>=80?'Healthy':health>=60?'Watch':'Needs Attention';
    const alerts=[];
    if(revenue<=0) alerts.push({level:'danger',title:'No sales recorded this month',text:'Review sales activity and customer follow-up.'});
    if((pct(revenue,prevRevenue)||0)<-10) alerts.push({level:'danger',title:'Sales are declining',text:`Revenue is ${Math.abs(pct(revenue,prevRevenue)||0).toFixed(1)}% below the previous month.`});
    if(margin<20&&revenue>0) alerts.push({level:'warning',title:'Gross margin needs attention',text:`Current gross margin is ${margin.toFixed(1)}%. Review low-margin products and purchase costs.`});
    if(low.length) alerts.push({level:'warning',title:`${low.length} product(s) need stock attention`,text:'Review replenishment recommendations before stock-outs occur.'});
    if(overdue.length) alerts.push({level:'warning',title:`${overdue.length} overdue task(s)`,text:'Open the Smart Action Center and complete or reschedule them.'});
    if(!alerts.length) alerts.push({level:'positive',title:'No major command-centre warning',text:'Continue monitoring sales, margins, inventory and execution.'});
    const actions=[];
    if(low.length) actions.push({priority:'urgent',title:'Review stock replenishment',text:`${low.length} product(s) are at or below their reorder level.`,page:'predictive'});
    if((pct(revenue,prevRevenue)||0)<-10) actions.push({priority:'high',title:'Address falling sales',text:'Review best sellers, customer follow-up and branch performance.',page:'decisionAutomation'});
    if(margin<20&&revenue>0) actions.push({priority:'high',title:'Protect gross margin',text:'Review selling prices and supplier costs on low-margin products.',page:'procurement'});
    if(overdue.length) actions.push({priority:'medium',title:'Clear overdue tasks',text:`${overdue.length} task(s) are overdue.`,page:'smartActions'});
    if(!actions.length) actions.push({priority:'medium',title:'Review this week’s performance',text:'Use Business Intelligence to monitor trends and opportunities.',page:'analytics'});
    return json(res,200,{generated_at:new Date().toISOString(),period:{month:key(monthStart),today:todayKey},summary:{revenue:Number(revenue.toFixed(2)),gross_profit:Number(gross.toFixed(2)),expenses:Number(exp.toFixed(2)),net_profit:Number(net.toFixed(2)),margin:Number(margin.toFixed(1)),revenue_change:pct(revenue,prevRevenue),gross_profit_change:pct(gross,prevGross)},health:{score:health,label:healthLabel},counts:{products:products.length,customers:customers.length,suppliers:suppliers.length,low_stock:low.length,open_tasks:open.length,overdue_tasks:overdue.length,sales:monthSales.length},alerts,actions,meta:{month_sales:monthSales.length,previous_month_sales:prevSales.length}});
  }

  // ---------- v49 Smart Action Center & Business Task Automation ----------
  if (method === "GET" && url.pathname === "/api/smart-actions") {
    const u=requireUser(req,res,db); if(!u)return;
    const tasks=db.smart_tasks.filter(x=>x.user_id===u.id).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    const counts={pending:0,in_progress:0,completed:0,cancelled:0,urgent:0,high:0,medium:0,low:0};
    tasks.forEach(t=>{counts[t.status]=(counts[t.status]||0)+1;counts[t.priority]=(counts[t.priority]||0)+1;});
    return json(res,200,{tasks,counts,open_tasks:tasks.filter(x=>!['completed','cancelled'].includes(x.status)).length});
  }
  if (method === "POST" && url.pathname === "/api/smart-actions/tasks") {
    const u=requireUser(req,res,db); if(!u)return;
    try{
      const b=await body(req); const title=String(b.title||'').trim();
      if(title.length<2) return json(res,400,{error:'Enter a task title.'});
      const allowedPriority=['urgent','high','medium','low'], allowedStatus=['pending','in_progress','completed','cancelled'];
      const priority=allowedPriority.includes(String(b.priority))?String(b.priority):'medium';
      const status=allowedStatus.includes(String(b.status))?String(b.status):'pending';
      const task={id:id(),user_id:u.id,title,description:String(b.description||'').trim(),priority,status,due_date:String(b.due_date||'').slice(0,10),category:String(b.category||'General').trim()||'General',related_type:String(b.related_type||''),related_id:String(b.related_id||''),source_decision_id:String(b.source_decision_id||''),created_at:now(),updated_at:now(),completed_at:status==='completed'?now():null};
      db.smart_tasks.push(task); activity(db,u.id,'smart_action_task_created',task.title,JSON.stringify({task_id:task.id,priority:task.priority,category:task.category})); dbWrite(db);
      return json(res,201,{success:true,task});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if (method === "PUT" && url.pathname.match(/^\/api\/smart-actions\/tasks\/[^/]+$/)) {
    const u=requireUser(req,res,db); if(!u)return;
    try{
      const tid=url.pathname.split('/').pop(), task=db.smart_tasks.find(x=>x.id===tid&&x.user_id===u.id); if(!task)return json(res,404,{error:'Task not found.'});
      const b=await body(req); const allowedPriority=['urgent','high','medium','low'], allowedStatus=['pending','in_progress','completed','cancelled'];
      if(b.title!==undefined){const t=String(b.title||'').trim();if(t.length<2)return json(res,400,{error:'Task title is required.'});task.title=t;}
      if(b.description!==undefined)task.description=String(b.description||'').trim();
      if(b.priority!==undefined&&allowedPriority.includes(String(b.priority)))task.priority=String(b.priority);
      if(b.due_date!==undefined)task.due_date=String(b.due_date||'').slice(0,10);
      if(b.category!==undefined)task.category=String(b.category||'General').trim()||'General';
      if(b.status!==undefined&&allowedStatus.includes(String(b.status))){task.status=String(b.status);task.completed_at=task.status==='completed'?(task.completed_at||now()):null;}
      task.updated_at=now(); activity(db,u.id,'smart_action_task_updated',task.title,JSON.stringify({task_id:task.id,status:task.status})); dbWrite(db); return json(res,200,{success:true,task});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if (method === "DELETE" && url.pathname.match(/^\/api\/smart-actions\/tasks\/[^/]+$/)) {
    const u=requireUser(req,res,db); if(!u)return;
    const tid=url.pathname.split('/').pop(), idx=db.smart_tasks.findIndex(x=>x.id===tid&&x.user_id===u.id); if(idx<0)return json(res,404,{error:'Task not found.'});
    const task=db.smart_tasks[idx]; db.smart_tasks.splice(idx,1); activity(db,u.id,'smart_action_task_deleted',task.title,JSON.stringify({task_id:task.id})); dbWrite(db); return json(res,200,{success:true});
  }

  // ---------- v47 Predictive Business Intelligence ----------
  if (method === "GET" && url.pathname === "/api/predictive-intelligence") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); today.setHours(0,0,0,0);
    const key=d=>d.toISOString().slice(0,10), todayKey=key(today);
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned");
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const products=db.products.filter(x=>x.user_id===u.id);
    const days=60, start=new Date(today.getTime()-(days-1)*86400000);
    const daily=[];
    for(let i=0;i<days;i++){
      const d=new Date(start.getTime()+i*86400000), k=key(d);
      const ss=sales.filter(x=>String(x.created_at||'').slice(0,10)===k);
      const es=expenses.filter(x=>String(x.date||x.created_at||'').slice(0,10)===k);
      daily.push({date:k,revenue:ss.reduce((a,x)=>a+Number(x.total||0),0),profit:ss.reduce((a,x)=>a+Number(x.profit||0),0),expenses:es.reduce((a,x)=>a+Number(x.amount||0),0),sales:ss.length});
    }
    const rev30=daily.slice(-30).reduce((a,x)=>a+x.revenue,0), revPrev=daily.slice(-60,-30).reduce((a,x)=>a+x.revenue,0);
    const prof30=daily.slice(-30).reduce((a,x)=>a+x.profit,0), exp30=daily.slice(-30).reduce((a,x)=>a+x.expenses,0);
    const active=daily.filter(x=>x.revenue>0), avg=active.length?rev30/active.length:0, cal=rev30/30;
    const recent7=daily.slice(-7).reduce((a,x)=>a+x.revenue,0)/7, prev7=daily.slice(-14,-7).reduce((a,x)=>a+x.revenue,0)/7;
    const momentum=prev7?((recent7-prev7)/prev7)*100:0;
    const weighted=cal*0.35+recent7*0.45+avg*0.20;
    const variability=active.length>2?Math.sqrt(active.reduce((a,x)=>a+Math.pow(x.revenue-avg,2),0)/active.length)/(avg||1):1;
    const confidence=active.length>=20&&variability<1.2?'High':active.length>=10?'Moderate':'Low';
    const range30=Math.max(0,weighted*30*(1-Math.min(.35,variability*.18))), range30High=weighted*30*(1+Math.min(.35,variability*.18));
    const profitMargin=rev30?prof30/rev30:0, forecastProfit=weighted*30*profitMargin-exp30;
    const productDemand={};
    sales.slice(-60).forEach(x=>(x.items||[]).forEach(i=>{const id=i.product_id||i.sku||i.name;if(!productDemand[id])productDemand[id]={name:i.name,units:0};productDemand[id].units+=Number(i.quantity||0)}));
    const demandRisk=products.map(p=>{const d=productDemand[p.id]||productDemand[p.sku]||productDemand[p.name]||{units:0};const dailyRate=d.units/60,stock=Number(p.stock_quantity||0),daysCover=dailyRate?stock/dailyRate:null;return {name:p.name,stock,units_60d:d.units,daily_rate:Number(dailyRate.toFixed(2)),days_cover:daysCover===null?null:Number(daysCover.toFixed(1)),risk:daysCover!==null&&daysCover<=7?'critical':daysCover!==null&&daysCover<=14?'high':daysCover!==null&&daysCover<=30?'watch':'healthy'}}).filter(x=>x.risk!=='healthy').sort((a,b)=>({critical:0,high:1,watch:2}[a.risk]-({critical:0,high:1,watch:2}[b.risk])||((a.days_cover??999)-(b.days_cover??999))));
    const monthKey=todayKey.slice(0,7), plan=db.business_plans.find(x=>x.user_id===u.id)||{}, monthRevenue=sales.filter(x=>String(x.created_at||'').slice(0,7)===monthKey).reduce((a,x)=>a+Number(x.total||0),0), target=Number(plan.monthly_sales_target||0), daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate(), daysElapsed=today.getDate(), daysLeft=Math.max(0,daysInMonth-daysElapsed), projectedMonth=monthRevenue+weighted*daysLeft;
    const targetLikelihood=target<=0?'Not set':projectedMonth>=target*1.05?'Likely':projectedMonth>=target*.9?'Possible':'At risk';
    const dow=Array.from({length:7},()=>({days:0,revenue:0})); daily.forEach(x=>{const d=new Date(x.date+'T00:00:00').getDay();dow[d].days++;dow[d].revenue+=x.revenue});
    const strongest=dow.map((x,i)=>({day:i,avg:x.days?x.revenue/x.days:0})).sort((a,b)=>b.avg-a.avg)[0];
    const alerts=[];
    if(momentum<=-15) alerts.push({severity:'high',title:'Sales slowdown detected',text:`Recent weekly sales are ${Math.abs(momentum).toFixed(1)}% below the previous week.`});
    if(momentum>=15) alerts.push({severity:'positive',title:'Positive sales momentum',text:`Recent weekly sales are ${momentum.toFixed(1)}% above the previous week.`});
    if(forecastProfit<0) alerts.push({severity:'high',title:'Profit forecast needs attention',text:`At the current pace, the next 30-day gross-profit estimate may not cover the recent operating-expense run rate.`});
    if(demandRisk.some(x=>x.risk==='critical')) alerts.push({severity:'high',title:'Possible stock-outs ahead',text:`${demandRisk.filter(x=>x.risk==='critical').length} product(s) have an estimated 7 days or less of stock cover.`});
    if(targetLikelihood==='At risk') alerts.push({severity:'medium',title:'Monthly target is at risk',text:`Current run rate projects about ${money(projectedMonth)} for the month against a target of ${money(target)}.`});
    if(!alerts.length) alerts.push({severity:'positive',title:'No major predictive warning',text:'Current sales, profit and inventory signals do not show a major near-term risk.'});
    const actions=[];
    if(momentum<0) actions.push('Protect sales momentum by following up with recent customers and promoting proven products.');
    if(demandRisk.length) actions.push(`Review replenishment for ${demandRisk.slice(0,3).map(x=>x.name).join(', ')} before projected stock cover becomes critical.`);
    if(forecastProfit<0) actions.push('Review pricing, product margins and discretionary expenses before increasing operating costs.');
    if(target>0&&targetLikelihood!=='Likely') actions.push(`Increase the daily sales pace where practical; the current projection is ${targetLikelihood.toLowerCase()} against the monthly target.`);
    if(strongest&&strongest.avg>0) actions.push(`Your strongest historical selling day in the last 60 days is ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][strongest.day]}; consider concentrating promotions around that period.`);
    if(!actions.length) actions.push('Continue recording sales, expenses and stock movements. More history will improve BIGJOE predictive accuracy.');
    return json(res,200,{as_of:todayKey,history_days:days,forecast:{daily:Number(weighted.toFixed(2)),next_30_days_low:Number(range30.toFixed(2)),next_30_days:Number((weighted*30).toFixed(2)),next_30_days_high:Number(range30High.toFixed(2)),profit_estimate:Number(forecastProfit.toFixed(2)),momentum_pct:Number(momentum.toFixed(1)),confidence,variability:Number(variability.toFixed(2))},target:{monthly_target:target,current_month_revenue:Number(monthRevenue.toFixed(2)),projected_month_revenue:Number(projectedMonth.toFixed(2)),days_remaining:daysLeft,likelihood:targetLikelihood},inventory_risk:demandRisk.slice(0,20),alerts,actions,daily:daily.slice(-30).map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),profit:Number(x.profit.toFixed(2)),expenses:Number(x.expenses.toFixed(2))})),methodology:{note:'Forecast is a planning estimate based on recent sales velocity, recent momentum, active selling days and historical variability. It is not a guarantee.'}});
  }
  // ---------- Dashboard & Reports ----------
  if (method === "GET" && url.pathname === "/api/business-planner") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date(); const endDate=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const startDate=new Date(endDate.getTime()-29*86400000); const key=d=>d.toISOString().slice(0,10);
    const startKey=key(startDate), endKey=key(endDate);
    const sales=db.sales.filter(x=>x.user_id===u.id&&x.status!=="cancelled"&&x.status!=="returned");
    const recent=sales.filter(x=>{const d=String(x.created_at||'').slice(0,10);return d>=startKey&&d<=endKey;});
    const expenses=db.expenses.filter(x=>x.user_id===u.id).filter(x=>{const d=String(x.date||x.created_at||'').slice(0,10);return d>=startKey&&d<=endKey;});
    const daily=[];
    for(let i=0;i<30;i++){const d=new Date(startDate.getTime()+i*86400000),k=key(d);const ds=recent.filter(s=>String(s.created_at||'').slice(0,10)===k);const es=expenses.filter(e=>String(e.date||e.created_at||'').slice(0,10)===k);daily.push({date:k,revenue:ds.reduce((a,x)=>a+Number(x.total||0),0),profit:ds.reduce((a,x)=>a+Number(x.profit||0),0),expenses:es.reduce((a,x)=>a+Number(x.amount||0),0),sales:ds.length});}
    const revenue30=daily.reduce((a,x)=>a+x.revenue,0), expense30=daily.reduce((a,x)=>a+x.expenses,0);
    const activeDays=daily.filter(x=>x.revenue>0).length, avgDaily=activeDays?revenue30/activeDays:0, calendarDaily=revenue30/30;
    const recent7=daily.slice(-7).reduce((a,x)=>a+x.revenue,0)/7, prior7=daily.slice(-14,-7).reduce((a,x)=>a+x.revenue,0)/7;
    const trendPct=prior7>0?((recent7-prior7)/prior7)*100:0, weightedDaily=calendarDaily*0.4+recent7*0.4+avgDaily*0.2;
    const forecast7=weightedDaily*7, forecast30=weightedDaily*30;
    const plan=db.business_plans.find(x=>x.user_id===u.id)||{};
    const monthStart=new Date(today.getFullYear(),today.getMonth(),1), monthKey=key(monthStart);
    const monthSales=sales.filter(x=>String(x.created_at||'').slice(0,7)===monthKey), monthRevenue=monthSales.reduce((a,x)=>a+Number(x.total||0),0);
    const monthExpenses=db.expenses.filter(x=>x.user_id===u.id&&String(x.date||x.created_at||'').slice(0,7)===monthKey).reduce((a,x)=>a+Number(x.amount||0),0);
    const daysElapsed=today.getDate(), daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
    const salesTarget=Number(plan.monthly_sales_target||0), expenseTarget=Number(plan.monthly_expense_limit||0);
    const targetProgress=salesTarget>0?(monthRevenue/salesTarget)*100:0, requiredDaily=salesTarget>monthRevenue?(salesTarget-monthRevenue)/Math.max(1,daysInMonth-daysElapsed):0, expenseProgress=expenseTarget>0?(monthExpenses/expenseTarget)*100:0;
    const products=db.products.filter(p=>p.user_id===u.id);
    const reorder=products.map(p=>{let qty=0;recent.forEach(s=>(s.items||[]).forEach(i=>{if(i.product_id===p.id||i.sku===p.sku||i.name===p.name)qty+=Number(i.quantity||0);}));const dailyRate=qty/30,stock=Number(p.stock_quantity||0),min=Number(p.low_stock_level||0),lead=Number(p.supplier_lead_days||plan.default_lead_days||7),safety=Number(plan.safety_stock_days||7),reorderPoint=dailyRate*(lead+safety),targetStock=dailyRate*(lead+safety+30),recommended=Math.max(0,Math.ceil(Math.max(min,reorderPoint,targetStock)-stock)),daysCover=dailyRate>0?stock/dailyRate:null;let priority='healthy',reason='Stock level is currently adequate.';if(stock<=min){priority='urgent';reason='Stock is at or below the minimum level.'}else if(dailyRate>0&&daysCover<=lead+safety){priority='high';reason=`Estimated stock cover is ${daysCover.toFixed(1)} days, below the planned ${lead+safety}-day protection window.`}else if(dailyRate>0&&daysCover<=30){priority='watch';reason=`Estimated stock cover is ${daysCover.toFixed(1)} days.`}return {product_id:p.id,name:p.name,sku:p.sku||'',stock,min,daily_rate:Number(dailyRate.toFixed(2)),days_cover:daysCover===null?null:Number(daysCover.toFixed(1)),lead_days:lead,safety_days:safety,reorder_point:Number(reorderPoint.toFixed(1)),recommended_qty:recommended,priority,reason,supplier_id:p.supplier_id||null};}).filter(x=>x.priority!=='healthy').sort((a,b)=>({urgent:0,high:1,watch:2}[a.priority]-({urgent:0,high:1,watch:2}[b.priority])||b.daily_rate-a.daily_rate));
    const topProducts={};recent.forEach(s=>(s.items||[]).forEach(i=>{const k=i.product_id||i.sku||i.name;if(!topProducts[k])topProducts[k]={name:i.name,quantity:0,revenue:0};topProducts[k].quantity+=Number(i.quantity||0);topProducts[k].revenue+=Number(i.line_total||0);}));
    const best=Object.values(topProducts).sort((a,b)=>b.revenue-a.revenue).slice(0,5), alerts=[];
    if(salesTarget>0&&targetProgress<50&&daysElapsed>Math.ceil(daysInMonth*0.5))alerts.push({severity:'high',title:'Sales target is behind pace',text:`You have reached ${targetProgress.toFixed(1)}% of your monthly sales target with ${daysInMonth-daysElapsed} day(s) remaining.`});
    if(salesTarget>0&&requiredDaily>0&&weightedDaily<requiredDaily)alerts.push({severity:'medium',title:'Increase daily sales pace',text:`You need about ₦${requiredDaily.toLocaleString('en-NG',{maximumFractionDigits:0})} per day to reach the monthly sales target.`});
    if(expenseTarget>0&&expenseProgress>=80)alerts.push({severity:'high',title:'Expense ceiling is close',text:`Monthly expenses have used ${expenseProgress.toFixed(1)}% of your planned expense limit.`});
    if(trendPct<=-15)alerts.push({severity:'medium',title:'Sales momentum is weakening',text:`The latest 7-day average is ${Math.abs(trendPct).toFixed(1)}% below the previous 7-day average.`});
    if(trendPct>=15)alerts.push({severity:'positive',title:'Sales momentum is improving',text:`The latest 7-day average is ${trendPct.toFixed(1)}% above the previous 7-day average.`});
    if(reorder.filter(x=>x.priority==='urgent').length)alerts.push({severity:'high',title:'Urgent restocking required',text:`${reorder.filter(x=>x.priority==='urgent').length} product(s) are at or below minimum stock.`});
    if(!alerts.length)alerts.push({severity:'positive',title:'Planning outlook is stable',text:'No major planning risk was detected from the current sales, expense and stock history.'});
    return json(res,200,{period:{start:startKey,end:endKey},forecast:{daily:Number(weightedDaily.toFixed(2)),next_7_days:Number(forecast7.toFixed(2)),next_30_days:Number(forecast30.toFixed(2)),trend_pct:Number(trendPct.toFixed(1)),confidence:recent.length>=10?'Moderate':'Low'},target:{monthly_sales_target:salesTarget,monthly_revenue:Number(monthRevenue.toFixed(2)),sales_progress:Number(targetProgress.toFixed(1)),required_daily:Number(requiredDaily.toFixed(2)),monthly_expense_limit:expenseTarget,monthly_expenses:Number(monthExpenses.toFixed(2)),expense_progress:Number(expenseProgress.toFixed(1)),days_elapsed:daysElapsed,days_remaining:Math.max(0,daysInMonth-daysElapsed)},reorder_plan:reorder.slice(0,15),best_products:best.map(x=>({...x,revenue:Number(x.revenue.toFixed(2))})),alerts,daily:daily.map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),expenses:Number(x.expenses.toFixed(2)),profit:Number(x.profit.toFixed(2))})),settings:{default_lead_days:Number(plan.default_lead_days||7),safety_stock_days:Number(plan.safety_stock_days||7)}});
  }
  if (method === "PUT" && url.pathname === "/api/business-planner/settings") {
    const u=requireUser(req,res,db); if(!u)return; const b=await body(req);
    const salesTarget=Math.max(0,Number(b.monthly_sales_target||0)),expenseLimit=Math.max(0,Number(b.monthly_expense_limit||0)),lead=Math.max(1,Math.min(90,Number(b.default_lead_days||7))),safety=Math.max(0,Math.min(90,Number(b.safety_stock_days||7)));
    let plan=db.business_plans.find(x=>x.user_id===u.id);if(!plan){plan={id:id(),user_id:u.id,created_at:now()};db.business_plans.push(plan)}
    plan.monthly_sales_target=salesTarget;plan.monthly_expense_limit=expenseLimit;plan.default_lead_days=lead;plan.safety_stock_days=safety;plan.updated_at=now();dbWrite(db);return json(res,200,{plan});
  }
  // ---------- v33 Cash Flow Forecast & Scenario Planning ----------
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

  // ---------- v34 Budget & Cost Control Centre ----------
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

  // ---------- v45 Advanced Business Intelligence & Analytics ----------
  if (method === "GET" && url.pathname === "/api/analytics") {
    const u=requireUser(req,res,db); if(!u)return;
    const today=new Date();
    const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
    const end=validDate(url.searchParams.get('end'))?url.searchParams.get('end'):today.toISOString().slice(0,10);
    const start=validDate(url.searchParams.get('start'))?url.searchParams.get('start'):new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
    const branchId=url.searchParams.get('branch_id')||'';
    const sales=db.sales.filter(x=>x.user_id===u.id&&!['cancelled','returned'].includes(x.status));
    const expenses=db.expenses.filter(x=>x.user_id===u.id);
    const purchases=db.purchases.filter(x=>x.user_id===u.id&&!['cancelled','returned'].includes(x.status));
    const products=db.products.filter(x=>x.user_id===u.id);
    const customers=db.customers.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const branches=db.branches.filter(x=>x.user_id===u.id);
    const saleDate=x=>String(x.created_at||x.date||'').slice(0,10);
    const expDate=x=>String(x.date||x.created_at||'').slice(0,10);
    const purchaseDate=x=>String(x.date||x.created_at||'').slice(0,10);
    const branchMatch=x=>!branchId||String(x.branch_id||'')===branchId;
    const periodSales=sales.filter(x=>saleDate(x)>=start&&saleDate(x)<=end&&branchMatch(x));
    const periodExpenses=expenses.filter(x=>expDate(x)>=start&&expDate(x)<=end&&branchMatch(x));
    const periodPurchases=purchases.filter(x=>purchaseDate(x)>=start&&purchaseDate(x)<=end&&branchMatch(x));
    const revenue=periodSales.reduce((a,x)=>a+Number(x.total||0),0);
    const grossProfit=periodSales.reduce((a,x)=>a+Number(x.profit||0),0);
    const expenseTotal=periodExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const netProfit=grossProfit-expenseTotal;
    const units=periodSales.reduce((a,s)=>a+(s.items||[]).reduce((q,i)=>q+Number(i.quantity||0),0),0);
    const avgSale=periodSales.length?revenue/periodSales.length:0;
    const grossMargin=revenue?grossProfit/revenue*100:0;
    const netMargin=revenue?netProfit/revenue*100:0;
    const stockQty=p=>branchId?Number(branchStockRow(db,u,branchId,p.id,false)?.quantity||0):branches.filter(b=>b.active!==false).reduce((sum,b)=>sum+Number(branchStockRow(db,u,b.id,p.id,false)?.quantity||0),0);
    const inventoryValue=products.reduce((a,p)=>a+stockQty(p)*Number(p.cost_price||0),0);
    const receivables=db.invoices.filter(x=>x.user_id===u.id&&!['paid','cancelled'].includes(x.status)&&(!branchId||String(x.branch_id||'')===branchId)).reduce((a,x)=>a+Math.max(0,Number(x.total||0)-Number(x.paid_amount||0)),0);
    const supplierPayments=db.supplier_payments.filter(x=>x.user_id===u.id);
    const payables=purchases.reduce((a,p)=>{const paid=supplierPayments.filter(x=>x.purchase_id===p.id).reduce((q,x)=>q+Number(x.amount||0),0);return a+Math.max(0,Number(p.total||0)-paid)},0);
    const paymentMap={}; periodSales.forEach(x=>{const k=x.payment_method||'Other';paymentMap[k]=(paymentMap[k]||0)+Number(x.total||0)});
    const categoryMap={};
    periodSales.forEach(s=>{(s.items||[]).forEach(i=>{const prod=products.find(p=>p.id===i.product_id);const key=prod?.category||i.category||'Uncategorized';const r=categoryMap[key]||(categoryMap[key]={category:key,units:0,revenue:0,profit:0});r.units+=Number(i.quantity||0);r.revenue+=Number(i.line_total||0);r.profit+=Number(i.line_total||0)-Number(i.line_cost||0);});});
    const categories=Object.values(categoryMap).map(x=>({...x,margin:x.revenue?x.profit/x.revenue*100:0})).sort((a,b)=>b.revenue-a.revenue);
    const branchMap={};
    periodSales.forEach(s=>{const b=branches.find(x=>x.id===s.branch_id);const key=s.branch_id||'main';const r=branchMap[key]||(branchMap[key]={branch_id:s.branch_id||'',branch_name:b?.name||'Main Business',sales:0,revenue:0,profit:0,units:0});r.sales++;r.revenue+=Number(s.total||0);r.profit+=Number(s.profit||0);r.units+=(s.items||[]).reduce((q,i)=>q+Number(i.quantity||0),0);});
    periodExpenses.forEach(e=>{const key=e.branch_id||'main';const b=branches.find(x=>x.id===e.branch_id);const r=branchMap[key]||(branchMap[key]={branch_id:e.branch_id||'',branch_name:b?.name||'Main Business',sales:0,revenue:0,profit:0,units:0});r.expenses=(r.expenses||0)+Number(e.amount||0)});
    const branchPerformance=Object.values(branchMap).map(x=>({...x,expenses:Number((x.expenses||0).toFixed(2)),net_profit:Number((x.profit-(x.expenses||0)).toFixed(2)),margin:x.revenue?Number((x.profit/x.revenue*100).toFixed(1)):0})).sort((a,b)=>b.revenue-a.revenue);
    const customerMap={};
    periodSales.forEach(s=>{if(!s.customer_id)return;const key=s.customer_id;const r=customerMap[key]||(customerMap[key]={customer_id:key,name:s.customer_name||customers.find(c=>c.id===key)?.name||'Customer',orders:0,total:0,units:0});r.orders++;r.total+=Number(s.total||0);r.units+=(s.items||[]).reduce((q,i)=>q+Number(i.quantity||0),0)});
    const customerRows=Object.values(customerMap).map(x=>({...x,avg_order:x.orders?x.total/x.orders:0})).sort((a,b)=>b.total-a.total);
    const supplierMap={};
    periodPurchases.forEach(p=>{const key=p.supplier_id||'unknown';const r=supplierMap[key]||(supplierMap[key]={supplier_id:p.supplier_id||'',supplier_name:p.supplier_name||suppliers.find(s=>s.id===key)?.name||'Supplier',orders:0,total:0,received:0});r.orders++;r.total+=Number(p.total||0);if(p.status==='received')r.received++});
    const supplierRows=Object.values(supplierMap).map(x=>({...x,avg_order:x.orders?x.total/x.orders:0,received_rate:x.orders?x.received/x.orders*100:0})).sort((a,b)=>b.total-a.total);
    const stockRisk=products.map(p=>{const sold=(periodSales.flatMap(s=>s.items||[]).filter(i=>i.product_id===p.id).reduce((a,i)=>a+Number(i.quantity||0),0));const days=Math.max(1,(new Date(end+'T00:00:00')-new Date(start+'T00:00:00'))/86400000+1);const rate=sold/days;const stock=Number(p.stock_quantity||0);const min=Number(p.low_stock_level||0);const cover=rate?stock/rate:null;let risk='healthy';if(stock<=min)risk='critical';else if(cover!==null&&cover<=7)risk='high';else if(cover!==null&&cover<=14)risk='watch';return {id:p.id,name:p.name,sku:p.sku||'',stock,minimum:min,sold,days_cover:cover===null?null:Number(cover.toFixed(1)),risk}}).filter(x=>x.risk!=='healthy').sort((a,b)=>({critical:0,high:1,watch:2}[a.risk]-({critical:0,high:1,watch:2}[b.risk])||(a.days_cover??999)-(b.days_cover??999))).slice(0,10);
    const periodDays=Math.max(1,Math.round((new Date(end+'T00:00:00')-new Date(start+'T00:00:00'))/86400000)+1);
    const prevEndObj=new Date(new Date(start+'T00:00:00').getTime()-86400000), prevStartObj=new Date(prevEndObj.getTime()-(periodDays-1)*86400000);
    const prevStart=prevStartObj.toISOString().slice(0,10),prevEnd=prevEndObj.toISOString().slice(0,10);
    const prevSales=sales.filter(x=>saleDate(x)>=prevStart&&saleDate(x)<=prevEnd&&branchMatch(x));
    const prevExpenses=expenses.filter(x=>expDate(x)>=prevStart&&expDate(x)<=prevEnd&&branchMatch(x));
    const prevRevenue=prevSales.reduce((a,x)=>a+Number(x.total||0),0),prevProfit=prevSales.reduce((a,x)=>a+Number(x.profit||0),0),prevExpense=prevExpenses.reduce((a,x)=>a+Number(x.amount||0),0),prevNet=prevProfit-prevExpense;
    const pct=(a,b)=>b===0?(a===0?0:100):(a-b)/Math.abs(b)*100;
    const daily=[];for(let i=0;i<periodDays;i++){const d=new Date(new Date(start+'T00:00:00').getTime()+i*86400000),key=d.toISOString().slice(0,10);const ss=periodSales.filter(x=>saleDate(x)===key),ee=periodExpenses.filter(x=>expDate(x)===key);const rr=ss.reduce((a,x)=>a+Number(x.total||0),0),gp=ss.reduce((a,x)=>a+Number(x.profit||0),0),ex=ee.reduce((a,x)=>a+Number(x.amount||0),0);daily.push({date:key,revenue:Number(rr.toFixed(2)),gross_profit:Number(gp.toFixed(2)),expenses:Number(ex.toFixed(2)),net_profit:Number((gp-ex).toFixed(2))})}
    const alerts=[];
    if(revenue===0)alerts.push({severity:'medium',title:'No sales recorded',text:'There are no completed sales in the selected period.'});
    if(prevRevenue>0&&revenue<prevRevenue*.8)alerts.push({severity:'high',title:'Revenue is falling',text:`Revenue is ${Math.abs(pct(revenue,prevRevenue)).toFixed(1)}% below the previous period.`});
    if(prevRevenue>0&&revenue>prevRevenue*1.2)alerts.push({severity:'positive',title:'Revenue is growing',text:`Revenue is ${pct(revenue,prevRevenue).toFixed(1)}% above the previous period.`});
    if(netProfit<0)alerts.push({severity:'high',title:'Net loss detected',text:`The selected period produced a net loss of ${moneyText(Math.abs(netProfit))}.`});
    if(stockRisk.length)alerts.push({severity:'medium',title:'Inventory needs attention',text:`${stockRisk.length} product(s) are currently at or near a stock-risk level.`});
    if(grossMargin>0&&grossMargin<20)alerts.push({severity:'medium',title:'Gross margin is low',text:`Gross margin is ${grossMargin.toFixed(1)}%. Review pricing and supplier costs.`});
    if(!alerts.length)alerts.push({severity:'positive',title:'No major analytics warning',text:'BIGJOE found no major performance warning for this period.'});
    const recommendations=[];
    if(netProfit<0)recommendations.push('Reduce avoidable operating expenses and prioritize products with stronger margins.');
    if(categories[0])recommendations.push(`Protect ${categories[0].category}, your largest revenue category, and keep its key products in stock.`);
    if(stockRisk[0])recommendations.push(`Review ${stockRisk[0].name} and plan replenishment before stock reaches a critical level.`);
    if(supplierRows[0])recommendations.push(`Review purchasing concentration with ${supplierRows[0].supplier_name}; purchases total ${moneyText(supplierRows[0].total)} in this period.`);
    if(customerRows[0])recommendations.push(`Prioritize ${customerRows[0].name}, your highest-value customer in the selected period.`);
    if(!recommendations.length)recommendations.push('Continue recording complete sales, purchases and expenses to strengthen BIGJOE recommendations.');
    return json(res,200,{range:{start,end,branch_id:branchId,previous:{start:prevStart,end:prevEnd}},kpis:{sales:periodSales.length,revenue:Number(revenue.toFixed(2)),gross_profit:Number(grossProfit.toFixed(2)),expenses:Number(expenseTotal.toFixed(2)),net_profit:Number(netProfit.toFixed(2)),units:Number(units),average_sale:Number(avgSale.toFixed(2)),gross_margin:Number(grossMargin.toFixed(1)),net_margin:Number(netMargin.toFixed(1)),inventory_value:Number(inventoryValue.toFixed(2)),receivables:Number(receivables.toFixed(2)),payables:Number(payables.toFixed(2))},comparison:{revenue:Number(prevRevenue.toFixed(2)),gross_profit:Number(prevProfit.toFixed(2)),expenses:Number(prevExpense.toFixed(2)),net_profit:Number(prevNet.toFixed(2)),revenue_change:Number(pct(revenue,prevRevenue).toFixed(1)),profit_change:Number(pct(grossProfit,prevProfit).toFixed(1)),expense_change:Number(pct(expenseTotal,prevExpense).toFixed(1)),net_profit_change:Number(pct(netProfit,prevNet).toFixed(1))},daily,categories:categories.slice(0,10).map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),profit:Number(x.profit.toFixed(2)),margin:Number(x.margin.toFixed(1))})),branches:branchPerformance.slice(0,10),customers:customerRows.slice(0,10).map(x=>({...x,total:Number(x.total.toFixed(2)),avg_order:Number(x.avg_order.toFixed(2))})),suppliers:supplierRows.slice(0,10).map(x=>({...x,total:Number(x.total.toFixed(2)),avg_order:Number(x.avg_order.toFixed(2)),received_rate:Number(x.received_rate.toFixed(1))})),payment_methods:Object.entries(paymentMap).map(([method,total])=>({method,total:Number(total.toFixed(2))})).sort((a,b)=>b.total-a.total),stock_risk:stockRisk,alerts,recommendations,branch_options:branches});
  }

  if (method === "GET" && url.pathname === "/api/dashboard") {
    const u=requireUser(req,res,db); if(!u)return;
    ensureBranches(db,u);
    const requestedBranch=url.searchParams.get("branch_id");
    const selectedBranch=requestedBranch==='all'?null:getBranch(db,u,requestedBranch||u.active_branch_id);
    const branchId=selectedBranch?.id||null;
    const allSales=db.sales.filter(x=>x.user_id===u.id && x.status!=="cancelled" && x.status!=="returned" && (!branchId||x.branch_id===branchId));
    const today=new Date();
    const endParam=url.searchParams.get("end");
    const startParam=url.searchParams.get("start");
    const endDate=endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : today.toISOString().slice(0,10);
    const startDate=startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : new Date(today.getTime()-29*86400000).toISOString().slice(0,10);
    const inRange=allSales.filter(x=>{const d=String(x.created_at).slice(0,10);return d>=startDate&&d<=endDate});
    const revenue=inRange.reduce((a,s)=>a+Number(s.total||0),0);
    const profit=inRange.reduce((a,s)=>a+Number(s.profit||0),0);
    const cost=inRange.reduce((a,s)=>a+Number(s.cost_total||0),0);
    const rangeExpenses=db.expenses.filter(x=>x.user_id===u.id && (!branchId||x.branch_id===branchId) && String(x.date||x.created_at).slice(0,10)>=startDate && String(x.date||x.created_at).slice(0,10)<=endDate);
    const expensesTotal=rangeExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const netProfit=profit-expensesTotal;
    const expenseMap={};
    rangeExpenses.forEach(e=>{const k=e.category||"Other"; expenseMap[k]=(expenseMap[k]||0)+Number(e.amount||0)});
    const discount=inRange.reduce((a,s)=>a+Number(s.discount||0),0);
    const units=inRange.reduce((a,s)=>a+s.items.reduce((q,i)=>q+Number(i.quantity||0),0),0);
    const productMap={};
    inRange.forEach(s=>s.items.forEach(i=>{const k=i.product_id||i.sku||i.name; if(!productMap[k])productMap[k]={name:i.name,sku:i.sku||"",quantity:0,revenue:0,profit:0}; productMap[k].quantity+=Number(i.quantity||0); productMap[k].revenue+=Number(i.line_total||0); productMap[k].profit+=Number((Number(i.line_total||0)-Number(i.line_cost||0)).toFixed(2));}));
    const bestProducts=Object.values(productMap).sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,8);
    const paymentMap={}; inRange.forEach(s=>{const k=s.payment_method||"other"; paymentMap[k]=(paymentMap[k]||0)+Number(s.total||0)});
    const customerMap={}; inRange.forEach(s=>{const k=s.customer_id||"walkin"; const name=s.customer_name||"Walk-in customer"; if(!customerMap[k])customerMap[k]={name,total:0,purchases:0}; customerMap[k].total+=Number(s.total||0);customerMap[k].purchases+=1});
    const topCustomers=Object.values(customerMap).sort((a,b)=>b.total-a.total).slice(0,8);
    const products=db.products.filter(x=>x.user_id===u.id);
    const branchStockQuantity=p=>branchId?Number(branchStockRow(db,u,branchId,p.id,false)?.quantity||0):db.branches.filter(b=>b.user_id===u.id&&b.active!==false).reduce((sum,b)=>sum+Number(branchStockRow(db,u,b.id,p.id,false)?.quantity||0),0);
    const lowStock=products.filter(p=>branchStockQuantity(p)<=Number(p.low_stock_level)).sort((a,b)=>branchStockQuantity(a)-branchStockQuantity(b)).slice(0,10).map(p=>({name:p.name,sku:p.sku||"",stock:branchStockQuantity(p),level:Number(p.low_stock_level||0),unit:p.unit||"pcs"}));
    const inventoryValue=products.reduce((a,p)=>a+branchStockQuantity(p)*Number(p.cost_price||0),0);
    const daily=[]; const sd=new Date(startDate+'T00:00:00'); const ed=new Date(endDate+'T00:00:00');
    for(let d=new Date(sd);d<=ed;d.setDate(d.getDate()+1)){
      const key=d.toISOString().slice(0,10);
      const day=allSales.filter(x=>String(x.created_at).slice(0,10)===key);
      const dayExpenses=rangeExpenses.filter(x=>String(x.date||x.created_at).slice(0,10)===key);
      const dayRevenue=day.reduce((a,x)=>a+Number(x.total||0),0);
      const dayGross=day.reduce((a,x)=>a+Number(x.profit||0),0);
      const dayExpenseTotal=dayExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
      daily.push({date:key,sales:day.length,revenue:Number(dayRevenue.toFixed(2)),profit:Number(dayGross.toFixed(2)),expenses:Number(dayExpenseTotal.toFixed(2)),net_profit:Number((dayGross-dayExpenseTotal).toFixed(2))});
    }
    const avgSale=inRange.length?revenue/inRange.length:0;
    const grossMargin=revenue?(profit/revenue)*100:0;
    const netMargin=revenue?(netProfit/revenue)*100:0;
    const expenseRatio=revenue?(expensesTotal/revenue)*100:0;
    const lowStockCount=lowStock.length;
    const branchProductCount=products.filter(p=>branchStockQuantity(p)>0).length;
    const branchUnitCount=products.reduce((sum,p)=>sum+branchStockQuantity(p),0);
    let healthScore=50;
    if(revenue>0) healthScore+=Math.max(-20,Math.min(20,netMargin));
    if(grossMargin>=30) healthScore+=10; else if(grossMargin<15) healthScore-=10;
    if(expenseRatio>50) healthScore-=15; else if(expenseRatio<=20 && revenue>0) healthScore+=10;
    if(lowStockCount>0) healthScore-=Math.min(15,lowStockCount*3);
    healthScore=Math.max(0,Math.min(100,Math.round(healthScore)));
    const healthLabel=healthScore>=80?'Excellent':healthScore>=65?'Healthy':healthScore>=50?'Needs attention':'At risk';
    const productPerformance=Object.values(productMap).map(x=>({...x,margin:x.revenue?(x.profit/x.revenue)*100:0}));
    // Sales-velocity classification: do not call a product fast/slow until there is enough evidence.
    // We use sold quantity, distinct selling days, and the selected period length.
    const periodDays=Math.max(1,Math.round((new Date(endDate+'T00:00:00')-new Date(startDate+'T00:00:00'))/86400000)+1);
    const productDays={};
    inRange.forEach(s=>{const day=String(s.created_at).slice(0,10);s.items.forEach(i=>{const k=i.product_id||i.sku||i.name;(productDays[k]||(productDays[k]=new Set())).add(day);});});
    const velocityProducts=productPerformance.map(x=>{
      const days=(productDays[x.product_id||x.sku||x.name]||new Set()).size;
      const qtyPerDay=x.quantity/Math.max(1,days);
      let velocity='insufficient';
      let label='Insufficient data';
      if(x.quantity>0 && days>=2){
        const rate=x.quantity/periodDays;
        if(rate>=0.50 || qtyPerDay>=3){velocity='fast';label='Fast-moving';}
        else if(rate>=0.10 || qtyPerDay>=1){velocity='normal';label='Normal-moving';}
        else {velocity='slow';label='Slow-moving';}
      }
      return {...x,sales_days:days,units_per_selling_day:Number(qtyPerDay.toFixed(2)),velocity,velocity_label:label};
    });
    const fastMovers=velocityProducts.filter(x=>x.velocity==='fast').sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,5);
    const slowMovers=velocityProducts.filter(x=>x.velocity==='slow').sort((a,b)=>a.quantity-b.quantity||a.revenue-b.revenue).slice(0,5);
    const normalMovers=velocityProducts.filter(x=>x.velocity==='normal').sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,5);
    const insufficientMovers=velocityProducts.filter(x=>x.velocity==='insufficient').sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,5);
    const profitableProducts=[...productPerformance].sort((a,b)=>b.profit-a.profit).slice(0,5);

    // Advanced operational intelligence
    const stockInsights=products.filter(p=>p.user_id===u.id).map(p=>{
      const perf=productPerformance.find(x=>x.product_id===p.id);
      const quantitySold=Number(perf?.quantity||0);
      const dailyRate=periodDays>0?quantitySold/periodDays:0;
      const stock=branchStockQuantity(p);
      const minimum=Number(p.low_stock_level||0);
      const daysCover=dailyRate>0?stock/dailyRate:null;
      let risk='healthy', risk_label='Healthy';
      if(stock<=minimum){risk='critical';risk_label='Reorder now';}
      else if(daysCover!==null && daysCover<=7){risk='high';risk_label='Less than 7 days cover';}
      else if(daysCover!==null && daysCover<=14){risk='watch';risk_label='Less than 14 days cover';}
      return {product_id:p.id,name:p.name,sku:p.sku||'',stock,minimum,quantity_sold:quantitySold,
        daily_rate:Number(dailyRate.toFixed(2)),days_cover:daysCover===null?null:Number(daysCover.toFixed(1)),
        selling_price:Number(p.selling_price||0),cost_price:Number(p.cost_price||0),
        margin:Number((perf?.margin||0).toFixed(2)),risk,risk_label};
    }).sort((a,b)=>{
      const rank={critical:0,high:1,watch:2,healthy:3};
      return (rank[a.risk]-rank[b.risk]) || ((a.days_cover??999)-(b.days_cover??999));
    });

    const marginOpportunities=productPerformance
      .filter(x=>x.revenue>0 && x.margin<20)
      .sort((a,b)=>a.margin-b.margin || b.revenue-a.revenue)
      .slice(0,5)
      .map(x=>({...x,margin:Number(x.margin.toFixed(2))}));

    const expenseBreakdown=Object.entries(expenseMap)
      .map(([category,total])=>({category,total:Number(total.toFixed(2)),share:expensesTotal?Number(((total/expensesTotal)*100).toFixed(2)):0}))
      .sort((a,b)=>b.total-a.total);

    const expenseConcentration=expenseBreakdown.length?expenseBreakdown[0]:null;
    const stockRisk=stockInsights.filter(x=>x.risk!=='healthy').slice(0,5);

    const advisor=[];
    if(inRange.length===0) advisor.push({type:'info',title:'Start recording sales',text:'There are no completed sales in the selected period, so BIGJOE cannot yet judge sales velocity or profitability.'});
    if(revenue>0 && netProfit<0) advisor.push({type:'warning',title:'Protect cash flow',text:`Operating expenses of ₦${expensesTotal.toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})} exceed gross profit of ₦${profit.toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}. Review discretionary expenses and improve sales volume or margins.`});
    if(expenseRatio>30) advisor.push({type:'warning',title:'Expense pressure',text:`Operating expenses are ${expenseRatio.toFixed(1)}% of revenue. Track the largest expense categories and reduce avoidable costs where possible.`});
    if(fastMovers.length) advisor.push({type:'positive',title:'Restock fast movers',text:`${fastMovers[0].name} is currently classified as fast-moving. Monitor its stock level and avoid stock-outs.`});
    if(slowMovers.length) advisor.push({type:'warning',title:'Review slow movers',text:`${slowMovers[0].name} is classified as slow-moving. Consider promotion, pricing review, or reducing future purchases.`});
    if(insufficientMovers.length) advisor.push({type:'info',title:'Build more sales history',text:`${insufficientMovers.length} product${insufficientMovers.length===1?' has':'s have'} insufficient sales history for a reliable velocity classification. Keep recording sales before making stock decisions.`});
    if(lowStock.length) advisor.push({type:'warning',title:'Stock attention needed',text:`${lowStock.length} product${lowStock.length===1?'':'s'} are at or below their minimum stock level.`});
    if(stockRisk.length && !lowStock.length){
      const x=stockRisk[0];
      advisor.push({type:'warning',title:'Plan your next restock',text:`${x.name} has about ${x.days_cover??'limited'} days of stock cover based on the selected period. Review the supplier lead time before stock becomes critical.`});
    }
    if(marginOpportunities.length){
      const x=marginOpportunities[0];
      advisor.push({type:'warning',title:'Review product margin',text:`${x.name} is generating a ${x.margin.toFixed(1)}% gross margin. Review its cost price, selling price or supplier terms before scaling sales.`});
    }
    if(expenseConcentration && expenseConcentration.share>=50){
      advisor.push({type:'warning',title:'Expense concentration',text:`${expenseConcentration.category} accounts for ${expenseConcentration.share.toFixed(1)}% of operating expenses in this period. Review this category first when looking for cost savings.`});
    }
    if(!advisor.length) advisor.push({type:'positive',title:'Business looks stable',text:'BIGJOE does not see a major issue in the selected period. Continue monitoring sales, margins, expenses and stock.'});

    // v26 Performance Intelligence: compare the selected period with the immediately preceding period.
    const previousEndObj=new Date(sd.getTime()-86400000);
    const previousStartObj=new Date(previousEndObj.getTime()-(periodDays-1)*86400000);
    const previousStart=previousStartObj.toISOString().slice(0,10), previousEnd=previousEndObj.toISOString().slice(0,10);
    const previousSales=allSales.filter(x=>{const d=String(x.created_at).slice(0,10);return d>=previousStart&&d<=previousEnd});
    const previousExpenses=db.expenses.filter(x=>x.user_id===u.id&&String(x.date||x.created_at).slice(0,10)>=previousStart&&String(x.date||x.created_at).slice(0,10)<=previousEnd);
    const prevRevenue=previousSales.reduce((a,x)=>a+Number(x.total||0),0);
    const prevProfit=previousSales.reduce((a,x)=>a+Number(x.profit||0),0);
    const prevExpenses=previousExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
    const prevNet=prevProfit-prevExpenses;
    const pct=(cur,prev)=>prev===0?(cur===0?0:100):((cur-prev)/Math.abs(prev))*100;
    const comparison={previous_range:{start:previousStart,end:previousEnd},revenue:Number(prevRevenue.toFixed(2)),profit:Number(prevProfit.toFixed(2)),expenses:Number(prevExpenses.toFixed(2)),net_profit:Number(prevNet.toFixed(2)),sales:previousSales.length,revenue_change:Number(pct(revenue,prevRevenue).toFixed(1)),profit_change:Number(pct(profit,prevProfit).toFixed(1)),expense_change:Number(pct(expensesTotal,prevExpenses).toFixed(1)),net_profit_change:Number(pct(netProfit,prevNet).toFixed(1))};

    // v26 actionable alerts, intentionally deterministic and based only on recorded business data.
    // v32 Business Decision Centre: turn recorded data into concise management decisions.
    const customerHistory={};
    allSales.forEach(sale=>{
      const cid=sale.customer_id||'walkin';
      if(cid==='walkin') return;
      const d=String(sale.created_at||'').slice(0,10);
      if(!customerHistory[cid]) customerHistory[cid]={name:sale.customer_name||'Customer',orders:0,total:0,last_purchase:d,first_purchase:d};
      const c=customerHistory[cid]; c.orders+=1; c.total+=Number(sale.total||0);
      if(d>c.last_purchase)c.last_purchase=d; if(d<c.first_purchase)c.first_purchase=d;
    });
    const todayKey=today.toISOString().slice(0,10);
    const daysBetween=(a,b)=>Math.max(0,Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000));
    const customerValues=Object.values(customerHistory);
    const activeCustomers=customerValues.filter(c=>c.last_purchase>=startDate&&c.last_purchase<=endDate).length;
    const newCustomers=customerValues.filter(c=>c.first_purchase>=startDate&&c.first_purchase<=endDate).length;
    const atRiskCustomers=customerValues.filter(c=>daysBetween(c.last_purchase,todayKey)>=30).sort((a,b)=>b.total-a.total).slice(0,5);
    const repeatCustomers=customerValues.filter(c=>c.orders>=2).length;
    const inventoryAtRisk=stockRisk.reduce((sum,x)=>sum+Number(x.stock||0)*Number(x.cost_price||0),0);
    const lowMarginProducts=productPerformance.filter(x=>x.revenue>0&&x.margin<20).length;
    const strongestProduct=[...productPerformance].sort((a,b)=>b.profit-a.profit)[0]||null;
    const weakestMargin=[...productPerformance].filter(x=>x.revenue>0).sort((a,b)=>a.margin-b.margin)[0]||null;
    const decisionActions=[];
    if(comparison.revenue_change<=-10) decisionActions.push({priority:'high',title:'Recover sales momentum',text:`Revenue is ${Math.abs(comparison.revenue_change).toFixed(1)}% below the previous period. Focus on your best customers and best-selling products.`});
    else if(comparison.revenue_change>=10) decisionActions.push({priority:'positive',title:'Scale what is working',text:`Revenue is ${comparison.revenue_change.toFixed(1)}% above the previous period. Protect stock levels and repeat the strongest sales activities.`});
    if(netProfit<0) decisionActions.push({priority:'high',title:'Protect profitability',text:'Net profit is negative. Review operating expenses and low-margin products before increasing spending.'});
    if(inventoryAtRisk>0) decisionActions.push({priority:'high',title:'Protect stock investment',text:`About ${moneyText(inventoryAtRisk)} of inventory is tied up in products currently flagged for stock risk.`});
    if(atRiskCustomers.length) decisionActions.push({priority:'medium',title:'Reconnect customers',text:`${atRiskCustomers.length} valuable customer(s) have not purchased for at least 30 days. Consider a targeted follow-up or offer.`});
    if(weakestMargin) decisionActions.push({priority:'medium',title:'Review the weakest margin',text:`${weakestMargin.name} has the lowest recorded gross margin at ${weakestMargin.margin.toFixed(1)}%. Check supplier cost and selling price.`});
    if(!decisionActions.length) decisionActions.push({priority:'positive',title:'Keep the current strategy',text:'No urgent management decision is indicated by the current sales, profit, customer and inventory data.'});
    const decisionCentre={score:healthScore,label:healthLabel,metrics:{revenue_growth:Number(comparison.revenue_change.toFixed(1)),gross_margin:Number(grossMargin.toFixed(1)),net_margin:Number(netMargin.toFixed(1)),active_customers:activeCustomers,new_customers:newCustomers,repeat_customers:repeatCustomers,at_risk_customers:atRiskCustomers.length,inventory_at_risk:Number(inventoryAtRisk.toFixed(2)),low_margin_products:lowMarginProducts},strongest_product:strongestProduct?{name:strongestProduct.name,profit:Number(strongestProduct.profit.toFixed(2)),margin:Number(strongestProduct.margin.toFixed(1))}:null,weakest_margin:weakestMargin?{name:weakestMargin.name,margin:Number(weakestMargin.margin.toFixed(1))}:null,at_risk_customers:atRiskCustomers,actions:decisionActions.slice(0,5)};

    const alerts=[];
    if(revenue>0&&prevRevenue>0&&revenue<prevRevenue*0.8) alerts.push({severity:'high',title:'Sales are down',text:`Revenue is ${Math.abs(comparison.revenue_change).toFixed(1)}% lower than the previous period.`});
    if(revenue>0&&prevRevenue>0&&revenue>prevRevenue*1.2) alerts.push({severity:'positive',title:'Sales are growing',text:`Revenue is ${comparison.revenue_change.toFixed(1)}% higher than the previous period.`});
    if(prevExpenses>0&&expensesTotal>prevExpenses*1.2) alerts.push({severity:'high',title:'Expenses increased',text:`Operating expenses are ${comparison.expense_change.toFixed(1)}% higher than the previous period.`});
    if(netProfit<0) alerts.push({severity:'high',title:'Net loss detected',text:`The selected period ended with a net loss of ${moneyText(Math.abs(netProfit))}.`});
    if(lowStock.length) alerts.push({severity:'medium',title:'Stock replenishment needed',text:`${lowStock.length} product${lowStock.length===1?' is':'s are'} at or below the minimum stock level.`});
    if(comparison.revenue_change<=-20&&comparison.expense_change>=20) alerts.push({severity:'high',title:'Margin pressure',text:'Revenue is falling while operating expenses are rising. Review pricing, sales volume and discretionary spending.'});
    if(!alerts.length) alerts.push({severity:'positive',title:'No urgent alert',text:'BIGJOE found no major automated warning in the selected period.'});

    return json(res,200,{range:{start:startDate,end:endDate},branch:{id:branchId,name:selectedBranch?.name||'All branches',scope:requestedBranch==='all'?'all':(selectedBranch?'branch':'active')},summary:{sales:inRange.length,revenue:Number(revenue.toFixed(2)),profit:Number(profit.toFixed(2)),cost:Number(cost.toFixed(2)),discount:Number(discount.toFixed(2)),units:Number(units),average_sale:Number(avgSale.toFixed(2)),inventory_value:Number(inventoryValue.toFixed(2)),products_count:branchProductCount,stock_units:Number(branchUnitCount.toFixed(2)),expenses:Number(expensesTotal.toFixed(2)),net_profit:Number(netProfit.toFixed(2)),gross_margin:Number(grossMargin.toFixed(2)),net_margin:Number(netMargin.toFixed(2)),expense_ratio:Number(expenseRatio.toFixed(2))},comparison,business_health:{score:healthScore,label:healthLabel},decision_centre:decisionCentre,alerts,sales_velocity:{period_days:periodDays,fast_count:fastMovers.length,normal_count:normalMovers.length,slow_count:slowMovers.length,insufficient_count:insufficientMovers.length},best_products:bestProducts.map(x=>({...x,revenue:Number(x.revenue.toFixed(2)),profit:Number(x.profit.toFixed(2)),margin:Number((x.revenue?(x.profit/x.revenue)*100:0).toFixed(2))})),fast_movers:fastMovers.map(x=>({...x,margin:Number(x.margin.toFixed(2))})),normal_movers:normalMovers.map(x=>({...x,margin:Number(x.margin.toFixed(2))})),slow_movers:slowMovers.map(x=>({...x,margin:Number(x.margin.toFixed(2))})),insufficient_movers:insufficientMovers.map(x=>({...x,margin:Number(x.margin.toFixed(2))})),profitable_products:profitableProducts.map(x=>({...x,margin:Number(x.margin.toFixed(2))})),advisor,payment_methods:Object.entries(paymentMap).map(([method,total])=>({method,total:Number(total.toFixed(2))})).sort((a,b)=>b.total-a.total),expense_categories:expenseBreakdown,expense_concentration:expenseConcentration,stock_insights:stockInsights,stock_risk:stockRisk,margin_opportunities:marginOpportunities,top_customers:topCustomers.map(x=>({...x,total:Number(x.total.toFixed(2))})),low_stock:lowStock,daily,branch_options:db.branches.filter(b=>b.user_id===u.id&&b.active!==false).map(b=>({id:b.id,name:b.name,is_active:String(b.id)===String(u.active_branch_id)}))});
  }

  // ---------- Supplier & Procurement Intelligence (v35) ----------
  if(method==='GET'&&url.pathname==='/api/procurement-intelligence'){
    const u=requireUser(req,res,db);if(!u)return;
    const purchases=db.purchases.filter(x=>x.user_id===u.id&&!['cancelled','returned'].includes(x.status));
    const payments=db.supplier_payments.filter(x=>x.user_id===u.id);
    const suppliers=db.suppliers.filter(x=>x.user_id===u.id);
    const products=db.products.filter(x=>x.user_id===u.id);
    const supplierMap={};
    const productMap={};
    for(const po of purchases){
      const supplier=supplierMap[po.supplier_id] ||= {supplier_id:po.supplier_id,supplier_name:po.supplier_name||'Supplier',orders:0,total:0,received:0,last_purchase:'',outstanding:0};
      supplier.orders++; supplier.total+=Number(po.total||0); if(po.status==='received')supplier.received++;
      if(String(po.date||'')>String(supplier.last_purchase||''))supplier.last_purchase=po.date||'';
      const paid=payments.filter(x=>x.purchase_id===po.id).reduce((a,x)=>a+Number(x.amount||0),0); supplier.outstanding+=Math.max(0,Number(po.total||0)-paid);
      for(const item of (po.items||[])){
        const key=item.product_id||item.sku||item.name; const pr=productMap[key] ||= {product_id:item.product_id,name:item.name,sku:item.sku||'',supplier_ids:{},units:0,total_cost:0,costs:[],last_cost:0,last_date:'',supplier_name:''};
        const q=Number(item.quantity||0), c=Number(item.unit_cost||0); pr.units+=q; pr.total_cost+=q*c; pr.costs.push(c); if(c>0&&(!pr.last_date||String(po.date||'')>=pr.last_date)){pr.last_cost=c;pr.last_date=po.date||'';pr.supplier_name=po.supplier_name||'';} if(po.supplier_id)pr.supplier_ids[po.supplier_id]=true;
      }
    }
    const supplierRows=Object.values(supplierMap).map(x=>({...x,total:Number(x.total.toFixed(2)),outstanding:Number(x.outstanding.toFixed(2)),avg_order:x.orders?Number((x.total/x.orders).toFixed(2)):0,received_rate:x.orders?Number((x.received/x.orders*100).toFixed(1)):0})).sort((a,b)=>b.total-a.total);
    const costChanges=[];
    for(const pr of Object.values(productMap)){
      const vals=pr.costs.filter(Number.isFinite).sort((a,b)=>a-b); if(!vals.length)continue;
      const best=vals[0], avg=vals.reduce((a,b)=>a+b,0)/vals.length, current=pr.last_cost||vals[vals.length-1];
      const prior=vals.length>1?vals[vals.length-2]:null; const change=prior&&prior>0?((current-prior)/prior*100):0;
      costChanges.push({product_id:pr.product_id,name:pr.name,sku:pr.sku,current_cost:Number(current.toFixed(2)),previous_cost:prior===null?null:Number(prior.toFixed(2)),best_cost:Number(best.toFixed(2)),average_cost:Number(avg.toFixed(2)),change_pct:Number(change.toFixed(1)),potential_saving_per_unit:Number(Math.max(0,current-best).toFixed(2)),supplier_name:pr.supplier_name,last_date:pr.last_date});
    }
    const productRows=costChanges.map(x=>{const prod=products.find(p=>p.id===x.product_id);const stock=Number(prod?.stock_quantity||0);return {...x,stock,stock_value:Number((stock*Number(prod?.cost_price||x.current_cost||0)).toFixed(2)),margin_pressure:x.change_pct>=10?'high':x.change_pct>=5?'medium':'normal'};}).sort((a,b)=>b.change_pct-a.change_pct);
    const savings=productRows.filter(x=>x.potential_saving_per_unit>0).map(x=>({...x,estimated_saving:Number((x.potential_saving_per_unit*Math.max(0,Number(x.stock||0))).toFixed(2))})).sort((a,b)=>b.estimated_saving-a.estimated_saving);
    const recommendations=[];
    const priceRisks=productRows.filter(x=>x.change_pct>=10).slice(0,5);
    priceRisks.forEach(x=>recommendations.push({severity:'high',title:`Review ${x.name} purchase cost`,text:`Latest cost is ${moneyText(x.current_cost)}, up ${x.change_pct}% versus the previous recorded cost. Check alternative suppliers or negotiate before the next order.`}));
    const saving=savings[0]; if(saving)recommendations.push({severity:'positive',title:`Potential procurement saving on ${saving.name}`,text:`Historical best cost is ${moneyText(saving.best_cost)} versus the latest ${moneyText(saving.current_cost)}. Potential stock-based saving is about ${moneyText(saving.estimated_saving)}.`});
    const overdue=supplierRows.filter(x=>x.outstanding>0).sort((a,b)=>b.outstanding-a.outstanding)[0]; if(overdue)recommendations.push({severity:'medium',title:`Plan payment to ${overdue.supplier_name}`,text:`Outstanding supplier balance is ${moneyText(overdue.outstanding)}. Schedule payment alongside expected cash inflows.`});
    const reorder=products.map(prod=>{const rel=purchases.flatMap(po=>(po.items||[]).filter(i=>i.product_id===prod.id).map(i=>({po,i}))).filter(x=>x.po.status==='received');const qty=rel.reduce((a,x)=>a+Number(x.i.quantity||0),0);const avg30=qty/30;const stock=Number(prod.stock_quantity||0),min=Number(prod.low_stock_level||0);return {...prod,daily_purchase_rate:avg30,stock,min};}).filter(x=>x.stock<=x.min).sort((a,b)=>a.stock-b.stock).slice(0,8); reorder.forEach(x=>recommendations.push({severity:'medium',title:`Restock ${x.name}`,text:`Current stock is ${x.stock}, at or below the minimum level of ${x.min}. Review supplier price and availability before ordering.`}));
    if(!recommendations.length)recommendations.push({severity:'positive',title:'Procurement position is stable',text:'No major supplier price increase, payable concentration or immediate procurement risk was detected.'});
    return json(res,200,{summary:{suppliers:suppliers.length,suppliers_with_purchases:supplierRows.length,total_purchases:Number(supplierRows.reduce((a,x)=>a+x.total,0).toFixed(2)),outstanding_payables:Number(supplierRows.reduce((a,x)=>a+x.outstanding,0).toFixed(2)),price_risks:priceRisks.length,potential_savings:Number(savings.reduce((a,x)=>a+x.estimated_saving,0).toFixed(2))},suppliers:supplierRows,products:productRows,price_risks:priceRisks,savings:savings.slice(0,10),recommendations});
  }

  // ---------- Purchases, Stock Receiving & Supplier Payables ----------
  if(method==='GET'&&url.pathname==='/api/purchases'){
    const u=requireUser(req,res,db);if(!u)return;
    const requestedBranch=url.searchParams.get('branch_id');
    const branchFilter=requestedBranch==='all'?null:(requestedBranch?getBranch(db,u,requestedBranch)?.id:(u.active_branch_id||null));
    const purchases=db.purchases.filter(x=>x.user_id===u.id&&(!branchFilter||x.branch_id===branchFilter)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const payments=db.supplier_payments.filter(x=>x.user_id===u.id);
    const rows=purchases.map(p=>{const paid=payments.filter(x=>x.purchase_id===p.id).reduce((a,x)=>a+Number(x.amount||0),0);const outstanding=Math.max(0,Number(p.total||0)-paid);const receiptStatus=['received','partially_received'].includes(String(p.status||''))?String(p.status):'ordered';
      const paymentStatus=outstanding<=0.009?'paid':(paid>0?'partially_paid':'unpaid');
      const computed=receiptStatus==='received'?(paymentStatus==='paid'?'received_paid':'received'):receiptStatus==='partially_received'?(paymentStatus==='paid'?'partially_received_paid':'partially_received'):paymentStatus==='paid'?'paid':paymentStatus==='partially_paid'?'partially_paid':'ordered';
      return {...p,amount_paid:Number(paid.toFixed(2)),outstanding:Number(outstanding.toFixed(2)),payment_status:paymentStatus,computed_status:computed};});
    const total=rows.reduce((a,x)=>a+Number(x.total||0),0), paid=rows.reduce((a,x)=>a+Number(x.amount_paid||0),0);
    const bySupplier={};rows.filter(x=>x.outstanding>0).forEach(x=>{const k=x.supplier_id||'unknown';if(!bySupplier[k])bySupplier[k]={supplier_id:k,supplier_name:x.supplier_name||'Supplier',purchases:0,outstanding:0};bySupplier[k].purchases++;bySupplier[k].outstanding+=x.outstanding;});
    const supplierBalances=Object.values(bySupplier).sort((a,b)=>b.outstanding-a.outstanding).map(x=>({...x,outstanding:Number(x.outstanding.toFixed(2))}));
    return json(res,200,{purchases:rows, payments:payments.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,50),supplier_balances:supplierBalances,summary:{count:rows.length,total:Number(total.toFixed(2)),paid:Number(paid.toFixed(2)),outstanding:Number((total-paid).toFixed(2)),received:rows.filter(x=>x.status==='received').length,ordered:rows.filter(x=>x.status==='ordered').length}});
  }
  if(method==='POST'&&url.pathname==='/api/purchases'){
    const u=requireUser(req,res,db);if(!u)return;const b=await body(req); ensureBranches(db,u); const activeBranch=getBranch(db,u,b.branch_id||u.active_branch_id); if(!activeBranch)return json(res,400,{error:'Please select an active branch.'});
    const supplier_id=String(b.supplier_id||'');const supplier=db.suppliers.find(x=>x.id===supplier_id&&x.user_id===u.id);if(!supplier)return json(res,400,{error:'Please select a valid supplier.'});
    const items=Array.isArray(b.items)?b.items:[];if(!items.length)return json(res,400,{error:'Add at least one purchase item.'});
    const normalized=[];for(const raw of items){const product=db.products.find(x=>x.id===String(raw.product_id||'')&&x.user_id===u.id);if(!product)return json(res,400,{error:'One or more products are invalid.'});const quantity=Number(raw.quantity||0),unit_cost=Number(raw.unit_cost||0);if(quantity<=0||unit_cost<0)return json(res,400,{error:'Purchase quantity and unit cost must be valid.'});normalized.push({product_id:product.id,name:product.name,sku:product.sku||'',unit:product.unit||'pcs',quantity,received_quantity:0,unit_cost,total:Number((quantity*unit_cost).toFixed(2))});}
    const subtotal=normalized.reduce((a,x)=>a+x.total,0),discount=Math.max(0,Number(b.discount||0)),tax=Math.max(0,Number(b.tax||0)),total=Math.max(0,subtotal-discount+tax);
    const purchase={id:id(),user_id:u.id,branch_id:activeBranch.id,branch_name:activeBranch.name,number:docNo(db.purchases,'PO',u.id),supplier_id:supplier.id,supplier_name:supplier.name,items:normalized,subtotal:Number(subtotal.toFixed(2)),discount:Number(discount.toFixed(2)),tax:Number(tax.toFixed(2)),total:Number(total.toFixed(2)),date:String(b.date||new Date().toISOString().slice(0,10)),due_date:String(b.due_date||''),status:['ordered','received','cancelled'].includes(b.status)?b.status:'ordered',notes:String(b.notes||'').trim(),received_at:'',created_at:now(),updated_at:now()};
    db.purchases.push(purchase);
    if(purchase.status==='received'){
      for(const item of purchase.items){const product=db.products.find(x=>x.id===item.product_id&&x.user_id===u.id);if(!product)return json(res,400,{error:`Product ${item.name} no longer exists.`});const oldQty=Number(product.stock_quantity||0),oldCost=Number(product.cost_price||0),qty=Number(item.quantity||0),cost=Number(item.unit_cost||0),newQty=oldQty+qty;product.cost_price=newQty>0?Number(((oldQty*oldCost+qty*cost)/newQty).toFixed(2)):cost;product.stock_quantity=newQty; const bs=branchStockRow(db,u,p.branch_id||u.active_branch_id,product.id,true); bs.quantity=Number((Number(bs.quantity||0)+qty).toFixed(2)); bs.updated_at=now(); product.updated_at=now(); recordInventoryMovement(db,u,product,qty,"purchase",`Purchase received`,purchase.number,p.branch_id||u.active_branch_id);}
      purchase.items.forEach(i=>{i.received_quantity=Number(i.quantity||0)}); purchase.received_at=now();
    }
    activity(db,u.id,'purchase',purchase.number,`Purchase order ${purchase.number} created for ${moneyText(purchase.total)} from ${supplier.name}.`);dbWrite(db);return json(res,201,{success:true,purchase});
  }
  if(method==='GET'&&url.pathname.match(/^\/api\/purchases\/[^/]+$/)){const u=requireUser(req,res,db);if(!u)return;const pid=url.pathname.split('/').pop(),p=db.purchases.find(x=>x.id===pid&&x.user_id===u.id);if(!p)return json(res,404,{error:'Purchase not found.'});const pays=db.supplier_payments.filter(x=>x.purchase_id===p.id&&x.user_id===u.id);const paid=pays.reduce((a,x)=>a+Number(x.amount||0),0);return json(res,200,{purchase:{...p,amount_paid:Number(paid.toFixed(2)),outstanding:Number(Math.max(0,p.total-paid).toFixed(2))},payments:pays});}
  if(method==='POST'&&url.pathname.match(/^\/api\/purchases\/[^/]+\/receive$/)){
    const u=requireUser(req,res,db);if(!u)return;const pid=url.pathname.split('/')[3],p=db.purchases.find(x=>x.id===pid&&x.user_id===u.id);if(!p)return json(res,404,{error:'Purchase not found.'});if(p.status==='cancelled')return json(res,400,{error:'A cancelled purchase cannot be received.'});if(p.status==='received')return json(res,400,{error:'This purchase has already been fully received.'});
    const b=await body(req),requested=Array.isArray(b.items)?b.items:[],map={};requested.forEach(x=>{map[String(x.product_id)]=Number(x.quantity||0)});let receivedNow=0;
    for(const item of p.items){const product=db.products.find(x=>x.id===item.product_id&&x.user_id===u.id);if(!product)return json(res,400,{error:`Product ${item.name} no longer exists.`});const ordered=Number(item.quantity||0),already=Number(item.received_quantity||0),remaining=Math.max(0,ordered-already);let qty=requested.length?Math.max(0,map[item.product_id]||0):remaining;if(qty>remaining+0.0001)return json(res,400,{error:`Received quantity for ${item.name} cannot exceed ${remaining}.`});if(qty<=0)continue;const oldQty=Number(product.stock_quantity||0),oldCost=Number(product.cost_price||0),cost=Number(item.unit_cost||0),newQty=oldQty+qty;product.cost_price=newQty>0?Number(((oldQty*oldCost+qty*cost)/newQty).toFixed(2)):cost;product.stock_quantity=newQty;const bs=branchStockRow(db,u,p.branch_id||u.active_branch_id,product.id,true);bs.quantity=Number((Number(bs.quantity||0)+qty).toFixed(2));bs.updated_at=now();product.updated_at=now();item.received_quantity=Number((already+qty).toFixed(2));receivedNow+=qty;recordInventoryMovement(db,u,product,qty,'purchase',`Purchase ${p.number} received`,p.number,p.branch_id||u.active_branch_id);}
    if(receivedNow<=0)return json(res,400,{error:'No quantity was received. Enter at least one quantity greater than zero.'});
    const fully=p.items.every(i=>Number(i.received_quantity||0)>=Number(i.quantity||0)-0.0001);p.status=fully?'received':'partially_received';p.received_at=p.received_at||now();p.updated_at=now();activity(db,u.id,'purchase-received',p.number,`Purchase ${p.number} received ${receivedNow} unit(s). ${fully?'Purchase is now fully received.':'Purchase remains partially received.'}`);dbWrite(db);return json(res,200,{success:true,purchase:p,received_now:receivedNow});
  }
  if(method==='POST'&&url.pathname.match(/^\/api\/purchases\/[^/]+\/payments$/)){
    const u=requireUser(req,res,db);if(!u)return;const pid=url.pathname.split('/')[3],p=db.purchases.find(x=>x.id===pid&&x.user_id===u.id);if(!p)return json(res,404,{error:'Purchase not found.'});if(p.status==='cancelled')return json(res,400,{error:'Cancelled purchases cannot receive payments.'});const b=await body(req),amount=Number(b.amount||0);if(amount<=0)return json(res,400,{error:'Payment amount must be greater than zero.'});const paid=db.supplier_payments.filter(x=>x.purchase_id===p.id&&x.user_id===u.id).reduce((a,x)=>a+Number(x.amount||0),0);if(amount>p.total-paid+0.01)return json(res,400,{error:`Payment exceeds outstanding balance of ${moneyText(Math.max(0,p.total-paid))}.`});const pay={id:id(),user_id:u.id,purchase_id:p.id,purchase_number:p.number,supplier_id:p.supplier_id,supplier_name:p.supplier_name,amount:Number(amount.toFixed(2)),payment_date:String(b.payment_date||new Date().toISOString().slice(0,10)),payment_method:String(b.payment_method||'cash'),reference:String(b.reference||'').trim(),notes:String(b.notes||'').trim(),created_at:now()};db.supplier_payments.push(pay);dbWrite(db);return json(res,201,{success:true,payment:pay,outstanding:Number(Math.max(0,p.total-paid-amount).toFixed(2))});
  }
  if(method==='DELETE'&&url.pathname.match(/^\/api\/supplier-payments\/[^/]+$/)){const u=requireUser(req,res,db);if(!u)return;const pid=url.pathname.split('/').pop(),before=db.supplier_payments.length;db.supplier_payments=db.supplier_payments.filter(x=>!(x.id===pid&&x.user_id===u.id));if(before===db.supplier_payments.length)return json(res,404,{error:'Supplier payment not found.'});dbWrite(db);return json(res,200,{success:true});}

  // ---------- Invoices & Quotations ----------
  function docNo(list,prefix,uid){const y=new Date().getFullYear();const n=list.filter(x=>x.user_id===uid&&String(x.number||'').startsWith(prefix+'-'+y+'-')).length+1;return `${prefix}-${y}-${String(n).padStart(5,'0')}`;}
  function docItems(raw){return (Array.isArray(raw)?raw:[]).map(i=>({product_id:i.product_id?String(i.product_id):null,name:String(i.name||'').trim(),quantity:Number(i.quantity||0),unit_price:Number(i.unit_price||0)})).filter(i=>i.name&&i.quantity>0&&i.unit_price>=0).map(i=>({...i,line_total:Number((i.quantity*i.unit_price).toFixed(2))}));}
  function docCustomer(db,u,b){const idc=b.customer_id?String(b.customer_id):null;if(idc&&!db.customers.some(c=>c.id===idc&&c.user_id===u.id))throw Error('Invalid customer.');const c=idc?db.customers.find(c=>c.id===idc&&c.user_id===u.id):null;return {customer_id:idc,customer_name:c?.name||String(b.customer_name||'').trim()||'Customer',customer_phone:c?.phone||String(b.customer_phone||'').trim(),customer_email:c?.email||String(b.customer_email||'').trim(),customer_address:c?.address||String(b.customer_address||'').trim()};}
  function makeDoc(db,u,b,type){const items=docItems(b.items);if(!items.length)throw Error('Add at least one valid item.');const subtotal=items.reduce((a,i)=>a+i.line_total,0),discount=Math.min(Math.max(0,Number(b.discount||0)),subtotal),tax=Math.max(0,Number(b.tax||0));const x={id:id(),user_id:u.id,number:docNo(type==='invoice'?db.invoices:db.quotations,type==='invoice'?'INV':'QUO',u.id),...docCustomer(db,u,b),items,subtotal:Number(subtotal.toFixed(2)),discount:Number(discount.toFixed(2)),tax:Number(tax.toFixed(2)),total:Number((subtotal-discount+tax).toFixed(2)),branch_id:(b.branch_id?String(b.branch_id):(u.active_branch_id||null)),notes:String(b.notes||'').trim().slice(0,1500),terms:String(b.terms||'').trim().slice(0,2000),created_at:now(),updated_at:now()};if(type==='invoice')Object.assign(x,{status:['draft','sent','paid','partially_paid','overdue','cancelled'].includes(String(b.status))?String(b.status):'draft',due_date:/^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date||''))?String(b.due_date):''});else Object.assign(x,{status:['draft','sent','accepted','rejected','expired'].includes(String(b.status))?String(b.status):'draft',valid_until:/^\d{4}-\d{2}-\d{2}$/.test(String(b.valid_until||''))?String(b.valid_until):''});return x;}
  if(method==='GET'&&url.pathname==='/api/invoices'){const u=requireUser(req,res,db);if(!u)return;const a=db.invoices.filter(x=>x.user_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));return json(res,200,{invoices:a,summary:{count:a.length,total:a.reduce((s,x)=>s+x.total,0),paid:a.filter(x=>x.status==='paid').reduce((s,x)=>s+x.total,0),outstanding:a.filter(x=>!['paid','cancelled'].includes(x.status)).reduce((s,x)=>s+x.total,0)}});}
  if(method==='POST'&&url.pathname==='/api/invoices'){const u=requireUser(req,res,db);if(!u)return;try{const x=makeDoc(db,u,await body(req),'invoice');db.invoices.push(x);activity(db,u.id,'invoice',x.number,`Invoice ${x.number} created for ${moneyText(x.total)}.`);dbWrite(db);return json(res,201,{success:true,invoice:x});}catch(e){return json(res,400,{error:e.message});}}
  if(method==='GET'&&url.pathname.startsWith('/api/invoices/')){const u=requireUser(req,res,db);if(!u)return;const x=db.invoices.find(x=>x.id===url.pathname.split('/').pop()&&x.user_id===u.id);if(!x)return json(res,404,{error:'Invoice not found.'});return json(res,200,{invoice:x});}
  if(method==='PUT'&&url.pathname.startsWith('/api/invoices/')){const u=requireUser(req,res,db);if(!u)return;try{const old=db.invoices.find(x=>x.id===url.pathname.split('/').pop()&&x.user_id===u.id);if(!old)return json(res,404,{error:'Invoice not found.'});const x=makeDoc(db,u,await body(req),'invoice');Object.assign(old,x,{id:old.id,user_id:u.id,number:old.number,created_at:old.created_at,updated_at:now()});dbWrite(db);return json(res,200,{success:true,invoice:old});}catch(e){return json(res,400,{error:e.message});}}
  if(method==='DELETE'&&url.pathname.startsWith('/api/invoices/')){const u=requireUser(req,res,db);if(!u)return;const idd=url.pathname.split('/').pop(),n=db.invoices.length;db.invoices=db.invoices.filter(x=>!(x.id===idd&&x.user_id===u.id));if(n===db.invoices.length)return json(res,404,{error:'Invoice not found.'});dbWrite(db);return json(res,200,{success:true});}
  // Customer payments & receivables
  if(method==='GET'&&url.pathname==='/api/receivables'){
    const u=requireUser(req,res,db);if(!u)return;
    const today=new Date().toISOString().slice(0,10);
    ensureBranches(db,u);
    const requestedBranch=url.searchParams.get("branch_id");
    const selectedBranch=requestedBranch==='all'?null:getBranch(db,u,requestedBranch||u.active_branch_id);
    const branchId=selectedBranch?.id||null;
    const inv=db.invoices.filter(x=>x.user_id===u.id&&!['cancelled'].includes(x.status)&&(!branchId||x.branch_id===branchId));
    const payments=db.receivable_payments.filter(x=>x.user_id===u.id);
    const rows=inv.map(x=>{
      const paid=payments.filter(p=>p.invoice_id===x.id).reduce((a,p)=>a+Number(p.amount||0),0);
      const total=Number(x.total||0), outstanding=Math.max(0,total-paid);
      let status=x.status;
      if(outstanding<=0) status='paid';
      else if(x.due_date&&x.due_date<today) status='overdue';
      else if(paid>0) status='partially_paid';
      else if(status==='paid'||status==='partially_paid'||status==='overdue') status='sent';
      if(x.status!==status){x.status=status;x.updated_at=now();}
      return {...x,amount_paid:Number(paid.toFixed(2)),outstanding:Number(outstanding.toFixed(2)),computed_status:status};
    }).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    dbWrite(db);
    const totalInvoiced=rows.reduce((a,x)=>a+Number(x.total||0),0), totalPaid=rows.reduce((a,x)=>a+Number(x.amount_paid||0),0), outstanding=Math.max(0,totalInvoiced-totalPaid);
    const overdue=rows.filter(x=>x.outstanding>0&&x.computed_status==='overdue');
    const customerMap={};
    rows.filter(x=>x.outstanding>0).forEach(x=>{const k=x.customer_id||x.customer_name||'unknown';if(!customerMap[k])customerMap[k]={customer_id:x.customer_id||null,name:x.customer_name||'Customer',invoices:0,outstanding:0};customerMap[k].invoices++;customerMap[k].outstanding+=x.outstanding;});
    const customersDue=Object.values(customerMap).sort((a,b)=>b.outstanding-a.outstanding).map(x=>({...x,outstanding:Number(x.outstanding.toFixed(2))}));
    return json(res,200,{receivables:rows,payments:payments.sort((a,b)=>b.created_at.localeCompare(a.created_at)),customers_due:customersDue,summary:{total_invoiced:Number(totalInvoiced.toFixed(2)),total_paid:Number(totalPaid.toFixed(2)),outstanding:Number(outstanding.toFixed(2)),overdue:Number(overdue.reduce((a,x)=>a+x.outstanding,0).toFixed(2)),overdue_count:overdue.length,open_invoices:rows.filter(x=>x.outstanding>0).length}});
  }
  if(method==='POST'&&url.pathname.match(/^\/api\/invoices\/[^/]+\/payments$/)){
    const u=requireUser(req,res,db);if(!u)return;
    try{
      const invoiceId=url.pathname.split('/')[3], inv=db.invoices.find(x=>x.id===invoiceId&&x.user_id===u.id);if(!inv)return json(res,404,{error:'Invoice not found.'});
      if(inv.status==='cancelled')return json(res,400,{error:'Cancelled invoices cannot receive payments.'});
      const b=await body(req), amount=Number(b.amount), methodName=String(b.payment_method||'cash').trim().toLowerCase(), reference=String(b.reference||'').trim().slice(0,120), notes=String(b.notes||'').trim().slice(0,500), date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||''))?String(b.date):new Date().toISOString().slice(0,10);
      if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Enter a valid payment amount.'});
      const allowed=['cash','transfer','pos','flutterwave','bank','other'];if(!allowed.includes(methodName))return json(res,400,{error:'Invalid payment method.'});
      const paid=db.receivable_payments.filter(p=>p.invoice_id===inv.id).reduce((a,p)=>a+Number(p.amount||0),0), outstanding=Number(inv.total||0)-paid;
      if(amount>outstanding+0.005)return json(res,400,{error:`Payment cannot exceed the outstanding balance of ${moneyText(outstanding)}.`});
      const payment={id:id(),user_id:u.id,invoice_id:inv.id,invoice_number:inv.number,customer_id:inv.customer_id||null,customer_name:inv.customer_name||'Customer',amount:Number(amount.toFixed(2)),payment_method:methodName,reference,date,notes,created_at:now()};
      db.receivable_payments.push(payment);
      const newPaid=paid+amount;inv.status=newPaid>=Number(inv.total||0)-0.005?'paid':'partially_paid';inv.updated_at=now();
      activity(db,u.id,'invoice_payment',inv.number,`Payment of ${moneyText(amount)} recorded for ${inv.number}. Outstanding balance: ${moneyText(Math.max(0,Number(inv.total)-newPaid))}.`);dbWrite(db);
      return json(res,201,{success:true,payment,invoice:{...inv,amount_paid:Number(newPaid.toFixed(2)),outstanding:Number(Math.max(0,Number(inv.total)-newPaid).toFixed(2))}});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if(method==='DELETE'&&url.pathname.match(/^\/api\/receivable-payments\/[^/]+$/)){
    const u=requireUser(req,res,db);if(!u)return;const pid=url.pathname.split('/').pop(),pmt=db.receivable_payments.find(x=>x.id===pid&&x.user_id===u.id);if(!pmt)return json(res,404,{error:'Payment not found.'});
    const inv=db.invoices.find(x=>x.id===pmt.invoice_id&&x.user_id===u.id);db.receivable_payments=db.receivable_payments.filter(x=>x.id!==pid);if(inv){const paid=db.receivable_payments.filter(x=>x.invoice_id===inv.id).reduce((a,p)=>a+Number(p.amount||0),0);inv.status=paid>=Number(inv.total||0)-0.005?'paid':paid>0?'partially_paid':(inv.due_date&&inv.due_date<new Date().toISOString().slice(0,10)?'overdue':'sent');inv.updated_at=now();}dbWrite(db);return json(res,200,{success:true});
  }
  if(method==='GET'&&url.pathname.match(/^\/api\/invoices\/[^/]+\/payments$/)){
    const u=requireUser(req,res,db);if(!u)return;const invoiceId=url.pathname.split('/')[3],inv=db.invoices.find(x=>x.id===invoiceId&&x.user_id===u.id);if(!inv)return json(res,404,{error:'Invoice not found.'});return json(res,200,{payments:db.receivable_payments.filter(x=>x.invoice_id===inv.id&&x.user_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))});
  }

  if(method==='GET'&&url.pathname==='/api/quotations'){const u=requireUser(req,res,db);if(!u)return;const a=db.quotations.filter(x=>x.user_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));return json(res,200,{quotations:a,summary:{count:a.length,total:a.reduce((s,x)=>s+x.total,0),accepted:a.filter(x=>x.status==='accepted').reduce((s,x)=>s+x.total,0)}});}
  if(method==='POST'&&url.pathname==='/api/quotations'){const u=requireUser(req,res,db);if(!u)return;try{const x=makeDoc(db,u,await body(req),'quotation');db.quotations.push(x);activity(db,u.id,'quotation',x.number,`Quotation ${x.number} created for ${moneyText(x.total)}.`);dbWrite(db);return json(res,201,{success:true,quotation:x});}catch(e){return json(res,400,{error:e.message});}}
  if(method==='GET'&&url.pathname.startsWith('/api/quotations/')&&!url.pathname.endsWith('/convert')){const u=requireUser(req,res,db);if(!u)return;const x=db.quotations.find(x=>x.id===url.pathname.split('/').pop()&&x.user_id===u.id);if(!x)return json(res,404,{error:'Quotation not found.'});return json(res,200,{quotation:x});}
  if(method==='PUT'&&url.pathname.startsWith('/api/quotations/')){const u=requireUser(req,res,db);if(!u)return;try{const old=db.quotations.find(x=>x.id===url.pathname.split('/').pop()&&x.user_id===u.id);if(!old)return json(res,404,{error:'Quotation not found.'});const x=makeDoc(db,u,await body(req),'quotation');Object.assign(old,x,{id:old.id,user_id:u.id,number:old.number,created_at:old.created_at,updated_at:now()});dbWrite(db);return json(res,200,{success:true,quotation:old});}catch(e){return json(res,400,{error:e.message});}}
  if(method==='DELETE'&&url.pathname.startsWith('/api/quotations/')){const u=requireUser(req,res,db);if(!u)return;const idd=url.pathname.split('/').pop(),n=db.quotations.length;db.quotations=db.quotations.filter(x=>!(x.id===idd&&x.user_id===u.id));if(n===db.quotations.length)return json(res,404,{error:'Quotation not found.'});dbWrite(db);return json(res,200,{success:true});}
  if(method==='POST'&&url.pathname.startsWith('/api/quotations/')&&url.pathname.endsWith('/convert')){const u=requireUser(req,res,db);if(!u)return;const qid=url.pathname.split('/')[3],q=db.quotations.find(x=>x.id===qid&&x.user_id===u.id);if(!q)return json(res,404,{error:'Quotation not found.'});if(q.status==='rejected')return json(res,400,{error:'A rejected quotation cannot be converted.'});const x={...q,id:id(),number:docNo(db.invoices,'INV',u.id),status:'draft',due_date:'',quotation_id:q.id,created_at:now(),updated_at:now()};db.invoices.push(x);q.status='accepted';q.updated_at=now();activity(db,u.id,'invoice',x.number,`Quotation ${q.number} converted to invoice ${x.number}.`);dbWrite(db);return json(res,201,{success:true,invoice:x,quotation:q});}

  // ---------- Sales / POS ----------
  if (method === "GET" && url.pathname === "/api/sales") {
    const u=requireUser(req,res,db); if(!u)return;
    ensureBranches(db,u); const branchId=url.searchParams.get("branch_id"); const sales=db.sales.filter(x=>x.user_id===u.id&&(!branchId||x.branch_id===branchId)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const todayKey=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const today=sales.filter(s=>String(s.created_at).slice(0,10)===todayKey && s.status!=="cancelled"&&s.status!=="returned");
    return json(res,200,{sales:sales.slice(0,100),summary:{today_sales:today.length,today_revenue:Number(today.reduce((a,s)=>a+Number(s.total||0),0).toFixed(2)),today_profit:Number(today.reduce((a,s)=>a+Number(s.profit||0),0).toFixed(2))}});
  }

  if (method === "POST" && url.pathname === "/api/sales") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req);
      ensureBranches(db,u); const activeBranch=getBranch(db,u,b.branch_id||u.active_branch_id); if(!activeBranch)return json(res,400,{error:"Please select an active branch."});
      const rawItems=Array.isArray(b.items)?b.items:[];
      if(!rawItems.length) return json(res,400,{error:"Add at least one product to the cart."});
      let paymentMethod=String(b.payment_method||"cash").trim().toLowerCase();
      const allowedPayments=["cash","transfer","pos","flutterwave"];
      if(!allowedPayments.includes(paymentMethod) && paymentMethod!=="split") return json(res,400,{error:"Invalid payment method."});
      let paymentBreakdown=[];
      if(Array.isArray(b.payment_breakdown)&&b.payment_breakdown.length){
        paymentBreakdown=b.payment_breakdown.map(x=>({method:String(x.method||"").trim().toLowerCase(),amount:Number(x.amount||0)})).filter(x=>allowedPayments.includes(x.method)&&Number.isFinite(x.amount)&&x.amount>0);
        if(!paymentBreakdown.length) return json(res,400,{error:"Enter at least one valid payment amount."});
        paymentMethod=paymentBreakdown.length===1?paymentBreakdown[0].method:"split";
      }
      const customerId=b.customer_id?String(b.customer_id).trim():null;
      const customerName=String(b.customer_name||"").trim();
      const customerPhone=String(b.customer_phone||"").trim();
      if(customerId && !db.customers.some(c=>c.id===customerId&&c.user_id===u.id)) return json(res,400,{error:"Invalid customer."});
      const selectedCustomer=customerId?db.customers.find(c=>c.id===customerId&&c.user_id===u.id):null;
      const finalCustomerName=selectedCustomer?.name || customerName;
      const finalCustomerPhone=selectedCustomer?.phone || customerPhone;
      const discount=Math.max(0,Number(b.discount||0));

      // Merge duplicate product lines and validate ownership/stock before changing anything.
      const merged=new Map();
      for(const item of rawItems){
        const pid=String(item.product_id||"");
        const qty=Number(item.quantity);
        if(!pid || !Number.isFinite(qty) || qty<=0) return json(res,400,{error:"Each sale item must have a valid product and quantity."});
        merged.set(pid,(merged.get(pid)||0)+qty);
      }
      const items=[];
      let subtotal=0, costTotal=0;
      for(const [pid,qty] of merged){
        const p=db.products.find(x=>x.id===pid&&x.user_id===u.id);
        if(!p) return json(res,400,{error:"One of the selected products could not be found."});
        const available=Number(p.stock_quantity||0); const branchAvailable=Number(branchStockRow(db,u,activeBranch.id,p.id,true).quantity||0);
        if(qty>branchAvailable) return json(res,400,{error:`Insufficient branch stock for ${p.name}. Available in ${activeBranch.name}: ${branchAvailable}.`});
        if(qty>available) return json(res,400,{error:`Insufficient stock for ${p.name}. Available: ${available}.`});
        const unitPrice=Number(p.selling_price||0), unitCost=Number(p.cost_price||0);
        const lineTotal=qty*unitPrice, lineCost=qty*unitCost;
        subtotal+=lineTotal; costTotal+=lineCost;
        items.push({product_id:p.id,name:p.name,sku:p.sku||"",unit:p.unit||"pcs",quantity:qty,unit_price:unitPrice,unit_cost:unitCost,line_total:Number(lineTotal.toFixed(2)),line_cost:Number(lineCost.toFixed(2))});
      }
      const promoId=String(b.promo_campaign_id||''); if(promoId&&customerId){const promo=db.marketing_campaigns.find(c=>c.id===promoId&&c.user_id===u.id&&c.status==='active'&&((c.target_customer_id&&c.target_customer_id===customerId)||(!c.target_customer_id))); if(promo){if(promo.discount_type==='percent')discount=Math.min(subtotal,subtotal*Math.min(100,Number(promo.discount_value||0))/100); else if(promo.discount_type==='amount')discount=Math.min(subtotal,Math.max(0,Number(promo.discount_value||0)));}}
      if(discount>subtotal) return json(res,400,{error:"Discount cannot be greater than the sale subtotal."});
      const total=Number((subtotal-discount).toFixed(2));
      const profit=Number((total-costTotal).toFixed(2));
      if(paymentBreakdown.length){const paidTotal=Number(paymentBreakdown.reduce((a,x)=>a+x.amount,0).toFixed(2));if(Math.abs(paidTotal-total)>0.01)return json(res,400,{error:`Payment amounts must equal the sale total of ${moneyText(total)}.`});}
      const invoiceNo=`BJ-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(db.sales.length+1).padStart(5,"0")}`;
      for(const item of items){
        const p=db.products.find(x=>x.id===item.product_id&&x.user_id===u.id);
        p.stock_quantity=Number((Number(p.stock_quantity)-Number(item.quantity)).toFixed(2));
        const bs=branchStockRow(db,u,activeBranch.id,p.id,true); bs.quantity=Number((Number(bs.quantity)-Number(item.quantity)).toFixed(2)); bs.updated_at=now();
        p.updated_at=now(); recordInventoryMovement(db,u,p,-Number(item.quantity),"sale","Sale completed",invoiceNo,activeBranch.id);
      }
      const sale={id:id(),user_id:u.id,branch_id:activeBranch.id,branch_name:activeBranch.name,invoice_no:invoiceNo,customer_id:customerId,customer_name:finalCustomerName,customer_phone:finalCustomerPhone,payment_method:paymentMethod,payment_breakdown:paymentBreakdown.length?paymentBreakdown:[{method:paymentMethod,amount:total}],subtotal:Number(subtotal.toFixed(2)),discount,total,cost_total:Number(costTotal.toFixed(2)),profit,status:"completed",items,created_at:now(),business_name:String(u.business_profile?.business_name||'BIGJOE').trim()||'BIGJOE'};
      db.sales.push(sale);
      const loyaltyPoints=awardLoyalty(db,u,sale); sale.loyalty_points=loyaltyPoints;
      activity(db,u.id,"sale",invoiceNo,`Sale ${invoiceNo} completed for ${moneyText(total)} via ${paymentMethod}.`);
      dbWrite(db);
      return json(res,201,{success:true,sale});
    } catch(e){ return json(res,400,{error:e.message}); }
  }

  if (method === "GET" && url.pathname.startsWith("/api/sales/") && url.pathname.endsWith("/return")) {
    // Kept as a clear 405-style response for clients that accidentally GET the return action.
    return json(res,405,{error:"Use POST to process a sale return."});
  }

  if (method === "POST" && url.pathname.match(/^\/api\/sales\/[^/]+\/return$/)) {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const sid=url.pathname.split("/")[3];
      const sale=db.sales.find(x=>x.id===sid&&x.user_id===u.id);
      if(!sale)return json(res,404,{error:"Sale not found."});
      if(sale.status!=="completed") return json(res,400,{error:"Only completed sales can be returned."});
      const already=(db.sales_returns||[]).find(r=>r.sale_id===sale.id&&r.user_id===u.id);
      if(already)return json(res,400,{error:"This sale has already been returned."});
      const paymentMethod=String(sale.payment_method||"cash").toLowerCase();
      const returnBreakdown=Array.isArray(sale.payment_breakdown)&&sale.payment_breakdown.length?sale.payment_breakdown.map(x=>({method:x.method,amount:Number(x.amount||0)})):[{method:paymentMethod,amount:Number(sale.total||0)}];
      const ret={id:id(),user_id:u.id,branch_id:sale.branch_id||u.active_branch_id,branch_name:sale.branch_name||branchName(db,sale.branch_id),sale_id:sale.id,invoice_no:sale.invoice_no,return_no:`RET-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String((db.sales_returns||[]).length+1).padStart(5,"0")}`,payment_method:paymentMethod,payment_breakdown:returnBreakdown,refund_total:Number(sale.total||0),cost_total:Number(sale.cost_total||0),items:(sale.items||[]).map(i=>({...i})),created_at:now()};
      for(const item of ret.items){
        const p=db.products.find(x=>x.id===item.product_id&&x.user_id===u.id);
        if(p){p.stock_quantity=Number((Number(p.stock_quantity||0)+Number(item.quantity||0)).toFixed(2)); const rb=getBranch(db,u,sale.branch_id||u.active_branch_id); const bs=rb?branchStockRow(db,u,rb.id,p.id,true):null; if(bs){bs.quantity=Number((Number(bs.quantity||0)+Number(item.quantity||0)).toFixed(2));bs.updated_at=now();} p.updated_at=now(); recordInventoryMovement(db,u,p,Number(item.quantity||0),"return","Sale returned",ret.return_no,sale.branch_id||u.active_branch_id);}
      }
      db.sales_returns ||= [];
      db.sales_returns.push(ret);
      const earned=db.loyalty_ledger.filter(x=>x.user_id===u.id&&x.sale_id===sale.id&&x.type==='earn').reduce((a,x)=>a+Number(x.points||0),0);
      const alreadyReversed=db.loyalty_ledger.some(x=>x.user_id===u.id&&x.sale_id===sale.id&&x.description===`Points reversed for returned ${sale.invoice_no}`);
      if(earned>0 && !alreadyReversed) db.loyalty_ledger.push({id:id(),user_id:u.id,customer_id:sale.customer_id,type:'redeem',points:earned,amount:0,sale_id:sale.id,description:`Points reversed for returned ${sale.invoice_no}`,created_at:now()});
      sale.status="returned"; sale.returned_at=ret.created_at; sale.return_no=ret.return_no; sale.updated_at=now();
      activity(db,u.id,"sale_return",ret.return_no,`Sale ${sale.invoice_no} fully returned and ${moneyText(ret.refund_total)} refunded via ${paymentMethod}.`);
      dbWrite(db);
      return json(res,201,{success:true,return:ret,sale});
    } catch(e){ return json(res,400,{error:e.message}); }
  }

  if (method === "GET" && url.pathname.startsWith("/api/sales/")) {
    const u=requireUser(req,res,db); if(!u)return;
    const sid=url.pathname.split("/").pop();
    const sale=db.sales.find(x=>x.id===sid&&x.user_id===u.id);
    if(!sale)return json(res,404,{error:"Sale not found."});
    const businessName=String(u.business_profile?.business_name||sale.business_name||'BIGJOE').trim()||'BIGJOE';
    return json(res,200,{sale:{...sale,business_name:businessName}});
  }

  if (method === "GET" && url.pathname === "/api/history") {
    const u=requireUser(req,res,db); if(!u)return;
    return json(res,200,{history:db.activity.filter(x=>x.user_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100)});
  }

  if (method === "POST" && url.pathname === "/api/tools") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req), tool=String(b.tool||"assistant"), input=String(b.input||"");
      const output=makeTool(tool,input); activity(db,u.id,tool,input,output); dbWrite(db);
      return json(res,200,{success:true,output});
    } catch(e) { return json(res,400,{error:e.message}); }
  }

  if (method === "POST" && url.pathname === "/api/ai") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req), message=String(b.message||"").trim();
      if(!message) return json(res,400,{error:"Enter a message."});
      const output=await aiAnswer(message,u,db); activity(db,u.id,"ai_assistant",message,output); dbWrite(db);
      return json(res,200,{success:true,output,provider:OPENAI_API_KEY?"openai":"built-in"});
    } catch(e) { return json(res,502,{error:e.message}); }
  }

  // ---------- v54.1 Business Payment Receiving Configuration ----------
  if (method === "GET" && url.pathname === "/api/payments/receiving/config") {
    const u=requireUser(req,res,db); if(!u)return;
    const rows=(db.payment_integrations||[]).filter(x=>x.user_id===u.id);
    const byProvider=p=>rows.find(x=>x.provider===p);
    const safe=p=>{const x=byProvider(p);return {configured:Boolean(x&&x.secret_key),mode:x?.mode||'test',public_key:x?.public_key||'',account_name:x?.account_name||'',updated_at:x?.updated_at||null};};
    return json(res,200,{flutterwave:safe('flutterwave'),paystack:safe('paystack')});
  }
  if (method === "PUT" && url.pathname === "/api/payments/receiving/config") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req), provider=String(b.provider||'').toLowerCase();
      if(!['flutterwave','paystack'].includes(provider))return json(res,400,{error:'Choose Flutterwave or Paystack.'});
      const secret=String(b.secret_key||'').trim(), publicKey=String(b.public_key||'').trim(), accountName=String(b.account_name||'').trim().slice(0,120), mode=['test','live'].includes(String(b.mode))?String(b.mode):'test';
      if(secret.length<8)return json(res,400,{error:'Enter a valid secret API key.'});
      db.payment_integrations ||= [];
      let row=db.payment_integrations.find(x=>x.user_id===u.id&&x.provider===provider);
      if(!row){row={id:id(),user_id:u.id,provider,created_at:now()};db.payment_integrations.push(row);}
      row.secret_key=secret; row.public_key=publicKey; row.account_name=accountName; row.mode=mode; row.updated_at=now();
      activity(db,u.id,'payment_receiving_config',provider,`${provider} receiving account configured in ${mode} mode.`);dbWrite(db);
      return json(res,200,{success:true,provider,configured:true,mode,public_key:publicKey,account_name:accountName});
    } catch(e){return json(res,400,{error:e.message});}
  }

  // ---------- v54 Payment & Integration Hub ----------
  if (method === "GET" && url.pathname === "/api/payments/hub") {
    const u=requireUser(req,res,db); if(!u)return;
    const rows=(db.payments||[]).filter(x=>x.user_id===u.id).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    const summary={total:rows.length,successful:rows.filter(x=>x.status==='successful').length,pending:rows.filter(x=>['initialized','pending'].includes(x.status)).length,failed:rows.filter(x=>['failed','cancelled'].includes(x.status)).length,unreconciled:rows.filter(x=>x.status==='successful'&&x.reconciliation_status!=='reconciled').length};
    const configs=(db.payment_integrations||[]).filter(x=>x.user_id===u.id); const cfg=p=>{const x=configs.find(r=>r.provider===p);return {configured:Boolean(x&&x.secret_key),mode:x?.mode||'test',public_key:x?.public_key||'',account_name:x?.account_name||''};}; return json(res,200,{providers:{flutterwave:cfg('flutterwave'),paystack:cfg('paystack'),manual:{configured:true}},summary,transactions:rows.slice(0,100)});
  }

  if (method === "POST" && url.pathname === "/api/payments/reconcile") {
    const u=requireUser(req,res,db); if(!u)return;
    const b=await body(req), pid=String(b.payment_id||'');
    const p=(db.payments||[]).find(x=>x.id===pid&&x.user_id===u.id); if(!p)return json(res,404,{error:'Payment record not found.'});
    const status=String(b.status||'').toLowerCase();
    if(!['reconciled','unreconciled'].includes(status))return json(res,400,{error:'Invalid reconciliation status.'});
    p.reconciliation_status=status; p.reconciliation_reference=String(b.reference||p.transaction_id||p.tx_ref||'').trim().slice(0,160); p.reconciliation_note=String(b.note||'').trim().slice(0,500); p.reconciled_at=status==='reconciled'?now():null;
    activity(db,u.id,'payment_reconciliation',p.tx_ref||p.id,`Payment ${p.tx_ref||p.id} marked ${status}.`); dbWrite(db);
    return json(res,200,{success:true,payment:p});
  }

  if (method === "GET" && url.pathname === "/api/payments/flutterwave/connection") {
    const u=requireUser(req,res,db); if(!u)return;
    const cfg=getFlutterwaveConfig(db,u);
    if(!cfg.secret_key) return json(res,200,{configured:false,connected:false,mode:cfg.mode,message:'Flutterwave is not configured. Open Payment Hub → Configure Flutterwave.'});
    try { const r=await gatewayRequest('https://api.flutterwave.com/v3/balances',cfg.secret_key); return json(res,200,{configured:true,connected:r.ok&&r.data?.status==='success',mode:cfg.mode,account_name:cfg.account_name,message:r.ok?'Flutterwave account connected and ready for checkout.':'Flutterwave connection failed. Please verify the secret key and mode.'}); } catch(e){ return json(res,200,{configured:true,connected:false,mode:cfg.mode,message:e.message}); }
  }

  if (method === "GET" && url.pathname === "/api/payments/paystack/connection") {
    const u=requireUser(req,res,db); if(!u)return;
    const cfg=(db.payment_integrations||[]).find(x=>x.user_id===u.id&&x.provider==='paystack'); if(!cfg?.secret_key)return json(res,200,{configured:false,connected:false,mode:cfg?.mode||'test',message:'Your Paystack receiving account is not configured yet.'});
    try { const r=await gatewayRequest('https://api.paystack.co/balance',cfg.secret_key); return json(res,200,{configured:true,connected:r.ok&&r.data?.status===true,mode:cfg.mode||'test',message:r.ok?'Paystack receiving account connected.':'Paystack connection failed.'}); } catch(e){ return json(res,200,{configured:true,connected:false,mode:process.env.PAYSTACK_MODE||'test',message:e.message}); }
  }

  if (method === "POST" && url.pathname === "/api/payments/flutterwave/initialize") {
    const u=requireUser(req,res,db); if(!u)return;
    try {
      const b=await body(req), plan=String(b.plan||"");
      if(!PLANS[plan] || plan==="free") return json(res,400,{error:"Invalid paid plan."});
      const cfg=getSubscriptionFlutterwaveConfig(db,u,!currentStaff(req,db));
      if(!cfg.secret_key) return json(res,400,{error:"BIGJOE subscription checkout is not configured. Configure Flutterwave in Payment Hub first, or add FLW_SUBSCRIPTION_SECRET_KEY to .env."});
      const tx_ref=`BIGJOE-${u.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const p=PLANS[plan];
      const paymentPlanId=flutterwavePlanId(plan);
      const payload={
        tx_ref, amount:p.amount, currency:p.currency,
        redirect_url:`${BASE_URL}/payment/callback`,
        customer:{email:u.email,name:u.name},
        customizations:{title:"BIGJOE Business AI",description:`${p.name} plan - monthly subscription`},
        meta:{user_id:u.id,plan,product:"BIGJOE Business AI"}
      };
      if(paymentPlanId) payload.payment_plan=Number(paymentPlanId);
      const result=await flutterwave("/payments",{method:"POST",body:JSON.stringify(payload)},cfg.secret_key);
      if(!result.ok || result.data.status!=="success") return json(res,502,{error:"Flutterwave could not initialize the payment.",details:result.data});
      db.payments.push({id:id(),user_id:u.id,tx_ref,plan,amount:p.amount,currency:p.currency,status:"initialized",transaction_id:null,payment_plan_id:paymentPlanId||null,flutterwave_mode:cfg.mode,created_at:now()});
      dbWrite(db);
      return json(res,200,{success:true,checkout_url:result.data.data.link,tx_ref,recurring:Boolean(paymentPlanId)});
    } catch(e) { return json(res,502,{error:e.message}); }
  }

  if (method === "GET" && url.pathname === "/payment/callback") {
    const txRef=url.searchParams.get("tx_ref"), transactionId=url.searchParams.get("transaction_id"), status=String(url.searchParams.get("status")||'').toLowerCase();
    if(!txRef || !transactionId) return redirectHtml(res,"/","Payment callback was missing transaction details.");
    if(status!=="successful") return redirectHtml(res,"/",`Payment was not completed${status?` (status: ${status})`:''}.`);
    try {
      const payment=db.payments.find(p=>p.tx_ref===txRef); if(!payment) return redirectHtml(res,"/","BIGJOE could not find this payment reference.");
      const paymentUser=db.users.find(x=>x.id===payment.user_id); if(!paymentUser) return redirectHtml(res,"/","BIGJOE could not find the account associated with this payment.");
      const cfg=getSubscriptionFlutterwaveConfig(db,paymentUser,true);
      const result=await verifySubscriptionPayment(db,payment,transactionId,cfg);
      if(!result.ok) return redirectHtml(res,"/",result.error);
      return redirectHtml(res,"/",`Payment verified successfully. Your BIGJOE ${payment.plan} plan is now active.`);
    } catch(e) { return redirectHtml(res,"/",`Payment verification error: ${e.message}`); }
  }

  if (method === "POST" && (url.pathname === "/webhooks/flutterwave" || url.pathname === "/api/flutterwave/webhook")) {
    try {
      const raw=await readRawBody(req); if(!validFlutterwaveWebhook(raw,req)) return json(res,401,{error:'Invalid Flutterwave webhook signature.'});
      let payload; try { payload=JSON.parse(raw||'{}'); } catch { return json(res,400,{error:'Invalid webhook JSON.'}); }
      const data=payload?.data||payload?.body?.data||payload?.body||{};
      const transactionId=String(data.id||data.transaction_id||'').trim(); const txRef=String(data.tx_ref||data.txRef||data.reference||'').trim();
      const eventStatus=String(data.status||payload?.status||'').toLowerCase();
      if(!transactionId || !txRef || !['successful','succeeded'].includes(eventStatus)) return json(res,200,{received:true,processed:false});
      const payment=db.payments.find(p=>p.tx_ref===txRef); if(!payment) return json(res,200,{received:true,processed:false,reason:'payment_reference_not_found'});
      const paymentUser=db.users.find(x=>x.id===payment.user_id); const cfg=getSubscriptionFlutterwaveConfig(db,paymentUser,true);
      const result=await verifySubscriptionPayment(db,payment,transactionId,cfg);
      return json(res,200,{received:true,processed:Boolean(result.ok),alreadyActivated:Boolean(result.alreadyActivated),message:result.ok?'Subscription activated.':result.error});
    } catch(e) { return json(res,500,{error:e.message}); }
  }

  if (method === "POST" && url.pathname === "/api/subscriptions/flutterwave/verify") {
    const u=requireUser(req,res,db); if(!u)return; if(currentStaff(req,db)) return json(res,403,{error:'Only the business owner can activate a subscription.'});
    try {
      const b=await body(req), txRef=String(b.tx_ref||'').trim(), transactionId=String(b.transaction_id||'').trim();
      if(!txRef || !transactionId) return json(res,400,{error:'Enter the Flutterwave transaction reference and transaction ID.'});
      const payment=db.payments.find(p=>p.user_id===u.id&&p.tx_ref===txRef); if(!payment) return json(res,404,{error:'BIGJOE could not find this subscription payment.'});
      const cfg=getSubscriptionFlutterwaveConfig(db,u,true); const result=await verifySubscriptionPayment(db,payment,transactionId,cfg);
      if(!result.ok) return json(res,400,{error:result.error});
      return json(res,200,{success:true,plan:result.user.plan,subscription_status:result.user.subscription_status,subscription_expires_at:result.user.subscription_expires_at,alreadyActivated:Boolean(result.alreadyActivated)});
    } catch(e) { return json(res,400,{error:e.message}); }
  }


function accountingFinancialStatements(db, user, start, end, branchId=null) {
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
  const today=new Date().toISOString().slice(0,10);
  const endDate=valid(end)?String(end):today;
  const startDate=valid(start)?String(start):new Date(new Date(endDate+'T00:00:00').getTime()-29*86400000).toISOString().slice(0,10);
  const inPeriod=d=>{const x=String(d||'').slice(0,10);return valid(x)&&x>=startDate&&x<=endDate};
  const onOrBeforeEnd=d=>{const x=String(d||'').slice(0,10);return valid(x)&&x<=endDate};
  const beforeStart=d=>{const x=String(d||'').slice(0,10);return valid(x)&&x<startDate};
  const sales=db.sales.filter(x=>x.user_id===user.id&&x.status!=='cancelled'&&x.status!=='returned'&&(!branchId||x.branch_id===branchId));
  const periodSales=sales.filter(x=>inPeriod(x.created_at));
  const returns=(db.sales_returns||[]).filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId));
  const periodReturns=returns.filter(x=>inPeriod(x.created_at));
  const manual=db.accounting_entries.filter(x=>x.user_id===user.id);
  const periodManual=manual.filter(x=>inPeriod(x.date)&&(!branchId||!x.branch_id||x.branch_id===branchId));
  const expenses=db.expenses.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId));
  const periodExpenses=expenses.filter(x=>inPeriod(x.date));
  const revenue=periodSales.reduce((a,x)=>a+Number(x.total||0),0)-periodReturns.reduce((a,x)=>a+Number(x.refund_total||0),0);
  const cogs=periodSales.reduce((a,x)=>a+Number(x.cost_total||0),0)-periodReturns.reduce((a,x)=>a+Number(x.cost_total||0),0);
  const manualIncome=periodManual.filter(x=>accountingClassification(x)==='income').reduce((a,x)=>a+Number(x.amount||0),0);
  const manualExpense=periodManual.filter(x=>accountingClassification(x)==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
  const operatingExpenses=periodExpenses.reduce((a,x)=>a+Number(x.amount||0),0)+manualExpense;
  const otherIncome=manualIncome;
  const grossProfit=revenue-cogs;
  const netProfit=grossProfit+otherIncome-operatingExpenses;
  const cashbook=cashbookEntries(db,user,'','',branchId);
  const periodCash=cashbook.filter(x=>inPeriod(x.date));
  const priorCash=cashbook.filter(x=>beforeStart(x.date));
  const cashCodes=['CASH','BANK','POS','FLUTTERWAVE'];
  const accounts=ensureAccountingAccounts(db,user);
  const openingCash=accounts.filter(a=>cashCodes.includes(a.code)).reduce((a,x)=>a+Number(x.opening_balance||0),0)+priorCash.reduce((a,x)=>a+(x.type==='income'?Number(x.amount||0):-Number(x.amount||0)),0);
  const cashIn=periodCash.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0);
  const cashOut=periodCash.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
  const netCash=cashIn-cashOut;
  const closingCash=openingCash+netCash;
  const invoices=db.invoices.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)&&onOrBeforeEnd(x.created_at||x.date));
  const receivables=invoices.reduce((sum,inv)=>{const paid=db.receivable_payments.filter(p=>p.user_id===user.id&&p.invoice_id===inv.id&&onOrBeforeEnd(p.payment_date||p.date||p.created_at)).reduce((a,p)=>a+Number(p.amount||0),0);return sum+Math.max(0,Number(inv.total||0)-paid)},0);
  const purchases=db.purchases.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)&&x.status!=='cancelled'&&x.status!=='returned'&&onOrBeforeEnd(x.date||x.created_at));
  const payables=purchases.reduce((sum,po)=>{const paid=db.supplier_payments.filter(p=>p.user_id===user.id&&p.purchase_id===po.id&&onOrBeforeEnd(p.payment_date||p.date||p.created_at)).reduce((a,p)=>a+Number(p.amount||0),0);return sum+Math.max(0,Number(po.total||0)-paid)},0);
  const inventoryValue=db.products.filter(x=>x.user_id===user.id).reduce((a,p)=>a+Number((branchId?branchStockRow(db,user,branchId,p.id,false)?.quantity:p.stock_quantity)||0)*Number(p.cost_price||0),0);
  const asOfManual=manual.filter(e=>onOrBeforeEnd(e.date));
  const customAsset=accounts.filter(a=>a.type==='asset'&&!cashCodes.includes(a.code)&&!['INVENTORY','ACCOUNTS_RECEIVABLE'].includes(a.code)).reduce((a,x)=>a+Math.max(0,accountBalance(x,asOfManual)),0);
  const ownerEquity=accounts.filter(a=>a.code==='OWNER_EQUITY').reduce((a,x)=>a+Number(x.opening_balance||0)+asOfManual.filter(e=>e.account_code===x.code&&accountingClassification(e)==='owner_capital').reduce((n,e)=>n+Number(e.amount||0),0)-asOfManual.filter(e=>e.account_code===x.code&&accountingClassification(e)==='owner_withdrawal').reduce((n,e)=>n+Number(e.amount||0),0),0);
  const otherLiabilities=accounts.filter(a=>a.type==='liability'&&a.code!=='ACCOUNTS_PAYABLE').reduce((a,x)=>a+Math.max(0,accountBalance(x,asOfManual)),0);
  const totalAssets=closingCash+receivables+inventoryValue+customAsset;
  const totalLiabilities=payables+otherLiabilities;
  const openingEquity=accounts.filter(a=>a.type==='equity').reduce((a,x)=>a+Number(x.opening_balance||0),0);
  const retainedEquity=totalAssets-totalLiabilities-ownerEquity;
  const totalEquity=ownerEquity+retainedEquity;
  const balanceCheck=totalAssets-(totalLiabilities+totalEquity);
  const channel={};periodCash.forEach(x=>{channel[x.method]=(channel[x.method]||0)+(x.type==='income'?Number(x.amount||0):-Number(x.amount||0))});
  const expenseRows={};periodExpenses.forEach(x=>{const k=x.category||'Other';expenseRows[k]=(expenseRows[k]||0)+Number(x.amount||0)});periodManual.filter(x=>accountingClassification(x)==='expense').forEach(x=>{const k='Manual expenses';expenseRows[k]=(expenseRows[k]||0)+Number(x.amount||0)});
  return {period:{start:startDate,end:endDate},owner:{name:user.name||'',email:user.email||''},profit_loss:{revenue:Number(revenue.toFixed(2)),cogs:Number(cogs.toFixed(2)),gross_profit:Number(grossProfit.toFixed(2)),other_income:Number(otherIncome.toFixed(2)),operating_expenses:Number(operatingExpenses.toFixed(2)),net_profit:Number(netProfit.toFixed(2)),expense_breakdown:Object.entries(expenseRows).map(([category,total])=>({category,total:Number(total.toFixed(2))})).sort((a,b)=>b.total-a.total)},balance_sheet:{assets:[{label:'Cash & Cash Equivalents',amount:Number(closingCash.toFixed(2))},{label:'Accounts Receivable',amount:Number(receivables.toFixed(2))},{label:'Inventory',amount:Number(inventoryValue.toFixed(2))},{label:'Other Assets',amount:Number(customAsset.toFixed(2))}],liabilities:[{label:'Accounts Payable',amount:Number(payables.toFixed(2))},{label:'Other Liabilities',amount:Number(otherLiabilities.toFixed(2))}],equity:[{label:"Owner's Equity",amount:Number(ownerEquity.toFixed(2))},{label:'Accumulated / Unallocated Equity',amount:Number(retainedEquity.toFixed(2))}],total_assets:Number(totalAssets.toFixed(2)),total_liabilities:Number(totalLiabilities.toFixed(2)),total_equity:Number(totalEquity.toFixed(2)),balance_check:Number(balanceCheck.toFixed(2))},cash_flow:{opening_cash:Number(openingCash.toFixed(2)),cash_in:Number(cashIn.toFixed(2)),cash_out:Number(cashOut.toFixed(2)),net_cash:Number(netCash.toFixed(2)),closing_cash:Number(closingCash.toFixed(2)),by_channel:Object.entries(channel).map(([method,total])=>({method,total:Number(total.toFixed(2))})).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))}};
}


function paymentAccountCode(method) {
  const m=String(method||'cash').toLowerCase();
  if(m==='cash') return 'CASH';
  if(m==='bank' || m==='transfer') return 'BANK';
  if(m==='pos' || m==='card') return 'POS';
  if(m==='flutterwave') return 'FLUTTERWAVE';
  return 'CASH';
}

function addJournalLine(lines, code, debit, credit) {
  const d=Number(debit||0), c=Number(credit||0);
  if(Math.abs(d)<0.005 && Math.abs(c)<0.005) return;
  lines.push({account_code:code,debit:Number(d.toFixed(2)),credit:Number(c.toFixed(2))});
}

function accountingJournal(db, user, start, end, branchId=null) {
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
  const inRange=date=>{const d=String(date||'').slice(0,10);return valid(d)&&(!start||d>=start)&&(!end||d<=end)};
  const lines=[];
  const push=(date,ref,description,source,sourceId,build)=>{
    if(!inRange(date)) return;
    const journal=[]; build(journal);
    const totalD=journal.reduce((a,x)=>a+x.debit,0), totalC=journal.reduce((a,x)=>a+x.credit,0);
    if(journal.length && Math.abs(totalD-totalC)<0.01) lines.push({date:String(date).slice(0,10),reference:ref||'',description,source,source_id:sourceId,lines:journal});
  };
  db.sales.filter(x=>x.user_id===user.id&&x.status!=='cancelled'&&x.status!=='returned'&&(!branchId||x.branch_id===branchId)).forEach(s=>push(String(s.created_at||'').slice(0,10),s.invoice_no,`Sale ${s.invoice_no||''}`.trim(),'sale',s.id,j=>{
    const salePayments=Array.isArray(s.payment_breakdown)&&s.payment_breakdown.length?s.payment_breakdown:[{method:s.payment_method,amount:Number(s.total||0)}];
    salePayments.forEach(pm=>addJournalLine(j,paymentAccountCode(pm.method),Number(pm.amount||0),0));
    addJournalLine(j,'SALES_REVENUE',0,Number(s.total||0));
    if(Number(s.cost_total||0)>0){addJournalLine(j,'COGS',Number(s.cost_total||0),0);addJournalLine(j,'INVENTORY',0,Number(s.cost_total||0));}
  }));
  (db.sales_returns||[]).filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(r=>push(String(r.created_at||'').slice(0,10),r.return_no||r.invoice_no,`Refund ${r.invoice_no||''}`.trim(),'sale return',r.id,j=>{
    addJournalLine(j,'SALES_REVENUE',Number(r.refund_total||0),0);
    addJournalLine(j,paymentAccountCode(r.payment_method),0,Number(r.refund_total||0));
    if(Number(r.cost_total||0)>0){addJournalLine(j,'INVENTORY',Number(r.cost_total||0),0);addJournalLine(j,'COGS',0,Number(r.cost_total||0));}
  }));
  db.expenses.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(e=>push(e.date||String(e.created_at||'').slice(0,10),e.reference||'',e.description||'Expense','expense',e.id,j=>{
    addJournalLine(j,'OPERATING_EXPENSES',Number(e.amount||0),0);addJournalLine(j,paymentAccountCode(e.payment_method),0,Number(e.amount||0));
  }));
  db.receivable_payments.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(x=>push(x.date||x.payment_date||String(x.created_at||'').slice(0,10),x.invoice_number||x.reference||'',`Customer payment${x.customer_name?` - ${x.customer_name}`:''}`,'customer payment',x.id,j=>{
    addJournalLine(j,paymentAccountCode(x.payment_method),Number(x.amount||0),0);addJournalLine(j,'ACCOUNTS_RECEIVABLE',0,Number(x.amount||0));
  }));
  db.supplier_payments.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(x=>push(x.payment_date||String(x.created_at||'').slice(0,10),x.purchase_number||x.reference||'',`Supplier payment${x.supplier_name?` - ${x.supplier_name}`:''}`,'supplier payment',x.id,j=>{
    addJournalLine(j,'ACCOUNTS_PAYABLE',Number(x.amount||0),0);addJournalLine(j,paymentAccountCode(x.payment_method),0,Number(x.amount||0));
  }));
  db.purchases.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)&&x.status!=='cancelled'&&x.status!=='returned').forEach(x=>push(x.date||String(x.created_at||'').slice(0,10),x.number||'',`Purchase ${x.number||''}`.trim(),'purchase',x.id,j=>{
    const total=Number(x.total||0); addJournalLine(j,'INVENTORY',total,0); addJournalLine(j,'ACCOUNTS_PAYABLE',0,total);
  }));
  db.accounting_entries.filter(x=>x.user_id===user.id&&(!branchId||x.branch_id===branchId)).forEach(e=>push(e.date,e.reference,e.description||'Manual accounting entry','manual',e.id,j=>{
    const amount=Number(e.amount||0), c=accountingClassification(e), account=e.account_code||'';
    const cash=paymentAccountCode(e.payment_method);
    if(c==='income'){addJournalLine(j,cash,amount,0);addJournalLine(j,account,0,amount);}
    else if(c==='expense'){addJournalLine(j,account,amount,0);addJournalLine(j,cash,0,amount);}
    else if(c==='owner_capital'){addJournalLine(j,cash,amount,0);addJournalLine(j,account,0,amount);}
    else if(c==='owner_withdrawal'){addJournalLine(j,account,amount,0);addJournalLine(j,cash,0,amount);}
    else if(c==='loan_received'){addJournalLine(j,cash,amount,0);addJournalLine(j,account,0,amount);}
    else if(c==='loan_repayment'){addJournalLine(j,account,amount,0);addJournalLine(j,cash,0,amount);}
    else if(c==='asset_purchase'){addJournalLine(j,account,amount,0);addJournalLine(j,cash,0,amount);}
  }));
  return lines.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.reference).localeCompare(String(b.reference)));
}

function accountingTrialBalance(db, user, start, end, branchId=null) {
  const accounts=ensureAccountingAccounts(db,user);
  const journals=accountingJournal(db,user,start,end,branchId);
  const totals={};
  for(const a of accounts) totals[a.code]={debit:0,credit:0,account:a};
  let openingDebit=0, openingCredit=0;
  for(const a of accounts){
    const opening=Number(a.opening_balance||0);
    if(opening>=0){
      if(['asset','expense'].includes(a.type)) { totals[a.code].debit+=opening; openingDebit+=opening; }
      else { totals[a.code].credit+=opening; openingCredit+=opening; }
    } else {
      if(['asset','expense'].includes(a.type)) { totals[a.code].credit+=Math.abs(opening); openingCredit+=Math.abs(opening); }
      else { totals[a.code].debit+=Math.abs(opening); openingDebit+=Math.abs(opening); }
    }
  }
  // Opening balances are initial balances rather than dated transactions.
  // If their debit and credit sides do not already offset, use the standard
  // Opening Balance Equity account as the balancing side. This prevents a
  // valid opening setup from making the Trial Balance appear broken.
  const openingDifference=Number((openingDebit-openingCredit).toFixed(2));
  if(Math.abs(openingDifference)>=0.005){
    if(!totals.OPENING_BALANCE_EQUITY) totals.OPENING_BALANCE_EQUITY={debit:0,credit:0,account:{code:'OPENING_BALANCE_EQUITY',name:'Opening Balance Equity',type:'equity'}};
    if(openingDifference>0) totals.OPENING_BALANCE_EQUITY.credit+=openingDifference;
    else totals.OPENING_BALANCE_EQUITY.debit+=Math.abs(openingDifference);
  }
  for(const j of journals) for(const l of j.lines){ if(!totals[l.account_code]) totals[l.account_code]={debit:0,credit:0,account:{code:l.account_code,name:l.account_code,type:'other'}}; totals[l.account_code].debit+=l.debit; totals[l.account_code].credit+=l.credit; }
  const rows=Object.values(totals).map(x=>({code:x.account.code,name:x.account.name,type:x.account.type,debit:Number(x.debit.toFixed(2)),credit:Number(x.credit.toFixed(2)),balance:Number((x.debit-x.credit).toFixed(2))})).filter(x=>Math.abs(x.debit)+Math.abs(x.credit)>0.005);
  const totalDebit=rows.reduce((a,x)=>a+x.debit,0), totalCredit=rows.reduce((a,x)=>a+x.credit,0);
  return {period:{start:start||'',end:end||''},rows,total_debit:Number(totalDebit.toFixed(2)),total_credit:Number(totalCredit.toFixed(2)),difference:Number((totalDebit-totalCredit).toFixed(2)),opening_balance_adjustment:Number(openingDifference.toFixed(2)),journals};
}

  // ---------- Accounting & Cashbook (v18) ----------
  if(method==='GET'&&url.pathname==='/api/accounting/trial-balance'){
    const u=requireUser(req,res,db);if(!u)return;
    const start=String(url.searchParams.get('start')||'').slice(0,10), end=String(url.searchParams.get('end')||'').slice(0,10), branchParam=url.searchParams.get('branch_id'), branchId=branchParam==='all'?null:(getBranch(db,u,branchParam||u.active_branch_id)?.id||null);
    return json(res,200,{...accountingTrialBalance(db,u,start,end,branchId),owner:{name:u.name||'',email:u.email||''}});
  }
  if(method==='GET'&&url.pathname==='/api/accounting/general-ledger'){
    const u=requireUser(req,res,db);if(!u)return;
    const start=String(url.searchParams.get('start')||'').slice(0,10), end=String(url.searchParams.get('end')||'').slice(0,10), code=String(url.searchParams.get('account')||'').trim(), branchParam=url.searchParams.get('branch_id'), branchId=branchParam==='all'?null:(getBranch(db,u,branchParam||u.active_branch_id)?.id||null);
    const tb=accountingTrialBalance(db,u,start,end,branchId), journals=tb.journals;
    const accounts=ensureAccountingAccounts(db,u);
    const account=accounts.find(a=>a.code===code);
    if(!account)return json(res,200,{account:null,rows:[],opening_balance:0,closing_balance:0});
    const rows=[]; let running=Number(account.opening_balance||0);
    for(const j of journals){for(const l of j.lines){if(l.account_code!==code)continue; running += l.debit-l.credit; rows.push({date:j.date,reference:j.reference,description:j.description,source:j.source,debit:l.debit,credit:l.credit,balance:Number(running.toFixed(2))});}}
    return json(res,200,{account:{code:account.code,name:account.name,type:account.type},opening_balance:Number(account.opening_balance||0),closing_balance:Number(running.toFixed(2)),rows});
  }
  if(method==='GET'&&url.pathname==='/api/accounting/financial-statements'){
    const u=requireUser(req,res,db);if(!u)return;
    const start=String(url.searchParams.get('start')||'').slice(0,10), end=String(url.searchParams.get('end')||'').slice(0,10), branchParam=url.searchParams.get('branch_id'), branchId=branchParam==='all'?null:(getBranch(db,u,branchParam||u.active_branch_id)?.id||null);
    return json(res,200,accountingFinancialStatements(db,u,start,end,branchId));
  }
  if(method==='GET'&&url.pathname==='/api/accounting'){
    const u=requireUser(req,res,db);if(!u)return; const accounts=ensureAccountingAccounts(db,u);
    const start=String(url.searchParams.get('start')||'').slice(0,10), end=String(url.searchParams.get('end')||'').slice(0,10), branchParam=url.searchParams.get('branch_id'), branchId=branchParam==='all'?null:(getBranch(db,u,branchParam||u.active_branch_id)?.id||null);
    const entries=cashbookEntries(db,u,start,end,branchId), manual=db.accounting_entries.filter(x=>x.user_id===u.id&&(!branchId||!x.branch_id||x.branch_id===branchId));
    const balances=accounts.map(a=>({...a,balance:accountBalance(a,manual.filter(x=>!start&&!end||String(x.date)>=start&&String(x.date)<=end))}));
    const income=entries.filter(x=>x.type==='income').reduce((a,x)=>a+x.amount,0), expense=entries.filter(x=>x.type==='expense').reduce((a,x)=>a+x.amount,0);
    const byMethod={}; entries.forEach(x=>byMethod[x.method]=(byMethod[x.method]||0)+(x.type==='income'?x.amount:-x.amount));
    return json(res,200,{accounts:balances,cashbook:entries,summary:{cash_in:Number(income.toFixed(2)),cash_out:Number(expense.toFixed(2)),net_cash:Number((income-expense).toFixed(2)),manual_entries:manual.length},by_method:Object.entries(byMethod).map(([method,total])=>({method,total:Number(total.toFixed(2))})).sort((a,b)=>b.total-a.total),period:{start,end}});
  }
  if(method==='POST'&&url.pathname==='/api/accounting/accounts'){
    const u=requireUser(req,res,db);if(!u)return; const b=await body(req),name=String(b.name||'').trim().slice(0,80),type=String(b.type||'asset');
    if(!name)return json(res,400,{error:'Account name is required.'}); if(!['asset','liability','income','expense','equity'].includes(type))return json(res,400,{error:'Invalid account type.'});
    const code='CUSTOM_'+crypto.randomBytes(4).toString('hex').toUpperCase(); const a={id:id(),user_id:u.id,code,name,type,opening_balance:Number(Number(b.opening_balance||0).toFixed(2)),active:true,created_at:now(),updated_at:now()};db.accounting_accounts.push(a);dbWrite(db);return json(res,201,{success:true,account:a});
  }
  if(method==='PUT'&&url.pathname.match(/^\/api\/accounting\/accounts\/[^/]+$/)){
    const u=requireUser(req,res,db);if(!u)return;const aid=url.pathname.split('/').pop(),a=db.accounting_accounts.find(x=>x.id===aid&&x.user_id===u.id);if(!a)return json(res,404,{error:'Account not found.'});const b=await body(req);if(b.name!==undefined)a.name=String(b.name||'').trim().slice(0,80)||a.name;if(b.opening_balance!==undefined){const n=Number(b.opening_balance);if(!Number.isFinite(n))return json(res,400,{error:'Opening balance must be a valid number.'});a.opening_balance=Number(n.toFixed(2));}a.updated_at=now();dbWrite(db);return json(res,200,{success:true,account:a});
  }
  if(method==='POST'&&url.pathname==='/api/accounting/entries'){
    const u=requireUser(req,res,db);if(!u)return;
    const b=await body(req),amount=Number(b.amount||0),classification=String(b.classification||b.entry_type||'income').toLowerCase(),date=String(b.date||new Date().toISOString().slice(0,10));
    const allowed=['income','expense','owner_capital','owner_withdrawal','loan_received','loan_repayment','asset_purchase'];
    if(!allowed.includes(classification))return json(res,400,{error:'Select a valid accounting classification.'});
    if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Amount must be greater than zero.'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json(res,400,{error:'Invalid date.'});
    const accounts=ensureAccountingAccounts(db,u),accountCode=String(b.account_code||'');
    const account=accounts.find(a=>a.code===accountCode);
    if(!account)return json(res,400,{error:'Select a valid account.'});
    const requiredType={income:'income',expense:'expense',owner_capital:'equity',owner_withdrawal:'equity',loan_received:'liability',loan_repayment:'liability',asset_purchase:'asset'}[classification];
    if(account.type!==requiredType)return json(res,400,{error:`The selected account must be a ${requiredType} account for this entry.`});
    if(classification==='asset_purchase' && ['CASH','BANK','POS','FLUTTERWAVE'].includes(account.code)) {
      return json(res,400,{error:'For a business asset purchase, select the asset being purchased, not the payment account. Cash/Bank/POS is selected as the payment method.'});
    }
    const direction=['expense','owner_withdrawal','loan_repayment','asset_purchase'].includes(classification)?'expense':'income';
    const e={id:id(),user_id:u.id,date,description:String(b.description||'').trim().slice(0,160),reference:String(b.reference||'').trim().slice(0,120),entry_type:direction,classification,amount:Number(amount.toFixed(2)),payment_method:String(b.payment_method||'cash'),account_code:accountCode,notes:String(b.notes||'').trim().slice(0,500),branch_id:(b.branch_id?String(b.branch_id):(u.active_branch_id||null)),created_at:now()};
    if(!e.description)return json(res,400,{error:'Description is required.'});
    db.accounting_entries.push(e);activity(db,u.id,'accounting',e.id,`Manual ${classification} entry of ${moneyText(e.amount)} recorded.`);dbWrite(db);return json(res,201,{success:true,entry:e});
  }
  if(method==='DELETE'&&url.pathname.match(/^\/api\/accounting\/entries\/[^/]+$/)){
    const u=requireUser(req,res,db);if(!u)return;const eid=url.pathname.split('/').pop(),n=db.accounting_entries.length;db.accounting_entries=db.accounting_entries.filter(x=>!(x.id===eid&&x.user_id===u.id));if(n===db.accounting_entries.length)return json(res,404,{error:'Manual entry not found.'});dbWrite(db);return json(res,200,{success:true});
  }

  if (method === "GET" && url.pathname === "/api/payments") {
    const u=requireUser(req,res,db); if(!u)return;
    return json(res,200,{payments:db.payments.filter(p=>p.user_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))});
  }

  if (method === "GET") return serveStatic(res,url.pathname);
  return json(res,404,{error:"Not found"});
}

function redirectHtml(res, target, message) {
  const safe=String(message).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=${target}"><title>BIGJOE</title></head><body style="font-family:Arial;padding:40px"><h2>BIGJOE</h2><p>${safe}</p><p>Returning to BIGJOE...</p></body></html>`);
}
function serveStatic(res, pathname) {
  let file = pathname === "/" ? "index.html" : pathname.replace(/^\/+/,"");
  if(file.includes("..")) return json(res,403,{error:"Forbidden"});
  const full=path.join(PUBLIC_DIR,file);
  if(!fs.existsSync(full) || !fs.statSync(full).isFile()) return json(res,404,{error:"Not found"});
  const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".xml":"application/xml; charset=utf-8",".txt":"text/plain; charset=utf-8",".webmanifest":"application/manifest+json"};
  res.writeHead(200,{"Content-Type":types[path.extname(full)]||"application/octet-stream","Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"});
  fs.createReadStream(full).pipe(res);
}

http.createServer((req,res)=>route(req,res).catch(e=>json(res,500,{error:"Server error: "+e.message}))).listen(PORT,HOST,()=> {
  const lan = [...new Set(Object.values(os.networkInterfaces()).flat().filter(n=>n && n.family==="IPv4" && !n.internal).map(n=>n.address))];
  console.log(`BIGJOE Business AI running locally at http://localhost:${PORT}`);
  if (lan.length) console.log(`Phone/tablet access on the same Wi-Fi: ${lan.map(ip=>`http://${ip}:${PORT}`).join("  |  ")}`);
  console.log(`Public website/app URL: ${process.env.APP_BASE_URL || "Not configured yet — deploy with a domain to make BIGJOE searchable on the internet."}`);
});
