import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { BillingService } from '../billing/billing.service';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../database/prisma.service';
import * as jwt from 'jsonwebtoken';
import { env } from '../config/env';

type MetaWebhookStatus = {
id?: string;
status?: string;
timestamp?: string;
errors?: Array<{
 code?: number;
 title?: string;
 message?: string;
 error_data?: {
   details?: string;
 };
}>;
};

type MetaWebhookBody = {
object?: string;
entry?: Array<{
 changes?: Array<{
   value?: {
     metadata?: {
       phone_number_id?: string;
     };
     statuses?: MetaWebhookStatus[];
   };
 }>;
}>;
};

type EmbeddedSignupPhone = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
};

type EmbeddedSignupWaba = {
  id?: string;
  name?: string;
  phone_numbers?: {
    data?: EmbeddedSignupPhone[];
  };
};

type EmbeddedSignupBusiness = {
  id?: string;
  name?: string;
};

type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  role: string;
};

type EmbeddedSignupStatePayload = {
  sub: string;
  tenantId: string;
  purpose: 'embedded_signup';
};

type EmbeddedSignupSelectionInput = {
code?: string;
wabaId?: string;
phoneNumberId?: string;
businessName?: string;
qualityRating?: string;
messagingLimitTier?: string;
};

type SaveConnectedMetaAccountInput = {
  tenantId: string
  metaAppId: string
  wabaId: string
  phoneNumberId: string
  businessName: string | null
  encryptedAccessToken: string
  qualityRating: string | null
  messagingLimitTier: string | null
}

@Injectable()
export class MetaAccountsService {
constructor(
private readonly prisma: PrismaService,
private readonly cryptoService: CryptoService,
private readonly billingService: BillingService,
) {}

  private async saveConnectedMetaAccount(
    input: SaveConnectedMetaAccountInput,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingOwner =
          await transaction.tenantMetaAccount.findUnique({
            where: {
              phoneNumberId: input.phoneNumberId,
            },
            select: {
              id: true,
              tenantId: true,
              wabaId: true,
            },
          })

        if (
          existingOwner &&
          (existingOwner.tenantId !== input.tenantId ||
            existingOwner.wabaId !== input.wabaId)
        ) {
          throw new ConflictException(
            'This WhatsApp phone number is already connected to another workspace',
          )
        }

        const account = await transaction.tenantMetaAccount.upsert({
          where: {
            tenantId_wabaId: {
              tenantId: input.tenantId,
              wabaId: input.wabaId,
            },
          },
          update: {
            metaAppId: input.metaAppId,
            phoneNumberId: input.phoneNumberId,
            businessName: input.businessName,
            encryptedAccessToken: input.encryptedAccessToken,
            tokenLastUpdatedAt: new Date(),
            qualityRating: input.qualityRating,
            messagingLimitTier: input.messagingLimitTier,
            qualitySyncedAt: new Date(),
            isActive: true,
          },
          create: {
            tenantId: input.tenantId,
            metaAppId: input.metaAppId,
            wabaId: input.wabaId,
            phoneNumberId: input.phoneNumberId,
            businessName: input.businessName,
            encryptedAccessToken: input.encryptedAccessToken,
            tokenLastUpdatedAt: new Date(),
            qualityRating: input.qualityRating,
            messagingLimitTier: input.messagingLimitTier,
            qualitySyncedAt: new Date(),
            isActive: true,
          },
        })

        await transaction.tenantMetaAccount.updateMany({
          where: {
            tenantId: input.tenantId,
            isActive: true,
            id: {
              not: account.id,
            },
          },
          data: {
            isActive: false,
          },
        })

        return account
      })
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This WhatsApp phone number is already connected to another workspace',
        )
      }

      throw error
    }
  }

