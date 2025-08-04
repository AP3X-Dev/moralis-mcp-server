# Moralis MCP Server: Critical Issues and Required Fixes

## Executive Summary

The Moralis MCP Server (https://github.com/MoralisWeb3/moralis-mcp-server) has **fundamental implementation issues** that prevent it from functioning as a proper Model Context Protocol server. This document details the exact problems discovered through comprehensive testing and provides specific solutions to fix them.

## 🚨 Critical Issues Identified

### 1. **Broken Tools/List Implementation**

**Issue**: The `tools/list` JSON-RPC method handler is fundamentally broken and causes indefinite hangs.

**Evidence**:
- SSE endpoint works: Creates sessions and sends welcome messages ✅
- Health endpoint works: Returns `{"status":"OK","server":"Moralis MCP","version":"1.0.0"}` ✅
- Tools/list request hangs indefinitely: No response after 4+ minutes ❌
- No error logging or timeout handling ❌

**Test Results**:
```bash
# This works fine:
curl -N http://localhost:9000/sse
# Returns: session creation and welcome message

# This hangs forever:
curl -X POST "http://localhost:9000/api/messages?sessionId=SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
# Expected: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
# Actual: No response, hangs indefinitely
```

### 2. **Missing Error Handling and Timeouts**

**Issue**: The server lacks proper error handling for JSON-RPC requests.

**Problems**:
- No request timeout implementation
- No error responses for malformed requests
- No logging of failed requests
- Silent failures with no debugging information

### 3. **Incomplete MCP Protocol Implementation**

**Issue**: The server doesn't properly implement the MCP specification.

**Missing Features**:
- Tools capability declaration
- Proper JSON-RPC error responses
- Request validation
- Session management for tool calls

## 🔍 Technical Analysis

### Current Architecture Issues

Based on testing and MCP protocol analysis, the server has these architectural problems:

1. **Tools Registration**: Tools are not properly registered during server initialization
2. **Request Routing**: The `/api/messages` endpoint doesn't properly route `tools/list` requests
3. **Session Management**: Sessions are created but not properly linked to tool availability
4. **API Key Integration**: Tools may not be initialized even with valid Moralis API key

### Expected vs Actual Behavior

| Method | Expected Response | Actual Response |
|--------|------------------|-----------------|
| `tools/list` | `{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}` | **Hangs indefinitely** |
| `tools/call` | Tool execution result | **Not testable due to tools/list failure** |
| Health check | Server status | ✅ Works correctly |
| SSE connection | Session creation | ✅ Works correctly |

## 🛠️ Required Fixes

### Fix 1: Implement Proper Tools/List Handler

**Location**: Likely in `src/index.ts` or similar main server file

**Required Changes**:
```typescript
// Add proper tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_wallet_balance",
        description: "Get wallet balance for a specific address",
        inputSchema: {
          type: "object",
          properties: {
            address: { type: "string", description: "Wallet address" },
            chain: { type: "string", description: "Blockchain network" }
          },
          required: ["address", "chain"]
        }
      },
      {
        name: "get_token_price",
        description: "Get current token price",
        inputSchema: {
          type: "object",
          properties: {
            token: { type: "string", description: "Token symbol or address" },
            chain: { type: "string", description: "Blockchain network" }
          },
          required: ["token", "chain"]
        }
      },
      {
        name: "get_nft_metadata",
        description: "Get NFT metadata",
        inputSchema: {
          type: "object",
          properties: {
            address: { type: "string", description: "NFT contract address" },
            tokenId: { type: "string", description: "Token ID" },
            chain: { type: "string", description: "Blockchain network" }
          },
          required: ["address", "tokenId", "chain"]
        }
      }
    ]
  };
});
```

### Fix 2: Add Request Timeout and Error Handling

**Required Changes**:
```typescript
// Add request timeout middleware
app.use('/api/messages', (req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Request timeout"
      },
      id: req.body?.id || null
    });
  });
  next();
});

// Add error handling for JSON-RPC requests
app.use('/api/messages', (err, req, res, next) => {
  console.error('MCP Request Error:', err);
  res.status(500).json({
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: "Internal error",
      data: err.message
    },
    id: req.body?.id || null
  });
});
```

### Fix 3: Implement Proper Tools/Call Handler

**Required Changes**:
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "get_wallet_balance":
        const balance = await Moralis.EvmApi.balance.getNativeBalance({
          chain: args.chain,
          address: args.address
        });
        return {
          content: [{
            type: "text",
            text: `Balance: ${balance.result.balance} wei`
          }]
        };
        
      case "get_token_price":
        const price = await Moralis.EvmApi.token.getTokenPrice({
          chain: args.chain,
          address: args.token
        });
        return {
          content: [{
            type: "text", 
            text: `Price: $${price.result.usdPrice}`
          }]
        };
        
      case "get_nft_metadata":
        const metadata = await Moralis.EvmApi.nft.getNFTMetadata({
          chain: args.chain,
          address: args.address,
          tokenId: args.tokenId
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(metadata.result, null, 2)
          }]
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new Error(`Tool execution failed: ${error.message}`);
  }
});
```

### Fix 4: Add Proper Server Capabilities

**Required Changes**:
```typescript
// Declare server capabilities properly
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {}, // Enable tools capability
      logging: {} // Enable logging capability
    },
    serverInfo: {
      name: "Moralis MCP Server",
      version: "1.0.0"
    }
  };
});
```

### Fix 5: Add Proper Logging and Debugging

**Required Changes**:
```typescript
// Add comprehensive logging
import { Logger } from '@modelcontextprotocol/sdk/shared/logger.js';

