# infra-lint — ESLint + Prettier (API e Web)

## Contexto

Não existe user story numerada (`DSM-*`) para este item — a demanda veio direto do desenvolvedor
durante a implementação da DSM-1, ao notar que `claude/config/parametros-tecnicos.md` (item 8) já
registrava a decisão de fundo ("adicionar ESLint + Prettier, presets oficiais do Nest e do Next")
sem estar alocada a nenhuma story, e que `npm run lint` falha com `Missing script` tanto em
`api/` quanto em `web/` — não existe `eslint.config.*`/`.eslintrc*`/`.prettierrc*` em nenhum dos
dois pacotes (só dentro de `node_modules`, irrelevante). A própria spec da DSM-1
(`claude/specs/DSM-1/spec.md:158`) já lista "rodar `npm run lint` e `npm test`" como passo antes de
considerar a story pronta — passo que hoje não pode ser executado.

Decisão do desenvolvedor (via `arquiteto-solucoes`, nesta conversa):
1. **Timing:** agora, como pré-requisito de infra — bloqueia o início da DSM-2 até estar concluído.
2. **Execução:** spec pronta para o `desenvolvedor-software` implementar em seguida, nesta mesma
   sessão, antes de seguir para DSM-2.

**Fora de escopo:** regras de lint customizadas além do preset oficial; qualquer alteração de
`strictNullChecks`/`noImplicitAny` do `api/tsconfig.json` ou do `strict` do `web/tsconfig.json`
(parametros-tecnicos, item 8 — escolha deliberada do esqueleto, não mexer sem alinhar); CI/pre-commit
hook (não pedido, fora do escopo do desafio — ver `README.md`, seção "Fora de escopo").

## Arquitetura decidida

Setup mínimo viável, presets oficiais, sem configuração customizada além do necessário para não
conflitar com decisões já tomadas no esqueleto:

- **API (`api/`):** ESLint 9 (flat config, `eslint.config.mjs`) + Prettier, replicando o preset que
  o `@nestjs/cli`/`@nestjs/schematics` gera hoje num `nest new` (conteúdo confirmado lendo
  `api/node_modules/@nestjs/schematics/dist/lib/application/files/ts/{eslint.config.mjs,.prettierrc,package.json}`,
  já presente no projeto como devDependency transitiva) — `@eslint/js` + `typescript-eslint`
  (`recommendedTypeChecked`) + `eslint-plugin-prettier/recommended` + `eslint-config-prettier` +
  `globals`. Único ajuste em relação ao template puro: `ignores` inclui `src/generated/**` (código
  gerado pelo Prisma, `api/src/generated/prisma/`, não deve ser lintado nem formatado).
- **Web (`web/`):** ESLint 9 (flat config) + `eslint-config-next`, preset oficial do Next
  (`next/core-web-vitals` + `next/typescript`). Como o esqueleto atual não tem `eslint-config-next`
  instalado (foi montado sem o preset do `create-next-app`), o conteúdo exato do
  `eslint.config.mjs`/dependências não pôde ser verificado lendo arquivo já presente no repo (ao
  contrário da API) — a instrução de implementação usa o próprio scaffolder oficial do Next como
  fonte da verdade, para não arriscar um `eslint.config.mjs` desatualizado escrito de memória.
- **Prettier:** mesma config em ambos os pacotes (`{ "singleQuote": true, "trailingComma": "all" }`,
  default do preset Nest) — já é o estilo em que o código da DSM-1 foi escrito (aspas simples,
  trailing comma), então não deve gerar diff de reformatação relevante nos arquivos existentes.
- **`@typescript-eslint/no-explicit-any: 'off'`** mantido no preset da API — consistente com
  `noImplicitAny: false` já deliberado em `api/tsconfig.json` (parametros-tecnicos, item 8); o lint
  não pode ficar mais rígido que o `tsconfig` sem alinhar isso à parte.
- Scripts `lint` adicionados em `api/package.json` e `web/package.json`. `desenvolvedor-software`
  roda `npm run lint` (com `--fix` quando aplicável) e resolve qualquer violação nos arquivos já
  existentes da DSM-1 como parte desta própria story de infra — a ideia é que a DSM-2 já comece com
  `npm run lint` limpo, não que herde débito.

## Componentes

### `api/`

| Arquivo | Ação | Conteúdo/responsabilidade |
|---|---|---|
| `api/eslint.config.mjs` | Criar | Flat config, conteúdo abaixo ("Contratos de dados"). |
| `api/.prettierrc` | Criar | `{ "singleQuote": true, "trailingComma": "all" }`. |
| `api/package.json` | Alterar | Adicionar script `"lint": "eslint \"{src,test}/**/*.ts\" --fix"` e `"format": "prettier --write \"src/**/*.ts\""`; adicionar devDependencies: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-prettier`, `eslint-config-prettier`, `globals`, `prettier` (versões: deixar `npm install -D <pacotes>` resolver o range compatível com ESLint 9/Nest 11 — não pinar manualmente; como piso de referência, o template do `@nestjs/schematics` já instalado usa `eslint@^9.18`, `typescript-eslint@^8.20`, `globals@^17`, `prettier@^3.4`, `eslint-plugin-prettier@^5.2`, `eslint-config-prettier@^10.0`, `@eslint/js@^9.18`). |

### `web/`

| Arquivo | Ação | Conteúdo/responsabilidade |
|---|---|---|
| `web/eslint.config.mjs` | Criar | Preset oficial do Next (`next/core-web-vitals`, `next/typescript`). **Procedimento:** gerar num diretório temporário fora do repo com `npx create-next-app@latest tmp-eslint-ref --typescript --eslint --tailwind --app --src-dir=false --import-alias "@/*"` (mesmas flags do esqueleto atual de `web/`), copiar só o `eslint.config.mjs` resultante e as versões de `eslint`/`eslint-config-next` do `package.json` gerado, depois apagar `tmp-eslint-ref`. Não copiar mais nada do scaffold (Tailwind, `next.config.ts`, `postcss.config.mjs` etc. já estão configurados em `web/` e não devem ser sobrescritos). |
| `web/package.json` | Alterar | Adicionar script `"lint": "eslint ."` (ou o script que o `create-next-app` de referência gerar — conferir no `tmp-eslint-ref/package.json` copiado acima, pode variar entre `next lint` e `eslint .` conforme a versão exata do Next 16); adicionar devDependencies `eslint` e `eslint-config-next` com as versões copiadas do scaffold de referência. |

### `claude/config/parametros-tecnicos.md`

| Arquivo | Ação |
|---|---|
| `claude/config/parametros-tecnicos.md` (item 8) | Alterado nesta mesma sessão pelo `arquiteto-solucoes` — decisão de timing/alocação registrada, ver diff já aplicado. |

## Contratos de dados

**`api/eslint.config.mjs`** (conteúdo exato a criar):

```js
// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
```

**`api/.prettierrc`** (conteúdo exato a criar):

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

**`web/eslint.config.mjs`**: conteúdo não fixado aqui de propósito (ver procedimento na tabela de
componentes acima) — deve ser o gerado pelo scaffold oficial do Next na versão instalada
(`next@^16.2.12`, já fixada em `web/package.json`), não um conteúdo escrito de memória nesta spec.

**Scripts esperados ao final** (contrato de saída — o que `desenvolvedor-software` deve conseguir
rodar sem erro):
- `cd api && npm run lint` → executa sem erro de "Missing script"; código-fonte atual (DSM-1) passa
  sem violação (ou violações foram corrigidas como parte desta story).
- `cd web && npm run lint` → idem, sem erro de "Missing script"; `web/app/page.tsx`/`layout.tsx`
  passam sem violação.

**Erros esperados/tratados:** nenhum contrato de runtime novo (não é código de produção) — a única
"falha" relevante é `npm run lint` retornar exit code ≠ 0, que deve ser tratado corrigindo o código
apontado, não suprimindo a regra.

## Sequência de implementação

- [ ] `api/`: adicionar devDependencies (`eslint`, `@eslint/js`, `typescript-eslint`,
      `eslint-plugin-prettier`, `eslint-config-prettier`, `globals`, `prettier`) e rodar
      `npm install`.
- [ ] `api/`: criar `api/eslint.config.mjs` com o conteúdo exato acima.
- [ ] `api/`: criar `api/.prettierrc` com o conteúdo exato acima.
- [ ] `api/`: adicionar scripts `lint` e `format` em `api/package.json`.
- [ ] `api/`: rodar `npm run lint` e corrigir qualquer violação encontrada no código já existente
      da DSM-1 (`src/common`, `src/suppliers`) — objetivo é a DSM-2 começar com lint limpo.
- [ ] `web/`: gerar `eslint.config.mjs` de referência via `create-next-app` num diretório temporário
      (procedimento na tabela de componentes), copiar para `web/eslint.config.mjs`, apagar o
      temporário.
- [ ] `web/`: adicionar devDependencies `eslint` e `eslint-config-next` (versões do scaffold de
      referência) e rodar `npm install`.
- [ ] `web/`: adicionar script `lint` em `web/package.json` (conferir se é `next lint` ou `eslint .`
      no `package.json` do scaffold de referência).
- [ ] `web/`: rodar `npm run lint` e corrigir qualquer violação em `web/app/page.tsx` e
      `web/app/layout.tsx`.
- [ ] Conferir que `cd api && npm test` continua passando (setup de lint não deve alterar
      comportamento de runtime nem quebrar `ts-jest`).
- [ ] Commit: `chore(infra): configura ESLint + Prettier (API e Web)`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Lint rodando em cima do código gerado do Prisma (`api/src/generated/prisma/`) | `ignores: ['src/generated/**']` no `eslint.config.mjs` da API — evita erro/ruído em código que não é escrito pelo time. |
| Lint mais rígido que o `tsconfig` deliberadamente relaxado da API (`noImplicitAny: false`) | `@typescript-eslint/no-explicit-any: 'off'` no preset — não gera violação por uma escolha já tomada no esqueleto (parametros-tecnicos, item 8). |
| Reformatação em massa do código já escrito na DSM-1 (diff grande, ruído em code review) | Prettier configurado com o mesmo estilo já usado no código existente (aspas simples, trailing comma) — diff esperado é mínimo ou zero; se `npm run lint`/`--fix` alterar algo, é parte do commit desta story, não um efeito colateral posterior. |
| `eslint.config.mjs` do Web escrito de memória, divergente da versão real do `eslint-config-next` compatível com Next 16 | Procedimento explícito de gerar via `create-next-app` oficial num diretório temporário e copiar, em vez de fixar o conteúdo nesta spec (diferente da API, cujo conteúdo foi verificado lendo o template já instalado em `node_modules`). |
| Bloqueio da DSM-2 por uma tarefa de infra | Decisão explícita do desenvolvedor (não é suposição do `arquiteto-solucoes`) — story curta e sem dependência de nenhuma DSM anterior além da própria DSM-1 já concluída. |
| `revisor-codigo`/`desenvolvedor-software` das próximas DSMs esquecerem de rodar lint | `claude/config/parametros-tecnicos.md` item 8 já deixa explícito que lint roda antes de considerar qualquer story pronta a partir de agora — não é algo só desta spec. |

## Plano de testes

Não há teste automatizado novo (não é código de produção). Validação manual, como critério de
"pronto" desta story:

- `cd api && npm run lint` termina com exit code `0`.
- `cd web && npm run lint` termina com exit code `0`.
- `cd api && npm test` continua passando (sem regressão causada pelas novas devDependencies/config).
- `cd api && npm run build` continua funcionando (config de lint não deve interferir no build do
  Nest).
- `cd web && npm run build` continua funcionando.
