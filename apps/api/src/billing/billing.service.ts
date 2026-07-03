import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BillingService {
   constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listActivePlans() {
    await this.ensureDefaultPlans();

    return this.prisma.plan.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          priceMonthlyPaise: 'asc',
        },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceMonthlyPaise: true,
        currency: true,
        monthlyCampaignRecipientLimit: true,
        monthlyCampaignLimit: true,
        maxContacts: true,
        maxTeamUsers: true,
        maxAutomationRules: true,
        mediaStorageMb: true,
        supportLevel: true,
        requiresApproval: true,
      },
    });
  }

async getCurrentSubscription(tenantId: string) {
  await this.ensureDefaultPlans();

  const activeSubscription = await this.prisma.tenantSubscription.findFirst({
    where: {
      tenantId,
      status: {
        in: ['TRIAL', 'ACTIVE', 'PAST_DUE'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      plan: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          priceMonthlyPaise: true,
          currency: true,
          monthlyCampaignRecipientLimit: true,
          monthlyCampaignLimit: true,
          maxContacts: true,
          maxTeamUsers: true,
          maxAutomationRules: true,
          mediaStorageMb: true,
          supportLevel: true,
          requiresApproval: true,
        },
      },
    },
  });

if (activeSubscription) {
  const now = new Date();
  const shouldExpire =
    ['TRIAL', 'ACTIVE'].includes(activeSubscription.status) &&
    activeSubscription.currentPeriodEnd <= now;

  if (!shouldExpire) {
    return activeSubscription;
  }

  const expiredSubscription = await this.prisma.tenantSubscription.update({
    where: {
      id: activeSubscription.id,
    },
    data: {
      status: 'PAST_DUE',
    },
    include: {
      plan: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          priceMonthlyPaise: true,
          currency: true,
          monthlyCampaignRecipientLimit: true,
          monthlyCampaignLimit: true,
          maxContacts: true,
          maxTeamUsers: true,
          maxAutomationRules: true,
          mediaStorageMb: true,
          supportLevel: true,
          requiresApproval: true,
        },
      },
    },
  });

  await this.recordBillingAuditLog({
    tenantId,
    actorUserId: null,
    action: 'BILLING_SUBSCRIPTION_EXPIRED',
    entityType: 'TenantSubscription',
    entityId: expiredSubscription.id,
    metadata: {
      planId: expiredSubscription.plan.id,
      planCode: expiredSubscription.plan.code,
      planName: expiredSubscription.plan.name,
      status: expiredSubscription.status,
      expiredAt: now.toISOString(),
      currentPeriodEnd: expiredSubscription.currentPeriodEnd.toISOString(),
    },
  });

  return expiredSubscription;
}

  const pendingSubscription = await this.prisma.tenantSubscription.findFirst({
    where: {
      tenantId,
      status: 'PENDING_APPROVAL',
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      plan: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          priceMonthlyPaise: true,
          currency: true,
          monthlyCampaignRecipientLimit: true,
          monthlyCampaignLimit: true,
          maxContacts: true,
          maxTeamUsers: true,
          maxAutomationRules: true,
          mediaStorageMb: true,
          supportLevel: true,
          requiresApproval: true,
        },
      },
    },
  });

  if (pendingSubscription) {
    return pendingSubscription;
  }

  return this.createTrialSubscription(tenantId);
}

private async assertPlanCanSupportCurrentUsage(
 tenantId: string,
 plan: {
   name: string;
   maxContacts: number;
   maxTeamUsers: number;
   mediaStorageMb: number;
   monthlyCampaignLimit: number;
   monthlyCampaignRecipientLimit: number;
 },
) {
 const currentSubscription = await this.getCurrentSubscription(tenantId);

 if (!currentSubscription) {
   return {
     ok: true,
   };
 }

 const [activeContacts, activeUsers, mediaStorage, usage] =
   await Promise.all([
     this.prisma.contact.count({
       where: {
         tenantId,
         deletedAt: null,
       },
     }),
     this.prisma.user.count({
       where: {
         tenantId,
         isActive: true,
       },
     }),
     this.prisma.mediaFile.aggregate({
       where: {
         tenantId,
       },
       _sum: {
         sizeBytes: true,
       },
     }),
     this.getCurrentUsage(
       tenantId,
       currentSubscription.currentPeriodStart,
       currentSubscription.currentPeriodEnd,
     ),
   ]);

 const usedMediaBytes = mediaStorage._sum.sizeBytes || 0;
 const planMediaBytes = plan.mediaStorageMb * 1024 * 1024;
 const violations: string[] = [];

 if (activeContacts > plan.maxContacts) {
   violations.push(
     `${activeContacts} active contacts used, but ${plan.name} allows ${plan.maxContacts}`,
   );
 }

 if (activeUsers > plan.maxTeamUsers) {
   violations.push(
     `${activeUsers} active team users used, but ${plan.name} allows ${plan.maxTeamUsers}`,
   );
 }

 if (usedMediaBytes > planMediaBytes) {
   violations.push(
     `${Math.ceil(
       usedMediaBytes / 1024 / 1024,
     )} MB media used, but ${plan.name} allows ${plan.mediaStorageMb} MB`,
   );
 }

 if (usage.campaignsCreated > plan.monthlyCampaignLimit) {
   violations.push(
     `${usage.campaignsCreated} campaigns created this period, but ${plan.name} allows ${plan.monthlyCampaignLimit}`,
   );
 }

 if (
   usage.campaignRecipientsPlanned >
   plan.monthlyCampaignRecipientLimit
 ) {
   violations.push(
     `${usage.campaignRecipientsPlanned} campaign recipients planned this period, but ${plan.name} allows ${plan.monthlyCampaignRecipientLimit}`,
   );
 }

 if (violations.length > 0) {
   throw new BadRequestException(
     `Cannot switch to ${plan.name}. Current usage is above this plan: ${violations.join(
       '; ',
     )}. Please reduce usage or choose a higher plan.`,
   );
 }

 return {
   ok: true,
 };
}

