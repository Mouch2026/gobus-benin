/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["shared"],
  experimental: {
    serverActions: {
      // Défaut Next : 1 Mo, qui rejetait déjà un logo "2 Mo" et rejetterait
      // tout PDF scanné de chauffeur. Les fichiers sont plafonnés à 5 Mio
      // (bucket driver-documents) : 6 Mo laisse la marge de l'encodage
      // multipart (10-20 Ko, voir la doc serverActions.bodySizeLimit).
      bodySizeLimit: "6mb",
    },
  },
};

module.exports = nextConfig;
