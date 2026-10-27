# Critérios de aceitação dos assets e do Monitor

## Identidade e referência

- [x] **Usuário aprovou em 27/10/2026 a interface visual do popup em execução no Windows, conforme captura do estado de atenção** (LAO Service respondendo, Ollama respondendo, DevSpace MCP não verificado). Identidade, ícones, espaçamentos, card e ações inferiores aprovados; **congelar o desenho** até pedido de alteração.
- [ ] Ícone de bandeja reconhecível nos tamanhos 16/20/24/32 px, claro e escuro.
- [ ] Verde/vermelho/amarelo/cinza representados em `.svg`, `.png`, `.ico` sem artefatos de antialiasing.
- [ ] Popup ativo: geometria e tipografia ajustadas ao mockup em captura WinForms (27/10); **aceite final do usuário ainda pendente**.
- [ ] Popup parado: estados semânticos presentes; **comparação visual real na bandeja ainda pendente**.
- [ ] Popup aguardando revisão: ação de revisão presente; **comparação visual real na bandeja ainda pendente**.
- [x] Dashboard apresenta quatro cards de resumo, recursos, tarefas, modelos e logs segundo `dashboard-panel.png` (Chrome autenticado 100/125/150%).
- [x] Dashboard: navegação nas cinco seções, botões indisponíveis, ausência de overflow horizontal em 390px, 100/125/150% no Chrome (27/10).
- [x] Nenhuma imagem de Windows/Tailscale é embutida como interface funcional.

## Comportamento

- [ ] Serviço Windows e Tray Monitor separados; iniciar automaticamente nos contextos apropriados.
- [ ] Clique no ícone da bandeja expande/recolhe o menu; click-away/Esc fecham.
- [ ] Verde somente para saúde validada; vermelho em falha real; amarelo para revisão; cinza desconhecido.
- [ ] Offline e reconnect não provocam reinício automático não solicitado de DevSpace ou Ollama.
- [x] Modelo selecionado distinto de modelo efetivamente carregado em VRAM.
- [x] GPU (%) distinguida de porcentagem de camadas do modelo na GPU.
- [ ] Métricas indisponíveis mostram `—` com timestamp e motivo, sem valores inventados.
- [ ] Ações de iniciar/parar/reiniciar possuem confirmação quando pertinente e mostram resultado efetivo.
- [ ] Operações que alteram arquivos são feitas apenas em worktree aprovado e aguardam revisão.

## Compatibilidade, segurança e acessibilidade

- [ ] DevSpace inicia normalmente com LAO desabilitado.
- [ ] Endpoints MCP e configurações existentes permanecem compatíveis.
- [ ] Não publicar serviços locais em 0.0.0.0 sem design e autorização explícitos.
- [ ] Não incluir tokens/senhas nos logs nem notificações.
- [ ] Testes de CI: typecheck, testes existentes e regressão MCP.
- [ ] Verificação real no Windows 11 com 100%, 125% e 150% de escala, além de vários monitores.
- [ ] Acessibilidade: foco, teclado, tooltips e status não dependentes somente da cor (contratos verificados; falta interação real via bandeja).
- [ ] Instalação, rollback e remoção do monitor documentados sem alterar o DevSpace estável.

## Git

- [x] Branch `feature/lao-devspace` criada no fork `alvarolordelo/devspace`.
- [ ] Worktree isolado e checkout estável inalterado.
- [x] Assets adicionados em `docs/lao-devspace` para revisão.
- [x] Commits e push na branch de desenvolvimento autorizados expressamente no prompt de 27/10; sem merge ou instalação automática.

## Evidência da etapa de design — 27/10/2026

