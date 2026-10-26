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
  offline se o daemon nao responde. Sem falsos positivos de autenticacao.
- Clique duplo ou menu "Abrir painel LAO" abre o browser local.
- "Copiar diagnostico" copia apenas hora, status e endpoint loopback.
- "Sair do monitor" fecha somente o tray; o daemon nao e afetado.
- Mutex por SID evita segundo monitor da mesma conta Windows.
- Icones/timer/mutex sao liberados ao encerrar.

**Limites:** nao controla o daemon/servico, nao possui notificacoes push,
nao recupera tarefas, nao configura autostart, nao utiliza o icone
"review" sem fonte autenticada dos eventos; usuario ainda precisa
validar a usabilidade do tray e a compatibilidade em sessao grafica.


### Evidencia atual

Parser PowerShell passou sem erros; o comando manual \`-CheckOnly\`
carregou WinForms em STA e todos os arquivos ICO aprovados no Windows.
O teste automatizado \`src/lao/windows-tray.test.ts\` tambem passou.
Isto NAO substitui teste de interacao visual em sessao grafica.
