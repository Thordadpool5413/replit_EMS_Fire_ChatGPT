export type AgencyWorkspaceAccess =
  | 'editor'
  | 'viewer'
  | 'sign-in-required'
  | 'no-access'
  | 'unavailable';

interface AccessResponse {
  role?: 'editor' | 'viewer' | null;
}

export async function loadAgencyWorkspaceAccess(
  fetcher: typeof fetch = fetch,
): Promise<AgencyWorkspaceAccess> {
  let response: Response;
  try {
    response = await fetcher('/api/agencies/access', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return 'unavailable';
  }
  if (response.status === 401) return 'sign-in-required';
  if (response.status === 403) return 'no-access';
  if (!response.ok) return 'unavailable';
  let result: AccessResponse;
  try {
    result = await response.json() as AccessResponse;
  } catch {
    return 'unavailable';
  }
  if (result.role === 'editor' || result.role === 'viewer') return result.role;
  return 'no-access';
}