- Mockups originais preservados; foram inspecionados os quatro PNGs de painel. **Atenção:** `tray-offline-panel.png` mostra visualmente o estado **revisão**, enquanto `tray-review-panel.png` mostra o estado **parado**. Na implementação, prevalece a semântica visual/conteúdo de cada captura, sem renomear assets oficiais.
- Popup nativo inspecionado por `Form.DrawToBitmap` nos estados ativo, revisão e parado; linhas mais legíveis, ações sem espaços artificiais, bloco contextual arredondado e verificação de largura mínima 340 DIP. São **capturas de controle**, não prova de clique real na bandeja.
- Dashboard autenticado validado em instância experimental **isolada** (`127.0.0.1:7878`), com captura local externa ao Git em escalas de 100%, 125% e 150%. O processo previamente existente em `7877` não foi interrompido.
- Existe monitor na bandeja detectado por mutex de sessão, mas **a sessão já estava em execução antes destas mudanças**; o aceite de clique/ESC, reposicionamento, múltiplos monitores e escalas reais do Windows permanece pendente.
- Para testar o popup atualizado sem instalar serviços: encerrar apenas o monitor antigo pelo menu da bandeja e executar manualmente `scripts/launch-lao-monitor.cmd`. O lançador lê o token local, não o exibe e não altera a inicialização do Windows.
- Chrome headless com DPR simulado não é validação física de escala do Windows. A verificação obrigatória em Windows 11 e múltiplos monitores permanece aberta.
- O pipeline GitHub Actions do commit `379b8f6` consta como **success** (run `40554695186`); o commit anterior `c532a18` consta como **failure** (run `40543039502`). Após novo push, validar o pipeline desse novo SHA.

## Sessão do Dashboard e acesso automático — 27/10/2026

- [x] Login manual gera um ticket de sessão de curta duração (8 horas), mantendo somente esse ticket em `sessionStorage` da aba: **F5 não pede novamente o token principal**.
- [x] Logout remove o ticket do navegador e o revoga no daemon. Sessões inválidas ou expiradas exigem nova autenticação.
- [x] O token principal não é incluído em URLs, armazenamento do navegador, logs ou arquivos do projeto.
- [x] Ao clicar em **Abrir painel** no Tray com o token local carregado, o monitor solicita ao daemon uma autorização de abertura com vida curta (15 segundos, uso único), antes de iniciar o navegador. O browser resgata o ticket no próprio host, sem segredos na URL.
- [ ] Confirmação visual pelo usuário do monitor reiniciado e do acesso automático no seu navegador Windows real.

**Testes executados:** 104 testes direcionados/gerais do LAO (103 aprovados, 1 ignorado por limitação do Windows, nenhum falhou); Chrome CDP autenticado em 100%, 125% e 150% com login inicial, F5 mantendo a sessão, logout limpando o ticket e abertura automática simulada a partir de uma autorização nativa (sem token na URL). Instância de teste na porta 7888, independente da porta 7877 já em uso. A aplicação que já estava executando em 7877 continua com o código carregado anteriormente; precisa de reinício controlado do **LAO**, sem tocar no DevSpace original, para carregar a alteração nesta porta.

**Segurança:** a liberação automática da bandeja é temporária e destinada exclusivamente ao host loopback. Ações que escrevem arquivos ou gerenciam serviços continuam bloqueadas ou exigem aprovação independente. O ticket de sessão dá acesso **somente às mesmas APIs de leitura** do Dashboard. A extensão ainda pressupõe um Windows local confiável: um processo malicioso com acesso ao mesmo usuário precisa ser tratado no sistema operacional. Não se instala serviço, não se adiciona auto-start e não se modifica o DevSpace original.

## Reabrir o Monitor após escolher “Sair” — 27/10/2026

- [x] Atalho **LAO DevSpace Monitor** criado na Área de Trabalho do usuário Windows.
- [x] Atalho criado no menu **Iniciar**, pesquisável pelo nome LAO DevSpace Monitor.
- [x] Ambos utilizam o ícone oficial `assets/icons/ico/lao-tray-idle.ico` e abrem `scripts/launch-lao-monitor.ps1` sem incluir credenciais nos argumentos.
- [x] A criação é idempotente e recusa sobrescrever atalhos não relacionados; instalação e remoção reversíveis por `scripts/install-lao-shortcuts.ps1` (usar `-Remove` para remover apenas os atalhos gerenciados).
- [x] Atalho validado em Windows real: monitor foi reaberto e reconhecido pelo mutex da bandeja.
- [x] Nenhum serviço Windows, autostart, agendamento ou DevSpace upstream alterado.