async requestPlanChange(
  tenantId: string,
  planId: string,
  actorUserId: string,
) {
  await this.ensureDefaultPlans();

  const plan = await this.prisma.plan.findFirst({
    where: {
      id: planId,
      isActive: true,
    },
  });

  if (!plan) {
    throw new BadRequestException('Selected plan is not available');
  }

  const currentSubscription = await this.getCurrentSubscription(tenantId);

  if (
    currentSubscription?.planId === plan.id &&
    currentSubscription.status !== 'PENDING_APPROVAL'
  ) {
    return {
      ok: true,
      unchanged: true,
      subscription: currentSubscription,
    };
  }

  const existingPendingRequest =
    await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        planId: plan.id,
        status: 'PENDING_APPROVAL',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            priceMonthlyPaise: true,
            currency: true,
            monthlyCampaignRecipientLimit: true,
            monthlyCampaignLimit: true,
            maxContacts: true,
            maxTeamUsers: true,
            maxAutomationRules: true,
            mediaStorageMb: true,
            supportLevel: true,
            requiresApproval: true,
          },
        },
      },
    });

  if (existingPendingRequest) {
    return {
      ok: true,
      unchanged: true,
      status: existingPendingRequest.status,
      paymentRequired: true,
      message: 'This plan request is already pending approval.',
      subscription: existingPendingRequest,
    };
  }
  await this.assertPlanCanSupportCurrentUsage(tenantId, plan);
  const now = new Date();
  const periodEnd = this.addOneMonth(now);
  const isTrialPlan = plan.code === 'trial';

  if (!isTrialPlan) {
    const subscription = await this.prisma.tenantSubscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'PENDING_APPROVAL',
        billingResponsibility: 'CUSTOMER_META_BILLING',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paymentProofStatus:
          plan.priceMonthlyPaise > 0 ? 'PENDING_PROOF' : 'NOT_REQUIRED',
      },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            priceMonthlyPaise: true,
            currency: true,
            monthlyCampaignRecipientLimit: true,
            monthlyCampaignLimit: true,
            maxContacts: true,
            maxTeamUsers: true,
            maxAutomationRules: true,
            mediaStorageMb: true,
            supportLevel: true,
            requiresApproval: true,
          },
        },
      },
    });

await this.recordBillingAuditLog({
  tenantId,
  actorUserId,
  action: 'BILLING_PLAN_REQUESTED',
  entityType: 'TenantSubscription',
  entityId: subscription.id,
  metadata: {
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    status: subscription.status,
  },
});

await this.notifications.sendToPlatformAdmins({
  tenantId,
  event: 'BILLING_PLAN_REQUESTED',
  subject: `New billing plan request: ${plan.name}`,
  text: [
    `A tenant requested a billing plan.`,
    `Tenant ID: ${tenantId}`,
    `Plan: ${plan.name} (${plan.code})`,
    `Status: ${subscription.status}`,
    `Payment proof status: ${subscription.paymentProofStatus}`,
  ].join('\n'),
  metadata: {
    subscriptionId: subscription.id,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    status: subscription.status,
    paymentProofStatus: subscription.paymentProofStatus,
  },
});

return {
  ok: true,
  status: subscription.status,
  paymentRequired: true,
  message:
    'Plan request saved. Your current plan stays active until approval.',
  subscription,
};
  }


  const subscription = await this.prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.updateMany({
      where: {
        tenantId,
        status: {
          in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'PENDING_APPROVAL'],
        },
      },
      data: {
        status: 'CANCELED',
        canceledAt: now,
      },
    });

    return tx.tenantSubscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'TRIAL',
        billingResponsibility: 'CUSTOMER_META_BILLING',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
          paymentProofStatus:
          plan.priceMonthlyPaise > 0 ? 'PENDING_PROOF' : 'NOT_REQUIRED',
        trialEndsAt: periodEnd,
      },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            priceMonthlyPaise: true,
            currency: true,
            monthlyCampaignRecipientLimit: true,
            monthlyCampaignLimit: true,
            maxContacts: true,
            maxTeamUsers: true,
            maxAutomationRules: true,
            mediaStorageMb: true,
            supportLevel: true,
            requiresApproval: true,
          },
        },
      },
    });
  });

await this.recordBillingAuditLog({
  tenantId,
  actorUserId,
  action: 'BILLING_TRIAL_ACTIVATED',
  entityType: 'TenantSubscription',
  entityId: subscription.id,
  metadata: {
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    status: subscription.status,
  },
});

