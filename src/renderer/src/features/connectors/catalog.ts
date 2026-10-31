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
  domain?: string
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
  { id: 'ui-warehouse', name: 'UI Warehouse', by: 'MoreCode', description: 'Search 58+ reusable UI shells, layouts and component primitives', kind: 'http', url: 'https://ui-warehouse-ef4632.morline.space/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'github', name: 'GitHub', by: 'GitHub', description: 'Repos, issues, pull requests and code search', domain: 'github.com', kind: 'http', url: 'https://api.githubcopilot.com/mcp/', auth: 'token', tokenLabel: 'Personal access token', tokenHint: 'Create one in GitHub, under Settings, Developer settings.', category: 'Developer' },
  { id: 'linear', name: 'Linear', by: 'Linear', description: 'Find, create and update issues and projects', domain: 'linear.app', kind: 'http', url: 'https://mcp.linear.app/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'stripe', name: 'Stripe', by: 'Stripe', description: 'Customers, payments, invoices and subscriptions', domain: 'stripe.com', kind: 'http', url: 'https://mcp.stripe.com', auth: 'oauth', category: 'Data' },
  { id: 'supabase', name: 'Supabase', by: 'Supabase', description: 'Manage projects, tables and run SQL', domain: 'supabase.com', kind: 'http', url: 'https://mcp.supabase.com/mcp', auth: 'oauth', category: 'Data' },
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
  { id: 'neon', name: 'Neon', by: 'Neon', description: 'Postgres databases, branches and SQL', domain: 'neon.tech', kind: 'http', url: 'https://mcp.neon.tech/mcp', auth: 'oauth', category: 'Data' },
  { id: 'netlify', name: 'Netlify', by: 'Netlify', description: 'Sites, deploys and environment settings', domain: 'netlify.com', kind: 'http', url: 'https://netlify-mcp.netlify.app/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'canva', name: 'Canva', by: 'Canva', description: 'Create and edit designs', domain: 'canva.com', kind: 'http', url: 'https://mcp.canva.com/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'square', name: 'Square', by: 'Square', description: 'Payments, orders and catalog', domain: 'squareup.com', kind: 'http', url: 'https://mcp.squareup.com/sse', auth: 'oauth', category: 'Data' },
  { id: 'webflow', name: 'Webflow', by: 'Webflow', description: 'Sites, CMS collections and pages', domain: 'webflow.com', kind: 'http', url: 'https://mcp.webflow.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'intercom', name: 'Intercom', by: 'Intercom', description: 'Conversations and contacts', domain: 'intercom.com', kind: 'http', url: 'https://mcp.intercom.com/sse', auth: 'oauth', category: 'Data' },
  { id: 'fetch', name: 'Fetch', by: 'Anthropic', description: 'Download any web page as clean text', domain: 'modelcontextprotocol.io', kind: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], auth: 'none', category: 'Browser' },
  { id: 'git', name: 'Git', by: 'Anthropic', description: 'Read history, diffs and branches of a repository', domain: 'git-scm.com', kind: 'stdio', command: 'uvx', args: ['mcp-server-git'], auth: 'none', category: 'Developer' },
  { id: 'time', name: 'Time', by: 'Anthropic', description: 'Current time and time zone conversion', domain: 'modelcontextprotocol.io', kind: 'stdio', command: 'uvx', args: ['mcp-server-time'], auth: 'none', category: 'Knowledge' },
  { id: 'chrome-devtools', name: 'Chrome DevTools', by: 'Google', description: 'Inspect, debug and profile pages in Chrome', domain: 'developer.chrome.com', kind: 'stdio', command: 'npx', args: npx('chrome-devtools-mcp@latest'), auth: 'none', category: 'Browser' },
  { id: 'desktop-commander', name: 'Desktop Commander', by: 'Community', description: 'Run terminal commands and edit files on this computer', domain: 'github.com', kind: 'stdio', command: 'npx', args: npx('@wonderwhy-er/desktop-commander@latest'), auth: 'none', category: 'Developer' },
  { id: 'exa', name: 'Exa Search', by: 'Exa', description: 'Web search built for AI, with a free monthly allowance', domain: 'exa.ai', kind: 'stdio', command: 'npx', args: npx('exa-mcp-server'), auth: 'none', fields: [{ key: 'EXA_API_KEY', label: 'Exa API key', secret: true, target: 'env' }], category: 'Browser' },
  { id: 'tavily', name: 'Tavily Search', by: 'Tavily', description: 'Web search and page extraction, about 1,000 free searches a month', domain: 'tavily.com', kind: 'stdio', command: 'npx', args: npx('tavily-mcp@latest'), auth: 'none', fields: [{ key: 'TAVILY_API_KEY', label: 'Tavily API key', placeholder: 'tvly-…', secret: true, target: 'env' }], category: 'Browser' },
  { id: 'firecrawl', name: 'Firecrawl', by: 'Firecrawl', description: 'Scrape and crawl websites into clean markdown', domain: 'firecrawl.dev', kind: 'stdio', command: 'npx', args: npx('firecrawl-mcp'), auth: 'none', fields: [{ key: 'FIRECRAWL_API_KEY', label: 'Firecrawl API key', placeholder: 'fc-…', secret: true, target: 'env' }], category: 'Browser' },
  { id: 'railway', name: 'Railway', by: 'Railway', description: 'Projects, services, deployments and logs', domain: 'railway.com', kind: 'http', url: 'https://mcp.railway.com', auth: 'oauth', category: 'Developer' },
  { id: 'prisma', name: 'Prisma Postgres', by: 'Prisma', description: 'Create Postgres databases and run schema migrations', domain: 'prisma.io', kind: 'http', url: 'https://mcp.prisma.io/mcp', auth: 'oauth', category: 'Data' },
  { id: 'cloudflare', name: 'Cloudflare', by: 'Cloudflare', description: 'Workers, KV, R2 storage and DNS', domain: 'cloudflare.com', kind: 'http', url: 'https://mcp.cloudflare.com/mcp', auth: 'oauth', category: 'Developer' },
  { id: 'cloudflare-workers', name: 'Cloudflare Workers', by: 'Cloudflare', description: 'Manage Workers, KV, R2 and bindings', domain: 'cloudflare.com', kind: 'http', url: 'https://bindings.mcp.cloudflare.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'cloudflare-observability', name: 'Cloudflare Observability', by: 'Cloudflare', description: 'Debug Workers with logs and analytics', domain: 'cloudflare.com', kind: 'http', url: 'https://observability.mcp.cloudflare.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'monday', name: 'monday.com', by: 'monday.com', description: 'Boards, items and projects', domain: 'monday.com', kind: 'http', url: 'https://mcp.monday.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'close', name: 'Close', by: 'Close', description: 'CRM leads, contacts and opportunities', domain: 'close.com', kind: 'http', url: 'https://mcp.close.com/mcp', auth: 'oauth', category: 'Data' },
  { id: 'cloudinary', name: 'Cloudinary', by: 'Cloudinary', description: 'Manage images and video assets', domain: 'cloudinary.com', kind: 'http', url: 'https://asset-management.mcp.cloudinary.com/sse', auth: 'oauth', category: 'Developer' },
  { id: 'plaid', name: 'Plaid', by: 'Plaid', description: 'Dashboard data, institutions and link health', domain: 'plaid.com', kind: 'http', url: 'https://api.dashboard.plaid.com/mcp/sse', auth: 'oauth', category: 'Data' },
  { id: 'notion-local', name: 'Notion (token)', by: 'Notion', description: 'Same, run on this computer with an integration token', domain: 'notion.so', kind: 'stdio', command: 'npx', args: npx('@notionhq/notion-mcp-server'), auth: 'none', fields: [{ key: 'NOTION_TOKEN', label: 'Integration token', placeholder: 'ntn_…', secret: true, target: 'env' }], category: 'Knowledge' },
  { id: 'playwright', name: 'Playwright', by: 'Microsoft', description: 'Drive a real browser to test and inspect web pages', domain: 'playwright.dev', kind: 'stdio', command: 'npx', args: npx('@playwright/mcp@latest'), auth: 'none', category: 'Browser' },
  { id: 'filesystem', name: 'Filesystem', by: 'Anthropic', description: 'Read and write files in a folder you choose', domain: 'modelcontextprotocol.io', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-filesystem'), auth: 'none', fields: [{ key: 'folder', label: 'Folder', placeholder: 'C:\\Users\\you\\Documents', target: 'arg' }], category: 'Developer' },
  { id: 'memory', name: 'Memory', by: 'Anthropic', description: 'A small knowledge graph the AI can remember things in', domain: 'anthropic.com', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-memory'), auth: 'none', category: 'Knowledge' },
  { id: 'sequential-thinking', name: 'Sequential Thinking', by: 'Anthropic', description: 'Work through hard problems step by step', domain: 'anthropic.com', kind: 'stdio', command: 'npx', args: npx('@modelcontextprotocol/server-sequential-thinking'), auth: 'none', category: 'Developer' }
]

export const entryById = (id?: string): CatalogEntry | undefined => CATALOG.find((e) => e.id === id)
