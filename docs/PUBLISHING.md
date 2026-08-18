# Publishing the packages

Two publishable packages live in this monorepo:

| Package | Path | Kind |
|---------|------|------|
| `@airz/rundown-sdk` | `sdk/` | ESM library, zero runtime deps |
| `@airz/config-ui` | `packages/config-ui/` | React overlay (peer deps: react, sdk) |

Both build type declarations via `tsc`, ship `dist/` + `src/`, and run their
build on `prepublishOnly`. They are marked `publishConfig.access: "restricted"`
and `license: UNLICENSED` — intended for a **private** registry, not the public
npm registry.

## One-time: point npm at your registry

Scope `@airz` to your private registry (org registry, Verdaccio, GitHub
Packages, etc.):

```bash
npm config set @airz:registry https://registry.your-company.example
npm login --scope=@airz --registry https://registry.your-company.example
```

## Build & verify

```bash
npm install
npm run build:libs

# Inspect exactly what will ship (no publish):
npm pack --workspace @airz/rundown-sdk --dry-run
npm pack --workspace @airz/config-ui  --dry-run
```

## Publish

Publish the SDK first (config-ui depends on it):

```bash
npm publish --workspace @airz/rundown-sdk
npm publish --workspace @airz/config-ui
```

`prepublishOnly` rebuilds each package immediately before it is packed, so
`dist/` is always current.

## Versioning

Bump versions before publishing (keep the config-ui peer range in step):

```bash
npm version patch --workspace @airz/rundown-sdk
npm version patch --workspace @airz/config-ui
```

Consumers install straight from the private registry:

```bash
npm install @airz/rundown-sdk
npm install @airz/config-ui react   # for the visual configurator
```

## Consuming from source (no registry)

During development, external apps can use the packages without publishing:

- `npm link` each package, or
- reference them as workspace/`file:` dependencies, or
- copy the built `dist/` into the consuming app.

The examples in this repo consume them via npm workspaces (`"@airz/…": "*"`).
