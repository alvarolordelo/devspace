# LAO DevSpace — assets e design

**Feature:** `feature/lao-devspace` | **Projeto:** Local Agent Orchestrator + DevSpace

O monitor é uma extensão opcional do DevSpace. A versão estável deve permanecer compatível. O serviço LAO roda em segundo plano, enquanto o aplicativo tray roda na sessão do usuário. O ponto verde/vermelho/amarelo/cinza transmite o estado e, ao clicar, expande o popup no estilo aprovado inspirado no Tailscale.

## Referências originais aprovadas

- `assets/references/tray-active-desktop.png` — serviço ativo.
- `assets/references/tray-offline-desktop.png` — serviço parado.
- `assets/references/tray-review-desktop.png` — aguardando revisão.
- `assets/references/dashboard-desktop.png` — painel completo.

Importe o pacote original pelo script `scripts/import-lao-assets.ps1`. PNGs de referência devem ser preservados exatamente; SVGs e ícones nativos são assets implementáveis produzidos com base no conceito.

## Versao fixa do DevSpace

O LAO usa o DevSpace **1.0.8** ancorado no commit `13c99ee`. Consulte [a politica de pin e atualizacoes](DEVSPACE_VERSION_POLICY.md) para a separacao entre atualizacoes LAO e upgrades expressos do DevSpace.

## Implementação

- `design/design-tokens.json`: cores, tipografia e geometria do popup.
- `design/status-states.json`: quatro estados e ações.
- `assets/icons/svg`: identidade LAO e quatro badges de status.
- `assets/icons/png`, `assets/icons/ico`: gerados para o Windows.
- `DESIGN_SPEC.md`: contrato visual, UX e regras de status.
- `scripts/generate-tray-assets.ps1`: geração nativa de ícones.
- `scripts/import-lao-assets.ps1`: extração fiel das imagens originais.

**Não confundir GPU em 100% com saúde verde.** Utilização, consumo, disponibilidade de modelo e estado do serviço são dimensões independentes. Métricas exibidas nos mockups são ilustrativas. Nenhum serviço será instalado automaticamente nesta fase.
