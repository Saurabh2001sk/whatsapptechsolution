import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { BillingService } from './billing.service';
import { MediaService } from './media.service';
import { MetaAccountsService } from './meta-accounts.service';
import { DripsQueue } from '../Queues/drips.queue';
import { env } from '../env';

const FIXED_DRIP_TIMEZONE = 'Asia/Kolkata';
const EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE = 1000;
const EXISTING_CONTACTS_NEXT_BATCH_DELAY_MS = 2000;

type DripStepInput = {
  name?: string;
  templateId?: string;
  dayOffset?: number;
  minuteOffset?: number;
  variableValues?: string[];
};

type DripWorkflowInput = {
  name?: string;
  description?: string;
  audienceType?: string;
  targetContactTypeId?: string | null;
  timezone?: string;
  sendingStartTime?: string;
  sendingEndTime?: string;
  sendingDays?: number[];
  autoEnrollNewContacts?: boolean;
  autoEnrollInbound?: boolean;
  includeExistingContacts?: boolean;
  allowReentry?: boolean;
  reentryCooldownDays?: number | null;
  steps?: DripStepInput[];
};

type DripListOptions = {
  limit?: string | number;
  status?: string;
  search?: string;
};

type DripDetailOptions = {
  enrollmentLimit?: string | number;
  messageLimit?: string | number;
};

@Injectable()
export class DripsService {
constructor(
  private readonly prisma: PrismaService,
  private readonly dripsQueue: DripsQueue,
  @Inject(forwardRef(() => MetaAccountsService))
  private readonly metaAccountsService: MetaAccountsService,
  private readonly billingService: BillingService,
  private readonly mediaService: MediaService,
) {}

