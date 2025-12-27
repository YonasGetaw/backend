import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { hashPassword } from "../src/utils/password.js";
const prisma = new PrismaClient();
const genReferralCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);
async function generateUniqueReferralCode() {
    for (let i = 0; i < 7; i++) {
        const code = genReferralCode();
        const existing = await prisma.user.findUnique({ where: { referralCode: code } });
        if (!existing)
            return code;
    }
    throw new Error("Failed to generate unique referral code");
}
async function main() {
    const name = process.env.SEED_ADMIN_NAME || "Admin";
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
        throw new Error("Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in environment");
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        const referralCode = existing.referralCode ?? (await generateUniqueReferralCode());
        await prisma.user.update({
            where: { email },
            data: {
                name,
                role: "ADMIN",
                passwordHash: await hashPassword(password),
                referralCode
            }
        });
        return;
    }
    await prisma.user.create({
        data: {
            name,
            email,
            role: "ADMIN",
            passwordHash: await hashPassword(password),
            referralCode: await generateUniqueReferralCode()
        }
    });
    const paymentExisting = await prisma.paymentSettings.findFirst();
    if (!paymentExisting) {
        await prisma.paymentSettings.create({
            data: {
                commercialBankName: "Commercial Bank",
                commercialAccountNumber: "0000000000",
                telebirrPhone: "+251900000000",
                cbeBirrPhone: "+251900000000"
            }
        });
    }
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
