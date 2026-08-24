// AirzInteractive — mount the controller-hosted /interactive preview in an iframe
// and drive/observe it over postMessage. No Rive runtime, no .riv handling here;
// the embedded page owns all of that. This is all a web-SDK app needs.
//
//   const view = AirzInteractive.mount("#preview", {
//     src: "http://controller:3467/interactive/interactive.html", // or "/interactive/…" when same-origin
//     baseUrl: "http://controller:3467", token, rundownId: 12, itemId: 340,
//     role: "control", chrome: "min",
//   });
//   view.on("airz:ready", (m) => console.log("bindings", m.bindings));
//   view.on("airz:valueChanged", (m) => console.log(m.key, m.value, m.origin));
//   view.setField("Header Text", "LIVE");
//   view.fireTrigger("Animate In trigger");
//   view.setMode("live"); view.setOnAir(true);
//
(function (global) {
  function originOf(url) { try { return new URL(url, location.href).origin; } catch (_) { return "*"; } }

  function mount(target, opts) {
    opts = opts || {};
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("AirzInteractive.mount: target not found");

    var base = opts.src || "/interactive/interactive.html";
    var q = new URLSearchParams();
    ["baseUrl", "rundownId", "itemId", "templateId", "role", "air"].forEach(function (k) {
      if (opts[k] != null && opts[k] !== "") q.set(k, opts[k]);
    });
    if (opts.token) q.set("t", opts.token);
    if (opts.onAir) q.set("onAir", "1");
    q.set("chrome", opts.chrome || "min");
    q.set("parentOrigin", location.origin);          // the frame posts back only to us

    var iframe = document.createElement("iframe");
    iframe.src = base + (base.indexOf("?") < 0 ? "?" : "&") + q.toString();
    iframe.style.border = "0";
    iframe.style.width = opts.width || "100%";
    iframe.style.height = opts.height || "100%";
    iframe.allow = "autoplay";
    el.appendChild(iframe);

    var frameOrigin = originOf(iframe.src);
    var listeners = {};
    function send(type, data) { try { iframe.contentWindow.postMessage(Object.assign({ type: type }, data || {}), frameOrigin); } catch (_) {} }
    function onMsg(e) {
      if (e.source !== iframe.contentWindow) return;
      if (frameOrigin !== "*" && e.origin !== frameOrigin) return;
      var m = e.data || {};
      if (!m.type || String(m.type).indexOf("airz:") !== 0) return;
      (listeners[m.type] || []).forEach(function (cb) { cb(m); });
      (listeners["*"] || []).forEach(function (cb) { cb(m); });
    }
    window.addEventListener("message", onMsg);

    var handle = {
      iframe: iframe,
      setField: function (key, value) { send("airz:setField", { key: key, value: value }); return handle; },
      fireTrigger: function (name) { send("airz:fireTrigger", { name: name }); return handle; },
      setMode: function (mode) { send("airz:setMode", { mode: mode }); return handle; },
      setOnAir: function (on) { send("airz:setOnAir", { on: !!on }); return handle; },
      reload: function () { send("airz:reload", {}); return handle; },
      on: function (type, cb) { (listeners[type] = listeners[type] || []).push(cb); return handle; },
      off: function (type, cb) { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== cb; }); return handle; },
      destroy: function () { window.removeEventListener("message", onMsg); if (iframe.parentNode) iframe.parentNode.removeChild(iframe); },
    };
    return handle;
  }

  global.AirzInteractive = { mount: mount };
})(window);
