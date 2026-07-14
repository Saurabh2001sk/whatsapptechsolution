import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MetaAccountsService } from '../meta-accounts/meta-accounts.service';
import { BillingService } from '../billing/billing.service';
import { CampaignQueue } from './campaigns.queue';
import { MediaService } from '../media/media.service';

type CreateCampaignInput = {
name?: string;
templateId?: string;
audienceType?: string;
contactTypeId?: string;
variableValues?: string[];
scheduledAt?: string;
};

type PhoneQualityThrottle = {
qualityRating: string;
messagingLimitTier: string | null;
batchSize: number;
messagesPerMinute: number;
nextBatchDelayMs: number;
};

type DeliveryStatusInput = {
messageId?: string;
status?: string;
timestamp?: string | number;
errorMessage?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class CampaignsService {
  private readonly directSendLimit =
    Number.parseInt(process.env.CAMPAIGN_BATCH_SIZE || '50', 10) || 50;

  private readonly nextBatchDelayMs =
    Number.parseInt(process.env.CAMPAIGN_NEXT_BATCH_DELAY_MS || '3000', 10) ||
    3000;

  private readonly messagesPerMinute =
    Number.parseInt(process.env.CAMPAIGN_MESSAGES_PER_MINUTE || '20', 10) || 20;

    
  private readonly maxRecipientRetryCount =
    Number.parseInt(process.env.CAMPAIGN_MAX_RECIPIENT_RETRIES || '3', 10) || 3;

constructor(
 private readonly prisma: PrismaService,
 private readonly metaAccountsService: MetaAccountsService,
 private readonly campaignQueue: CampaignQueue,
 private readonly billingService: BillingService,
 private readonly mediaService: MediaService,
) {}

  listCampaigns(tenantId: string) {
    return this.prisma.campaign.findMany({
      where: {
        tenantId,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            language: true,
            category: true,
            status: true,
          },
        },
        contactType: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getCampaignFailureSummary(tenantId: string, campaignId: string) {
    const [campaign, deliveredCount, readCount] = await Promise.all([
      this.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          lastError: true,
          totalRecipients: true,
          sentCount: true,
          failedCount: true,
          updatedAt: true,
        },
      }),
      this.prisma.campaignRecipient.count({
        where: {
          tenantId,
          campaignId,
          deliveredAt: {
            not: null,
          },
        },
      }),
      this.prisma.campaignRecipient.count({
        where: {
          tenantId,
          campaignId,
          readAt: {
            not: null,
          },
        },
      }),
    ])

    if (!campaign) {
      throw new NotFoundException('Campaign not found')
    }

    const failedRecipients = await this.prisma.campaignRecipient.findMany({
      where: {
        tenantId,
        campaignId,
        status: 'FAILED',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
      select: {
        id: true,
        phone: true,
        errorMessage: true,
        retryCount: true,
        failedAt: true,
        statusWebhookAt: true,
        contact: {
          select: {
            id: true,
            name: true,
            optedIn: true,
            optInSource: true,
            deletedAt: true,
          },
        },
      },
    })

    const retryableFailedCount =
      await this.prisma.campaignRecipient.count({
        where: {
          tenantId,
          campaignId,
          status: 'FAILED',
          retryCount: {
            lt: this.maxRecipientRetryCount,
          },
          contact: {
            tenantId,
            deletedAt: null,
            optedIn: true,
            optInSource: {
              not: null,
            },
          },
        },
      })

    return {
      campaign: {
        ...campaign,
        deliveredCount,
        readCount,
      },
      retryPolicy: {
        maxRecipientRetryCount: this.maxRecipientRetryCount,
        retryableFailedCount,
      },
      failedRecipients,
    }
  }

async exportCampaignFailuresCsv(tenantId: string, campaignId: string) {
  const summary = await this.getCampaignFailureSummary(tenantId, campaignId);

  const rows = [
    [
      'campaign_id',
      'campaign_name',
      'campaign_status',
      'contact_name',
      'phone',
      'error_message',
      'retry_count',
      'failed_at',
      'status_webhook_at',
      'contact_opted_in',
      'contact_opt_in_source',
      'contact_deleted',
      'retryable',
    ],
    ...summary.failedRecipients.map((recipient) => {
      const contactDeleted = Boolean(recipient.contact?.deletedAt);
      const retryable =
        recipient.retryCount < this.maxRecipientRetryCount &&
        Boolean(recipient.contact?.optedIn) &&
        Boolean(recipient.contact?.optInSource) &&
        !contactDeleted;

      return [
        summary.campaign.id,
        summary.campaign.name,
        summary.campaign.status,
        recipient.contact?.name || '',
        recipient.phone,
        recipient.errorMessage || '',
        String(recipient.retryCount),
        recipient.failedAt ? recipient.failedAt.toISOString() : '',
        recipient.statusWebhookAt ? recipient.statusWebhookAt.toISOString() : '',
        recipient.contact?.optedIn ? 'yes' : 'no',
        recipient.contact?.optInSource || '',
        contactDeleted ? 'yes' : 'no',
        retryable ? 'yes' : 'no',
      ];
    }),
  ];

  return rows.map((row) => row.map(this.escapeCsvValue).join(',')).join('\n');
}

private escapeCsvValue(value: unknown) {
  const rawValue = String(value ?? '');
  const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;

  return `"${safeValue.replace(/"/g, '""')}"`;
}

  async getCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
      include: {
        template: true,
        contactType: true,
        recipients: {
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
                optedIn: true,
                optInSource: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

    async previewCampaignAudience(
    tenantId: string,
    input: {
      audienceType?: string;
      contactTypeId?: string;
    },
  ) {
    const audienceType = String(input.audienceType || 'ALL')
      .trim()
      .toUpperCase();
    const contactTypeId = String(input.contactTypeId || '').trim();

    if (!['ALL', 'CONTACT_TYPE'].includes(audienceType)) {
      throw new BadRequestException('Invalid campaign audience');
    }

    if (audienceType === 'CONTACT_TYPE' && !contactTypeId) {
      throw new BadRequestException('Contact type is required');
    }

    if (contactTypeId) {
      await this.ensureContactTypeBelongsToTenant(tenantId, contactTypeId);
    }

    const where = {
      tenantId,
      deletedAt: null,
      ...(audienceType === 'CONTACT_TYPE' && contactTypeId
        ? {
            contactTypeId,
          }
        : {}),
    };

    const [totalMatching, eligible, optedOut, missingOptInSource] =
      await Promise.all([
        this.prisma.contact.count({
          where,
        }),
        this.prisma.contact.count({
          where: {
            ...where,
            optedIn: true,
            optInSource: {
              not: null,
            },
          },
        }),
        this.prisma.contact.count({
          where: {
            ...where,
            optedIn: false,
          },
        }),
        this.prisma.contact.count({
          where: {
            ...where,
            optedIn: true,
            optInSource: null,
          },
        }),
      ]);

    return {
      ok: true,
      audienceType,
      contactTypeId: audienceType === 'CONTACT_TYPE' ? contactTypeId : null,
      totalMatching,
      eligible,
      blocked: {
        optedOut,
        missingOptInSource,
      },
    };
  }

 async createCampaign(
  tenantId: string,
  actorUserId: string,
  input: CreateCampaignInput,
) {
    const name = String(input.name || '').trim();
    const templateId = String(input.templateId || '').trim();
    const audienceType = String(input.audienceType || 'ALL')
      .trim()
      .toUpperCase();
    const contactTypeId = String(input.contactTypeId || '').trim();
    const variableValues = this.cleanVariableValues(input.variableValues);
    const scheduledAt = this.parseScheduledAt(input.scheduledAt);

    if (!name) {
      throw new BadRequestException('Campaign name is required');
    }

    if (!templateId) {
      throw new BadRequestException('Approved template is required');
    }

    if (!['ALL', 'CONTACT_TYPE'].includes(audienceType)) {
      throw new BadRequestException('Invalid campaign audience');
    }

    if (audienceType === 'CONTACT_TYPE' && !contactTypeId) {
      throw new BadRequestException('Contact type is required');
    }

    const template = await this.getApprovedTemplateForCampaign(
      tenantId,
      templateId,
    );

    this.validateTemplateForCampaign(template, variableValues);

    if (contactTypeId) {
      await this.ensureContactTypeBelongsToTenant(tenantId, contactTypeId);
    }

    const eligibleContacts = await this.getEligibleContacts(
      tenantId,
      audienceType,
      contactTypeId || null,
    );

    if (eligibleContacts.length === 0) {
      throw new BadRequestException(
        'No opted-in contacts found for this campaign audience',
      );
    }

 const { campaign, billingCheck } = await this.prisma.$transaction(
   async (tx) => {
     const reservedUsage =
       await this.billingService.reserveCampaignUsageInTransaction(
         tx,
         tenantId,
         eligibleContacts.length,
       );

     const createdCampaign = await tx.campaign.create({
       data: {
         tenantId,
         templateId,
         contactTypeId:
           audienceType === 'CONTACT_TYPE' ? contactTypeId : null,
         name,
         audienceType,
         status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
         scheduledAt,
         variableValues: variableValues as Prisma.InputJsonValue,
         totalRecipients: eligibleContacts.length,
       },
       include: {
         template: {
           select: {
             id: true,
             name: true,
             language: true,
             category: true,
             status: true,
           },
         },
         contactType: {
           select: {
             id: true,
             name: true,
             color: true,
           },
         },
       },
     });

     await tx.campaignRecipient.createMany({
       data: eligibleContacts.map((contact) => ({
         tenantId,
         campaignId: createdCampaign.id,
         contactId: contact.id,
         phone: contact.phone,
         status: 'PENDING',
       })),
       skipDuplicates: true,
     });

     return {
       campaign: createdCampaign,
       billingCheck: reservedUsage,
     };
   },
   {
     isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
   },
 );

if (scheduledAt) {
  await this.campaignQueue.addCampaignSendJob(
    {
      tenantId,
      campaignId: campaign.id,
    },
    {
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
    },
  );
}

await this.createCampaignAuditLog({
  tenantId,
  campaignId: campaign.id,
  actorUserId,
  action: scheduledAt ? 'CAMPAIGN_SCHEDULED' : 'CAMPAIGN_CREATED',
  metadata: {
    name,
    audienceType,
    contactTypeId: audienceType === 'CONTACT_TYPE' ? contactTypeId : null,
    templateId,
    totalRecipients: eligibleContacts.length,
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    billing: {
      planCode: billingCheck.planCode,
      planName: billingCheck.planName,
      plannedRecipients: billingCheck.plannedRecipients,
      campaignsRemainingBeforeCreate: billingCheck.campaignsRemaining,
      recipientsRemainingBeforeCreate: billingCheck.recipientsRemaining,
    },
  },
});

return campaign;
  }

   async sendCampaign(
  tenantId: string,
  actorUserId: string,
  campaignId: string,
) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'sending campaigns',
 );

    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
      include: {
        template: true,
      },
    });

 if (!campaign) {
   return {
     ok: true,
     skipped: true,
     reason: 'Campaign not found or already deleted',
   };
 }

if (!['DRAFT', 'SCHEDULED', 'FAILED', 'PARTIAL'].includes(campaign.status)) {
      throw new BadRequestException(
        'Only draft, failed, or partial campaigns can be queued',
      );
    }

    const template = await this.getApprovedTemplateForCampaign(
      tenantId,
      campaign.templateId,
    );

    const variableValues = Array.isArray(campaign.variableValues)
      ? campaign.variableValues.map((value: unknown) => String(value || '').trim())
      : [];

    this.validateTemplateForCampaign(template, variableValues);

    if (campaign.status === 'SCHEDULED') {
      await this.campaignQueue.removeCampaignJobs(campaign.id);
    }

    if (['FAILED', 'PARTIAL'].includes(campaign.status)) {
      const retryResult = await this.prisma.campaignRecipient.updateMany({
        where: {
          tenantId,
          campaignId,
          status: 'FAILED',
          retryCount: {
            lt: this.maxRecipientRetryCount,
          },
          contact: {
            tenantId,
            deletedAt: null,
            optedIn: true,
            optInSource: {
              not: null,
            },
          },
        },
        data: {
          status: 'PENDING',
          metaMessageId: null,
          errorMessage: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          statusWebhookAt: null,
          retryCount: {
            increment: 1,
          },
        },
      });
    }

    const pendingRecipients = await this.prisma.campaignRecipient.count({
      where: {
        tenantId,
        campaignId,
        status: 'PENDING',
      },
    });

    if (pendingRecipients === 0) {
      throw new BadRequestException('No pending recipients found');
    }

    await this.prisma.campaign.update({
      where: {
        id: campaign.id,
      },
data: {
  status: 'QUEUED',
  scheduledAt: null,
  startedAt: new Date(),
  completedAt: null,
  lastError: null,
},
    });

    await this.campaignQueue.addCampaignSendJob({
      tenantId,
      campaignId,
    });

    await this.createCampaignAuditLog({
  tenantId,
  campaignId,
  actorUserId,
  action: 'CAMPAIGN_QUEUED',
  metadata: {
    previousStatus: campaign.status,
    pendingRecipients,
  },
});

    const updatedCampaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaign.id,
        tenantId,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            language: true,
            category: true,
            status: true,
          },
        },
        contactType: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    return {
      ok: true,
      queued: true,
      pendingRecipients,
      campaign: updatedCampaign,
    };
  }

    async retryFailedCampaignRecipients(
  tenantId: string,
  actorUserId: string,
  campaignId: string,
) {

 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'retrying campaign recipients',
 );
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
      include: {
        template: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status === 'CANCELED') {
      throw new BadRequestException('Canceled campaigns cannot be retried');
    }

    if (['QUEUED', 'SCHEDULED', 'SENDING'].includes(campaign.status)) {
      throw new BadRequestException(
        'Campaign is already queued, scheduled, or sending',
      );
    }

    const template = await this.getApprovedTemplateForCampaign(
      tenantId,
      campaign.templateId,
    );

    const variableValues = Array.isArray(campaign.variableValues)
      ? campaign.variableValues.map((value: unknown) => String(value || '').trim())
      : [];

    this.validateTemplateForCampaign(template, variableValues);

    const totalFailed = await this.prisma.campaignRecipient.count({
      where: {
        tenantId,
        campaignId,
        status: 'FAILED',
      },
    });

    if (totalFailed === 0) {
      throw new BadRequestException('No failed recipients found to retry');
    }

    const retryableRecipients = await this.prisma.campaignRecipient.findMany({
    where: {
      tenantId,
      campaignId,
      status: 'FAILED',
      retryCount: {
        lt: this.maxRecipientRetryCount,
      },
      contact: {
        tenantId,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
      },
    },
      select: {
        id: true,
      },
    });

    if (retryableRecipients.length === 0) {
    throw new BadRequestException(
      'No failed recipients are eligible for retry. They may be opted-out, deleted, missing opt-in proof, or already reached retry limit.',
    );
    }

    const retryableRecipientIds = retryableRecipients.map(
      (recipient) => recipient.id,
    );

    const retryResult = await this.prisma.campaignRecipient.updateMany({
      where: {
        tenantId,
        campaignId,
        id: {
          in: retryableRecipientIds,
        },
        status: 'FAILED',
      },
      data: {
        status: 'PENDING',
        metaMessageId: null,
        errorMessage: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        statusWebhookAt: null,
        retryCount: {
          increment: 1,
        },
      },
    });

    const blockedRecipients = totalFailed - retryableRecipients.length;

        if (retryResult.count < 1) {
      throw new BadRequestException(
        'No failed recipients are eligible for retry.',
      );
    }

    await this.prisma.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: 'QUEUED',
        scheduledAt: null,
        completedAt: null,
        lastError:
          blockedRecipients > 0
            ? `${blockedRecipients} failed recipients were not retried because they are no longer eligible`
            : null,
      },
    });

    await this.campaignQueue.addCampaignSendJob({
      tenantId,
      campaignId,
    });

    await this.createCampaignAuditLog({
  tenantId,
  campaignId,
  actorUserId,
  action: 'CAMPAIGN_RETRY_FAILED',
  metadata: {
    totalFailed,
    retriedRecipients: retryableRecipients.length,
    blockedRecipients,
    maxRecipientRetryCount: this.maxRecipientRetryCount,
  },
});

    const updatedCampaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaign.id,
        tenantId,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            language: true,
            category: true,
            status: true,
          },
        },
        contactType: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    return {
      ok: true,
      queued: true,
      retriedRecipients: retryableRecipients.length,
      blockedRecipients,
      campaign: updatedCampaign,
    };
  }

  async enqueueDueAndStuckCampaigns() {
  const now = new Date();

  const dueScheduledCampaigns = await this.prisma.campaign.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: 50,
    orderBy: {
      scheduledAt: 'asc',
    },
  });

  let queuedScheduled = 0;

  for (const campaign of dueScheduledCampaigns) {
    const claimed = await this.prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        tenantId: campaign.tenantId,
        status: 'SCHEDULED',
        scheduledAt: {
          lte: now,
        },
      },
      data: {
        status: 'QUEUED',
        startedAt: new Date(),
        scheduledAt: null,
        lastError: null,
      },
    });

 if (claimed.count === 0) {
   continue;
 }

 try {
   await this.billingService.assertSubscriptionCanUseWorkspace(
     campaign.tenantId,
     'queueing scheduled campaigns',
   );
 } catch (error) {
   await this.prisma.campaign.update({
     where: {
       id: campaign.id,
     },
     data: {
       status: 'FAILED',
       completedAt: new Date(),
       lastError:
         error instanceof Error
           ? error.message
           : 'Subscription is not active',
     },
   });

   await this.createCampaignAuditLog({
     tenantId: campaign.tenantId,
     campaignId: campaign.id,
     actorUserId: null,
     action: 'CAMPAIGN_BLOCKED_BY_BILLING',
     metadata: {
       reason:
         error instanceof Error
           ? error.message
           : 'Subscription is not active',
     },
   });

   continue;
 }

 await this.campaignQueue.addCampaignSendJob({
   tenantId: campaign.tenantId,
   campaignId: campaign.id,
 });

    await this.createCampaignAuditLog({
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      actorUserId: null,
      action: 'CAMPAIGN_SCHEDULE_RECOVERED',
      metadata: {
        recoveredAt: now.toISOString(),
      },
    });

    queuedScheduled += 1;
  }

  const stuckBefore = new Date(Date.now() - 5 * 60 * 1000);
  const stuckQueuedCampaigns = await this.prisma.campaign.findMany({
    where: {
      status: 'QUEUED',
      updatedAt: {
        lte: stuckBefore,
      },
      recipients: {
        some: {
          status: 'PENDING',
        },
      },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: 50,
    orderBy: {
      updatedAt: 'asc',
    },
  });

  let requeuedStuck = 0;

for (const campaign of stuckQueuedCampaigns) {
 try {
   await this.billingService.assertSubscriptionCanUseWorkspace(
     campaign.tenantId,
     'requeueing stuck campaigns',
   );
 } catch (error) {
   await this.prisma.campaign.update({
     where: {
       id: campaign.id,
     },
     data: {
       status: 'FAILED',
       completedAt: new Date(),
       lastError:
         error instanceof Error
           ? error.message
           : 'Subscription is not active',
     },
   });

   await this.createCampaignAuditLog({
     tenantId: campaign.tenantId,
     campaignId: campaign.id,
     actorUserId: null,
     action: 'CAMPAIGN_BLOCKED_BY_BILLING',
     metadata: {
       reason:
         error instanceof Error
           ? error.message
           : 'Subscription is not active',
       source: 'stuck_campaign_requeue',
     },
   });

   continue;
 }

 await this.campaignQueue.addCampaignSendJob({
   tenantId: campaign.tenantId,
   campaignId: campaign.id,
 });

 requeuedStuck += 1;
}

  return {
    queuedScheduled,
    requeuedStuck,
  };
}