  listWorkflows(tenantId: string, options: DripListOptions = {}) {
    const limit = this.cleanBoundedInteger(options.limit, 100, 1, 200);
    const status = this.cleanWorkflowStatus(options.status);
    const search = String(options.search || '').trim();
    const where: Prisma.DripWorkflowWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
    };

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    return this.prisma.dripWorkflow.findMany({
      where,
      include: {
        targetContactType: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        steps: {
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
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async getWorkflow(
    tenantId: string,
    workflowId: string,
    options: DripDetailOptions = {},
  ) {
    const enrollmentLimit = this.cleanBoundedInteger(
      options.enrollmentLimit,
      200,
      1,
      200,
    );
    const messageLimit = this.cleanBoundedInteger(
      options.messageLimit,
      50,
      1,
      50,
    );

    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
      },
      include: {
        targetContactType: true,
        steps: {
          include: {
            template: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
        enrollments: {
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
                optedIn: true,
                optInSource: true,
                contactTypeId: true,
              },
            },
            messages: {
              select: {
                id: true,
                stepId: true,
                status: true,
                retryCount: true,
                scheduledFor: true,
                sentAt: true,
                deliveredAt: true,
                readAt: true,
                failedAt: true,
                errorMessage: true,
                statusWebhookAt: true,
                step: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: messageLimit,
            },
          },
          orderBy: {
            enrolledAt: 'desc',
          },
          take: enrollmentLimit,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Drip workflow not found');
    }

    return workflow;
  }

  async getWorkflowSummary(tenantId: string, workflowId: string) {
    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Drip workflow not found');
    }

    const [
      enrollmentStatusGroups,
      messageStatusGroups,
      pendingDueCount,
      processingStuckCount,
      recentFailures,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.dripEnrollment.groupBy({
        by: ['status'],
        where: {
          tenantId,
          workflowId,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.dripMessage.groupBy({
        by: ['status'],
        where: {
          tenantId,
          workflowId,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.dripMessage.count({
        where: {
          tenantId,
          workflowId,
          status: 'PENDING',
          scheduledFor: {
            lte: new Date(),
          },
          workflow: {
            status: 'ACTIVE',
          },
          enrollment: {
            status: 'ACTIVE',
          },
        },
      }),
      this.prisma.dripMessage.count({
        where: {
          tenantId,
          workflowId,
          status: 'PROCESSING',
          updatedAt: {
            lte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
      }),
      this.prisma.dripMessage.findMany({
        where: {
          tenantId,
          workflowId,
          status: 'FAILED',
        },
        select: {
          id: true,
          contactId: true,
          errorMessage: true,
          failedAt: true,
          retryCount: true,
          step: {
            select: {
              id: true,
              name: true,
              position: true,
            },
          },
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
        orderBy: {
          failedAt: 'desc',
        },
        take: 10,
      }),
      this.prisma.dripAuditLog.findMany({
        where: {
          tenantId,
          workflowId,
        },
        select: {
          id: true,
          action: true,
          contactId: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      }),
    ]);

    return {
      workflow,
      enrollmentStatuses: this.toCountMap(enrollmentStatusGroups),
      messageStatuses: this.toCountMap(messageStatusGroups),
      queueHealth: {
        pendingDue: pendingDueCount,
        processingStuck: processingStuckCount,
      },
      recentFailures,
      recentAuditLogs,
    };
  }

  async createWorkflow(
    tenantId: string,
    actorUserId: string,
    input: DripWorkflowInput,
  ) {
    const normalized = await this.validateWorkflowInput(tenantId, input);

    const workflow = await this.prisma.$transaction(
      async (tx) => {
        await this.billingService.assertCanCreateAutomationInTransaction(
          tx,
          tenantId,
          1,
        );

        const createdWorkflow = await tx.dripWorkflow.create({
        data: {
          tenantId,
          name: normalized.name,
          description: normalized.description,
          audienceType: normalized.audienceType,
          targetContactTypeId: normalized.targetContactTypeId,
          timezone: normalized.timezone,
          sendingStartTime: normalized.sendingStartTime,
          sendingEndTime: normalized.sendingEndTime,
          sendingDays: normalized.sendingDays,
          autoEnrollNewContacts: normalized.autoEnrollNewContacts,
          autoEnrollInbound: normalized.autoEnrollInbound,
          includeExistingContacts: normalized.includeExistingContacts,
          allowReentry: normalized.allowReentry,
          reentryCooldownDays: normalized.reentryCooldownDays,
        },
      });

      await tx.dripStep.createMany({
        data: normalized.steps.map((step, index) => ({
          tenantId,
          workflowId: createdWorkflow.id,
          templateId: step.templateId,
          name: step.name,
          dayOffset: step.dayOffset,
          minuteOffset: step.minuteOffset,
          position: index,
          variableValues: step.variableValues as Prisma.InputJsonValue,
        })),
      });

      await tx.dripAuditLog.create({
        data: {
          tenantId,
          workflowId: createdWorkflow.id,
          actorUserId,
          action: 'DRIP_WORKFLOW_CREATED',
          metadata: {
            name: createdWorkflow.name,
            audienceType: createdWorkflow.audienceType,
            targetContactTypeId: createdWorkflow.targetContactTypeId,
            stepCount: normalized.steps.length,
          },
        },
      });

        return createdWorkflow;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return this.getWorkflow(tenantId, workflow.id);
  }

  async updateWorkflow(
    tenantId: string,
    actorUserId: string,
    workflowId: string,
    input: DripWorkflowInput,
  ) {
    const existing = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Drip workflow not found');
    }

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only draft drip workflows can be edited',
      );
    }

    const normalized = await this.validateWorkflowInput(tenantId, input);

    await this.prisma.$transaction(async (tx) => {
      await tx.dripWorkflow.update({
        where: {
          id: existing.id,
        },
        data: {
          name: normalized.name,
          description: normalized.description,
          audienceType: normalized.audienceType,
          targetContactTypeId: normalized.targetContactTypeId,
          timezone: normalized.timezone,
          sendingStartTime: normalized.sendingStartTime,
          sendingEndTime: normalized.sendingEndTime,
          sendingDays: normalized.sendingDays,
          autoEnrollNewContacts: normalized.autoEnrollNewContacts,
          autoEnrollInbound: normalized.autoEnrollInbound,
          includeExistingContacts: normalized.includeExistingContacts,
          allowReentry: normalized.allowReentry,
          reentryCooldownDays: normalized.reentryCooldownDays,
        },
      });

      await tx.dripStep.deleteMany({
        where: {
          tenantId,
          workflowId: existing.id,
        },
      });

      await tx.dripStep.createMany({
        data: normalized.steps.map((step, index) => ({
          tenantId,
          workflowId: existing.id,
          templateId: step.templateId,
          name: step.name,
          dayOffset: step.dayOffset,
          minuteOffset: step.minuteOffset,
          position: index,
          variableValues: step.variableValues as Prisma.InputJsonValue,
        })),
      });

      await tx.dripAuditLog.create({
        data: {
          tenantId,
          workflowId: existing.id,
          actorUserId,
          action: 'DRIP_WORKFLOW_UPDATED',
          metadata: {
            stepCount: normalized.steps.length,
          },
        },
      });
    });

    return this.getWorkflow(tenantId, existing.id);
  }

  async activateWorkflow(
    tenantId: string,
    actorUserId: string,
    workflowId: string,
  ) {
    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
      },
      include: {
        steps: {
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Drip workflow not found');
    }

    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Archived drip workflows cannot be activated',
      );
    }

    if (workflow.steps.length === 0) {
      throw new BadRequestException(
        'Add at least one drip step before activation',
      );
    }

    const wasPaused = workflow.status === 'PAUSED';

    await this.prisma.$transaction([
      this.prisma.dripWorkflow.update({
        where: {
          id: workflow.id,
        },
        data: {
          status: 'ACTIVE',
          activatedAt:
            workflow.activatedAt || new Date(),
          pausedAt: null,
        },
      }),
      ...(wasPaused
        ? [
            this.prisma.dripEnrollment.updateMany({
              where: {
                tenantId,
                workflowId: workflow.id,
                status: 'PAUSED',
              },
              data: {
                status: 'ACTIVE',
                pausedAt: null,
              },
            }),
          ]
        : []),
    ]);

        if (wasPaused) {
      const pendingMessages =
        await this.prisma.dripMessage.findMany({
          where: {
            tenantId,
            workflowId: workflow.id,
            status: 'PENDING',
            enrollment: {
              status: 'ACTIVE',
            },
          },
          select: {
            id: true,
            scheduledFor: true,
          },
          take: 5000,
          orderBy: {
            scheduledFor: 'asc',
          },
        });

      for (const message of pendingMessages) {
        const nextAllowedRunAt =
          this.calculateAllowedRunAt({
            requestedAt: message.scheduledFor,
            timezone: workflow.timezone,
            sendingStartTime:
              workflow.sendingStartTime,
            sendingEndTime:
              workflow.sendingEndTime,
            sendingDays: workflow.sendingDays,
          });

        await this.prisma.dripMessage.updateMany({
          where: {
            id: message.id,
            tenantId,
            workflowId: workflow.id,
            status: 'PENDING',
          },
          data: {
            scheduledFor: nextAllowedRunAt,
            errorMessage: null,
          },
        });

        await this.dripsQueue.addDripMessageJob(
          {
            tenantId,
            dripMessageId: message.id,
          },
          {
            delay: Math.max(
              0,
              nextAllowedRunAt.getTime() -
                Date.now(),
            ),
          },
        );
      }
    }

    let enrollmentResult = {
      enrolled: 0,
      skipped: 0,
      queued: false,
      batchSize: EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE,
    };

    if (
      workflow.includeExistingContacts &&
      !wasPaused &&
      !workflow.activatedAt
    ) {
      await this.dripsQueue.addExistingContactsEnrollmentBatchJob({
        tenantId,
        workflowId: workflow.id,
        actorUserId,
        batchSize: EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE,
      });

      enrollmentResult = {
        enrolled: 0,
        skipped: 0,
        queued: true,
        batchSize: EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE,
      };
    }

    await this.createAuditLog({
      tenantId,
      workflowId: workflow.id,
      actorUserId,
      action: 'DRIP_WORKFLOW_ACTIVATED',
      metadata: {
        existingContactsEnrolled: enrollmentResult.enrolled,
        existingContactsSkipped: enrollmentResult.skipped,
        existingContactsEnrollmentQueued: enrollmentResult.queued,
        existingContactsBatchSize: enrollmentResult.batchSize,
      },
    });

    return {
      ok: true,
      enrollmentResult,
      workflow: await this.getWorkflow(tenantId, workflow.id),
    };
  }

  async processExistingContactsEnrollmentBatch(input: {
    tenantId: string;
    workflowId: string;
    actorUserId: string | null;
    afterContactId?: string | null;
    batchSize?: number;
  }) {
    const batchSize = this.cleanBoundedInteger(
      input.batchSize,
      EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE,
      1,
      EXISTING_CONTACTS_ENROLLMENT_BATCH_SIZE,
    );

    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: input.workflowId,
        tenantId: input.tenantId,
        status: 'ACTIVE',
        includeExistingContacts: true,
      },
      select: {
        id: true,
        audienceType: true,
        targetContactTypeId: true,
      },
    });

    if (!workflow) {
      return {
        ok: true,
        skipped: true,
        reason: 'Workflow is not active for existing-contact enrollment',
      };
    }

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId: input.tenantId,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
        ...(input.afterContactId
          ? {
              id: {
                gt: input.afterContactId,
              },
            }
          : {}),
        ...(workflow.audienceType === 'CONTACT_TYPE' &&
        workflow.targetContactTypeId
          ? {
              contactTypeId: workflow.targetContactTypeId,
            }
          : {}),
      },
      select: {
        id: true,
      },
      orderBy: {
        id: 'asc',
      },
      take: batchSize,
    });

    if (contacts.length === 0) {
      await this.createAuditLog({
        tenantId: input.tenantId,
        workflowId: workflow.id,
        actorUserId: input.actorUserId,
        action: 'DRIP_EXISTING_CONTACT_ENROLLMENT_COMPLETED',
        metadata: {
          afterContactId: input.afterContactId || null,
        },
      });

      return {
        ok: true,
        done: true,
        enrolled: 0,
        skipped: 0,
      };
    }

    const result = await this.enrollContacts(
      input.tenantId,
      input.actorUserId,
      workflow.id,
      contacts.map((contact) => contact.id),
      'WORKFLOW_ACTIVATION',
    );

    const lastContactId = contacts[contacts.length - 1].id;
    const hasMore = contacts.length === batchSize;

    await this.createAuditLog({
      tenantId: input.tenantId,
      workflowId: workflow.id,
      actorUserId: input.actorUserId,
      action: 'DRIP_EXISTING_CONTACT_BATCH_ENROLLED',
      metadata: {
        batchSize,
        batchContactsChecked: contacts.length,
        enrolled: result.enrolled,
        skipped: result.skipped,
        afterContactId: input.afterContactId || null,
        lastContactId,
        hasMore,
      },
    });

    if (hasMore) {
      await this.dripsQueue.addExistingContactsEnrollmentBatchJob(
        {
          tenantId: input.tenantId,
          workflowId: workflow.id,
          actorUserId: input.actorUserId,
          afterContactId: lastContactId,
          batchSize,
        },
        {
          delay: EXISTING_CONTACTS_NEXT_BATCH_DELAY_MS,
        },
      );
    }

    return {
      ok: true,
      done: !hasMore,
      nextBatchQueued: hasMore,
      enrolled: result.enrolled,
      skipped: result.skipped,
      lastContactId,
    };
  }

  async pauseWorkflow(
    tenantId: string,
    actorUserId: string,
    workflowId: string,
  ) {
    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Drip workflow not found');
    }

    if (workflow.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active drip workflows can be paused',
      );
    }

    const pendingMessageIds = await this.findQueuedDripMessageIds({
      tenantId,
      workflowId: workflow.id,
      status: 'PENDING',
    });

    await this.prisma.$transaction([
      this.prisma.dripWorkflow.update({
        where: {
          id: workflow.id,
        },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
        },
      }),
      this.prisma.dripEnrollment.updateMany({
        where: {
          tenantId,
          workflowId: workflow.id,
          status: {
            in: ['ACTIVE', 'WAITING'],
          },
        },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
        },
      }),
      this.prisma.dripAuditLog.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          actorUserId,
          action: 'DRIP_WORKFLOW_PAUSED',
        },
      }),
    ]);

    await this.removeQueuedDripMessageJobs(pendingMessageIds);

    return this.getWorkflow(tenantId, workflow.id);
  }

  async enrollContacts(
    tenantId: string,
    actorUserId: string | null,
    workflowId: string,
    contactIds: string[] | undefined,
    source: string,
  ) {
    const cleanContactIds = Array.from(
      new Set(
        (Array.isArray(contactIds) ? contactIds : [])
          .map((contactId) => String(contactId || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 5000);

    if (cleanContactIds.length === 0) {
      throw new BadRequestException('Select at least one contact');
    }

    const workflow = await this.prisma.dripWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        steps: {
          where: {
            isActive: true,
          },
          orderBy: {
            position: 'asc',
          },
          take: 1,
        },
      },
    });

    if (!workflow) {
      throw new BadRequestException(
        'Only active drip workflows can accept contacts',
      );
    }

    const firstStep = workflow.steps[0];

    if (!firstStep) {
      throw new BadRequestException(
        'Drip workflow has no active steps',
      );
    }

    const contacts = await this.prisma.contact.findMany({
      where: {
        id: {
          in: cleanContactIds,
        },
        tenantId,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
        ...(workflow.audienceType === 'CONTACT_TYPE' &&
        workflow.targetContactTypeId
          ? {
              contactTypeId: workflow.targetContactTypeId,
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    let enrolled = 0;
    let skipped = cleanContactIds.length - contacts.length;

    for (const contact of contacts) {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtextextended(
                  ${`${tenantId}:${workflow.id}:${contact.id}`},
                  0
                )
              )
            `,
          );

                    if (source.startsWith('INBOUND:')) {
            const sourceAlreadyProcessed =
              await tx.dripEnrollment.findFirst({
                where: {
                  tenantId,
                  workflowId: workflow.id,
                  contactId: contact.id,
                  source,
                },
                select: {
                  id: true,
                },
              });

            if (sourceAlreadyProcessed) {
              return {
                created: false,
                reason:
                  'Inbound message was already processed for this workflow',
              };
            }
          }

          const latestEnrollment =
            await tx.dripEnrollment.findFirst({
              where: {
                tenantId,
                workflowId: workflow.id,
                contactId: contact.id,
              },
              orderBy: [
                {
                  enrollmentCycle: 'desc',
                },
                {
                  enrolledAt: 'desc',
                },
              ],
            });

          if (
            latestEnrollment &&
            ['ACTIVE', 'WAITING', 'PAUSED'].includes(
              latestEnrollment.status,
            )
          ) {
            return {
              created: false,
              reason: 'Contact already has an active enrollment',
            };
          }

          let enrollmentCycle = 1;

          if (latestEnrollment) {
            if (!workflow.allowReentry) {
              return {
                created: false,
                reason: 'Workflow re-entry is disabled',
              };
            }

            const cooldownDays =
              workflow.reentryCooldownDays || 0;

            if (cooldownDays < 1) {
              return {
                created: false,
                reason: 'Workflow re-entry cooldown is invalid',
              };
            }

            const previousEndedAt =
              latestEnrollment.completedAt ||
              latestEnrollment.stoppedAt ||
              latestEnrollment.lastProcessedAt ||
              latestEnrollment.enrolledAt;

            const nextAllowedAt = new Date(
              previousEndedAt.getTime() +
                cooldownDays * 24 * 60 * 60 * 1000,
            );

            if (nextAllowedAt.getTime() > Date.now()) {
              return {
                created: false,
                reason: 'Workflow re-entry cooldown has not finished',
              };
            }

            enrollmentCycle =
              latestEnrollment.enrollmentCycle + 1;
          }

          const nextRunAt = this.calculateAllowedRunAt({
            requestedAt: new Date(
              Date.now() +
                firstStep.dayOffset * 24 * 60 * 60 * 1000 +
                firstStep.minuteOffset * 60 * 1000,
            ),
            timezone: workflow.timezone,
            sendingStartTime: workflow.sendingStartTime,
            sendingEndTime: workflow.sendingEndTime,
            sendingDays: workflow.sendingDays,
          });

          const enrollment = await tx.dripEnrollment.create({
            data: {
              tenantId,
              workflowId: workflow.id,
              contactId: contact.id,
              status: 'ACTIVE',
              source,
              currentStepPosition: firstStep.position,
              nextRunAt,
              entryCount: enrollmentCycle,
              enrollmentCycle,
            },
          });

          const dripMessage = await tx.dripMessage.create({
            data: {
              tenantId,
              workflowId: workflow.id,
              enrollmentId: enrollment.id,
              stepId: firstStep.id,
              contactId: contact.id,
              status: 'PENDING',
              scheduledFor: nextRunAt,
            },
          });

          await tx.dripAuditLog.create({
            data: {
              tenantId,
              workflowId: workflow.id,
              contactId: contact.id,
              actorUserId,
              action:
                enrollmentCycle === 1
                  ? 'DRIP_CONTACT_ENROLLED'
                  : 'DRIP_CONTACT_REENROLLED',
              metadata: {
                source,
                enrollmentId: enrollment.id,
                enrollmentCycle,
                nextRunAt: nextRunAt.toISOString(),
              },
            },
          });

          return {
            created: true,
            dripMessage,
            enrollmentCycle,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      if (!result.created || !result.dripMessage) {
        skipped += 1;
        continue;
      }

      await this.dripsQueue.addDripMessageJob(
        {
          tenantId,
          dripMessageId: result.dripMessage.id,
        },
        {
          delay: Math.max(
            0,
            result.dripMessage.scheduledFor.getTime() -
              Date.now(),
          ),
        },
      );

      enrolled += 1;
    }

    return {
      ok: true,
      enrolled,
      skipped,
    };
  }

    async autoEnrollNewContact(input: {
    tenantId: string;
    contactId: string;
    trigger: 'NEW_CONTACT' | 'CSV_IMPORT';
  }) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: input.contactId,
        tenantId: input.tenantId,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
      },
      select: {
        id: true,
        contactTypeId: true,
      },
    });

    if (!contact) {
      return {
        ok: true,
        enrolled: 0,
        skipped: true,
        reason:
          'Contact is not eligible for automatic drip enrolment',
      };
    }

    const workflows = await this.prisma.dripWorkflow.findMany({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        autoEnrollNewContacts: true,
        OR: [
          {
            audienceType: 'ALL_OPTED_IN',
          },
          {
            audienceType: 'CONTACT_TYPE',
            targetContactTypeId: contact.contactTypeId,
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 250,
    });

    let enrolled = 0;
    let skipped = 0;

    for (const workflow of workflows) {
      try {
        const result = await this.enrollContacts(
          input.tenantId,
          null,
          workflow.id,
          [contact.id],
          input.trigger,
        );

        enrolled += result.enrolled;
        skipped += result.skipped;
      } catch {
        skipped += 1;
      }
    }

    return {
      ok: true,
      workflowsChecked: workflows.length,
      enrolled,
      skipped,
    };
  }

  async autoEnrollInboundContact(input: {
    tenantId: string;
    fromPhone: string;
    metaMessageId: string;
  }) {
    const phone = String(input.fromPhone || '').replace(/\D/g, '');
    const metaMessageId = String(input.metaMessageId || '').trim();

    if (
      !phone ||
      phone.length < 8 ||
      phone.length > 15 ||
      !metaMessageId ||
      metaMessageId.length > 255
    ) {
      return {
        ok: true,
        enrolled: 0,
        skipped: true,
        reason: 'Invalid inbound WhatsApp message identity',
      };
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId: input.tenantId,
        phone,
        deletedAt: null,
        optedIn: true,
        optInSource: {
          not: null,
        },
      },
      select: {
        id: true,
        contactTypeId: true,
      },
    });

    if (!contact) {
      return {
        ok: true,
        enrolled: 0,
        skipped: true,
        reason:
          'Inbound sender is not an existing opted-in contact',
      };
    }

    const workflows = await this.prisma.dripWorkflow.findMany({
      where: {
        tenantId: input.tenantId,
        status: 'ACTIVE',
        autoEnrollInbound: true,
        OR: [
          {
            audienceType: 'ALL_OPTED_IN',
          },
          {
            audienceType: 'CONTACT_TYPE',
            targetContactTypeId: contact.contactTypeId,
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 250,
    });

    let enrolled = 0;
    let skipped = 0;

    for (const workflow of workflows) {
      try {
        const result = await this.enrollContacts(
          input.tenantId,
          null,
          workflow.id,
          [contact.id],
          `INBOUND:${metaMessageId}`,
        );

        enrolled += result.enrolled;
        skipped += result.skipped;
      } catch {
        skipped += 1;
      }
    }

    return {
      ok: true,
      workflowsChecked: workflows.length,
      enrolled,
      skipped,
    };
  }

  async stopContactDripEnrollments(input: {
    tenantId: string;
    contactId: string;
    reason: 'CONTACT_OPTED_OUT' | 'CONTACT_DELETED';
  }) {
    const enrollments =
      await this.prisma.dripEnrollment.findMany({
        where: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          status: {
            in: ['ACTIVE', 'WAITING', 'PAUSED'],
          },
        },
        select: {
          id: true,
          workflowId: true,
        },
        take: 5000,
      });

    if (enrollments.length === 0) {
      return {
        ok: true,
        stopped: 0,
      };
    }

    const enrollmentIds = enrollments.map(
      (enrollment) => enrollment.id,
    );
    const pendingMessageIds = await this.findQueuedDripMessageIds({
      tenantId: input.tenantId,
      contactId: input.contactId,
      enrollmentId: {
        in: enrollmentIds,
      },
      status: 'PENDING',
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.dripEnrollment.updateMany({
        where: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          id: {
            in: enrollmentIds,
          },
          status: {
            in: ['ACTIVE', 'WAITING', 'PAUSED'],
          },
        },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
          pausedAt: null,
          nextRunAt: null,
          stopReason: input.reason,
        },
      });

      await tx.dripMessage.updateMany({
        where: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          enrollmentId: {
            in: enrollmentIds,
          },
          status: 'PENDING',
        },
        data: {
          status: 'CANCELED',
          errorMessage:
            input.reason === 'CONTACT_OPTED_OUT'
              ? 'Contact opted out'
              : 'Contact was deleted',
        },
      });

      for (const enrollment of enrollments) {
        await tx.dripAuditLog.create({
          data: {
            tenantId: input.tenantId,
            workflowId: enrollment.workflowId,
            contactId: input.contactId,
            actorUserId: null,
            action: 'DRIP_ENROLLMENT_STOPPED',
            metadata: {
              enrollmentId: enrollment.id,
              reason: input.reason,
            },
          },
        });
      }
    });

    await this.removeQueuedDripMessageJobs(pendingMessageIds);

    return {
      ok: true,
      stopped: enrollments.length,
    };
  }

    async archiveWorkflow(
    tenantId: string,
    actorUserId: string,
    workflowId: string,
  ) {
    const workflow =
      await this.prisma.dripWorkflow.findFirst({
        where: {
          id: workflowId,
          tenantId,
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (!workflow) {
      throw new NotFoundException(
        'Drip workflow not found',
      );
    }

    if (workflow.status === 'ARCHIVED') {
      return this.getWorkflow(tenantId, workflow.id);
    }

    const pendingMessageIds = await this.findQueuedDripMessageIds({
      tenantId,
      workflowId: workflow.id,
      status: 'PENDING',
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.dripWorkflow.update({
        where: {
          id: workflow.id,
        },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
          pausedAt: null,
        },
      });

      await tx.dripEnrollment.updateMany({
        where: {
          tenantId,
          workflowId: workflow.id,
          status: {
            in: ['ACTIVE', 'WAITING', 'PAUSED'],
          },
        },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
          pausedAt: null,
          nextRunAt: null,
          stopReason: 'WORKFLOW_ARCHIVED',
        },
      });

      await tx.dripMessage.updateMany({
        where: {
          tenantId,
          workflowId: workflow.id,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELED',
          errorMessage: 'Workflow archived',
        },
      });

      await tx.dripAuditLog.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          actorUserId,
          action: 'DRIP_WORKFLOW_ARCHIVED',
        },
      });
    });

    await this.removeQueuedDripMessageJobs(pendingMessageIds);

    return this.getWorkflow(tenantId, workflow.id);
  }

  async retryFailedDripMessage(input: {
    tenantId: string;
    actorUserId: string;
    workflowId: string;
    dripMessageId: string;
  }) {
    const message =
      await this.prisma.dripMessage.findFirst({
        where: {
          id: input.dripMessageId,
          tenantId: input.tenantId,
          workflowId: input.workflowId,
          status: 'FAILED',
        },
        include: {
          workflow: true,
          enrollment: true,
          contact: true,
          step: {
            include: {
              template: true,
            },
          },
        },
      });

    if (!message) {
      throw new NotFoundException(
        'Failed drip message not found',
      );
    }

    if (message.workflow.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Activate the workflow before retrying this message',
      );
    }

    if (
      message.contact.deletedAt ||
      !message.contact.optedIn ||
      !message.contact.optInSource
    ) {
      throw new BadRequestException(
        'Contact is no longer eligible for drip messages',
      );
    }

    if (message.step.template.status !== 'APPROVED') {
      throw new BadRequestException(
        'Drip template is no longer approved',
      );
    }

    const scheduledFor = this.calculateAllowedRunAt({
      requestedAt: new Date(),
      timezone: message.workflow.timezone,
      sendingStartTime:
        message.workflow.sendingStartTime,
      sendingEndTime:
        message.workflow.sendingEndTime,
      sendingDays: message.workflow.sendingDays,
    });

    await this.prisma.$transaction(async (tx) => {
      const restoredEnrollment =
        await tx.dripEnrollment.updateMany({
          where: {
            id: message.enrollmentId,
            tenantId: input.tenantId,
            workflowId: input.workflowId,
            contactId: message.contactId,
            status: 'STOPPED',
            stopReason: 'DRIP_MESSAGE_FAILED',
          },
          data: {
            status: 'ACTIVE',
            stoppedAt: null,
            pausedAt: null,
            stopReason: null,
            nextRunAt: scheduledFor,
          },
        });

      if (restoredEnrollment.count !== 1) {
        throw new BadRequestException(
          'The failed drip enrolment is no longer eligible for retry',
        );
      }

      const restoredMessage =
        await tx.dripMessage.updateMany({
          where: {
            id: message.id,
            tenantId: input.tenantId,
            workflowId: input.workflowId,
            enrollmentId: message.enrollmentId,
            contactId: message.contactId,
            status: 'FAILED',
          },
          data: {
          status: 'PENDING',
          scheduledFor,
          retryCount: 0,
          failedAt: null,
          deliveredAt: null,
          readAt: null,
          statusWebhookAt: null,
          metaMessageId: null,
          errorMessage: null,
        },
      });

      if (restoredMessage.count !== 1) {
        throw new BadRequestException(
          'The failed drip message is no longer eligible for retry',
        );
      }

      await tx.dripAuditLog.create({
        data: {
          tenantId: input.tenantId,
          workflowId: input.workflowId,
          contactId: message.contactId,
          actorUserId: input.actorUserId,
          action: 'DRIP_MESSAGE_MANUAL_RETRY',
          metadata: {
            dripMessageId: message.id,
            enrollmentId: message.enrollmentId,
            scheduledFor: scheduledFor.toISOString(),
          },
        },
      });
    });

    await this.dripsQueue.addDripMessageJob(
      {
        tenantId: input.tenantId,
        dripMessageId: message.id,
      },
      {
        delay: Math.max(
          0,
          scheduledFor.getTime() - Date.now(),
        ),
      },
    );

    return {
      ok: true,
      retried: true,
      scheduledFor,
    };
  }

  async stopEnrollment(
    tenantId: string,
    actorUserId: string,
    workflowId: string,
    enrollmentId: string,
  ) {
    const enrollment = await this.prisma.dripEnrollment.findFirst({
      where: {
        id: enrollmentId,
        tenantId,
        workflowId,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Drip enrollment not found');
    }

    const pendingMessageIds = await this.findQueuedDripMessageIds({
      tenantId,
      enrollmentId: enrollment.id,
      status: 'PENDING',
    });

    await this.prisma.$transaction([
      this.prisma.dripEnrollment.update({
        where: {
          id: enrollment.id,
        },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
          nextRunAt: null,
          stopReason: 'MANUALLY_STOPPED',
        },
      }),
      this.prisma.dripMessage.updateMany({
        where: {
          tenantId,
          enrollmentId: enrollment.id,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELED',
          errorMessage: 'Enrollment manually stopped',
        },
      }),
      this.prisma.dripAuditLog.create({
        data: {
          tenantId,
          workflowId,
          contactId: enrollment.contactId,
          actorUserId,
          action: 'DRIP_ENROLLMENT_STOPPED',
          metadata: {
            reason: 'MANUALLY_STOPPED',
          },
        },
      }),
    ]);

    await this.removeQueuedDripMessageJobs(pendingMessageIds);

    return {
      ok: true,
      stopped: true,
    };
  }

  async processDripSendJob(input: {
  tenantId: string;
  dripMessageId: string;
}) {
  await this.billingService.assertSubscriptionCanUseWorkspace(
    input.tenantId,
    'sending drip messages',
  );

  const claimedMessages = await this.prisma.$queryRaw<
    Array<{
      id: string;
    }>
  >(Prisma.sql`
    UPDATE drip_messages
    SET
      status = 'PROCESSING',
      "errorMessage" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${input.dripMessageId}
      AND "tenantId" = ${input.tenantId}
      AND status = 'PENDING'
      AND "scheduledFor" <= NOW()
    RETURNING id
  `);

  if (claimedMessages.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'Drip message is not due or already processed',
    };
  }

  const message = await this.prisma.dripMessage.findFirst({
    where: {
      id: input.dripMessageId,
      tenantId: input.tenantId,
      status: 'PROCESSING',
    },
    include: {
      workflow: true,
      enrollment: true,
      contact: true,
      step: {
        include: {
          template: true,
        },
      },
    },
  });

  if (!message) {
    return {
      ok: true,
      skipped: true,
      reason: 'Drip message was not found',
    };
  }

  if (
    message.workflow.status === 'PAUSED' ||
    message.enrollment.status === 'PAUSED'
  ) {
    await this.releaseClaimedDripMessage({
      tenantId: input.tenantId,
      dripMessageId: message.id,
      scheduledFor: message.scheduledFor,
      reason: 'Workflow or enrollment is paused',
    });

    return {
      ok: true,
      skipped: true,
      reason: 'Workflow or enrollment is paused',
    };
  }

  if (message.workflow.status !== 'ACTIVE') {
    await this.cancelClaimedDripMessage(
      message.id,
      input.tenantId,
      'Workflow is not active',
    );

    return {
      ok: true,
      skipped: true,
      reason: 'Workflow is not active',
    };
  }

  if (message.enrollment.status !== 'ACTIVE') {
    await this.cancelClaimedDripMessage(
      message.id,
      input.tenantId,
      'Enrollment is not active',
    );

    return {
      ok: true,
      skipped: true,
      reason: 'Enrollment is not active',
    };
  }

  if (
    !this.isInsideAllowedSendingWindow({
      date: new Date(),
      timezone: message.workflow.timezone,
      sendingStartTime:
        message.workflow.sendingStartTime,
      sendingEndTime:
        message.workflow.sendingEndTime,
      sendingDays: message.workflow.sendingDays,
    })
  ) {
    const nextAllowedRunAt =
      this.calculateAllowedRunAt({
        requestedAt: new Date(),
        timezone: message.workflow.timezone,
        sendingStartTime:
          message.workflow.sendingStartTime,
        sendingEndTime:
          message.workflow.sendingEndTime,
        sendingDays: message.workflow.sendingDays,
      });

    await this.releaseClaimedDripMessage({
      tenantId: input.tenantId,
      dripMessageId: message.id,
      scheduledFor: nextAllowedRunAt,
      reason:
        'Message moved to the next allowed workflow sending window',
    });

    await this.dripsQueue.addDripMessageJob(
      {
        tenantId: input.tenantId,
        dripMessageId: message.id,
      },
      {
        delay: Math.max(
          0,
          nextAllowedRunAt.getTime() - Date.now(),
        ),
      },
    );

    return {
      ok: true,
      skipped: true,
      rescheduled: true,
      scheduledFor: nextAllowedRunAt,
      reason:
        'Message is outside the allowed sending window',
    };
  }

  if (
    message.contact.deletedAt ||
    !message.contact.optedIn ||
    !message.contact.optInSource
  ) {
    await this.stopIneligibleEnrollment({
      tenantId: input.tenantId,
      workflowId: message.workflowId,
      enrollmentId: message.enrollmentId,
      contactId: message.contactId,
      dripMessageId: message.id,
    });

    return {
      ok: true,
      skipped: true,
      reason: 'Contact is no longer eligible',
    };
  }

  if (message.step.template.status !== 'APPROVED') {
    await this.markDripMessageFailed({
      tenantId: input.tenantId,
      dripMessageId: message.id,
      errorMessage: 'Drip template is no longer approved',
      shouldRetry: false,
    });

    return {
      ok: true,
      skipped: true,
      reason: 'Template is no longer approved',
    };
  }

  const variableValues = Array.isArray(message.step.variableValues)
    ? message.step.variableValues.map((value: unknown) =>
        String(value || '').trim(),
      )
    : [];

  this.validateDripTemplateVariables(
    message.step.template.headerText,
    message.step.template.bodyText,
    message.step.template.components,
    variableValues,
  );

    const latestEligibility =
    await this.prisma.dripMessage.findFirst({
      where: {
        id: message.id,
        tenantId: input.tenantId,
        status: 'PROCESSING',
        workflow: {
          status: 'ACTIVE',
        },
        enrollment: {
          status: 'ACTIVE',
        },
        contact: {
          deletedAt: null,
          optedIn: true,
          optInSource: {
            not: null,
          },
        },
        step: {
          isActive: true,
          template: {
            status: 'APPROVED',
          },
        },
      },
      select: {
        id: true,
      },
    });

  if (!latestEligibility) {
    await this.cancelClaimedDripMessage(
      message.id,
      input.tenantId,
      'Drip message became ineligible before Meta send',
    );

    return {
      ok: true,
      skipped: true,
      reason:
        'Workflow, contact, enrolment, step, or template became ineligible',
    };
  }

  const connection =
    await this.metaAccountsService.getActiveConnectionSecret(
      input.tenantId,
    );

  const headerMediaId =
    await this.getOrUploadDripHeaderMediaIfNeeded({
      tenantId: input.tenantId,
      workflowId: message.workflowId,
      stepId: message.stepId,
      phoneNumberId: connection.phoneNumberId,
      accessToken: connection.accessToken,
      headerType: message.step.template.headerType,
      headerMediaFileId:
        message.step.template.headerMediaFileId,
      cachedMetaHeaderMediaId:
        message.step.metaHeaderMediaId,
      cachedMetaHeaderMediaUploadedAt:
        message.step.metaHeaderMediaUploadedAt,
    });

  const metaMessageId = await this.sendDripTemplateMessage({
    phoneNumberId: connection.phoneNumberId,
    accessToken: connection.accessToken,
    to: message.contact.phone,
    templateName: message.step.template.name,
    language: message.step.template.language,
    headerType: message.step.template.headerType,
    headerText: message.step.template.headerText,
    bodyText: message.step.template.bodyText,
    components: message.step.template.components,
    variableValues,
    headerMediaId,
  });

  await this.prisma.dripMessage.updateMany({
    where: {
      id: message.id,
      tenantId: input.tenantId,
      status: 'PROCESSING',
    },
    data: {
      status: 'SENT',
      metaMessageId,
      sentAt: new Date(),
      failedAt: null,
      deliveredAt: null,
      readAt: null,
      statusWebhookAt: null,
      errorMessage: null,
    },
  });

  await this.scheduleNextDripStep({
    tenantId: input.tenantId,
    workflowId: message.workflowId,
    enrollmentId: message.enrollmentId,
    contactId: message.contactId,
    completedStepPosition: message.step.position,
    enrolledAt: message.enrollment.enrolledAt,
  });

  await this.createAuditLog({
    tenantId: input.tenantId,
    workflowId: message.workflowId,
    actorUserId: null,
    action: 'DRIP_MESSAGE_SENT',
    metadata: {
      dripMessageId: message.id,
      enrollmentId: message.enrollmentId,
      contactId: message.contactId,
      stepId: message.stepId,
      metaMessageId,
    },
  });

  return {
    ok: true,
    sent: true,
    dripMessageId: message.id,
    metaMessageId,
  };
}

async markDripMessageFailed(input: {
  tenantId: string;
  dripMessageId: string;
  errorMessage: string;
  shouldRetry: boolean;
}) {
  const message =
    this.sanitizeDripErrorMessage(
      input.errorMessage,
    ) || 'Drip message processing failed';

  const dripMessage = await this.prisma.dripMessage.findFirst({
    where: {
      id: input.dripMessageId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      workflowId: true,
      enrollmentId: true,
      contactId: true,
      retryCount: true,
      status: true,
    },
  });

  if (!dripMessage || ['SENT', 'DELIVERED', 'READ'].includes(dripMessage.status)) {
    return;
  }

  if (input.shouldRetry) {
    await this.prisma.dripMessage.updateMany({
      where: {
        id: dripMessage.id,
        tenantId: input.tenantId,
        status: 'PROCESSING',
      },
      data: {
        status: 'PENDING',
        retryCount: {
          increment: 1,
        },
        errorMessage: message,
        failedAt: null,
      },
    });

    return;
  }

  await this.prisma.$transaction([
    this.prisma.dripMessage.updateMany({
      where: {
        id: dripMessage.id,
        tenantId: input.tenantId,
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: message,
      },
    }),
    this.prisma.dripEnrollment.updateMany({
      where: {
        id: dripMessage.enrollmentId,
        tenantId: input.tenantId,
        status: 'ACTIVE',
      },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date(),
        nextRunAt: null,
        stopReason: 'DRIP_MESSAGE_FAILED',
      },
    }),
    this.prisma.dripAuditLog.create({
      data: {
        tenantId: input.tenantId,
        workflowId: dripMessage.workflowId,
        contactId: dripMessage.contactId,
        actorUserId: null,
        action: 'DRIP_MESSAGE_FAILED',
        metadata: {
          dripMessageId: dripMessage.id,
          errorMessage: message,
        },
      },
    }),
  ]);
}

async enqueueDueAndStuckDripMessages() {
  const now = new Date();

  const dueMessages = await this.prisma.dripMessage.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: {
        lte: now,
      },
      workflow: {
        status: 'ACTIVE',
      },
      enrollment: {
        status: 'ACTIVE',
      },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: 100,
    orderBy: {
      scheduledFor: 'asc',
    },
  });

  let queuedDue = 0;

  for (const message of dueMessages) {
    await this.dripsQueue.addDripMessageJob({
      tenantId: message.tenantId,
      dripMessageId: message.id,
    });

    queuedDue += 1;
  }

  const stuckBefore = new Date(Date.now() - 5 * 60 * 1000);

  const stuckMessages = await this.prisma.dripMessage.findMany({
    where: {
      status: 'PROCESSING',
      updatedAt: {
        lte: stuckBefore,
      },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: 100,
    orderBy: {
      updatedAt: 'asc',
    },
  });

  let recoveredStuck = 0;

  for (const message of stuckMessages) {
    const recovered = await this.prisma.dripMessage.updateMany({
      where: {
        id: message.id,
        tenantId: message.tenantId,
        status: 'PROCESSING',
        updatedAt: {
          lte: stuckBefore,
        },
      },
      data: {
        status: 'PENDING',
        errorMessage: 'Recovered after interrupted worker execution',
      },
    });

    if (recovered.count === 0) {
      continue;
    }

    await this.dripsQueue.addDripMessageJob({
      tenantId: message.tenantId,
      dripMessageId: message.id,
    });

    recoveredStuck += 1;
  }

  return {
    queuedDue,
    recoveredStuck,
  };
}

private async scheduleNextDripStep(input: {
  tenantId: string;
  workflowId: string;
  enrollmentId: string;
  contactId: string;
  completedStepPosition: number;
  enrolledAt: Date;
}) {
  const nextStep = await this.prisma.dripStep.findFirst({
    where: {
      tenantId: input.tenantId,
      workflowId: input.workflowId,
      isActive: true,
      position: {
        gt: input.completedStepPosition,
      },
    },
    orderBy: {
      position: 'asc',
    },
  });

  if (!nextStep) {
    await this.prisma.dripEnrollment.updateMany({
      where: {
        id: input.enrollmentId,
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        status: 'ACTIVE',
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        nextRunAt: null,
        currentStepPosition: input.completedStepPosition,
      },
    });

    await this.createAuditLog({
      tenantId: input.tenantId,
      workflowId: input.workflowId,
      actorUserId: null,
      action: 'DRIP_ENROLLMENT_COMPLETED',
      metadata: {
        enrollmentId: input.enrollmentId,
        contactId: input.contactId,
      },
    });

    return;
  }

  const workflow = await this.prisma.dripWorkflow.findFirst({
    where: {
      id: input.workflowId,
      tenantId: input.tenantId,
      status: 'ACTIVE',
    },
    select: {
      timezone: true,
      sendingStartTime: true,
      sendingEndTime: true,
      sendingDays: true,
    },
  });

  if (!workflow) {
    await this.prisma.dripEnrollment.updateMany({
      where: {
        id: input.enrollmentId,
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        status: 'ACTIVE',
      },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
        nextRunAt: null,
      },
    });

    return;
  }

  const requestedAt = new Date(
    input.enrolledAt.getTime() +
      nextStep.dayOffset * 24 * 60 * 60 * 1000 +
      nextStep.minuteOffset * 60 * 1000,
  );

  const scheduledFor = this.calculateAllowedRunAt({
    requestedAt,
    timezone: workflow.timezone,
    sendingStartTime: workflow.sendingStartTime,
    sendingEndTime: workflow.sendingEndTime,
    sendingDays: workflow.sendingDays,
  });

  const nextMessage = await this.prisma.$transaction(async (tx) => {
    const createdMessage = await tx.dripMessage.upsert({
      where: {
        enrollmentId_stepId: {
          enrollmentId: input.enrollmentId,
          stepId: nextStep.id,
        },
      },
      update: {
        status: 'PENDING',
        scheduledFor,
        errorMessage: null,
        failedAt: null,
      },
      create: {
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        enrollmentId: input.enrollmentId,
        stepId: nextStep.id,
        contactId: input.contactId,
        status: 'PENDING',
        scheduledFor,
      },
    });

    await tx.dripEnrollment.updateMany({
      where: {
        id: input.enrollmentId,
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        status: 'ACTIVE',
      },
      data: {
        currentStepPosition: nextStep.position,
        nextRunAt: scheduledFor,
        lastProcessedAt: new Date(),
      },
    });

    return createdMessage;
  });

  await this.dripsQueue.addDripMessageJob(
    {
      tenantId: input.tenantId,
      dripMessageId: nextMessage.id,
    },
    {
      delay: Math.max(0, scheduledFor.getTime() - Date.now()),
    },
  );
}

private async releaseClaimedDripMessage(input: {
  tenantId: string;
  dripMessageId: string;
  scheduledFor: Date;
  reason: string;
}) {
  await this.prisma.dripMessage.updateMany({
    where: {
      id: input.dripMessageId,
      tenantId: input.tenantId,
      status: 'PROCESSING',
    },
    data: {
      status: 'PENDING',
      scheduledFor: input.scheduledFor,
      errorMessage: input.reason,
    },
  });
}

private async cancelClaimedDripMessage(
  dripMessageId: string,
  tenantId: string,
  reason: string,
) {
  await this.prisma.dripMessage.updateMany({
    where: {
      id: dripMessageId,
      tenantId,
      status: 'PROCESSING',
    },
    data: {
      status: 'CANCELED',
      errorMessage: reason,
    },
  });
}

private async stopIneligibleEnrollment(input: {
  tenantId: string;
  workflowId: string;
  enrollmentId: string;
  contactId: string;
  dripMessageId: string;
}) {
  await this.prisma.$transaction([
    this.prisma.dripMessage.updateMany({
      where: {
        id: input.dripMessageId,
        tenantId: input.tenantId,
        status: 'PROCESSING',
      },
      data: {
        status: 'CANCELED',
        errorMessage:
          'Contact became ineligible: opted out, deleted, or missing opt-in proof',
      },
    }),
    this.prisma.dripEnrollment.updateMany({
      where: {
        id: input.enrollmentId,
        tenantId: input.tenantId,
        workflowId: input.workflowId,
      },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date(),
        nextRunAt: null,
        stopReason: 'CONTACT_INELIGIBLE',
      },
    }),
    this.prisma.dripAuditLog.create({
      data: {
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        contactId: input.contactId,
        actorUserId: null,
        action: 'DRIP_CONTACT_BECAME_INELIGIBLE',
      },
    }),
  ]);
}

private async findQueuedDripMessageIds(
  where: Prisma.DripMessageWhereInput,
) {
  const messages = await this.prisma.dripMessage.findMany({
    where,
    select: {
      id: true,
    },
    take: 5000,
  });

  return messages.map((message) => message.id);
}

private async removeQueuedDripMessageJobs(dripMessageIds: string[]) {
  for (const dripMessageId of dripMessageIds) {
    try {
      await this.dripsQueue.removeDripMessageJob(dripMessageId);
    } catch {
      // Database status remains authoritative if Redis cleanup is unavailable.
    }
  }
}

private validateDripTemplateVariables(
  headerText: string | null,
  bodyText: string,
  components: Prisma.JsonValue,
  variableValues: string[],
) {
  const headerVariables = this.getDripVariableNumbers(headerText || '');
  const bodyVariables = this.getDripVariableNumbers(bodyText);
  const buttonVariables = this.getDripButtonVariableSlots(components);

  const requiredCount =
    headerVariables.length +
    bodyVariables.length +
    buttonVariables.length;

  if (requiredCount !== variableValues.length) {
    throw new BadRequestException(
      `This drip template needs ${requiredCount} variable values`,
    );
  }

  if (variableValues.some((value) => !value)) {
    throw new BadRequestException(
      'All drip template variable values are required',
    );
  }
}

private getDripVariableNumbers(text: string) {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
        Number(match[1]),
      ),
    ),
  ).sort((left, right) => left - right);
}

private getDripButtonVariableSlots(components: Prisma.JsonValue) {
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

      if (
        String(rawButton.type || '').trim().toUpperCase() !== 'URL' ||
        this.getDripVariableNumbers(String(rawButton.url || '')).length === 0
      ) {
        return null;
      }

      return {
        index,
      };
    })
    .filter((value): value is { index: number } => Boolean(value));
}

private getDripHeaderMediaParameterType(
  headerType: string | null,
) {
  const cleanHeaderType = String(
    headerType || '',
  )
    .trim()
    .toUpperCase();

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

private async getOrUploadDripHeaderMediaIfNeeded(input: {
  tenantId: string;
  workflowId: string;
  stepId: string;
  phoneNumberId: string;
  accessToken: string;
  headerType: string | null;
  headerMediaFileId?: string | null;
  cachedMetaHeaderMediaId?: string | null;
  cachedMetaHeaderMediaUploadedAt?: Date | null;
}) {
  const headerMediaType =
    this.getDripHeaderMediaParameterType(
      input.headerType,
    );

  if (!headerMediaType) {
    return null;
  }

  const cacheAgeMs =
    input.cachedMetaHeaderMediaUploadedAt
      ? Date.now() -
        input.cachedMetaHeaderMediaUploadedAt.getTime()
      : Number.MAX_SAFE_INTEGER;

  const cacheIsFresh =
    cacheAgeMs >= 0 &&
    cacheAgeMs < 23 * 60 * 60 * 1000;

  if (
    input.cachedMetaHeaderMediaId &&
    cacheIsFresh
  ) {
    return input.cachedMetaHeaderMediaId;
  }

  if (!input.headerMediaFileId) {
    throw new BadRequestException(
      'This drip media-header template needs a saved header media file',
    );
  }

  const media =
    await this.mediaService.getMediaForMetaUpload(
      input.tenantId,
      input.headerMediaFileId,
    );

  const expectedMediaType = String(
    input.headerType || '',
  ).toUpperCase();

  if (media.mediaType !== expectedMediaType) {
    throw new BadRequestException(
      `Selected drip header media must be ${expectedMediaType.toLowerCase()}`,
    );
  }

  const mediaArrayBuffer = new ArrayBuffer(
    media.buffer.byteLength,
  );

  new Uint8Array(mediaArrayBuffer).set(
    media.buffer,
  );

  const formData = new FormData();

  formData.append(
    'messaging_product',
    'whatsapp',
  );

  formData.append(
    'file',
    new Blob([mediaArrayBuffer], {
      type: media.mimeType,
    }),
    media.originalName,
  );

  const response = await fetch(
    `https://graph.facebook.com/${env.metaGraphApiVersion}/${input.phoneNumberId}/media`,
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
      code?: number;
      message?: string;
      type?: string;
    };
  } = await response.json();

  if (!response.ok || !data.id) {
    throw this.createDripMetaError({
      statusCode: response.status,
      metaCode: data.error?.code,
      message:
        data.error?.message ||
        'Failed to upload drip header media to Meta',
    });
  }

  await this.prisma.dripStep.updateMany({
    where: {
      id: input.stepId,
      tenantId: input.tenantId,
      workflowId: input.workflowId,
    },
    data: {
      metaHeaderMediaId: data.id,
      metaHeaderMediaUploadedAt: new Date(),
    },
  });

  return data.id;
}

private async sendDripTemplateMessage(input: {
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

  const headerVariables = this.getDripVariableNumbers(
    input.headerText || '',
  );
  const bodyVariables =
    this.getDripVariableNumbers(input.bodyText);

  const headerMediaType =
    this.getDripHeaderMediaParameterType(
      input.headerType,
    );

  if (
    headerMediaType === 'image' &&
    input.headerMediaId
  ) {
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
  } else if (
    headerMediaType === 'video' &&
    input.headerMediaId
  ) {
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
  } else if (
    headerMediaType === 'document' &&
    input.headerMediaId
  ) {
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
        .slice(
          headerVariables.length,
          headerVariables.length + bodyVariables.length,
        )
        .map((value) => ({
          type: 'text',
          text: value,
        })),
    });
  }

  let buttonValueIndex =
    headerVariables.length + bodyVariables.length;

  for (const button of this.getDripButtonVariableSlots(input.components)) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(button.index),
      parameters: [
        {
          type: 'text',
          text: input.variableValues[buttonValueIndex],
        },
      ],
    });

    buttonValueIndex += 1;
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.metaGraphApiVersion}/${input.phoneNumberId}/messages`,
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
      code?: number;
      message?: string;
      type?: string;
      error_subcode?: number;
    };
  } = await response.json();

  if (!response.ok) {
    throw this.createDripMetaError({
      statusCode: response.status,
      metaCode: data.error?.code,
      message:
        data.error?.message ||
        'Meta drip template send failed',
    });
  }

  const messageId = data.messages?.[0]?.id;

  if (!messageId) {
    throw new Error('Meta did not return a drip message ID');
  }

  return messageId;
}

private createDripMetaError(input: {
  statusCode: number;
  metaCode?: number;
  message: string;
}) {
  const error = new Error(
    this.sanitizeDripErrorMessage(input.message),
  ) as Error & {
    retryable?: boolean;
    statusCode?: number;
    metaCode?: number;
  };

  error.statusCode = input.statusCode;
  error.metaCode = input.metaCode;
  error.retryable = this.isRetryableMetaFailure(
    input.statusCode,
    input.metaCode,
  );

  return error;
}

private isRetryableMetaFailure(
  statusCode: number,
  metaCode?: number,
) {
  if (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return true;
  }

  return [
    1,
    2,
    4,
    17,
    32,
    130429,
    131016,
    131048,
  ].includes(Number(metaCode));
}

isRetryableDripError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'retryable' in error
  ) {
    return Boolean(
      (error as { retryable?: boolean }).retryable,
    );
  }

  if (
    error instanceof TypeError &&
    /fetch|network|socket|timeout|aborted/i.test(
      error.message,
    )
  ) {
    return true;
  }

  return false;
}

private sanitizeDripErrorMessage(value: unknown) {
  const message = String(
    value || 'Drip message processing failed',
  )
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      'Bearer [REDACTED]',
    )
    .replace(
      /access[_-]?token["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
      'access_token=[REDACTED]',
    )
    .replace(
      /authorization["']?\s*[:=]\s*["']?[^"',}]+/gi,
      'authorization=[REDACTED]',
    )
    .trim();

  return message.slice(0, 1000);
}

private cleanBoundedInteger(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

private cleanWorkflowStatus(value?: string) {
  const status = String(value || '').trim().toUpperCase();

  return ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)
    ? status
    : null;
}

private toCountMap(
  groups: Array<{
    status: string;
    _count: {
      _all: number;
    };
  }>,
) {
  return groups.reduce<Record<string, number>>((result, group) => {
    result[group.status] = group._count._all;

    return result;
  }, {});
}

  private async validateWorkflowInput(
    tenantId: string,
    input: DripWorkflowInput,
  ) {
    const name = String(input.name || '').trim();
    const description = String(input.description || '').trim() || null;
    const audienceType = String(input.audienceType || 'ALL_OPTED_IN')
      .trim()
      .toUpperCase();
    const targetContactTypeId =
      String(input.targetContactTypeId || '').trim() || null;
    const timezone = FIXED_DRIP_TIMEZONE;
    const sendingStartTime = String(
      input.sendingStartTime || '09:00',
    ).trim();
    const sendingEndTime = String(input.sendingEndTime || '19:00').trim();
    const sendingDays = this.cleanSendingDays(input.sendingDays);
    const steps = Array.isArray(input.steps) ? input.steps : [];

    if (!name) {
      throw new BadRequestException('Drip name is required');
    }

    if (!['ALL_OPTED_IN', 'CONTACT_TYPE'].includes(audienceType)) {
      throw new BadRequestException('Invalid drip audience type');
    }

    if (audienceType === 'CONTACT_TYPE' && !targetContactTypeId) {
      throw new BadRequestException(
        'Contact type is required for this drip',
      );
    }

    if (targetContactTypeId) {
      const contactType = await this.prisma.contactType.findFirst({
        where: {
          id: targetContactTypeId,
          tenantId,
        },
      });

      if (!contactType) {
        throw new BadRequestException('Invalid contact type');
      }
    }

    this.validateTimezone(timezone);
    this.validateSendingTime(
      sendingStartTime,
      'sending start time',
    );
    this.validateSendingTime(
      sendingEndTime,
      'sending end time',
    );

    if (sendingStartTime === sendingEndTime) {
      throw new BadRequestException(
        'Sending start time and end time cannot be the same',
      );
    }

    if (steps.length === 0) {
      throw new BadRequestException('Add at least one drip step');
    }

    const normalizedSteps = [];

    for (const [index, step] of steps.entries()) {
      const stepName =
        String(step.name || '').trim() || `Step ${index + 1}`;
      const templateId = String(step.templateId || '').trim();
      const dayOffset = Number(step.dayOffset);
      const minuteOffset = Number(step.minuteOffset || 0);
      const variableValues = Array.isArray(step.variableValues)
        ? step.variableValues
            .map((value) => String(value || '').trim())
            .slice(0, 20)
        : [];

      if (!templateId) {
        throw new BadRequestException(
          `Template is required for drip step ${index + 1}`,
        );
      }

      if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 3650) {
        throw new BadRequestException(
          `Invalid day number for drip step ${index + 1}`,
        );
      }

      if (
        !Number.isInteger(minuteOffset) ||
        minuteOffset < 0 ||
        minuteOffset > 1439
      ) {
        throw new BadRequestException(
          `Invalid same-day delay for drip step ${index + 1}`,
        );
      }

      const template = await this.prisma.whatsappTemplate.findFirst({
        where: {
          id: templateId,
          tenantId,
          status: 'APPROVED',
        },
      });

      if (!template) {
        throw new BadRequestException(
          `Step ${index + 1} must use an approved tenant template`,
        );
      }

      normalizedSteps.push({
        name: stepName,
        templateId,
        dayOffset,
        minuteOffset,
        variableValues,
      });
    }

    normalizedSteps.sort((left, right) => {
      if (left.dayOffset !== right.dayOffset) {
        return left.dayOffset - right.dayOffset;
      }

      return left.minuteOffset - right.minuteOffset;
    });

        for (
      let index = 1;
      index < normalizedSteps.length;
      index += 1
    ) {
      const previousStep = normalizedSteps[index - 1];
      const currentStep = normalizedSteps[index];

      if (
        previousStep.dayOffset === currentStep.dayOffset &&
        previousStep.minuteOffset === currentStep.minuteOffset
      ) {
        throw new BadRequestException(
          `Drip steps ${index} and ${index + 1} cannot have the same schedule`,
        );
      }
    }

    return {
      name,
      description,
      audienceType,
      targetContactTypeId:
        audienceType === 'CONTACT_TYPE' ? targetContactTypeId : null,
      timezone,
      sendingStartTime,
      sendingEndTime,
      sendingDays,
      autoEnrollNewContacts: input.autoEnrollNewContacts !== false,
      autoEnrollInbound: input.autoEnrollInbound !== false,
      includeExistingContacts: Boolean(input.includeExistingContacts),
      allowReentry: Boolean(input.allowReentry),
      reentryCooldownDays: this.cleanReentryCooldownDays(
        Boolean(input.allowReentry),
        input.reentryCooldownDays,
      ),
      steps: normalizedSteps,
    };
  }

    private validateTimezone(timezone: string) {
    if (!timezone || timezone.length > 100) {
      throw new BadRequestException(
        'Invalid workflow timezone',
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
      }).format(new Date());
    } catch {
      throw new BadRequestException(
        'Workflow timezone must be a valid IANA timezone, for example Asia/Kolkata',
      );
    }
  }

  private validateSendingTime(
    value: string,
    label: string,
  ) {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Invalid ${label}`,
      );
    }

    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new BadRequestException(
        `Invalid ${label}`,
      );
    }
  }

    private cleanReentryCooldownDays(
    allowReentry: boolean,
    value?: number | null,
  ) {
    if (!allowReentry) {
      return null;
    }

    const cooldownDays = Number(value);

    if (
      !Number.isInteger(cooldownDays) ||
      cooldownDays < 1 ||
      cooldownDays > 3650
    ) {
      throw new BadRequestException(
        'Re-entry cooldown must be between 1 and 3650 days',
      );
    }

    return cooldownDays;
  }

  private cleanSendingDays(value?: number[]) {
    const days = Array.from(
      new Set(
        (Array.isArray(value) ? value : [1, 2, 3, 4, 5, 6])
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ).sort((left, right) => left - right);

    if (days.length === 0) {
      throw new BadRequestException('Select at least one sending day');
    }

    return days;
  }

  private calculateAllowedRunAt(input: {
    requestedAt: Date;
    timezone: string;
    sendingStartTime: string;
    sendingEndTime: string;
    sendingDays: Prisma.JsonValue;
  }) {
    const sendingDays = Array.isArray(input.sendingDays)
      ? input.sendingDays
          .map((day) => Number(day))
          .filter(
            (day) =>
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6,
          )
      : [];

    if (sendingDays.length === 0) {
      throw new BadRequestException(
        'Workflow has no valid sending days',
      );
    }

    const startMinutes = this.parseClockMinutes(
      input.sendingStartTime,
    );
    const endMinutes = this.parseClockMinutes(
      input.sendingEndTime,
    );

    let candidate = new Date(
      Math.max(input.requestedAt.getTime(), Date.now()),
    );

    if (
      candidate.getUTCSeconds() > 0 ||
      candidate.getUTCMilliseconds() > 0
    ) {
      candidate = new Date(
        candidate.getTime() +
          (60 - candidate.getUTCSeconds()) * 1000 -
          candidate.getUTCMilliseconds(),
      );
    }

    candidate.setUTCSeconds(0, 0);

    for (
      let attempt = 0;
      attempt < 14 * 24 * 60;
      attempt += 1
    ) {
      const parts = this.getTimezoneParts(
        candidate,
        input.timezone,
      );

      const localMinutes =
        parts.hour * 60 + parts.minute;

      const overnightWindow = startMinutes > endMinutes;

      const sendingWindowWeekday =
        overnightWindow && localMinutes < endMinutes
          ? (parts.weekday + 6) % 7
          : parts.weekday;

      const allowedDay = sendingDays.includes(
        sendingWindowWeekday,
      );

      const insideWindow =
        !overnightWindow
          ? localMinutes >= startMinutes &&
            localMinutes < endMinutes
          : localMinutes >= startMinutes ||
            localMinutes < endMinutes;

      if (allowedDay && insideWindow) {
        return candidate;
      }

      candidate = new Date(
        candidate.getTime() + 60 * 1000,
      );
    }

    throw new BadRequestException(
      'Unable to find a valid drip sending time within the next 14 days',
    );
  }

  private isInsideAllowedSendingWindow(input: {
    date: Date;
    timezone: string;
    sendingStartTime: string;
    sendingEndTime: string;
    sendingDays: Prisma.JsonValue;
  }) {
    const sendingDays = Array.isArray(input.sendingDays)
      ? input.sendingDays
          .map((day) => Number(day))
          .filter(
            (day) =>
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6,
          )
      : [];

    const parts = this.getTimezoneParts(
      input.date,
      input.timezone,
    );

    const localMinutes =
      parts.hour * 60 + parts.minute;

    const startMinutes = this.parseClockMinutes(
      input.sendingStartTime,
    );
    const endMinutes = this.parseClockMinutes(
      input.sendingEndTime,
    );

    const overnightWindow = startMinutes > endMinutes;

    const sendingWindowWeekday =
      overnightWindow && localMinutes < endMinutes
        ? (parts.weekday + 6) % 7
        : parts.weekday;

    if (!sendingDays.includes(sendingWindowWeekday)) {
      return false;
    }

    return !overnightWindow
      ? localMinutes >= startMinutes &&
          localMinutes < endMinutes
      : localMinutes >= startMinutes ||
          localMinutes < endMinutes;
  }

  private parseClockMinutes(value: string) {
    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new BadRequestException(
        'Workflow contains an invalid sending time',
      );
    }

    return hour * 60 + minute;
  }

  private getTimezoneParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const values = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );

    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const weekday = weekdayMap[values.weekday];

    if (
      weekday === undefined ||
      values.hour === undefined ||
      values.minute === undefined
    ) {
      throw new BadRequestException(
        'Unable to calculate workflow timezone',
      );
    }

    return {
      weekday,
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  }

  private async createAuditLog(input: {
    tenantId: string;
    workflowId: string;
    actorUserId: string | null;
    action: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.prisma.dripAuditLog.create({
      data: {
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        actorUserId: input.actorUserId,
        action: input.action,
        metadata: input.metadata,
      },
    });
  }
}
