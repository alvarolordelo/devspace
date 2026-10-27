# F5-01 - LAO Windows tray (monitor manual, opt-in)

**Estado:** launcher de monitor na bandeja implementado e validado com
PowerShell parser/STA/icon loading. A execucao GUI interativa continua
pendente de verificacao manual; **nao existe instalacao no SCM/autostart**.

O script \`src/lao/windows/lao-tray.ps1\` utiliza os arquivos ICO aprovados
em \`docs/lao-devspace/assets/icons/ico\`. O script NAO cria servico,
NAO liga/desliga DevSpace/Ollama, NAO modifica registro, inicializacao
automatica, credenciais ou politica de execucao do Windows.

## Conferencia de compatibilidade

Na raiz do worktree LAO:

\`\`\`powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "D:\desenvolvimento\lao-devspace\src\lao\windows\lao-tray.ps1" -CheckOnly
\`\`\`

A flag -ExecutionPolicy Bypass e restrita ao novo processo. Nao grava
politica de execucao persistente; use apenas no script revisado do projeto.

## Abrir manualmente em sessao grafica

\`\`\`powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "D:\desenvolvimento\lao-devspace\src\lao\windows\lao-tray.ps1" -Port 7877
\`\`\`

Requisitos: Windows 10/11 com PowerShell 5.1 e Windows Forms/STA.
Nao e apropriado para sessao nao-interativa de servico.

- A bandeja consulta a cada 15 segundos os endpoints locais
  \`/health/live\` e \`/health/ready\`.
- Icone active quando pronta, idle se a dependencia nao esta pronta,
  offline se o daemon nao responde e review quando ha revisoes
  autenticadas e o daemon esta pronto. Sem falsos positivos de autenticacao.
- Clique esquerdo abre/fecha o popup nativo; menu de clique direito
  ainda oferece "Abrir painel LAO".
- "Copiar diagnostico" copia apenas hora, status e endpoint loopback.
- "Sair do monitor" fecha somente o tray; o daemon nao e afetado.
- Mutex por SID evita segundo monitor da mesma conta Windows.
- Icones/timer/mutex sao liberados ao encerrar.

**Limites:** nao controla o daemon/servico, nao recupera tarefas nem
configura autostart. A sonda ocorre sincronicamente no timer WinForms.
Notificacoes por polling nao garantem observar estados transitórios.
Testes GUI de interacao e responsividade real ainda pendentes.

## F5-06 - Status autenticado e notificacoes opcionais (27/10/2026)

- O monitor continua consultando health/live e health/ready a cada
  15 segundos em loopback, com timeout e sem seguir redirects.
- Quando a variavel LAO_DASHBOARD_TOKEN esta no AMBIENTE DO PROCESSO
  da bandeja e coincide com o daemon, tambem consulta
  /dashboard/api/tasks com Authorization Bearer. Nunca passar o
  segredo via parametro de linha de comando, URL, repositorio ou log.
- O menu indica contagens de tarefas executando/validando e em revisao.
  Se nao estiver autenticado, as contagens sao desconhecidas, nao zero.
- O icone review somente aparece com API autenticada e LAO pronto.
- A flag -EnableNotifications e opt-in e mostra avisos de perda de
  conectividade e aumento do numero de revisoes, SEM detalhes privados.
  A primeira consulta apenas estabelece um baseline, sem alertas.
- A flag -ProbeOnly retorna JSON sanitizado sem abrir GUI, util para
  testar o monitor e o endpoint. Exemplo em PowerShell:

    powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "D:\desenvolvimento\lao-devspace\src\lao\windows\lao-tray.ps1" -ProbeOnly -Port 7877

O tray nao extrai tokens do clipboard nem grava tokens em disco.
O mecanismo de login e fornecimento de token de uma instalacao final
continua pendente. Nao foi instalado um servico, agendador ou autostart.

## F5-07 - Sondagem assincrona sem congelar o menu (27/10/2026)

Na interface WinForms, a sonda agora utiliza tarefas .NET HttpClient,
com respostas processadas exclusivamente no thread STA depois do fim de
cada etapa. O timer de 200 ms mantem a interface responsiva durante
falhas lentas de daemon, Ollama ou API. A janela entre sondagens
completas continua de 15 segundos, com timeout de 3 segundos por
endpoint; consultas concorrentes sao impedidas pela maquina de estados
  `live -> ready -> status -> metrics -> tasks -> done` quando
  autenticada; sem token termina apos ready.

Tokens so sao adicionados ao cliente HTTP privado para
`/dashboard/api/status`, `/dashboard/api/metrics` e
`/dashboard/api/tasks`; o cliente usado pelos dois healthchecks
nao tem token. Os dois clientes proíbem redirecionamento automatico.
No encerramento, requisicoes pendentes sao canceladas e os objetos
HTTP descartados.

A flag de diagnostico `-AsyncProbeOnly` executa uma sondagem com
**message pump WinForms ativo, mas sem mostrar icone**. Retorna o
mesmo JSON sanitizado com `uiHeartbeatTicks`, sem mutex de usuario,
para validacao automatizada. No Windows local, o teste de servidor
que atrasa `/health/live` por 1250 ms confirmou que o timer executa
ao menos seis ticks durante a espera; o teste de redirecionamento
com token confirmou que nenhuma chamada segue para o destino.

Nao confundir a prova headless do timer com validacao visual completa
do icone, do clique duplo e dos avisos na sessao grafica do usuario.
O monitor segue manual, sem servico instalado e sem autostart.


### Evidencia atual

Parser PowerShell passou sem erros; o comando manual \`-CheckOnly\`
carregou WinForms em STA e todos os arquivos ICO aprovados no Windows.
O teste automatizado \`src/lao/windows-tray.test.ts\` tambem passou.
Isto NAO substitui teste de interacao visual em sessao grafica.

## F5-08 - Popup WinForms do design aprovado (27/10/2026)

Popup nativo `src/lao/windows/lao-popup.ps1` com logo original,
fonte Segoe UI, painel branco, 420 DIP ideais, cantos 16 px,
oito linhas de estado, card contextual para andamento/revisao/falha
e quatro acoes. Foi testado na sessao grafica em captura real
temporaria (fora da area de trabalho) e revisado contra os mockups
`tray-active-panel.png`, `tray-offline-panel.png` e
`tray-review-panel.png`. Os estados compartilham estrutura mas
sempre mostram valores atuais, nao os numeros ficticios do mock.

O botao de servico ainda nao pode executar instalacao/reinicio:
e mostrado desabilitado (com texto explicito) ate haver servico
Windows instalado mediante autorizacao. Clique externo e Esc
fecham; clique esquerdo alterna o popup; clicando nas acoes
habilitadas abre a secao do dashboard com hash. O popup usa
a area util do monitor onde esta o cursor, reposiciona-se para
nao sair dos limites e permite rolagem quando a altura disponivel
for pequena. Nenhum item chama DevSpace/Ollama para iniciar.

O modo `-UiCheckOnly` instancia o layout sem exibir janela, verifica
420 DIP, 8 linhas, 4 acoes, teclado e transicoes de cor e revisao
em quatro estados. Os scripts PowerShell usam UTF-8 com BOM para
preservar acentos no Windows PowerShell 5.1.

**Pendente para aceite final:** usuario conferir popup real,
click-away/Esc com o mouse, DPI do Windows 100/125/150%,
multiplos monitores e indicacao de alerta na bandeja.
