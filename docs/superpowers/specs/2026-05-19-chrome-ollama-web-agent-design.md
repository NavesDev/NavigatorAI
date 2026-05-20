# Chrome Ollama Web Agent - Design

## Objetivo

Criar uma extensao do Chrome capaz de executar tarefas na web usando um modelo local via Ollama. O usuario descreve uma tarefa em linguagem natural, a extensao le a pagina atual, consulta o Ollama e executa a proxima acao no navegador.

A primeira versao deve priorizar controle, previsibilidade e configuracao. A extensao tera permissao ampla para atuar em sites (`<all_urls>`), mas usara confirmacoes, politicas de seguranca e opcoes configuraveis para limitar a execucao de acoes sensiveis.

## Escopo Inicial

Incluido no MVP:

- Extensao Chrome Manifest V3.
- Interface principal em painel lateral do Chrome.
- Integracao com Ollama local por endpoint configuravel.
- Leitura da pagina atual por content script.
- Representacao compacta do DOM para envio ao modelo.
- Execucao de acoes estruturadas retornadas pelo Ollama.
- Modo hibrido: confirmacao por padrao, com opcao de autonomia por tarefa ou dominio.
- Suporte a cliques, preenchimento de campos, rolagem, navegacao, extracao de dados, edicao de DOM e injecao de scripts.
- Configuracao para desativar completamente injecao de scripts.
- Historico basico das acoes executadas e seus resultados.

Fora do MVP:

- Publicacao na Chrome Web Store.
- Sincronizacao em nuvem.
- Execucao multi-aba complexa.
- Login proprio ou contas de usuario.
- Automacao em paginas internas do Chrome, como `chrome://`.

## Experiencia do Usuario

O usuario abre o painel lateral da extensao, informa uma tarefa e acompanha o progresso. A extensao mostra cada acao planejada antes da execucao quando a politica exigir confirmacao.

Exemplo de tarefa:

> Entre no site atual, encontre o formulario de contato, preencha com meus dados e me avise antes de enviar.

O painel lateral deve conter:

- Campo para descrever a tarefa.
- Botao para iniciar, pausar e parar a tarefa.
- Estado atual da automacao.
- Proxima acao proposta pelo modelo.
- Botoes para aprovar, rejeitar ou editar a acao.
- Historico resumido das acoes.
- Acesso as configuracoes.

## Permissoes

A extensao usara permissao ampla de host:

```json
{
  "host_permissions": ["<all_urls>"]
}
```

Essa permissao permite que a extensao atue em praticamente qualquer pagina permitida pelo Chrome. Mesmo assim, algumas paginas continuam bloqueadas ou limitadas pelo navegador, como paginas internas `chrome://`, Chrome Web Store e contextos protegidos.

Permissoes esperadas:

- `sidePanel`: exibir interface principal.
- `activeTab`: interagir com a aba ativa quando aplicavel.
- `scripting`: injetar content scripts e executar scripts permitidos.
- `storage`: salvar configuracoes e historico local.
- `tabs`: consultar aba atual e navegar quando autorizado.

## Configuracoes

A extensao deve permitir configurar:

- Endpoint do Ollama, por exemplo `http://localhost:11434`.
- Modelo usado, por exemplo `llama3.1`, `qwen2.5` ou outro modelo instalado.
- Temperatura.
- Limite de tokens ou tamanho maximo do contexto.
- Timeout das chamadas ao Ollama.
- Modo de execucao:
  - confirmacao para cada acao sensivel;
  - autonomo somente na tarefa atual;
  - autonomo para dominios confiaveis.
- Lista de dominios bloqueados.
- Lista de dominios confiaveis.
- Envio maximo de HTML/DOM ao modelo.
- Permitir ou bloquear edicao de DOM.
- Permitir ou bloquear injecao de scripts.

### Politica de Injecao de Scripts

A opcao `Permitir injecao de scripts` controla se a acao `inject_script` pode ser executada.

Quando desativada:

- qualquer acao `inject_script` retornada pelo modelo e rejeitada antes da execucao;
- o painel informa que o modelo tentou usar script, mas a capacidade esta desativada;
- o resultado enviado de volta ao Ollama deve explicar que scripts estao proibidos e pedir uma alternativa com acoes estruturadas.

Quando ativada:

- `inject_script` ainda pode exigir confirmacao;
- a politica pode limitar scripts a dominios confiaveis;
- o modo autonomo nao deve ignorar bloqueios globais;
- o script deve ser exibido ao usuario antes da execucao quando houver confirmacao.

## Arquitetura

### Componentes

#### Side Panel

Interface principal da extensao. Responsavel por receber tarefas, mostrar status, exibir acoes propostas, pedir confirmacao e permitir configuracoes.

#### Service Worker

