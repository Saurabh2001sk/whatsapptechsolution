import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env';

const pool = new Pool({
  connectionString: env.databaseUrl,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const confirmed = process.argv.includes('--confirm');

  if (!email || !email.includes('@') || !confirmed) {
    throw new Error(
      'Usage: npm run promote:platform-admin -- user@example.com --confirm',
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
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
    },
  });

  if (!user) {
    throw new Error(`No user found with email: ${email}`);
  }

  if (!user.isActive) {
    throw new Error(`User is inactive: ${email}`);
  }

  if (user.tenant.status !== 'active') {
    throw new Error(`User tenant is not active: ${user.tenant.name}`);
  }

const updatedUser = await prisma.$transaction(async (tx) => {
  const promotedUser = await tx.user.update({
    where: {
      id: user.id,
    },
    data: {
      role: 'platform_admin',
      sessionVersion: {
        increment: 1,
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenant: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  await tx.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'PLATFORM_ADMIN_PROMOTED_BY_SCRIPT',
      entityType: 'USER',
      entityId: user.id,
      metadata: {
        email: promotedUser.email,
        previousRole: user.role,
        newRole: promotedUser.role,
        script: 'promote-platform-admin',
      },
    },
  });

  return promotedUser;
});

  console.log('Platform admin promoted successfully');
  console.log({
    email: updatedUser.email,
    name: updatedUser.name,
    role: updatedUser.role,
    tenant: updatedUser.tenant,
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });