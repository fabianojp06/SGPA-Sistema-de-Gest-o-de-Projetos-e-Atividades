import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GiaFlow — Gestão de Projetos e Atividades",
    short_name: "GiaFlow",
    description: "Gestão de projetos e atividades da equipe GIA/STI",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0f12",
    theme_color: "#0d0f12",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
