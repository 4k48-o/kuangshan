/**
 * 一次性修正：根据 weigh_time 用 UTC 日期重算 record_date，与当前写入/查询逻辑一致。
 * 运行: npx ts-node -r dotenv/config fix_weighing_record_date.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const list = await prisma.rawOreWeighingRecord.findMany();
  let updated = 0;
  for (const r of list) {
    const wt = new Date(r.weighTime);
    const y = wt.getFullYear(), m = wt.getMonth(), d = wt.getDate();
    const newRecordDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (new Date(r.recordDate).getTime() !== newRecordDate.getTime()) {
      await prisma.rawOreWeighingRecord.update({
        where: { id: r.id },
        data: { recordDate: newRecordDate },
      });
      updated++;
    }
  }
  console.log('已修正 record_date 的记录数:', updated, '/ 总记录数:', list.length);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
