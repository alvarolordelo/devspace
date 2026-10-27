# Especificação visual — LAO Tray Monitor (v1)

## 1. Referências e princípio de fidelidade

Os arquivos `assets/references/*.png` constituem a referência visual das telas que o usuário quer reproduzir. Eles apresentam um Windows 11 conceitual com monitor LAO. Implementar a UI como controles **nativos ou webview com layout responsivo**, e não como bitmap imutável. Usar o painel do mockup como guia para espaçamento, cor, bordas, ordem dos elementos e textos.

A identidade LAO (triângulo de nós em azuis escuros, branco e verde) deste pacote foi vetorizada como aproximação original. Não incorporar marcas/logotipos de terceiros ou imagens da área de trabalho no produto.

## 2. Ícone e menu de bandeja (Windows)

- Exibir um ícone na *notification area* (tray) com indicador pequeno e circular: **verde** ativo, **vermelho** serviço parado, **amarelo** atenção/revisão, **cinza** ainda não inicializado.
- Clique no ícone: abrir/fechar popup ancorado à bandeja. Clique externo e tecla **Esc** fecham o popup. O popup deve posicionar-se corretamente com a barra do Windows em posições diferentes, zoom/DPI e múltiplos monitores.
- Sem depender do usuário abrir painel para checar status. Tooltip deve expor "LAO DevSpace — Ativo/Parado/Atenção".
- Suportar ação por teclado, foco visível e textos acessíveis além das cores.
- Tamanhos sugeridos: ícone 16–32 px no tray; exportar `.ico` multirresolução e PNG 20/24/32 px. O SO decide resolução final.

## 3. Popup compacto

Referência: `tray-active-panel.png`, `tray-offline-panel.png`, `tray-review-panel.png`.

- Largura-alvo: **420 DIP** (ajustar responsivamente de 340 DIP ao espaço disponível), altura variável com `max-height` conforme tela, rolagem interna se necessário.
- Fundo branco `#FFFFFF`, cantos 16 px, borda suave `#E2E8F0`, sombra moderada, tipografia `Segoe UI` ou fallback local.
- Cabeçalho: logomarca ~40 px; **LAO DevSpace** em negrito; subtítulo com ponto de saúde e texto; configurações à direita.
- Lista de saúde: **LAO Service**, **DevSpace MCP**, **Ollama**; uma linha por item com indicador e valor à direita.
- Detalhes de inferência: **Modelo ativo**, **GPU**, **VRAM**, **Fila**, **Última execução** ou **Pendências/Último erro**, conforme estado.
- Card contextual: tarefa em andamento ou alerta de falha, com status, modelo e etapa; em revisão usar barra de atenção amarela.
- Ações do rodapé: abrir painel completo, ver revisão ou logs, iniciar/reiniciar serviço, configurações — **somente** onde pertinentes ao estado.
- Layout deve imitar a organização do conceito sem copiar o fundo do Windows.

## 4. Dashboard completo

Referência: `dashboard-panel.png`.

- Janela separada do popup, navegável: `Status`, `Tarefas`, `Modelos`, `Logs`, `Configurações`.
- Cards superiores: LAO Service, DevSpace MCP, Ollama, modelo selecionado.
- Recursos: GPU, VRAM, CPU, RAM. Indicar unidade de medida e se o dado é indisponível.
- Tarefas: resumo, executor, duração, etapa, estado, opção de inspecionar diff/revisão.
- Modelos: instalado/disponível/carregado/indisponível em estados **distintos**.
- Eventos: timestamp local, severidade, componente, mensagem e link para logs.

## 5. Regras semânticas de status

| Cor | Uso principal | Não confundir com |
|---|---|---|
| Verde | serviço operacional e verificação recente OK | valor de utilização da GPU de 100% |
| Vermelho | falha/parado/indisponível | GPU ociosa (0% não é falha) |
| Amarelo | atenção, ação do usuário necessária, revisão pendente | simples uso elevado de GPU sem limite ultrapassado |
| Cinza | desconhecido, não monitorado ou serviço desabilitado | offline confirmado |

Um serviço LAO ativo **não exige** modelo carregado permanentemente em VRAM. Ollama offline não significa necessariamente DevSpace MCP offline. A saúde agregada deve indicar o componente específico, com preferências configuráveis de severidade.

## 6. Contratos de monitoramento

Estado mínimo de cada componente: `name`, `status (online|offline|degraded|unknown)`, `checked_at`, `latency_ms?`, `last_error?`. Dados de GPU: `utilization_percent`, `memory_used_mib`, `memory_total_mib`, `source`, `sampled_at`. Dados de tarefa: `id`, `title`, `state`, `agent`, `workspace`, `started_at`, `elapsed_ms`, `needs_review`, `last_error`.

- Polling sugerido de 3–5 segundos; pause/alongue na ausência de UI e aplique *backoff* quando serviço estiver indisponível.
- Considerar **estado desatualizado** quando a medição exceder o limiar de validade (ex.: 15 s); não exibir verde por cache antigo.
- Exibir `—` para valores desconhecidos. Não inventar "GPU 100%" quando apenas `ollama ps` informou "100% GPU" como **localização das camadas**: são métricas diferentes e devem ter rótulos diferentes.
- Log sem credenciais, caminhos sensíveis ou prompt privado em notificações de bandeja; detalhes somente no painel autenticado.

## 7. Serviço Windows e robustez

- O **serviço** inicia com o Windows após instalação consentida e possui política limitada de recuperação via Service Control Manager. O **Tray Monitor** inicia **ao login do usuário**, em processo gráfico separado (serviço Session 0 não deve desenhar UI).
- Serviço e monitor comunicam-se somente por IPC/HTTP local autenticado ou canal protegido; não abrir endpoint sem autenticação para a rede.
- Oferecer *health check* explícito; não tomar porta/credenciais/configuração do DevSpace ou Ollama já instalado.
- Ao reiniciar, retomar leitura de histórico; **não** retomar edição/push automaticamente sem autorização.
- Ao clicar `Reiniciar serviço`, mostrar confirmação apropriada, timeout e resultado real; ao clicar `Ver logs`, abrir área correspondente.
- Quando LAO estiver desativado, recursos existentes do DevSpace continuam idênticos.

## 8. Critério de aprovação visual

Usar as quatro capturas originais em revisão lado a lado. Validar os alinhamentos horizontais, espaço entre linhas, estilo dos ícones, legibilidade em 100%, 125%, 150% DPI, popup ancorado ao tray e exibição sem cortar itens. Não limitar-se à renderização do browser: conferir a integração real com a bandeja do Windows.

O conteúdo numérico dos mockups é **fictício**; em produção os valores virão dos provedores de estado, com indicação de horário da última coleta.

## 9. Contrato dos ícones oficiais (Design First)

Os ícones da identidade do LAO e os ícones dos controles não são caracteres Unicode nem dependem de Segoe UI Symbol, emojis ou desenhos ocasionais de GDI+. O projeto mantém **uma fonte SVG versionada por ícone** em `docs/lao-devspace/assets/icons/actions/`. Estes ícones são reproduções vetoriais da referência aprovada, não recortes do fundo da imagem conceitual.

O script `scripts/build-lao-action-icons.ps1` usa WPF nativo do Windows para renderizar os SVGs em PNGs transparentes de 64 px, sem rede nem dependências externas. Os PNGs resultantes são versionados em `assets/icons/png/lao-action-*-64.png` e são **os mesmos** consumidos pela interface WinForms e pelo Dashboard web. A bandeja continua utilizando os `.ico` multirresolução oficiais já existentes.

O rodapé do popup deve consumir SVG/PNG de **Abrir painel, Logs, Reiniciar, Configurações, Revisão e Chevron**. O card de tarefa consome o mesmo documento em variantes de cor para estados verde/amarelo/vermelho. O Dashboard consome os mesmos ícones, acrescidos de Status, Modelos, Ollama e Recursos, todos em SVG/PNG; textos e nomes de tarefas não substituem esses recursos. O endpoint `/dashboard/assets/icons/{nome}.png` tem lista de nomes explicitamente permitidos, sem permitir diretórios ou arquivos arbitrários.

**Regressões proibidas:** substituir qualquer ícone aprovado por texto Unicode, redesenhá-lo diretamente no evento `Paint`, incluir ícones de terceiros, armazenar ícones somente na imagem do mockup ou exigir instalar fontes para exibi-los. Para qualquer atualização, alterar primeiramente o SVG-fonte e regenerar os PNGs; executar os testes de integridade de assets e comparar a captura real do Windows com a referência.
