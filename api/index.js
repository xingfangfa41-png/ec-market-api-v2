const https=require("https"),url=require("url");
const TURSO_DB_URL=process.env.TURSO_DATABASE_URL||"";
const TURSO_AUTH_TOKEN=process.env.TURSO_AUTH_TOKEN||"";
function tursoRequest(sql,args){return new Promise((resolve,reject)=>{
if(!TURSO_DB_URL){reject(new Error("TURSO_DATABASE_URL not configured"));return;}
const dbUrl=TURSO_DB_URL.replace("libsql://","https://").replace(/\/?$/,"");
const parsed=url.parse(dbUrl+"/v2/pipeline");
const body=JSON.stringify({requests:[{type:"execute",stmt:{sql,args:args||[]}},{type:"close"}]});
const req=https.request({hostname:parsed.hostname,port:parsed.port||443,path:parsed.path,method:"POST",headers:{Authorization:"Bearer "+TURSO_AUTH_TOKEN,"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},timeout:15000},(res)=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{try{if(res.statusCode>=200&&res.statusCode<300)resolve(JSON.parse(d));else reject(new Error("Turso "+res.statusCode))}catch(e){reject(e)}})});
req.on("error",reject);req.on("timeout",()=>{req.destroy();reject(new Error("timeout"))});req.write(body);req.end();})}
function extractRows(resp){if(!resp||!resp.results)return[];const ok=resp.results.find(r=>r.type==="ok");if(!ok||!ok.response||!ok.response.result||!ok.response.result.rows)return[];const cols=ok.response.result.cols;return ok.response.result.rows.map(row=>{const obj={};row.forEach((cell,i)=>{if(!cols[i])return;const n=cols[i].name;if(!cell||cell.type==="null")obj[n]=null;else if(cell.type==="integer")obj[n]=parseInt(cell.value,10);else obj[n]=cell.value??null;});return obj;})}
function readBody(req){return new Promise((resolve,reject)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>resolve(b));req.on("error",reject);});}
let dbInit=false;async function initDb(){if(dbInit)return;await tursoRequest("CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,category TEXT NOT NULL,server TEXT NOT NULL,qq TEXT NOT NULL,price TEXT,description TEXT,screenshot TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER DEFAULT (unixepoch()))");dbInit=true;}
module.exports=async(req,res)=>{
res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");
if(req.method==="OPTIONS"){res.statusCode=204;res.end();return;}
const reqUrl=url.parse(req.url||"/",true);const path=reqUrl.pathname||"/";res.setHeader("Content-Type","application/json");
try{await initDb();
if(path==="/api/health"||path==="/api/"||path==="/api"){res.statusCode=200;res.end(JSON.stringify({ok:true,db:!!TURSO_DB_URL,env:!!TURSO_AUTH_TOKEN,ts:Date.now()}));return;}
if(path==="/api/listings"&&req.method==="GET"){const listings=extractRows(await tursoRequest("SELECT * FROM listings ORDER BY created_at DESC LIMIT 200"));res.statusCode=200;res.end(JSON.stringify({success:true,data:listings}));return;}
if(path==="/api/listings"&&req.method==="POST"){const body=JSON.parse(await readBody(req));if(!body.title||!body.category||!body.qq){res.statusCode=400;res.end(JSON.stringify({error:"Missing fields"}));return;}const listing=extractRows(await tursoRequest("INSERT INTO listings (title,category,server,qq,price,description,screenshot,status) VALUES (?,?,?,?,?,?,?,?) RETURNING *",[{type:"text",value:body.title||""},{type:"text",value:body.category||""},{type:"text",value:body.server||""},{type:"text",value:body.qq||""},{type:"text",value:body.price||""},{type:"text",value:body.description||""},{type:"text",value:body.screenshot||""},{type:"text",value:"pending"}]))[0];res.statusCode=201;res.end(JSON.stringify({success:true,data:listing}));return;}
res.statusCode=404;res.end(JSON.stringify({error:"Not found"}));}catch(err){console.error("API error:",err.message);res.statusCode=500;res.end(JSON.stringify({error:err.message}));}};
