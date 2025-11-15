import path from 'node:path';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

function textFromResult(result: ToolResult): string {
  if (!result?.content) {
    return '';
  }
  for (const block of result.content) {
    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const serverPath = path.resolve('node_modules/chrome-mcp/build/index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: process.env,
  });

  const client = new Client({ name: 'el-dorado-automation', version: '1.0.0' }, { capabilities: { tools: {} } });
  await client.connect(transport);
  await client.listTools();

  const landingUrl = process.env.MATCHMAKE_URL ?? 'https://el-dorado-tanstack.fly.dev';
  const profileName = process.env.MATCHMAKE_NAME ?? 'Chrome MCP';

  console.log(`Navigating Chrome to ${landingUrl}`);
  await client.callTool({ name: 'chrome_navigate', arguments: { url: landingUrl } });
  await wait(5000);

  console.log(`Typing display name "${profileName}"`);
  await client.callTool({
    name: 'chrome_execute_script',
    arguments: {
      script: "const el=document.querySelector('[data-testid=\"display-name-input\"]'); if(el){el.focus(); el.value='';} 'ok';",
    },
  });
  await client.callTool({
    name: 'chrome_type',
    arguments: {
      selector: "[data-testid=\"display-name-input\"]",
      text: profileName,
    },
  });

  console.log('Clicking Matchmake button');
  await client.callTool({
    name: 'chrome_click',
    arguments: { selector: "[data-testid=\"matchmake-button\"]" },
  });
  await wait(5000);

  const urlResult = await client.callTool({ name: 'chrome_get_current_url', arguments: {} });
  const currentUrl = textFromResult(urlResult);
  if (!currentUrl.includes('/game/')) {
    throw new Error(`Expected to land on /game/, but current URL is ${currentUrl || 'unknown'}`);
  }

  console.log(`Matchmake succeeded! Current game URL: ${currentUrl}`);
  await client.close();
  await transport.close();
}

run().catch((error) => {
  console.error('chrome-mcp automation failed:', error);
  process.exitCode = 1;
});
