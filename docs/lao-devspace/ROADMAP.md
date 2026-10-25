# Roadmap — LAO DevSpace

## Visão

Local Agent Orchestrator + DevSpace: supervisor ChatGPT, orquestrador DevSpace MCP e executores Ollama locais com revisão, limites explícitos e auditoria. Não modificar a experiência estável sem feature flag.

| Fase | Entrega | Aceite obrigatório |
|---|---|---|
| F0 | Branch `feature/lao-devspace`, worktree isolado, assets aprovados | Main intacta; assets e referências verificadas |
| F1 | Núcleo LAO: tipos, config, persistência, tarefas | Estados reconstituíveis e comandos auditáveis |
| F2 | Adapter Ollama: lista de modelos, chat/tools, cancelamento | Offline/reconnect/timeout tratados sem bloquear MCP |
| F3 | Delegação: tarefa delimitada e worktree por tarefa | Nenhum acesso a raiz não autorizada, diff revisável |
| F4 | Avaliação: critérios, testes, loops com limite | Evidências de validação, aprovação humana em escrita |
| F5 | Serviço no boot + bandeja Windows | Health endpoints, tray popup, estados verde/vermelho/amarelo/cinza |
| F6 | Painel expandido e histórico | Logs, fila, recursos e modelos fiéis aos mockups |
| F7 | Regressão, segurança, instalador, rollback | CI verde e versão atual do DevSpace intacta |
| F8 | Multimodelo e comparação entre executores | Isolamento e comparação por tarefa, sem conflito |

## F5 — Serviço e monitor de status

- **LAO Service:** Windows service, inicia automaticamente com o Windows e não depende da sessão gráfica.
- **LAO Tray Monitor:** inicia no login, consulta serviço via canal local, expande popup ao clicar no ícone.
- Status por cores: verde saudável, vermelho falha, amarelo revisão/degradação, cinza desconhecido/parado voluntariamente.
- Sondagens independentes para LAO, MCP, Ollama, modelo e disponibilidade da GPU.
- Indicadores reais de GPU/VRAM/CPU/RAM e fila; dados desatualizados aparecem como indisponíveis.
- Políticas de recuperação com backoff e limites; não reiniciar Ollama/DevSpace de outro usuário automaticamente.
- Clicar em `Abrir painel` abre janela expandida; logs, tarefas e modelos.
- Ícones SVG/PNG/ICO organizados em `docs/lao-devspace/assets/icons`.
- Serviço e tray monitor não iniciados/instalados nesta etapa; somente design e preparação.

## Segurança e compatibilidade

MCP existente, OAuth, approved roots, sessões, worktrees e subagentes permanecem compatíveis. Nenhum merge automático; nenhuma edição no checkout principal pelo executor local sem revisão e autorização. Testes unitários, integração, smoke test real em worktree e rollback para cada versão.

## Estado deste preparativo

Branch e worktree criados; ícones e tokens locais gerados. PNGs originais do pacote de referência aguardam importação usando `scripts/import-lao-assets.ps1`. Ainda sem instalação do serviço, execução de agente ou commit de assets.
