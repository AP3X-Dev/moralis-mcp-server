const http = require('http');

// Test the MCP server tools/list endpoint
async function testToolsList() {
  console.log('Testing MCP Server tools/list endpoint...');
  
  // First, establish a session via SSE
  console.log('1. Establishing SSE session...');
  
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
    let sessionId = null;
    
    let responseReceived = false;

    res.on('data', (chunk) => {
      const data = chunk.toString();
      console.log('SSE Data:', data);

      // Extract session ID from the endpoint event
      const endpointMatch = data.match(/data: \/api\/messages\?sessionId=([a-f0-9-]+)/);
      if (endpointMatch && !sessionId) {
        sessionId = endpointMatch[1];
        console.log('2. Session ID extracted:', sessionId);

        // Wait a bit for the session to be fully established, then test tools/list
        // Keep the SSE connection alive
        setTimeout(() => {
          testToolsListWithSession(sessionId, () => {
            // Don't close immediately, wait for response
          });
        }, 1000);
      }

      // Also check for any other SSE events that might contain the response
      if (data.includes('event: message') && data.includes('"jsonrpc":"2.0"') && !responseReceived) {
        responseReceived = true;
        console.log('✅ SUCCESS: Received JSON-RPC response via SSE message event!');
        console.log('Response data:', data);
        res.destroy();
        process.exit(0);
      }

      // Check for JSON-RPC response in SSE data
      if (data.includes('"jsonrpc":"2.0"') && data.includes('"result"') && data.includes('"tools"') && !responseReceived) {
        responseReceived = true;
        console.log('✅ SUCCESS: Received JSON-RPC tools/list response via SSE!');
        console.log('Response contains tools list');

        // Try to extract and parse the JSON response
        try {
          const jsonMatch = data.match(/data: ({.*})/);
          if (jsonMatch) {
            const jsonResponse = JSON.parse(jsonMatch[1]);
            console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
            console.log(`Found ${jsonResponse.result?.tools?.length || 0} tools`);
          }
        } catch (e) {
          console.log('Could not parse JSON response, but response was received');
        }

        res.destroy();
        process.exit(0);
      }
    });
    
    res.on('error', (err) => {
      console.error('SSE Error:', err);
    });

    // Add a timeout to close the connection if no response is received
    setTimeout(() => {
      if (!responseReceived) {
        console.log('❌ TIMEOUT: No JSON-RPC response received via SSE after 10 seconds');
        res.destroy();
        process.exit(1);
      }
    }, 10000);
  });
  
  sseReq.on('error', (err) => {
    console.error('SSE Request Error:', err);
  });
  
  sseReq.end();
}

async function testToolsListWithSession(sessionId, callback) {
  console.log('3. Testing tools/list with session:', sessionId);
  
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
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('4. Response Status:', res.statusCode);
      console.log('5. Response Data:', responseData);
      
      if (res.statusCode === 200) {
        console.log('✅ SUCCESS: tools/list request completed');
      } else {
        console.log('❌ FAILED: tools/list request failed');
      }

      // Call the callback to close SSE connection
      if (callback) callback();
      process.exit(0);
    });
  });
  
  req.on('error', (err) => {
    console.error('Request Error:', err);
    if (callback) callback();
    process.exit(1);
  });

  // Set timeout
  req.setTimeout(30000, () => {
    console.log('❌ TIMEOUT: Request timed out after 30 seconds');
    req.destroy();
    if (callback) callback();
    process.exit(1);
  });
  
  req.write(postData);
  req.end();
}

// Run the test
testToolsList();
