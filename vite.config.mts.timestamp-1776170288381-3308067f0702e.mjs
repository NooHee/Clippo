// vite.config.mts
import { defineConfig } from "file:///Users/noeserwy/Downloads/clipstack%205/node_modules/vite/dist/node/index.js";
import react from "file:///Users/noeserwy/Downloads/clipstack%205/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///Users/noeserwy/Downloads/clipstack%205/vite.config.mts";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'"
].join("; ");
function cspMetaPlugin() {
  return {
    name: "csp-meta",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (ctx.server) return html;
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
        );
      }
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), cspMetaPlugin()],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws://localhost:5173"
    }
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared")
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL25vZXNlcnd5L0Rvd25sb2Fkcy9jbGlwc3RhY2sgNVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL25vZXNlcnd5L0Rvd25sb2Fkcy9jbGlwc3RhY2sgNS92aXRlLmNvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL25vZXNlcnd5L0Rvd25sb2Fkcy9jbGlwc3RhY2slMjA1L3ZpdGUuY29uZmlnLm10c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgdHlwZSBQbHVnaW4gfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcblxuY29uc3QgUFJPRF9DU1AgPSBbXG4gIFwiZGVmYXVsdC1zcmMgJ3NlbGYnXCIsXG4gIFwic2NyaXB0LXNyYyAnc2VsZidcIixcbiAgXCJzdHlsZS1zcmMgJ3NlbGYnICd1bnNhZmUtaW5saW5lJyBodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tXCIsXG4gIFwiZm9udC1zcmMgJ3NlbGYnIGh0dHBzOi8vZm9udHMuZ3N0YXRpYy5jb21cIixcbiAgXCJpbWctc3JjICdzZWxmJyBkYXRhOlwiLFxuICBcImNvbm5lY3Qtc3JjICdzZWxmJ1wiLFxuXS5qb2luKCc7ICcpO1xuXG4vLyBJbmplY3RzIHRoZSBDU1AgPG1ldGE+IHRhZyBvbmx5IGluIHByb2R1Y3Rpb24gYnVpbGRzLlxuLy8gRGV2IG1vZGUgcmVsaWVzIG9uIHRoZSBWaXRlIHNlcnZlciBoZWFkZXJzIGJlbG93IGluc3RlYWQuXG5mdW5jdGlvbiBjc3BNZXRhUGx1Z2luKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ2NzcC1tZXRhJyxcbiAgICB0cmFuc2Zvcm1JbmRleEh0bWw6IHtcbiAgICAgIG9yZGVyOiAncG9zdCcsXG4gICAgICBoYW5kbGVyKGh0bWwsIGN0eCkge1xuICAgICAgICBpZiAoY3R4LnNlcnZlcikgcmV0dXJuIGh0bWw7IC8vIGRldiBcdTIwMTQgc2tpcFxuICAgICAgICByZXR1cm4gaHRtbC5yZXBsYWNlKFxuICAgICAgICAgICc8bWV0YSBjaGFyc2V0PVwiVVRGLThcIiAvPicsXG4gICAgICAgICAgYDxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiIC8+XFxuICAgIDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCIke1BST0RfQ1NQfVwiIC8+YFxuICAgICAgICApO1xuICAgICAgfSxcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgY3NwTWV0YVBsdWdpbigpXSxcbiAgYmFzZTogJy4vJyxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0L3JlbmRlcmVyJyxcbiAgICBlbXB0eU91dERpcjogdHJ1ZSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBcImRlZmF1bHQtc3JjICdzZWxmJzsgc2NyaXB0LXNyYyAnc2VsZicgJ3Vuc2FmZS1ldmFsJyAndW5zYWZlLWlubGluZSc7IHN0eWxlLXNyYyAnc2VsZicgJ3Vuc2FmZS1pbmxpbmUnIGh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb207IGZvbnQtc3JjICdzZWxmJyBodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tOyBpbWctc3JjICdzZWxmJyBkYXRhOjsgY29ubmVjdC1zcmMgJ3NlbGYnIHdzOi8vbG9jYWxob3N0OjUxNzNcIixcbiAgICB9LFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAc2hhcmVkJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3NyYy9zaGFyZWQnKSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFTLFNBQVMsb0JBQWlDO0FBQy9VLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFIcUosSUFBTSwyQ0FBMkM7QUFLcE8sSUFBTSxZQUFZLEtBQUssUUFBUSxjQUFjLHdDQUFlLENBQUM7QUFFN0QsSUFBTSxXQUFXO0FBQUEsRUFDZjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0YsRUFBRSxLQUFLLElBQUk7QUFJWCxTQUFTLGdCQUF3QjtBQUMvQixTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixvQkFBb0I7QUFBQSxNQUNsQixPQUFPO0FBQUEsTUFDUCxRQUFRLE1BQU0sS0FBSztBQUNqQixZQUFJLElBQUksT0FBUSxRQUFPO0FBQ3ZCLGVBQU8sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBO0FBQUEsMERBQXFGLFFBQVE7QUFBQSxRQUMvRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUM7QUFBQSxFQUNsQyxNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsRUFDZjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLE1BQ1AsMkJBQTJCO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxXQUFXLEtBQUssUUFBUSxXQUFXLFlBQVk7QUFBQSxJQUNqRDtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
