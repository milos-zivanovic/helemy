import { expect, type Page, test } from '@playwright/test'

import { tr } from './i18n.ts'

// The main path through the app, end to end: sign up, a savings account, an income, an expense, a
// transfer to the savings account, the balances on every screen, then log out and back in.
//
// Seeded by the API on sign up (finances.services.create_default_finances):
const DEFAULT_ACCOUNT = 'Tekući račun'
const INCOME_CATEGORY = 'Mesečna plata'
const EXPENSE_CATEGORY = 'Hrana, piće i kućna hemija'

const SAVINGS = 'Štednja'
const PASSWORD = 'Smoke-test-2026!'

/**
 * An amount formatted the way the app shows it (useFormatters().formatMoney in Serbian, RSD).
 * Computed in the browser, so it uses the browser's own Intl data, exactly like the app.
 */
function money(page: Page, amount: number): Promise<string> {
  return page.evaluate(
    (value) =>
      new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' }).format(value),
    amount,
  )
}

/** The big "Total balance" number (home, transactions and accounts pages). */
const totalBalance = (page: Page) =>
  page
    .getByText(tr('finances.accounts.total'), { exact: true })
    .locator('xpath=following-sibling::p[1]')

/** The value of a stat tile, found by its label ("Prihodi" → "100.000 RSD"). */
const statTile = (page: Page, labelKey: string) =>
  page
    .locator('dt')
    .getByText(tr(labelKey), { exact: true })
    .locator('xpath=following-sibling::dd[1]')

/** A link in a navigation bar (main menu, finance tabs); the logo also links home, hence the scope. */
const navLink = (page: Page, key: string) =>
  page.getByRole('navigation').getByRole('link', { name: tr(key), exact: true })

/** A row in a list (transactions, accounts): every row is a link to its detail page. */
const row = (page: Page, text: string) => page.getByRole('link').filter({ hasText: text })

/** Expense or income through the "new transaction" form, opened from the transaction list. */
async function addTransaction(
  page: Page,
  entry: { kind: 'income' | 'expense'; title: string; amount: string; category: string },
) {
  await page.getByRole('link', { name: tr('finances.transactions.new') }).click()
  await chooseKind(page, entry.kind)
  await page.getByLabel(tr('finances.fields.title'), { exact: true }).fill(entry.title)
  await page.getByLabel(tr('finances.fields.amount'), { exact: true }).fill(entry.amount)
  await page
    .getByLabel(tr('finances.fields.category'), { exact: true })
    .selectOption({ label: entry.category })
  await page
    .getByLabel(tr('finances.fields.account'), { exact: true })
    .selectOption({ label: DEFAULT_ACCOUNT })
  await page.getByRole('button', { name: tr('common.save') }).click()
  await expect(page).toHaveURL(/\/finances\/transactions(\?|$)/) // back to the list
}

/** The expense / income / transfer toggle: radio buttons inside a fieldset named "Vrsta". */
async function chooseKind(page: Page, kind: 'income' | 'expense' | 'transfer') {
  await page
    .getByRole('group', { name: tr('finances.fields.type') })
    .getByText(tr(`finances.types.${kind}`), { exact: true })
    .click()
}

