(async function () {
  const container = document.getElementById("species-taxonomy");
  if (!container) return;

  try {
    const d = await window.SpeciesCore.getSpeciesData();

    container.innerHTML = `
      <div class="frame-box pyramid-frame">
        <div class="pyramid-inner">
          <div class="arrow-container">
            <div class="arrow-shaft"><span class="arrow-text">Taxonomie</span></div>
            <div class="arrow-tip"></div>
          </div>
          <div class="taxonomy-pyramid">
            <div class="pyramid-step step-kingdom">Kingdom: ${d.Kingdom}</div>
            <div class="pyramid-step step-phylum">Phylum: ${d.Phylum}</div>
            <div class="pyramid-step step-class">Class: ${d.Class}</div>
            <div class="pyramid-step step-order">Order: ${d.Order}</div>
            <div class="pyramid-step step-family">Family: ${d.Family}</div>
            <div class="pyramid-step step-genus">Genus: ${d.Genus}</div>
            <div class="pyramid-step step-species">Species: ${d.Species}</div>
          </div>
        </div>
      </div>
    `;

    /* ----------------------------------------- */
    /* Pfeil-Position korrigieren                */
    /* ----------------------------------------- */
    function adjustArrow() {
      const frame = outputEl.querySelector('.pyramid-frame');
      if (!frame) return;
      const first = frame.querySelector('.pyramid-step:first-child');
      const last  = frame.querySelector('.pyramid-step:last-child');
      const arrowContainer = frame.querySelector('.arrow-container');
      const arrowShaft = frame.querySelector('.arrow-shaft');
      const arrowTip = frame.querySelector('.arrow-tip');

      const frameRect = frame.getBoundingClientRect();
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const tipHeight = arrowTip.getBoundingClientRect().height;

      const topOffset = firstRect.top - frameRect.top;
      const lastBottom = lastRect.bottom - frameRect.top;

      let shaftHeight = lastBottom - topOffset - tipHeight;
      if (shaftHeight < 10) shaftHeight = 10;

      arrowContainer.style.top = `${topOffset}px`;
      arrowShaft.style.height = `${shaftHeight}px`;
    }

    /* ----------------------------------------- */
    /* DYNAMISCHE PYRAMIDENBREITE (NEU!)         */
    /* ----------------------------------------- */
    function adjustPyramidWidth() {
      const steps = [...document.querySelectorAll('.pyramid-step')];
      if (steps.length === 0) return;

      const meter = document.createElement("span");
      meter.style.visibility = "hidden";
      meter.style.position = "absolute";
      meter.style.whiteSpace = "nowrap";
      meter.style.fontWeight = "bold";
      document.body.appendChild(meter);

      const naturalWidths = steps.map(step => {
        meter.textContent = step.textContent.trim();
        return meter.offsetWidth + 4;
      });

      document.body.removeChild(meter);

      const maxWidth = Math.max(...naturalWidths);
      const baseIndex = naturalWidths.indexOf(maxWidth);
      let targetWidths = steps.map((_, i) => maxWidth - (i - baseIndex) * 10);

      for (let i = 0; i < steps.length; i++) {
        if (naturalWidths[i] > targetWidths[i]) {
          const diff = naturalWidths[i] - targetWidths[i];
          for (let j = 0; j <= i; j++) targetWidths[j] += diff;
        }
      }

      steps.forEach((step, i) => {
        step.style.width = `${targetWidths[i]}px`;
        step.style.whiteSpace = "nowrap";
        step.style.textAlign = "center";
      });
    }

    adjustPyramidWidth();
    adjustArrow();
    window.addEventListener("resize", () => { adjustPyramidWidth(); adjustArrow(); });

  } catch (e) {
    container.innerHTML = `<p>${e.message}</p>`;
  }
})();
