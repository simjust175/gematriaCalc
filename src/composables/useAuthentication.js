const INITIALIZATION_RETRY_DELAYS = [250, 400, 600, 800, 1000, 1200, 1500];

function pause(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Keep the loading view in place while a newly started production API finishes
 * initializing. Other failures remain unauthenticated rather than looping.
 */
export async function resolveAuthentication(fetchFn = fetch, wait = pause) {
  for (let attempt = 0; attempt <= INITIALIZATION_RETRY_DELAYS.length; attempt += 1) {
    try {
      const response = await fetchFn('/api/auth/check');
      if (response.status === 503 && attempt < INITIALIZATION_RETRY_DELAYS.length) {
        await wait(INITIALIZATION_RETRY_DELAYS[attempt]);
        continue;
      }
      if (!response.ok) return 'unauthenticated';
      const data = await response.json();
      return data.authenticated ? 'authenticated' : 'unauthenticated';
    } catch {
      return 'unauthenticated';
    }
  }
  return 'unauthenticated';
}