getEmbeddedSignupConfig() {
  const appId = String(process.env.META_APP_ID || '').trim();
  const configId = String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim();
  const redirectUri = String(
    process.env.META_EMBEDDED_SIGNUP_REDIRECT_URI || '',
  ).trim();
  const apiVersion = String(process.env.META_GRAPH_API_VERSION || 'v20.0').trim();
const featureType = String(
 process.env.META_EMBEDDED_SIGNUP_FEATURE_TYPE ||
   'whatsapp_business_app_onboarding',
).trim();
  const isConfigured = Boolean(appId && configId && redirectUri);

  return {
    isConfigured,
    appId: isConfigured ? appId : null,
    configId: isConfigured ? configId : null,
    redirectUri: isConfigured ? redirectUri : null,
    apiVersion,
    featureType,
    missing: {
      appId: !appId,
      configId: !configId,
      redirectUri: !redirectUri,
    },
  };
}

getEmbeddedSignupStartUrl(user: AuthenticatedUser) {
  const config = this.getEmbeddedSignupConfig();

  if (!config.isConfigured || !config.appId || !config.configId || !config.redirectUri) {
    throw new BadRequestException(
      'Meta Embedded Signup backend configuration is incomplete',
    );
  }

  const state = jwt.sign(
    {
      sub: user.userId,
      tenantId: user.tenantId,
      purpose: 'embedded_signup',
    },
    env.jwtSecret,
    {
      expiresIn: '10m',
    },
  );

  const signupUrl = new URL(
    `https://www.facebook.com/${config.apiVersion}/dialog/oauth`,
  );

signupUrl.searchParams.set('client_id', config.appId);
signupUrl.searchParams.set('redirect_uri', config.redirectUri);
signupUrl.searchParams.set('response_type', 'code');
signupUrl.searchParams.set('config_id', config.configId);
signupUrl.searchParams.set(
 'scope',
 [
   'business_management',
   'whatsapp_business_management',
   'whatsapp_business_messaging',
 ].join(','),
);
signupUrl.searchParams.set(
'extras',
JSON.stringify({
 featureType: config.featureType,
}),
);

signupUrl.searchParams.set('state', state);
return {
 url: signupUrl.toString(),
 expiresInSeconds: 600,
};
}

async verifyEmbeddedSignupState(state: string): Promise<AuthenticatedUser> {
if (!state) {
 throw new UnauthorizedException('Missing Embedded Signup state');
}

try {
 const payload = jwt.verify(state, env.jwtSecret) as EmbeddedSignupStatePayload;

 if (
   payload.purpose !== 'embedded_signup' ||
   !payload.sub ||
   !payload.tenantId
 ) {
   throw new UnauthorizedException('Invalid Embedded Signup state');
 }

 const user = await this.prisma.user.findFirst({
   where: {
     id: payload.sub,
     tenantId: payload.tenantId,
     isActive: true,
   },
   include: {
     tenant: true,
   },
 });

 if (
   !user ||
   user.tenant.status !== 'active' ||
   !user.emailVerifiedAt
 ) {
   throw new UnauthorizedException('Invalid Embedded Signup session');
 }

 return {
   userId: user.id,
   tenantId: user.tenantId,
   role: user.role,
 };
} catch {
 throw new UnauthorizedException('Invalid or expired Embedded Signup state');
}
}

