import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ browser }) => {
  // Login via API
  const apiContext = await browser.newContext();
  const res = await apiContext.request.post('http://localhost:8000/api/auth/login', {
    data: { username: 'admin', password: 'admin123' },
  });
  const body = await res.json();
  const { access_token, user } = body.data;
  await apiContext.close();

  // Create context with token pre-populated in localStorage
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3000',
          localStorage: [
            { name: 'token', value: access_token },
            { name: 'user', value: JSON.stringify(user) },
          ],
        },
      ],
    },
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForTimeout(1500);

  const url = page.url();
  if (url.includes('/login')) {
    throw new Error('Auth failed — still on login page');
  }

  await page.context().storageState({ path: authFile });
  await context.close();
});
