# F8-01 - Benchmark Ollama local (26/10/2026)

**Escopo:** 5 repeticoes por modelo, via Ollama local real, com chamadas
sequenciais. Nenhum modelo foi baixado, alterado ou definido como padrao.

## Configuracao

- Equipamento local atual; acesso via Ollama loopback.
- Modelos previamente instalados:
  - granite4.2-8b:gpu
  - spark-x2.6-q8-100gpu:latest
- Request: \`/api/chat\`, \`stream=false\`, \`think=false\`,
  \`temperature=0\`, \`num_ctx=2048\`, \`num_predict=64\`,
  \`keep_alive=0\` para evitar dois modelos ativos simultaneamente.
- Prompt trivial: "Only answer the result as a digit: 2 + 2 = ?".
- Resultado esperado: "4" exato.

| Modelo | Acertos | Mediana wall | Min. | Max. | Primeira chamada |
|---|---:|---:|---:|---:|---:|
| Granite 4.2 8B GPU | 5/5 | 4.468 ms | 4.352 ms | 20.317 ms | 20.317 ms |
| Spark X2.6 Q8 | 5/5 | 4.716 ms | 4.600 ms | 62.014 ms | 62.014 ms |

Valores individuais wall em ms:

- Granite: 20317, 4464, 4499, 4468, 4352.
- Spark: 62014, 4829, 4600, 4675, 4716.

**Interpretacao:** neste teste muito pequeno ambos responderam corretamente;
Granite teve menor mediana de tempo total, enquanto o tempo de geracao reportado
pelo Ollama para Spark foi menor. A primeira chamada teve custo de carga
substancial, especialmente Spark. Estes resultados **nao** medem capacidade de
codificacao, confiabilidade em patches, tolerancia a contexto, VRAM precisa,
qualidade de ferramentas, throughput sob concorrencia ou desempenho de agente.
Nao representam evidencias suficientes para promover Spark ou habilitar failover.

## Estado e proximas verificacoes

O benchmark pode ser repetido com:

\`node src/lao/lao-benchmark-live.mjs granite4.2-8b:gpu spark-x2.6-q8-100gpu:latest\`

A politica de fallback automatizado era **desativada** nesta medicao inicial.

## Prova multimodelo e failover posterior

Depois do benchmark, o LAO recebeu fallback **local, opcional e explicito**
por `DEVSPACE_LAO_FALLBACK_MODEL`. Nao ha selecao aleatoria nem uso de
entradas Ollama `cloud`: o fallback deve ser diferente do primario e continua
no mesmo endpoint loopback.

O smoke real `lao-multimodel-live.mjs` confirmou os dois modelos instalados:

- `granite4.2-8b:gpu`: resposta `4`, correta;
- `spark-x2.6-q8-100gpu:latest`: resposta `4`, correta;
- ambos reportaram capacidade `tools` pelo Ollama;
- nenhum modelo foi baixado ou alterado.

Na mesma execucao, um nome de modelo primario propositalmente inexistente
recebeu rejeicao especifica do Ollama e o `LaoReadOnlyRunner` concluiu a
tarefa com `spark-x2.6-q8-100gpu:latest`, status `awaiting_review`, sem shell
e sem escrita em repositorio. Testes automatizados adicionais comprovaram
failover apos timeout da geracao, fallback de patch **antes** de qualquer
efeito no worktree e recusa de tentar outro modelo quando o servidor Ollama
inteiro esta offline.

O failover nao autoaprova, nao promove codigo e nao oculta indisponibilidade
global do Ollama. A tarefa preserva o modelo solicitado e cada `run` persiste
o modelo que efetivamente executou, permitindo auditoria do fallback.

## Prova real de duas correcoes

O smoke `lao-retry-live.mjs` usou Granite real num repositorio/worktree
descartavel. O modelo produziu `value = 1`, recebeu duas decisoes
`needs_revision` do supervisor e corrigiu sucessivamente para `2` e `3`.
Foram persistidos tres runs concluidos, `revisionCount=2`; o checkout fonte
permaneceu limpo e no HEAD original, sem promocao.
