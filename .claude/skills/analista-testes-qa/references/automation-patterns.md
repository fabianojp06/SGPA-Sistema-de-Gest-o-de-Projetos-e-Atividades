# Padrões de Automação de Testes — SGPA

Consulte este arquivo no **Automation Mode** — ao escrever código de teste automatizado.

Stack de testes do projeto:
- **Vitest** — testes unitários e de integração
- **Playwright** — testes E2E
- **Prisma** — acesso ao banco em testes de integração

---

## Vitest — Testes unitários

### Estrutura padrão de arquivo

```typescript
// src/modules/atividade/__tests__/calcular-progresso.test.ts
import { describe, it, expect } from 'vitest'
import { podeConcluirAtividade } from '../calcular-progresso'

describe('podeConcluirAtividade', () => {
  it('permite conclusão quando progresso é 100%', () => {
    const resultado = podeConcluirAtividade({ progresso: 100 })
    expect(resultado.permitido).toBe(true)
  })

  it('bloqueia conclusão quando progresso é menor que 100%', () => {
    const resultado = podeConcluirAtividade({ progresso: 87 })
    expect(resultado.permitido).toBe(false)
    expect(resultado.motivo).toBe('PROGRESSO_INCOMPLETO')
  })

  it('lança erro quando progresso está fora do range 0-100', () => {
    expect(() => podeConcluirAtividade({ progresso: 130 })).toThrow('Progresso inválido')
  })
})
```

### Regras para testes unitários

- Sem I/O: sem banco, sem rede, sem filesystem
- Um `describe` por módulo/função; um `it` por comportamento
- Nome do `it` descreve o comportamento, não o método: `'bloqueia conclusão quando progresso é menor que 100%'`, não `'testa concluirAtividade'`
- Use tipos de data (`Date`) reais em testes de prazo — nunca strings mal formatadas, igual ao código de produção
- Cubra: caminho feliz + pelo menos 2 cenários negativos + 1 borda por função crítica (RN-01, RN-02, RN-09 em especial)

---

## Vitest — Testes de integração (Server Actions + Banco)

### Setup de ambiente de teste

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup/global-setup.ts',
    setupFiles: ['./tests/setup/test-setup.ts'],
    pool: 'forks', // isolamento entre arquivos de teste
    poolOptions: {
      forks: { singleFork: false }
    }
  }
})
```

```typescript
// tests/setup/global-setup.ts
import { execSync } from 'child_process'

export async function setup() {
  // Rodar migrations no banco de teste (Supabase local ou instância isolada)
  execSync('DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy', {
    stdio: 'inherit'
  })
}

export async function teardown() {
  // Limpeza opcional — o banco de teste é recriado a cada run
}
```

```typescript
// tests/setup/test-setup.ts
import { prisma } from '@/lib/prisma'
import { afterEach } from 'vitest'

afterEach(async () => {
  // Limpar dados entre testes (ordem importa: FK constraints)
  await prisma.$transaction([
    prisma.deadlineChange.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.win.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ])
})
```

### Padrão de fixture de projeto e atividade

```typescript
// tests/fixtures/project.fixture.ts
import { prisma } from '@/lib/prisma'

export async function criarUsuarioFixture(role: 'admin' | 'director' | 'coordinator' | 'technician' = 'technician') {
  return prisma.user.create({
    data: {
      clerkId: `clerk_test_${role}_${Date.now()}`,
      name: `Usuário de teste (${role})`,
      email: `${role}.teste@sgpa.local`,
      role,
    }
  })
}

export async function criarProjetoFixture(overrides: Partial<{ startDate: Date; endDate: Date }> = {}) {
  return prisma.project.create({
    data: {
      code: `SGPA-TEST-${Date.now()}`,
      name: 'Projeto de teste',
      area: 'GIA',
      status: 'ACTIVE',
      startDate: overrides.startDate ?? new Date('2026-01-01'),
      endDate: overrides.endDate ?? new Date('2026-12-31'),
    }
  })
}

export async function criarAtividadeFixture(projectId: string, overrides: Partial<{ dueDate: Date; progress: number }> = {}) {
  return prisma.activity.create({
    data: {
      projectId,
      title: 'Atividade de teste',
      status: 'IN_PROGRESS',
      progress: overrides.progress ?? 50,
      dueDate: overrides.dueDate ?? new Date('2026-06-01'),
    }
  })
}
```

### Teste de integração de Server Action — RN-01 (conclusão exige progresso 100%)

```typescript
// src/modules/atividade/__tests__/concluir-atividade.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { concluirAtividade } from '../actions/concluir-atividade'
import { criarUsuarioFixture, criarProjetoFixture, criarAtividadeFixture } from '@/tests/fixtures/project.fixture'
import { mockClerkAuth } from '@/tests/mocks/clerk.mock'
import { prisma } from '@/lib/prisma'

