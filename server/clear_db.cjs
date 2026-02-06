
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    console.log('Starting database cleanup...');
    
    // Deleting ShiftData will cascade delete all related tables
    const deleteShiftData = await prisma.shiftData.deleteMany({});
    
    console.log(`Deleted ${deleteShiftData.count} shift reports.`);
    console.log('Database cleanup completed successfully.');
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
