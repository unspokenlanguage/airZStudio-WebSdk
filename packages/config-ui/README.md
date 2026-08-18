# @airz/config-ui

A mountable React overlay to configure `@airz/rundown-sdk` visually — set the
controller URL, log in, and for each panel pick a rundown + item, then map the
template's bindings to source fields (or mark them as watched control inputs).

```bash
npm install @airz/config-ui @airz/rundown-sdk react
```

```tsx
import { useState } from "react";
import { AirzConfigurator } from "@airz/config-ui";
import { localStorageConfig, type MappingConfig, type AirzClient } from "@airz/rundown-sdk";

const store = localStorageConfig();

export function Settings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<MappingConfig>(() => store.load() ?? {
    version: 1, server: { baseUrl: "http://127.0.0.1:3467" }, panels: [],
  });
  const [client, setClient] = useState<AirzClient | null>(null);

  return (
    <>
      <button onClick={() => setOpen(true)}>⚙ Configure</button>
      <AirzConfigurator
        open={open}
        onClose={() => setOpen(false)}
        config={config}
        onChange={(c) => { setConfig(c); store.save(c); }}
        sourcePaths={["headline", "candidates.0.name", "parties.0.percent"]}
        client={client}
        onClient={setClient}
      />
    </>
  );
}
```

The overlay emits a `MappingConfig` you feed to `configToPanelSpec` +
`PanelBinder`. `react` and `@airz/rundown-sdk` are peer dependencies.