Orquestrador central da extensao. Responsavel por:

- manter estado da tarefa;
- conversar com o Ollama;
- enviar comandos para content scripts;
- validar politicas antes da execucao;
- registrar historico;
- tratar erros e timeouts.

#### Content Script

Roda no contexto das paginas permitidas. Responsavel por:

- ler a pagina;
- criar um mapa de elementos interativos;
- executar acoes como clique, digitacao, scroll e leitura;
- editar DOM quando permitido;
- injetar scripts quando permitido;
- retornar resultado da acao ao service worker.

#### Page Analyzer

Modulo que transforma a pagina em uma representacao compacta para o modelo. Deve evitar enviar HTML bruto completo quando nao for necessario.

A representacao deve incluir:

- titulo da pagina;
- URL;
- texto visivel relevante;
- formularios e campos;
- botoes e links visiveis;
- elementos interativos com identificadores estaveis;
- mensagens de erro ou sucesso visiveis;
- contexto de foco atual.

#### Action Executor

Modulo responsavel por validar e executar acoes. Ele deve aceitar somente tipos conhecidos de acao e rejeitar qualquer JSON invalido, incompleto ou proibido pela politica atual.

#### Safety Layer

Camada de seguranca aplicada antes da execucao. Responsavel por:

- exigir confirmacao para acoes sensiveis;
- bloquear dominios proibidos;
- bloquear scripts quando a opcao estiver desativada;
- impedir envio de campos sensiveis ao modelo;
- registrar decisoes;
- interromper a tarefa quando houver risco ou erro repetido.

## Fluxo de Execucao

1. Usuario abre o painel lateral.
2. Usuario descreve uma tarefa.
3. Service worker solicita ao content script o estado da pagina.
4. Content script retorna uma representacao compacta da pagina.
5. Service worker monta o prompt com tarefa, contexto, configuracoes e acoes permitidas.
6. Ollama retorna uma resposta JSON com a proxima acao.
7. Service worker valida o JSON.
8. Safety Layer decide se a acao pode executar, se precisa confirmacao ou se deve ser bloqueada.
9. Content script executa a acao aprovada.
10. Resultado da acao volta para o service worker.
11. Service worker envia o novo estado ao Ollama.
12. O ciclo continua ate a tarefa ser concluida, falhar ou o usuario parar.

## Contrato com o Modelo

O Ollama deve responder em JSON. Texto livre pode ser usado apenas como explicacao dentro de campos definidos.

Formato base:

```json
{
  "thought": "Explicacao curta da decisao.",
  "action": {
    "type": "click",
    "target": {
      "elementId": "el_12",
      "selector": "button[type='submit']"
    }
  },
  "requiresConfirmation": true
}
```

### Acoes Permitidas

#### `read_page`

Solicita nova leitura da pagina.

```json
{
  "action": {
    "type": "read_page"
  }
}
```

#### `click`

Clica em um elemento.

```json
{
  "action": {
    "type": "click",
    "target": {
      "elementId": "el_12"
    }
  }
}
```

#### `type`

Preenche texto em input, textarea ou elemento editavel.

```json
{
  "action": {
    "type": "type",
    "target": {
      "elementId": "el_20"
    },
    "text": "conteudo"
  }
}
```

#### `select`

Seleciona uma opcao.

```json
{
  "action": {
    "type": "select",
    "target": {
      "elementId": "el_21"
    },
    "value": "br"
  }
}
```

#### `scroll`

Rola a pagina ou um elemento.

```json
{
  "action": {
    "type": "scroll",
    "direction": "down",
    "amount": 600
  }
}
```

#### `wait`

Aguarda tempo ou mudanca na pagina.

```json
{
  "action": {
    "type": "wait",
    "milliseconds": 1000
  }
}
```

#### `navigate`

Navega para uma URL.

```json
{
  "action": {
    "type": "navigate",
    "url": "https://example.com"
  }
}
```

#### `extract`

Extrai dados da pagina.

```json
{
  "action": {
    "type": "extract",
    "fields": ["titulo", "preco", "descricao"]
  }
}
```

#### `edit_dom`

Edita texto, atributo ou HTML de um elemento quando permitido.

```json
{
  "action": {
    "type": "edit_dom",
    "target": {
      "elementId": "el_30"
    },
    "operation": "setText",
    "value": "Novo texto"
  },
  "requiresConfirmation": true
}
```

#### `inject_script`

Injeta JavaScript na pagina atual quando a capacidade estiver ativada.

```json
{
  "action": {
    "type": "inject_script",
    "script": "document.querySelector('button')?.click();",
    "reason": "O elemento nao respondeu ao clique estruturado."
  },
  "requiresConfirmation": true
}
```

Se `inject_script` estiver desativado, essa acao deve ser rejeitada sem executar nenhum codigo.

