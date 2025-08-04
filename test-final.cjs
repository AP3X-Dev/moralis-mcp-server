const http = require('http');

// Final comprehensive test of the fixed MCP server
async function testMCPServerFinal() {
  console.log('🧪 Final Test: Moralis MCP Server SSE Response Delivery');
  console.log('='.repeat(60));
  
  let sessionId = null;
  let responseReceived = false;
  let toolsCount = 0;
  
  // Test 1: Health Check
  console.log('1. Testing health endpoint...');
  await testHealthEndpoint();
  
  // Test 2: SSE Connection and tools/list
  console.log('2. Testing SSE connection and tools/list...');
  
  const sseReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/sse',
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  }, (res) => {
    console.log('   ✅ SSE connection established');
    
    let fullResponse = '';
    
    res.on('data', (chunk) => {
      const data = chunk.toString();
      fullResponse += data;
      
      // Extract session ID
      const endpointMatch = data.match(/data: \/messages\?sessionId=([a-f0-9-]+)/);
      if (endpointMatch && !sessionId) {
        sessionId = endpointMatch[1];
        console.log(`   ✅ Session ID extracted: ${sessionId}`);
        
        // Send tools/list request after session is established
        setTimeout(() => {
          sendToolsListRequest(sessionId);
        }, 1000);
      }
      
      // Check for tools/list response
      if (data.includes('"jsonrpc":"2.0"') && data.includes('"result"') && data.includes('"tools"') && !responseReceived) {
        responseReceived = true;
        console.log('   ✅ JSON-RPC response received via SSE!');
        
        // Count tools in the response
        const toolMatches = fullResponse.match(/"name":/g);
        toolsCount = toolMatches ? toolMatches.length : 0;
        console.log(`   ✅ Found ${toolsCount} tools in response`);
        
        // Test completed successfully
        console.log('\n' + '='.repeat(60));
        console.log('🎉 ALL TESTS PASSED! MCP Server is working correctly!');
        console.log('='.repeat(60));
        console.log('✅ Health endpoint: Working');
        console.log('✅ SSE connection: Working');
        console.log('✅ Session management: Working');
        console.log('✅ tools/list request: Working');
        console.log('✅ JSON-RPC response via SSE: Working');
        console.log(`✅ Tools loaded: ${toolsCount} Moralis API tools`);
        console.log('\n🚀 The Moralis MCP Server is now fully functional!');
        console.log('   You can now use it with Claude Desktop or other MCP clients.');
        
        res.destroy();
        process.exit(0);
      }
    });
    
    res.on('error', (err) => {
      console.error('❌ SSE Error:', err);
      process.exit(1);
    });
  });
  
  sseReq.on('error', (err) => {
    console.error('❌ SSE Request Error:', err);
    process.exit(1);
  });
  
  sseReq.end();
  
  // Timeout after 15 seconds
  setTimeout(() => {
    if (!responseReceived) {
      console.log('❌ TIMEOUT: No response received after 15 seconds');
      process.exit(1);
    }
  }, 15000);
}

function testHealthEndpoint() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          const health = JSON.parse(data);
          console.log(`   ✅ Health check passed: ${health.status} - ${health.server} v${health.version}`);
          resolve();
        } else {
          console.log(`   ❌ Health check failed: ${res.statusCode}`);
          reject(new Error('Health check failed'));
        }
      });
    });
    
    req.on('error', (err) => {
      console.log('   ❌ Health check error:', err);
      reject(err);
    });
    
    req.end();
  });
}

function sendToolsListRequest(sessionId) {
  console.log('   📤 Sending tools/list request...');
  
  const postData = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/messages?sessionId=${sessionId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    if (res.statusCode === 202) {
      console.log('   ✅ tools/list request accepted');
    } else {
      console.log(`   ❌ tools/list request failed: ${res.statusCode}`);
    }
  });
  
  req.on('error', (err) => {
    console.error('   ❌ Request Error:', err);
  });
  
  req.write(postData);
  req.end();
}

// Run the final test
testMCPServerFinal();