async processCampaignSendJob(input: {
tenantId: string;
campaignId: string;
}) {
try {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   input.tenantId,
   'processing campaign sends',
 );
} catch (error) {
 await this.markCampaignJobFailed({
   tenantId: input.tenantId,
   campaignId: input.campaignId,
   errorMessage:
     error instanceof Error ? error.message : 'Subscription is not active',
 });

 return {
   ok: true,
   skipped: true,
   reason:
     error instanceof Error ? error.message : 'Subscription is not active',
 };
}

const campaign = await this.prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      tenantId: input.tenantId,
    },
    include: {
      template: true,
    },
  });

  if (!campaign) {
    return {
      ok: true,
      skipped: true,
      reason: 'Campaign not found or already deleted',
    };
  }

  if (campaign.status === 'CANCELED') {
    return {
      ok: true,
      skipped: true,
      reason: 'Campaign was cancelled',
    };
  }

  if (!['QUEUED', 'SCHEDULED', 'SENDING'].includes(campaign.status)) {
    return {
      ok: true,
      skipped: true,
      reason: `Campaign status is ${campaign.status}`,
    };
  }

  if (
    campaign.status === 'SCHEDULED' &&
    campaign.scheduledAt &&
    campaign.scheduledAt.getTime() > Date.now()
  ) {
    await this.campaignQueue.addCampaignSendJob(
      {
        tenantId: input.tenantId,
        campaignId: input.campaignId,
      },
      {
        delay: campaign.scheduledAt.getTime() - Date.now(),
      },
    );

    return {
      ok: true,
      skipped: true,
      reason: 'Campaign is scheduled for later',
    };
  }

  const template = await this.getApprovedTemplateForCampaign(
    input.tenantId,
    campaign.templateId,
  );

  const variableValues = Array.isArray(campaign.variableValues)
    ? campaign.variableValues.map((value: unknown) => String(value || '').trim())
    : [];

  this.validateTemplateForCampaign(template, variableValues);

  const connection =
    await this.metaAccountsService.getActiveConnectionSecret(input.tenantId);

  const throttle = await this.getPhoneQualityThrottle({
    tenantId: input.tenantId,
    phoneNumberId: connection.phoneNumberId,
    accessToken: connection.accessToken,
  });

  const headerMediaId = await this.getOrUploadCampaignHeaderMediaIfNeeded({
    tenantId: input.tenantId,
    campaignId: campaign.id,
    phoneNumberId: connection.phoneNumberId,
    accessToken: connection.accessToken,
    headerType: template.headerType,
    headerMediaFileId: template.headerMediaFileId,
    cachedMetaHeaderMediaId: campaign.metaHeaderMediaId,
    cachedMetaHeaderMediaUploadedAt: campaign.metaHeaderMediaUploadedAt,
  });

  const retryResult = await this.prisma.campaignRecipient.updateMany({
    where: {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      status: 'PENDING',
      OR: [
        {
          contact: {
            tenantId: input.tenantId,
            deletedAt: {
              not: null,
            },
          },
        },
        {
          contact: {
            tenantId: input.tenantId,
            optedIn: false,
          },
        },
        {
          contact: {
            tenantId: input.tenantId,
            optInSource: null,
          },
        },
      ],
    },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      errorMessage:
        'Contact became ineligible before sending: opted out, deleted, or missing opt-in proof',
    },
  });

  const processingRecipients = await this.prisma.$queryRaw<
    Array<{
      id: string;
      phone: string;
    }>
  >(Prisma.sql`
    UPDATE campaign_recipients
    SET
      status = 'PROCESSING',
      "errorMessage" = NULL,
      "updatedAt" = NOW()
    WHERE id IN (
      SELECT cr.id
      FROM campaign_recipients cr
      INNER JOIN contacts c ON c.id = cr."contactId"
      WHERE
        cr."tenantId" = ${input.tenantId}
        AND cr."campaignId" = ${input.campaignId}
        AND cr.status = 'PENDING'
        AND c."tenantId" = ${input.tenantId}
        AND c."deletedAt" IS NULL
        AND c."optedIn" = true
        AND c."optInSource" IS NOT NULL
      ORDER BY cr."createdAt" ASC
      LIMIT ${throttle.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, phone
  `);

  if (processingRecipients.length === 0) {
    const counts = await this.recalculateCampaignCounts(
      input.tenantId,
      input.campaignId,
    );

    return {
      ok: true,
      sentNow: 0,
      failedNow: 0,
      remainingPending: counts.totalPending,
      qualityRating: throttle.qualityRating,
      messagingLimitTier: throttle.messagingLimitTier,
    };
  }

  await this.prisma.campaign.update({
    where: {
      id: campaign.id,
    },
    data: {
      status: 'SENDING',
      startedAt: campaign.startedAt || new Date(),
      lastError: null,
    },
  });

  if (!campaign.startedAt) {
  await this.createCampaignAuditLog({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    actorUserId: null,
    action: 'CAMPAIGN_WORKER_STARTED',
    metadata: {
      batchSize: throttle.batchSize,
      qualityRating: throttle.qualityRating,
      messagingLimitTier: throttle.messagingLimitTier,
    },
  });
}

  let sentCount = 0;
  let failedCount = 0;
  let cancelDetected = false;

  for (const recipient of processingRecipients) {
    const latestCampaign = await this.prisma.campaign.findFirst({
      where: {
        id: input.campaignId,
        tenantId: input.tenantId,
      },
      select: {
        status: true,
      },
    });

    if (latestCampaign?.status === 'CANCELED') {
      cancelDetected = true;
      break;
    }

    try {
const metaMessageId = await this.sendTemplateMessage({
phoneNumberId: connection.phoneNumberId,
accessToken: connection.accessToken,
to: recipient.phone,
templateName: template.name,
language: template.language,
headerType: template.headerType,
headerText: template.headerText,
bodyText: template.bodyText,
components: template.components,
variableValues,
headerMediaId,
});

      const retryResult = await this.prisma.campaignRecipient.updateMany({
        where: {
          id: recipient.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          status: 'PROCESSING',
        },
        data: {
          status: 'SENT',
          metaMessageId,
          errorMessage: null,
          sentAt: new Date(),
          failedAt: null,
          statusWebhookAt: null,
        },
      });

      sentCount += 1;

      if (throttle.messagesPerMinute > 0) {
        await sleep(Math.ceil(60000 / throttle.messagesPerMinute));
      }
    } catch (error) {
      const retryResult = await this.prisma.campaignRecipient.updateMany({
        where: {
          id: recipient.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage:
            error instanceof Error ? error.message : 'Failed to send message',
        },
      });

      failedCount += 1;
    }
  }