return {
  ok: true,
  status: subscription.status,
  paymentRequired: false,
  message: 'Trial plan activated',
  subscription,
};
}

  private async createTrialSubscription(tenantId: string) {
    const trialPlan = await this.prisma.plan.findUnique({
      where: {
        code: 'trial',
      },
    });

    if (!trialPlan) {
      throw new BadRequestException('Trial plan is not configured');
    }

    const now = new Date();
    const periodEnd = this.addOneMonth(now);

    return this.prisma.tenantSubscription.create({
      data: {
        tenantId,
        planId: trialPlan.id,
        status: 'TRIAL',
        billingResponsibility: 'CUSTOMER_META_BILLING',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: periodEnd,
      },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            priceMonthlyPaise: true,
            currency: true,
            monthlyCampaignRecipientLimit: true,
            monthlyCampaignLimit: true,
            maxContacts: true,
            maxTeamUsers: true,
            maxAutomationRules: true,
            mediaStorageMb: true,
            supportLevel: true,
            requiresApproval: true,
          },
        },
      },
    });
  }

  private async ensureDefaultPlans() {
    const defaultPlans = [
{
  code: 'trial',
  name: 'Trial',
  description:
    'Test the platform with your own Meta WhatsApp connection and small team.',
  priceMonthlyPaise: 0,
  currency: 'INR',
  monthlyCampaignRecipientLimit: 500,
  monthlyCampaignLimit: 5,
  maxContacts: 1000,
  maxTeamUsers: 3,
  maxAutomationRules: 2,
  mediaStorageMb: 250,
  supportLevel: 'basic',
  requiresApproval: false,
  sortOrder: 1,
},
      {
        code: 'starter',
        name: 'Starter',
        description: 'For small businesses starting WhatsApp campaigns.',
        priceMonthlyPaise: 199900,
        currency: 'INR',
        monthlyCampaignRecipientLimit: 10000,
        monthlyCampaignLimit: 50,
        maxContacts: 25000,
        maxTeamUsers: 3,
        maxAutomationRules: 10,
        mediaStorageMb: 2000,
        supportLevel: 'standard',
        requiresApproval: false,
        sortOrder: 2,
      },
      {
        code: 'growth',
        name: 'Growth',
        description: 'For growing teams with higher campaign volume.',
        priceMonthlyPaise: 499900,
        currency: 'INR',
        monthlyCampaignRecipientLimit: 100000,
        monthlyCampaignLimit: 250,
        maxContacts: 250000,
        maxTeamUsers: 10,
        maxAutomationRules: 50,
        mediaStorageMb: 10000,
        supportLevel: 'priority',
        requiresApproval: false,
        sortOrder: 3,
      },
      {
        code: 'enterprise',
        name: 'Enterprise',
        description: 'Custom limits, onboarding support, SLA, and advanced controls.',
        priceMonthlyPaise: 0,
        currency: 'INR',
        monthlyCampaignRecipientLimit: 1000000,
        monthlyCampaignLimit: 1000,
        maxContacts: 1000000,
        maxTeamUsers: 50,
        maxAutomationRules: 250,
        mediaStorageMb: 50000,
        supportLevel: 'enterprise',
        requiresApproval: true,
        sortOrder: 4,
      },
    ];

    for (const plan of defaultPlans) {
      await this.prisma.plan.upsert({
        where: {
          code: plan.code,
        },
        update: plan,
        create: plan,
      });
    }
  }

  async listTenantPendingSubscriptions(tenantId: string) {
  await this.ensureDefaultPlans();

  return this.prisma.tenantSubscription.findMany({
    where: {
      tenantId,
      status: 'PENDING_APPROVAL',
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      plan: {
        select: {
          id: true,
          code: true,
          name: true,
          priceMonthlyPaise: true,
          currency: true,
          monthlyCampaignRecipientLimit: true,
          monthlyCampaignLimit: true,
          maxContacts: true,
          maxTeamUsers: true,
          requiresApproval: true,
        },
      },
    },
  });
}

    async listPendingSubscriptions() {
    await this.ensureDefaultPlans();

    return this.prisma.tenantSubscription.findMany({
      where: {
        status: 'PENDING_APPROVAL',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            priceMonthlyPaise: true,
            currency: true,
            monthlyCampaignRecipientLimit: true,
            monthlyCampaignLimit: true,
            maxContacts: true,
            maxTeamUsers: true,
            requiresApproval: true,
          },
        },
      },
    });
  }

  async submitPaymentProof(
  tenantId: string,
  subscriptionId: string,
  actorUserId: string,
  body: {
    paymentReference?: string;
    paymentPayerName?: string;
    paymentAmountPaise?: number;
    paymentProofNote?: string;
  },
) {
  const paymentReference = String(body.paymentReference || '').trim();
  const paymentPayerName = String(body.paymentPayerName || '').trim();
  const paymentProofNote = String(body.paymentProofNote || '').trim();
  const paymentAmountPaise = Number(body.paymentAmountPaise || 0);

  if (paymentReference.length < 4 || paymentReference.length > 80) {
    throw new BadRequestException(
      'Payment reference/UTR must be 4 to 80 characters.',
    );
  }

  if (paymentPayerName.length < 2 || paymentPayerName.length > 80) {
    throw new BadRequestException('Payer name must be 2 to 80 characters.');
  }

  if (!Number.isInteger(paymentAmountPaise) || paymentAmountPaise <= 0) {
    throw new BadRequestException('Payment amount is required.');
  }

  if (paymentProofNote.length > 500) {
    throw new BadRequestException('Payment note cannot exceed 500 characters.');
  }

  const subscription = await this.prisma.tenantSubscription.findFirst({
    where: {
      id: subscriptionId,
      tenantId,
      status: 'PENDING_APPROVAL',
    },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    throw new NotFoundException('Pending subscription request not found');
  }

  if (subscription.plan.priceMonthlyPaise <= 0) {
    throw new BadRequestException(
      'Payment proof is not required for this plan.',
    );
  }

  const updatedSubscription = await this.prisma.tenantSubscription.update({
    where: {
      id: subscription.id,
    },
    data: {
      paymentProofStatus: 'PENDING_VERIFICATION',
      paymentReference,
      paymentPayerName,
      paymentAmountPaise,
      paymentProofNote: paymentProofNote || null,
      paymentSubmittedAt: new Date(),
      paymentRejectedAt: null,
      paymentAdminNote: null,
    },
    include: {
      plan: true,
    },
  });

  await this.recordBillingAuditLog({
    tenantId,
    actorUserId,
    action: 'BILLING_PAYMENT_PROOF_SUBMITTED',
    entityType: 'TenantSubscription',
    entityId: subscription.id,
    metadata: {
      planId: subscription.plan.id,
      planCode: subscription.plan.code,
      planName: subscription.plan.name,
      paymentReference,
      paymentAmountPaise,
      status: updatedSubscription.paymentProofStatus,
    },
  });

    await this.notifications.sendToPlatformAdmins({
    tenantId,
    event: 'BILLING_PAYMENT_PROOF_SUBMITTED',
    subject: `Payment proof submitted: ${subscription.plan.name}`,
    text: [
      `A tenant submitted manual payment proof.`,
      `Tenant ID: ${tenantId}`,
      `Plan: ${subscription.plan.name} (${subscription.plan.code})`,
      `Payment reference: ${paymentReference}`,
      `Payer name: ${paymentPayerName}`,
      `Amount: ₹${(paymentAmountPaise / 100).toFixed(2)}`,
      `Status: ${updatedSubscription.paymentProofStatus}`,
    ].join('\n'),
    metadata: {
      subscriptionId: subscription.id,
      planId: subscription.plan.id,
      planCode: subscription.plan.code,
      planName: subscription.plan.name,
      paymentReference,
      paymentAmountPaise,
      status: updatedSubscription.paymentProofStatus,
    },
  });

  return {
    ok: true,
    message: 'Payment proof submitted. Admin verification is pending.',
    subscription: updatedSubscription,
  };
}

   async approveSubscription(
  subscriptionId: string,
  actorUserId: string,
  adminNote?: string,
) {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        id: subscriptionId,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        plan: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription request not found');
    }

    if (subscription.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Only PENDING_APPROVAL subscriptions can be approved. Current status is ${subscription.status}.`,
      );
    }

    const cleanAdminNote = String(adminNote || '').trim();

if (cleanAdminNote.length > 500) {
  throw new BadRequestException('Admin note cannot exceed 500 characters.');
}

if (
  subscription.plan.priceMonthlyPaise > 0 &&
  subscription.paymentProofStatus !== 'PENDING_VERIFICATION'
) {
  throw new BadRequestException(
    'Payment proof must be submitted before approving this paid plan.',
  );
}

    const now = new Date();
    const periodEnd = this.addOneMonth(now);

    const approvedSubscription = await this.prisma.$transaction(async (tx) => {
      await tx.tenantSubscription.updateMany({
        where: {
          tenantId: subscription.tenantId,
          id: {
            not: subscription.id,
          },
          status: {
            in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'PENDING_APPROVAL'],
          },
        },
        data: {
          status: 'CANCELED',
          canceledAt: now,
        },
      });

      return tx.tenantSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          canceledAt: null,
                    paymentProofStatus:
            subscription.plan.priceMonthlyPaise > 0 ? 'VERIFIED' : 'NOT_REQUIRED',
          paymentVerifiedAt:
            subscription.plan.priceMonthlyPaise > 0 ? now : null,
          paymentVerifiedByUserId:
            subscription.plan.priceMonthlyPaise > 0 ? actorUserId : null,
          paymentAdminNote: cleanAdminNote || null,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              priceMonthlyPaise: true,
              currency: true,
              monthlyCampaignRecipientLimit: true,
              monthlyCampaignLimit: true,
              maxContacts: true,
              maxTeamUsers: true,
              requiresApproval: true,
            },
          },
        },
      });
    });

await this.recordBillingAuditLog({
  tenantId: approvedSubscription.tenant.id,
  actorUserId,
  action: 'BILLING_SUBSCRIPTION_APPROVED',
  entityType: 'TenantSubscription',
  entityId: approvedSubscription.id,
  metadata: {
    planId: approvedSubscription.plan.id,
    planCode: approvedSubscription.plan.code,
    planName: approvedSubscription.plan.name,
    status: approvedSubscription.status,
  },
});

await this.notifications.sendToTenantAdmins({
  tenantId: approvedSubscription.tenant.id,
  event: 'BILLING_SUBSCRIPTION_APPROVED',
  subject: `Plan activated: ${approvedSubscription.plan.name}`,
  text: [
    `Your billing plan has been activated.`,
    `Business: ${approvedSubscription.tenant.name}`,
    `Plan: ${approvedSubscription.plan.name} (${approvedSubscription.plan.code})`,
    `Status: ${approvedSubscription.status}`,
    `Current period ends: ${approvedSubscription.currentPeriodEnd.toISOString()}`,
  ].join('\n'),
  metadata: {
    subscriptionId: approvedSubscription.id,
    planId: approvedSubscription.plan.id,
    planCode: approvedSubscription.plan.code,
    planName: approvedSubscription.plan.name,
    status: approvedSubscription.status,
  },
});

return {
  ok: true,
  approved: true,
  approvedBy: actorUserId,
  subscription: approvedSubscription,
};
  }

    async cancelSubscription(subscriptionId: string, actorUserId: string) {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        id: subscriptionId,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === 'CANCELED') {
      return {
        ok: true,
        unchanged: true,
        canceledBy: actorUserId,
        subscription,
      };
    }

    const canceledSubscription = await this.prisma.tenantSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        paymentProofStatus: 'REJECTED',
        paymentRejectedAt: new Date(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

await this.recordBillingAuditLog({
  tenantId: canceledSubscription.tenant.id,
  actorUserId,
  action: 'BILLING_SUBSCRIPTION_CANCELED',
  entityType: 'TenantSubscription',
  entityId: canceledSubscription.id,
  metadata: {
    planId: canceledSubscription.plan.id,
    planCode: canceledSubscription.plan.code,
    planName: canceledSubscription.plan.name,
    status: canceledSubscription.status,
  },
});

await this.notifications.sendToTenantAdmins({
  tenantId: canceledSubscription.tenant.id,
  event: 'BILLING_SUBSCRIPTION_CANCELED',
  subject: `Plan request canceled: ${canceledSubscription.plan.name}`,
  text: [
    `Your billing plan request was canceled.`,
    `Business: ${canceledSubscription.tenant.name}`,
    `Plan: ${canceledSubscription.plan.name} (${canceledSubscription.plan.code})`,
    `Status: ${canceledSubscription.status}`,
  ].join('\n'),
  metadata: {
    subscriptionId: canceledSubscription.id,
    planId: canceledSubscription.plan.id,
    planCode: canceledSubscription.plan.code,
    planName: canceledSubscription.plan.name,
    status: canceledSubscription.status,
  },
});

return {
  ok: true,
  canceled: true,
  canceledBy: actorUserId,
  subscription: canceledSubscription,
};
  }

    async getUsageSummary(tenantId: string) {
    const subscription = await this.getCurrentSubscription(tenantId);

    if (!subscription) {
      throw new BadRequestException('Active subscription is required');
    }

 const usage = await this.getCurrentUsage(
   tenantId,
   subscription.currentPeriodStart,
   subscription.currentPeriodEnd,
 );

 const [activeContacts, teamUsers, mediaStorage] = await Promise.all([
   this.prisma.contact.count({
     where: {
       tenantId,
       deletedAt: null,
     },
   }),
   this.prisma.user.count({
     where: {
       tenantId,
       isActive: true,
     },
   }),
   this.prisma.mediaFile.aggregate({
     where: {
       tenantId,
     },
     _sum: {
       sizeBytes: true,
     },
   }),
 ]);

 const mediaUsedBytes = mediaStorage._sum.sizeBytes || 0;
 const mediaLimitBytes = subscription.plan.mediaStorageMb * 1024 * 1024;

 return {
   subscriptionStatus: subscription.status,
   periodStart: subscription.currentPeriodStart,
   periodEnd: subscription.currentPeriodEnd,
   billingResponsibility: subscription.billingResponsibility,
   plan: {
     id: subscription.plan.id,
     code: subscription.plan.code,
     name: subscription.plan.name,
     monthlyCampaignRecipientLimit:
       subscription.plan.monthlyCampaignRecipientLimit,
     monthlyCampaignLimit: subscription.plan.monthlyCampaignLimit,
     maxContacts: subscription.plan.maxContacts,
     maxTeamUsers: subscription.plan.maxTeamUsers,
     maxAutomationRules: subscription.plan.maxAutomationRules,
     mediaStorageMb: subscription.plan.mediaStorageMb,
   },
   usage: {
     campaignsCreated: usage.campaignsCreated,
     campaignRecipientsPlanned: usage.campaignRecipientsPlanned,
     campaignRecipientsSent: usage.campaignRecipientsSent,
     activeContacts,
     teamUsers,
     mediaUsedBytes,
   },
   remaining: {
     campaigns: Math.max(
       0,
       subscription.plan.monthlyCampaignLimit - usage.campaignsCreated,
     ),
     campaignRecipients: Math.max(
       0,
       subscription.plan.monthlyCampaignRecipientLimit -
         usage.campaignRecipientsPlanned,
     ),
     contacts: Math.max(0, subscription.plan.maxContacts - activeContacts),
     teamUsers: Math.max(0, subscription.plan.maxTeamUsers - teamUsers),
     mediaBytes: Math.max(0, mediaLimitBytes - mediaUsedBytes),
   },
 };
}

async getEnforcementSummary(tenantId: string) {
const summary = await this.getUsageSummary(tenantId);
const isActive = ['TRIAL', 'ACTIVE'].includes(summary.subscriptionStatus);

const blockers: string[] = [];

if (!isActive) {
 blockers.push(
   `Current subscription status is ${summary.subscriptionStatus}. Activate a plan to continue protected actions.`,
 );
}

if (summary.remaining.contacts <= 0) {
 blockers.push('Contact limit reached.');
}

if (summary.remaining.campaigns <= 0) {
 blockers.push('Monthly campaign limit reached.');
}

if (summary.remaining.campaignRecipients <= 0) {
 blockers.push('Monthly campaign recipient limit reached.');
}

if (summary.remaining.teamUsers <= 0) {
 blockers.push('Team user limit reached.');
}

if (summary.remaining.mediaBytes <= 0) {
 blockers.push('Media storage limit reached.');
}

return {
 ok: isActive && blockers.length === 0,
 subscriptionStatus: summary.subscriptionStatus,
 plan: summary.plan,
 usage: summary.usage,
 remaining: summary.remaining,
 enforcement: {
   canCreateContacts: isActive && summary.remaining.contacts > 0,
   canCreateCampaigns:
     isActive &&
     summary.remaining.campaigns > 0 &&
     summary.remaining.campaignRecipients > 0,
   canAddTeamUsers: isActive && summary.remaining.teamUsers > 0,
   canUploadMedia: isActive && summary.remaining.mediaBytes > 0,
   canUseWorkspace: isActive,
 },
 blockers,
};
}

    async assertCanCreateCampaign(tenantId: string, plannedRecipients: number) {
    if (plannedRecipients <= 0) {
      throw new BadRequestException('Campaign must have at least 1 recipient');
    }

    const subscription = await this.getCurrentSubscription(tenantId);

    if (!subscription) {
      throw new BadRequestException('Active subscription is required');
    }

    if (!['TRIAL', 'ACTIVE'].includes(subscription.status)) {
      throw new BadRequestException(
        `Your current plan status is ${subscription.status}. Please activate your plan before creating campaigns.`,
      );
    }

    const usage = await this.getCurrentUsage(
      tenantId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );

    const campaignLimitExceeded =
      usage.campaignsCreated + 1 > subscription.plan.monthlyCampaignLimit;

    if (campaignLimitExceeded) {
      throw new BadRequestException(
        `Your plan allows ${subscription.plan.monthlyCampaignLimit} campaigns in this billing period.`,
      );
    }

    const recipientLimitExceeded =
      usage.campaignRecipientsPlanned + plannedRecipients >
      subscription.plan.monthlyCampaignRecipientLimit;

    if (recipientLimitExceeded) {
      const remainingRecipients =
        subscription.plan.monthlyCampaignRecipientLimit -
        usage.campaignRecipientsPlanned;

      throw new BadRequestException(
        `This campaign needs ${plannedRecipients} recipients, but your plan has ${Math.max(
          0,
          remainingRecipients,
        )} campaign recipients remaining in this billing period.`,
      );
    }

    return {
      ok: true,
      subscriptionId: subscription.id,
      planCode: subscription.plan.code,
      planName: subscription.plan.name,
      plannedRecipients,
      campaignsRemaining:
        subscription.plan.monthlyCampaignLimit - usage.campaignsCreated,
      recipientsRemaining:
        subscription.plan.monthlyCampaignRecipientLimit -
        usage.campaignRecipientsPlanned,
    };
  }

  async assertCanCreateTeamUsersInTransaction(
 tx: Prisma.TransactionClient,
 tenantId: string,
 usersToAdd: number,
) {
 if (usersToAdd <= 0) {
   return {
     ok: true,
     usersToAdd,
   };
 }

 const now = new Date();

 const subscription = await tx.tenantSubscription.findFirst({
   where: {
     tenantId,
     status: {
       in: ['TRIAL', 'ACTIVE'],
     },
     currentPeriodStart: {
       lte: now,
     },
     currentPeriodEnd: {
       gt: now,
     },
   },
   orderBy: {
     createdAt: 'desc',
   },
   include: {
     plan: true,
   },
 });

 if (!subscription) {
   throw new BadRequestException(
     'Active subscription is required before adding team users.',
   );
 }

 const activeUsers = await tx.user.count({
   where: {
     tenantId,
     isActive: true,
   },
 });

 const wouldBecome = activeUsers + usersToAdd;

 if (wouldBecome > subscription.plan.maxTeamUsers) {
   throw new BadRequestException(
     `Your plan allows ${subscription.plan.maxTeamUsers} active team users. You currently have ${activeUsers}, so you can add ${Math.max(
       0,
       subscription.plan.maxTeamUsers - activeUsers,
     )} more users.`,
   );
 }

 return {
   ok: true,
   planCode: subscription.plan.code,
   maxTeamUsers: subscription.plan.maxTeamUsers,
   activeUsers,
   usersToAdd,
   remainingTeamUsers: subscription.plan.maxTeamUsers - wouldBecome,
 };
}

async assertCanCreateContactsInTransaction(
 tx: Prisma.TransactionClient,
 tenantId: string,
 contactsToAdd: number,
) {
 if (contactsToAdd <= 0) {
   return {
     ok: true,
     contactsToAdd,
   };
 }

 const now = new Date();

 const subscription = await tx.tenantSubscription.findFirst({
   where: {
     tenantId,
     status: {
       in: ['TRIAL', 'ACTIVE'],
     },
     currentPeriodStart: {
       lte: now,
     },
     currentPeriodEnd: {
       gt: now,
     },
   },
   orderBy: {
     createdAt: 'desc',
   },
   include: {
     plan: true,
   },
 });

 if (!subscription) {
   throw new BadRequestException(
     'Active subscription is required before adding contacts.',
   );
 }

 const currentContacts = await tx.contact.count({
   where: {
     tenantId,
     deletedAt: null,
   },
 });

 const wouldBecome = currentContacts + contactsToAdd;

 if (wouldBecome > subscription.plan.maxContacts) {
   throw new BadRequestException(
     `Your plan allows ${subscription.plan.maxContacts} active contacts. You currently have ${currentContacts}, so you can add ${Math.max(
       0,
       subscription.plan.maxContacts - currentContacts,
     )} more contacts.`,
   );
 }

 return {
   ok: true,
   planCode: subscription.plan.code,
   maxContacts: subscription.plan.maxContacts,
   currentContacts,
   contactsToAdd,
   remainingContacts: subscription.plan.maxContacts - wouldBecome,
 };
}

  async assertCanCreateContacts(tenantId: string, contactsToAdd: number) {
  if (contactsToAdd <= 0) {
    return {
      ok: true,
      contactsToAdd,
    };
  }

  const subscription = await this.getCurrentSubscription(tenantId);

  if (!subscription) {
    throw new BadRequestException('Active subscription is required');
  }

  if (!['TRIAL', 'ACTIVE'].includes(subscription.status)) {
    throw new BadRequestException(
      `Your current plan status is ${subscription.status}. Please activate your plan before adding contacts.`,
    );
  }

  const currentContacts = await this.prisma.contact.count({
    where: {
      tenantId,
      deletedAt: null,
    },
  });

  const wouldBecome = currentContacts + contactsToAdd;

  if (wouldBecome > subscription.plan.maxContacts) {
    throw new BadRequestException(
      `Your plan allows ${subscription.plan.maxContacts} active contacts. You currently have ${currentContacts}, so you can add ${Math.max(
        0,
        subscription.plan.maxContacts - currentContacts,
      )} more contacts.`,
    );
  }

  return {
    ok: true,
    planCode: subscription.plan.code,
    maxContacts: subscription.plan.maxContacts,
    currentContacts,
    contactsToAdd,
    remainingContacts: subscription.plan.maxContacts - wouldBecome,
  };
}

async assertCanUploadMediaInTransaction(
tx: Prisma.TransactionClient,
tenantId: string,
uploadSizeBytes: number,
) {
if (uploadSizeBytes <= 0) {
 throw new BadRequestException('Uploaded file is empty');
}

const now = new Date();

const subscription = await tx.tenantSubscription.findFirst({
 where: {
   tenantId,
   status: {
     in: ['TRIAL', 'ACTIVE'],
   },
   currentPeriodStart: {
     lte: now,
   },
   currentPeriodEnd: {
     gt: now,
   },
 },
 orderBy: {
   createdAt: 'desc',
 },
 include: {
   plan: true,
 },
});

if (!subscription) {
 throw new BadRequestException(
   'Active subscription is required before uploading media.',
 );
}

const usedStorage = await tx.mediaFile.aggregate({
 where: {
   tenantId,
 },
 _sum: {
   sizeBytes: true,
 },
});

const usedBytes = usedStorage._sum.sizeBytes || 0;
const maxBytes = subscription.plan.mediaStorageMb * 1024 * 1024;

if (usedBytes + uploadSizeBytes > maxBytes) {
 const remainingMb = Math.max(0, (maxBytes - usedBytes) / 1024 / 1024);

 throw new BadRequestException(
   `Your plan allows ${subscription.plan.mediaStorageMb} MB media storage. You have ${remainingMb.toFixed(
     2,
   )} MB remaining.`,
 );
}

return {
 ok: true,
 planCode: subscription.plan.code,
 mediaStorageMb: subscription.plan.mediaStorageMb,
 usedBytes,
 uploadSizeBytes,
 remainingBytes: maxBytes - usedBytes - uploadSizeBytes,
};
}

async assertCanUploadMedia(tenantId: string, uploadSizeBytes: number) {
return this.prisma.$transaction(
 async (tx) =>
   this.assertCanUploadMediaInTransaction(tx, tenantId, uploadSizeBytes),
 {
   isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
 },
);
}

async assertSubscriptionCanUseWorkspace(tenantId: string, actionName: string) {
 const subscription = await this.getCurrentSubscription(tenantId);

 if (!subscription) {
   throw new BadRequestException(
     `Active subscription is required before ${actionName}.`,
   );
 }

 if (!['TRIAL', 'ACTIVE'].includes(subscription.status)) {
   throw new BadRequestException(
     `Your current plan status is ${subscription.status}. Please activate your plan before ${actionName}.`,
   );
 }

 return {
   ok: true,
   subscriptionId: subscription.id,
   planCode: subscription.plan.code,
   planName: subscription.plan.name,
   status: subscription.status,
 };
}

async reserveCampaignUsageInTransaction(
tx: Prisma.TransactionClient,
tenantId: string,
plannedRecipients: number,
) {
if (plannedRecipients <= 0) {
throw new BadRequestException('Campaign must have at least 1 recipient');
}

const now = new Date();

const subscription = await tx.tenantSubscription.findFirst({
  where: {
    tenantId,
    status: {
      in: ['TRIAL', 'ACTIVE'],
    },
    currentPeriodStart: {
      lte: now,
    },
    currentPeriodEnd: {
      gt: now,
    },
  },
  orderBy: {
    createdAt: 'desc',
  },
  include: {
    plan: true,
  },
});

if (!subscription) {
  throw new BadRequestException(
    'Active subscription is required before creating campaigns.',
  );
}

const usage = await tx.tenantUsage.upsert({
  where: {
    tenantId_periodStart_periodEnd: {
      tenantId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    },
  },
  update: {},
  create: {
    tenantId,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
  },
});

const campaignsAfterCreate = usage.campaignsCreated + 1;
const recipientsAfterCreate =
  usage.campaignRecipientsPlanned + plannedRecipients;

if (campaignsAfterCreate > subscription.plan.monthlyCampaignLimit) {
  throw new BadRequestException(
    `Your plan allows ${subscription.plan.monthlyCampaignLimit} campaigns in this billing period.`,
  );
}

if (
  recipientsAfterCreate >
  subscription.plan.monthlyCampaignRecipientLimit
) {
  const remainingRecipients =
    subscription.plan.monthlyCampaignRecipientLimit -
    usage.campaignRecipientsPlanned;

  throw new BadRequestException(
    `This campaign needs ${plannedRecipients} recipients, but your plan has ${Math.max(
      0,
      remainingRecipients,
    )} campaign recipients remaining in this billing period.`,
  );
}

await tx.tenantUsage.update({
  where: {
    id: usage.id,
  },
  data: {
    campaignsCreated: {
      increment: 1,
    },
    campaignRecipientsPlanned: {
      increment: plannedRecipients,
    },
  },
});

return {
  ok: true,
  subscriptionId: subscription.id,
  planCode: subscription.plan.code,
  planName: subscription.plan.name,
  plannedRecipients,
  campaignsRemaining:
    subscription.plan.monthlyCampaignLimit - campaignsAfterCreate,
  recipientsRemaining:
    subscription.plan.monthlyCampaignRecipientLimit - recipientsAfterCreate,
};
}

async recordCampaignCreatedUsage(tenantId: string, plannedRecipients: number) {
return this.prisma.$transaction(
async (tx) =>
this.reserveCampaignUsageInTransaction(
tx,
tenantId,
plannedRecipients,
),
{
isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
},
);
}

  async recordCampaignRecipientsSent(tenantId: string, sentCount: number) {
    if (sentCount <= 0) {
      return;
    }

    const subscription = await this.getCurrentSubscription(tenantId);

    if (!subscription) {
      return;
    }

    await this.prisma.tenantUsage.upsert({
      where: {
        tenantId_periodStart_periodEnd: {
          tenantId,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
        },
      },
      update: {
        campaignRecipientsSent: {
          increment: sentCount,
        },
      },
      create: {
        tenantId,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        campaignRecipientsSent: sentCount,
      },
    });
  }

async listBillingAuditLogs(tenantId?: string) {
return this.prisma.billingAuditLog.findMany({
 where: tenantId
   ? {
       tenantId,
     }
   : undefined,
 orderBy: {
   createdAt: 'desc',
 },
 take: 100,
});
}

async listNotificationLogs(tenantId?: string) {
return this.prisma.notificationLog.findMany({
 where: tenantId
   ? {
       tenantId,
     }
   : undefined,
 orderBy: {
   createdAt: 'desc',
 },
 take: 100,
 select: {
   id: true,
   tenantId: true,
   event: true,
   channel: true,
   recipientEmail: true,
   subject: true,
   status: true,
   error: true,
   metadata: true,
   createdAt: true,
 },
});
}

private async recordBillingAuditLog(input: {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await this.prisma.billingAuditLog.create({
    data: {
      tenantId: input.tenantId || null,
      actorUserId: input.actorUserId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      metadata: input.metadata || undefined,
    },
  });
}

  private async getCurrentUsage(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.prisma.tenantUsage.upsert({
      where: {
        tenantId_periodStart_periodEnd: {
          tenantId,
          periodStart,
          periodEnd,
        },
      },
      update: {},
      create: {
        tenantId,
        periodStart,
        periodEnd,
      },
    });
  }

  private addOneMonth(date: Date) {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + 1);

    return nextDate;
  }
}