async connectFromEmbeddedSignup(tenantId: string, code: string) {
  if (!code) {
    throw new BadRequestException('Facebook authorization code is required');
  }

  await this.assertTenantCanConnectWhatsApp(tenantId);

  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const redirectUri = String(
    process.env.META_EMBEDDED_SIGNUP_REDIRECT_URI || '',
  ).trim();

  if (!appId || !appSecret || !redirectUri) {
    throw new BadRequestException(
      'Meta Embedded Signup backend configuration is incomplete',
    );
  }

  const accessToken = await this.exchangeEmbeddedSignupCode({
    appId,
    appSecret,
    redirectUri,
    code,
  });

  const connectedAccount = await this.findConnectedWhatsAppAccount(accessToken);

  if (!connectedAccount.wabaId || !connectedAccount.phoneNumberId) {
    throw new BadRequestException(
      'No WhatsApp Business account or phone number found from Embedded Signup',
    );
  }

  const encryptedAccessToken = this.cryptoService.encrypt(accessToken);

  const account = await this.saveConnectedMetaAccount({
    tenantId,
    metaAppId: appId,
    wabaId: connectedAccount.wabaId,
    phoneNumberId: connectedAccount.phoneNumberId,
    businessName: connectedAccount.businessName,
    encryptedAccessToken,
    qualityRating: connectedAccount.qualityRating,
    messagingLimitTier: connectedAccount.messagingLimitTier,
  })

  return {
    connected: true,
    account: {
      id: account.id,
      metaAppId: account.metaAppId,
      wabaId: account.wabaId,
      phoneNumberId: account.phoneNumberId,
      businessName: account.businessName,
      qualityRating: account.qualityRating,
      messagingLimitTier: account.messagingLimitTier,
      isActive: account.isActive,
    },
  };
}

async connectFromEmbeddedSignupSelection(
tenantId: string,
input: EmbeddedSignupSelectionInput,
) {
const code = String(input.code || '').trim();
const wabaId = String(input.wabaId || '').trim();
const phoneNumberId = String(input.phoneNumberId || '').trim();

if (!code) {
 throw new BadRequestException('Facebook authorization code is required');
}

if (!wabaId) {
 throw new BadRequestException('WhatsApp Business Account ID is required');
}

if (!phoneNumberId) {
 throw new BadRequestException('WhatsApp phone number ID is required');
}

await this.assertTenantCanConnectWhatsApp(tenantId);

const appId = String(process.env.META_APP_ID || '').trim();
const appSecret = String(process.env.META_APP_SECRET || '').trim();

if (!appId || !appSecret) {
  throw new BadRequestException(
    'Meta Embedded Signup backend configuration is incomplete',
  );
}

const accessToken = await this.exchangeEmbeddedSignupCode({
  appId,
  appSecret,
  code,
});

let selectedPhone: {
businessName: string | null;
qualityRating: string | null;
messagingLimitTier: string | null;
} = {
businessName: null,
qualityRating: null,
messagingLimitTier: null,
};

try {
selectedPhone = await this.getSelectedPhoneDetails(
 phoneNumberId,
 accessToken,
);
} catch {
selectedPhone = {
 businessName: String(input.businessName || '').trim() || null,
 qualityRating: String(input.qualityRating || '').trim() || null,
 messagingLimitTier: String(input.messagingLimitTier || '').trim() || null,
};
}

const encryptedAccessToken = this.cryptoService.encrypt(accessToken);

const account = await this.saveConnectedMetaAccount({
  tenantId,
  metaAppId: appId,
  wabaId,
  phoneNumberId,
  businessName:
    String(input.businessName || '').trim() ||
    selectedPhone.businessName ||
    null,
  encryptedAccessToken,
  qualityRating:
    String(input.qualityRating || '').trim() ||
    selectedPhone.qualityRating,
  messagingLimitTier:
    String(input.messagingLimitTier || '').trim() ||
    selectedPhone.messagingLimitTier,
})

return {
 connected: true,
 account: {
   id: account.id,
   metaAppId: account.metaAppId,
   wabaId: account.wabaId,
   phoneNumberId: account.phoneNumberId,
   businessName: account.businessName,
   qualityRating: account.qualityRating,
   messagingLimitTier: account.messagingLimitTier,
   isActive: account.isActive,
 },
};
}

private async exchangeEmbeddedSignupCode(input: {
appId: string;
appSecret: string;
redirectUri?: string;
code: string;
}) {
  const apiVersion = String(process.env.META_GRAPH_API_VERSION || 'v20.0').trim();
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
  );

  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('client_secret', input.appSecret);
  if (input.redirectUri) {
 url.searchParams.set('redirect_uri', input.redirectUri);
}
  url.searchParams.set('code', input.code);

  const response = await fetch(url.toString());
  const data = await response.json();

