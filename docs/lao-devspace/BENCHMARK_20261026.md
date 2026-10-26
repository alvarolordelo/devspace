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

A politica de fallback automatizado continua **desativada**. Pendentes:
executar tarefa codificada controlada 5x por modelo, validar diffs e regressao,
registrar uso de GPU/RAM e definir limites de alternancia em caso de falha.
