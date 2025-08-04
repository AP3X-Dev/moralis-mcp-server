const { spawn } = require('child_process');

// Test the MCP server via stdio transport
async function testStdioServer() {
  console.log('Testing MCP Server via stdio transport...');
  
  // Start the server process
  const server = spawn('node', ['dist/index.js', '--transport', 'stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let responseData = '';
  
  server.stdout.on('data', (data) => {
    responseData += data.toString();
    console.log('Server response:', data.toString());
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    process.exit(code);
  });

  // Send tools/list request
  const toolsListRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  };

  console.log('Sending tools/list request:', JSON.stringify(toolsListRequest));
  server.stdin.write(JSON.stringify(toolsListRequest) + '\n');

  // Wait for response
  setTimeout(() => {
    console.log('Closing server...');
    server.kill();
  }, 5000);
}

testStdioServer().catch(console.error);
