(function () {
  var dialog = document.getElementById("screenshot-lightbox");
  if (!dialog || typeof dialog.showModal !== "function") return;

  var img = dialog.querySelector(".screenshot-lightbox__img");
  var closeBtn = dialog.querySelector(".screenshot-lightbox__close");
  if (!img || !closeBtn) return;

  function openFromButton(btn) {
    var src = btn.getAttribute("data-lightbox-src");
    var alt = btn.getAttribute("data-lightbox-alt") || "";
    if (!src) return;
    img.src = src;
    img.alt = alt;
    dialog.showModal();
  }

  document.querySelectorAll(".project-screenshots-grid__open").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openFromButton(btn);
    });
  });

  closeBtn.addEventListener("click", function () {
    dialog.close();
  });

  dialog.addEventListener("click", function (e) {
    var el = e.target;
    if (el instanceof Element) {
      if (el.closest(".screenshot-lightbox__img")) return;
      if (el.closest(".screenshot-lightbox__close")) return;
    }
    dialog.close();
  });

  dialog.addEventListener("close", function () {
    img.removeAttribute("src");
    img.alt = "";
  });
})();