if (cancelDetected) {
  const retryResult = await this.prisma.campaignRecipient.updateMany({
    where: {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      status: 'PROCESSING',
    },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      errorMessage: 'Campaign cancelled while sending',
    },
  });

  return {
    ok: true,
    skipped: true,
    reason: 'Campaign was cancelled while sending',
  };
}

  const counts = await this.recalculateCampaignCounts(
    input.tenantId,
    input.campaignId,
  );

    await this.billingService.recordCampaignRecipientsSent(
    input.tenantId,
    sentCount,
  );

  if (counts.totalPending > 0) {
    await this.campaignQueue.addCampaignSendJob(
      {
        tenantId: input.tenantId,
        campaignId: input.campaignId,
      },
      {
        delay: throttle.nextBatchDelayMs,
      },
    );
  }

  if (counts.totalPending === 0) {
  await this.createCampaignAuditLog({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    actorUserId: null,
    action: 'CAMPAIGN_WORKER_FINISHED',
    metadata: {
      finalStatus: counts.finalStatus,
      totalSent: counts.totalSent,
      totalFailed: counts.totalFailed,
    },
  });
}

  return {
    ok: true,
    sentNow: sentCount,
    failedNow: failedCount,
    remainingPending: counts.totalPending,
    requeued: counts.totalPending > 0,
    qualityRating: throttle.qualityRating,
    messagingLimitTier: throttle.messagingLimitTier,
    batchSize: throttle.batchSize,
    messagesPerMinute: throttle.messagesPerMinute,
    nextBatchDelayMs: throttle.nextBatchDelayMs,
  };
}

