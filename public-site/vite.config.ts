import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";
export default defineConfig(async()=>{process.env.WRANGLER_WRITE_LOGS??="false";const {cloudflare}=await import("@cloudflare/vite-plugin");return{plugins:[vinext(),sites(),cloudflare({viteEnvironment:{name:"rsc",childEnvironments:["ssr"]},config:{main:"./worker/index.ts",compatibility_flags:["nodejs_compat"]}})]}});
