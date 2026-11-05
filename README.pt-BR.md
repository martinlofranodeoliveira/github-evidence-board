# GitHub evidence board

Versão de desenvolvimento **0.1.0**, da [Lofrano Tecnologia](https://lofranotecnologia.com.br). Painel de navegador e CLI Node para inspecionar evidências de repositórios públicos a partir de snapshots, com operação offline por padrão.

O painel separa estado de CI, idade do snapshot, metadados de licença e presença de documentação. Snapshots importados são afirmações do usuário, **não evidências autenticadas independentemente**. O software não certifica segurança, conformidade, qualidade ou elegibilidade comercial ou em licitações. Os nomes da demonstração são fictícios, sem afirmações sobre usuários ou repositórios reais.

## Executar localmente

Requer Node **22 ou posterior**. Não há dependências, compilação, modelos, chaves de API ou scripts de instalação. Com os arquivos do projeto disponíveis:

```sh
node --test
node ./bin/evidence-board.mjs demo
node ./scripts/serve.mjs
```

Abra `http://127.0.0.1:4173`. Para outra porta sem privilégios: `node ./scripts/serve.mjs 4180`. Encerre com Ctrl+C. Os módulos precisam ser servidos por HTTP; não há suporte a `file://`. O servidor escuta somente em loopback e usa uma lista explícita de arquivos permitidos. É uma prévia local de desenvolvimento, não um servidor para exposição pública.

Também existem `npm test`, `npm run demo` e `npm run serve`. Não é necessário instalar pacotes. Os testes usam respostas GitHub sintéticas e um servidor HTTP em loopback, nunca a API pública.

## Usar o painel

1. A primeira tela mostra **Synthetic demo**: oito casos fictícios com horário fixo, sem requisição de API. O navegador carrega os arquivos locais de HTML, CSS e módulos; não existem requisições programáticas de dados na inicialização.
2. Combine busca por identidade, descrição ou linguagem com os filtros de veredito e linguagem. Quando não há resultados, a tela informa isso explicitamente; **Clear filters** recupera a visão carregada.
3. Selecione um repositório para abrir o diálogo de detalhes. Ele exibe SHA, origem declarada, horários, completude do inventário e JSON bruto. Escape ou **Close detail** fecha o diálogo e devolve o foco ao botão de origem, ou ao título dos resultados se o botão deixou de existir.
4. **Open local UTF-8 JSON** copia o arquivo para o editor. **Apply snapshot** valida e aplica. Erros têm caminho JSON exato e preservam os dados anteriores. Nenhum arquivo é enviado ou persistido.
5. **Export JSON** e **Export Markdown** geram relatórios da seleção e resumo de lacunas. Relatórios não são backups dos snapshots; para preservar todos os workflows e execuções, salve separadamente o conteúdo do editor.
6. Em um repositório não sintético, **Refresh this repository from GitHub** consulta a API pública sem credenciais somente após o clique. Consulta head da branch padrão, inventário de workflows e execuções do SHA atual, com paginação limitada. A atualização muda o horário de avaliação do snapshot inteiro, podendo tornar outras linhas antigas. Falhas preservam os dados. Arquivos de documentação não são consultados: sua presença fica desconhecida.

Os controles têm comportamento nativo de teclado, foco visível, link de salto, anúncios de filtros e erros e diálogo modal nativo. Os testes de interação usam um pequeno modelo de DOM, não um navegador real. Não há afirmação de aprovação de QA visual ou de acessibilidade em navegador. Consulte o checklist manual em [docs/design.md](docs/design.md).

### Entrada pequena

O [contrato completo](docs/contract.md) define todos os campos e limites. URLs arbitrárias não são aceitas; a identidade é formada por `owner` e `name`.

```json
{
  "schema_version": "0.1.0",
  "evaluated_at_utc": "2026-01-15T12:00:00Z",
  "ttl_seconds": 3600,
  "repositories": [
    {
      "owner": "example-owner",
      "name": "example-repository",
      "description": "Exemplo sintético de importação; substitua identidade e evidências deliberadamente.",
      "language": null,
      "source_sha": null,
      "observed_at_utc": "2026-01-15T11:30:00Z",
      "provenance": "imported",
      "license": "unknown",
      "documentation": { "readme": "unknown", "contributing": "unknown", "security": "unknown" },
      "workflow_inventory": { "complete": false, "items": [] },
      "runs": { "complete": false, "items": [] }
    }
  ]
}
```

Esse exemplo resulta em `incomplete_metadata`, não em aprovação nem ausência de CI. O nome não afirma a existência de um repositório real. Substitua a identidade antes de optar pela consulta pública. Mesmo `provenance: "github_api"` em arquivo importado é apenas uma declaração, não prova de consulta nesta sessão.


A evidência de sessão existe somente em memória. A atualização explícita mantém sua marca durante normalização, filtros e exportação. Salvar/reaplicar JSON elimina a marca: até `provenance: "github_api"` com declaração de aprovação volta a não verificado por padrão. Os relatórios identificam a base da evidência e o SHA; booleanos exportados não são prova assinada ou portátil. Vereditos sintéticos são cenários fictícios. Contextos explícitos de asserção existem na biblioteca e estão no contrato; a UI/CLI não ativam esses atalhos.

## CLI offline

```sh
node ./bin/evidence-board.mjs --help
node ./bin/evidence-board.mjs demo --format json
node ./bin/evidence-board.mjs demo --status verified_passing --format markdown
node ./bin/evidence-board.mjs report snapshot.json --language JavaScript --format markdown
node ./bin/evidence-board.mjs report snapshot.json --at 2026-01-15T13:00:00Z
```

Os comandos `report` pressupõem um snapshot seu salvo como `snapshot.json`. A CLI nunca usa rede. O horário vem do JSON ou de `--at`, nunca do relógio local. `demo` imprime JSON e Markdown com marcadores; `report` imprime somente JSON por padrão. Para processamento automático, use `--format json`. Códigos de saída: 0 para sucesso, 2 para validação de snapshot/filtros, 1 para uso incorreto ou erro de arquivo. Diagnósticos vão para stderr e não há relatório parcial em caso de erro.

Saída do exemplo Markdown filtrado; os relatórios mantêm os identificadores e textos em inglês:

```text
# Repository evidence audit

Evaluated at: `2026-01-15T12:00:00Z` · TTL: 3600 seconds.

Snapshot assertions only; not independently authenticated. Point-in-time metadata does not certify quality, security, compliance, or contract eligibility.

Filters: search="" status="verified\_passing" language="".
Selected repositories: 1.

| Repository | Verdict | Evidence basis | Source SHA | Age (s) | Evidence gaps |
| --- | --- | --- | --- | ---: | --- |
| synthetic-evidence/complete-checks | verified_passing | synthetic_scenario | 1111111111111111111111111111111111111111 | 1800 | none |

## Evidence gap summary

No evidence gaps in the selected view.
```

A demonstração completa possui 1 aprovação, 1 falha, 1 snapshot antigo, 1 metadado incompleto, 3 casos não verificados e 1 inventário explicitamente vazio. Todos são sintéticos.

## Decisões e limitações

- Uma execução bem-sucedida não representa todos os workflows. A verificação exige inventário e enumeração completos, além da execução mais recente de cada workflow ativo, concluída e correspondente ao SHA avaliado.
- Zero execuções não prova ausência de CI. Apenas inventário completo e explicitamente vazio gera `no_ci_configured`, limitado ao GitHub Actions.
- A idade exatamente igual ao TTL ainda é válida; um segundo depois, o snapshot é antigo. O tempo não avança silenciosamente.
- Presença tem três estados: `present`, `absent`, `unknown`. Não é avaliação jurídica, de conteúdo ou de segurança. Metadados de licença não validam o texto da licença.
- Módulos puros compartilhados evitam diferenças entre navegador e CLI. Ordenação, contagens de lacunas e serialização são determinísticas.

Somente um subconjunto documentado dos metadados de GitHub Actions é interpretado. Não são avaliados todos os provedores de CI, eventos, regras de proteção de branch, verificações obrigatórias, requisitos de matriz ou conteúdo dos jobs. Workflows desabilitados não entram na aprovação/falha, mas também não significam inventário vazio. A consulta pública não é atômica nem assinada: verifica mudanças de head, porém outras alterações concorrentes continuam possíveis. Limites da API, acesso indisponível, paginação e falhas de rede podem impedir verificação.

Limites: 1 MiB por JSON, 100 repositórios, 100 workflows e 200 execuções por repositório. Datas usam o subconjunto UTC com segundos definido no contrato. Não há armazenamento, service worker, telemetria, tokens, credenciais, atualização automática ou workflows de publicação e implantação. O navegador precisa oferecer módulos, diálogo nativo, streams de fetch e downloads Blob. É software em desenvolvimento, sem alegação de prontidão para produção.

## Projeto

- [Contrato](docs/contract.md), [design e checklist](docs/design.md), [alterações](CHANGELOG.md)
- [Contribuição](CONTRIBUTING.md), [segurança](SECURITY.md), [English](README.md)
- Repositório: https://github.com/martinlofranodeoliveira/github-evidence-board
- Contato geral: [site oficial](https://lofranotecnologia.com.br)

Licença MIT. Copyright 2026 Lofrano Tecnologia.
