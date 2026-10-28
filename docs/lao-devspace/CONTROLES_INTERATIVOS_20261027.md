# LAO DevSpace — controles solicitados após aprovação do layout

**Data:** 27/10/2026. O popup principal de 420 DIP, seu logotipo, cores, ícones e hierarquia permanecem exatamente como aprovados. As funcionalidades abaixo são interações, não uma reformulação da tela.

## Inicialização automática: switch, desligado por padrão

Clique em **Configurações** (engrenagem ou rodapé) para abrir uma janela separada com o switch **Iniciar LAO e Monitor com Windows**. Inicialmente desligado, ele afeta **somente a conta Windows atual**.

- **Ligado:** cria dois atalhos com caminhos fixos na pasta *Inicializar* do usuário: um para o daemon LAO e outro para o Monitor. Utiliza os lançadores versionados `launch-lao-daemon.ps1` e `launch-lao-monitor.ps1`.
- **Desligado:** remove unicamente os dois atalhos correspondentes, depois de conferir rigorosamente programa/argumentos. Nenhum processo em execução é encerrado.
- Não cria Windows Service, Tarefa Agendada, chave de registro Run ou inicialização global. DevSpace e Ollama continuam independentes.
- O switch **não é ativado automaticamente por uma atualização**. A alteração ocorre apenas após clique do usuário. A conta precisa fazer login para iniciar; não equivale a serviço que funciona antes do login.

## Modelo padrão: combo com inventário real

Clique na linha **Modelo padrão** do Monitor, ou no valor do mesmo card no Dashboard. O combo consulta `GET /dashboard/api/models`, que usa `/api/tags` do Ollama local e filtra opções terminadas em `cloud` (não locais). Nenhum nome fictício ou externo é incluído. Selecionar uma opção realiza `POST /dashboard/api/models/select` autenticado e altera **somente** a preferência do LAO, persistida em `selected-model.json` no estado LAO. As requisições rejeitam modelos não instalados e impedem alteração durante tarefas executando. O modelo é escolhido, **não carregado automaticamente na VRAM**. Delegações MCP do LAO que não informam explicitamente `model` podem ler a preferência do mesmo usuário Windows; um modelo informado na tarefa continua tendo precedência.

## Reiniciar Ollama e DevSpace: somente quando gerenciados

**Comportamento corrigido após teste do usuário:** as linhas **Ollama** e **DevSpace MCP** são **somente status** em condições normais. Clicar nelas com serviço respondendo, ou DevSpace apenas **Não verificado**, **não abre Configurações nem executa nada**. Configurações continuam disponíveis apenas pela engrenagem e pelo botão inferior aprovado.

Se houver **falha comprovada**, nenhum trabalho LAO em execução, e a dependência estiver explicitamente vinculada a um serviço Windows gerenciado, o valor da linha muda temporariamente para **Offline · Reiniciar** (serviço rodando mas sem responder) ou **Parado · Iniciar** (serviço parado). Só então o cursor indica ação e o clique na própria linha solicita **confirmação específica para a dependência**, sem navegar para outra janela. A operação é revalidada após a confirmação.

Os botões individuais da janela Configurações também só habilitam nesses cenários de falha. O estado **DevSpace MCP: Não verificado**, sozinho, não demonstra falha do DevSpace; ele pode estar funcionando e apenas exigir autenticação.

Para evitar interromper o DevSpace que presta acesso MCP ao ChatGPT ou encerrar um Ollama utilizado por outras aplicações, esses botões **só ficam habilitados** se o operador tiver configurado explicitamente a identidade de um **Windows Service gerenciado**, em variáveis de ambiente do processo Monitor:

- `LAO_MANAGED_OLLAMA_SERVICE`: nome exato do serviço Windows do Ollama.
- `LAO_MANAGED_DEVSPACE_SERVICE`: nome exato do serviço Windows do DevSpace.

O nome deve existir no SCM e o serviço deve estar **rodando com falha confirmada** (reiniciar), ou **parado** (iniciar). Cada clique solicita confirmação nominal e o Windows controla a operação com as permissões da conta atual. O fluxo não envia token ou comando arbitrário, **não mata processos por PID**, não executa recuperação durante tarefas LAO ativas e não reinicia silenciosamente o serviço original. Em caso de serviço não instalado ou não identificado, a ação fica **indisponível**, em vez de aparentar ter funcionado.

**Diagnóstico nesta máquina:** em 27/10, não foram encontrados serviços Windows gerenciados com nomes Ollama, DevSpace ou LAO, nem variáveis de configuração desses nomes. Assim, **o reinício automático dessas duas dependências ainda não está operacional neste PC**; precisa primeiro de um ciclo de vida gerenciado e seguro, validado separadamente, antes de habilitar os botões. Nenhum serviço/processo externo foi parado ou reiniciado durante esta implementação.

## Validação

- Testes unitários validam lista real, bloqueio de modelo ausente, prevenção de CSRF e persistência da preferência após reinício; teste isolado em pasta temporária liga e desliga o switch sem modificar a inicialização real do usuário.
- Teste WinForms `-UiCheckOnly` valida o combo nativo, o switch, as duas ações e a estrutura aprovada sem mostrar janela ou alterar serviços.
- Quando houver o Windows Service apropriado, ainda serão necessários testes reais de *Restart-Service*, confirmação gráfica, perda e retorno de conexão e proteção contra tarefas ativas, antes de declarar o requisito de reinício operacional concluído.