describe('concluirAtividade — integração', () => {
  let projectId: string
  let activityId: string

  beforeEach(async () => {
    const project = await criarProjetoFixture()
    projectId = project.id
    const user = await criarUsuarioFixture('technician')
    mockClerkAuth({ userId: user.clerkId, role: 'technician' })
  })

  it('conclui atividade e registra auditoria quando progresso é 100%', async () => {
    const activity = await criarAtividadeFixture(projectId, { progress: 100 })

    const resultado = await concluirAtividade({ activityId: activity.id })

    expect(resultado.error).toBeNull()

    const atividadeAtualizada = await prisma.activity.findUnique({ where: { id: activity.id } })
    expect(atividadeAtualizada?.status).toBe('DONE')
    expect(atividadeAtualizada?.completedAt).not.toBeNull()

    // RN-15: toda mutação crítica gera AuditLog
    const log = await prisma.auditLog.findFirst({ where: { entityId: activity.id, action: 'STATUS_CHANGED' } })
    expect(log).not.toBeNull()
  })

  it('rejeita conclusão quando progresso é menor que 100% — RN-01', async () => {
    const activity = await criarAtividadeFixture(projectId, { progress: 87 })

    const resultado = await concluirAtividade({ activityId: activity.id })

    expect(resultado.error).toBe('PROGRESSO_INCOMPLETO')

    // Banco não deve ter sido modificado
    const atividade = await prisma.activity.findUnique({ where: { id: activity.id } })
    expect(atividade?.status).toBe('IN_PROGRESS')
    expect(atividade?.completedAt).toBeNull()
  })
})
```

### Teste de integração — RN-02 (prazo de atividade não pode exceder prazo do projeto)

```typescript
// src/modules/atividade/__tests__/alterar-prazo.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { alterarPrazoAtividade } from '../actions/alterar-prazo'
import { criarProjetoFixture, criarAtividadeFixture } from '@/tests/fixtures/project.fixture'
import { prisma } from '@/lib/prisma'

describe('alterarPrazoAtividade — RN-02 e RN-03', () => {
  it('bloqueia novo prazo posterior ao prazo final do projeto-pai', async () => {
    const project = await criarProjetoFixture({ endDate: new Date('2026-06-30') })
    const activity = await criarAtividadeFixture(project.id, { dueDate: new Date('2026-05-01') })

    const resultado = await alterarPrazoAtividade({
      activityId: activity.id,
      novoPrazo: new Date('2026-07-15'), // depois do prazo do projeto
      justificativa: 'Necessário mais tempo',
    })

    expect(resultado.error).toBe('PRAZO_POSTERIOR_AO_PROJETO')

    const atividade = await prisma.activity.findUnique({ where: { id: activity.id } })
    expect(atividade?.dueDate.toISOString()).toBe(new Date('2026-05-01').toISOString())
  })

  it('rejeita alteração de prazo sem justificativa — RN-03', async () => {
    const project = await criarProjetoFixture({ endDate: new Date('2026-06-30') })
    const activity = await criarAtividadeFixture(project.id, { dueDate: new Date('2026-05-01') })

    const resultado = await alterarPrazoAtividade({
      activityId: activity.id,
      novoPrazo: new Date('2026-05-20'),
      justificativa: '',
    })

    expect(resultado.error).toBe('JUSTIFICATIVA_OBRIGATORIA')
  })

  it('registra DeadlineChange com ator e timestamp quando alteração é válida', async () => {
    const project = await criarProjetoFixture({ endDate: new Date('2026-06-30') })
    const activity = await criarAtividadeFixture(project.id, { dueDate: new Date('2026-05-01') })

    await alterarPrazoAtividade({
      activityId: activity.id,
      novoPrazo: new Date('2026-05-20'),
      justificativa: 'Dependência externa atrasou entrega',
    })

    const change = await prisma.deadlineChange.findFirst({ where: { activityId: activity.id } })
    expect(change?.reason).toBe('Dependência externa atrasou entrega')
    expect(change?.changedById).toBeDefined()
    expect(change?.createdAt).toBeInstanceOf(Date)
  })
})
```

### Teste de RBAC (bloqueio entre perfis)

```typescript
// src/modules/dashboard/__tests__/dashboard-executivo.integration.test.ts
import { describe, it, expect } from 'vitest'
import { getDashboardExecutivo } from '../actions/get-dashboard-executivo'
import { mockClerkAuth } from '@/tests/mocks/clerk.mock'

