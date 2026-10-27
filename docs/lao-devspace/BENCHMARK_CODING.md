# F8 - Benchmark de programacao com isolamento (preparacao)

**Estado:** roteiro e teste de contrato preparados. Nao equivale a uma
comparacao real: Ollama estava indisponivel em 27/10/2026 durante esta etapa.
Nao altera o modelo padrao nem configura failover.

O script `src/lao/lao-coding-benchmark-live.mjs` usa dois modelos
instalados localmente e executa **sequencialmente**, para cada um, as
mesmas duas tarefas deterministicas:

1. Soma de inteiros pares, filtrando tipos invalidos.
2. Geracao de slug de URL com acentos e pontuacao.

Somente o texto de modulo ESM delimitado passa para os fixtures. O
codigo escrito pelo modelo **nunca executa no Windows host**: os testes
node:test rodam em container Docker **offline, sem privilegios, filesystem
read-only**, imagem ja presente e fixada por digest SHA-256, com recursos
limitados e timeout. O script usa diretorios temporarios exclusivos,
nome de container exclusivo e limpeza forcada no fim da tentativa.
Nenhum arquivo de repositorio do usuario e enviado ao modelo.

## Executar somente apos Ollama e Docker estarem ativos

No CMD da branch feature e depois de `pnpm build`:

```cmd
cd /d D:\desenvolvimento\lao-devspace
set "LAO_SANDBOX_NODE_IMAGE=<imagem-local>@sha256:<digest-local-exato>"
node src/lao/lao-coding-benchmark-live.mjs granite4.2-8b:gpu spark-x2.6-q8-100gpu:latest
```

Requisitos: ambos os nomes precisam constar em /api/tags; Docker Linux
Engine local precisa ter imagem Node adequada e verificada pelo operador.
O benchmark nao baixa imagens, nao inicia Ollama ou Docker, nao executa
shell do modelo e nao faz commit, merge, push ou aprovacao automatica.

Saida JSON: horario, modelos, tarefas, tempo da resposta, tempo total,
hash SHA-256 do modulo, se o teste foi executado, passou ou falhou e
codigo de falha. Codigo bruto/saida de teste nao sao divulgados no JSON.

**Limitacoes de interpretacao:** duas tarefas simples nao medem qualidade
em repositorios reais nem desempenho MCP de varias etapas; nao servem
para promover um modelo ou habilitar failover automaticamente. A
comparacao definitiva exigira repeticoes, casos de edicao real em
worktree temporaria, testes multi-arquivo, taxa de acerto e custo/VRAM
sob condicoes equivalentes.
