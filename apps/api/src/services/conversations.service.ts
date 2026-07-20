import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}