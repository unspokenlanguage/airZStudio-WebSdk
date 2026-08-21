# Image Asset Management

This document details how image assets are managed, uploaded, and bound to Rive templates using the `@airz/rundown-sdk`, and explicitly covers common pitfalls developers face when building control apps.

## The Problem: Static File Servers vs. The Controller API

A common misconception when building Airz web plugins is attempting to serve images to the controller using a static path, such as:
`http://localhost:8080/api/assets/Election/logo.png`

**This will fail in production.** 
The Airz Controller does not expose a static web directory for assets. Instead, all graphics assets are stored securely in its internal database. An image must be requested through the authenticated Asset API using its unique numeric ID and an active bearer token:
`/api/v1/assets/58/file?token=043b97e3-e66b-4433-a1c1-43d38f087325`

Because the controller strictly requires tokenized access to image files, you cannot hardcode static paths into your configuration if you expect the Rive graphics engine to render them.

## The Solution: `PanelBinder` + `uploadingImages`

To seamlessly bridge the gap between local image files and the controller's secure API, `@airz/rundown-sdk` provides an automatic image resolver called `uploadingImages`.

When initializing your `PanelBinder`, pass the `uploadingImages` resolver:

```typescript
import { PanelBinder, uploadingImages } from "@airz/rundown-sdk";

const binder = new PanelBinder(client, {
  // Automatically intercept ImageRefs, upload them, and return the localPath
  images: uploadingImages(client, { folder: "/election" }) 
});
```

### How it Works
1. **Define your images in configuration**: In your `MappingConfig` (e.g., `starterConfig.ts`), mark image properties with `image: true`. This flags the binding as an `ImageRef`.
2. **Provide local paths**: In your frontend React state, provide standard web URLs to your images, pointing at your local Vite server (e.g., `http://localhost:5173/assets/parties/akp.png`).
3. **Automatic Upload**: When `binder.update(feed)` is called, the `uploadingImages` resolver intercepts the `ImageRef`. It issues an HTTP `fetch` to your local web server to grab the image blob, and immediately uploads it to the controller via `client.assets.upload()`.
4. **Binding the localPath**: The controller responds with the uploaded asset metadata, including its internal `localPath`. The `PanelBinder` swaps your local URL for this `localPath` and pushes it to the Rive template.

This completely abstracts the complexity of tokenized asset endpoints and ID management. 

## Local App Previews

While the controller requires the `uploadingImages` pipeline, your own custom React previews (e.g., `<CityResults />`) should remain entirely separate from the controller's asset system.

When rendering images locally in your control app, do not use the controller's API. Instead, utilize Vite's native static hosting by placing your images in `public/assets/` and referencing them directly:
```tsx
<img src={`/assets/parties/${party.id}.png`} alt={party.name} />
```
This ensures your UI renders perfectly, without dealing with CORS, tokens, or network latency from the controller.