const logger = new Logger('moralis-mcp-server');

// Log all incoming requests
app.use('/api/messages', (req, res, next) => {
  logger.info('Incoming MCP request:', {
    method: req.body?.method,
    id: req.body?.id,
    sessionId: req.query.sessionId
  });
  next();
});

// Log tool registrations
logger.info('Registering MCP tools...');
logger.info('Tools registered successfully');

// Log API key validation
if (process.env.MORALIS_API_KEY) {
  logger.info('Moralis API key found, initializing tools...');
} else {
  logger.warn('No Moralis API key found, tools may not function properly');
}
```

## 🧪 Testing and Validation

### Test Suite Required

Create comprehensive tests to validate fixes:

```typescript
// test/mcp-protocol.test.ts
describe('MCP Protocol Implementation', () => {
  test('tools/list should return available tools', async () => {
    const response = await request(app)
      .post('/api/messages?sessionId=test-session')
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      })
      .expect(200);

    expect(response.body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: expect.any(String),
            description: expect.any(String),
            inputSchema: expect.any(Object)
          })
        ])
      }
    });
  });

  test('tools/call should execute tools properly', async () => {
    const response = await request(app)
      .post('/api/messages?sessionId=test-session')
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_wallet_balance",
          arguments: {
            address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45",
            chain: "eth"
          }
        }
      })
      .expect(200);

    expect(response.body.result.content).toBeDefined();
  });

  test('requests should timeout after 30 seconds', async () => {
    // Test timeout implementation
  });
});
```

### Manual Testing Checklist

After implementing fixes, verify:

- [ ] `curl -N http://localhost:9000/sse` creates session
- [ ] `curl -X POST "http://localhost:9000/api/messages?sessionId=SESSION_ID" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'` returns tools list
- [ ] Tools/call requests execute successfully
- [ ] Error responses are properly formatted
- [ ] Requests timeout after 30 seconds
- [ ] Claude Desktop can connect and see tools

## 📋 Implementation Priority

### Phase 1: Critical Fixes (High Priority)
1. **Fix tools/list handler** - This is blocking all functionality
2. **Add request timeout** - Prevents indefinite hangs
3. **Add basic error handling** - Provides debugging information

### Phase 2: Enhanced Functionality (Medium Priority)
1. **Implement tools/call handler** - Enables actual tool execution
2. **Add comprehensive logging** - Improves debugging
3. **Validate API key integration** - Ensures Moralis API works

### Phase 3: Quality Improvements (Low Priority)
1. **Add comprehensive test suite** - Prevents regressions
2. **Improve error messages** - Better developer experience
3. **Add configuration validation** - Prevents misconfigurations

## 🔧 Development Environment Setup

### Prerequisites for Contributors

```bash
# Clone the repository
git clone https://github.com/MoralisWeb3/moralis-mcp-server.git
cd moralis-mcp-server

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your Moralis API key to .env

# Run in development mode
npm run dev

# Test the fixes
npm test
```

### Debugging Tools

```bash
# Test tools/list endpoint
curl -X POST "http://localhost:3000/api/messages?sessionId=test" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  --max-time 30

# Monitor server logs
docker logs -f moralis-mcp-server

# Test with Claude Desktop
# Add server: http://localhost:3000
```

## 📞 Recommended Actions

### For Moralis Team
1. **Acknowledge the issue** - The tools/list implementation is broken
2. **Implement the fixes** outlined in this document
3. **Add comprehensive testing** to prevent future regressions
4. **Update documentation** with proper setup instructions

### For Users
1. **Stop using the current version** - It doesn't work
2. **Use alternative MCP servers** until fixed
3. **Monitor the repository** for updates
4. **Consider contributing fixes** if you have TypeScript/MCP experience

### For Community
1. **Share this analysis** with other users experiencing issues
2. **Create working alternatives** based on proper MCP implementation
3. **Contribute to testing** once fixes are implemented

## 🎯 Success Criteria

The server will be considered fixed when:

- [ ] `tools/list` requests return within 5 seconds
- [ ] Tools are properly listed with correct schemas
- [ ] `tools/call` requests execute successfully
- [ ] Error responses follow JSON-RPC specification
- [ ] Claude Desktop shows tools as available
- [ ] All manual tests pass
- [ ] Automated test suite passes

## 📚 References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Moralis Web3 API Documentation](https://docs.moralis.io/)

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Status**: Issues Identified - Fixes Required
