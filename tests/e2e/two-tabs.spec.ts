import { test, expect, Page } from '@playwright/test';

test('two tabs can bid and play the opening trick', async ({ page, browser }) => {
  const host = page;
  await host.goto('/');
  await host.getByLabel('Display Name').fill('Host E2E');

  const createResponsePromise = host.waitForResponse((response) =>
    response.url().includes('/api/create-room') && response.request().method().toUpperCase() === 'POST',
  );
  await host.getByRole('button', { name: 'Start Private Room' }).click();
  const createResponse = await createResponsePromise;
  const createPayload = (await createResponse.json()) as { gameId: string; joinCode: string };
  await host.waitForURL(new RegExp(`/game/${createPayload.gameId}$`));
  await expect(host.locator('.player-list')).toContainText('Host E2E');

  const guest = await browser.newPage();
  await guest.goto('/join');
  await guest.getByLabel('Join Code').fill(createPayload.joinCode);
  await guest.getByLabel('Display Name').fill('Guest E2E');
  const joinResponsePromise = guest.waitForResponse((response) =>
    response.url().includes('/api/join-by-code') && response.request().method().toUpperCase() === 'POST',
  );
  await guest.getByRole('button', { name: 'Join Table' }).click();
  await joinResponsePromise;
  await guest.waitForURL(new RegExp(`/game/${createPayload.gameId}$`));

  await expect(host.locator('.player-list')).toContainText('Guest E2E');
  await expect(guest.locator('.player-list')).toContainText('Host E2E');

  await submitBid(host, '2', false);
  await submitBid(guest, '1', true);

  await waitForHand(host);
  await waitForHand(guest);

  const hostCard = host.locator('.hand-grid button').first();
  await expect(hostCard).toBeEnabled();
  const hostSuit = (await hostCard.getAttribute('data-suit')) ?? undefined;
  await hostCard.click();

  const guestCard = await pickPlayableCard(guest, hostSuit);
  await expect(guestCard).toBeEnabled();
  await guestCard.click();

  await expect(host.locator('.trick-area header p').first()).toHaveText(/1 completed/i);
  await guest.close();
});

async function submitBid(page: Page, value: string, waitForClose: boolean) {
  const modal = page.locator('.modal-overlay');
  await modal.waitFor({ state: 'visible' });
  await modal.getByRole('button', { name: value, exact: true }).click();
  if (waitForClose) {
    await modal.waitFor({ state: 'detached' });
  }
}

async function waitForHand(page: Page) {
  await page.waitForSelector('.hand-grid button', { state: 'visible' });
}

async function pickPlayableCard(page: Page, requiredSuit?: string) {
  if (requiredSuit) {
    const matching = page.locator(`.hand-grid button[data-suit="${requiredSuit}"]`).first();
    if (await matching.count()) {
      return matching;
    }
  }
  return page.locator('.hand-grid button').first();
}
