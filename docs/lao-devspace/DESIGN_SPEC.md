# LAO DevSpace — contrato visual v1

## Tray e interação

- Indicador na bandeja do Windows, com badge pequeno verde (ativo), vermelho (parado), âmbar (aguardando revisão) ou cinza (desconhecido).
- Clique único abre/fecha popup com largura-alvo de 420 DIP e cantos de 16 px; clique externo fecha.
- Cabeçalho: símbolo LAO, título, indicador de status e configurações.
- Listar saúde do LAO Service, DevSpace MCP e Ollama, modelo disponível, GPU, VRAM, fila e última execução.
- Cartão de tarefa: nome, executor local, fase e tempo; comandos Abrir painel, Ver logs, Reiniciar ou Iniciar serviço, Configurações.
- Painel expandido: Status, Tarefas, Modelos, Logs, Configurações; cards, histórico e eventos.
- Tipografia Segoe UI, Inter; cores e dimensões em `design/design-tokens.json`.

## Regras

- Status de cada dependência deve ser observado independentemente.
- Se o Ollama parar enquanto o LAO continuar ativo, indicar Ollama vermelho e estado geral degradado; não mentir sobre o serviço.
- Indicadores de GPU/VRAM apresentam números, não classificações de saúde. Sem dado deve mostrar "Indisponível".
- Aguardando revisão não é falha; serviço pode continuar verde.
- Registrar horário da última sondagem, expirar status obsoleto e implementar tentativas com backoff.
- Tray monitor inicia no login; LAO Service inicia com o Windows (fase posterior).
- Não permitir reinício, escrita em arquivos ou retomada de tarefas pausadas sem política de autorização.

## Fidelidade

As quatro capturas em `assets/references` são a referência de aprovação. Não usar os desktops inteiros como fundo da aplicação. Comparar side-by-side, escalas de 100% e 125%, status, texto, ícone e estados hover/foco antes de marcar pronto.

## Segurança e compatibilidade

Não substituir a `main`, alterar OAuth ou alargar approved roots para contornar falhas. Módulo LAO desativado por padrão; teste de regressão MCP e UI antes de habilitá-lo.
