import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from './prisma.service';

const conversationStatuses = new Set([
  'OPEN',
  'PENDING',
  'RESOLVED',
]);

const assignableTenantRoles = new Set([
  'admin',
  'manager',
  'agent',
]);

type ConversationListOptions = {
  limit?: string;
  cursor?: string;
  status?: string;
  search?: string;
  assigned?: string;
};

type MessageListOptions = {
  limit?: string;
  cursor?: string;
};

type InboundMessageInput = {
  tenantId: string;
  phoneNumberId: string;
  webhookEventId?: string | null;
  metaMessageId: string;
  fromPhone: string;
  messageType?: string;
  bodyText?: string | null;
  caption?: string | null;
  timestamp?: string | number;
  rawPayload?: Record<string, unknown>;
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}
  async listConversations(
    tenantId: string,
    currentUserId: string,
    options: ConversationListOptions = {},
  ) {
    const limit = this.cleanLimit(
      options.limit,
      50,
      100,
    );

    const status = this.cleanStatus(
      options.status,
      true,
    );

    const search = String(
      options.search || '',
    ).trim();

    const assigned = String(
      options.assigned || '',
    ).trim();

    const cursor = String(
      options.cursor || '',
    ).trim();

    if (cursor) {
      await this.assertConversationCursorBelongsToTenant(
        tenantId,
        cursor,
      );
    }

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
    };

    if (assigned === 'me') {
      where.assignedUserId = currentUserId;
    } else if (assigned === 'unassigned') {
      where.assignedUserId = null;
    } else if (
      assigned &&
      assigned !== 'all'
    ) {
      const assignedUser =
        await this.prisma.user.findFirst({
          where: {
            id: assigned,
            tenantId,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

      if (!assignedUser) {
        throw new BadRequestException(
          'Assigned user is not part of this workspace',
        );
      }

      where.assignedUserId = assignedUser.id;
    }

    if (search) {
      const normalizedPhone =
        search.replace(/\D/g, '');

      where.OR = [
        {
          contact: {
            is: {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          customerPhone: {
            contains:
              normalizedPhone || search,
            mode: 'insensitive',
          },
        },
        {
          lastMessagePreview: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const conversations =
      await this.prisma.conversation.findMany({
        where,
        ...(cursor
          ? {
              cursor: {
                id: cursor,
              },
              skip: 1,
            }
          : {}),
        take: limit + 1,
        orderBy: [
          {
            lastMessageAt: 'desc',
          },
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: {
          id: true,
          customerPhone: true,
          status: true,
          unreadCount: true,
          lastMessagePreview: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              tags: true,
              optedIn: true,
              optInSource: true,
              contactTypeId: true,
            },
          },
          metaAccount: {
            select: {
              id: true,
              phoneNumberId: true,
              businessName: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
      });

    const hasMore =
      conversations.length > limit;

    const items = hasMore
      ? conversations.slice(0, limit)
      : conversations;

    return {
      items,
      nextCursor: hasMore
        ? items[items.length - 1]?.id || null
        : null,
    };
  }

  async getConversation(
    tenantId: string,
    conversationId: string,
  ) {
    const conversation =
      await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          tenantId,
        },
        select: {
          id: true,
          customerPhone: true,
          status: true,
          unreadCount: true,
          lastMessagePreview: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              tags: true,
              optedIn: true,
              optInSource: true,
              optInAt: true,
              optOutAt: true,
              contactTypeId: true,
            },
          },
          metaAccount: {
            select: {
              id: true,
              phoneNumberId: true,
              businessName: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
          assignments: {
            orderBy: {
              assignedAt: 'desc',
            },
            take: 20,
            select: {
              id: true,
              assignedAt: true,
              unassignedAt: true,
              assignedUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              assignedByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found',
      );
    }

    return conversation;
  }

  async listMessages(
    tenantId: string,
    conversationId: string,
    options: MessageListOptions = {},
  ) {
    await this.requireConversation(
      tenantId,
      conversationId,
    );

    const limit = this.cleanLimit(
      options.limit,
      50,
      100,
    );

    const cursor = String(
      options.cursor || '',
    ).trim();

    if (cursor) {
      const cursorMessage =
        await this.prisma.whatsappMessage.findFirst({
          where: {
            id: cursor,
            tenantId,
            conversationId,
          },
          select: {
            id: true,
          },
        });

      if (!cursorMessage) {
        throw new BadRequestException(
          'Invalid message cursor',
        );
      }
    }

    const messages =
      await this.prisma.whatsappMessage.findMany({
        where: {
          tenantId,
          conversationId,
        },
        ...(cursor
          ? {
              cursor: {
                id: cursor,
              },
              skip: 1,
            }
          : {}),
        take: limit + 1,
        orderBy: [
          {
            occurredAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: {
          id: true,
          customerPhone: true,
          metaMessageId: true,
          direction: true,
          messageType: true,
          status: true,
          bodyText: true,
          caption: true,
          replyToMetaMessageId: true,
          errorCode: true,
          errorMessage: true,
          occurredAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
          createdAt: true,
          mediaFile: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              mediaType: true,
              sizeBytes: true,
            },
          },
          sentByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    const hasMore =
      messages.length > limit;

    const items = hasMore
      ? messages.slice(0, limit)
      : messages;

    return {
      items,
      nextCursor: hasMore
        ? items[items.length - 1]?.id || null
        : null,
    };
  }

  async updateStatus(
    tenantId: string,
    actorUserId: string,
    conversationId: string,
    statusInput?: string,
  ) {
    const status = this.cleanStatus(
      statusInput,
      false,
    );

    await this.requireConversation(
      tenantId,
      conversationId,
    );

    const updated =
      await this.prisma.conversation.updateMany({
        where: {
          id: conversationId,
          tenantId,
        },
        data: {
          status,
          resolvedAt:
            status === 'RESOLVED'
              ? new Date()
              : null,
        },
      });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Conversation not found',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action:
          'CONVERSATION_STATUS_CHANGED',
        entityType: 'CONVERSATION',
        entityId: conversationId,
        metadata: {
          status,
        },
      },
    });

    return this.getConversation(
      tenantId,
      conversationId,
    );
  }

  async assignConversation(
    tenantId: string,
    actorUserId: string,
    conversationId: string,
    assignedUserIdInput?: string | null,
  ) {
    const assignedUserId =
      String(
        assignedUserIdInput || '',
      ).trim() || null;

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${`conversation-assignment:${tenantId}:${conversationId}`},
                0
              )
            )
          `,
        );

        const conversation =
          await transaction.conversation.findFirst({
            where: {
              id: conversationId,
              tenantId,
            },
            select: {
              id: true,
              assignedUserId: true,
            },
          });

        if (!conversation) {
          throw new NotFoundException(
            'Conversation not found',
          );
        }

        if (assignedUserId) {
          const assignedUser =
            await transaction.user.findFirst({
              where: {
                id: assignedUserId,
                tenantId,
                isActive: true,
              },
              select: {
                id: true,
                role: true,
              },
            });

          if (
            !assignedUser ||
            !assignableTenantRoles.has(
              assignedUser.role,
            )
          ) {
            throw new BadRequestException(
              'Assigned user is not an active member of this workspace',
            );
          }
        }

        if (
          conversation.assignedUserId ===
          assignedUserId
        ) {
          return;
        }

        await transaction
          .conversationAssignment
          .updateMany({
            where: {
              tenantId,
              conversationId,
              unassignedAt: null,
            },
            data: {
              unassignedAt: new Date(),
            },
          });

        const updated =
          await transaction.conversation.updateMany({
            where: {
              id: conversationId,
              tenantId,
            },
            data: {
              assignedUserId,
            },
          });

        if (updated.count !== 1) {
          throw new NotFoundException(
            'Conversation not found',
          );
        }

        if (assignedUserId) {
          await transaction
            .conversationAssignment
            .create({
              data: {
                tenantId,
                conversationId,
                assignedUserId,
                assignedByUserId:
                  actorUserId,
              },
            });
        }

        await transaction.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: assignedUserId
              ? 'CONVERSATION_ASSIGNED'
              : 'CONVERSATION_UNASSIGNED',
            entityType: 'CONVERSATION',
            entityId: conversationId,
            metadata: {
              previousAssignedUserId:
                conversation.assignedUserId,
              assignedUserId,
            },
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );

    return this.getConversation(
      tenantId,
      conversationId,
    );
  }

  async markConversationRead(
    tenantId: string,
    actorUserId: string,
    conversationId: string,
  ) {
    const updated =
      await this.prisma.conversation.updateMany({
        where: {
          id: conversationId,
          tenantId,
        },
        data: {
          unreadCount: 0,
        },
      });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Conversation not found',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action:
          'CONVERSATION_MARKED_READ',
        entityType: 'CONVERSATION',
        entityId: conversationId,
      },
    });

    return {
      ok: true,
    };
  }

    async ingestInboundMessage(input: InboundMessageInput) {
    const tenantId = String(
      input.tenantId || '',
    ).trim();

    const phoneNumberId = String(
      input.phoneNumberId || '',
    ).trim();

    const webhookEventId =
      String(
        input.webhookEventId || '',
      ).trim() || null;

    const metaMessageId = String(
      input.metaMessageId || '',
    ).trim();

    const fromPhone = this.normalizePhone(
      input.fromPhone,
    );

    const messageType = this.cleanMessageType(
      input.messageType,
    );

    const bodyText = this.cleanOptionalText(
      input.bodyText,
      10_000,
    );

    const caption = this.cleanOptionalText(
      input.caption,
      2_000,
    );

    const occurredAt = this.parseMetaTimestamp(
      input.timestamp,
    );

    if (!tenantId || !phoneNumberId) {
      throw new BadRequestException(
        'Inbound message tenant identity is required',
      );
    }

    if (
      !metaMessageId ||
      metaMessageId.length > 255
    ) {
      throw new BadRequestException(
        'Invalid inbound Meta message ID',
      );
    }

    if (
      fromPhone.length < 8 ||
      fromPhone.length > 15
    ) {
      throw new BadRequestException(
        'Invalid inbound WhatsApp phone number',
      );
    }

    /*
     * Fast duplicate check.
     *
     * Meta can send the same webhook more than once.
     * The same Meta message ID must never create two
     * WhatsApp message records.
     */
    const existingMessage =
      await this.prisma.whatsappMessage.findUnique({
        where: {
          metaMessageId,
        },
        select: {
          tenantId: true,
          conversationId: true,
          contactId: true,
        },
      });

    if (existingMessage) {
      if (
        existingMessage.tenantId !== tenantId
      ) {
        throw new BadRequestException(
          'Inbound message identity conflict',
        );
      }

      return {
        ok: true,
        created: false,
        duplicate: true,
        conversationId:
          existingMessage.conversationId,
        contactId:
          existingMessage.contactId,
      };
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          /*
           * Lock this exact tenant + Meta number +
           * customer phone combination.
           *
           * Two webhooks for the same customer cannot
           * create two conversations at the same time.
           */
          await tx.$executeRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtextextended(
                  ${`conversation-inbound:${tenantId}:${phoneNumberId}:${fromPhone}`},
                  0
                )
              )
            `,
          );

          /*
           * Check again after obtaining the lock.
           *
           * Another request may have inserted the
           * message while this request was waiting.
           */
          const duplicate =
            await tx.whatsappMessage.findUnique({
              where: {
                metaMessageId,
              },
              select: {
                tenantId: true,
                conversationId: true,
                contactId: true,
              },
            });

          if (duplicate) {
            if (
              duplicate.tenantId !== tenantId
            ) {
              throw new BadRequestException(
                'Inbound message identity conflict',
              );
            }

            return {
              ok: true,
              created: false,
              duplicate: true,
              conversationId:
                duplicate.conversationId,
              contactId:
                duplicate.contactId,
            };
          }

          /*
           * Confirm the Meta phone belongs to this
           * authenticated tenant.
           */
          const metaAccount =
            await tx.tenantMetaAccount.findFirst({
              where: {
                tenantId,
                phoneNumberId,
                isActive: true,
              },
              select: {
                id: true,
              },
            });

          if (!metaAccount) {
            throw new NotFoundException(
              'Inbound WhatsApp phone number is not active for this workspace',
            );
          }

          /*
           * Try to find an existing CRM contact.
           *
           * tenantId + phone is the contact identity.
           */
          const existingContact =
            await tx.contact.findUnique({
              where: {
                tenantId_phone: {
                  tenantId,
                  phone: fromPhone,
                },
              },
              select: {
                id: true,
                deletedAt: true,
              },
            });

          let contactId =
            existingContact &&
            !existingContact.deletedAt
              ? existingContact.id
              : null;

          /*
           * Create a basic contact only when:
           *
           * 1. The contact does not already exist.
           * 2. The tenant's plan allows another contact.
           *
           * IMPORTANT:
           * An inbound message does not mean marketing
           * consent. Therefore optedIn stays false.
           */
          if (!existingContact) {
            try {
              await this.billingService
                .assertCanCreateContactsInTransaction(
                  tx,
                  tenantId,
                  1,
                );

              const createdContact =
                await tx.contact.create({
                  data: {
                    tenantId,
                    name: fromPhone,
                    phone: fromPhone,
                    optedIn: false,
                    optInSource: null,
                  },
                  select: {
                    id: true,
                  },
                });

              contactId = createdContact.id;
            } catch (error) {
              /*
               * Another parallel request may have
               * created this contact first.
               */
              if (
                error instanceof
                  Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
              ) {
                const racedContact =
                  await tx.contact.findFirst({
                    where: {
                      tenantId,
                      phone: fromPhone,
                      deletedAt: null,
                    },
                    select: {
                      id: true,
                    },
                  });

                contactId =
                  racedContact?.id || null;
              } else if (
                error instanceof
                BadRequestException
              ) {
                /*
                 * The contact plan limit must never
                 * cause the customer message to be lost.
                 *
                 * The conversation will keep the phone
                 * number without a CRM contact link.
                 */
                contactId = null;
              } else {
                throw error;
              }
            }
          }

          /*
           * A conversation is unique inside:
           *
           * tenant + connected Meta account +
           * customer phone number.
           */
          let conversation =
            await tx.conversation.findUnique({
              where: {
                tenantId_customerPhone_metaAccountId:
                  {
                    tenantId,
                    customerPhone:
                      fromPhone,
                    metaAccountId:
                      metaAccount.id,
                  },
              },
              select: {
                id: true,
                contactId: true,
              },
            });

          if (!conversation) {
            conversation =
              await tx.conversation.create({
                data: {
                  tenantId,
                  contactId,
                  metaAccountId:
                    metaAccount.id,
                  customerPhone:
                    fromPhone,
                  status: 'OPEN',
                },
                select: {
                  id: true,
                  contactId: true,
                },
              });
          } else if (
            !conversation.contactId &&
            contactId
          ) {
            /*
             * A conversation may have been created when
             * the tenant had no contact capacity.
             *
             * When a valid contact later exists, link it
             * to the conversation.
             */
            await tx.conversation.updateMany({
              where: {
                id: conversation.id,
                tenantId,
                contactId: null,
              },
              data: {
                contactId,
              },
            });

            conversation = {
              ...conversation,
              contactId,
            };
          }

          /*
           * Save the actual inbound WhatsApp message.
           */
          const message =
            await tx.whatsappMessage.create({
              data: {
                tenantId,
                conversationId:
                  conversation.id,
                contactId,
                customerPhone:
                  fromPhone,
                webhookEventId,
                metaMessageId,
                direction: 'INBOUND',
                messageType,
                status: 'RECEIVED',
                bodyText,
                caption,
                rawPayload:
                  input.rawPayload
                    ? (
                        input.rawPayload as
                          Prisma.InputJsonValue
                      )
                    : undefined,
                occurredAt,
              },
              select: {
                id: true,
              },
            });

          /*
           * Update the inbox preview.
           *
           * A new inbound message:
           * - reopens the conversation;
           * - clears resolvedAt;
           * - increments unreadCount;
           * - updates message preview and timestamps.
           */
          const updatedConversation =
            await tx.conversation.updateMany({
              where: {
                id: conversation.id,
                tenantId,
              },
              data: {
                status: 'OPEN',
                resolvedAt: null,
                unreadCount: {
                  increment: 1,
                },
                lastMessagePreview:
                  this.buildPreview(
                    messageType,
                    bodyText,
                    caption,
                  ),
                lastMessageAt:
                  occurredAt,
                lastInboundAt:
                  occurredAt,
              },
            });

          if (
            updatedConversation.count !== 1
          ) {
            throw new NotFoundException(
              'Conversation could not be updated',
            );
          }

          return {
            ok: true,
            created: true,
            duplicate: false,
            conversationId:
              conversation.id,
            contactId,
            messageId: message.id,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      /*
       * Final protection for a rare race condition.
       *
       * Even if two servers try the insert together,
       * the unique Meta message ID blocks duplication.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate =
          await this.prisma.whatsappMessage
            .findUnique({
              where: {
                metaMessageId,
              },
              select: {
                tenantId: true,
                conversationId: true,
                contactId: true,
              },
            });

        if (
          duplicate?.tenantId === tenantId
        ) {
          return {
            ok: true,
            created: false,
            duplicate: true,
            conversationId:
              duplicate.conversationId,
            contactId:
              duplicate.contactId,
          };
        }
      }

      throw error;
    }
  }

  private async requireConversation(
    tenantId: string,
    conversationId: string,
  ) {
    const conversation =
      await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          tenantId,
        },
        select: {
          id: true,
        },
      });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found',
      );
    }

    return conversation;
  }

  private async assertConversationCursorBelongsToTenant(
    tenantId: string,
    cursor: string,
  ) {
    const conversation =
      await this.prisma.conversation.findFirst({
        where: {
          id: cursor,
          tenantId,
        },
        select: {
          id: true,
        },
      });

    if (!conversation) {
      throw new BadRequestException(
        'Invalid conversation cursor',
      );
    }
  }

  private cleanLimit(
    value: string | undefined,
    fallback: number,
    maximum: number,
  ) {
    const parsed = Number.parseInt(
      String(value || ''),
      10,
    );

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(
      Math.max(parsed, 1),
      maximum,
    );
  }

  private cleanStatus(
    value: string | undefined,
    optional: boolean,
  ) {
    const status = String(
      value || '',
    )
      .trim()
      .toUpperCase();

    if (!status && optional) {
      return '';
    }

    if (!conversationStatuses.has(status)) {
      throw new BadRequestException(
        'Conversation status must be OPEN, PENDING, or RESOLVED',
      );
    }

    return status;
  }

  private normalizePhone(value: unknown) {
    return String(value || '')
      .replace(/\D/g, '');
  }

  private cleanMessageType(value: unknown) {
    return (
      String(value || 'UNKNOWN')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .slice(0, 40) || 'UNKNOWN'
    );
  }

  private cleanOptionalText(
    value: unknown,
    maximumLength: number,
  ) {
    const cleaned = String(
      value || '',
    ).trim();

    return cleaned
      ? cleaned.slice(0, maximumLength)
      : null;
  }

  private parseMetaTimestamp(
    value: unknown,
  ) {
    const numericTimestamp = Number(value);

    if (
      Number.isFinite(numericTimestamp) &&
      numericTimestamp > 0
    ) {
      const milliseconds =
        numericTimestamp <
        10_000_000_000
          ? numericTimestamp * 1000
          : numericTimestamp;

      const date = new Date(milliseconds);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return new Date();
  }

  private buildPreview(
    messageType: string,
    bodyText: string | null,
    caption: string | null,
  ) {
    const text = bodyText || caption;

    if (text) {
      return text
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
    }

    return `[${messageType}]`;
  }
}