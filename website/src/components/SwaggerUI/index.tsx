import React, { useEffect, useRef, useState } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import styles from "./styles.module.css";

// Renders the repository's vendored Swagger UI (docs/api, published under /handbook/swagger/)
// inside the site layout, with the same settings as the API's own page at /docs/.
declare global {
  interface Window {
    SwaggerUIBundle?: (options: object) => unknown;
    climsSwaggerOptions?: (options: object) => object;
    ui?: unknown;
  }
}

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load ${src}`));
        document.body.appendChild(script);
      }),
    );
  }
  return loaded.get(src)!;
}

function loadStylesheet(href: string) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

export default function SwaggerUI(): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const base = useBaseUrl("/swagger/");

  useEffect(() => {
    let active = true;
    loadStylesheet(`${base}assets/swagger-ui.css`);
    loadScript(`${base}assets/swagger-ui-bundle.js`)
      .then(() => loadScript(`${base}swagger-config.js`))
      .then(() => {
        if (!active || !container.current) return;
        window.ui = window.SwaggerUIBundle!(
          window.climsSwaggerOptions!({ url: `${base}openapi.json`, domNode: container.current }),
        );
      })
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [base]);

  if (error) return <p>The API reference could not be loaded: {error}</p>;
  return <div ref={container} className={styles.swagger} />;
}
