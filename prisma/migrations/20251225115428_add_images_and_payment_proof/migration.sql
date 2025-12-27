-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentProofImageUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "imageUrl" DROP NOT NULL;
