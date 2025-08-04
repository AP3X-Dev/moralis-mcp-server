/**
 * Web server setup for HTTP-based MCP communication using Express
 * Hybrid approach: Official SSE transport + manual message handling
 */
import express from 'express';
import cors from 'cors';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  JSONRPCMessageSchema
} from '@modelcontextprotocol/sdk/types.js';
import { Config } from './config.js';



/**
 * Sets up a web server for the MCP server using Server-Sent Events (SSE)
 * Based on official MCP TypeScript SDK backwards compatibility example
 *
 * @param server The MCP Server instance
 * @param port The port to listen on (default: 3000)
 * @returns The Express app instance
 */
export async function setupWebServer(server: Server, port = 3000) {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Store active SSE transports by session ID (official pattern)
  const transports: { [sessionId: string]: SSEServerTransport } = {};

  // Manual JSON-RPC message handler that bypasses the broken handlePostMessage
  async function handleJsonRpcMessage(
    transport: SSEServerTransport,
    message: JSONRPCMessage
  ): Promise<void> {
    console.error(`Manually processing JSON-RPC message:`, JSON.stringify(message));

    if ('id' in message && message.id !== undefined) {
      const request = message as JSONRPCRequest;

      try {
        // Access the server's internal request handlers
        const serverAny = server as any;
        const handlers = serverAny._requestHandlers;

        let result: any;

        if (request.method === 'tools/list') {
          const handler = handlers?.get('tools/list');
          if (handler) {
            result = await handler(request, {});
          } else {
            throw new Error('tools/list handler not found');
          }
        } else if (request.method === 'tools/call') {
          const handler = handlers?.get('tools/call');
          if (handler) {
            result = await handler(request, {});
          } else {
            throw new Error('tools/call handler not found');
          }
        } else {
          throw new Error(`Unknown method: ${request.method}`);
        }

        const response: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result: result
        };

        // Send response through SSE transport
        await transport.send(response);
        console.error(`Sent JSON-RPC response:`, JSON.stringify(response));

      } catch (error) {
        const errorResponse = {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        };

        await transport.send(errorResponse);
        console.error(`Sent JSON-RPC error response:`, JSON.stringify(errorResponse));
      }
    }
  }

  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      server: Config.SERVER_NAME,
      version: Config.SERVER_VERSION,
    });
  });

  // Legacy SSE endpoint for older clients (official backwards compatibility)
  app.get('/sse', async (req, res) => {
    console.error('New SSE connection request received');

    try {
      // Create SSE transport for legacy clients using the official SDK
      const transport = new SSEServerTransport('/messages', res);
      transports[transport.sessionId] = transport;

      console.error(`SSE transport created with session ID: ${transport.sessionId}`);

      // Set up cleanup when connection closes
      res.on("close", () => {
        console.error(`SSE connection closed for session ${transport.sessionId}`);
        delete transports[transport.sessionId];
      });

      // Connect the MCP server to the transport (official pattern)
      await server.connect(transport);
      console.error(`MCP server connected for session ${transport.sessionId}`);

    } catch (error) {
      console.error('Error setting up SSE transport:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  // Legacy message endpoint for older clients (hybrid approach)
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];

    if (!transport) {
      console.error(`No transport found for session ID: ${sessionId}`);
      return res.status(400).send('No transport found for sessionId');
    }

    try {
      console.error(`Processing MCP message for session ${sessionId}:`, JSON.stringify(req.body));

      // Parse and validate the JSON-RPC message
      const message = JSONRPCMessageSchema.parse(req.body);

      // Use our manual handler instead of the broken handlePostMessage
      await handleJsonRpcMessage(transport, message);

      // Return accepted status - the actual response goes through SSE
      res.status(202).send('Accepted');

    } catch (error) {
      console.error('Error processing MCP message:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error processing message'
          },
          id: null
        });
      }
    }
  });

  // Start the server
  app.listen(port, () => {
    console.error(`MCP Web Server running at http://localhost:${port}`);
    console.error(`- SSE Endpoint: http://localhost:${port}/sse`);
    console.error(`- Messages Endpoint: http://localhost:${port}/messages?sessionId=YOUR_SESSION_ID`);
    console.error(`- Health Check: http://localhost:${port}/health`);
  });

  return app;
}
