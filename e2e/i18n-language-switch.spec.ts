import { expect, test } from '@playwright/test'

test.describe('i18n Language Switch', () => {
  test('switches language to zh-CN and persists across reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.getByTestId('sidebar-settings').click()

    const modal = page.getByTestId('settings-modal')
    await expect(modal).toBeVisible()

    await modal.getByRole('button', { name: 'General', exact: true }).click()

    const languageSelect = page.locator('#settings-language')
    await expect(languageSelect).toBeVisible()
    await expect(languageSelect).toHaveValue('en')

    await languageSelect.selectOption('zh-CN')

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    await expect(modal.locator('h2')).toContainText('设置')

    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    const persistedLanguage = await page.evaluate(() => {
      return localStorage.getItem('stemflow:language')
    })
    expect(persistedLanguage).toBe('zh-CN')

    await page.getByTestId('sidebar-settings').click()
    await expect(page.getByTestId('settings-modal').locator('h2')).toContainText('设置')
  })

  test('switches back to English from zh-CN', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    await page.evaluate(() => {
      localStorage.setItem('stemflow:language', 'zh-CN')
    })

    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    await page.getByTestId('sidebar-settings').click()

    const modal = page.getByTestId('settings-modal')
    await expect(modal.locator('h2')).toContainText('设置')

    await modal.getByRole('button', { name: '通用', exact: true }).click()

    const languageSelect = page.locator('#settings-language')
    await expect(languageSelect).toHaveValue('zh-CN')

    await languageSelect.selectOption('en')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await expect(modal.locator('h2')).toContainText('Settings')

    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    const persistedLanguage = await page.evaluate(() => {
      return localStorage.getItem('stemflow:language')
    })
    expect(persistedLanguage).toBe('en')
  })

  test('falls back to English for invalid locale', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    await page.evaluate(() => {
      localStorage.setItem('stemflow:language', 'fr')
    })

    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.getByTestId('sidebar-settings').click()

    const modal = page.getByTestId('settings-modal')
    await expect(modal.locator('h2')).toContainText('Settings')

    await modal.getByRole('button', { name: 'General', exact: true }).click()

    const languageSelect = page.locator('#settings-language')
    await expect(languageSelect).toHaveValue('en')
  })

  test('sidebar node labels reflect selected language', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('sidebar-observation')).toContainText('Observation')

    await page.getByTestId('sidebar-settings').click()

    const modal = page.getByTestId('settings-modal')
    await modal.getByRole('button', { name: 'General', exact: true }).click()

    await page.locator('#settings-language').selectOption('zh-CN')

    await modal.locator('button:has-text("✕")').click()

    await expect(page.getByTestId('sidebar-observation')).toContainText('观察')
    await expect(page.getByTestId('sidebar-mechanism')).toContainText('机制')
    await expect(page.getByTestId('sidebar-validation')).toContainText('验证')
  })
})