async markCampaignJobFailed(input: {
  tenantId: string;
  campaignId: string;
  errorMessage: string;
  shouldRetry?: boolean;
}) {
  const message = input.errorMessage.trim() || 'Campaign worker failed';

  const campaign = await this.prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!campaign || campaign.status === 'CANCELED') {
    return;
  }

    if (input.shouldRetry) {
    const retryResult = await this.prisma.campaignRecipient.updateMany({
      where: {
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        status: 'PROCESSING',
      },
      data: {
        status: 'PENDING',
        errorMessage: message,
      },
    });

    await this.prisma.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: 'QUEUED',
        lastError: `Worker attempt failed and will retry: ${message}`,
      },
    });

    await this.createCampaignAuditLog({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      actorUserId: null,
      action: 'CAMPAIGN_WORKER_ATTEMPT_FAILED',
      metadata: {
        errorMessage: message,
        willRetry: true,
      },
    });

    return;
  }

  const retryResult = await this.prisma.campaignRecipient.updateMany({
    where: {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      status: 'PROCESSING',
    },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      errorMessage: message,
    },
  });

  await this.prisma.campaign.update({
    where: {
      id: campaign.id,
    },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      lastError: message,
    },
  });

  await this.createCampaignAuditLog({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    actorUserId: null,
    action: 'CAMPAIGN_WORKER_FAILED',
    metadata: {
      errorMessage: message,
    },
  });
}

