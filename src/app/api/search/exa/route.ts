import { NextResponse } from 'next/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export const runtime = 'nodejs'

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp'
const MCP_TIMEOUT_MS = 15000

interface ExaSearchRequestBody {
  query: string
  numResults?: number
}

interface ErrorShape {
  name: string
  message: string
}

function normalizeError(error: unknown): ErrorShape {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  if (typeof error === 'object' && error !== null) {
    const name = 'name' in error && typeof error.name === 'string' ? error.name : 'UnknownError'
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unknown MCP error'

    return { name, message }
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown MCP error',
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function buildExaMcpUrl(): URL {
  const url = new URL(EXA_MCP_URL)
  url.searchParams.set('tools', 'web_search_exa')

  const exaApiKey = process.env.EXA_API_KEY?.trim()
  if (exaApiKey) {
    url.searchParams.set('exaApiKey', exaApiKey)
  }

  return url
}

export async function POST(request: Request) {
  let body: ExaSearchRequestBody

  try {
    body = (await request.json()) as ExaSearchRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  let client: Client | null = null
  let transport: StreamableHTTPClientTransport | null = null

  try {
    const mcpUrl = buildExaMcpUrl()
    console.log('[Exa Route] Connecting to MCP server:', mcpUrl.origin + mcpUrl.pathname, '| hasApiKey:', Boolean(process.env.EXA_API_KEY))
    transport = new StreamableHTTPClientTransport(mcpUrl)
    client = new Client({ name: 'stemflow', version: '1.0.0' })
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, 'Exa MCP connect')
    console.log('[Exa Route] MCP connected, calling web_search_exa with query:', body.query)

    const result = await withTimeout(
      client.callTool({
        name: 'web_search_exa',
        arguments: {
          query: body.query,
          numResults: body.numResults || 5,
        },
      }),
      MCP_TIMEOUT_MS,
      'Exa MCP tool call'
    )

    const contentItems = Array.isArray(result.content) ? result.content : []

    console.log(
      '[Exa Route] MCP tool result content types:',
      contentItems.map((c) => (typeof c === 'object' && c !== null && 'type' in c ? String(c.type) : 'unknown'))
    )

    const textContent = contentItems
      .filter((c): c is { type: string; text?: string } => {
        return typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
      })
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .join('\n')

    console.log('[Exa Route] Extracted text length:', textContent.length, '| first 300 chars:', textContent.slice(0, 300))

    return NextResponse.json({ text: textContent }, { status: 200 })
  } catch (error) {
    const normalizedError = normalizeError(error)
    console.error('Exa MCP search error:', normalizedError)
    return NextResponse.json(
      {
        error: 'Failed to search via Exa MCP',
        details: normalizedError.message,
        name: normalizedError.name,
      },
      { status: 502 }
    )
  } finally {
    try {
      if (transport) await transport.close()
    } catch {
      // Ignore close errors
    }
  }
}
