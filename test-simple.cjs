const http = require('http');

// Simple test that establishes SSE connection and sends tools/list request
async function testMCPServer() {
  console.log('Testing MCP Server with improved timing...');
  
  let sessionId = null;
  let responseReceived = false;
  
  // Establish SSE connection
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
    console.log('SSE connection established');
    
    res.on('data', (chunk) => {
      const data = chunk.toString();
      console.log('SSE Event:', data);
      
      // Extract session ID
      const endpointMatch = data.match(/data: \/api\/messages\?sessionId=([a-f0-9-]+)/);
      if (endpointMatch && !sessionId) {
        sessionId = endpointMatch[1];
        console.log(`Session ID: ${sessionId}`);
        
        // Wait 2 seconds for session to be fully established, then send request
        setTimeout(() => {
          sendToolsListRequest(sessionId);
        }, 2000);
      }
      
      // Check for tools/list response
      if (data.includes('"jsonrpc":"2.0"') && data.includes('"result"') && data.includes('"tools"') && !responseReceived) {
        responseReceived = true;
        console.log('\n🎉 SUCCESS! Received tools/list response via SSE!');
        
        // Try to parse the response
        try {
          const jsonMatch = data.match(/data: ({.*})/);
          if (jsonMatch) {
            const response = JSON.parse(jsonMatch[1]);
            console.log(`✅ Found ${response.result?.tools?.length || 0} tools`);
            console.log('First few tools:');
            response.result?.tools?.slice(0, 3).forEach((tool, i) => {
              console.log(`  ${i + 1}. ${tool.name}: ${tool.description}`);
            });
          }
        } catch (e) {
          console.log('Response received but could not parse JSON');
        }
        
        res.destroy();
        process.exit(0);
      }
    });
    
    res.on('error', (err) => {
      console.error('SSE Error:', err);
      process.exit(1);
    });
  });
  
  sseReq.on('error', (err) => {
    console.error('SSE Request Error:', err);
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

function sendToolsListRequest(sessionId) {
  console.log(`\nSending tools/list request to session: ${sessionId}`);
  
  const postData = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/messages?sessionId=${sessionId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`Request accepted with status: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log(`HTTP Response: ${responseData}`);
    });
  });
  
  req.on('error', (err) => {
    console.error('Request Error:', err);
  });
  
  req.write(postData);
  req.end();
}

// Run the test
testMCPServer();