async cancelScheduledCampaign(
  tenantId: string,
  actorUserId: string,
  campaignId: string,
) {
 const campaign = await this.prisma.campaign.findFirst({
   where: {
     id: campaignId,
     tenantId,
   },
 });

 if (!campaign) {
   return {
     ok: true,
     skipped: true,
     reason: 'Campaign not found or already deleted',
   };
 }

if (!['SCHEDULED', 'QUEUED', 'SENDING'].includes(campaign.status)) {
  throw new BadRequestException(
    'Only scheduled, queued, or sending campaigns can be cancelled',
  );
}

 const removedJobs = await this.campaignQueue.removeCampaignJobs(campaign.id);

 const retryResult = await this.prisma.campaignRecipient.updateMany({
  where: {
    tenantId,
    campaignId: campaign.id,
    status: {
      in: ['PENDING', 'PROCESSING'],
    },
  },
  data: {
    status: 'FAILED',
    failedAt: new Date(),
    errorMessage: 'Campaign cancelled before sending',
  },
});

 const updatedCampaign = await this.prisma.campaign.update({
   where: {
     id: campaign.id,
   },
   data: {
     status: 'CANCELED',
     canceledAt: new Date(),
     scheduledAt: null,
     completedAt: new Date(),
     lastError: 'Campaign cancelled before sending',
   },
   include: {
     template: {
       select: {
         id: true,
         name: true,
         language: true,
         category: true,
         status: true,
       },
     },
     contactType: {
       select: {
         id: true,
         name: true,
         color: true,
       },
     },
   },
 });

 await this.createCampaignAuditLog({
  tenantId,
  campaignId: campaign.id,
  actorUserId,
  action: 'CAMPAIGN_CANCELED',
  metadata: {
    removedJobs,
    previousStatus: campaign.status,
  },
});

 return {
   ok: true,
   canceled: true,
   removedJobs,
   campaign: updatedCampaign,
 };
}

