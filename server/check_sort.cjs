
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSort() {
  const reports = await prisma.shiftData.findMany({
    take: 5,
    orderBy: [
      { shiftDate: 'desc' },
      { id: 'desc' }
    ],
    select: { shiftDate: true, shiftType: true }
  });
  
  console.log("Top 5 Reports (Should be newest):");
  reports.forEach(r => console.log(r.shiftDate.toISOString().split('T')[0], r.shiftType));
}

checkSort()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
