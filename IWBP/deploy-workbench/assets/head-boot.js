(function () {
        try {
          var q = new URLSearchParams(window.location.search);
          if ((q.get("embed") || "").trim().toLowerCase() === "warning-map") {
            document.documentElement.classList.add("warning-map-embed-boot");
          }
        } catch (_) {}
      })();
