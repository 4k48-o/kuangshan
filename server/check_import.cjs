
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkImport() {
  const report = await prisma.shiftData.findFirst({
    where: {
      shiftDate: new Date('2025-08-19'),
      shiftType: '中班'
    },
    include: {
      rawOreData: true,
      metalBalance: true
    }
  });

  if (report) {
    console.log("Found Report:", report.shiftDate, report.shiftType);
    console.log("Raw Grades:", report.rawOreData.pbGrade, report.rawOreData.znGrade);
    console.log("Recovery:", report.metalBalance.pbRecovery);
    console.log("Yield:", report.metalBalance.concentrateYield);
    console.log("Dry Weight:", report.metalBalance.dryWeightRaw);
  } else {
    console.log("Report not found.");
  }
}

checkImport()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
