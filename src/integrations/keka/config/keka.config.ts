// src/integrations/keka/config/keka.config.ts
import dotenv from "dotenv";
dotenv.config();

export const kekaConfig = {
  baseUrl: process.env.KEKA_BASE_URL || "",
  apiKey: process.env.KEKA_API_KEY || "",
  clientId: process.env.KEKA_CLIENT_ID || "",
  clientSecret: process.env.KEKA_CLIENT_SECRET || "",
  webhookSecret: process.env.KEKA_WEBHOOK_SECRET || "",
  enabled: process.env.KEKA_ENABLED === "true"
};

export function isKekaEnabled(): boolean {
  // Returns true only if explicitly enabled AND configuration credentials are set
  return kekaConfig.enabled && 
         !!kekaConfig.baseUrl && 
         (!!kekaConfig.apiKey || (!!kekaConfig.clientId && !!kekaConfig.clientSecret));
}

export default kekaConfig;
