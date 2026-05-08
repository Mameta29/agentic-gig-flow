import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from './env.js';

let client: SecretClient | null = null;
const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

function getClient(): SecretClient {
  if (client) return client;
  const vaultUrl = `https://${env.keyVaultName()}.vault.azure.net`;
  client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  return client;
}

export async function getSecret(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const secret = await getClient().getSecret(name);
  if (!secret.value) throw new Error(`secret has no value: ${name}`);
  cache.set(name, { value: secret.value, expiresAt: Date.now() + TTL_MS });
  return secret.value;
}

export function clearSecretCache(): void {
  cache.clear();
}
