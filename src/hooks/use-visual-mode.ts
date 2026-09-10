import { useEffect, useState } from "react";

const _K = "_vmode";

export const useVisualMode = () => {
  const [active, setActive] = useState(() => localStorage.getItem(_K) === "true");

  useEffect(() => {
    if (active) {
      document.documentElement.style.filter = "invert(1)";
      document.documentElement.classList.add("easter-egg-inverted");
    } else {
      document.documentElement.style.filter = "";
      document.documentElement.classList.remove("easter-egg-inverted");
    }
  }, [active]);

  const toggle = () => {
    setActive(prev => {
      const next = !prev;
      localStorage.setItem(_K, String(next));
      return next;
    });
  };

  return { active, toggle };
};
