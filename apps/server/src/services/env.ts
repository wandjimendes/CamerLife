import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.warn(`[env] ${name} is not set - database-backed features will fail until it is configured.`);
    return "";
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 2567),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  monitorPassword: process.env.MONITOR_PASSWORD ?? "",
  isProd: process.env.NODE_ENV === "production",
};
