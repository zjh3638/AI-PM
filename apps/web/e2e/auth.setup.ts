import { test as setup } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ browser }) => {
  // Login via API to get real token
  const apiContext = await browser.newContext();
  const res = await apiContext.request.post('http://localhost:8090/api/auth/login', {
    data: { username: 'admin', password: 'admin123' },
  });
  const body = await res.json();
  const { access_token, user } = body.data;
  await apiContext.close();

  // Create a new context with localStorage pre-populated
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3090',
          localStorage: [
            { name: 'token', value: access_token },
            { name: 'user', value: JSON.stringify(user) },
          ],
        },
      ],
    },
  });

  const page = await context.newPage();

  // Navigate — should skip login since token is already in localStorage
  await page.goto('http://localhost:3090/dashboard');
  await page.waitForTimeout(1500);

  // Verify we're not on the login page
  const url = page.url();
  if (url.includes('/login')) {
    throw new Error('Auth failed — still on login page. Token may be invalid.');
  }

  await page.context().storageState({ path: authFile });
  await context.close();
});
