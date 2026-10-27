/** Approved LAO white-panel visual language; locally rendered, read-only. */
export function designedDashboardHtml(nonce: string): string {
  return String.raw`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAO DevSpace | Painel de status</title>
<style nonce="__NONCE__">
:root{color-scheme:light;font:15px "Segoe UI",Inter,Arial,sans-serif;
--text:#111827;--muted:#667085;--panel:#fff;--bg:#f6f9fe;--border:#e2e8f0;
--green:#16a34a;--red:#ef3339;--amber:#d89b00;--gray:#94a3b8;--blue:#0b66ea;--navy:#0b172b}
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(128deg,#f0f6ff,#fafcff);color:var(--text);min-height:100vh}
button,input,select{font:inherit}
button{cursor:pointer}
button:disabled{cursor:not-allowed;opacity:.65}
.action.primary:disabled{background:#e7eef7;border-color:#d8e1ec;color:#667085;opacity:1}
:focus-visible{outline:3px solid #6bb4ff;outline-offset:3px}
.hidden{display:none!important}
.shell{min-height:100vh;max-width:1540px;margin:auto;display:grid;grid-template-columns:212px minmax(0,1fr);background:#fff;
box-shadow:0 10px 52px #0f172a10}
.sidebar{background:linear-gradient(#f8faff,#f1f6fd);border-right:1px solid var(--border);padding:30px 13px;display:flex;flex-direction:column;gap:22px}
.brand{display:flex;align-items:center;gap:13px;padding:4px 8px}.brand img,.brand-row img{width:54px;height:54px;border-radius:13px}
.brand strong{font-size:18px;letter-spacing:-.3px}.brand small{display:block;margin-top:4px;color:var(--muted);font-size:12px}
.nav{display:flex;flex-direction:column;gap:5px}.nav button{width:100%;text-align:left;border:0;background:transparent;color:#344054;
padding:13px 13px;border-radius:10px;font-weight:600;display:flex;align-items:center;gap:12px}
.nav button[aria-current="page"]{background:#e4f0ff;color:#0752bd;box-shadow:inset 3px 0 #0b66ea}
.nav button:hover{background:#eaf2fe}.nav svg{width:19px;height:19px;flex-shrink:0;stroke:currentColor;stroke-width:1.8;fill:none}
.sidebar-note{margin-top:auto;border-top:1px solid var(--border);padding:15px 8px;color:var(--muted);font-size:12px;line-height:1.6}
.main{min-width:0;padding:28px clamp(17px,3vw,40px) 26px}
.header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:26px;flex-wrap:wrap}
.header h1{font-size:29px;line-height:1.1;margin:0;letter-spacing:-.7px}
.header p{margin:7px 0 0;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:8px 14px;
font-size:13px;font-weight:700;white-space:nowrap}
.pill.good{background:#dcfce8;color:#13783a}.pill.bad{background:#ffe3e4;color:#b4232a}
.pill.warn{background:#fff2d0;color:#926400}.pill.neutral{background:#edf2f7;color:#4b5563}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--gray);vertical-align:middle;flex-shrink:0}
.dot.good{background:var(--green)}.dot.bad{background:var(--red)}.dot.warn{background:#f4b400}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;
box-shadow:0 3px 18px #172c4908}
.section{margin-bottom:18px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 13px}
h2{font-size:18px;margin:0;letter-spacing:-.25px}.subtitle{font-size:13px;color:var(--muted)}
.muted{color:var(--muted)}.error{color:#b4232a}.warn-text{color:#986800}
.link{border:0;background:transparent;color:var(--blue);font-weight:700;font-size:13px;padding:7px 2px}
.link:hover{text-decoration:underline}
.status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}
.status-grid .panel{min-height:125px;padding:18px 17px}
.tile-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;
font-size:22px;color:var(--navy);margin-bottom:8px}
.tile-label{font-size:13px;font-weight:700;margin-bottom:9px}
.tile-value{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.resource-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.resource{border:1px solid var(--border);border-radius:11px;padding:15px;min-width:0}
.resource strong{font-size:13px}.resource .value{font-size:17px;font-weight:750;margin:9px 0;color:var(--navy)}
.progress{width:100%;height:9px;background:#edf2f7;border-radius:20px;overflow:hidden}
.progress>span{display:block;height:100%;width:0;background:var(--green);border-radius:20px;transition:width .35s}
.resource small{display:block;color:var(--muted);margin-top:10px;font-size:12px}
.row{display:flex;align-items:center;gap:12px;border-bottom:1px solid #eef1f5;padding:12px 4px}
.row:last-child{border-bottom:0}
.row-icon{width:33px;height:33px;border-radius:9px;background:#e7f7ec;color:#159447;
font-size:17px;display:grid;place-items:center;flex-shrink:0}
.row-content{flex:1;min-width:0}.row-content strong{font-size:13px;display:block;overflow-wrap:anywhere}
.row-content small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.row-status{font-size:12px;font-weight:700;border-radius:999px;padding:7px 10px;background:#edf2f7;color:#344054;white-space:nowrap}
.row-status.good{background:#dcfce8;color:#13783a}.row-status.warn{background:#fff2d0;color:#926400}
.row-status.bad{background:#ffe3e4;color:#b4232a}
.detail-button{border:1px solid var(--border);background:#fff;border-radius:9px;padding:8px 11px;color:#344054}
.detail-button:hover{background:#f6f9fe}
.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.events .row,.models .row{padding:10px 3px}.events .row-content strong{font-weight:500}
.legend{font-size:12px;color:var(--muted);padding-top:8px;line-height:1.5}
.actions{display:flex;gap:10px;flex-wrap:wrap;padding-top:7px}
.action{border:1px solid var(--border);background:#fff;border-radius:10px;padding:12px 16px;font-weight:700}
.action.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.action:hover:not(:disabled){background:#eaf2fe}.action.primary:hover:not(:disabled){background:#0752bd}
.footer{display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;
color:var(--muted);font-size:12px;padding-top:18px}
.toolbar{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:10px}
select,input{border:1px solid #bdcbdc;border-radius:10px;background:#fff;color:var(--text);padding:10px 12px;max-width:100%}
.login-shell{max-width:520px;margin:13vh auto;padding:0 20px}
.login-shell .panel{padding:29px}.brand-row{display:flex;align-items:center;gap:15px;margin-bottom:25px}
.login-shell h1{font-size:24px;margin:0}.login-shell p{line-height:1.55}
.login-shell form{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0}
.login-shell input{flex:1;min-width:175px}
.login-shell button{border:0;background:var(--blue);color:#fff;border-radius:9px;padding:11px 20px;font-weight:700}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5;
max-height:430px;overflow:auto;background:#f4f7fb;padding:14px;border-radius:9px;border:1px solid var(--border)}
.empty{padding:15px;color:var(--muted);font-size:13px}
.fineprint{font-size:12px;line-height:1.6;color:var(--muted)}
@media(max-width:1050px){.status-grid,.resource-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.shell{display:block}.sidebar{padding:11px 14px;gap:8px}.sidebar .brand{display:none}
.nav{flex-direction:row;overflow:auto}.nav button{white-space:nowrap;width:auto;padding:10px 13px}
.sidebar-note{display:none}.main{padding:20px 15px}.two-columns{grid-template-columns:1fr}
.status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.header h1{font-size:24px}}
@media(max-width:420px){.status-grid,.resource-grid{grid-template-columns:1fr}
.row{flex-wrap:wrap}.row-status{margin-left:45px}.header{margin-bottom:15px}}
</style></head><body>
<section id="login" class="login-shell">
 <div class="panel">
  <div class="brand-row"><img src="/dashboard/assets/logo.png" alt="Marca LAO DevSpace" width="54" height="54">
  <div><h1>LAO DevSpace</h1><span class="muted">Painel de status · acesso local</span></div></div>
  <h2>Autenticação</h2>
  <p class="muted">Informe o token configurado no daemon. Ele permanece apenas nesta aba e não é enviado na URL.</p>
  <form id="form"><input id="token" aria-label="Token local" type="password" autocomplete="off" required placeholder="Token local"><button type="submit">Entrar</button></form>
  <p id="message" class="error" role="alert"></p>
 </div>
</section>
<div id="content" class="shell hidden">
 <aside class="sidebar" aria-label="Menu principal">
  <div class="brand"><img src="/dashboard/assets/logo.png" alt="" width="54" height="54"><div><strong>LAO DevSpace</strong><small>Monitor local</small></div></div>
  <nav class="nav" aria-label="Seções do painel">
   <button type="button" data-section="status" aria-current="page"><span aria-hidden="true">⌂</span> Status</button>
   <button type="button" data-section="tarefas"><span aria-hidden="true">▤</span> Tarefas</button>
   <button type="button" data-section="modelos"><span aria-hidden="true">⬡</span> Modelos</button>
   <button type="button" data-section="logs"><span aria-hidden="true">☷</span> Logs</button>
   <button type="button" data-section="configuracoes"><span aria-hidden="true">⚙</span> Configurações</button>
  </nav>
  <div class="sidebar-note">Acesso somente local<br>Leitura autenticada<br>Sem execução automática</div>
 </aside>
 <main class="main">
  <header class="header"><div><h1>LAO DevSpace</h1><p id="section-description">Painel de status</p></div>
   <div id="connection" class="pill neutral" role="status"><span class="dot"></span><span id="connection-text">Verificando...</span></div>
  </header>
  <div id="section-status">
   <section class="section"><div class="status-grid">
    <div class="panel"><div class="tile-icon" aria-hidden="true">⚙</div><div class="tile-label">LAO Service</div><div class="tile-value"><span id="lao-dot" class="dot"></span><span id="lao-service">Verificando...</span></div></div>
    <div class="panel"><div class="tile-icon" aria-hidden="true">↗</div><div class="tile-label">DevSpace MCP</div><div class="tile-value"><span id="mcp-dot" class="dot"></span><span id="devspace-mcp">Não verificado</span></div></div>
    <div class="panel"><div class="tile-icon" aria-hidden="true">♧</div><div class="tile-label">Ollama</div><div class="tile-value"><span id="ollama-dot" class="dot"></span><span id="ollama-state">Não verificado</span></div></div>
    <div class="panel"><div class="tile-icon" aria-hidden="true">⬡</div><div class="tile-label">Modelo padrão</div><div id="model-name" class="tile-value">—</div></div>
   </div></section>
   <section class="section panel">
    <div class="section-title"><h2>▥ &nbsp; Recursos do sistema</h2><button data-section="configuracoes" class="link" type="button">Ver detalhes ›</button></div>
    <div class="resource-grid">
     <div class="resource"><strong>GPU</strong><div class="value" id="gpu">—</div><div class="progress"><span id="gpu-bar"></span></div><small>Utilização NVIDIA</small></div>
     <div class="resource"><strong>VRAM</strong><div class="value" id="vram">—</div><div class="progress"><span id="vram-bar"></span></div><small>Memória da GPU</small></div>
     <div class="resource"><strong>CPU</strong><div class="value" id="cpu">—</div><div class="progress"><span id="cpu-bar"></span></div><small id="cores">Aguardando amostra</small></div>
     <div class="resource"><strong>RAM</strong><div class="value" id="ram">—</div><div class="progress"><span id="ram-bar"></span></div><small>Memória do sistema</small></div>
    </div>
    <p id="resource-alerts" class="fineprint" aria-live="polite">Aguardando medições...</p>
    <div class="fineprint">Amostras locais reais. Percentual de GPU não representa camadas do modelo carregadas em GPU.</div>
   </section>
   <section class="section panel">
    <div class="section-title"><h2>▤ &nbsp; Tarefas</h2><button class="link" type="button" data-section="tarefas">Ver todas ›</button></div>
    <div id="task-summary"></div><div id="summary-empty" class="empty">Nenhuma tarefa registrada.</div>
   </section>
   <div class="two-columns section">
    <section class="panel models"><div class="section-title"><h2>⬡ &nbsp; Modelos locais</h2><button class="link" type="button" data-section="modelos">Ver modelos ›</button></div><div id="model-summary" class="empty">Aguardando dados do modelo padrão.</div></section>
    <section class="panel events"><div class="section-title"><h2>▤ &nbsp; Eventos recentes</h2><button class="link" type="button" data-section="logs">Ver todos ›</button></div><div id="event-summary" class="empty">Nenhum evento disponível.</div></section>
   </div>
  </div>
  <section id="section-tarefas" class="section panel hidden">
   <div class="section-title"><h2>Histórico de tarefas</h2><span class="subtitle" id="total">—</span></div>
   <div class="toolbar"><label for="filter">Estado:</label><select id="filter">
     <option value="all">Todos</option><option value="awaiting_review">Aguardando revisão</option>
     <option value="running">Executando</option><option value="approved">Aprovadas</option>
     <option value="rejected">Rejeitadas</option><option value="failed">Falhas</option>
   </select></div><div id="tasks"></div><div id="empty" class="empty">Nenhuma tarefa nesse filtro.</div>
  </section>
  <section id="section-modelos" class="section panel hidden">
   <h2>Modelos locais</h2><p class="muted">Modelo configurado não significa que o modelo esteja carregado em VRAM.</p>
   <div class="row"><div class="row-icon" aria-hidden="true">⬡</div><div class="row-content"><strong id="model-detail">—</strong><small>Modelo selecionado no LAO</small></div><span id="model-capability" class="row-status">Não verificado</span></div>
   <p class="fineprint">A listagem de modelos instalados e o estado de carregamento ainda não estão disponíveis nesta API somente-leitura. Não indicamos “carregado” sem confirmação.</p>
  </section>
  <section id="section-logs" class="section panel hidden"><h2>Eventos recentes</h2><p class="muted">Resumo sanitizado dos registros de tarefas. Sem logs brutos, prompts ou credenciais.</p><div id="events"></div></section>
  <section id="section-configuracoes" class="section panel hidden"><h2>Configurações e diagnósticos</h2>
   <p class="muted">Painel somente-leitura. Controles que alteram serviços exigirão confirmação e uma integração Windows própria.</p>
   <div class="row"><div class="row-content"><strong>Estado da operação</strong><small id="dependencies">—</small></div></div>
   <div class="row"><div class="row-content"><strong>Consumo do processo</strong><small id="node-memory">—</small></div></div>
   <div class="row"><div class="row-content"><strong>Coleta mais recente</strong><small id="checked">—</small></div></div>
   <div class="row"><div class="row-content"><strong>Inicialização automática</strong><small>Não configurada por este painel</small></div></div>
  </section>
  <section id="detail-panel" class="panel hidden" aria-live="polite"><div class="section-title"><h2>Execuções, testes e revisão</h2><button type="button" id="close-detail" class="link">Fechar</button></div><p class="fineprint">Evidência resumida, sem prompts nem diffs brutos.</p><pre id="detail"></pre></section>
  <div class="actions">
    <button type="button" class="action primary" disabled title="Envio de tarefas requer integração autenticada e aprovação">＋ Nova tarefa</button>
    <button type="button" class="action" data-section="logs">▤ Ver eventos</button>
    <button type="button" class="action" disabled title="Controle de serviços não habilitado">↻ Reiniciar serviço</button>
    <button type="button" class="action" data-section="configuracoes">⚙ Configurações</button>
  </div>
  <div class="footer"><span>LAO DevSpace · Atualiza a cada 10 s · Sem autoaprovação</span><button id="logout" class="link" type="button">Sair</button></div>
 </main>
</div>
<script nonce="__NONCE__">
(() => {
"use strict";
const $=id=>document.getElementById(id);
let token="",timer=null,loadedTasks=[],activeSection="status";
const sections=["status","tarefas","modelos","logs","configuracoes"];
const names={status:"Painel de status",tarefas:"Tarefas",modelos:"Modelos locais",logs:"Eventos e logs",configuracoes:"Configurações"};
const date=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR");};
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const percent=(value)=>Number.isFinite(value)?Math.min(100,Math.max(0,value)):null;
const pctbar=(id,value)=>{$(id).style.width=value===null?"0%":String(value)+"%";};
function section(name){
 if(!sections.includes(name))return;
 activeSection=name;
 if(location.hash!=="#"+name)history.replaceState(null,"","#"+name);
 for(const id of sections){
  $("section-"+id).classList.toggle("hidden",id!==name);
 }
 for(const b of document.querySelectorAll(".nav [data-section]")){
  if(b.dataset.section===name)b.setAttribute("aria-current","page");
  else b.removeAttribute("aria-current");
 }
 $("section-description").textContent=names[name];
 $("detail-panel").classList.add("hidden");
}
document.querySelectorAll("[data-section]").forEach(b=>b.addEventListener("click",()=>section(b.dataset.section)));
function dot(id,state){$(id).className="dot "+state;}
function rowStatus(t){
 const m={awaiting_review:["Aguardando revisão","warn"],approved:["Aprovada","good"],
 completed:["Concluída","good"],failed:["Falhou","bad"],rejected:["Rejeitada","bad"],
 running:["Executando",""],validating:["Validando",""],cancelled:["Cancelada",""]};
 return m[t.status]||[String(t.status||"Desconhecida"),""];
}
function renderTasks(){
 const val=$("filter").value;
 const items=loadedTasks.filter(t=>val==="all"||t.status===val);
 const root=$("tasks");root.replaceChildren();
 for(const t of items){
  const row=node("div","row");row.appendChild(node("div","row-icon","▤"));
  const info=node("div","row-content");info.appendChild(node("strong","",t.id));
  info.appendChild(node("small","",String(t.model||"Modelo não informado")+" · "+date(t.updatedAt)));
  row.appendChild(info);
  const [label,cls]=rowStatus(t);row.appendChild(node("span","row-status "+cls,label));
  const button=node("button","detail-button","Ver");
  button.type="button";button.setAttribute("aria-label","Detalhes da tarefa "+t.id);
  button.addEventListener("click",()=>showDetails(t.id));
  row.appendChild(button);root.appendChild(row);
 }
 $("empty").classList.toggle("hidden",items.length>0);
 const summary=$("task-summary");summary.replaceChildren();
 for(const t of loadedTasks.slice(0,3)){
  const row=node("div","row");row.appendChild(node("div","row-icon","▤"));
  const info=node("div","row-content");info.appendChild(node("strong","",t.id.slice(0,8)+"…"));
  info.appendChild(node("small","",String(t.model||"Modelo desconhecido")+" · "+date(t.updatedAt)));
  row.appendChild(info);const [label,cls]=rowStatus(t);
  row.appendChild(node("span","row-status "+cls,label));summary.appendChild(row);
 }
 $("summary-empty").classList.toggle("hidden",loadedTasks.length>0);
 $("total").textContent=loadedTasks.length+" tarefas (últimas 200)";
}
function renderEvents(){
 const root=$("events"),summary=$("event-summary");
 root.replaceChildren();summary.replaceChildren();
 const items=loadedTasks.slice(0,30);
 for(const [index,t] of items.entries()){
  const line=node("div","row");line.appendChild(node("span","dot "+(t.status==="failed"?"bad":t.status==="awaiting_review"?"warn":"good")));
  const info=node("div","row-content");
  const [label]=rowStatus(t);
  info.appendChild(node("strong","",label+" · Tarefa "+t.id.slice(0,8)));
  info.appendChild(node("small","",date(t.updatedAt)));line.appendChild(info);
  root.appendChild(line);
  if(index<3)summary.appendChild(line.cloneNode(true));
 }
 if(!items.length){root.appendChild(node("p","empty","Nenhum evento de tarefas registrado."));summary.appendChild(node("p","empty","Nenhum evento de tarefas registrado."));}
}
async function get(path){
 const r=await fetch(path,{cache:"no-store",credentials:"omit",headers:{Authorization:"Bearer "+token}});
 if(!r.ok)throw Error(r.status===401?"Token inválido":"Consulta indisponível");
 return r.json();
}
async function showDetails(id){
 section("tarefas");$("detail-panel").classList.remove("hidden");$("detail").textContent="Carregando...";
 try{const data=await get("/dashboard/api/tasks/"+id);$("detail").textContent=JSON.stringify(data,null,2);}
 catch(e){$("detail").textContent=e.message;}
}
async function refresh(){
 try{
  const [status,data,metrics]=await Promise.all([get("/dashboard/api/status"),get("/dashboard/api/tasks"),get("/dashboard/api/metrics")]);
  const reasons=Array.isArray(status.blockingReasons)?status.blockingReasons:[];
  const ready=status.ready===true;
  $("connection").className="pill "+(ready?"good":"warn");
  $("connection-text").textContent=ready?"Ativo":"Atenção";
  $("lao-service").textContent=status.live===true?"Respondendo":"Sem resposta";
  dot("lao-dot",status.live===true?"good":"bad");
  const mcp=!reasons.includes("devspace_unverified");
  $("devspace-mcp").textContent=mcp?"Verificado":"Não verificado";
  dot("mcp-dot",mcp?"good":"neutral");
  const offline=reasons.includes("ollama_unavailable");
  $("ollama-state").textContent=offline?"Indisponível":reasons.includes("lao_disabled")?"Não verificado":"Respondendo";
  dot("ollama-dot",offline?"bad":reasons.includes("lao_disabled")?"neutral":"good");
  const model=status.modelConfigured||"Não informado";
  $("model-name").textContent=model;$("model-detail").textContent=model;
  const modelOk=!reasons.some(x=>["model_missing","model_tools_unsupported","ollama_unavailable"].includes(x));
  $("model-capability").textContent=offline?"Ollama offline":modelOk?"Disponibilidade verificada":"Indisponível";
  $("model-capability").className="row-status "+(offline||!modelOk?"warn":"good");
  $("model-summary").replaceChildren();
  const modelRow=node("div","row");
  modelRow.appendChild(node("span","dot "+(modelOk?"good":"warn")));
  const modelInfo=node("div","row-content");modelInfo.appendChild(node("strong","",model));
  modelInfo.appendChild(node("small","","Modelo configurado · carregamento não verificado"));
  modelRow.appendChild(modelInfo);$("model-summary").appendChild(modelRow);
  const cpu=percent(metrics.cpu.utilizationPercent),gpu=metrics.gpu?percent(metrics.gpu.utilizationPercent):null;
  const ram=percent(metrics.ram.utilizationPercent);
  const vram=metrics.gpu?percent(100*metrics.gpu.vramUsedMiB/metrics.gpu.vramTotalMiB):null;
  $("cpu").textContent=cpu===null?"Aguardando amostra":cpu+"%";pctbar("cpu-bar",cpu);
  $("gpu").textContent=gpu===null?"—":gpu+"%";pctbar("gpu-bar",gpu);
  $("ram").textContent=Math.round(metrics.ram.usedBytes/1048576)+" / "+Math.round(metrics.ram.totalBytes/1048576)+" MiB";
  pctbar("ram-bar",ram);
  $("vram").textContent=metrics.gpu?metrics.gpu.vramUsedMiB+" / "+metrics.gpu.vramTotalMiB+" MiB":"—";
  pctbar("vram-bar",vram);
  $("cores").textContent=metrics.cpu.logicalCores+" núcleos lógicos";
  $("node-memory").textContent=Math.round(metrics.process.rssBytes/1048576)+" MiB RSS";
  const warningLabels={cpu_pressure:"CPU acima de 95%",ram_pressure:"RAM acima de 90%",vram_pressure:"VRAM acima de 90%"};
  const warnings=metrics.alerts?.advisoryOnly===true&&Array.isArray(metrics.alerts.warnings)
    ?metrics.alerts.warnings.filter(k=>Object.hasOwn(warningLabels,k)).map(k=>warningLabels[k]):null;
  $("resource-alerts").textContent=warnings===null?"Alertas indisponíveis":warnings.length?"Atenção: "+warnings.join(" · "):"Sem alertas de recursos confirmados.";
  $("resource-alerts").className="fineprint "+(warnings?.length?"warn-text":"");
  $("dependencies").textContent=reasons.length?reasons.join(" · "):"Sem bloqueios de prontidão";
  $("checked").textContent=date(status.checkedAt);
  loadedTasks=Array.isArray(data.tasks)?data.tasks:[];
  renderTasks();renderEvents();
  $("content").classList.remove("hidden");$("login").classList.add("hidden");$("message").textContent="";
  if(sections.includes(location.hash.slice(1)) && location.hash.slice(1)!==activeSection){
   section(location.hash.slice(1));
  }
 }catch(err){
  $("connection").className="pill bad";$("connection-text").textContent="Conexão indisponível";
  if(!$("login").classList.contains("hidden"))$("message").textContent=err.message;
  else{
   $("dependencies").textContent="Coleta indisponível: "+err.message;
   for(const [label,indicator] of [["lao-service","lao-dot"],["devspace-mcp","mcp-dot"],["ollama-state","ollama-dot"]]){
    $(label).textContent="Não verificado";dot(indicator,"neutral");
   }
   for(const id of ["gpu","vram","cpu","ram","node-memory"]){$(id).textContent="—";}
   for(const id of ["gpu-bar","vram-bar","cpu-bar","ram-bar"]){pctbar(id,null);}
   $("cores").textContent="Coleta indisponível";
   $("resource-alerts").textContent="Medições temporariamente indisponíveis.";
   $("checked").textContent="—";
   $("model-capability").textContent="Não verificado";
   $("model-capability").className="row-status";
   const modelIndicator=document.querySelector("#model-summary .dot");
   if(modelIndicator)modelIndicator.className="dot neutral";
  }
 }
}
$("form").addEventListener("submit",async e=>{
 e.preventDefault();clearInterval(timer);token=$("token").value;$("token").value="";
 await refresh();
 if(!$("content").classList.contains("hidden"))timer=setInterval(refresh,10000);
});
$("filter").addEventListener("change",renderTasks);
window.addEventListener("hashchange",()=>{if(sections.includes(location.hash.slice(1)))section(location.hash.slice(1));});
$("close-detail").addEventListener("click",()=>$("detail-panel").classList.add("hidden"));
$("logout").addEventListener("click",()=>{
 clearInterval(timer);token="";loadedTasks=[];$("detail").textContent="";
 $("detail-panel").classList.add("hidden");$("login").classList.remove("hidden");$("content").classList.add("hidden");
 $("connection-text").textContent="Acesso restrito";$("message").textContent="";
});
})();
</script></body></html>`.replaceAll("__NONCE__",nonce);
}
