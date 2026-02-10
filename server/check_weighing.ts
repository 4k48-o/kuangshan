import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.rawOreWeighingRecord.count();
  console.log('称重记录总数:', total);

  if (total > 0) {
    const list = await prisma.rawOreWeighingRecord.findMany({
      orderBy: [{ recordDate: 'desc' }, { weighTime: 'desc' }],
      take: 20,
    });
    console.log('\n最近 20 条记录:');
    console.log('─'.repeat(100));
    list.forEach((r, i) => {
      console.log(
        `${i + 1}. 车号: ${r.vehicleNo} | 时间: ${r.weighTime.toISOString().slice(0, 19)} | 毛重: ${r.grossWeight} | 皮重: ${r.tareWeight} | 净重: ${r.netWeight} | 来源: ${r.sourceFile || '-'}`
      );
    });
    const byFile = await prisma.rawOreWeighingRecord.groupBy({
      by: ['sourceFile'],
      _count: { id: true },
    });
    console.log('\n按来源文件统计:');
    byFile.forEach((f) => console.log(`  ${f.sourceFile || '(空)'}: ${f._count.id} 条`));
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