if (!response.ok) {
 const metaError = data?.error as
   | {
       message?: string;
       type?: string;
       code?: number;
       error_subcode?: number;
       fbtrace_id?: string;
     }
   | undefined;

 throw new BadRequestException(
   metaError?.message ||
     'Failed to exchange Facebook authorization code',
 );
}

  const accessToken = String(data.access_token || '').trim();

  if (!accessToken) {
    throw new BadRequestException('Meta did not return an access token');
  }

  return accessToken;
}

private async assertTenantCanConnectWhatsApp(tenantId: string) {
await this.billingService.assertSubscriptionCanUseWorkspace(
 tenantId,
 'connecting WhatsApp',
);
}

private async getSelectedPhoneDetails(phoneNumberId: string, accessToken: string) {
const apiVersion = String(process.env.META_GRAPH_API_VERSION || 'v20.0').trim();

const response = await fetch(
 `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier`,
 {
   headers: {
     Authorization: `Bearer ${accessToken}`,
   },
 },
);

const data: {
 verified_name?: string;
 display_phone_number?: string;
 quality_rating?: string;
 messaging_limit_tier?: string;
 error?: unknown;
} = await response.json();

if (!response.ok) {
 throw new BadRequestException({
   message: 'Failed to verify selected WhatsApp phone number',
   metaError: data,
 });
}

return {
 businessName:
   String(data.verified_name || '').trim() ||
   String(data.display_phone_number || '').trim() ||
   null,
 qualityRating: String(data.quality_rating || '').trim() || null,
 messagingLimitTier:
   String(data.messaging_limit_tier || '').trim() || null,
};
}

private async findConnectedWhatsAppAccount(accessToken: string): Promise<{
businessName: string | null;
wabaId: string;
phoneNumberId: string;
qualityRating: string | null;
messagingLimitTier: string | null;
}> {
  const apiVersion = String(process.env.META_GRAPH_API_VERSION || 'v20.0').trim();

  const businessesResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/me/businesses?fields=id,name&limit=25`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const businessesData = await businessesResponse.json();

  if (!businessesResponse.ok) {
    throw new BadRequestException({
      message: 'Failed to fetch Meta businesses for connected user',
      metaError: businessesData,
    });
  }

  const businesses = Array.isArray(businessesData.data)
    ? (businessesData.data as EmbeddedSignupBusiness[])
    : [];

  for (const business of businesses) {
    const businessId = String(business.id || '').trim();

    if (!businessId) {
      continue;
    }

 const wabaEdges = [
   'client_whatsapp_business_accounts',
   'owned_whatsapp_business_accounts',
 ];

 for (const edge of wabaEdges) {
   const wabaResponse = await fetch(
     `https://graph.facebook.com/${apiVersion}/${businessId}/${edge}?fields=id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,messaging_limit_tier}&limit=25`,
     {
       headers: {
         Authorization: `Bearer ${accessToken}`,
       },
     },
   );

   const wabaData = await wabaResponse.json();

   if (!wabaResponse.ok) {
     continue;
   }

   const wabas = Array.isArray(wabaData.data)
     ? (wabaData.data as EmbeddedSignupWaba[])
     : [];

   for (const waba of wabas) {
     const wabaId = String(waba.id || '').trim();
     const phones = Array.isArray(waba.phone_numbers?.data)
       ? waba.phone_numbers.data
       : [];
     const phone = phones.find((item) => String(item.id || '').trim());

     if (!wabaId || !phone?.id) {
       continue;
     }

     return {
       businessName:
         String(phone.verified_name || '').trim() ||
         String(waba.name || '').trim() ||
         String(business.name || '').trim() ||
         null,
       wabaId,
       phoneNumberId: String(phone.id).trim(),
       qualityRating: String(phone.quality_rating || '').trim() || null,
       messagingLimitTier:
         String(phone.messaging_limit_tier || '').trim() || null,
     };
   }
 }
}

