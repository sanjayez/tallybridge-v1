const controlPlaneUrl = process.env.CONTROL_PLANE_URL || "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/control/:path*",
        destination: `${controlPlaneUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
