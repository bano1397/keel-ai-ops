(function () {
  if (window.__keelWidget) return;
  window.__keelWidget = true;

  var script = document.currentScript;
  var origin = (script && script.getAttribute("data-origin")) || (script ? new URL(script.src).origin : "");
  var color = (script && script.getAttribute("data-color")) || "#0f6b6b";
  var position = (script && script.getAttribute("data-position")) === "left" ? "left" : "right";

  var button = document.createElement("button");
  button.setAttribute("aria-label", "Chat with Hearth & Field");
  button.style.cssText =
    "position:fixed;bottom:20px;" + position + ":20px;width:56px;height:56px;border-radius:9999px;border:0;cursor:pointer;z-index:2147483646;" +
    "background:" + color + ";color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;transition:transform .15s";
  var chatIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  button.innerHTML = chatIcon;

  var frame = document.createElement("iframe");
  frame.src = origin + "/chat?embed=1";
  frame.title = "Hearth & Field support chat";
  frame.allow = "clipboard-write";
  frame.style.cssText =
    "position:fixed;bottom:88px;" + position + ":20px;width:380px;height:620px;max-width:calc(100vw - 40px);max-height:calc(100vh - 110px);" +
    "border:0;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.25);z-index:2147483647;display:none;background:#fff";

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    button.innerHTML = open ? closeIcon : chatIcon;
  });
  button.addEventListener("mouseenter", function () {
    button.style.transform = "scale(1.06)";
  });
  button.addEventListener("mouseleave", function () {
    button.style.transform = "scale(1)";
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(button);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
