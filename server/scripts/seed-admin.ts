import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = 'cfadmin';
  const plainPassword = '1qaz@WSX';
  const hash = await bcrypt.hash(plainPassword, 10);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log('User cfadmin already exists, updating password.');
    await prisma.user.update({
      where: { username },
      data: { password: hash },
    });
  } else {
    await prisma.user.create({
      data: { username, password: hash },
    });
    console.log('Created user cfadmin.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