describe('getDashboardExecutivo — RBAC', () => {
  it('technician não acessa dashboard executivo do director', async () => {
    mockClerkAuth({ userId: 'user_tech_1', role: 'technician' })

    const resultado = await getDashboardExecutivo()

    expect(resultado.error).toBe('NAO_AUTORIZADO')
    expect(resultado.data).toBeNull()
  })

  it('director acessa dashboard executivo normalmente', async () => {
    mockClerkAuth({ userId: 'user_director_1', role: 'director' })

    const resultado = await getDashboardExecutivo()

    expect(resultado.error).toBeNull()
    expect(resultado.data).not.toBeNull()
  })
})
```

### Teste de RN-09 (escalação de WIN repetido) e do job pg_cron

```typescript
// src/modules/win/__tests__/regra-3-semanas.integration.test.ts
import { describe, it, expect } from 'vitest'
import { executarRegra3Semanas } from '@/jobs/regra-3-semanas'
import { prisma } from '@/lib/prisma'
import { criarUsuarioFixture } from '@/tests/fixtures/project.fixture'

describe('Regra das 3 semanas — RN-09', () => {
  it('gera alerta de escalação quando o mesmo WIN se repete por 3 semanas', async () => {
    const user = await criarUsuarioFixture('technician')

    // Simula o mesmo WIN nas semanas 1, 2 e 3 do ano, sempre não concluído
    for (const week of [1, 2, 3]) {
      await prisma.win.create({
        data: {
          userId: user.id,
          weekNumber: week,
          year: 2026,
          title: 'Revisar documento de arquitetura',
          status: 'IN_PROGRESS',
          dueDate: new Date('2026-01-31'),
          repeatCount: week,
        }
      })
    }

    await executarRegra3Semanas({ year: 2026 })

    const winEscalado = await prisma.win.findFirst({
      where: { userId: user.id, weekNumber: 3, year: 2026 }
    })
    expect(winEscalado?.escalated).toBe(true)
  })

  it('não escala WIN concluído dentro das 3 semanas', async () => {
    const user = await criarUsuarioFixture('technician')

    await prisma.win.create({
      data: {
        userId: user.id,
        weekNumber: 1,
        year: 2026,
        title: 'Configurar ambiente de CI',
        status: 'DONE',
        dueDate: new Date('2026-01-10'),
        repeatCount: 1,
      }
    })

    await executarRegra3Semanas({ year: 2026 })

    const win = await prisma.win.findFirst({ where: { userId: user.id, weekNumber: 1, year: 2026 } })
    expect(win?.escalated).toBe(false)
  })

  it('job pg_cron é idempotente — rodar duas vezes não duplica escalação', async () => {
    const user = await criarUsuarioFixture('technician')
    for (const week of [1, 2, 3]) {
      await prisma.win.create({
        data: { userId: user.id, weekNumber: week, year: 2026, title: 'WIN repetido', status: 'IN_PROGRESS', dueDate: new Date('2026-01-31'), repeatCount: week }
      })
    }

    await executarRegra3Semanas({ year: 2026 })
    await executarRegra3Semanas({ year: 2026 }) // segunda execução do dia — não deve duplicar notificação

    const notificacoes = await prisma.auditLog.findMany({ where: { action: 'ESCALATED', entity: 'Win' } })
    expect(notificacoes.length).toBe(1)
  })
})
```

### Teste de geração de pauta via Anthropic API (mock, timeout, fallback)

```typescript
// src/modules/reuniao/__tests__/gerar-pauta.integration.test.ts
import { describe, it, expect, vi } from 'vitest'
import { gerarPautaSemanal } from '../actions/gerar-pauta'
import * as anthropicClient from '@/lib/anthropic/client'

describe('gerarPautaSemanal — integração com Anthropic API', () => {
  it('gera pauta estruturada a partir da resposta da IA (mock)', async () => {
    vi.spyOn(anthropicClient, 'gerarResumoReuniao').mockResolvedValue({
      wins: ['WIN-001: Ambiente de CI configurado'],
      riscos: ['Atraso na entrega do módulo X — nível alto'],
      pedidosDeAjuda: [],
      planoDeAcao: 'PLA-DEP-2026-001',
    })

    const resultado = await gerarPautaSemanal({ weekNumber: 5, year: 2026 })

    expect(resultado.error).toBeNull()
    expect(resultado.data?.wins).toContain('WIN-001: Ambiente de CI configurado')
  })

  it('usa fallback (pauta baseada em template sem IA) quando a Anthropic API falha', async () => {
    vi.spyOn(anthropicClient, 'gerarResumoReuniao').mockRejectedValue(new Error('ANTHROPIC_TIMEOUT'))

    const resultado = await gerarPautaSemanal({ weekNumber: 5, year: 2026 })

    expect(resultado.error).toBeNull() // não falha a operação principal
    expect(resultado.data?.geradoPorFallback).toBe(true)
  })

  it('respeita timeout configurado e não trava a Server Action indefinidamente', async () => {
    vi.spyOn(anthropicClient, 'gerarResumoReuniao').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 30_000))
    )

    const inicio = Date.now()
    const resultado = await gerarPautaSemanal({ weekNumber: 5, year: 2026 })
    const duracao = Date.now() - inicio

    expect(duracao).toBeLessThan(10_000) // timeout interno deve interromper antes de 10s
    expect(resultado.data?.geradoPorFallback).toBe(true)
  })
})
```

---

## Playwright — Testes E2E

### Configuração base

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // SGPA: evitar concorrência entre testes que mutam o mesmo projeto/atividade
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

### Page Object Model (POM)

```typescript
// e2e/pages/atividade.page.ts
import { Page, Locator } from '@playwright/test'