async syncMessageDeliveryStatusFromWebhook(input: DeliveryStatusInput) {
 const messageId = String(input.messageId || '').trim();
 const status = String(input.status || '').trim().toUpperCase();
 const eventAt = this.parseWebhookTimestamp(input.timestamp);

 if (!messageId) {
   throw new BadRequestException('Webhook message ID is required');
 }

 if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(status)) {
   return {
     ok: true,
     ignored: true,
     reason: `Unsupported delivery status ${status || '-'}`,
   };
 }

 const recipient = await this.prisma.campaignRecipient.findFirst({
   where: {
     metaMessageId: messageId,
   },
   include: {
     campaign: true,
   },
 });

 if (!recipient) {
   return {
     ok: true,
     ignored: true,
     reason: 'Message ID not linked to a campaign recipient',
   };
 }

  const statusRank: Record<string, number> = {
   PENDING: 0,
   PROCESSING: 1,
   SENT: 2,
   DELIVERED: 3,
   READ: 4,
   FAILED: 5,
 };

 const currentRank = statusRank[recipient.status] ?? 0;
 const incomingRank = statusRank[status] ?? 0;

 if (
   recipient.status !== 'FAILED' &&
   status !== 'FAILED' &&
   incomingRank < currentRank
 ) {
   return {
     ok: true,
     ignored: true,
     reason: `Ignored webhook status downgrade from ${recipient.status} to ${status}`,
     campaignId: recipient.campaignId,
     recipientId: recipient.id,
   };
 }

 if (recipient.status === 'FAILED' && status !== 'READ') {
   return {
     ok: true,
     ignored: true,
     reason: `Ignored webhook status ${status} because recipient is already FAILED`,
     campaignId: recipient.campaignId,
     recipientId: recipient.id,
   };
 }

 const data: Prisma.CampaignRecipientUpdateInput = {
   status,
   statusWebhookAt: new Date(),
 };

 if (status === 'SENT') {
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (status === 'DELIVERED') {
   data.deliveredAt = eventAt;
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (status === 'READ') {
   data.readAt = eventAt;
   data.deliveredAt = recipient.deliveredAt || eventAt;
   data.sentAt = recipient.sentAt || eventAt;
   data.errorMessage = null;
 }

 if (status === 'FAILED') {
   data.failedAt = eventAt;
   data.errorMessage = String(
     input.errorMessage || recipient.errorMessage || 'Message delivery failed',
   ).trim();

   if (recipient.status === 'READ') {
     data.readAt = recipient.readAt || eventAt;
     data.deliveredAt = recipient.deliveredAt || eventAt;
     data.sentAt = recipient.sentAt || eventAt;
   }

   if (recipient.status === 'DELIVERED') {
     data.deliveredAt = recipient.deliveredAt || eventAt;
     data.sentAt = recipient.sentAt || eventAt;
   }

   if (recipient.status === 'SENT') {
     data.sentAt = recipient.sentAt || eventAt;
   }
 }

 await this.prisma.campaignRecipient.update({
   where: {
     id: recipient.id,
   },
   data,
 });

 const campaignCounts = await this.recalculateCampaignCounts(
   recipient.tenantId,
   recipient.campaignId,
 );

 return {
   ok: true,
   synced: true,
   campaignId: recipient.campaignId,
   recipientId: recipient.id,
   status,
   campaignCounts,
 };
}

async deleteCampaign(
  tenantId: string,
  actorUserId: string,
  campaignId: string,
) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
    });

 if (!campaign) {
   return {
     ok: true,
     skipped: true,
     reason: 'Campaign not found or already deleted',
   };
 }

    if (!['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(campaign.status)) {
      throw new BadRequestException(
        'Only draft, scheduled, failed, or canceled campaigns can be deleted',
      );
    }

    if (campaign.status === 'SCHEDULED') {
      await this.campaignQueue.removeCampaignJobs(campaign.id);
    }

    await this.createCampaignAuditLog({
  tenantId,
  campaignId: campaign.id,
  actorUserId,
  action: 'CAMPAIGN_DELETED',
  metadata: {
    previousStatus: campaign.status,
    name: campaign.name,
  },
});

    await this.prisma.campaign.delete({
      where: {
        id: campaign.id,
      },
    });

    return {
      ok: true,
    };
  }

private async recalculateCampaignCounts(tenantId: string, campaignId: string) {
  const campaign = await this.prisma.campaign.findFirst({
    where: {
      id: campaignId,
      tenantId,
    },
    select: {
      status: true,
    },
  });

  if (!campaign) {
    return {
      totalSent: 0,
      totalFailed: 0,
      totalPending: 0,
      finalStatus: 'DELETED',
    };
  }

  if (campaign.status === 'CANCELED') {
    return {
      totalSent: 0,
      totalFailed: 0,
      totalPending: 0,
      finalStatus: 'CANCELED',
    };
  }

  const [totalSent, totalFailed, totalPending] = await Promise.all([
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
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
    }),
  ]);

 const finalStatus =
   totalPending > 0
     ? campaign.status === 'SENDING'
       ? 'SENDING'
       : 'QUEUED'
     : totalFailed > 0 && totalSent > 0
       ? 'PARTIAL'
       : totalFailed > 0
         ? 'FAILED'
         : 'COMPLETED';

  await this.prisma.campaign.update({
    where: {
      id: campaignId,
    },
    data: {
      status: finalStatus,
      sentCount: totalSent,
      failedCount: totalFailed,
      completedAt: totalPending > 0 ? null : new Date(),
      lastError: totalFailed > 0 ? `${totalFailed} recipients failed` : null,
    },
  });

  return {
    totalSent,
    totalFailed,
    totalPending,
    finalStatus,
  };
}

private async createCampaignAuditLog(input: {
  tenantId: string;
  campaignId: string | null;
  actorUserId: string | null;
  action: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await this.prisma.campaignAuditLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      actorUserId: input.actorUserId,
      action: input.action,
      metadata: input.metadata || Prisma.JsonNull,
    },
  });
}