throw new BadRequestException(
 'No connected WhatsApp Business phone number was found',
);
}

async syncActivePhoneQuality(tenantId: string) {
  const account = await this.prisma.tenantMetaAccount.findFirst({
    where: {
      tenantId,
      isActive: true,
    },
  });

  if (!account) {
    throw new NotFoundException('Meta account is not connected');
  }

  const accessToken = this.cryptoService.decrypt(account.encryptedAccessToken);
  const apiVersion = String(process.env.META_GRAPH_API_VERSION || 'v20.0').trim();

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${account.phoneNumberId}?fields=quality_rating,messaging_limit_tier,verified_name,display_phone_number`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new BadRequestException({
      message: 'Failed to sync WhatsApp phone quality/tier',
      metaError: data,
    });
  }

  const qualityRating = String(data.quality_rating || '').trim() || null;
  const messagingLimitTier =
    String(data.messaging_limit_tier || '').trim() || null;
  const businessName =
    String(data.verified_name || '').trim() || account.businessName;

  const updatedAccount = await this.prisma.tenantMetaAccount.update({
    where: {
      id: account.id,
    },
    data: {
      qualityRating,
      messagingLimitTier,
      businessName,
      qualitySyncedAt: new Date(),
    },
  });

  return {
    ok: true,
    account: {
      id: updatedAccount.id,
      metaAppId: updatedAccount.metaAppId,
      wabaId: updatedAccount.wabaId,
      phoneNumberId: updatedAccount.phoneNumberId,
      businessName: updatedAccount.businessName,
      qualityRating: updatedAccount.qualityRating,
      messagingLimitTier: updatedAccount.messagingLimitTier,
      qualitySyncedAt: updatedAccount.qualitySyncedAt,
      isActive: updatedAccount.isActive,
      tokenLastUpdatedAt: updatedAccount.tokenLastUpdatedAt,
      createdAt: updatedAccount.createdAt,
      updatedAt: updatedAccount.updatedAt,
    },
  };
}

async getActiveMetaAccount(tenantId: string) {
 const account = await this.prisma.tenantMetaAccount.findFirst({
   where: {
     tenantId,
     isActive: true,
   },
   orderBy: {
     updatedAt: 'desc',
   },
 });

 if (!account) {
   return {
     connected: false,
     account: null,
   };
 }

 return {
   connected: true,
   account: {
     id: account.id,
     metaAppId: account.metaAppId,
     wabaId: account.wabaId,
     phoneNumberId: account.phoneNumberId,
     businessName: account.businessName,
     qualityRating: account.qualityRating,
     messagingLimitTier: account.messagingLimitTier,
     qualitySyncedAt: account.qualitySyncedAt,
     isActive: account.isActive,
     tokenLastUpdatedAt: account.tokenLastUpdatedAt,
     createdAt: account.createdAt,
     updatedAt: account.updatedAt,
   },
 };
}

async testActiveConnection(tenantId: string) {
await this.billingService.assertSubscriptionCanUseWorkspace(
tenantId,
'testing Meta connection',
);

const account = await this.prisma.tenantMetaAccount.findFirst({
   where: {
     tenantId,
     isActive: true,
   },
 });

 if (!account) {
   throw new NotFoundException('Meta account is not connected');
 }

 const accessToken = this.cryptoService.decrypt(account.encryptedAccessToken);
 const apiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';

 const response = await fetch(
   `https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates?limit=1`,
   {
     headers: {
       Authorization: `Bearer ${accessToken}`,
     },
   },
 );

 const data = await response.json();

 if (!response.ok) {
   throw new BadRequestException({
     message: 'Meta connection test failed',
     metaError: data,
   });
 }

 return {
   ok: true,
   metaAppId: account.metaAppId,
   wabaId: account.wabaId,
   phoneNumberId: account.phoneNumberId,
 };
}

async getActiveConnectionSecret(tenantId: string) {
 const account = await this.prisma.tenantMetaAccount.findFirst({
   where: {
     tenantId,
     isActive: true,
   },
 });

 if (!account) {
   throw new NotFoundException('Meta account is not connected');
 }

 return {
   metaAppId: account.metaAppId,
   wabaId: account.wabaId,
   phoneNumberId: account.phoneNumberId,
   accessToken: this.cryptoService.decrypt(account.encryptedAccessToken),
 };
}

verifyWebhookChallenge(query: Record<string, string>) {
 const mode = String(query['hub.mode'] || '').trim();
 const token = String(query['hub.verify_token'] || '').trim();
 const challenge = String(query['hub.challenge'] || '').trim();
 const expectedToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();

 if (!expectedToken) {
   throw new BadRequestException('META_WEBHOOK_VERIFY_TOKEN is required');
 }

 if (mode === 'subscribe' && token === expectedToken && challenge) {
   return challenge;
 }

 throw new UnauthorizedException('Invalid Meta webhook verification request');
}

async handleWebhookEvent(input: {
signature: string;
rawBody?: Buffer;
body: Record<string, unknown>;
}) {
this.verifyWebhookSignature(input.signature, input.rawBody, input.body);

const body = input.body as MetaWebhookBody;
const phoneNumberId = this.extractWebhookPhoneNumberId(body);
const tenantId = await this.resolveTenantIdFromWebhookPhone(phoneNumberId);

const webhookEvent = await this.prisma.webhookEvent.create({
 data: {
   tenantId,
   source: 'META',
   status: 'PROCESSING',
   metaObject: String(body.object || '').trim() || null,
   phoneNumberId,
   payload: body as Prisma.InputJsonValue,
 },
});

try {
 const result = await this.processWebhookBody(body, tenantId);

 await this.prisma.webhookEvent.update({
   where: {
     id: webhookEvent.id,
   },
   data: {
     status: result.ignored ? 'IGNORED' : 'PROCESSED',
     processedCount: result.processed,
     syncedCount: result.synced,
     ignoredCount: result.ignoredCount,
     lastError: null,
   },
 });

 return result;
} catch (error) {
 const message =
   error instanceof Error ? error.message : 'Webhook processing failed';

 await this.prisma.webhookEvent.update({
   where: {
     id: webhookEvent.id,
   },
   data: {
     status: 'FAILED',
     lastError: message,
   },
 });

 throw error;
}
}

async listWebhookEvents(
tenantId: string,
filters: Record<string, string> = {},
) {
const status = String(filters.status || '').trim().toUpperCase();
const q = String(filters.q || '').trim();
const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);

return this.prisma.webhookEvent.findMany({
 where: {
   tenantId,
   ...(status
     ? {
         status,
       }
     : {}),
   ...(q
     ? {
         OR: [
           {
             phoneNumberId: {
               contains: q,
               mode: 'insensitive',
             },
           },
           {
             lastError: {
               contains: q,
               mode: 'insensitive',
             },
           },
           {
             metaObject: {
               contains: q,
               mode: 'insensitive',
             },
           },
         ],
       }
     : {}),
 },
 orderBy: {
   createdAt: 'desc',
 },
 take: limit,
 select: {
   id: true,
   source: true,
   status: true,
   metaObject: true,
   phoneNumberId: true,
   processedCount: true,
   syncedCount: true,
   ignoredCount: true,
   replayCount: true,
   lastError: true,
   lastReplayedAt: true,
   createdAt: true,
   updatedAt: true,
 },
});
}

async replayWebhookEvent(tenantId: string, id: string) {
const webhookEvent = await this.prisma.webhookEvent.findFirst({
 where: {
   id,
   tenantId,
 },
});

if (!webhookEvent) {
 throw new NotFoundException('Webhook event not found');
}

const body = webhookEvent.payload as MetaWebhookBody;

try {
const result = await this.processWebhookBody(body, tenantId);

 await this.prisma.webhookEvent.update({
   where: {
     id: webhookEvent.id,
   },
   data: {
     status: result.ignored ? 'IGNORED' : 'PROCESSED',
     processedCount: result.processed,
     syncedCount: result.synced,
     ignoredCount: result.ignoredCount,
     replayCount: {
       increment: 1,
     },
     lastReplayedAt: new Date(),
     lastError: null,
   },
 });

return {
...result,
replayed: true,
};
} catch (error) {
 const message =
   error instanceof Error ? error.message : 'Webhook replay failed';

 await this.prisma.webhookEvent.update({
   where: {
     id: webhookEvent.id,
   },
   data: {
     status: 'FAILED',
     replayCount: {
       increment: 1,
     },
     lastReplayedAt: new Date(),
     lastError: message,
   },
 });

 throw error;
}
}

private async processWebhookBody(body: MetaWebhookBody, tenantId?: string | null) {
const statusEvents = this.extractStatusEvents(body);

if (statusEvents.length === 0) {
 return {
   ok: true,
   processed: 0,
   synced: 0,
   ignoredCount: 1,
   ignored: true,
 };
}

let synced = 0;
let ignoredCount = 0;

for (const statusEvent of statusEvents) {
const result = await this.syncCampaignRecipientDeliveryStatus(
statusEvent,
tenantId,
);

 if (result.synced) {
   synced += 1;
 } else {
   ignoredCount += 1;
 }
}

return {
 ok: true,
 processed: statusEvents.length,
 synced,
 ignoredCount,
 ignored: synced === 0,
};
}

private extractWebhookPhoneNumberId(body: MetaWebhookBody) {
for (const entry of body.entry || []) {
 for (const change of entry.changes || []) {
   const phoneNumberId = String(
     change.value?.metadata?.phone_number_id || '',
   ).trim();

   if (phoneNumberId) {
     return phoneNumberId;
   }
 }
}

return null;
}

private async resolveTenantIdFromWebhookPhone(
  phoneNumberId: string | null,
) {
  if (!phoneNumberId) {
    return null
  }

  const account = await this.prisma.tenantMetaAccount.findUnique({
    where: {
      phoneNumberId,
    },
    select: {
      tenantId: true,
      isActive: true,
    },
  })

  return account?.isActive ? account.tenantId : null
}

private verifyWebhookSignature(
 signature: string,
 rawBody: Buffer | undefined,
 body: Record<string, unknown>,
) {
 const appSecret = String(process.env.META_APP_SECRET || '').trim();

 if (!appSecret) {
   if (process.env.NODE_ENV === 'production') {
     throw new BadRequestException('META_APP_SECRET is required in production');
   }

   return;
 }

 if (!signature.startsWith('sha256=')) {
   throw new UnauthorizedException('Missing Meta webhook signature');
 }

 if (!rawBody) {
   throw new UnauthorizedException('Missing raw webhook body');
 }

 const payload = rawBody;
 const expectedSignature =
   'sha256=' +
   crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

 const expectedBuffer = Buffer.from(expectedSignature);
 const receivedBuffer = Buffer.from(signature);

 if (
   expectedBuffer.length !== receivedBuffer.length ||
   !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
 ) {
   throw new UnauthorizedException('Invalid Meta webhook signature');
 }
}

private extractStatusEvents(body: MetaWebhookBody) {
 const statusEvents: Array<{
   messageId: string;
   status: string;
   timestamp?: string;
   errorMessage?: string;
 }> = [];

 for (const entry of body.entry || []) {
   for (const change of entry.changes || []) {
     for (const status of change.value?.statuses || []) {
       const messageId = String(status.id || '').trim();
       const normalizedStatus = this.normalizeDeliveryStatus(status.status);

       if (!messageId || !normalizedStatus) {
         continue;
       }

       statusEvents.push({
         messageId,
         status: normalizedStatus,
         timestamp: status.timestamp,
         errorMessage: this.getWebhookErrorMessage(status),
       });
     }
   }
 }

 return statusEvents;
}

private normalizeDeliveryStatus(status: unknown) {
 const normalizedStatus = String(status || '').trim().toUpperCase();

 if (['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(normalizedStatus)) {
   return normalizedStatus;
 }

 return '';
}

private getWebhookErrorMessage(status: MetaWebhookStatus) {
 const error = status.errors?.[0];

 if (!error) {
   return undefined;
 }

 return (
   error.message ||
   error.title ||
   error.error_data?.details ||
   `Meta delivery failed with code ${error.code || 'unknown'}`
 );
}

private async syncCampaignRecipientDeliveryStatus(
input: {
messageId: string;
status: string;
timestamp?: string;
errorMessage?: string;
},
tenantId?: string | null,
) {
const eventAt = this.parseWebhookTimestamp(input.timestamp);

if (!tenantId) {
return {
  synced: false,
  reason: 'Tenant was not resolved from webhook phone number',
};
}

const recipient = await this.prisma.campaignRecipient.findFirst({
where: {
  tenantId,
  metaMessageId: input.messageId,
},
});

 if (!recipient) {
   return {
     synced: false,
     reason: 'Message ID not linked to campaign recipient',
   };
 }

 const data: Prisma.CampaignRecipientUpdateInput = {
   status: input.status,
   statusWebhookAt: new Date(),
 };

 if (input.status === 'SENT') {
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (input.status === 'DELIVERED') {
   data.deliveredAt = eventAt;
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (input.status === 'READ') {
   data.readAt = eventAt;
   data.deliveredAt = recipient.deliveredAt || eventAt;
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (input.status === 'FAILED') {
   data.failedAt = eventAt;
   data.errorMessage =
     input.errorMessage || recipient.errorMessage || 'Message delivery failed';
 }

await this.prisma.campaignRecipient.update({
where: {
 id: recipient.id,
},
data,
});

 await this.recalculateCampaignCounts(recipient.tenantId, recipient.campaignId);

 return {
   synced: true,
 };
}

private async recalculateCampaignCounts(tenantId: string, campaignId: string) {
 const [sentCount, failedCount, pendingCount] = await Promise.all([
   this.prisma.campaignRecipient.count({
     where: {
       tenantId,
       campaignId,
       status: {
         in: ['SENT', 'DELIVERED', 'READ'],
       },
     },
   }),
   this.prisma.campaignRecipient.count({
     where: {
       tenantId,
       campaignId,
       status: 'FAILED',
     },
   }),
   this.prisma.campaignRecipient.count({
     where: {
       tenantId,
       campaignId,
       status: 'PENDING',
     },
   }),
 ]);

 const status =
   pendingCount > 0
     ? 'QUEUED'
     : failedCount > 0 && sentCount > 0
       ? 'PARTIAL'
       : failedCount > 0
         ? 'FAILED'
         : 'COMPLETED';

 await this.prisma.campaign.update({
   where: {
     id: campaignId,
   },
   data: {
     status,
     sentCount,
     failedCount,
     completedAt: pendingCount > 0 ? null : new Date(),
     lastError: failedCount > 0 ? `${failedCount} recipients failed` : null,
   },
 });
}

private parseWebhookTimestamp(value: unknown) {
 if (!value) {
   return new Date();
 }

 const numericValue = Number(value);

 if (Number.isFinite(numericValue) && numericValue > 0) {
   return new Date(numericValue * 1000);
 }

 const parsedDate = new Date(String(value));

 if (Number.isNaN(parsedDate.getTime())) {
   return new Date();
 }

 return parsedDate;
}
}