#### `finish`

Encerra a tarefa com sucesso ou falha explicada.

```json
{
  "action": {
    "type": "finish",
    "status": "success",
    "message": "Tarefa concluida."
  }
}
```

## Prompt do Modelo

O prompt enviado ao Ollama deve incluir:

- tarefa do usuario;
- URL e titulo da pagina;
- resumo do estado atual;
- lista de elementos interativos;
- acoes disponiveis;
- politicas ativas;
- informacao explicita se `inject_script` esta permitido ou proibido;
- instrucao para responder somente JSON valido;
- historico recente de acoes e resultados.

Exemplo de regra no prompt:

```text
Voce deve responder somente JSON valido. A acao inject_script esta DESATIVADA nesta tarefa. Nao proponha inject_script. Use click, type, select, scroll, wait, read_page, navigate, extract, edit_dom ou finish.
```

Quando script estiver permitido:

```text
A acao inject_script esta ATIVADA, mas deve ser usada apenas quando acoes estruturadas nao forem suficientes. Sempre inclua reason e requiresConfirmation=true para inject_script.
```

## Seguranca e Privacidade

A extensao deve tratar a automacao como operacao sensivel.

Regras obrigatorias:

- Nunca executar JSON invalido.
- Nunca executar tipo de acao desconhecido.
- Nunca executar `inject_script` quando a opcao estiver desativada.
- Nunca enviar senhas, tokens, campos de cartao ou campos marcados como sensiveis ao Ollama.
- Exigir confirmacao para envio de formularios, compras, exclusoes, alteracoes de conta, downloads, uploads e navegacao sensivel.
- Permitir parar a tarefa imediatamente pelo painel.
- Manter historico local das acoes.
- Limitar tamanho do DOM enviado ao modelo.
- Preferir identificadores internos de elementos em vez de seletores fragilizados.
- Revalidar o elemento antes de executar a acao, garantindo que ele ainda existe e esta visivel.

## Tratamento de Erros

Erros esperados:

- Ollama indisponivel.
- Modelo nao encontrado.
- Timeout na resposta.
- Resposta que nao e JSON valido.
- Acao desconhecida.
- Acao bloqueada por politica.
- Elemento nao encontrado.
- Pagina mudou durante a execucao.
- Script bloqueado por configuracao.
- Content script sem permissao na pagina atual.

Comportamento:

- Mostrar erro claro no painel.
- Registrar erro no historico.
- Enviar ao Ollama apenas erros recuperaveis.
- Parar apos numero configuravel de tentativas repetidas.
- Sugerir ao usuario alterar configuracao quando a tarefa depender de uma capacidade desativada.

## Testes

Testes recomendados:

- Validacao de schemas de acoes.
- Bloqueio de `inject_script` quando desativado.
- Execucao de `inject_script` somente quando ativado e confirmado.
- Confirmacao obrigatoria para acoes sensiveis.
- Extracao de elementos interativos de paginas simples.
- Execucao de clique e digitacao em pagina de teste.
- Tratamento de resposta invalida do Ollama.
- Timeout e indisponibilidade do Ollama.
- Nao envio de campos sensiveis ao modelo.
- Bloqueio em dominios proibidos.

## Estrutura Inicial de Arquivos

Estrutura sugerida:

```text
extension/
  manifest.json
  src/
    background/
      service-worker.ts
      task-runner.ts
      ollama-client.ts
      safety-policy.ts
    content/
      content-script.ts
      page-analyzer.ts
      action-executor.ts
      dom-map.ts
    sidepanel/
      index.html
      sidepanel.tsx
      settings.tsx
    shared/
      action-schema.ts
      config.ts
      messages.ts
      sensitive-fields.ts
```

## Decisoes Tomadas

- A interface principal sera o painel lateral do Chrome.
- A extensao usara Ollama local, com endpoint e modelo configuraveis.
- A extensao usara `host_permissions: ["<all_urls>"]`.
- O modo de operacao sera hibrido: confirmacao por padrao, autonomia configuravel por tarefa ou dominio.
- O modelo deve retornar acoes estruturadas em JSON.
- A acao `inject_script` existira, mas podera ser desativada completamente nas configuracoes.
- Se `inject_script` estiver desativado, a extensao rejeita a acao antes de executar qualquer codigo.

## Perguntas Futuras

- Qual framework sera usado no painel lateral: React, Vue, Svelte ou HTML simples?
- A extensao sera escrita em TypeScript desde o inicio?
- O historico deve ser apenas local ou exportavel?
- Quais dominios devem ser bloqueados por padrao?
- Quais modelos Ollama serao recomendados inicialmente?
- A extensao deve suportar anexos, arquivos ou screenshots em versoes futuras?