private parseWebhookTimestamp(value: unknown) {
 if (!value) {
   return new Date();
 }

 const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000);
  }

 const parsedDate = new Date(String(value));

 if (Number.isNaN(parsedDate.getTime())) {
   return new Date();
 }

 return parsedDate;
}


  private parseScheduledAt(value: unknown) {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
      return null;
    }

    const scheduledAt = new Date(rawValue);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    if (scheduledAt.getTime() < Date.now() + 60_000) {
      throw new BadRequestException(
        'Scheduled time must be at least 1 minute in the future',
      );
    }

    return scheduledAt;
  }

  private async getApprovedTemplateForCampaign(
    tenantId: string,
    templateId: string,
  ) {
    const template = await this.prisma.whatsappTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only approved templates can be used in campaigns',
      );
    }

    return template;
  }

  private validateTemplateForCampaign(
    template: {
   headerType: string | null;
   headerText: string | null;
   headerMediaFileId?: string | null;
   bodyText: string;
   variableCount: number;
   components: Prisma.JsonValue;
    },
    variableValues: string[],
  ) {

     if (
   template.headerType &&
   ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) &&
   !template.headerMediaFileId
 ) {
   throw new BadRequestException(
     'This media header template needs a saved header media file before campaign sending',
   );
 }

    const storedComponents = Array.isArray(template.components)
      ? template.components
      : [];

    const isCarouselTemplate = storedComponents.some(
      (component) =>
        String((component as Record<string, unknown>).type || '')
          .trim()
          .toUpperCase() === 'CAROUSEL',
    );

    if (isCarouselTemplate) {
      throw new BadRequestException(
        'Carousel campaign sending will be added after basic campaign sending is stable',
      );
    }

const headerVariables = this.getVariableNumbers(template.headerText || '');
const bodyVariables = this.getVariableNumbers(template.bodyText);
const buttonVariables = this.getButtonVariableSlots(template.components);
const totalVariablesNeeded =
  headerVariables.length + bodyVariables.length + buttonVariables.length;

if (totalVariablesNeeded !== variableValues.length) {
  throw new BadRequestException(
    `This template needs ${totalVariablesNeeded} variable values`,
  );
}

    if (variableValues.some((value) => !value)) {
      throw new BadRequestException('All variable values are required');
    }
  }

  private async ensureContactTypeBelongsToTenant(
    tenantId: string,
    contactTypeId: string,
  ) {
    const contactType = await this.prisma.contactType.findFirst({
      where: {
        id: contactTypeId,
        tenantId,
      },
    });

    if (!contactType) {
      throw new BadRequestException('Contact type not found');
    }
  }

  private getEligibleContacts(
    tenantId: string,
    audienceType: string,
    contactTypeId: string | null,
  ) {
    return this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
        ...(audienceType === 'CONTACT_TYPE' && contactTypeId
          ? {
              contactTypeId,
            }
          : {}),
      },
      select: {
        id: true,
        phone: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private cleanVariableValues(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => String(item || '').trim()).slice(0, 20);
  }

  private getVariableNumbers(text: string) {
    return Array.from(
      new Set(
        Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
          Number(match[1]),
        ),
      ),
    ).sort((a, b) => a - b);
  }

  private getButtonVariableSlots(components: Prisma.JsonValue) {
  if (!Array.isArray(components)) {
    return [];
  }

  const buttonsComponent = components.find((component) => {
    const rawComponent = component as Record<string, unknown>;

    return (
      String(rawComponent.type || '').trim().toUpperCase() === 'BUTTONS' &&
      Array.isArray(rawComponent.buttons)
    );
  }) as Record<string, unknown> | undefined;

  if (!buttonsComponent || !Array.isArray(buttonsComponent.buttons)) {
    return [];
  }

  return buttonsComponent.buttons
    .map((button, index) => {
      const rawButton = button as Record<string, unknown>;
      const type = String(rawButton.type || '').trim().toUpperCase();
      const url = String(rawButton.url || '').trim();

      if (type !== 'URL') {
        return null;
      }

      if (this.getVariableNumbers(url).length === 0) {
        return null;
      }

      return {
        index,
      };
    })
    .filter((button): button is { index: number } => Boolean(button));
}

  private async getPhoneQualityThrottle(input: {
 tenantId: string;
 phoneNumberId: string;
 accessToken: string;
}): Promise<PhoneQualityThrottle> {
 const baseBatchSize = Math.max(1, this.directSendLimit);
 const baseMessagesPerMinute = Math.max(1, this.messagesPerMinute);
 const baseNextBatchDelayMs = Math.max(1000, this.nextBatchDelayMs);
 const apiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';

 let qualityRating = 'UNKNOWN';
 let messagingLimitTier: string | null = null;

 try {
   const response = await fetch(
     `https://graph.facebook.com/${apiVersion}/${input.phoneNumberId}?fields=quality_rating,messaging_limit_tier`,
     {
       headers: {
         Authorization: `Bearer ${input.accessToken}`,
       },
     },
   );

   const data: {
     quality_rating?: string;
     messaging_limit_tier?: string;
     error?: {
       message?: string;
     };
   } = await response.json();

   if (response.ok) {
     qualityRating = String(data.quality_rating || 'UNKNOWN').toUpperCase();
     messagingLimitTier = data.messaging_limit_tier
       ? String(data.messaging_limit_tier)
       : null;

     await this.prisma.tenantMetaAccount.updateMany({
       where: {
         tenantId: input.tenantId,
         phoneNumberId: input.phoneNumberId,
         isActive: true,
       },
       data: {
         qualityRating,
         messagingLimitTier,
         qualitySyncedAt: new Date(),
       },
     });
   }
 } catch {
   qualityRating = 'UNKNOWN';
 }

 if (['LOW', 'RED'].includes(qualityRating)) {
   return {
     qualityRating,
     messagingLimitTier,
     batchSize: Math.max(1, Math.floor(baseBatchSize / 4)),
     messagesPerMinute: Math.max(1, Math.floor(baseMessagesPerMinute / 4)),
     nextBatchDelayMs: Math.max(baseNextBatchDelayMs, 60_000),
   };
 }

 if (['MEDIUM', 'YELLOW'].includes(qualityRating)) {
   return {
     qualityRating,
     messagingLimitTier,
     batchSize: Math.max(1, Math.floor(baseBatchSize / 2)),
     messagesPerMinute: Math.max(1, Math.floor(baseMessagesPerMinute / 2)),
     nextBatchDelayMs: Math.max(baseNextBatchDelayMs, 30_000),
   };
 }

 return {
   qualityRating,
   messagingLimitTier,
   batchSize: baseBatchSize,
   messagesPerMinute: baseMessagesPerMinute,
   nextBatchDelayMs: baseNextBatchDelayMs,
 };
}

private getTemplateHeaderMediaParameterType(headerType: string | null) {
 const cleanHeaderType = String(headerType || '').trim().toUpperCase();

 if (cleanHeaderType === 'IMAGE') {
   return 'image';
 }

 if (cleanHeaderType === 'VIDEO') {
   return 'video';
 }

 if (cleanHeaderType === 'DOCUMENT') {
   return 'document';
 }

 return null;
}

