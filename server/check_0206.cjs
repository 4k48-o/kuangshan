
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkReport() {
  // Try 2026-02-06 first
  let targetDate = new Date('2026-02-06');
  
  let report = await prisma.shiftData.findFirst({
    where: {
      shiftDate: targetDate,
      shiftType: '早班'
    },
    include: {
      rawOreData: true,
      concentrateData: true,
      tailingsData: true,
      metalBalance: true
    }
  });

  if (!report) {
     console.log("Report not found for 2026-02-06. Trying 2025...");
     targetDate = new Date('2025-02-06');
     report = await prisma.shiftData.findFirst({
        where: {
          shiftDate: targetDate,
          shiftType: '早班'
        },
        include: {
          rawOreData: true,
          concentrateData: true,
          tailingsData: true,
          metalBalance: true
        }
      });
  }

  if (!report) {
      console.log("Report NOT FOUND for 02-06 Morning Shift.");
      return;
  }

  console.log("=== Report Data ===");
  console.log(`Date: ${report.shiftDate.toISOString().split('T')[0]}`);
  console.log(`Shift: ${report.shiftType}`);
  
  console.log("\n[Raw Ore]");
  console.log(`Wet Weight: ${report.rawOreData.wetWeight} (User: 128)`);
  console.log(`Moisture: ${report.rawOreData.moisture} (User: 3)`);
  console.log(`Pb Grade: ${report.rawOreData.pbGrade} (User: 4.07)`);
  console.log(`Ag Grade: ${report.rawOreData.agGrade} (User: 230)`);

  console.log("\n[Concentrate]");
  console.log(`Pb Grade: ${report.concentrateData.pbGrade} (User: 66.04)`);
  console.log(`Ag Grade: ${report.concentrateData.agGrade} (User: 3380)`);

  console.log("\n[Tailings]");
  console.log(`Pb Grade: ${report.tailingsData.pbGrade} (User: 0.09)`);
  console.log(`Ag Grade: ${report.tailingsData.agGrade} (User: 4)`);

  console.log("\n[Metal Balance]");
  console.log(`Dry Weight Raw: ${report.metalBalance.dryWeightRaw}`);
  console.log(`Dry Weight Conc: ${report.metalBalance.dryWeightConcentrate}`);
  console.log(`Dry Weight Tail: ${report.metalBalance.dryWeightTailings}`);
  console.log(`Yield: ${report.metalBalance.concentrateYield}`);
  console.log(`Pb Recovery: ${report.metalBalance.pbRecovery}`);
  console.log(`Ag Recovery: ${report.metalBalance.agRecovery}`);
}

checkReport()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
