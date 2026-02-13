export interface ExaSearchResult {
  title: string
  url: string
  text: string
  publishedDate?: string
  author?: string
}

export interface ExaSearchResponse {
  results: ExaSearchResult[]
  error?: string
  errorDetails?: string
  status?: number
}

export async function searchExa(
  query: string,
  options?: { numResults?: number }
): Promise<ExaSearchResponse> {
  try {
    console.log('[searchExa] Calling /api/search/exa with query:', query, 'numResults:', options?.numResults)
    const response = await fetch('/api/search/exa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: options?.numResults,
      }),
    })

    console.log('[searchExa] Response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const errorMessage =
        typeof errorData?.error === 'string' ? errorData.error : `Exa search failed with status ${response.status}`
      const errorDetails = typeof errorData?.details === 'string' ? errorData.details : undefined

      console.error('[searchExa] Error:', errorMessage, '| details:', errorDetails || 'none')
      return {
        results: [],
        error: errorMessage,
        errorDetails,
        status: response.status,
      }
    }

    const data = await response.json()
    console.log('[searchExa] Raw MCP text (first 300 chars):', (data.text || '').slice(0, 300))
    const parsed = parseExaMcpResponse(data.text || '')
    console.log('[searchExa] Parsed results:', parsed.results.length, '| titles:', parsed.results.map((r: ExaSearchResult) => r.title))
    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error'
    console.error('Exa search error:', message)
    return {
      results: [],
      error: 'Exa search request failed',
      errorDetails: message,
    }
  }
}

function parseExaMcpResponse(text: string): ExaSearchResponse {
  const results: ExaSearchResult[] = []

  const blocks = text.split(/\n{2,}/)
  for (const block of blocks) {
    const titleMatch = block.match(/Title:\s*(.+)/i)
    const urlMatch = block.match(/URL:\s*(.+)/i)
    const textMatch = block.match(/(?:Summary|Content|Text|Snippet):\s*([\s\S]*?)(?=\n\w+:|$)/i)
    const dateMatch = block.match(/(?:Published|Date):\s*(.+)/i)
    const authorMatch = block.match(/Author:\s*(.+)/i)

    if (titleMatch || urlMatch) {
      results.push({
        title: titleMatch?.[1]?.trim() || '',
        url: urlMatch?.[1]?.trim() || '',
        text: textMatch?.[1]?.trim() || block.trim().slice(0, 500),
        publishedDate: dateMatch?.[1]?.trim(),
        author: authorMatch?.[1]?.trim(),
      })
    }
  }

  if (results.length === 0 && text.trim().length > 0) {
    results.push({
      title: 'Search Results',
      url: '',
      text: text.trim().slice(0, 2000),
    })
  }

  return { results }
}
