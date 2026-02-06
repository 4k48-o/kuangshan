
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkReport() {
  const targetDate = new Date('2026-02-05');
  
  const report = await prisma.shiftData.findFirst({
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

  if (!report) return;

  const raw = report.rawOreData;
  const conc = report.concentrateData;
  const tail = report.tailingsData;
  const mb = report.metalBalance;

  if (raw && conc && tail) {
      const f = Number(raw.pbGrade);
      const c = Number(conc.pbGrade);
      const t = Number(tail.pbGrade);
      
      const newYield = ((f - t) / (c - t)) * 100;
      const F = Number(mb.dryWeightRaw);
      const C = F * (newYield / 100);
      const T = F - C;

      // Recalculate Recoveries using the new Weight C
      // Pb (Theoretical)
      const pbRec = (c * (f - t)) / (f * (c - t)) * 100;
      
      // Zn (Weight based)
      const znRec = (C * Number(conc.znGrade)) / (F * Number(raw.znGrade || 1)) * 100; // avoid div 0
      
      // Ag (Weight based)
      const agRec = (C * Number(conc.agGrade)) / (F * Number(raw.agGrade || 1)) * 100;

      console.log(`New Recoveries - Pb: ${pbRec}, Zn: ${znRec}, Ag: ${agRec}`);

      // Update DB
      await prisma.metalBalance.update({
          where: { id: mb.id },
          data: {
              concentrateYield: newYield,
              dryWeightConcentrate: C,
              dryWeightTailings: T,
              pbRecovery: pbRec,
              znRecovery: isNaN(znRec) ? 0 : znRec,
              agRecovery: isNaN(agRec) ? 0 : agRec
          }
      });
      console.log("Database updated with recoveries.");
  }
}

checkReport()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
