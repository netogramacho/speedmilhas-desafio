# DSM-1 — Cliente HTTP e normalizador do Fornecedor A

## Contexto

User story: `claude/specs/DSM-1/user-story.md`.

O serviço de busca precisa consultar o Fornecedor A (`GET /supplier-a/quotes` no `mock-suppliers`,
porta 4000) e converter a resposta (`{ results: [{ miles, taxes_brl, carrier }] }`) para o formato
interno único de cotação, sem nunca lançar exceção não tratada — nem em erro 500, nem em timeout.
Esta é a primeira DSM implementada no projeto: `api/src/` hoje só tem `app.module.ts` (vazio de
propósito) e `main.ts` (com `dotenv` solto). As decisões de arquitetura compartilhadas com DSM-2/
DSM-3 (cliente HTTP, timeout, estrutura de módulos) já estavam fixadas em
`claude/config/parametros-tecnicos.md`; os pontos que não estavam fixados foram decididos com o
desenvolvedor nesta conversa (contrato de falha classificada, `ConfigModule` já nesta story, Logger
built-in em vez de `nestjs-pino` por ora).

**Fora de escopo (mantido conforme a story):** agregação com os outros fornecedores, ordenação
final, endpoint HTTP `POST /search` (DSM-4/DSM-5). Retry automático para erro 500 do fornecedor A
(decisão registrada abaixo e em `DECISIONS.md`).

## Arquitetura decidida

- **Cliente HTTP:** `@nestjs/axios` (`HttpModule`), timeout por chamada = `SUPPLIER_TIMEOUT_MS`
  (default `5000`), configurado uma única vez num módulo compartilhado (`SuppliersHttpModule`) para
  ser reaproveitado por DSM-2/DSM-3.