export class AtividadePage {
  readonly page: Page
  readonly inputProgresso: Locator
  readonly btnConcluir: Locator
  readonly mensagemSucesso: Locator
  readonly mensagemErro: Locator

  constructor(page: Page) {
    this.page = page
    this.inputProgresso = page.getByLabel('Progresso (%)')
    this.btnConcluir = page.getByRole('button', { name: 'Marcar como concluída' })
    this.mensagemSucesso = page.getByText('Atividade concluída com sucesso')
    this.mensagemErro = page.getByRole('alert')
  }

  async navegarPara(activityId: string) {
    await this.page.goto(`/atividades/${activityId}`)
  }

  async preencherProgresso(valor: string) {
    await this.inputProgresso.fill(valor)
  }

  async concluir() {
    await this.btnConcluir.click()
  }
}
```

### Teste E2E com autenticação Clerk — RN-01

```typescript
// e2e/concluir-atividade.spec.ts
import { test, expect } from '@playwright/test'
import { AtividadePage } from './pages/atividade.page'
import { autenticarComo } from './helpers/auth.helper'

test.describe('Conclusão de atividade — RN-01', () => {
  test.beforeEach(async ({ page }) => {
    await autenticarComo(page, 'technician') // helper que faz login via Clerk test mode
  })

  test('técnico conclui atividade com progresso 100%', async ({ page }) => {
    const atividadePage = new AtividadePage(page)
    await atividadePage.navegarPara('atividade-id-de-teste')
    await atividadePage.preencherProgresso('100')
    await atividadePage.concluir()

    await expect(atividadePage.mensagemSucesso).toBeVisible()
    await expect(page.getByTestId('status-badge')).toContainText('Concluída')
  })

  test('exibe erro claro quando progresso é menor que 100%', async ({ page }) => {
    const atividadePage = new AtividadePage(page)
    await atividadePage.navegarPara('atividade-id-de-teste')
    await atividadePage.preencherProgresso('80')
    await atividadePage.concluir()

    await expect(atividadePage.mensagemErro).toContainText('progresso deve ser 100%')
    await expect(page.getByTestId('status-badge')).toContainText('Em andamento')
  })
})
```

### Teste E2E de Supabase Realtime

```typescript
// e2e/dashboard-realtime.spec.ts
import { test, expect, chromium } from '@playwright/test'
import { autenticarComo } from './helpers/auth.helper'

test('dashboard atualiza WIN em tempo real sem reload — Supabase Realtime', async ({ browser }) => {
  // Duas sessões: uma exibindo o dashboard, outra registrando um WIN
  const contextoDashboard = await browser.newContext()
  const paginaDashboard = await contextoDashboard.newPage()
  await autenticarComo(paginaDashboard, 'coordinator')
  await paginaDashboard.goto('/dashboard')

  const contextoRegistro = await browser.newContext()
  const paginaRegistro = await contextoRegistro.newPage()
  await autenticarComo(paginaRegistro, 'technician')
  await paginaRegistro.goto('/wins/novo')
  await paginaRegistro.getByLabel('Título do WIN').fill('Deploy da feature X concluído')
  await paginaRegistro.getByRole('button', { name: 'Registrar WIN' }).click()

  // O dashboard deve refletir o novo WIN sem que a página seja recarregada
  await expect(paginaDashboard.getByText('Deploy da feature X concluído')).toBeVisible({ timeout: 5000 })
})
```

---

## Checklist antes de commitar testes

- [ ] Testes são determinísticos — mesmo resultado em toda execução
- [ ] Nenhum teste depende da ordem de execução de outro
- [ ] Fixtures criam e destroem seus próprios dados (não dependem de dados pré-existentes)
- [ ] Todo teste de integração verifica o estado do banco, não apenas o retorno da função
- [ ] Todo teste que envolve permissão declara explicitamente qual perfil (role) está em contexto
- [ ] Testes E2E usam `data-testid` para seletores críticos — não texto que pode mudar
- [ ] Chamadas à Anthropic API são sempre mockadas em testes automatizados — nunca custo real de API em CI
- [ ] Nenhum `test.only` ou `it.only` commitado (quebra CI silenciosamente)
