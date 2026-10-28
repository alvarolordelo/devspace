/** Approved LAO white-panel visual language; locally rendered, read-only. */
export type LaoDashboardLanguage = "pt-BR" | "en-US";
export function designedDashboardHtml(nonce: string, language: LaoDashboardLanguage = "pt-BR"): string {
  const t = language === "en-US" ? {
    htmlLang:"en", title:"Status dashboard", localMonitor:"Local monitor", restricted:"Local access only",
    readAuth:"Authenticated read", noAuto:"No automatic execution", status:"Status", tasks:"Tasks", models:"Models",
    settings:"Settings", checking:"Checking...", notVerified:"Not verified", defaultModel:"Default model",
    chooseModel:"Click to choose a local model", installedModels:"Installed local models", resources:"System resources",
    details:"View details", gpuUse:"NVIDIA utilization", gpuMemory:"GPU memory", waitingSample:"Waiting for sample",
    systemMemory:"System memory", waitingMetrics:"Waiting for metrics...", realSamples:"Real local samples. GPU percentage does not represent model layers loaded on GPU.",
    viewAll:"View all", noTasks:"No tasks recorded.", localModels:"Local models", viewModels:"View models",
    waitingModel:"Waiting for default model data.", recentEvents:"Recent events", noEvents:"No events available.",
    taskHistory:"Task history", state:"State", all:"All", awaitingReview:"Awaiting review", running:"Running",
    taskCreated:"Created", taskQueued:"Queued", taskPreparing:"Preparing", taskValidating:"Validating",
    taskRevision:"Needs changes", taskInterrupted:"Interrupted",
    approved:"Approved", rejected:"Rejected", failed:"Failed", noFilterTasks:"No tasks in this filter.",
    modelSelected:"Model selected in LAO", modelInfo:"A configured model does not mean it is loaded in VRAM.",
    modelApiNote:"Installed model listing and load state are not yet available in this read-only API. We do not claim “loaded” without confirmation.",
    eventInfo:"Sanitized task event summary. No raw logs, prompts or credentials.", settingsDiag:"Settings and diagnostics",
    settingsInfo:"Local diagnostics dashboard. Restarting the LAO daemon requires confirmation; DevSpace MCP and Ollama are not restarted.",
    operationState:"Operation state", processUsage:"Process usage", latestCheck:"Latest check", autostart:"Automatic startup",
    notConfiguredHere:"Not configured from this dashboard", executions:"Runs, tests and review", close:"Close",
    evidence:"Read-only overview for the authenticated operator. Raw patches and test logs are not shown.", newTask:"+ New task", viewEvents:"View events",
    originalRequest:"What was requested", expectedResults:"Acceptance criteria", modelResponse:"Model response",
    executionHistory:"Executions", taskScope:"Task information", reviewInfo:"Review", testResults:"Tests",
    changedFiles:"Files and changes", activityHistory:"Activity", technicalDetails:"Technical identifiers",
    fileAdded:"Created", fileUpdated:"Modified", fileDeleted:"Deleted", fileMoved:"Moved",
    fileUnknown:"Change", addedLines:"lines added", removedLines:"lines removed",
    changeNotPublished:"Changes are isolated and are not applied to the original project without approval.",
    changePublished:"This approved change was applied to the original project.",
    changeRecovery:"Promotion requires recovery. Inspect its technical status before making further changes.",
    noDiffSummary:"No Git diff summary available (new files may be untracked).",
    readOnlyTask:"Read-only analysis", isolatedWrite:"Isolated code change", executionTime:"Duration",
    taskStarted:"Created", lastUpdated:"Updated", taskWorkspace:"Workspace", taskIdentifier:"Task ID",
    noModelResponse:"No model response recorded.", noExecution:"No executions recorded yet.",
    noTests:"No test results recorded.", noChanges:"No changed files recorded.",
    noReview:"No review decision yet. This does not mean the task was approved.",
    reviewPending:"Model finished; waiting for human review. No automatic approval.",
    reviewVerified:"Criteria verified", notReviewed:"Criteria not verified", reviewedAt:"Decided",
    modelUsed:"Model", runFailed:"Execution error", noCriteria:"No criteria recorded.",
    lastExecution:"Latest execution", previousRuns:"Previous attempts", sourceFiles:"Files read", seconds:"s",
    requestedBy:"Requested by", resumeWork:"Review / Continue", targetAgent:"Continue with",
    copyHandoff:"Copy request", handoffCopied:"Continuation instruction copied. Paste and send it in the selected assistant to call lao_resume.",
    handoffManual:"Clipboard was unavailable. Copy the instruction below and send it in the selected assistant.",
    handoffNote:"Opens the chosen assistant and copies an MCP continuation instruction. Opening a chat does not execute an MCP call automatically.",
    otherAgent:"Copy only (other MCP client)",
    restartLao:"Restart LAO", footer:"LAO DevSpace · Refreshes every 10 s · No auto-approval", logout:"Sign out",
    auth:"Authentication", authInfo:"Enter the token once. This tab session remains active after F5 refresh (up to 8 hours), without saving the primary token in the browser.",
    localToken:"Local token", enter:"Sign in", statusPanel:"Status dashboard", restrictedAccess:"Restricted access",
    queryingOllama:"Querying Ollama…", noLocalModels:"No local model installed.", activeTasks:"There are active tasks.",
    modelUnavailable:"Model unavailable or not installed.", modelPrefix:"Models", taskApproved:"Approved", taskCompleted:"Completed",
    taskFailed:"Failed", taskRejected:"Rejected", taskCancelled:"Cancelled", unknown:"Unknown", modelNotProvided:"Model not provided",
    modelUnknown:"Unknown model", view:"View", taskDetails:"Task details", last200:"tasks (last 200)", task:"Task",
    resourcesNormalized:"Resources normalized", noRecordedEvents:"No events recorded.", sessionExpired:"Session expired or invalid",
    queryUnavailable:"Query unavailable", loading:"Loading...", activeLabel:"Active", attention:"Attention", responding:"Responding",
    noResponse:"No response", connected:"Connected", offline:"Offline", unavailable:"Unavailable", notProvided:"Not provided",
    availabilityVerified:"Availability verified", configuredNotLoaded:"Configured model · load state not verified",
    logicalCores:"logical cores", alertsUnavailable:"Alerts unavailable", attentionPrefix:"Attention", noResourceAlerts:"No confirmed resource alerts.",
    noReadinessBlocks:"No readiness blocks", connectionUnavailable:"Connection unavailable", collectionUnavailable:"Collection unavailable",
    measurementsUnavailable:"Measurements temporarily unavailable.", invalidToken:"Invalid token", authUnavailable:"Authentication unavailable",
    invalidSession:"Invalid session", sessionExpiredAgain:"The session expired. Sign in again.", restartOnly:"Restart only the local LAO DevSpace? DevSpace MCP and Ollama will not be interrupted.",
    restartUnavailable:"Restart unavailable or not authorized.", restartBlocked:"There are active tasks; restart blocked.", restarting:"Restarting LAO…",
    restartRequested:"Restart requested. Waiting for the daemon to respond again.", restartAllowedTitle:"Restart only the local LAO daemon, with confirmation",
    inUse:"in use", gpuUnavailable:"GPU unavailable",
    restartUnavailableTitle:"Restart unavailable in this LAO instance", brandAlt:"LAO DevSpace brand", mainMenu:"Main menu", panelSections:"Dashboard sections",
  } : {
    htmlLang:"pt-BR", title:"Painel de status", localMonitor:"Monitor local", restricted:"Acesso somente local",
    readAuth:"Leitura autenticada", noAuto:"Sem execução automática", status:"Status", tasks:"Tarefas", models:"Modelos",
    settings:"Configurações", checking:"Verificando...", notVerified:"Não verificado", defaultModel:"Modelo padrão",
    chooseModel:"Clique para escolher um modelo local", installedModels:"Modelos locais instalados", resources:"Recursos do sistema",
    details:"Ver detalhes", gpuUse:"Utilização NVIDIA", gpuMemory:"Memória da GPU", waitingSample:"Aguardando amostra",
    systemMemory:"Memória do sistema", waitingMetrics:"Aguardando medições...", realSamples:"Amostras locais reais. Percentual de GPU não representa camadas do modelo carregadas em GPU.",
    viewAll:"Ver todas", noTasks:"Nenhuma tarefa registrada.", localModels:"Modelos locais", viewModels:"Ver modelos",
    waitingModel:"Aguardando dados do modelo padrão.", recentEvents:"Eventos recentes", noEvents:"Nenhum evento disponível.",
    taskHistory:"Histórico de tarefas", state:"Estado", all:"Todos", awaitingReview:"Aguardando revisão", running:"Executando",
    taskCreated:"Criada", taskQueued:"Na fila", taskPreparing:"Preparando", taskValidating:"Validando",
    taskRevision:"Precisa de correções", taskInterrupted:"Interrompida",
    approved:"Aprovadas", rejected:"Rejeitadas", failed:"Falhas", noFilterTasks:"Nenhuma tarefa nesse filtro.",
    modelSelected:"Modelo selecionado no LAO", modelInfo:"Modelo configurado não significa que o modelo esteja carregado em VRAM.",
    modelApiNote:"A listagem de modelos instalados e o estado de carregamento ainda não estão disponíveis nesta API somente-leitura. Não indicamos “carregado” sem confirmação.",
    eventInfo:"Resumo sanitizado dos registros de tarefas. Sem logs brutos, prompts ou credenciais.", settingsDiag:"Configurações e diagnósticos",
    settingsInfo:"Painel de diagnóstico local. O reinício do daemon LAO exige confirmação; DevSpace MCP e Ollama não são reiniciados.",
    operationState:"Estado da operação", processUsage:"Consumo do processo", latestCheck:"Coleta mais recente", autostart:"Inicialização automática",
    notConfiguredHere:"Não configurada por este painel", executions:"Execuções, testes e revisão", close:"Fechar",
    evidence:"Visão de leitura para o operador autenticado. Patches e logs brutos não são exibidos.", newTask:"+ Nova tarefa", viewEvents:"Ver eventos",
    originalRequest:"O que foi solicitado", expectedResults:"Critérios de aceitação", modelResponse:"Resposta do modelo",
    executionHistory:"Execuções", taskScope:"Informações da tarefa", reviewInfo:"Revisão", testResults:"Testes",
    changedFiles:"Arquivos e alterações", activityHistory:"Histórico de etapas", technicalDetails:"Identificadores técnicos",
    fileAdded:"Criado", fileUpdated:"Modificado", fileDeleted:"Excluído", fileMoved:"Movido",
    fileUnknown:"Alteração", addedLines:"linhas adicionadas", removedLines:"linhas removidas",
    changeNotPublished:"As alterações estão isoladas e não foram aplicadas ao projeto original sem aprovação.",
    changePublished:"Esta alteração aprovada já foi aplicada ao projeto original.",
    changeRecovery:"A promoção exige recuperação. Confira o estado técnico antes de novas alterações.",
    noDiffSummary:"Sem resumo de diferenças do Git (arquivos novos podem não estar rastreados).",
    readOnlyTask:"Análise somente leitura", isolatedWrite:"Alteração isolada de código", executionTime:"Duração",
    taskStarted:"Criada em", lastUpdated:"Atualizada em", taskWorkspace:"Workspace", taskIdentifier:"ID da tarefa",
    noModelResponse:"Nenhuma resposta do modelo registrada.", noExecution:"Nenhuma execução registrada ainda.",
    noTests:"Nenhum resultado de teste registrado.", noChanges:"Nenhum arquivo alterado registrado.",
    noReview:"Ainda não houve decisão de revisão. Isso não significa que a tarefa foi aprovada.",
    reviewPending:"O modelo concluiu; aguardando revisão humana. Sem aprovação automática.",
    reviewVerified:"Critérios verificados", notReviewed:"Critérios não verificados", reviewedAt:"Decisão em",
    modelUsed:"Modelo", runFailed:"Erro na execução", noCriteria:"Nenhum critério registrado.",
    lastExecution:"Última execução", previousRuns:"Tentativas anteriores", sourceFiles:"Arquivos consultados", seconds:"s",
    requestedBy:"Solicitado por", resumeWork:"Revisar / Continuar", targetAgent:"Continuar com",
    copyHandoff:"Copiar solicitação", handoffCopied:"Instrução copiada. Cole e envie na IA escolhida para chamar lao_resume.",
    handoffManual:"Não foi possível copiar automaticamente. Copie a instrução abaixo e envie na IA escolhida.",
    handoffNote:"Abre a IA escolhida e copia uma instrução MCP. Abrir o chat não executa uma chamada MCP automaticamente.",
    otherAgent:"Somente copiar (outro cliente MCP)",
    restartLao:"Reiniciar LAO", footer:"LAO DevSpace · Atualiza a cada 10 s · Sem autoaprovação", logout:"Sair",
    auth:"Autenticação", authInfo:"Informe o token uma vez. A sessão desta aba permanece ativa ao atualizar com F5 (até 8 horas), sem salvar o token principal no navegador.",
    localToken:"Token local", enter:"Entrar", statusPanel:"Painel de status", restrictedAccess:"Acesso restrito",
    queryingOllama:"Consultando Ollama…", noLocalModels:"Nenhum modelo local instalado.", activeTasks:"Há tarefas em execução.",
    modelUnavailable:"Modelo indisponível ou não instalado.", modelPrefix:"Modelos", taskApproved:"Aprovada", taskCompleted:"Concluída",
    taskFailed:"Falhou", taskRejected:"Rejeitada", taskCancelled:"Cancelada", unknown:"Desconhecida", modelNotProvided:"Modelo não informado",
    modelUnknown:"Modelo desconhecido", view:"Ver", taskDetails:"Detalhes da tarefa", last200:"tarefas (últimas 200)", task:"Tarefa",
    resourcesNormalized:"Recursos normalizados", noRecordedEvents:"Nenhum evento registrado.", sessionExpired:"Sessão expirada ou inválida",
    queryUnavailable:"Consulta indisponível", loading:"Carregando...", activeLabel:"Ativo", attention:"Atenção", responding:"Respondendo",
    noResponse:"Sem resposta", connected:"Conectado", offline:"Offline", unavailable:"Indisponível", notProvided:"Não informado",
    availabilityVerified:"Disponibilidade verificada", configuredNotLoaded:"Modelo configurado · carregamento não verificado",
    logicalCores:"núcleos lógicos", alertsUnavailable:"Alertas indisponíveis", attentionPrefix:"Atenção", noResourceAlerts:"Sem alertas de recursos confirmados.",
    noReadinessBlocks:"Sem bloqueios de prontidão", connectionUnavailable:"Conexão indisponível", collectionUnavailable:"Coleta indisponível",
    measurementsUnavailable:"Medições temporariamente indisponíveis.", invalidToken:"Token inválido", authUnavailable:"Autenticação indisponível",
    invalidSession:"Sessão inválida", sessionExpiredAgain:"A sessão expirou. Entre novamente.", restartOnly:"Reiniciar somente o LAO DevSpace local? O DevSpace MCP e o Ollama não serão interrompidos.",
    restartUnavailable:"Reinício não autorizado ou indisponível.", restartBlocked:"Há tarefas em execução; reinício bloqueado.", restarting:"Reiniciando LAO…",
    restartRequested:"Reinício solicitado. Aguardando daemon responder novamente.", restartAllowedTitle:"Reiniciar somente o daemon local LAO, mediante confirmação",
    inUse:"em uso", gpuUnavailable:"GPU indisponível",
    restartUnavailableTitle:"Reinício indisponível nesta instância do LAO", brandAlt:"Marca LAO DevSpace", mainMenu:"Menu principal", panelSections:"Seções do painel",
  };
  return String.raw`<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAO DevSpace | ${t.title}</title>
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
.nav button:hover{background:#eaf2fe}.nav img{width:19px;height:19px;flex-shrink:0;object-fit:contain}
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
.status-grid .panel{min-height:105px;padding:16px 17px}
.status-head{display:flex;align-items:center;gap:9px;margin-bottom:10px;min-width:0}
.tile-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;
font-size:22px;color:var(--navy);margin:0;flex-shrink:0}
.tile-icon img{width:24px;height:24px;object-fit:contain}
.model-choice{cursor:pointer;border-bottom:1px dashed #a5b4c7;display:inline-block}
.model-choice:focus-visible{outline:2px solid #145edc;border-radius:3px}
.model-select{width:min(100%,260px);border:1px solid #b5c8e0;border-radius:8px;background:#fff;
color:#101c31;padding:7px;margin-top:5px;font:inherit}
.inline-icon{width:20px;height:20px;vertical-align:-4px;margin-right:7px;object-fit:contain}
.action img{width:18px;height:18px;vertical-align:-4px;margin-right:7px;object-fit:contain}
.tile-label{font-size:13px;font-weight:700;margin:0;min-width:0}
.tile-value{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.resource-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.resource{border:1px solid var(--border);border-radius:11px;padding:15px;min-width:0}
.resource strong{font-size:13px}.resource .value{font-size:17px;font-weight:750;margin:9px 0;color:var(--navy)}
.resource-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.resource-head small{margin:0!important;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72%;font-size:11px!important}
.progress{width:100%;height:9px;background:#edf2f7;border-radius:20px;overflow:hidden}
.progress>span{display:block;height:100%;width:0;background:var(--green);border-radius:20px;transition:width .35s}
.resource small{display:block;color:var(--muted);margin-top:10px;font-size:12px}
.row{display:flex;align-items:center;gap:12px;border-bottom:1px solid #eef1f5;padding:12px 4px}
.row:last-child{border-bottom:0}
.row-icon{width:33px;height:33px;border-radius:9px;background:#e7f7ec;color:#159447;
font-size:17px;display:grid;place-items:center;flex-shrink:0}
.row-icon img{width:23px;height:23px;object-fit:contain}
.row-icon.tone-warn{background:#fff4d6}.row-icon.tone-bad{background:#ffe5e6}
.row-content{flex:1;min-width:0}.row-content strong{font-size:13px;display:block;overflow-wrap:anywhere}
.row-content small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
.row-status{font-size:12px;font-weight:700;border-radius:999px;padding:7px 10px;background:#edf2f7;color:#344054;white-space:nowrap}
.row-status.good{background:#dcfce8;color:#13783a}.row-status.warn{background:#fff2d0;color:#926400}
.row-status.bad{background:#ffe3e4;color:#b4232a}
.detail-button{border:1px solid var(--border);background:#fff;border-radius:9px;padding:8px 11px;color:#344054}
.detail-button:hover{background:#f6f9fe}
.task-title{padding:0;text-align:left;border:0;background:none;color:var(--navy);font-size:14px;
font-weight:700;line-height:1.45;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.task-title:hover{color:var(--blue);text-decoration:underline}
.task-detail{margin-top:20px;padding:22px;border:1px solid #c9dcf6;border-radius:13px;background:#fbfdff;scroll-margin-top:16px}
.task-detail h3{font-size:15px;color:var(--navy);margin:0 0 12px}
.task-detail h2{font-size:18px}
.task-detail .section-title{margin-bottom:18px}
.task-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.task-detail-card{min-width:0;background:white;border:1px solid var(--border);border-radius:11px;padding:18px;margin-bottom:14px}
.task-detail-grid .task-detail-card{margin-bottom:0}
.task-prose{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:14px;margin:0;color:#273447}
.task-prose.long{max-height:410px;overflow:auto}
.task-criteria{margin:0;padding-left:24px;line-height:1.65;font-size:14px;overflow-wrap:anywhere}
.task-criteria li{padding:3px 0}
.task-facts{display:flex;gap:9px 22px;flex-wrap:wrap;margin-bottom:16px}
.task-fact{font-size:13px;color:#475467;line-height:1.6}
.task-fact strong{color:var(--navy)}
.task-entry{border-top:1px solid #e9edf4;padding:12px 0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.task-entry:first-of-type{border-top:0;padding-top:0}
.task-entry strong{display:block;color:var(--navy);font-size:13px}
.task-entry small{color:var(--muted);display:block;font-size:12px;margin:3px 0}
.task-technical{border-top:1px solid #dce5f1;padding-top:14px;margin-top:12px}
.task-technical summary{color:var(--blue);font-weight:650;font-size:13px;cursor:pointer}
.task-technical p{overflow-wrap:anywhere;font-size:12px;line-height:1.6;color:var(--muted)}
.handoff-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 0}
.handoff-bar label{font-size:13px;font-weight:650;color:var(--navy)}
.handoff-bar select{max-width:190px;border:1px solid var(--border);padding:8px;border-radius:8px;background:#fff}
.handoff-explainer{font-size:12px;line-height:1.5;color:var(--muted);margin:2px 0 10px}
.handoff-feedback{font-size:13px;color:var(--navy);font-weight:600;line-height:1.5;min-width:0}
.handoff-manual{display:block;width:100%;min-height:95px;font:12px monospace;padding:10px;margin-top:8px;resize:vertical}
.task-note{background:#fff8df;border-radius:8px;padding:12px;color:#825900;font-size:13px;line-height:1.5}
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
.status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.task-detail-grid{grid-template-columns:1fr}.header h1{font-size:24px}}
@media(max-width:420px){.status-grid,.resource-grid{grid-template-columns:1fr}
.row{flex-wrap:wrap}.row-status{margin-left:45px}.header{margin-bottom:15px}}
</style></head><body>
<section id="login" class="login-shell">
 <div class="panel">
  <div class="brand-row"><img src="/dashboard/assets/logo.png" alt="${t.brandAlt}" width="54" height="54">
  <div><h1>LAO DevSpace</h1><span class="muted">${t.statusPanel} · ${t.restricted.toLowerCase()}</span></div></div>
  <h2>${t.auth}</h2>
  <p class="muted">${t.authInfo}</p>
  <form id="form"><input id="token" aria-label="${t.localToken}" type="password" autocomplete="off" required placeholder="${t.localToken}"><button type="submit">${t.enter}</button></form>
  <p id="message" class="error" role="alert"></p>
 </div>
</section>
<div id="content" class="shell hidden">
 <aside class="sidebar" aria-label="${t.mainMenu}">
  <div class="brand"><img src="/dashboard/assets/logo.png" alt="" width="54" height="54"><div><strong>LAO DevSpace</strong><small>${t.localMonitor}</small></div></div>
  <nav class="nav" aria-label="${t.panelSections}">
   <button type="button" data-section="status" aria-current="page"><img src="/dashboard/assets/icons/status.png" alt="" aria-hidden="true"> ${t.status}</button>
   <button type="button" data-section="tarefas"><img src="/dashboard/assets/icons/logs.png" alt="" aria-hidden="true"> ${t.tasks}</button>
   <button type="button" data-section="modelos"><img src="/dashboard/assets/icons/modelos.png" alt="" aria-hidden="true"> ${t.models}</button>
   <button type="button" data-section="logs"><img src="/dashboard/assets/icons/revisao.png" alt="" aria-hidden="true"> Logs</button>
   <button type="button" data-section="configuracoes"><img src="/dashboard/assets/icons/configuracoes.png" alt="" aria-hidden="true"> ${t.settings}</button>
  </nav>
  <div class="sidebar-note">${t.restricted}<br>${t.readAuth}<br>${t.noAuto}</div>
 </aside>
 <main class="main">
  <header class="header"><div><h1>LAO DevSpace</h1><p id="section-description">${t.statusPanel}</p></div>
   <div id="connection" class="pill neutral" role="status"><span class="dot"></span><span id="connection-text">${t.checking}</span></div>
  </header>
  <div id="section-status">
   <section class="section"><div class="status-grid">
    <div class="panel"><div class="status-head"><div class="tile-icon"><img src="/dashboard/assets/icons/status.png" alt="" aria-hidden="true"></div><div class="tile-label">LAO Service</div></div><div class="tile-value"><span id="lao-dot" class="dot"></span><span id="lao-service">${t.checking}</span></div></div>
    <div class="panel"><div class="status-head"><div class="tile-icon"><img src="/dashboard/assets/icons/abrir-painel.png" alt="" aria-hidden="true"></div><div class="tile-label">DevSpace MCP</div></div><div class="tile-value"><span id="mcp-dot" class="dot"></span><span id="devspace-mcp">${t.notVerified}</span></div></div>
    <div class="panel"><div class="status-head"><div class="tile-icon"><img src="/dashboard/assets/icons/ollama.png" alt="" aria-hidden="true"></div><div class="tile-label">Ollama</div></div><div class="tile-value"><span id="ollama-dot" class="dot"></span><span id="ollama-state">${t.notVerified}</span></div></div>
    <div class="panel"><div class="status-head"><div class="tile-icon"><img src="/dashboard/assets/icons/modelos.png" alt="" aria-hidden="true"></div><div class="tile-label">${t.defaultModel}</div></div><div id="model-name" class="tile-value model-choice" role="button" tabindex="0" title="${t.chooseModel}" aria-label="${t.chooseModel}">—</div><select id="model-select" class="model-select hidden" aria-label="${t.installedModels}"></select></div>
   </div></section>
   <section class="section panel">
    <div class="section-title"><h2><img class="inline-icon" src="/dashboard/assets/icons/recursos.png" alt="" aria-hidden="true"> ${t.resources}</h2><button data-section="configuracoes" class="link" type="button">${t.details}</button></div>
    <div class="resource-grid">
     <div class="resource"><div class="resource-head"><strong>GPU</strong><small id="gpu-name">${t.waitingSample}</small></div><div class="value" id="gpu">—</div><div class="progress"><span id="gpu-bar"></span></div></div>
     <div class="resource"><div class="resource-head"><strong>VRAM</strong><small id="vram-percent">—</small></div><div class="value" id="vram">—</div><div class="progress"><span id="vram-bar"></span></div></div>
     <div class="resource"><div class="resource-head"><strong>CPU</strong><small id="cores">${t.waitingSample}</small></div><div class="value" id="cpu">—</div><div class="progress"><span id="cpu-bar"></span></div></div>
     <div class="resource"><div class="resource-head"><strong>RAM</strong><small id="ram-percent">—</small></div><div class="value" id="ram">—</div><div class="progress"><span id="ram-bar"></span></div></div>
    </div>
    <p id="resource-alerts" class="fineprint" aria-live="polite">${t.waitingMetrics}</p>
    <div class="fineprint">${t.realSamples}</div>
   </section>
   <section class="section panel">
    <div class="section-title"><h2><img class="inline-icon" src="/dashboard/assets/icons/logs.png" alt="" aria-hidden="true"> ${t.tasks}</h2><button class="link" type="button" data-section="tarefas">${t.viewAll}</button></div>
    <div id="task-summary"></div><div id="summary-empty" class="empty">${t.noTasks}</div>
   </section>
   <div class="two-columns section">
    <section class="panel models"><div class="section-title"><h2><img class="inline-icon" src="/dashboard/assets/icons/modelos.png" alt="" aria-hidden="true"> ${t.localModels}</h2><button class="link" type="button" data-section="modelos">${t.viewModels}</button></div><div id="model-summary" class="empty">${t.waitingModel}</div></section>
    <section class="panel events"><div class="section-title"><h2><img class="inline-icon" src="/dashboard/assets/icons/revisao.png" alt="" aria-hidden="true"> ${t.recentEvents}</h2><button class="link" type="button" data-section="logs">${t.viewAll}</button></div><div id="event-summary" class="empty">${t.noEvents}</div></section>
   </div>
  </div>
  <section id="section-tarefas" class="section panel hidden">
   <div class="section-title"><h2>${t.taskHistory}</h2><span class="subtitle" id="total">—</span></div>
   <div class="toolbar"><label for="filter">${t.state}:</label><select id="filter">
     <option value="all">${t.all}</option><option value="awaiting_review">${t.awaitingReview}</option>
     <option value="running">${t.running}</option><option value="approved">${t.approved}</option>
     <option value="rejected">${t.rejected}</option><option value="failed">${t.failed}</option>
   </select></div><div id="tasks"></div><div id="empty" class="empty">${t.noFilterTasks}</div>
   <section id="detail-panel" class="task-detail hidden" aria-label="${t.taskDetails}">
    <div class="section-title"><h2>${t.taskDetails}</h2><button type="button" id="close-detail" class="link">${t.close}</button></div>
    <p class="fineprint">${t.evidence}</p><div id="detail" aria-live="polite"></div>
   </section>
  </section>
  <section id="section-modelos" class="section panel hidden">
   <h2>${t.localModels}</h2><p class="muted">${t.modelInfo}</p>
   <div class="row"><div class="row-icon"><img src="/dashboard/assets/icons/modelos.png" alt="" aria-hidden="true"></div><div class="row-content"><strong id="model-detail">—</strong><small>${t.modelSelected}</small></div><span id="model-capability" class="row-status">${t.notVerified}</span></div>
   <p class="fineprint">${t.modelApiNote}</p>
  </section>
  <section id="section-logs" class="section panel hidden"><h2>${t.recentEvents}</h2><p class="muted">${t.eventInfo}</p><div id="events"></div></section>
  <section id="section-configuracoes" class="section panel hidden"><h2>${t.settingsDiag}</h2>
   <p class="muted">${t.settingsInfo}</p>
   <div class="row"><div class="row-content"><strong>${t.operationState}</strong><small id="dependencies">—</small></div></div>
   <div class="row"><div class="row-content"><strong>${t.processUsage}</strong><small id="node-memory">—</small></div></div>
   <div class="row"><div class="row-content"><strong>${t.latestCheck}</strong><small id="checked">—</small></div></div>
   <div class="row"><div class="row-content"><strong>${t.autostart}</strong><small>${t.notConfiguredHere}</small></div></div>
  </section>
  <div class="actions">
    <button type="button" class="action primary" disabled>${t.newTask}</button>
    <button type="button" class="action" data-section="logs"><img src="/dashboard/assets/icons/revisao.png" alt="" aria-hidden="true"> ${t.viewEvents}</button>
    <button type="button" id="restart-lao" class="action" disabled><img src="/dashboard/assets/icons/reiniciar.png" alt="" aria-hidden="true"> ${t.restartLao}</button>
    <button type="button" class="action" data-section="configuracoes"><img src="/dashboard/assets/icons/configuracoes.png" alt="" aria-hidden="true"> ${t.settings}</button>
  </div>
  <div class="footer"><span>${t.footer}</span><button id="logout" class="link" type="button">${t.logout}</button></div>
 </main>
</div>
<script nonce="__NONCE__">
(() => {
"use strict";
const UI=${JSON.stringify(t)};
const uiLanguage=${JSON.stringify(language)};
const $=id=>document.getElementById(id);
let token="",timer=null,loadedTasks=[],loadedResourceEvents=[],activeSection="status";
const sessionKey="lao-dashboard-session-v1";
function storeSession(ticket){
 try{sessionStorage.setItem(sessionKey,JSON.stringify(ticket));}catch{}
}
function clearSession(){
 try{sessionStorage.removeItem(sessionKey);}catch{}
}
function loginScreen(message=""){
 clearInterval(timer);timer=null;token="";loadedTasks=[];loadedResourceEvents=[];
 clearSession();
 $("detail").textContent="";
 $("detail-panel").classList.add("hidden");
 $("login").classList.remove("hidden");$("content").classList.add("hidden");
 $("connection-text").textContent=UI.restrictedAccess;$("message").textContent=message;
}
function acceptSession(session){
 if(!session || !/^[A-Za-z0-9_-]{43}$/.test(session.sessionToken) ||
    Date.parse(session.expiresAt) <= Date.now())return false;
 token=session.sessionToken;
 storeSession({sessionToken:token,expiresAt:session.expiresAt});
 return true;
}
const sections=["status","tarefas","modelos","logs","configuracoes"];
const names={status:UI.statusPanel,tarefas:UI.tasks,modelos:UI.localModels,logs:UI.recentEvents,configuracoes:UI.settings};
const warningLabels=uiLanguage==="en-US"?{cpu_pressure:"CPU above 95%",ram_pressure:"RAM above 90%",vram_pressure:"VRAM above 90%"}:{cpu_pressure:"CPU acima de 95%",ram_pressure:"RAM acima de 90%",vram_pressure:"VRAM acima de 90%"};
const date=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?"—":d.toLocaleString(uiLanguage);};
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const taskIcon=t=>{
 const box=node("div","row-icon");
 const name=["failed","rejected"].includes(t.status)?"documento-vermelho":
  t.status==="awaiting_review"?"documento-amarelo":"documento-verde";
 if(name==="documento-vermelho")box.classList.add("tone-bad");
 if(name==="documento-amarelo")box.classList.add("tone-warn");
 const img=node("img");img.src="/dashboard/assets/icons/"+name+".png";
 img.alt="";img.setAttribute("aria-hidden","true");box.appendChild(img);return box;
};
const percent=(value)=>Number.isFinite(value)?Math.min(100,Math.max(0,value)):null;
const pctbar=(id,value)=>{$(id).style.width=value===null?"0%":String(value)+"%";};
async function openModelCombo(){
 const selector=$("model-select");
 if(!token)return;
 selector.classList.remove("hidden");
 selector.disabled=true;
 selector.replaceChildren(node("option","",UI.queryingOllama));
 try{
  const response=await get("/dashboard/api/models");
  const names=Array.isArray(response.models)?response.models:[];
  if(!names.length)throw Error(UI.noLocalModels);
  selector.replaceChildren();
  for(const name of names){
   const option=node("option","",name);option.value=name;
   selector.appendChild(option);
  }
  selector.value=response.selected;
  selector.disabled=false;
  selector.focus();
 }catch(err){
  selector.classList.add("hidden");
  $("connection-text").textContent=UI.modelPrefix+": "+err.message;
 }
}
$("model-name").addEventListener("click",openModelCombo);
$("model-name").addEventListener("keydown",event=>{
 if(event.key==="Enter"||event.key===" "){event.preventDefault();void openModelCombo();}
});
$("model-select").addEventListener("change",async event=>{
 const model=event.target.value;
 if(!model)return;
 event.target.disabled=true;
 try{
  const response=await fetch("/dashboard/api/models/select",{
   method:"POST",credentials:"omit",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({model}),
  });
  if(!response.ok){
   const error=(await response.json()).error;
   throw Error(error==="active_tasks"?UI.activeTasks:UI.modelUnavailable);
  }
  $("model-name").textContent=model;
  $("model-detail").textContent=model;
  event.target.classList.add("hidden");
  await refresh();
 }catch(err){$("connection-text").textContent=err.message;}
 finally{event.target.disabled=false;}
});
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
 const m={awaiting_review:[UI.awaitingReview,"warn"],approved:[UI.taskApproved,"good"],
 completed:[UI.taskCompleted,"good"],failed:[UI.taskFailed,"bad"],rejected:[UI.taskRejected,"bad"],
 created:[UI.taskCreated,""],queued:[UI.taskQueued,""],preparing:[UI.taskPreparing,""],
 running:[UI.running,""],validating:[UI.taskValidating,""],cancelled:[UI.taskCancelled,""],
 needs_revision:[UI.taskRevision,"warn"],interrupted:[UI.taskInterrupted,"bad"]};
 return m[t.status]||[String(t.status||UI.unknown),""];
}
// The adapter list is loaded from a local, authenticated API, not compiled
// into the dashboard HTML or persisted into provider-neutral task records.
const handoffApps=Object.create(null);
async function loadHandoffApps(){
 try{
  const data=await get("/dashboard/api/handoff-providers");
  for(const app of data.providers||[]){
   if(app&&typeof app.id==="string"&&/^[a-z][a-z0-9_-]{0,39}$/.test(app.id)&&
      typeof app.name==="string"&&app.name.length<60&&
      typeof app.url==="string"&&app.url.startsWith("https:"+"//")){
    handoffApps[app.id]={name:app.name,url:app.url};
   }
  }
 }catch{ /* Offline provider registry means clipboard-only handoff. */ }
}
function needsAttention(task){
 return ["awaiting_review","needs_revision","interrupted"].includes(task.status);
}
function handoffInstruction(task){
 // The task ID is an opaque identifier, not a credential or source prompt.
 // The selected assistant must have its own authorized DevSpace MCP connection.
 return "Continue/revise a tarefa LAO "+task.id+
  ". Use o conector DevSpace MCP e chame lao_resume com task_id="+task.id+
  ". Leia o pedido, os resultados, testes e alterações antes de tomar decisões. "+
  "Não aprove nem aplique alterações automaticamente. Se a ferramenta não estiver disponível, "+
  "informe que o conector DevSpace precisa ser conectado.";
}
function handoffAction(task,provider,feedback,manual){
 const message=handoffInstruction(task);
 const target=Object.hasOwn(handoffApps,provider)?handoffApps[provider]:null;
 // Must open during the user gesture; otherwise browsers may block the tab.
 if(target)window.open(target.url,"_blank","noopener,noreferrer");
 const fallback=()=>{
  feedback.textContent=UI.handoffManual;
  manual.value=message;manual.classList.remove("hidden");manual.focus();manual.select();
 };
 if(!navigator.clipboard||!navigator.clipboard.writeText){fallback();return;}
 void navigator.clipboard.writeText(message).then(()=>{
  feedback.textContent=UI.handoffCopied;
  manual.classList.add("hidden");
 }).catch(fallback);
}
function renderTasks(){
 const val=$("filter").value;
 const items=loadedTasks.filter(t=>val==="all"||t.status===val);
 const root=$("tasks");root.replaceChildren();
 for(const t of items){
  const row=node("div","row");row.appendChild(taskIcon(t));
  const info=node("div","row-content");
  const heading=node("button","task-title",t.goalPreview||UI.task+" "+t.id.slice(0,8));
  heading.type="button";heading.addEventListener("click",()=>showDetails(t.id));
  info.appendChild(heading);
  info.appendChild(node("small","",String(t.model||UI.modelNotProvided)+" · "+date(t.updatedAt)+
    " · "+UI.requestedBy+": "+(t.requestedBy||UI.unknown)+
    " · "+(t.writeMode==="isolated_worktree"?UI.isolatedWrite:UI.readOnlyTask)+
    " · #"+t.id.slice(0,8)));
  row.appendChild(info);
  const [label,cls]=rowStatus(t);row.appendChild(node("span","row-status "+cls,label));
  const button=node("button","detail-button",UI.view);
  button.type="button";button.setAttribute("aria-label",UI.taskDetails+" "+t.id);
  button.addEventListener("click",()=>showDetails(t.id));
  row.appendChild(button);
  root.appendChild(row);
 }
 $("empty").classList.toggle("hidden",items.length>0);
 const summary=$("task-summary");summary.replaceChildren();
 for(const t of loadedTasks.slice(0,3)){
  const row=node("div","row");row.appendChild(taskIcon(t));
  const info=node("div","row-content");
  const heading=node("button","task-title",t.goalPreview||UI.task+" "+t.id.slice(0,8));
  heading.type="button";heading.addEventListener("click",()=>showDetails(t.id));
  info.appendChild(heading);
  info.appendChild(node("small","",String(t.model||UI.modelUnknown)+" · "+UI.requestedBy+
    ": "+(t.requestedBy||UI.unknown)+" · "+date(t.updatedAt)));
  row.appendChild(info);const [label,cls]=rowStatus(t);
  row.appendChild(node("span","row-status "+cls,label));summary.appendChild(row);
 }
 $("summary-empty").classList.toggle("hidden",loadedTasks.length>0);
 $("total").textContent=loadedTasks.length+" "+UI.last200;
}
function renderEvents(){
 const root=$("events"),summary=$("event-summary");
 root.replaceChildren();summary.replaceChildren();
 const taskItems=loadedTasks.slice(0,30).map(t=>({kind:"task",at:t.updatedAt,value:t}));
 const resourceItems=loadedResourceEvents.slice(-20).map(e=>({kind:"resource",at:e.at,value:e}));
 const items=[...taskItems,...resourceItems].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,30);
 for(const [index,item] of items.entries()){
  const line=node("div","row"),info=node("div","row-content");
  if(item.kind==="task"){
   const t=item.value;
   line.appendChild(node("span","dot "+(t.status==="failed"?"bad":t.status==="awaiting_review"?"warn":"good")));
   const [label]=rowStatus(t);
   info.appendChild(node("strong","",label+" · "+(t.goalPreview||UI.task+" "+t.id.slice(0,8))));
  }else{
   const warnings=Array.isArray(item.value.warnings)?item.value.warnings.filter(k=>Object.hasOwn(warningLabels,k)):[];
   line.appendChild(node("span","dot "+(warnings.length?"warn":"good")));
   info.appendChild(node("strong","",warnings.length?(UI.resources+" · "+warnings.map(k=>warningLabels[k]).join(" · ")):UI.resourcesNormalized));
  }
  info.appendChild(node("small","",date(item.at)));line.appendChild(info);
  root.appendChild(line);
  if(index<3)summary.appendChild(line.cloneNode(true));
 }
 if(!items.length){root.appendChild(node("p","empty",UI.noRecordedEvents));summary.appendChild(node("p","empty",UI.noRecordedEvents));}
}
async function get(path){
 const r=await fetch(path,{cache:"no-store",credentials:"omit",headers:{Authorization:"Bearer "+token}});
 if(!r.ok)throw Error(r.status===401?UI.sessionExpired:UI.queryUnavailable);
 return r.json();
}
function taskCard(parent,title){
 const card=node("section","task-detail-card");
 card.appendChild(node("h3","",title));parent.appendChild(card);return card;
}
function taskLine(parent,label,value){
 const line=node("div","task-fact");line.appendChild(node("strong","",label+": "));
 line.appendChild(node("span","",String(value??"—")));parent.appendChild(line);return line;
}
function taskParagraph(parent,value,cls=""){
 parent.appendChild(node("p","task-prose "+cls,value));return parent;
}
function taskDuration(run){
 const start=Date.parse(run.startedAt),end=Date.parse(run.finishedAt);
 return Number.isFinite(start)&&Number.isFinite(end)&&end>=start
   ?((end-start)/1000).toLocaleString(uiLanguage,{maximumFractionDigits:1})+" "+UI.seconds:"—";
}
function renderTaskDetail(data){
 const root=$("detail");root.replaceChildren();
 const task=data.task||{},runs=Array.isArray(data.runs)?data.runs:[],
  tests=Array.isArray(data.tests)?data.tests:[],
  changes=Array.isArray(data.changes)?data.changes:[],
  events=Array.isArray(data.events)?data.events:[];
 const facts=node("div","task-facts");
 const [status]=rowStatus(task);
 taskLine(facts,UI.state,status);
 taskLine(facts,UI.modelUsed,task.model||UI.notProvided);
 taskLine(facts,UI.taskStarted,date(task.createdAt));
 taskLine(facts,UI.lastUpdated,date(task.updatedAt));
 taskLine(facts,UI.taskScope,task.writeMode==="isolated_worktree"?UI.isolatedWrite:UI.readOnlyTask);
 taskLine(facts,UI.requestedBy,task.requestedBy||UI.unknown);
 root.appendChild(facts);
 if(needsAttention(task)){
  const bar=node("div","handoff-bar");
  const label=node("label","",UI.targetAgent);
  const choice=node("select","");
  const onlyCopy=node("option","",UI.otherAgent);onlyCopy.value="copy";
  choice.appendChild(onlyCopy);
  for(const [key,value] of Object.entries(handoffApps)){
   const option=node("option","",value.name);option.value=key;choice.appendChild(option);
  }
  choice.value=Object.hasOwn(handoffApps,task.requestedBy)?task.requestedBy:"copy";
  label.appendChild(choice);bar.appendChild(label);
  const handoff=node("button","detail-button",UI.resumeWork);handoff.type="button";
  bar.appendChild(handoff);root.appendChild(bar);
  root.appendChild(node("p","handoff-explainer",UI.handoffNote));
  const feedback=node("p","handoff-feedback");feedback.setAttribute("role","status");
  root.appendChild(feedback);
  const manual=node("textarea","handoff-manual hidden");manual.readOnly=true;
  manual.setAttribute("aria-label",UI.copyHandoff);root.appendChild(manual);
  handoff.addEventListener("click",()=>handoffAction(task,choice.value,feedback,manual));
 }
 const requested=taskCard(root,UI.originalRequest);
 taskParagraph(requested,task.goal||UI.notProvided);
 const criteria=taskCard(root,UI.expectedResults);
 if(Array.isArray(task.acceptanceCriteria)&&task.acceptanceCriteria.length){
  const list=node("ol","task-criteria");
  for(const item of task.acceptanceCriteria)list.appendChild(node("li","",String(item)));
  criteria.appendChild(list);
 }else taskParagraph(criteria,UI.noCriteria);
 const statusNote=task.status==="awaiting_review"||task.status==="needs_revision"
  ?node("p","task-note",UI.reviewPending):null;
 if(statusNote)root.appendChild(statusNote);
 const output=taskCard(root,UI.modelResponse);
 if(!runs.length)taskParagraph(output,UI.noExecution);
 else{
  const latest=runs.at(-1);
  const [runState]=rowStatus(latest);
  const facts=node("div","task-facts");
  taskLine(facts,UI.lastExecution,runState);
  taskLine(facts,UI.modelUsed,latest.model||UI.notProvided);
  taskLine(facts,UI.executionTime,taskDuration(latest));
  output.appendChild(facts);
  if(latest.summary)taskParagraph(output,latest.summary,"long");
  else taskParagraph(output,UI.noModelResponse);
  if(latest.errorCode)taskLine(output,UI.runFailed,latest.errorCode);
  if(Array.isArray(latest.sourceFiles)&&latest.sourceFiles.length)
   taskLine(output,UI.sourceFiles,latest.sourceFiles.join(" · "));
 }
 if(runs.length>1){
  const previous=taskCard(root,UI.previousRuns);
  for(const run of runs.slice(0,-1).reverse()){
   const [label]=rowStatus(run);
   const attempt=node("details","task-entry");
   attempt.appendChild(node("summary","",label+" · "+UI.modelUsed+": "+run.model+
     " · "+UI.executionTime+": "+taskDuration(run)));
   if(run.summary)taskParagraph(attempt,run.summary,"long");
   else taskParagraph(attempt,UI.noModelResponse);
   if(run.errorCode)taskLine(attempt,UI.runFailed,run.errorCode);
   previous.appendChild(attempt);
  }
 }
 const grid=node("div","task-detail-grid");root.appendChild(grid);
 const testCard=taskCard(grid,UI.testResults);
 if(!tests.length)taskParagraph(testCard,UI.noTests);
 for(const t of tests){
  const entry=node("div","task-entry");
  const state=t.executed?(t.passed?UI.taskApproved:UI.taskFailed):UI.notVerified;
  entry.appendChild(node("strong","",state));
  if(Array.isArray(t.testFiles))entry.appendChild(node("small","",t.testFiles.join(" · ")));
  if(t.failureCode)entry.appendChild(node("span","",UI.runFailed+": "+t.failureCode));
  testCard.appendChild(entry);
 }
 const files=taskCard(grid,UI.changedFiles);
 if(!changes.length)taskParagraph(files,UI.noChanges);
 else taskParagraph(files,data.promotion?.state==="applied"?UI.changePublished:
   data.promotion?.state==="needs_recovery"?UI.changeRecovery:UI.changeNotPublished);
 for(const change of changes){
  const entry=node("div","task-entry");
  const fileList=Array.isArray(change.files)?change.files:[];
  const operations={add:UI.fileAdded,update:UI.fileUpdated,
    delete:UI.fileDeleted,move:UI.fileMoved};
  for(const file of fileList){
   // AppliedPatchFile is {path,operation,previousPath?}, not a string.
   // Never coerce an entire object into the visible '[object Object]'.
   const path=typeof file==="string"?file:
    file&&typeof file.path==="string"?file.path:"";
   if(!path)continue;
   const operation=file&&typeof file.operation==="string"?
    (operations[file.operation]||UI.fileUnknown):UI.fileUnknown;
   const description=file&&file.operation==="move"&&typeof file.previousPath==="string"
    ?file.previousPath+" → "+path:path;
   const row=node("div","task-entry");
   row.appendChild(node("strong","",operation+" · "+description));
   entry.appendChild(row);
  }
  if(Number.isSafeInteger(change.additions)&&Number.isSafeInteger(change.removals)){
   entry.appendChild(node("small","",change.additions+" "+UI.addedLines+
    " · "+change.removals+" "+UI.removedLines));
  }
  if(typeof change.diffSummary==="string"&&change.diffSummary.trim())
   entry.appendChild(node("p","task-prose",change.diffSummary));
  else if(!fileList.length)entry.appendChild(node("small","",UI.noDiffSummary));
  files.appendChild(entry);
 }
 const review=taskCard(root,UI.reviewInfo);
 if(data.review){
  const [decision]=rowStatus({status:data.review.decision});
  taskLine(review,UI.state,decision);
  taskLine(review,UI.reviewedAt,date(data.review.decidedAt));
  taskParagraph(review,data.review.criteriaVerified?UI.reviewVerified:UI.notReviewed);
 }else taskParagraph(review,UI.noReview);
 const technical=node("details","task-technical");
 technical.appendChild(node("summary","",UI.technicalDetails));
 taskLine(technical,UI.taskIdentifier,task.id||"—");
 taskLine(technical,UI.taskWorkspace,task.workspaceId||"—");
 taskLine(technical,UI.executionHistory,String(runs.length));
 const history=taskCard(technical,UI.activityHistory);
 if(!events.length)taskParagraph(history,UI.noRecordedEvents);
 for(const event of events){
  const [label]=rowStatus({status:event.to});
  const entry=node("div","task-entry");
  entry.appendChild(node("strong","",label));
  entry.appendChild(node("small","",date(event.at)));
  history.appendChild(entry);
 }
 root.appendChild(technical);
}
async function showDetails(id){
 section("tarefas");$("detail-panel").classList.remove("hidden");$("detail").textContent=UI.loading;
 $("detail-panel").scrollIntoView({block:"start",behavior:"smooth"});
 try{const data=await get("/dashboard/api/tasks/"+id);renderTaskDetail(data);}
 catch(e){$("detail").textContent=e.message;}
}
async function refresh(){
 try{
  await loadHandoffApps();
  const [status,data,metrics]=await Promise.all([get("/dashboard/api/status"),get("/dashboard/api/tasks"),get("/dashboard/api/metrics")]);
  const reasons=Array.isArray(status.blockingReasons)?status.blockingReasons:[];
  const taskList=Array.isArray(data.tasks)?data.tasks:[];
  const pendingReview=taskList.some(t=>t.status==="awaiting_review");
  const componentsHealthy=status.live===true &&
    !reasons.includes("devspace_unavailable") && !reasons.includes("devspace_unverified") &&
    !reasons.includes("ollama_unavailable");
  $("connection").className="pill "+(componentsHealthy?(pendingReview?"warn":"good"):"warn");
  $("connection-text").textContent=componentsHealthy
    ?(pendingReview?UI.awaitingReview:(status.activeTasks>0?UI.running:UI.activeLabel))
    :UI.attention;
  $("restart-lao").disabled=status.restartAvailable!==true;
  $("restart-lao").title=status.restartAvailable===true
    ?UI.restartAllowedTitle:UI.restartUnavailableTitle;
  $("lao-service").textContent=status.live===true?UI.responding:UI.noResponse;
  dot("lao-dot",status.live===true?"good":"bad");
  const mcpOffline=reasons.includes("devspace_unavailable");
  const mcp=!mcpOffline&&!reasons.includes("devspace_unverified");
  $("devspace-mcp").textContent=mcp?UI.connected:mcpOffline?UI.offline:UI.notVerified;
  dot("mcp-dot",mcp?"good":mcpOffline?"bad":"neutral");
  const offline=reasons.includes("ollama_unavailable");
  $("ollama-state").textContent=offline?UI.unavailable:reasons.includes("lao_disabled")?UI.notVerified:UI.responding;
  dot("ollama-dot",offline?"bad":reasons.includes("lao_disabled")?"neutral":"good");
  const model=status.modelConfigured||UI.notProvided;
  $("model-name").textContent=model;$("model-detail").textContent=model;
  const modelOk=!reasons.some(x=>["model_missing","model_tools_unsupported","ollama_unavailable"].includes(x));
  $("model-capability").textContent=offline?"Ollama offline":modelOk?UI.availabilityVerified:UI.unavailable;
  $("model-capability").className="row-status "+(offline||!modelOk?"warn":"good");
  $("model-summary").replaceChildren();
  const modelRow=node("div","row");
  modelRow.appendChild(node("span","dot "+(modelOk?"good":"warn")));
  const modelInfo=node("div","row-content");modelInfo.appendChild(node("strong","",model));
  modelInfo.appendChild(node("small","",UI.configuredNotLoaded));
  modelRow.appendChild(modelInfo);$("model-summary").appendChild(modelRow);
  const cpu=percent(metrics.cpu.utilizationPercent),gpu=metrics.gpu?percent(metrics.gpu.utilizationPercent):null;
  const ram=percent(metrics.ram.utilizationPercent);
  const vram=metrics.gpu?percent(100*metrics.gpu.vramUsedMiB/metrics.gpu.vramTotalMiB):null;
  $("gpu-name").textContent=metrics.gpu?.name?.replace(/^NVIDIA\s+(?:GeForce\s+)?/i,"")||UI.gpuUnavailable;
  $("cpu").textContent=cpu===null?UI.waitingSample:cpu+"%";pctbar("cpu-bar",cpu);
  $("gpu").textContent=gpu===null?"—":gpu+"%";pctbar("gpu-bar",gpu);
  $("ram").textContent=Math.round(metrics.ram.usedBytes/1048576)+" / "+Math.round(metrics.ram.totalBytes/1048576)+" MiB";
  $("ram-percent").textContent=ram===null?"—":ram+"% "+UI.inUse;
  pctbar("ram-bar",ram);
  $("vram").textContent=metrics.gpu?metrics.gpu.vramUsedMiB+" / "+metrics.gpu.vramTotalMiB+" MiB":"—";
  $("vram-percent").textContent=vram===null?"—":Math.round(vram*10)/10+"% "+UI.inUse;
  pctbar("vram-bar",vram);
  $("cores").textContent=metrics.cpu.logicalCores+" "+UI.logicalCores;
  $("node-memory").textContent=Math.round(metrics.process.rssBytes/1048576)+" MiB RSS";
  const warnings=metrics.alerts?.advisoryOnly===true&&Array.isArray(metrics.alerts.warnings)
    ?metrics.alerts.warnings.filter(k=>Object.hasOwn(warningLabels,k)).map(k=>warningLabels[k]):null;
  $("resource-alerts").textContent=warnings===null?UI.alertsUnavailable:warnings.length?UI.attentionPrefix+": "+warnings.join(" · "):UI.noResourceAlerts;
  $("resource-alerts").className="fineprint "+(warnings?.length?"warn-text":"");
  $("dependencies").textContent=reasons.length?reasons.join(" · "):UI.noReadinessBlocks;
  $("checked").textContent=date(status.checkedAt);
  loadedTasks=taskList;
  loadedResourceEvents=Array.isArray(metrics.alerts?.recentTransitions)
    ?metrics.alerts.recentTransitions.filter(e=>e&&typeof e.at==="string"&&Array.isArray(e.warnings)):[];
  renderTasks();renderEvents();
  $("content").classList.remove("hidden");$("login").classList.add("hidden");$("message").textContent="";
  if(sections.includes(location.hash.slice(1)) && location.hash.slice(1)!==activeSection){
   section(location.hash.slice(1));
  }
 }catch(err){
  $("restart-lao").disabled=true;
  if(err.message===UI.sessionExpired){
   loginScreen(UI.sessionExpiredAgain);return;
  }
  $("connection").className="pill bad";$("connection-text").textContent=UI.connectionUnavailable;
  if(!$("login").classList.contains("hidden"))$("message").textContent=err.message;
  else{
   $("dependencies").textContent=UI.collectionUnavailable+": "+err.message;
   for(const [label,indicator] of [["lao-service","lao-dot"],["devspace-mcp","mcp-dot"],["ollama-state","ollama-dot"]]){
    $(label).textContent=UI.notVerified;dot(indicator,"neutral");
   }
   for(const id of ["gpu","vram","cpu","ram","node-memory","vram-percent","ram-percent"]){$(id).textContent="—";}
   for(const id of ["gpu-bar","vram-bar","cpu-bar","ram-bar"]){pctbar(id,null);}
   $("cores").textContent=UI.collectionUnavailable;
   $("gpu-name").textContent=UI.gpuUnavailable;
   $("resource-alerts").textContent=UI.measurementsUnavailable;
   $("checked").textContent="—";
   $("model-capability").textContent=UI.notVerified;
   $("model-capability").className="row-status";
   const modelIndicator=document.querySelector("#model-summary .dot");
   if(modelIndicator)modelIndicator.className="dot neutral";
  }
 }
}
$("form").addEventListener("submit",async e=>{
 e.preventDefault();
 const operatorToken=$("token").value;
 $("token").value="";
 $("message").textContent="";
 try{
  const response=await fetch("/dashboard/api/session",{
   method:"POST",cache:"no-store",credentials:"omit",
   headers:{Authorization:"Bearer "+operatorToken},
  });
  if(!response.ok)throw Error(response.status===403?UI.invalidToken:UI.authUnavailable);
  if(!acceptSession(await response.json()))throw Error(UI.invalidSession);
  await refresh();
  if(!$("content").classList.contains("hidden"))timer=setInterval(refresh,10000);
 }catch(err){$("message").textContent=err.message;}
});
$("filter").addEventListener("change",renderTasks);
window.addEventListener("hashchange",()=>{if(sections.includes(location.hash.slice(1)))section(location.hash.slice(1));});
$("close-detail").addEventListener("click",()=>$("detail-panel").classList.add("hidden"));
$("restart-lao").addEventListener("click",async()=>{
 if($("restart-lao").disabled)return;
 if(!window.confirm(UI.restartOnly))return;
 $("restart-lao").disabled=true;
 try{
  const response=await fetch("/dashboard/api/restart",{
   method:"POST",cache:"no-store",credentials:"omit",
   headers:{Authorization:"Bearer "+token},
  });
  if(response.status!==202){
   const code=(await response.json()).error;
   throw Error(code==="active_tasks"?UI.restartBlocked:UI.restartUnavailable);
  }
  $("connection").className="pill warn";
  $("connection-text").textContent=UI.restarting;
  $("dependencies").textContent=UI.restartRequested;
  // The normal status refresh re-enables the button only when LAO is back.
  setTimeout(refresh,2500);
 }catch(err){
  $("connection").className="pill bad";
  $("connection-text").textContent=err.message;
  setTimeout(refresh,2500);
 }
});
$("logout").addEventListener("click",()=>{
 const oldTicket=token;
 loginScreen();
 if(oldTicket)void fetch("/dashboard/api/session",{
  method:"DELETE",cache:"no-store",credentials:"omit",
  headers:{Authorization:"Bearer "+oldTicket},
 }).catch(()=>{});
});
async function restore(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(sessionKey)||"null");
  if(saved && acceptSession(saved)){
   await refresh();
   // A temporary API outage must not destroy a still-valid browser session.
   // A 401 clears token through loginScreen; other failures retain the ticket.
   if(token){
    timer=setInterval(refresh,10000);
    return;
   }
  }
 }catch{}
 clearSession();
 // A native LAO tray click can approve exactly one short-lived browser launch.
 try{
  const response=await fetch("/dashboard/api/session/claim",{
   method:"POST",cache:"no-store",credentials:"omit",
  });
  if(response.ok && acceptSession(await response.json())){
   await refresh();
   if(!$("content").classList.contains("hidden"))timer=setInterval(refresh,10000);
  }
 }catch{}
}
void restore();
})();
</script></body></html>`.replaceAll("__NONCE__",nonce);
}
