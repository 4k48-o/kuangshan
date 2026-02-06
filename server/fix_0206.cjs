
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixReport() {
  const targetDate = new Date('2026-02-06');
  
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

  // Correcting the Tailings Pb Grade
  const correctedTailPb = 0.09;
  
  console.log(`Updating Tail Pb from ${tail.pbGrade} to ${correctedTailPb}`);

  // Recalculate Balance
  const f = Number(raw.pbGrade);
  const c = Number(conc.pbGrade);
  const t = correctedTailPb; // Use corrected value
  
  // 1. Yield
  const newYield = ((f - t) / (c - t)) * 100;
  
  // 2. Weights
  const F = Number(mb.dryWeightRaw);
  const C = F * (newYield / 100);
  const T = F - C;

  // 3. Recoveries
  // Pb (Theoretical)
  const pbRec = (c * (f - t)) / (f * (c - t)) * 100;
  
  // Zn (Weight based)
  const znRec = (C * Number(conc.znGrade)) / (F * Number(raw.znGrade || 1)) * 100;
  
  // Ag (Weight based)
  const agRec = (C * Number(conc.agGrade)) / (F * Number(raw.agGrade || 1)) * 100;

  console.log(`New Yield: ${newYield}`);
  console.log(`New Recoveries - Pb: ${pbRec}, Ag: ${agRec}`);

  // Transaction to update both TailingsData and MetalBalance
  await prisma.$transaction([
    prisma.tailingsData.update({
        where: { id: tail.id },
        data: { pbGrade: correctedTailPb }
    }),
    prisma.metalBalance.update({
        where: { id: mb.id },
        data: {
            concentrateYield: newYield,
            dryWeightConcentrate: C,
            dryWeightTailings: T,
            pbRecovery: pbRec,
            znRecovery: isNaN(znRec) ? 0 : znRec,
            agRecovery: isNaN(agRec) ? 0 : agRec
        }
    })
  ]);

  console.log("Database updated successfully.");
}

fixReport()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