private async getOrUploadCampaignHeaderMediaIfNeeded(input: {
  tenantId: string;
  campaignId: string;
  phoneNumberId: string;
  accessToken: string;
  headerType: string | null;
  headerMediaFileId?: string | null;
  cachedMetaHeaderMediaId?: string | null;
  cachedMetaHeaderMediaUploadedAt?: Date | null;
}) {
  const headerMediaType = this.getTemplateHeaderMediaParameterType(
    input.headerType,
  );

  if (!headerMediaType) {
    return null;
  }

  const uploadedAt = input.cachedMetaHeaderMediaUploadedAt;
  const cacheAgeMs = uploadedAt
    ? Date.now() - uploadedAt.getTime()
    : Number.MAX_SAFE_INTEGER;
  const cacheIsFresh = cacheAgeMs >= 0 && cacheAgeMs < 23 * 60 * 60 * 1000;

  if (input.cachedMetaHeaderMediaId && cacheIsFresh) {
    return input.cachedMetaHeaderMediaId;
  }

  const metaHeaderMediaId = await this.uploadCampaignHeaderMediaIfNeeded({
    tenantId: input.tenantId,
    phoneNumberId: input.phoneNumberId,
    accessToken: input.accessToken,
    headerType: input.headerType,
    headerMediaFileId: input.headerMediaFileId,
  });

  if (metaHeaderMediaId) {
    await this.prisma.campaign.updateMany({
      where: {
        id: input.campaignId,
        tenantId: input.tenantId,
      },
      data: {
        metaHeaderMediaId,
        metaHeaderMediaUploadedAt: new Date(),
      },
    });
  }

  return metaHeaderMediaId;
}

private async uploadCampaignHeaderMediaIfNeeded(input: {
 tenantId: string;
 phoneNumberId: string;
 accessToken: string;
 headerType: string | null;
 headerMediaFileId?: string | null;
}) {
 const headerMediaType = this.getTemplateHeaderMediaParameterType(
   input.headerType,
 );

 if (!headerMediaType) {
   return null;
 }

 if (!input.headerMediaFileId) {
   throw new BadRequestException(
     'This media header template needs a saved header media file before campaign sending',
   );
 }

 const media = await this.mediaService.getMediaForMetaUpload(
   input.tenantId,
   input.headerMediaFileId,
 );

 if (media.mediaType !== String(input.headerType || '').toUpperCase()) {
   throw new BadRequestException(
     `Selected campaign header media must be ${String(
       input.headerType,
     ).toLowerCase()}`,
   );
 }

 const apiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';
 const formData = new FormData();

const mediaArrayBuffer = new ArrayBuffer(media.buffer.byteLength);
new Uint8Array(mediaArrayBuffer).set(media.buffer);

formData.append('messaging_product', 'whatsapp');
formData.append(
'file',
new Blob([mediaArrayBuffer], {
  type: media.mimeType,
}),
media.originalName,
);

 const response = await fetch(
   `https://graph.facebook.com/${apiVersion}/${input.phoneNumberId}/media`,
   {
     method: 'POST',
     headers: {
       Authorization: `Bearer ${input.accessToken}`,
     },
     body: formData as unknown as BodyInit,
   },
 );

 const data: {
   id?: string;
   error?: {
     message?: string;
   };
 } = await response.json();

 if (!response.ok || !data.id) {
   throw new Error(data.error?.message || 'Failed to upload campaign header media to Meta');
 }

 return data.id;
}

  private async sendTemplateMessage(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    templateName: string;
    language: string;
    headerType: string | null;
    headerText: string | null;
    bodyText: string;
    components: Prisma.JsonValue;
    variableValues: string[];
    headerMediaId?: string | null;
  }) {
const components: Array<{
type: 'header' | 'body' | 'button';
sub_type?: 'url';
index?: string;
parameters: Array<
 | {
     type: 'text';
     text: string;
   }
 | {
     type: 'image';
     image: {
       id: string;
     };
   }
 | {
     type: 'video';
     video: {
       id: string;
     };
   }
 | {
     type: 'document';
     document: {
       id: string;
     };
   }
>;
}> = [];

 const headerVariables = this.getVariableNumbers(input.headerText || '');
 const bodyVariables = this.getVariableNumbers(input.bodyText);
 const headerMediaType = this.getTemplateHeaderMediaParameterType(
   input.headerType,
 );

 if (headerMediaType && input.headerMediaId) {
   if (headerMediaType === 'image') {
     components.push({
       type: 'header',
       parameters: [
         {
           type: 'image',
           image: {
             id: input.headerMediaId,
           },
         },
       ],
     });
   }

   if (headerMediaType === 'video') {
     components.push({
       type: 'header',
       parameters: [
         {
           type: 'video',
           video: {
             id: input.headerMediaId,
           },
         },
       ],
     });
   }

   if (headerMediaType === 'document') {
     components.push({
       type: 'header',
       parameters: [
         {
           type: 'document',
           document: {
             id: input.headerMediaId,
           },
         },
       ],
     });
   }
 } else if (headerVariables.length > 0) {
   components.push({
     type: 'header',
     parameters: input.variableValues
       .slice(0, headerVariables.length)
       .map((value) => ({
         type: 'text',
         text: value,
       })),
   });
 }

    if (bodyVariables.length > 0) {
      components.push({
        type: 'body',
        parameters: input.variableValues
          .slice(headerVariables.length, headerVariables.length + bodyVariables.length)
          .map((value) => ({
            type: 'text',
            text: value,
          })),
      });
    }

    const buttonVariableSlots = this.getButtonVariableSlots(input.components);
let buttonVariableStartIndex = headerVariables.length + bodyVariables.length;

for (const buttonSlot of buttonVariableSlots) {
  const buttonValue = input.variableValues[buttonVariableStartIndex];

  components.push({
    type: 'button',
    sub_type: 'url',
    index: String(buttonSlot.index),
    parameters: [
      {
        type: 'text',
        text: buttonValue,
      },
    ],
  });

  buttonVariableStartIndex += 1;
}

    const apiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${input.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: 'template',
          template: {
            name: input.templateName,
            language: {
              code: input.language,
            },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      },
    );

    const data: {
      messages?: Array<{
        id?: string;
      }>;
      error?: {
        message?: string;
      };
    } = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Meta template send failed');
    }

    const messageId = data.messages?.[0]?.id;

if (!messageId) {
  throw new Error('Meta did not return message ID');
}

return messageId;
  }
}