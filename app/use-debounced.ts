import { useEffect, useState } from "react";

// Espera a pessoa terminar de mexer num filtro (ex.: data) antes de buscar no
// servidor: sem isso, cada clique/tecla no seletor de data disparava uma busca completa.
export function useDebounced<T>(value: T, ms = 700): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
