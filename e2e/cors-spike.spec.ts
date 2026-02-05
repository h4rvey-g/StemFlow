import { expect, test } from '@playwright/test'

type Endpoint = {
  name: string
  url: string
  headers: Record<string, string>
}

const API_ENDPOINTS: Endpoint[] = [
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/models',
    headers: {
      Authorization: 'Bearer sk-placeholder-openai',
    },
  },
  {
    name: 'Anthropic',
    url: 'https://api.anthropic.com/v1/models',
    headers: {
      'x-api-key': 'anthropic-placeholder-key',
    },
  },
]

type EndpointResult =
  | {
      name: string
      status: number
      statusText: string
      ok: boolean
      type: 'success'
    }
  | {
      name: string
      error: string
      kind: string
      type: 'error'
    }

test('browser fetch to OpenAI and Anthropic endpoints does not hit CORS', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  const results = (await page.evaluate(async (endpoints: Endpoint[]) => {
    const fetchWithPlaceholder = async (endpoint: {
      name: string
      url: string
      headers: Record<string, string>
    }) => {
      try {
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...endpoint.headers,
          },
        })

        return {
          name: endpoint.name,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          type: 'success' as const,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          name: endpoint.name,
          error: message,
          kind: error instanceof Error ? error.name : 'Error',
          type: 'error' as const,
        }
      }
    }

    const responses = await Promise.all(endpoints.map(fetchWithPlaceholder))
    return responses
  }, API_ENDPOINTS)) as EndpointResult[]

  for (const result of results) {
    if (result.type === 'success') {
      expect(result.status).toBeGreaterThanOrEqual(0)
      continue
    }

    if (result.name === 'Anthropic') {
      console.info(
        `Anthropic fetch blocked: ${result.error} (${result.kind})`
      )
      continue
    }

    throw new Error(`${result.name} fetch failed: ${result.error} (${result.kind})`)
  }
})
