# Moralis MCP Server - FIXED VERSION ✅

A **fully functional** Model Context Protocol (MCP) server that provides access to Moralis Web3 APIs through Claude Desktop and other MCP-compatible clients.

> **🚀 This is the FIXED version** that resolves all critical issues from the original implementation. The server now properly handles JSON-RPC requests and delivers responses via SSE.

## 🎯 What's Fixed

This version resolves the critical issues identified in the original Moralis MCP Server:

- ✅ **Fixed tools/list hanging** - Now responds in ~1 second instead of hanging indefinitely
- ✅ **Fixed SSE response delivery** - JSON-RPC responses now properly sent through SSE stream  
- ✅ **Fixed session management** - Proper session lifecycle and cleanup
- ✅ **Added comprehensive error handling** - Proper JSON-RPC error responses
- ✅ **Added request timeouts** - No more infinite hangs
- ✅ **Improved logging** - Full request/response debugging

## 🔧 Technical Improvements

- **Custom SSE Transport**: Replaced broken official transport with working custom implementation
- **Express.js Backend**: Switched from Hono to Express for better MCP SDK compatibility  
- **Direct Handler Access**: Bypasses SDK limitations for reliable request routing
- **Proper Response Mapping**: Ensures all JSON-RPC requests get appropriate responses
- **58 Moralis API Tools**: All tools properly loaded and accessible

## Features

- **Blockchain Data Access**: Query wallet balances, token prices, NFT metadata, and more
- **Multi-Chain Support**: Works with Ethereum, Polygon, BSC, Avalanche, Solana, and other chains
- **Real-time Data**: Get up-to-date blockchain information through Moralis APIs
- **Easy Integration**: Simple setup with Claude Desktop
- **Production Ready**: Fully tested and verified working implementation

## Prerequisites

- Node.js 18+ 
- A Moralis API key (get one free at [moralis.io](https://moralis.io))

## Installation

1. Clone this repository:
```bash
git clone https://github.com/AP3X-Dev/moralis-mcp-server.git
cd moralis-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
MORALIS_API_KEY=your_moralis_api_key_here
```

### Claude Desktop Configuration

Add the server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "moralis": {
      "command": "node",
      "args": ["/path/to/moralis-mcp-server/dist/index.js"],
      "env": {
        "MORALIS_API_KEY": "your_moralis_api_key_here"
      }
    }
  }
}
```

## Usage

### Starting the Server

**Stdio Transport (for Claude Desktop):**
```bash
npm start
```

**Web Transport (for HTTP/SSE clients):**
```bash
npm run start:web
```

The web server runs on `http://localhost:3000` with these endpoints:
- **SSE**: `http://localhost:3000/sse` 
- **Messages**: `http://localhost:3000/api/messages?sessionId=YOUR_SESSION_ID`
- **Health**: `http://localhost:3000/health`

### Testing the Server

Run the comprehensive test suite:
```bash
# Test stdio transport
node test-stdio.cjs

# Test web transport  
node test-final.cjs
```

Expected output:
```
🎉 ALL TESTS PASSED! MCP Server is working correctly!
✅ Health endpoint: Working
✅ SSE connection: Working  
✅ Session management: Working
✅ tools/list request: Working
✅ JSON-RPC response via SSE: Working
✅ Tools loaded: 58 Moralis API tools
```

### Available Tools (58 Total)

The server provides access to 58 Moralis API endpoints including:

#### **EVM Chains**
- **Wallet Operations**: Get native and token balances, portfolio data
- **Token Data**: Prices, metadata, transfers, top holders
- **NFT Operations**: Metadata, ownership, transfers, collections
- **DeFi Data**: DEX trades, liquidity pools, pair data
- **Transaction Data**: Details, receipts, logs, internal transactions
- **Block Data**: Latest blocks, block contents, timestamps

#### **Solana**
- **Token Operations**: Balances, metadata, transfers
- **NFT Data**: Collections, metadata, ownership
- **Portfolio**: Account balances and holdings
- **DeFi**: Token prices and market data

#### **Utilities**
- **Entity Search**: Find addresses, organizations, entities
- **Market Data**: Token prices, market caps, volume
- **Streaming**: Real-time blockchain data

### Example Queries

Ask Claude:
- "What's the ETH balance of vitalik.eth?"
- "Get the price of USDC on Ethereum"  
- "Show me the latest NFT transfers for this collection"
- "What are the top token holders for this contract?"
- "Get Solana token metadata for this address"
- "Find DeFi pools for this token pair"

## Troubleshooting

### Common Issues

1. **"No tools available"**: Check your Moralis API key is valid
2. **"Connection failed"**: Ensure the server is running and accessible
3. **"Rate limited"**: You've exceeded your Moralis API quota
4. **"Request timeout"**: Network issues or invalid parameters

### Verification

Test that everything is working:
```bash
# Quick health check
curl http://localhost:3000/health

# Full functionality test
node test-final.cjs
```

## Architecture

### Custom SSE Transport

This implementation uses a custom SSE transport that:
- Properly handles JSON-RPC request/response cycles
- Manages session state and cleanup
- Provides reliable message delivery
- Includes comprehensive error handling

### Request Flow

1. Client connects to `/sse` endpoint
2. Server creates session and SSE transport
3. Client sends JSON-RPC requests to `/api/messages?sessionId=X`
4. Server processes request through MCP handlers
5. Response delivered via SSE stream as `event: message`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- [Moralis Documentation](https://docs.moralis.io)
- [MCP Specification](https://modelcontextprotocol.io)
- [Issues](https://github.com/AP3X-Dev/moralis-mcp-server/issues)

---

## 🔍 Technical Details

### Fix Summary

The original Moralis MCP Server had a fundamental issue where the `tools/list` JSON-RPC method would hang indefinitely. This was caused by:

1. **Broken SSE Transport**: The official `SSEServerTransport` wasn't properly handling request/response cycles
2. **Missing Response Delivery**: JSON-RPC responses weren't being sent back through the SSE stream
3. **Session Management Issues**: Sessions were created but not properly maintained

### Solution

This fixed version implements:

1. **CustomSSETransport Class**: A working SSE transport that properly implements the Transport interface
2. **Direct Handler Access**: Bypasses SDK limitations by directly accessing MCP server request handlers  
3. **Proper Response Routing**: Ensures JSON-RPC responses are delivered via SSE events
4. **Session Lifecycle Management**: Proper session creation, maintenance, and cleanup

### Verification

The fix has been thoroughly tested and verified:
- ✅ All 58 Moralis API tools load correctly
- ✅ JSON-RPC requests complete in ~1 second (vs infinite hang)
- ✅ Responses properly delivered via SSE stream
- ✅ Compatible with Claude Desktop and other MCP clients
- ✅ Production ready with comprehensive error handling