- **Configuração:** `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) introduzido já
  nesta story, com `validate` customizado (sem lib de schema nova como `joi`/`zod`) que falha rápido
  se `SUPPLIERS_BASE_URL` estiver ausente e normaliza/valida `SUPPLIER_TIMEOUT_MS`. Acesso via
  `ConfigService` injetado, nunca `process.env` direto nos providers (parametros-tecnicos, item 6).
  `DATABASE_URL` **não** entra na validação desta story — fica para quando Prisma for tocado
  (DSM-6+).
- **Resultado do client:** união discriminada `SupplierQuoteResult` com falha **classificada**
  (`reason: 'timeout' | 'http_error' | 'unknown_error'`) — decisão do desenvolvedor, pensando que a
  DSM-4 vai precisar diferenciar "não respondeu a tempo" de "falhou" na resposta agregada (RF1,
  `README.md`).
- **Logging:** `Logger` built-in do `@nestjs/common` (não `nestjs-pino` nesta story) — um log por
  chamada ao fornecedor A com outcome, motivo (se falha) e latência. Migração para `nestjs-pino`
  fica para DSM-14/story de infra, sem impacto de contrato aqui (é só troca do transporte de log).
- **Sem retry automático** para erro 500 do fornecedor A — mantém o comportamento explícito da
  story; já está registrado como decisão em `DECISIONS.md` (retry só existe para 429 do fornecedor
  B, escopo da DSM-2).
- **Sem validação defensiva item a item** do payload 200 do fornecedor A (isso é problema
  específico do fornecedor C, DSM-3) — mas o método inteiro (chamada + normalização) fica dentro do
  mesmo `try/catch`, então qualquer formato inesperado vira falha `unknown_error` em vez de exceção
  não tratada, sem precisar de lógica de validação extra.

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/common/config/validate-env.ts` | Função `validateEnv(config)` usada pelo `ConfigModule.forRoot({ validate })`: falha rápido se `SUPPLIERS_BASE_URL` ausente; valida/normaliza `SUPPLIER_TIMEOUT_MS` (número positivo, default `5000`). |
| `api/src/suppliers/types.ts` | Formato interno único de cotação e o contrato de resultado por fornecedor (`Quote`, `SupplierId`, `CarrierName`, `SupplierFailureReason`, `SupplierFailure`, `SupplierQuoteResult`, `SupplierQuoteQuery`). Compartilhado com DSM-2/DSM-3. |
| `api/src/suppliers/suppliers-http.module.ts` | `SuppliersHttpModule`: registra `HttpModule.registerAsync` uma única vez com `baseURL` (`SUPPLIERS_BASE_URL`) e `timeout` (`SUPPLIER_TIMEOUT_MS`) via `ConfigService`. Exporta `HttpModule`. Importado por `supplier-a`/`supplier-b`/`supplier-c` modules. |
| `api/src/suppliers/supplier-a/supplier-a.types.ts` | Tipos do payload cru do fornecedor A (`SupplierARawResponse`, `SupplierARawItem`) — não vazam para fora do client/normalizer. |
| `api/src/suppliers/supplier-a/supplier-a.normalizer.ts` | Função pura `normalizeSupplierA(raw: SupplierARawResponse): Quote[]` — mapeia `miles`→`miles`, `taxes_brl`→`taxesBrl`, `carrier`→`carrier` (passthrough, já vem por extenso), tag `supplier: 'supplier-a'`. Loga (via `Logger` injetado ou passado) warning se `carrier` não for um dos valores conhecidos (`LATAM`/`GOL`/`AZUL`), mas não descarta o item. |
| `api/src/suppliers/supplier-a/supplier-a.client.ts` | `SupplierAClient` (`@Injectable`): método `getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult>`. Monta `GET /supplier-a/quotes` com `params: { origin, destination, date }` (nomes do fornecedor A), chama via `HttpService` (`firstValueFrom`), normaliza em sucesso, classifica erro em falha. Nunca lança. |
| `api/src/suppliers/supplier-a/supplier-a.module.ts` | `SupplierAModule`: importa `SuppliersHttpModule`, provê e exporta `SupplierAClient`. |
| `api/src/suppliers/supplier-a/supplier-a.normalizer.spec.ts` | Testes unitários do normalizador (função pura, sem mocks de rede). |
| `api/src/suppliers/supplier-a/supplier-a.client.spec.ts` | Testes unitários do client, mockando `HttpService` via DI (`@nestjs/testing`), sem chamada de rede real. |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/package.json` | Adicionar dependências: `@nestjs/axios`, `@nestjs/config`, `axios` (peer dep do `@nestjs/axios`). |
| `api/.env.example` | Adicionar `SUPPLIER_TIMEOUT_MS=5000` (mantém `SUPPLIERS_BASE_URL` e `DATABASE_URL` como já estão). |
| `api/src/app.module.ts` | Importar `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` e `SupplierAModule`. `app.module.spec.ts` (existente, trivial) continua validando que o módulo compila — depende de `api/.env` existir localmente com `SUPPLIERS_BASE_URL` setado, o que já é pré-requisito do projeto (`README.md`, seção 1). |
| `api/src/main.ts` | Pode manter o `import 'dotenv/config'` por enquanto (não conflita com `ConfigModule.forRoot()`, que também lê `.env`); não é obrigatório remover nesta story. |

## Contratos de dados

```ts
// api/src/suppliers/types.ts

export type SupplierId = 'supplier-a' | 'supplier-b' | 'supplier-c';

export type CarrierName = 'LATAM' | 'GOL' | 'AZUL';

export interface Quote {
  miles: number;
  taxesBrl: number;
  carrier: CarrierName | string; // string: passthrough defensivo p/ nome de companhia não mapeado
  supplier: SupplierId;
}

export type SupplierFailureReason = 'timeout' | 'http_error' | 'unknown_error';

export interface SupplierFailure {
  supplier: SupplierId;
  reason: SupplierFailureReason;
  message: string;
  httpStatus?: number; // presente só quando reason === 'http_error'
}

export type SupplierQuoteResult =
  | { ok: true; supplier: SupplierId; quotes: Quote[] }
  | { ok: false; supplier: SupplierId; failure: SupplierFailure };

