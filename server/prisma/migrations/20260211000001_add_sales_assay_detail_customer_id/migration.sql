-- AlterTable
ALTER TABLE `sales_assay_detail` ADD COLUMN `customer_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `sales_assay_detail_customer_id_idx` ON `sales_assay_detail`(`customer_id`);

-- AddForeignKey
ALTER TABLE `sales_assay_detail` ADD CONSTRAINT `sales_assay_detail_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
