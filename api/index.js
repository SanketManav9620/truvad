import { handleRequest } from '../server.js';

/**
 * Vercel Serverless Function Adapter
 * Adapts incoming HTTP request/response to the core GRIP handleRequest handler.
 */
export default async function handler(req, res) {
  return handleRequest(req, res);
}
