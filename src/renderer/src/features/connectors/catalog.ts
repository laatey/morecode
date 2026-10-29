/** Connectors offered in Discover. Each one is a real MCP server: a web address, or a program that runs on this computer. */
export type Field = {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  /** Where the value goes when the server starts: an environment variable, or the end of the command. */
  target: 'env' | 'arg'
}

export type CatalogEntry = {
  id: string
  name: string
  by: string
  description: string
  /** Used to fetch the logo. */
  domain: string
  kind: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  /** none: nothing to enter. token: a key sent with every request. oauth: sign in through the browser. */
  auth: 'none' | 'token' | 'oauth'
  tokenLabel?: string
  tokenHint?: string
  fields?: Field[]
  category: 'Developer' | 'Data' | 'Knowledge' | 'Browser'
}

const npx = (pkg: string, ...rest: string[]): string[] => ['-y', pkg, ...rest]

export const CATALOG: CatalogEntry[] = [
  { id: 'ui-warehouse', name: 'UI Warehouse', by: 'MoreCode', description: 'Search 58+ reusable UI shells, layouts and component primitives', domain: 'github.com', kind: 'http', url: 'https://ui-warehouse.morline.space/mcp', auth: 'token', tokenLabel: 'Bearer token', tokenHint: 'Enter the MCP_AUTH_TOKEN configured on your UI Warehouse server.', category: 'Developer' },
  { id: 'github', name: 'GitHub', by: 'GitHub', description: 'Repos, issues, pull requests and code search', domain: 'github.com', kind: 'http', url: 'https://api.githubcopilot.com/mcp/', auth: 'token', tokenLabel: 'Personal access token', tokenHint: 'Create one in GitHub, under Settings, Developer settings.', category: 'Developer' },
  { id: 'linear', name: 'Linear', by: 'Linear', description: 'Find, create and update issues and projects', domain: 'linear.app', kind: 'http', url: 'https://mcp.linear.app/mcp', auth: 'token', tokenLabel: 'API key', tokenHint: 'Linear, Settings, Security & access, API keys.', category: 'Developer' },
  { id: 'stripe', name: 'Stripe', by: 'Stripe', description: 'Customers, payments, invoices and subscriptions', domain: 'stripe.com', kind: 'http', url: 'https://mcp.stripe.com', auth: 'token', tokenLabel: 'Restricted API key', tokenHint: 'Use a restricted key that only has the access you want.', category: 'Data' },
  { id: 'supabase', name: 'Supabase', by: 'Supabase', description: 'Manage projects, tables and run SQL', domain: 'supabase.com', kind: 'http', url: 'https://mcp.supabase.com/mcp', auth: 'token', tokenLabel: 'Personal access token', tokenHint: 'Supabase, Account, Access tokens.', category: 'Data' },
  { id: 'huggingface', name: 'Hugging Face', by: 'Hugging Face', description: 'Search models, datasets and papers', domain: 'huggingface.co', kind: 'http', url: 'https://huggingface.co/mcp', auth: 'token', tokenLabel: 'Access token', tokenHint: 'Hugging Face, Settings, Access tokens.', category: 'Knowledge' },
  { id: 'context7', name: 'Context7', by: 'Upstash', description: 'Up-to-date docs and code examples for any library', domain: 'context7.com', kind: 'http', url: 'https://mcp.context7.com/mcp', auth: 'none', category: 'Knowledge' },
  { id: 'deepwiki', name: 'DeepWiki', by: 'Cognition', description: 'Ask questions about any public GitHub repository', domain: 'deepwiki.com', kind: 'http', url: 'https://mcp.deepwiki.com/mcp', auth: 'none', category: 'Knowledge' },
  { id: 'cloudflare-docs', name: 'Cloudflare Docs', by: 'Cloudflare', description: 'Search the Cloudflare documentation', domain: 'cloudflare.com', kind: 'http', url: 'https://docs.mcp.cloudflare.com/mcp', auth: 'none', category: 'Knowledge' },
  { id: 'notion', name: 'Notion', by: 'Notion', description: 'Read and edit pages and databases', domain: 'notion.so', kind: 'http', url: 'https://mcp.notion.com/mcp', auth: 'oauth', category: 'Knowledge' },
  { id: 'sentry', name: 'Sentry', by: 'Sentry', description: 'Look into errors and issues in your projects', domain: 'sentry.io', kind: 'http', url: 'https://mcp.sentry.dev/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'atlassian', name: 'Atlassian', by: 'Atlassian', description: 'Jira issues and Confluence pages', domain: 'atlassian.com', kind: 'http', url: 'https://mcp.atlassian.com/v1/sse', auth: 'oauth', category: 'Developer' },
  { id: 'asana', name: 'Asana', by: 'Asana', description: 'Tasks, projects and goals', domain: 'asana.com', kind: 'http', url: 'https://mcp.asana.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'figma', name: 'Figma', by: 'Figma', description: 'Read designs and turn them into code', domain: 'figma.com', kind: 'http', url: 'https://mcp.figma.com/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'vercel', name: 'Vercel', by: 'Vercel', description: 'Projects, deployments and logs', domain: 'vercel.com', kind: 'http', url: 'https://mcp.vercel.com', auth: 'oauth', category: 'Developer' },
  { id: 'paypal', name: 'PayPal', by: 'PayPal', description: 'Invoices, orders and transactions', domain: 'paypal.com', kind: 'http', url: 'https://mcp.paypal.com/mcp', auth: 'oauth', category: 'Data' },
  { id: 'notion-local', name: 'Notion (token)', by: 'Notion', description: 'Same, run on this computer with an integration token', domain: 'notion.so', kind: 'stdio', command: 'npx', args: npx('@notionhq/notion-mcp-server'), auth: 'none', fields: [{ key: 'NOTION_TOKEN', label: 'Integration token', placeholder: 'ntn_…', secret: true, target: 'env' }], category: 'Knowledge' },
  { id: 'playwright', name: 'Playwright', by: 'Microsoft', description: 'Drive a real browser to test and inspect web pages', domain: 'playwright.dev', kind: 'stdio', command: 'npx', args: npx('@playwright/mcp@latest'), auth: 'none', category: 'Browser' },
  { id: 'filesystem', name: 'Filesystem', by: 'Anthropic', description: 'Read and write files in a folder you choose', domain: 'modelcontextprotocol.io', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-filesystem'), auth: 'none', fields: [{ key: 'folder', label: 'Folder', placeholder: 'C:\\Users\\you\\Documents', target: 'arg' }], category: 'Developer' },
  { id: 'memory', name: 'Memory', by: 'Anthropic', description: 'A small knowledge graph the AI can remember things in', domain: 'anthropic.com', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-memory'), auth: 'none', category: 'Knowledge' },
  { id: 'sequential-thinking', name: 'Sequential Thinking', by: 'Anthropic', description: 'Work through hard problems step by step', domain: 'anthropic.com', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-sequential-thinking'), auth: 'none', category: 'Developer' }
]

export const entryById = (id?: string): CatalogEntry | undefined => CATALOG.find((e) => e.id === id)
