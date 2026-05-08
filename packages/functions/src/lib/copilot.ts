import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  type ConversationReference as BotConversationReference,
  CardFactory,
  type Activity,
} from 'botbuilder';
import type { ConversationReference } from '@gigflow/shared';
import { env } from './env.js';
import { getSecret } from './key-vault.js';
import { logger } from './logger.js';

let adapter: CloudAdapter | null = null;
let appId: string | null = null;

async function getAdapter(): Promise<{ adapter: CloudAdapter; appId: string } | null> {
  const id = env.botAppId();
  if (!id) {
    logger.warn('BOT_APP_ID not set; copilot proactive disabled');
    return null;
  }
  if (adapter && appId === id) return { adapter, appId: id };

  const password = await getSecret(env.botClientSecretName()).catch((err) => {
    logger.warn({ err: String(err) }, 'cannot load bot client secret');
    return null;
  });
  if (!password) return null;

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: id,
    MicrosoftAppPassword: password,
    MicrosoftAppType: 'MultiTenant',
    MicrosoftAppTenantId: '',
  });
  const botFrameworkAuthentication =
    createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

  adapter = new CloudAdapter(botFrameworkAuthentication);
  appId = id;
  return { adapter, appId: id };
}

export async function sendAdaptiveCard(opts: {
  conversationRef: ConversationReference;
  card: Record<string, unknown>;
}): Promise<void> {
  const a = await getAdapter();
  if (!a) {
    logger.warn('skipping proactive card send (adapter unavailable)');
    return;
  }
  const ref = opts.conversationRef as unknown as Partial<BotConversationReference>;
  await a.adapter.continueConversationAsync(
    a.appId,
    ref as BotConversationReference,
    async (ctx) => {
      const activity: Partial<Activity> = {
        attachments: [CardFactory.adaptiveCard(opts.card)],
      };
      await ctx.sendActivity(activity);
    },
  );
}
