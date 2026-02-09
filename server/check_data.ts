
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const shifts = await prisma.shiftData.findMany({
    select: { shiftDate: true }
  });
  
  const dates = shifts.map(s => s.shiftDate.toISOString().split('T')[0]).sort();
  console.log(`Total records: ${dates.length}`);
  if (dates.length > 0) {
      console.log(`First date: ${dates[0]}`);
      console.log(`Last date: ${dates[dates.length - 1]}`);
      
      // Group by YYYY-MM
      const byMonth: Record<string, number> = {};
      dates.forEach(d => {
          const month = d.substring(0, 7);
          byMonth[month] = (byMonth[month] || 0) + 1;
      });
      console.log('Counts by month:', byMonth);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