**Comportamento intencional:** escolher **Sair do monitor** encerra o processo da bandeja. Para voltar a exibir o ícone próximo ao relógio, basta clicar duas vezes no novo atalho da Área de Trabalho ou pesquisar pelo nome no menu Iniciar. A fixação opcional na barra de tarefas é realizada manualmente pelo usuário.

## Painel e reinício real — correção em 27/10/2026

- [x] Corrigida a causa principal do token solicitado ao clicar em **Abrir painel**: a instância antiga de LAO na porta 7877 não tinha os endpoints de sessão nova. Identidade do processo antigo confirmada como LAO (não DevSpace), nenhuma tarefa ativa, instância anterior encerrada e substituída pelo build atualizado.
- [x] Porta oficial `127.0.0.1:7877` responde HTTP 200; API autenticada confirma `restartAvailable=true`. Monitor de bandeja mantém o token exclusivamente no ambiente local, concede abertura de sessão em uso único e não o coloca na URL.
- [x] Botão do Dashboard alterado de **Reiniciar serviço** (desabilitado, pois não existe SCM instalado) para **Reiniciar LAO**. Só habilita quando a instância sinaliza suporte real; exige confirmação explícita.
- [x] Popup nativo Windows: o campo de ação contextual mostra **Reiniciar LAO** habilitado apenas se a API autenticada anunciar `restartAvailable=true`, não houver tarefas ativas e não existirem revisões prioritárias. Confirmação WinForms + envio HTTP não bloqueante com token local; falhas são indicadas, sem operações simuladas.
- [x] Endpoint restrito `POST /dashboard/api/restart` exige Bearer + Origin e Fetch Metadata same-origin; rejeita solicitações sem autenticação, via GET, com tarefas ativas e vindas de outra origem.
- [x] O mesmo endpoint aceita o operador nativo do Monitor sem Origin, mas **somente** com o token principal local; tickets de sessão do navegador não autorizam a via nativa.
- [x] Reinicialização programada do processo LAO local: fecha servidor, libera lease SQLite e relança somente o executável LAO com o ambiente e diretório original. Nunca reinicia DevSpace upstream nem Ollama.
- [x] Lançador manual `scripts/launch-lao-daemon.ps1` acrescentado: estado persistente em `%LOCALAPPDATA%\LAODevSpace\state`, token somente no ambiente do processo, sem exposição em argv e sem instalar serviço Windows.
- [x] No Windows, o lançador supervisiona o LAO: o processo encerra graciosamente com um código exclusivo de reinício e o mesmo launcher o relança, mantendo porta e configuração. Incluído limite de reinícios para evitar loop.
- [ ] Clique físico no botão **Reiniciar LAO** e novo clique na bandeja **Abrir painel** aguardam aceite visual do usuário.

Os painéis anteriores de teste nas portas 7878/7888/7890 não são a porta oficial. O código recém-compilado está em execução na **7877**, em processo LAO exclusivo supervisionado. Após reiniciar o daemon, os tickets de sessão em memória expiram; reabrir pelo Monitor restaura a autenticação local sem digitar a chave.

## Correção de acentos e ícones do Monitor Windows — 27/10/2026

- [x] Causa confirmada com teste reproduzível: `powershell.exe` 5.1 decodifica um `.ps1` UTF-8 **sem BOM** pela página de código ANSI; os textos ficam `ConfiguraÃ§Ãµes` e os símbolos viram caracteres ilegíveis.
- [x] `src/lao/windows/lao-tray.ps1` e `src/lao/windows/lao-popup.ps1` passam a ser versionados em **UTF-8 com BOM**, mantendo as legendas, os acentos e os símbolos Unicode da referência visual aprovada.
- [x] Teste automático falha quando um `.ps1` Windows com caracteres não ASCII perde o BOM, evitando regressões por editores ou ferramentas de patch.
- [x] Teste WinForms executa o PowerShell real e recupera em base64 UTF-8 as legendas renderizadas: `Configurações`, `Modelo padrão`, `Última execução`, `Atenção · parcialmente disponível`, `↗ Abrir painel`, `↻ Reiniciar LAO` e o ponto `●`.
- [ ] Captura física pelo usuário do popup reiniciado após carregar o script atualizado.

