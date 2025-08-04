/**
 * Web server setup for HTTP-based MCP communication using Express
 * Custom SSE implementation that properly handles MCP JSON-RPC requests/responses
 */
import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  JSONRPCMessageSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Config } from './config.js';

interface AuthInfo {
  token?: string;
}

/**
 * Custom SSE Transport that properly handles MCP JSON-RPC communication
 */
class CustomSSETransport implements Transport {
  private _sessionId: string;
  private response: express.Response;
  private messageUrl: string;
  private server?: Server;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage, extra?: { authInfo?: AuthInfo }) => void;

  constructor(messageUrl: string, response: express.Response) {
    this._sessionId = uuid();
    this.response = response;
    this.messageUrl = messageUrl;

    // Set up SSE headers
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Set up cleanup when connection closes
    this.response.on("close", () => {
      console.error(`SSE connection closed for session ${this._sessionId}`);
      if (this.onclose) {
        this.onclose();
      }
    });

    this.response.on("error", (error) => {
      console.error(`SSE connection error for session ${this._sessionId}:`, error);
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  get sessionId(): string {
    return this._sessionId;
  }

  async start(): Promise<void> {
    if (this.response.destroyed) {
      throw new Error('SSE transport already closed!');
    }

    // Send the endpoint information
    this.writeSSE('endpoint', `${this.messageUrl}?sessionId=${this._sessionId}`);

    // Send session ID and connection info
    this.writeSSE('session', JSON.stringify({
      type: 'session_id',
      session_id: this._sessionId,
    }));

    // Send a welcome notification
    await this.send({
      jsonrpc: '2.0',
      method: 'notification',
      params: {
        type: 'welcome',
        clientInfo: {
          sessionId: this._sessionId,
          serverName: Config.SERVER_NAME,
          serverVersion: Config.SERVER_VERSION,
        },
      },
    });
  }

  async close(): Promise<void> {
    if (!this.response.destroyed) {
      this.response.end();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.response.destroyed) {
      throw new Error('Not connected');
    }

    this.writeSSE('message', JSON.stringify(message));
  }

  private writeSSE(event: string, data: string): void {
    if (!this.response.destroyed) {
      this.response.write(`event: ${event}\n`);
      this.response.write(`data: ${data}\n\n`);
    }
  }

  // Handle incoming JSON-RPC messages and route them to the MCP server
  async handleMessage(message: JSONRPCMessage, authInfo?: AuthInfo): Promise<void> {
    if (!this.server) {
      throw new Error('MCP server not connected to transport');
    }

    try {
      console.error(`Processing MCP message: ${JSON.stringify(message)}`);

      // For requests, we need to handle the response
      if ('id' in message && message.id !== undefined) {
        const request = message as JSONRPCRequest;

        // Route the request to the appropriate handler
        let response: any;

        try {
          // Use the server's internal request handling
          const result = await this.routeRequest(request, authInfo);
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: result
          };
        } catch (error) {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error'
            }
          };
        }

        // Send the response back through SSE
        await this.send(response);
        console.error(`Sent MCP response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      console.error('Error handling MCP message:', error);
      if (this.onerror) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Route requests to the appropriate MCP server handlers
  private async routeRequest(request: JSONRPCRequest, authInfo?: AuthInfo): Promise<any> {
    if (!this.server) {
      throw new Error('MCP server not connected');
    }

    // Access the server's request handlers through its internal methods
    // This is a bit of a hack, but necessary since the MCP SDK doesn't expose
    // a clean way to manually route requests
    const serverAny = this.server as any;

    if (request.method === 'tools/list') {
      // Call the tools/list handler directly
      const handlers = serverAny._requestHandlers;
      const handler = handlers?.get('tools/list');
      if (handler) {
        return await handler(request, { authInfo });
      }
    } else if (request.method === 'tools/call') {
      const handlers = serverAny._requestHandlers;
      const handler = handlers?.get('tools/call');
      if (handler) {
        return await handler(request, { authInfo });
      }
    }

    throw new Error(`Unknown method: ${request.method}`);
  }

  // Connect to the MCP server
  connectToServer(server: Server): void {
    this.server = server;
  }
}

/**
 * Sets up a web server for the MCP server using Server-Sent Events (SSE)
 * Custom implementation that properly handles MCP JSON-RPC communication
 *
 * @param server The MCP Server instance
 * @param port The port to listen on (default: 3000)
 * @returns The Express app instance
 */
export async function setupWebServer(server: Server, port = 3000) {
  // Create Express app
  const app = express();

  // Enable JSON parsing
  app.use(express.json());

  // Enable CORS
  app.use(cors());

  // Store active SSE transports by session ID
  const transports: { [sessionId: string]: CustomSSETransport } = {};

  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      server: Config.SERVER_NAME,
      version: Config.SERVER_VERSION,
    });
  });

  // SSE endpoint using custom transport
  app.get('/sse', async (req, res) => {
    console.error('New SSE connection request received');

    try {
      // Create custom SSE transport
      const transport = new CustomSSETransport('/api/messages', res);
      transports[transport.sessionId] = transport;

      console.error(`Custom SSE transport created with session ID: ${transport.sessionId}`);

      // Set up cleanup when connection closes
      transport.onclose = () => {
        console.error(`SSE connection closed for session ${transport.sessionId}`);
        delete transports[transport.sessionId];
      };

      transport.onerror = (error) => {
        console.error(`SSE connection error for session ${transport.sessionId}:`, error);
        delete transports[transport.sessionId];
      };

      // Connect the MCP server to the transport
      transport.connectToServer(server);
      await transport.start();
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

  // Message endpoint using custom transport
  app.post('/api/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      console.error('Missing sessionId in request');
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Missing sessionId query parameter'
        },
        id: null
      });
    }

    const transport = transports[sessionId];

    if (!transport) {
      console.error(`No transport found for session ID: ${sessionId}`);
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'No active session found with the provided sessionId'
        },
        id: null
      });
    }

    try {
      // Parse and validate the JSON-RPC message
      const message = JSONRPCMessageSchema.parse(req.body);

      // Handle the message through our custom transport
      await transport.handleMessage(message, {
        token: req.headers['x-api-key'] as string
      });

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
    console.error(`- Messages Endpoint: http://localhost:${port}/api/messages?sessionId=YOUR_SESSION_ID`);
    console.error(`- Health Check: http://localhost:${port}/health`);
  });

  return app;
}
