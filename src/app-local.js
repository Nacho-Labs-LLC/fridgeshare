(function () {
  window.addEventListener("DOMContentLoaded", () => {
    window.openFridge = new window.FridgeCanvas(document.querySelector("#fridge-canvas"), {
      mode: "local",
      persistence: new window.FridgeStorage.LocalPersistence(),
    });
  });
})();
