"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Instalação do PWA é um enhancement — falha de registro não deve quebrar a aplicação.
    });
  }, []);

  return null;
}
