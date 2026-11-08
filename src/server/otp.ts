import { randomInt } from "node:crypto";
export const otpCodePattern = /^\d{4}$/;
export const createOtp = () => String(randomInt(1000, 10000));