test('sign up, savings account, income, expense and transfer', async ({ page }) => {
  const email = `smoke-${Date.now()}@example.com` // unique, so a rerun never hits "email taken"

  await test.step('sign up', async () => {
    await page.goto('/register')
    await page.getByLabel(tr('auth.fields.email'), { exact: true }).fill(email)
    await page.getByLabel(tr('auth.fields.firstName'), { exact: true }).fill('Smoke')
    await page.getByLabel(tr('auth.fields.lastName'), { exact: true }).fill('Test')
    await page.getByLabel(tr('auth.fields.password'), { exact: true }).fill(PASSWORD)
    await page.getByLabel(tr('auth.fields.passwordConfirm'), { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: tr('auth.register.submit') }).click()

    // Logged in right away, on the home page, with the seeded account at 0.
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: tr('home.greeting', { name: 'Smoke' }) }),
    ).toBeVisible()
    await expect(totalBalance(page)).toHaveText(await money(page, 0))
    await expect(page.getByRole('listitem').filter({ hasText: DEFAULT_ACCOUNT })).toBeVisible()
  })

  await test.step('create a savings account', async () => {
    await navLink(page, 'nav.finances').click()
    await navLink(page, 'finances.tabs.settings').click()
    await page.getByRole('link', { name: tr('finances.accounts.new') }).click()
    await page.getByLabel(tr('finances.accounts.name'), { exact: true }).fill(SAVINGS)
    await page.getByRole('button', { name: tr('common.save') }).click()

    await expect(page).toHaveURL('/finances/accounts')
    await expect(row(page, SAVINGS)).toContainText(await money(page, 0))
    await expect(row(page, DEFAULT_ACCOUNT)).toBeVisible()
  })

  await test.step('add an income', async () => {
    await navLink(page, 'finances.tabs.transactions').click()
    await addTransaction(page, {
      kind: 'income',
      title: 'Plata',
      amount: '100000',
      category: INCOME_CATEGORY,
    })

    const amount = row(page, 'Plata').getByText(await money(page, 100000))
    await expect(amount).toBeVisible()
    await expect(amount).toHaveClass(/text-green-700/) // income in green
  })

  await test.step('add an expense', async () => {
    await addTransaction(page, {
      kind: 'expense',
      title: 'Namirnice',
      amount: '2500,50', // decimal comma, as typed in Serbian
      category: EXPENSE_CATEGORY,
    })

    const amount = row(page, 'Namirnice').getByText(await money(page, 2500.5))
    await expect(amount).toBeVisible()
    await expect(amount).toHaveClass(/text-red-700/) // expense in red
  })

  await test.step('transfer to the savings account', async () => {
    await page.getByRole('link', { name: tr('finances.transactions.new') }).click()
    await chooseKind(page, 'transfer')
    await page
      .getByLabel(tr('finances.transfers.from'), { exact: true })
      .selectOption({ label: DEFAULT_ACCOUNT })
    await page
      .getByLabel(tr('finances.transfers.to'), { exact: true })
      .selectOption({ label: SAVINGS })
    await page.getByLabel(tr('finances.fields.amount'), { exact: true }).fill('30000')
    await page.getByRole('button', { name: tr('common.save') }).click()
    await expect(page).toHaveURL(/\/finances\/transactions(\?|$)/)

    // Two linked transactions, one per account, each naming the other side.
    await expect(row(page, tr('finances.transfers.toAccount', { name: SAVINGS }))).toBeVisible()
    await expect(
      row(page, tr('finances.transfers.fromAccount', { name: DEFAULT_ACCOUNT })),
    ).toBeVisible()
  })

  // 100.000 in, 2.500,50 out, 30.000 moved: 97.499,50 in total, 30.000 of it in savings.
  const total = await money(page, 97499.5)

  await test.step('transaction list totals ignore the transfer', async () => {
    await expect(totalBalance(page)).toHaveText(total)
    await expect(statTile(page, 'finances.totals.income')).toHaveText(await money(page, 100000))
    await expect(statTile(page, 'finances.totals.expense')).toHaveText(await money(page, 2500.5))
    await expect(statTile(page, 'finances.totals.balance')).toHaveText(total)
  })

  await test.step('account balances include the transfer', async () => {
    await navLink(page, 'finances.tabs.settings').click()
    await expect(totalBalance(page)).toHaveText(total)
    await expect(row(page, DEFAULT_ACCOUNT)).toContainText(await money(page, 67499.5))
    await expect(row(page, SAVINGS)).toContainText(await money(page, 30000))
  })

  await test.step('home page summary', async () => {
    await navLink(page, 'nav.home').click()
    await expect(totalBalance(page)).toHaveText(total)
    const accounts = page.getByRole('listitem')
    await expect(accounts.filter({ hasText: DEFAULT_ACCOUNT })).toContainText(
      await money(page, 67499.5),
    )
    await expect(accounts.filter({ hasText: SAVINGS })).toContainText(await money(page, 30000))
    // This month: the same income and expense, the transfer is not in them.
    await expect(statTile(page, 'finances.totals.income')).toHaveText(await money(page, 100000))
    await expect(statTile(page, 'finances.totals.expense')).toHaveText(await money(page, 2500.5))
  })

  await test.step('log out, a Serbian API error, back in: the data is still there', async () => {
    await page.getByRole('button', { name: tr('auth.logout') }).click()
    await expect(page).toHaveURL('/login')

    // On the way: signing up again with the same email. The error comes from the API, in the
    // app's language (Accept-Language → Django's LocaleMiddleware → api/locale/sr_Latn).
    await page.goto('/register')
    await page.getByLabel(tr('auth.fields.email'), { exact: true }).fill(email)
    await page.getByLabel(tr('auth.fields.password'), { exact: true }).fill(PASSWORD)
    await page.getByLabel(tr('auth.fields.passwordConfirm'), { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: tr('auth.register.submit') }).click()
    await expect(page.getByText('Korisnik sa ovom email adresom već postoji.')).toBeVisible()

    await page.goto('/login')
    await page.getByLabel(tr('auth.fields.email'), { exact: true }).fill(email)
    await page.getByLabel(tr('auth.fields.password'), { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: tr('auth.login.submit') }).click()

    await expect(page).toHaveURL('/')
    await expect(totalBalance(page)).toHaveText(total)
  })

  await test.step('the chosen language is saved on the account', async () => {
    // Signed up in Serbian: the API stored the language of that request.
    await navLink(page, 'nav.profile').click()
    const savedLanguage = (language: 'sr' | 'en') =>
      page
        .locator('dt')
        .getByText(tr('profile.language', {}, language), { exact: true })
        .locator('xpath=following-sibling::dd[1]')
    await expect(savedLanguage('sr')).toHaveText('Srpski')

    // Switching the app to English saves it on the account too (PATCH /api/auth/me/).
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/me/') && response.request().method() === 'PATCH',
    )
    await page.getByLabel(tr('language.label')).selectOption('en')
    const response = await saved
    expect(response.status()).toBe(200)
    expect((await response.json()).language).toBe('en')
    await expect(savedLanguage('en')).toHaveText('English') // the page is in English now, too
  })
})