export interface SupplierQuoteQuery {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD, já validado por quem chama (fora do escopo desta story)
}
```

```ts
// api/src/suppliers/supplier-a/supplier-a.types.ts

export interface SupplierARawItem {
  miles: number;
  taxes_brl: number;
  carrier: string;
}

export interface SupplierARawResponse {
  results: SupplierARawItem[];
}
```

**Classificação de erro** (dentro do `catch` do `SupplierAClient.getQuotes`):
- `err` é `AxiosError` com `err.code === 'ECONNABORTED'` → `reason: 'timeout'` (comportamento padrão
  do timeout do axios, conforme decisão já fixada de usar o timeout nativo da request, sem
  `AbortController` manual).
- `err` é `AxiosError` com `err.response` presente (qualquer status, 4xx ou 5xx) → `reason:
  'http_error'`, `httpStatus: err.response.status`.
- Qualquer outro caso (erro de rede sem resposta, erro de parsing/normalização, exceção não-Axios)
  → `reason: 'unknown_error'`.
- `message` sempre populado com `err instanceof Error ? err.message : String(err)` — nunca uma
  frase fixa em português hardcoded no código (parametros-tecnicos, item 15: este campo é só para
  log/diagnóstico interno, não é texto exibido ao usuário final; o frontend nunca lê `message`
  diretamente, só `reason`).

## Sequência de implementação

- [ ] Adicionar `@nestjs/axios`, `@nestjs/config`, `axios` em `api/package.json` e rodar
      `npm install`.
- [ ] Criar `api/src/common/config/validate-env.ts` com `validateEnv` (valida `SUPPLIERS_BASE_URL`
      obrigatório; normaliza `SUPPLIER_TIMEOUT_MS` para número positivo, default `5000`).
- [ ] Atualizar `api/src/app.module.ts` para importar `ConfigModule.forRoot({ isGlobal: true,
      validate: validateEnv })`.
- [ ] Adicionar `SUPPLIER_TIMEOUT_MS=5000` em `api/.env.example` (e orientar copiar para
      `api/.env` local, se ainda não existir).
- [ ] Criar `api/src/suppliers/types.ts` com os contratos acima (`Quote`, `SupplierQuoteResult`
      etc.) — vai ser reaproveitado por DSM-2/DSM-3.
- [ ] Criar `api/src/suppliers/suppliers-http.module.ts` (`SuppliersHttpModule`) com
      `HttpModule.registerAsync` lendo `baseURL`/`timeout` do `ConfigService`.
- [ ] Criar `api/src/suppliers/supplier-a/supplier-a.types.ts` (payload cru).
- [ ] Criar `api/src/suppliers/supplier-a/supplier-a.normalizer.ts` (função pura de mapeamento).
- [ ] Criar `api/src/suppliers/supplier-a/supplier-a.client.ts` (`SupplierAClient.getQuotes`),
      com try/catch cobrindo chamada HTTP + normalização, e log via `Logger` do `@nestjs/common`
      (outcome, reason se falha, latência da chamada).
- [ ] Criar `api/src/suppliers/supplier-a/supplier-a.module.ts` (`SupplierAModule`).
- [ ] Registrar `SupplierAModule` em `api/src/app.module.ts`.
- [ ] Escrever `supplier-a.normalizer.spec.ts` (função pura).
- [ ] Escrever `supplier-a.client.spec.ts` (mock de `HttpService` via DI).
- [ ] Rodar `npm run lint` e `npm test` em `api/` antes de considerar a story pronta.
- [ ] Commit: `feat(DSM-1): client e normalizador do fornecedor A`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Timeout do fornecedor A (>`SUPPLIER_TIMEOUT_MS`) | Timeout nativo do axios (`ECONNABORTED`) configurado no `HttpModule.registerAsync`; classificado como `reason: 'timeout'`, nunca propaga exceção. |
| Erro 500 do fornecedor A | Capturado no `catch`, classificado como `reason: 'http_error'`, `httpStatus: 500`; busca segue sem esse fornecedor. |
| Outro erro HTTP (ex.: 400, se algum parâmetro chegar inválido até aqui) | Mesmo branch de `http_error` genérico — não é exigido pela AC como caso separado, mas o comportamento (falha isolada, sem exceção) é o mesmo. |
| Payload 200 malformado/inesperado (campo faltando, tipo errado) | Não exigido pela AC para o fornecedor A (README indica que só o C é "sujo" — 0% de sujeira documentada para A). Ainda assim, como a normalização roda dentro do mesmo `try/catch` da chamada HTTP, qualquer erro de parsing vira `reason: 'unknown_error'` em vez de exceção não tratada. |
| `carrier` fora do enum conhecido (`LATAM`/`GOL`/`AZUL`) | Não descartado (não é requisito de descarte aqui, diferente da DSM-3); passa como veio (`string`), com log de warning — evita perder uma cotação válida por causa de um nome de companhia novo. |
| `SUPPLIERS_BASE_URL` ausente no ambiente | `ConfigModule.forRoot({ validate })` falha no boot da aplicação com mensagem clara, em vez de `undefined` silencioso chegando no axios. |
| Duas instâncias da API em paralelo (RF2, portas diferentes) | Não afeta esta story — `SupplierAClient` é stateless, sem estado compartilhado em memória entre requisições. |
| `AppModule` trivial spec (`app.module.spec.ts`) | Continua passando desde que `api/.env` exista localmente com `SUPPLIERS_BASE_URL` setado — já é pré-requisito documentado do projeto (README, seção 1; parametros-tecnicos, item 13). |
| Retry automático em erro 500 | Deliberadamente **não implementado** nesta story (decisão já tomada na própria user story); registrar em `DECISIONS.md` se ainda não estiver. |

## Plano de testes

Todos os testes desta story são unitários (`*.spec.ts`, colocados junto do arquivo testado),
mockando `HttpService` via DI — sem chamada de rede real (parametros-tecnicos, item 11).

**`supplier-a.normalizer.spec.ts`**
- Mapeia corretamente um `results` com múltiplos itens: `miles` (número), `taxesBrl` (número, de
  `taxes_brl`), `carrier` (passthrough), `supplier: 'supplier-a'` em cada item.
- `results: []` → retorna `[]` (não lança, não é erro).
- Item com `carrier` fora do enum conhecido → mapeado normalmente (não descartado), sem lançar.

**`supplier-a.client.spec.ts`**
- **Query string correta:** dado `origin`/`destination`/`date` válidos, verifica que
  `httpService.get` foi chamado com `/supplier-a/quotes` e
  `{ params: { origin, destination, date } }` — exatamente os nomes exigidos pela AC.
- **Sucesso 200:** mock de `HttpService.get` retornando `of({ data: { results: [...] } })` (RxJS) →
  client devolve `{ ok: true, supplier: 'supplier-a', quotes: [...] }` com os itens normalizados.
- **Erro 500:** mock retornando `throwError(() => axiosErrorComResponse(500))` → client devolve
  `{ ok: false, supplier: 'supplier-a', failure: { reason: 'http_error', httpStatus: 500,
  message } }`, sem lançar exceção para quem chamou.
- **Timeout:** mock retornando `throwError(() => axiosErrorComCode('ECONNABORTED'))` → client
  devolve `{ ok: false, failure: { reason: 'timeout', ... } }`, sem lançar.
- **Erro desconhecido/rede:** mock retornando `throwError(() => new Error('network down'))` (sem
  `response` nem `code: 'ECONNABORTED'`) → `{ ok: false, failure: { reason: 'unknown_error', ... }
  }`.
- Todos os cenários de falha: o teste garante explicitamente que a Promise **resolve** (não
  rejeita) — é o critério de aceite mais importante da story ("não lança exceção não tratada").

Fora do escopo de teste automatizado desta story (fica para DSM-4): agregação com outros
fornecedores, corrida contra o teto global de 6s, ordenação final.