**Operação:** apenas o Monitor da bandeja precisa ser fechado e aberto pelo atalho **LAO DevSpace Monitor**, pois o WinForms antigo conserva o texto já carregado em memória. O daemon na porta 7877, DevSpace MCP e Ollama não precisam ser reiniciados para corrigir este problema visual.

## Fidelidade ao mockup oficial — correção após comparação do usuário

O usuário apresentou lado a lado a captura **aprovada** (`tray-active-panel.png`) e o **popup real no Windows**. A primeira versão do WinForms não correspondia fielmente ao desenho: cabeçalho comprimido, pontos de saúde minúsculos, tipografia reduzida, ícones inadequados, card contextual visualmente simples e rodapé fora da ordem original. A aprovação anterior dizia respeito a estrutura/testes automáticos, **não ao aceite visual final**.

- [x] Ajustados cabeçalho (96 DIP), logomarca, marca, subtítulo e engrenagem para as proporções da referência.
- [x] Pontos de saúde circulares renderizados com antialiasing em tamanho legível, independentes da forma variável do caractere `●` nas fontes do Windows.
- [x] Linhas com espaçamento de 40 DIP e tipografia maior; o card ganhou borda arredondada e ícone de documento desenhado como vetor.
- [x] Ações reordenadas conforme a referência: **Abrir painel → Ver logs → Reiniciar LAO/Ver revisão → Configurações**; ícones separados dos rótulos e setas alinhadas à direita.
- [x] Captura de controle WinForms **renderizada e inspecionada** com 420 × 768 px, comparada à referência de 629 × 1147 reduzida para 420 × 766 px.
- [x] Quando há tarefa real, o card apresenta ID abreviado, executor e fase conhecidos; tempo ainda indisponível aparece explicitamente sem inventar valor.
- [ ] Receber captura do popup real reiniciado na máquina do usuário e confirmar visualmente os estados ativo, revisão e offline.

**Importante:** os valores `GPU 100%`, `5,7/6,0 GB`, `2 tarefas` e `Validar CPF no cadastro` da captura aprovada são exemplos ilustrativos. **Não** devem ser copiados para a UI em produção quando as métricas/tarefas reais não correspondem. O valor `Modelo padrão` também não deve ser rotulado `Modelo ativo` sem prova de carregamento efetivo do modelo.

## Ícones: fonte vetorial única na implementação — 27/10/2026

- [x] Criado pacote com SVGs **vetorizados com base no mockup aprovado**, de **Abrir painel, Logs, Reiniciar, Configurações, Revisão, Chevron, Documento, Status, Modelos, Ollama e Recursos**. Os arquivos ainda exigem aprovação visual final do usuário.
- [x] PNGs de 64 px gerados diretamente dos SVGs por `scripts/build-lao-action-icons.ps1` usando WPF nativo e fundo transparente, sem web e sem dependências adicionais.
- [x] Monitor WinForms atualizado para **carregar as imagens dos assets oficiais** no cabeçalho, nas quatro ações e no card contextual, sem Unicode/ícones de fonte nem desenhos independentes no evento de pintura.
- [x] Card contextual utiliza variações cromáticas de um mesmo SVG (verde, amarelo, vermelho), conforme status.
- [x] Dashboard web atualizado para reaproveitar **os mesmos PNGs** na navegação, cartões, seções, ações e registros de tarefas, sem manter outra implementação visual concorrente.
- [x] Empacotamento de release passa a incluir SVGs-fonte e imagens PNG oficiais; testes impedem arquivos ausentes, arte ilegível e retorno de caracteres Unicode nos controles.
- [ ] **Aprovação visual do usuário** após reiniciar o Monitor e conferir lado a lado com o mockup. A correção técnica dos ícones não equivale automaticamente ao aceite do design.

Esta etapa altera somente os assets e sua aplicação visual, preservando a lógica de monitoramento, os números reais e o DevSpace original.
