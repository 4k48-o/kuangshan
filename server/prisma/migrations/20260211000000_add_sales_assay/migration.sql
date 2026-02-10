-- CreateTable
CREATE TABLE `sales_assay_report` (
    `id` VARCHAR(191) NOT NULL,
    `report_date` DATE NOT NULL,
    `product_name` VARCHAR(64) NOT NULL,
    `customer_name` VARCHAR(128) NOT NULL,
    `vehicle_count` INTEGER NOT NULL,
    `source_file` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sales_assay_report_report_date_idx`(`report_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_assay_detail` (
    `id` VARCHAR(191) NOT NULL,
    `report_id` VARCHAR(191) NOT NULL,
    `seq_no` VARCHAR(16) NULL,
    `vehicle_no` VARCHAR(32) NULL,
    `customer_code` VARCHAR(64) NULL,
    `wet_weight` DECIMAL(12, 4) NULL,
    `moisture` DECIMAL(8, 4) NULL,
    `dry_weight` DECIMAL(12, 4) NULL,
    `pb_grade` DECIMAL(8, 4) NULL,
    `zn_grade` DECIMAL(8, 4) NULL,
    `cu_grade` DECIMAL(8, 4) NULL,
    `ag_gpt` DECIMAL(12, 4) NULL,
    `pb_metal` DECIMAL(12, 4) NULL,
    `zn_metal` DECIMAL(12, 4) NULL,
    `cu_metal` DECIMAL(12, 4) NULL,
    `ag_kg` DECIMAL(12, 4) NULL,

    INDEX `sales_assay_detail_report_id_idx`(`report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_assay_detail` ADD CONSTRAINT `sales_assay_detail_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `sales_assay_report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
