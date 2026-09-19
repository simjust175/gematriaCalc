import express from 'express';
import { app as legacyApp } from './app.js';
import { multiUserApp } from './multiUserApp.js';

const MULTI_USER_AUTH_PATHS = new Set([
  '/api/auth/account-login',
  '/api/auth/signup',
]);

function sessionIdFromRequest(req) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)connect\.sid=([^;]+)/)?.[1];
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie).replace(/^s:/, '').split('.')[0];
  } catch {
    return '';
  }
}

export function requestUsesMultiUserDatabase(req) {
  if (MULTI_USER_AUTH_PATHS.has(req.path)) return true;
  if (req.path === '/api/auth/login') return false;
  return sessionIdFromRequest(req).startsWith('multi:');
}

export const app = express();

app.use((req, res, next) => {
  const target = requestUsesMultiUserDatabase(req) ? multiUserApp : legacyApp;
  return target(req, res, next);
});